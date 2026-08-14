# Layout Background Import — Design Spec

**Date:** 2026-08-14
**Goal:** Upload DXF/DWG bản vẽ mặt bằng nhà máy làm nền canvas editor; bbox của DXF cập nhật widthM/heightM của layout.

---

## 1. Phạm vi

### Làm trong feature này
- Backend: convert DXF/DWG → SVG (tất cả entities: lines, polylines, arcs, circles)
- Backend: 2 endpoint mới trên `/api/layouts/:id/background` (POST upload, DELETE xóa)
- Backend: cập nhật `Layout.backgroundFile` + `widthM` + `heightM` từ bbox DXF
- Frontend: upload button trên card layout ở trang site/[id]
- Frontend: render SVG nền trong canvas editor (dưới furniture)

### Không làm
- Không sửa Asset model/pipeline (background dùng pipeline riêng, đơn giản hơn)
- Không migration DB (cột `Layout.backgroundFile` đã có)
- Không hỗ trợ PNG/JPEG (chỉ DXF/DWG vector)
- Không cho scale/offset background thủ công (bbox DXF = kích thước layout)
- Không render text/hatch DXF (chỉ geometry: LINE, LWPOLYLINE, POLYLINE, ARC, CIRCLE)

---

## 2. Backend

### 2.1 `server/cad/convertDxfSvg.ts` (mới)

```ts
export interface DxfSvgResult {
  svg: string;       // SVG string, viewBox theo mét
  widthM: number;    // bbox chiều ngang (mét)
  heightM: number;   // bbox chiều dọc (mét)
}

export function dxfToSvg(dxfText: string, unitScale?: number): DxfSvgResult
```

- Dùng `dxf-parser` (đã có) để parse
- Đọc `$INSUNITS` → scale (fallback mm = 0.001); `unitScale` param override
- Render entities:
  - `LINE`: `<line x1 y1 x2 y2>`
  - `LWPOLYLINE` / `POLYLINE`: `<polyline points>` (hoặc `<polygon>` nếu đóng)
  - `ARC`: `<path d="M...A...">` dùng SVG arc
  - `CIRCLE`: `<circle cx cy r>`
- viewBox: `"0 0 {widthM} {heightM}"` (tọa độ mét, góc trái trên = minX/minY của bbox)
- stroke: `#334155`, stroke-width: `max(widthM, heightM) * 0.001` (tỷ lệ với kích thước)
- fill: none; background SVG trong suốt
- Throw `Error('DXF contains no geometry')` nếu không có entity nào

### 2.2 `server/cad/paths.ts` (sửa)

Thêm hàm:
```ts
export function layoutBgPaths(layoutId: string) {
  return {
    sourceDir:  path.resolve(STORAGE_DIR, 'sources', 'layouts', layoutId),
    sourceFile: (ext: string) => path.resolve(STORAGE_DIR, 'sources', 'layouts', layoutId, `source.${ext}`),
    artifactDir: path.resolve(UPLOAD_DIR, 'layouts', layoutId),
    bgFile:     path.resolve(UPLOAD_DIR, 'layouts', layoutId, 'background.svg'),
    bgUrl:      `/uploads/layouts/${layoutId}/background.svg`,
  };
}
```

### 2.3 `server/routes/layouts.ts` (sửa)

Thêm multer instance (giống assets route, giới hạn 50MB, dest tmp):

```
POST /api/layouts/:id/background
  Auth: requireAuth + requireRole('ADMIN', 'PLANNING')
  Body: multipart, field "file" (dwg | dxf, ≤50MB)
  Logic:
    1. Validate ext ∈ {dwg, dxf}; khác → 400
    2. Layout.findUnique(id) → 404 nếu không có
    3. Nếu DWG: dwgToDxfText(tmpPath) → nếu ODA_CONVERTER_PATH chưa set → 422 + message hướng dẫn
    4. dxfToSvg(dxfText) → { svg, widthM, heightM }
    5. Lưu source: layoutBgPaths(id).sourceFile(ext)
    6. Lưu artifact: layoutBgPaths(id).bgFile
    7. Nếu layout đã có background cũ → xóa artifact cũ (source giữ lại)
    8. prisma.layout.update({ backgroundFile: bgUrl, widthM, heightM })
    9. Xóa tmp file
    10. Trả layout đã update (200)
  Error: 500 với message rõ

DELETE /api/layouts/:id/background
  Auth: requireAuth + requireRole('ADMIN', 'PLANNING')
  Logic:
    1. Layout.findUnique(id) → 404
    2. Xóa artifact dir (uploads/layouts/{id}/) nếu tồn tại
    3. prisma.layout.update({ backgroundFile: null })
    4. widthM/heightM giữ nguyên
    5. Trả layout đã update (200)
```

---

## 3. Frontend

### 3.1 `src/routes/site/[id]/+page.svelte` (sửa)

Trong card của mỗi layout, thêm vùng "Nền mặt bằng":

- **Chưa có background**: nút "Upload nền DXF/DWG" → `<input type="file" accept=".dxf,.dwg" hidden>`
- **Đã có background**: badge "✓ Nền DXF" (hoặc DWG) + nút "Xóa nền"
- Upload handler: `fetch POST /api/layouts/:id/background` (FormData), `invalidateAll()` sau khi xong
- Delete handler: `fetch DELETE /api/layouts/:id/background`, `invalidateAll()`
- Lỗi: hiện inline dưới card (text đỏ nhỏ)
- Không cần modal — upload trực tiếp từ file picker

### 3.2 `src/lib/utils/canvasRenderer.ts` (sửa)

Thêm export:
```ts
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  widthCm: number,
  heightCm: number,
  camX: number,
  camY: number,
  zoom: number
): void
```

- Tính tọa độ canvas: `screenX = (0 - camX) * zoom`, `screenW = widthCm * zoom`
- `ctx.drawImage(img, screenX, screenY, screenW, screenH)`
- Opacity: 0.4 (mờ để furniture nổi lên trên)

### 3.3 `src/lib/components/editor/FloorPlanCanvas.svelte` (sửa)

- Khai báo `let bgImage = $state<HTMLImageElement | null>(null)`
- `$effect`: khi `layout.backgroundFile` thay đổi → load `new Image()`, `img.src = FILES_BASE + backgroundFile`; onload: `bgImage = img`; khi null: `bgImage = null`
- Trong render loop: nếu `bgImage`, gọi `drawBackground(ctx, bgImage, layout.widthM * 100, layout.heightM * 100, camX, camY, zoom)` **trước** mọi draw call khác

---

## 4. Testing

### Backend
**`tests/convertDxfSvg.test.ts`** (mới) — dùng fixture `tests/fixtures/box.dxf` (4000×2000mm):
- `dxfToSvg(fixture)` trả `widthM ≈ 4`, `heightM ≈ 2`
- svg chứa `<svg` và `<polyline` hoặc `<polygon`
- `dxfToSvg('0\nEOF\n', undefined)` throw `/no geometry/i`
- `unitScale` override: `dxfToSvg(fixture, 0.01)` → `widthM ≈ 40`

**`tests/layouts.test.ts`** (sửa) — thêm describe block:
- `POST /:id/background` + DXF fixture → 200, `res.body.backgroundFile` có URL, `widthM ≈ 4`
- `DELETE /:id/background` → 200, `backgroundFile` null, `widthM` giữ nguyên
- Upload `.txt` → 400
- Upload DWG khi `ODA_CONVERTER_PATH` chưa set → 422

### Frontend
- `svelte-check` 0 errors
- Kiểm tra tay: upload `box.dxf` làm nền → vào editor → thấy outline chữ nhật mờ dưới canvas; xóa nền → canvas trắng lại

---

## 5. Tiêu chí hoàn thành

- `npm test` (floor-manager/): tất cả pass kể cả test mới
- `npm run check` (floor-manager-web/): 0 errors
- Upload `box.dxf` → layout widthM/heightM cập nhật thành 4/2; mở editor → thấy nền
- Upload DWG thiếu ODA → báo lỗi 422 rõ ràng
- Xóa nền → canvas trắng, widthM/heightM giữ nguyên
