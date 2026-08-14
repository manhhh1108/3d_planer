# Layout Background Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload DXF/DWG bản vẽ mặt bằng nhà máy làm nền canvas editor; bbox của DXF tự động cập nhật `widthM`/`heightM` của layout.

**Architecture:** Backend: `convertDxfSvg.ts` mới render tất cả DXF entities (LINE/LWPOLYLINE/POLYLINE/CIRCLE/ARC) thành SVG vector; 2 endpoint mới `POST/DELETE /api/layouts/:id/background` trên router layouts hiện có; SVG lưu tại `uploads/layouts/{id}/background.svg`. Frontend: 2 store mới (`layoutBgFile`, `layoutDimsCm`) set từ editor page khi load; `drawLayoutBackground` thêm vào `canvasRenderer.ts`; `FloorPlanCanvas` subscribe store và vẽ SVG dưới furniture.

**Tech Stack:** dxf-parser (đã có), multer (đã có), Svelte 5 $state/$effect, Prisma 7 (`Layout.backgroundFile` đã tồn tại — không cần migration).

---

## File Structure

```
floor-manager/
  server/cad/convertDxfSvg.ts   (mới) — dxfToSvg(): render all entities → SVG string + widthM/heightM
  server/cad/paths.ts            (sửa) — thêm layoutBgPaths(layoutId)
  server/routes/layouts.ts       (sửa) — thêm POST/DELETE /:id/background
  tests/convertDxfSvg.test.ts    (mới)
  tests/layouts.test.ts          (sửa) — thêm background tests

floor-manager-web/
  src/lib/services/api.ts                                    (sửa) — thêm uploadBackground, deleteBackground
  src/lib/stores/project.ts                                  (sửa) — thêm layoutBgFile, layoutDimsCm stores
  src/routes/editor/+page.svelte                             (sửa) — set stores sau khi load layout
  src/lib/utils/canvasRenderer.ts                            (sửa) — thêm drawLayoutBackground
  src/lib/components/editor/FloorPlanCanvas.svelte           (sửa) — subscribe + draw
  src/routes/site/[id]/+page.svelte                          (sửa) — upload UI trong layout card
```

---

### Task 1: `convertDxfSvg.ts` — DXF → SVG renderer (TDD)

**Files:**
- Create: `floor-manager/server/cad/convertDxfSvg.ts`
- Test: `floor-manager/tests/convertDxfSvg.test.ts`

Fixture `tests/fixtures/box.dxf` đã có (hình chữ nhật 4000×2000mm, LWPOLYLINE đóng, $INSUNITS=4).

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/convertDxfSvg.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { dxfToSvg } from '../server/cad/convertDxfSvg.js';

const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'box.dxf'), 'utf8');

describe('dxfToSvg', () => {
  it('converts box.dxf to SVG with correct dimensions from $INSUNITS', () => {
    const result = dxfToSvg(fixture, undefined);
    expect(result.widthM).toBeCloseTo(4, 3);
    expect(result.heightM).toBeCloseTo(2, 3);
    expect(result.svg).toContain('<svg');
    expect(result.svg).toContain('viewBox="0 0 4');
    expect(result.svg).toContain('<polygon'); // closed LWPOLYLINE → <polygon>
  });

  it('explicit unitScale overrides $INSUNITS', () => {
    const result = dxfToSvg(fixture, 0.01); // treat mm as cm
    expect(result.widthM).toBeCloseTo(40, 2);
    expect(result.heightM).toBeCloseTo(20, 2);
  });

  it('throws on empty DXF with no geometry', () => {
    expect(() => dxfToSvg('0\nEOF\n', undefined)).toThrow(/no geometry/i);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL** (`cd floor-manager && npm test -- convertDxfSvg`)

- [ ] **Step 3: Implement `server/cad/convertDxfSvg.ts`**

```ts
import DxfParser from 'dxf-parser';

const INSUNITS_SCALE: Record<number, number> = {
  1: 0.0254,
  2: 0.3048,
  4: 0.001,
  5: 0.01,
  6: 1,
};

export interface DxfSvgResult {
  svg: string;
  widthM: number;
  heightM: number;
}

/**
 * DXF text → SVG string (vector, Y-up→Y-down flip, viewBox in meters).
 * Renders LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC entities as strokes.
 * unitScale param overrides $INSUNITS; default fallback = mm (0.001).
 */
export function dxfToSvg(dxfText: string, unitScale: number | undefined): DxfSvgResult {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf) throw new Error('DXF parse failed');

  const insunits = Number(dxf.header?.['$INSUNITS'] ?? 0);
  const scale = unitScale ?? INSUNITS_SCALE[insunits] ?? 0.001;

  const allPoints: [number, number][] = [];
  const elements: string[] = [];

  for (const e of dxf.entities ?? []) {
    const ent = e as any;

    if (ent.type === 'LINE') {
      const x1 = (ent.start?.x ?? 0) * scale;
      const y1 = (ent.start?.y ?? 0) * scale;
      const x2 = (ent.end?.x ?? 0) * scale;
      const y2 = (ent.end?.y ?? 0) * scale;
      allPoints.push([x1, y1], [x2, y2]);
      elements.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);

    } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices?.length) {
      const pts: [number, number][] = ent.vertices.map((v: any) => [v.x * scale, v.y * scale]);
      for (const p of pts) allPoints.push(p);
      const pointsStr = pts.map(([x, y]) => `${x},${y}`).join(' ');
      const isClosed = ent.shape === true || ent.closed === true;
      elements.push(isClosed
        ? `<polygon points="${pointsStr}"/>`
        : `<polyline points="${pointsStr}"/>`);

    } else if (ent.type === 'CIRCLE') {
      const cx = (ent.center?.x ?? 0) * scale;
      const cy = (ent.center?.y ?? 0) * scale;
      const r = (ent.radius ?? 0) * scale;
      allPoints.push([cx - r, cy], [cx + r, cy], [cx, cy - r], [cx, cy + r]);
      elements.push(`<circle cx="${cx}" cy="${cy}" r="${r}"/>`);

    } else if (ent.type === 'ARC') {
      const cx = (ent.center?.x ?? 0) * scale;
      const cy = (ent.center?.y ?? 0) * scale;
      const r = (ent.radius ?? 0) * scale;
      const startDeg: number = ent.startAngle ?? 0;
      const endDeg: number = ent.endAngle ?? 0;
      const startRad = startDeg * Math.PI / 180;
      const endRad = endDeg * Math.PI / 180;
      const ax1 = cx + r * Math.cos(startRad);
      const ay1 = cy + r * Math.sin(startRad);
      const ax2 = cx + r * Math.cos(endRad);
      const ay2 = cy + r * Math.sin(endRad);
      allPoints.push([ax1, ay1], [ax2, ay2]);
      const span = ((endDeg - startDeg) + 360) % 360;
      const largeArc = span > 180 ? 1 : 0;
      // DXF arcs are CCW; after scale(1,-1) flip, CCW→CW in SVG screen coords → sweep=1
      elements.push(`<path d="M ${ax1} ${ay1} A ${r} ${r} 0 ${largeArc} 1 ${ax2} ${ay2}"/>`);
    }
  }

  if (allPoints.length === 0) throw new Error('DXF contains no geometry');

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of allPoints) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const widthM = Math.round((maxX - minX) * 10000) / 10000;
  const heightM = Math.round((maxY - minY) * 10000) / 10000;
  const strokeWidth = Math.max(widthM, heightM) * 0.001;

  // Flip Y axis: SVG Y↓, DXF Y↑.
  // Transform: translate(-minX, maxY) scale(1,-1)
  // A DXF point (minX, maxY) → SVG (0, 0); (maxX, minY) → (widthM, heightM)
  const tx = -minX;
  const ty = maxY;

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthM} ${heightM}">`,
    `<g transform="translate(${tx},${ty}) scale(1,-1)" fill="none" stroke="#334155" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round">`,
    ...elements,
    `</g>`,
    `</svg>`,
  ].join('');

  return { svg, widthM, heightM };
}
```

- [ ] **Step 4: Chạy test — PASS** (`npm test -- convertDxfSvg`)

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/cad/convertDxfSvg.ts floor-manager/tests/convertDxfSvg.test.ts
git commit -m "feat: DXF to SVG background renderer (all entities, Y-flip)"
```

---

### Task 2: Backend — `paths.ts` + background endpoints + tests (TDD)

**Files:**
- Modify: `floor-manager/server/cad/paths.ts`
- Modify: `floor-manager/server/routes/layouts.ts`
- Modify: `floor-manager/tests/layouts.test.ts`

- [ ] **Step 1: Thêm `layoutBgPaths` vào `server/cad/paths.ts`**

Đọc file hiện có. Append sau hàm `assetPaths`:

```ts
export function layoutBgPaths(layoutId: string) {
  const sourceDir = path.resolve(STORAGE_DIR, 'sources', 'layouts', layoutId);
  const artifactDir = path.resolve(UPLOAD_DIR, 'layouts', layoutId);
  return {
    sourceDir,
    sourceFile: (ext: string) => path.join(sourceDir, `source.${ext}`),
    artifactDir,
    bgFile: path.join(artifactDir, 'background.svg'),
    bgUrl: `/uploads/layouts/${layoutId}/background.svg`,
  };
}
```

- [ ] **Step 2: Viết test fail — thêm vào cuối `tests/layouts.test.ts`**

Đọc file hiện có trước. Thêm sau describe block hiện tại:

```ts
import fs from 'fs';
import path from 'path';

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');

async function makeLayout() {
  const site = (await request(app)
    .post('/api/sites')
    .set('Cookie', `access_token=${adminToken()}`)
    .send({ name: 'S' })).body;
  return (await request(app)
    .post('/api/layouts')
    .set('Cookie', `access_token=${adminToken()}`)
    .send({ siteId: site.id, name: 'L', widthM: 10, heightM: 10 })).body;
}

describe('layout background', () => {
  it('uploads DXF, returns updated layout with backgroundFile and new dimensions', async () => {
    const layout = await makeLayout();
    const dxf = fs.readFileSync(FIXTURE_DXF);

    const res = await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', dxf, 'plan.dxf');

    expect(res.status).toBe(200);
    expect(res.body.backgroundFile).toContain(`/uploads/layouts/${layout.id}/background.svg`);
    expect(res.body.widthM).toBeCloseTo(4, 1);
    expect(res.body.heightM).toBeCloseTo(2, 1);
    // SVG file on disk
    const bgFile = path.resolve('./uploads/layouts', layout.id, 'background.svg');
    expect(fs.existsSync(bgFile)).toBe(true);
  });

  it('returns 400 for non-DXF/DWG files', async () => {
    const layout = await makeLayout();
    const res = await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('not a dxf'), 'plan.txt');
    expect(res.status).toBe(400);
  });

  it('returns 422 when uploading DWG without ODA_CONVERTER_PATH', async () => {
    const saved = process.env.ODA_CONVERTER_PATH;
    delete process.env.ODA_CONVERTER_PATH;
    const layout = await makeLayout();
    const res = await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('fake dwg'), 'plan.dwg');
    expect(res.status).toBe(422);
    process.env.ODA_CONVERTER_PATH = saved;
  });

  it('deletes background: clears backgroundFile, preserves dimensions', async () => {
    const layout = await makeLayout();
    const dxf = fs.readFileSync(FIXTURE_DXF);
    await request(app)
      .post(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', dxf, 'plan.dxf');

    const res = await request(app)
      .delete(`/api/layouts/${layout.id}/background`)
      .set('Cookie', `access_token=${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.backgroundFile).toBeNull();
    expect(res.body.widthM).toBeCloseTo(4, 1); // preserved from upload
    // Artifact dir removed
    expect(fs.existsSync(path.resolve('./uploads/layouts', layout.id))).toBe(false);
  });

  it('returns 404 when layout does not exist', async () => {
    const res = await request(app)
      .post('/api/layouts/nonexistent/background')
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', Buffer.from('x'), 'plan.dxf');
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Chạy test — FAIL** (`npm test -- layouts`)

- [ ] **Step 4: Sửa `server/routes/layouts.ts` — thêm imports và 2 endpoint mới**

Đọc file hiện có trước. Thêm vào đầu file (sau import Router):
```ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { layoutBgPaths } from '../cad/paths.js';
import { dxfToSvg } from '../cad/convertDxfSvg.js';
import { dwgToDxfText } from '../cad/convertDwg.js';

const TMP_DIR = path.resolve(process.env.STORAGE_DIR || './storage', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({ dest: TMP_DIR, limits: { fileSize: 50 * 1024 * 1024 } });
```

Thêm 2 endpoint sau `router.delete('/:id', ...)` và trước `export default router`:

```ts
// POST /:id/background — upload DXF/DWG làm nền layout
router.post('/:id/background', upload.single('file'), async (req: Request, res: Response) => {
  const tmpPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    if (!['dxf', 'dwg'].includes(ext)) {
      return res.status(400).json({ error: `Only DXF and DWG files are supported` });
    }
    const layout = await prisma.layout.findUnique({ where: { id: String(req.params.id) } });
    if (!layout) return res.status(404).json({ error: 'Layout not found' });

    if (ext === 'dwg') {
      if (!process.env.ODA_CONVERTER_PATH) {
        return res.status(422).json({ error: 'DWG conversion requires ODA_CONVERTER_PATH to be set on the server' });
      }
    }

    const dxfText = ext === 'dwg'
      ? await dwgToDxfText(req.file.path)
      : fs.readFileSync(req.file.path, 'utf8');

    const { svg, widthM, heightM } = dxfToSvg(dxfText, undefined);

    const p = layoutBgPaths(String(req.params.id));
    // Remove old artifact directory if exists
    if (layout.backgroundFile) {
      fs.rmSync(p.artifactDir, { recursive: true, force: true });
    }
    fs.mkdirSync(p.sourceDir, { recursive: true });
    fs.mkdirSync(p.artifactDir, { recursive: true });
    fs.copyFileSync(req.file.path, p.sourceFile(ext));
    fs.writeFileSync(p.bgFile, svg, 'utf8');

    const updated = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { backgroundFile: p.bgUrl, widthM, heightM },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    if (tmpPath) fs.rmSync(tmpPath, { force: true });
  }
});

// DELETE /:id/background — xóa nền, giữ nguyên widthM/heightM
router.delete('/:id/background', async (req: Request, res: Response) => {
  try {
    const layout = await prisma.layout.findUnique({ where: { id: String(req.params.id) } });
    if (!layout) return res.status(404).json({ error: 'Layout not found' });

    const p = layoutBgPaths(String(req.params.id));
    fs.rmSync(p.artifactDir, { recursive: true, force: true });

    const updated = await prisma.layout.update({
      where: { id: String(req.params.id) },
      data: { backgroundFile: null },
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

Lưu ý: `router.use()` đầu file đã áp `requireRole('ADMIN','PLANNING')` cho mọi POST/DELETE — 2 endpoint mới tự động được bảo vệ, không cần thêm middleware.

- [ ] **Step 5: Chạy test — PASS** (`npm test`)

Tất cả 71+ test pass (kể cả test mới).

- [ ] **Step 6: Commit**

```powershell
git add floor-manager/server/cad/paths.ts floor-manager/server/routes/layouts.ts floor-manager/tests/layouts.test.ts
git commit -m "feat: layout background upload and delete endpoints"
```

---

### Task 3: Frontend — api.ts + stores + editor page

**Files:**
- Modify: `floor-manager-web/src/lib/services/api.ts`
- Modify: `floor-manager-web/src/lib/stores/project.ts`
- Modify: `floor-manager-web/src/routes/editor/+page.svelte`

- [ ] **Step 1: Sửa `src/lib/services/api.ts` — thêm `uploadBackground` và `deleteBackground` vào `layouts`**

Đọc file trước. Trong object `layouts: { ... }` (cạnh `remove`), thêm 2 method mới:

```ts
uploadBackground: async (id: string, file: File): Promise<ApiLayout> => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`${BASE}/layouts/${id}/background`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload nền thất bại (${res.status})`);
  }
  return res.json();
},
deleteBackground: (id: string) =>
  http<ApiLayout>(`/layouts/${id}/background`, { method: 'DELETE' }),
```

Lưu ý: `uploadBackground` dùng `fetch` trực tiếp (không dùng `http()`) vì cần gửi `FormData` — giống pattern `assets.upload` hiện có.

- [ ] **Step 2: Sửa `src/lib/stores/project.ts` — thêm 2 store mới**

Đọc file trước. Thêm 2 export mới sau phần imports / sau `export const layerVisibility`:

```ts
import { writable } from 'svelte/store';

// Layout background (set by editor page after loading layout)
export const layoutBgFile = writable<string | null>(null);
export const layoutDimsCm = writable<{ widthCm: number; heightCm: number }>({ widthCm: 0, heightCm: 0 });
```

Nếu `writable` đã được import ở đầu file (khả năng cao), không import lại — chỉ thêm 2 dòng export.

- [ ] **Step 3: Sửa `src/routes/editor/+page.svelte` — set stores sau khi load layout**

Đọc file trước. Thêm vào import section (cạnh các import hiện có):

```ts
import { api, FILES_BASE } from '$lib/services/api';
import { layoutBgFile, layoutDimsCm } from '$lib/stores/project';
```

Trong `onMount`, trong nhánh `if (layoutId)`, sau dòng `currentProject.set(project)`:

```ts
// Load layout metadata for background rendering
try {
  const layout = await api.layouts.get(layoutId);
  layoutBgFile.set(layout.backgroundFile ? `${FILES_BASE}${layout.backgroundFile}` : null);
  layoutDimsCm.set({ widthCm: layout.widthM * 100, heightCm: layout.heightM * 100 });
} catch {
  // non-critical: background won't show but editor still works
}
```

- [ ] **Step 4: `svelte-check` 0 errors**

```powershell
cd floor-manager-web
npx svelte-check --tsconfig ./tsconfig.json
```

- [ ] **Step 5: Commit**

```powershell
git add floor-manager-web/src/lib/services/api.ts floor-manager-web/src/lib/stores/project.ts floor-manager-web/src/routes/editor/+page.svelte
git commit -m "feat: layout background API methods and stores"
```

---

### Task 4: Frontend — canvas rendering + site page upload UI

**Files:**
- Modify: `floor-manager-web/src/lib/utils/canvasRenderer.ts`
- Modify: `floor-manager-web/src/lib/components/editor/FloorPlanCanvas.svelte`
- Modify: `floor-manager-web/src/routes/site/[id]/+page.svelte`

- [ ] **Step 1: Thêm `drawLayoutBackground` vào `canvasRenderer.ts`**

Đọc file trước. `wts` là hàm private trong file đó: `function wts(cs, wx, wy) { return { x: (wx - cs.camX) * cs.zoom + cs.width / 2, y: (wy - cs.camY) * cs.zoom + cs.height / 2 }; }`.

Thêm export mới sau các export hiện có:

```ts
/**
 * Vẽ SVG nền layout (từ backgroundFile) lên canvas.
 * img đã được load sẵn bên ngoài. widthCm/heightCm là kích thước layout tính bằng cm.
 * Vẽ từ world origin (0,0) → (widthCm, heightCm), opacity 0.4.
 */
export function drawLayoutBackground(
  cs: CanvasState,
  img: HTMLImageElement,
  widthCm: number,
  heightCm: number
): void {
  const origin = wts(cs, 0, 0);
  cs.ctx.save();
  cs.ctx.globalAlpha = 0.4;
  cs.ctx.drawImage(img, origin.x, origin.y, widthCm * cs.zoom, heightCm * cs.zoom);
  cs.ctx.restore();
}
```

- [ ] **Step 2: Sửa `FloorPlanCanvas.svelte` — subscribe stores + vẽ background**

Đọc file trước (ít nhất phần imports và draw loop ~1012-1025).

**2a.** Thêm vào import section (cạnh import từ `canvasRenderer`):

```ts
import { layoutBgFile, layoutDimsCm } from '$lib/stores/project';
import { drawLayoutBackground } from '$lib/utils/canvasRenderer';
```

**2b.** Thêm state variables sau các biến state hiện có (e.g., sau `let showRulers`):

```ts
let bgLayoutImage = $state<HTMLImageElement | null>(null);
let _bgLayoutDimsCm = { widthCm: 0, heightCm: 0 };
```

**2c.** Thêm subscriptions sau các subscription hiện có (e.g., sau `canvasZoom.subscribe`):

```ts
layoutBgFile.subscribe((url) => {
  if (url) {
    const img = new Image();
    img.onload = () => { bgLayoutImage = img; markDirty(); };
    img.onerror = () => { bgLayoutImage = null; };
    img.src = url;
  } else {
    bgLayoutImage = null;
    markDirty();
  }
});

layoutDimsCm.subscribe((dims) => {
  _bgLayoutDimsCm = dims;
  markDirty();
});
```

**2d.** Trong hàm `draw()`, sau dòng `drawGrid()` và trước `if (layerVis.guides) drawGuides()`:

```ts
if (bgLayoutImage && _bgLayoutDimsCm.widthCm > 0) {
  drawLayoutBackground(getCS(), bgLayoutImage, _bgLayoutDimsCm.widthCm, _bgLayoutDimsCm.heightCm);
}
```

Kết quả draw loop:
```ts
drawGrid();
if (bgLayoutImage && _bgLayoutDimsCm.widthCm > 0) {   // ← MỚI
  drawLayoutBackground(getCS(), bgLayoutImage, _bgLayoutDimsCm.widthCm, _bgLayoutDimsCm.heightCm);
}
if (layerVis.guides) drawGuides();
drawBackgroundImage();  // giữ nguyên hệ thống cũ
```

- [ ] **Step 3: Sửa `src/routes/site/[id]/+page.svelte` — thêm upload UI vào layout card**

Đọc file trước. Thêm state + handlers trong `<script>`:

```ts
let uploadingBgFor = $state<string | null>(null);
let bgError = $state<string | null>(null);

async function uploadBackground(layoutId: string, file: File) {
  bgError = null;
  uploadingBgFor = layoutId;
  try {
    await api.layouts.uploadBackground(layoutId, file);
    await refresh();
  } catch (e) {
    bgError = e instanceof Error ? e.message : 'Upload nền thất bại';
  } finally {
    uploadingBgFor = null;
  }
}

async function deleteBackground(layoutId: string) {
  bgError = null;
  try {
    await api.layouts.deleteBackground(layoutId);
    await refresh();
  } catch (e) {
    bgError = e instanceof Error ? e.message : 'Xóa nền thất bại';
  }
}

function onBgFileChange(layoutId: string, ev: Event) {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) uploadBackground(layoutId, file);
  input.value = '';
}
```

Trong template, bên trong mỗi layout card `<div class="group bg-white ...">`, ngay sau `<div class="mt-3 text-xs text-blue-600 ...">Mở editor →</div>` và TRƯỚC block `{#if confirmDeleteId === layout.id}`, thêm:

```svelte
<div class="mt-2 pt-2 border-t border-gray-100 flex items-center justify-between gap-2" onclick={(e) => e.preventDefault()}>
  {#if layout.backgroundFile}
    <span class="text-[11px] text-green-600 font-medium flex items-center gap-1">✓ Nền DXF</span>
    <button
      onclick={() => deleteBackground(layout.id)}
      class="text-[11px] text-red-400 hover:text-red-600 transition-colors"
    >Xóa nền</button>
  {:else}
    <label class="text-[11px] text-gray-400 hover:text-blue-500 cursor-pointer flex items-center gap-1 transition-colors">
      <input
        type="file"
        accept=".dxf,.dwg"
        class="hidden"
        disabled={uploadingBgFor === layout.id}
        onchange={(e) => onBgFileChange(layout.id, e)}
      />
      {#if uploadingBgFor === layout.id}
        <span>⏳ Đang xử lý…</span>
      {:else}
        <span>📐 Upload nền DXF/DWG</span>
      {/if}
    </label>
  {/if}
</div>
```

Và sau `{/each}` của layout cards (trước closing `</div>` của grid), thêm error display:

```svelte
{#if bgError}
  <div class="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{bgError}</div>
{/if}
```

- [ ] **Step 4: `svelte-check` — 0 errors**

```powershell
cd floor-manager-web
npx svelte-check --tsconfig ./tsconfig.json
```

- [ ] **Step 5: Commit**

```powershell
git add floor-manager-web/src/lib/utils/canvasRenderer.ts floor-manager-web/src/lib/components/editor/FloorPlanCanvas.svelte floor-manager-web/src/routes/site/[id]/+page.svelte
git commit -m "feat: canvas layout background rendering and site page upload UI"
```

---

### Task 5: Kiểm tra tổng thể

**Files:** không có file mới.

- [ ] **Step 1: Backend tests**

```powershell
cd floor-manager
npm test
```

Expected: tất cả tests pass (71 cũ + 5 mới = 76+).

- [ ] **Step 2: Frontend check + build**

```powershell
cd floor-manager-web
npx svelte-check --tsconfig ./tsconfig.json
npm run build
```

Expected: 0 errors, build thành công.

- [ ] **Step 3: E2E kiểm tra tay (backend + frontend dev)**

1. Start backend: `cd floor-manager && npm run dev`
2. Start frontend: `cd floor-manager-web && npm run dev`
3. Đăng nhập với ADMIN account
4. Vào trang Site → layout card: thấy "📐 Upload nền DXF/DWG"
5. Upload `floor-manager/tests/fixtures/box.dxf` → chip đổi thành "✓ Nền DXF", kích thước layout card cập nhật thành 4 × 2 m
6. Mở editor layout đó → thấy đường viền chữ nhật mờ (opacity 0.4) vẽ từ (0,0) đến (400cm × 200cm) dưới lưới
7. Pan/zoom → background SVG di chuyển đúng theo canvas
8. Quay lại trang Site → "Xóa nền" → chip biến mất; mở editor → canvas trắng trở lại
9. Upload file `.txt` → thông báo lỗi "Only DXF and DWG files are supported"

- [ ] **Step 4: Commit nếu có fix**

Nếu bước 3 cần sửa → sửa + commit. Nếu không cần sửa, không tạo commit rỗng.

---

## Self-review

**Spec coverage:**
- ✅ POST `/api/layouts/:id/background` (Task 2)
- ✅ DELETE `/api/layouts/:id/background` (Task 2)
- ✅ DXF/DWG upload, DWG → ODA → DXF (Task 2)
- ✅ `Layout.backgroundFile + widthM + heightM` cập nhật từ DXF bbox (Task 2)
- ✅ `convertDxfSvg.ts`: LINE, LWPOLYLINE/POLYLINE, CIRCLE, ARC (Task 1)
- ✅ Upload UI trong site page layout card (Task 4)
- ✅ `drawLayoutBackground` trong canvasRenderer (Task 4)
- ✅ FloorPlanCanvas vẽ SVG dưới furniture (Task 4)
- ✅ No migration needed (backgroundFile đã tồn tại)
- ✅ DWG without ODA → 422 (Task 2)
- ✅ Delete giữ nguyên widthM/heightM (Task 2)

**Type consistency:**
- `DxfSvgResult.widthM/heightM` (Task 1) → dùng trong `prisma.layout.update({ widthM, heightM })` (Task 2) ✓
- `layoutBgFile: string | null`, `layoutDimsCm: {widthCm, heightCm}` (Task 3) → subscribe trong FloorPlanCanvas (Task 4) ✓
- `drawLayoutBackground(cs, img, widthCm, heightCm)` (Task 4 canvasRenderer) → gọi trong FloorPlanCanvas (Task 4) ✓
- `api.layouts.uploadBackground / deleteBackground` (Task 3 api.ts) → dùng trong site page (Task 4) ✓
