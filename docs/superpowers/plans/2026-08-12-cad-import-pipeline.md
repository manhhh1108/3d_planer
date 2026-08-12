# CAD Import Pipeline Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nhập file CAD (STEP/STP, DXF, DWG, IFC) cho product block: server convert 1 lần thành artifact chuẩn hóa (footprint polygon 2D + mesh.glb + thumbnail SVG), editor 2D vẽ footprint thật, viewer 3D load mesh, trang Products hiện trạng thái convert.

**Architecture:** Upload multipart → tạo `Asset` (status pending) → job queue in-process (concurrency 2) → converter theo đuôi file (occt-import-js cho STEP, dxf-parser cho DXF, ODA File Converter → DXF cho DWG, web-ifc cho IFC) → ghi artifact vào `uploads/assets/<id>/` (public) — file gốc nằm `storage/sources/<id>/` (KHÔNG serve). Khi ready: cập nhật Product (file3dUrl, thumbnail, areaM2, metadata kích thước) để phần còn lại của app dùng ngay dữ liệu thật.

**Tech Stack:** Express 5 + Prisma 7 (backend hiện có), multer (đã có), occt-import-js, web-ifc, dxf-parser, polygon-clipping, @gltf-transform/core. Frontend Svelte 5 hiện có.

**Quy ước tọa độ:**
- footprint.json: mét, polygon **canh tâm bbox tại (0,0)**, trục x = chiều dài (length), y = chiều rộng (width). Frontend nhân 100 → cm rồi vẽ quanh tâm block.
- STEP/DXF: trục Z hướng lên (up-axis `z`); web-ifc xuất tọa độ Y hướng lên (up-axis `y`). Hàm footprint nhận tham số `upAxis`.
- mesh.glb: chuẩn glTF Y-up, đơn vị mét. STEP (Z-up) xoay khi export: `(x,y,z) → (x,z,-y)`; IFC giữ nguyên.
- `unitScale` = hệ số đổi đơn vị file → mét. STEP mặc định 0.001 (mm); DXF đọc `$INSUNITS` (fallback mm); IFC mặc định 1.

**Fixtures:** `floor-manager/tests/fixtures/`. DXF fixture viết tay được (Task 6). STEP/IFC KHÔNG viết tay tin cậy — test tích hợp dùng `it.skipIf(!fs.existsSync(fixture))`: xin user 1 file STEP + 1 file IFC thật (nhỏ) đặt tên `box.step`, `box.ifc` để bật test; phần logic lõi (mesh→footprint→glb) đã test đầy đủ bằng mesh tổng hợp ở Task 2-3.

**Khác spec (có chủ đích):**
- `Asset.createdBy → User` bỏ lại Phase 3 (chưa có bảng User).
- Thumbnail = SVG từ footprint (spec cho phép fallback này) — tránh headless-gl trên Windows.
- Đường dẫn artifact suy ra từ assetId (deterministic), không lưu cột `footprintPath/meshPath/thumbnailPath`.
- Import nền layout (`Layout.backgroundFile`) để phase sau — Phase 2 chỉ lo block sản phẩm.

---

## File Structure

```
floor-manager/
  server/cad/paths.ts          # đường dẫn source/artifact + URL cho 1 assetId
  server/cad/geometry.ts       # PURE: mesh→footprint (union chiếu xuống sàn), bbox, area, hull, SVG
  server/cad/glb.ts            # PURE: CadMesh[] → GLB (gltf-transform)
  server/cad/queue.ts          # ConvertQueue in-process, concurrency 2
  server/cad/convertDxf.ts     # DXF text → footprint (không mesh)
  server/cad/convertStep.ts    # STEP buffer → CadMesh[] (occt-import-js)
  server/cad/convertIfc.ts     # IFC buffer → CadMesh[] (web-ifc)
  server/cad/convertDwg.ts     # DWG → DXF qua ODA File Converter (env ODA_CONVERTER_PATH)
  server/cad/convert.ts        # dispatcher: đọc Asset → convert → ghi artifact → update Asset + Products
  server/routes/assets.ts      # POST / (upload), GET /:id, DELETE /:id
  tests/geometry.test.ts       # Task 2
  tests/glb.test.ts            # Task 3
  tests/queue.test.ts          # Task 4
  tests/convertDxf.test.ts     # Task 6
  tests/convertStep.test.ts    # Task 7 (skipIf thiếu fixture)
  tests/convertIfc.test.ts     # Task 8 (skipIf thiếu fixture)
  tests/convertDwg.test.ts     # Task 9 (fake ODA .cmd)
  tests/assets.test.ts         # Task 5 + 10 (end-to-end DXF)
  tests/fixtures/box.dxf       # Task 6 (viết tay)
  tests/fixtures/fake-oda.cmd  # Task 9
floor-manager-web/
  src/lib/services/api.ts                          # ApiAsset, api.assets, FILES_BASE
  src/lib/stores/productCatalog.ts                 # footprint + assetStatus + file3dUrl vào FurnitureDef
  src/lib/data/furnitureCatalog.ts                 # mở rộng interface FurnitureDef
  src/lib/utils/canvasRenderer.ts                  # drawFootprint()
  src/lib/components/editor/FloorPlanCanvas.svelte # gọi drawFootprint khi có
  src/lib/components/sidebar/BuildPanel.svelte     # disable khi asset chưa ready
  src/lib/utils/furnitureModelLoader.ts            # load GLB theo product.file3dUrl
  src/routes/products/[projectId]/+page.svelte     # upload + status chip + polling
```

---

### Task 1: Dependencies + Asset schema + migration

**Files:**
- Modify: `floor-manager/package.json` (deps)
- Modify: `floor-manager/prisma/schema.prisma`
- Create: `floor-manager/prisma/migrations/<timestamp>_add_asset/migration.sql`
- Modify: `floor-manager/tests/setup.ts` (truncate thêm bảng assets)
- Modify: `.gitignore` (repo root)

- [ ] **Step 1: Cài dependencies**

Chạy trong `floor-manager/`:
```powershell
npm install occt-import-js@^0.0.23 web-ifc@^0.0.57 dxf-parser@^1.1.2 polygon-clipping@^0.15.7 @gltf-transform/core@^4.1.0
```
Nếu version cụ thể không tồn tại, dùng bản mới nhất của package đó (`npm install <pkg>@latest`) và ghi lại version thực trong báo cáo.

- [ ] **Step 2: Thêm model Asset vào schema.prisma**

Thêm sau model `Site`:
```prisma
model Asset {
  id          String    @id @default(cuid())
  fileName    String    @map("file_name")
  fileType    String    @map("file_type") // dwg | dxf | step | stp | ifc
  status      String    @default("pending") // pending | processing | ready | failed
  error       String?
  unitScale   Float     @default(0.001) @map("unit_scale") // file unit -> meters
  bboxLengthM Float?    @map("bbox_length_m")
  bboxWidthM  Float?    @map("bbox_width_m")
  bboxHeightM Float?    @map("bbox_height_m")
  areaM2      Float?    @map("area_m2") // footprint area
  createdAt   DateTime  @default(now()) @map("created_at")
  products    Product[]

  @@map("assets")
}
```

Trong model `Product` thêm 2 dòng (sau `metadata Json?`):
```prisma
  assetId        String?    @map("asset_id")
```
và sau `project Project ...`:
```prisma
  asset          Asset?     @relation(fields: [assetId], references: [id], onDelete: SetNull)
```

- [ ] **Step 3: Tạo migration (create-only, KHÔNG reset dữ liệu)**

```powershell
cd floor-manager
npx prisma migrate dev --create-only --name add_asset
```
Kiểm tra file SQL sinh ra chỉ chứa: `CREATE TABLE "assets"`, `ALTER TABLE "products" ADD COLUMN "asset_id"`, FK `ON DELETE SET NULL`. KHÔNG được có DROP nào. Rồi:
```powershell
npx prisma migrate deploy
npx prisma generate
```

- [ ] **Step 4: Thêm bảng assets vào truncate của test setup**

Trong `floor-manager/tests/setup.ts`, câu TRUNCATE hiện có dạng:
```ts
await prisma.$executeRawUnsafe(
  'TRUNCATE TABLE "positions","snapshots","layouts","sites","products","projects" CASCADE'
);
```
đổi thành:
```ts
await prisma.$executeRawUnsafe(
  'TRUNCATE TABLE "positions","snapshots","layouts","sites","products","projects","assets" CASCADE'
);
```

- [ ] **Step 5: .gitignore**

Thêm vào `.gitignore` repo root (nếu chưa có):
```
floor-manager/storage/
```
(`floor-manager/uploads/` kiểm tra đã ignore chưa; nếu chưa, thêm luôn.)

- [ ] **Step 6: Chạy test hiện có — tất cả pass**

`npm test` trong `floor-manager/` → 14 test pass (migration mới áp dụng vào DB test tự động qua script).

- [ ] **Step 7: Commit**

```powershell
git add floor-manager/package.json floor-manager/package-lock.json floor-manager/prisma floor-manager/tests/setup.ts .gitignore
git commit -m "feat: Asset model and CAD conversion dependencies"
```

---

### Task 2: geometry.ts — footprint từ mesh (TDD, pure functions)

**Files:**
- Create: `floor-manager/server/cad/geometry.ts`
- Test: `floor-manager/tests/geometry.test.ts`

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/geometry.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  meshesToFootprint,
  footprintArea,
  footprintToSvg,
  convexHull,
  type CadMesh,
} from '../server/cad/geometry.js';

// Hộp 4000 x 2000 x 1000 (đơn vị file = mm), Z-up, đáy tại z=0, góc tại gốc tọa độ
function boxMesh(l = 4000, w = 2000, h = 1000): CadMesh {
  const p = [
    0, 0, 0,  l, 0, 0,  l, w, 0,  0, w, 0, // đáy
    0, 0, h,  l, 0, h,  l, w, h,  0, w, h, // đỉnh
  ];
  const idx = [
    0, 2, 1, 0, 3, 2, // đáy
    4, 5, 6, 4, 6, 7, // đỉnh
    0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6,
    3, 0, 4, 3, 4, 7,
  ];
  return { positions: new Float32Array(p), indices: new Uint32Array(idx) };
}

describe('meshesToFootprint', () => {
  it('projects a z-up box to a 4x2 m footprint centered at origin', () => {
    const fp = meshesToFootprint([boxMesh()], 0.001, 'z');
    expect(fp.bbox.lengthM).toBeCloseTo(4, 3);
    expect(fp.bbox.widthM).toBeCloseTo(2, 3);
    expect(fp.bbox.heightM).toBeCloseTo(1, 3);
    expect(fp.areaM2).toBeCloseTo(8, 2);
    // polygon canh tâm: mọi đỉnh nằm trong [-2,2]x[-1,1]
    for (const ring of fp.polygons) {
      for (const [x, y] of ring) {
        expect(Math.abs(x)).toBeLessThanOrEqual(2.001);
        expect(Math.abs(y)).toBeLessThanOrEqual(1.001);
      }
    }
  });

  it('supports y-up meshes (IFC style)', () => {
    // hộp y-up: chiều cao theo trục Y — hoán vị y/z của boxMesh
    const m = boxMesh();
    const pos = m.positions as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const y = pos[i + 1];
      pos[i + 1] = pos[i + 2];
      pos[i + 2] = y;
    }
    const fp = meshesToFootprint([m], 0.001, 'y');
    expect(fp.bbox.lengthM).toBeCloseTo(4, 3);
    expect(fp.bbox.heightM).toBeCloseTo(1, 3);
    expect(fp.areaM2).toBeCloseTo(8, 2);
  });

  it('unions two separated boxes into two polygons', () => {
    const a = boxMesh(1000, 1000, 500);
    const b = boxMesh(1000, 1000, 500);
    const pb = b.positions as Float32Array;
    for (let i = 0; i < pb.length; i += 3) pb[i] += 5000; // dịch 5m theo x
    const fp = meshesToFootprint([a, b], 0.001, 'z');
    expect(fp.polygons.length).toBe(2);
    expect(fp.areaM2).toBeCloseTo(2, 2);
    expect(fp.bbox.lengthM).toBeCloseTo(6, 3);
  });
});

describe('footprintArea', () => {
  it('computes shoelace area for a simple ring', () => {
    expect(footprintArea([[[0, 0], [4, 0], [4, 2], [0, 2]]])).toBeCloseTo(8, 6);
  });
});

describe('convexHull', () => {
  it('returns hull of a point cloud', () => {
    const hull = convexHull([
      [0, 0], [4, 0], [4, 2], [0, 2], [2, 1], [1, 0.5],
    ]);
    expect(hull.length).toBe(4);
  });
});

describe('footprintToSvg', () => {
  it('emits an svg string containing a path', () => {
    const fp = meshesToFootprint([boxMesh()], 0.001, 'z');
    const svg = footprintToSvg(fp, '#58a6ff');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL** (`npm test` — module chưa tồn tại)

- [ ] **Step 3: Implement `server/cad/geometry.ts`**

```ts
import polygonClipping from 'polygon-clipping';

export interface CadMesh {
  positions: Float32Array | number[];
  indices: Uint32Array | number[];
}

export type Ring = [number, number][];

export interface Footprint {
  polygons: Ring[]; // các ring ngoài (đã canh tâm bbox tại 0,0), đơn vị mét
  areaM2: number;
  bbox: { lengthM: number; widthM: number; heightM: number };
}

const EPS = 1e-9;
// Trên số lượng tam giác này thì union quá chậm -> fallback convex hull
const HULL_FALLBACK_TRIANGLES = 20000;

function triArea(r: Ring): number {
  const [[ax, ay], [bx, by], [cx, cy]] = r;
  return Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;
}

/** Diện tích shoelace của 1 ring (dương bất kể chiều). */
function ringArea(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/** Tổng diện tích các ring ngoài (bỏ qua chiều âm/dương — footprint chỉ giữ ring ngoài). */
export function footprintArea(polygons: Ring[]): number {
  return polygons.reduce((s, r) => s + Math.abs(ringArea(r)), 0);
}

/** Monotone chain convex hull. */
export function convexHull(points: [number, number][]): Ring {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 3) return pts;
  const cross = (o: number[], a: number[], b: number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Chiếu mesh xuống mặt sàn và union các tam giác thành silhouette.
 * upAxis 'z': mặt sàn = XY (STEP/DXF). upAxis 'y': mặt sàn = XZ (web-ifc).
 * unitScale: hệ số đổi đơn vị file -> mét.
 */
export function meshesToFootprint(
  meshes: CadMesh[],
  unitScale: number,
  upAxis: 'z' | 'y'
): Footprint {
  // 1. Thu thập tam giác 2D (mét) + bbox 3D
  const tris: Ring[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let minH = Infinity, maxH = -Infinity;

  for (const mesh of meshes) {
    const pos = mesh.positions;
    const idx = mesh.indices;
    const proj = (vi: number): [number, number, number] => {
      const x = pos[vi * 3] * unitScale;
      const y = pos[vi * 3 + 1] * unitScale;
      const z = pos[vi * 3 + 2] * unitScale;
      // trả về [ngang1, ngang2, cao]
      return upAxis === 'z' ? [x, y, z] : [x, z, y];
    };
    for (let i = 0; i < idx.length; i += 3) {
      const a = proj(idx[i]);
      const b = proj(idx[i + 1]);
      const c = proj(idx[i + 2]);
      for (const v of [a, b, c]) {
        if (v[0] < minX) minX = v[0];
        if (v[0] > maxX) maxX = v[0];
        if (v[1] < minY) minY = v[1];
        if (v[1] > maxY) maxY = v[1];
        if (v[2] < minH) minH = v[2];
        if (v[2] > maxH) maxH = v[2];
      }
      const ring: Ring = [
        [a[0], a[1]],
        [b[0], b[1]],
        [c[0], c[1]],
      ];
      if (triArea(ring) > EPS) tris.push(ring);
    }
  }

  const bbox = {
    lengthM: Math.max(0, maxX - minX),
    widthM: Math.max(0, maxY - minY),
    heightM: Math.max(0, maxH - minH),
  };
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  let outerRings: Ring[];
  if (tris.length === 0) {
    outerRings = [];
  } else if (tris.length > HULL_FALLBACK_TRIANGLES) {
    const pts: [number, number][] = tris.flat() as [number, number][];
    outerRings = [convexHull(pts)];
  } else {
    // 2. Union theo lô để tránh call stack/độ chậm của union 1 phát
    let acc: polygonClipping.MultiPolygon = [];
    const BATCH = 200;
    for (let i = 0; i < tris.length; i += BATCH) {
      const batch = tris.slice(i, i + BATCH).map((t) => [t] as polygonClipping.Polygon);
      acc = acc.length === 0
        ? polygonClipping.union(batch[0], ...batch.slice(1))
        : polygonClipping.union(acc, ...batch);
    }
    // 3. Chỉ giữ ring ngoài (ring đầu mỗi polygon); bỏ lỗ — chiếm dụng sàn tính cả lỗ
    outerRings = acc.map((poly) => poly[0] as Ring);
  }

  // 4. Canh tâm bbox tại (0,0), làm tròn 0.1mm
  const polygons = outerRings.map((ring) =>
    ring.map(([x, y]) => [
      Math.round((x - cx) * 10000) / 10000,
      Math.round((y - cy) * 10000) / 10000,
    ] as [number, number])
  );

  return { polygons, areaM2: Math.round(footprintArea(polygons) * 10000) / 10000, bbox: {
    lengthM: Math.round(bbox.lengthM * 10000) / 10000,
    widthM: Math.round(bbox.widthM * 10000) / 10000,
    heightM: Math.round(bbox.heightM * 10000) / 10000,
  } };
}

/** SVG thumbnail từ footprint (viewBox theo bbox, nền trong suốt). */
export function footprintToSvg(fp: Footprint, color: string): string {
  const w = Math.max(fp.bbox.lengthM, 0.001);
  const h = Math.max(fp.bbox.widthM, 0.001);
  const pad = Math.max(w, h) * 0.05;
  const d = fp.polygons
    .map((ring) =>
      ring.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(4)} ${(-y).toFixed(4)}`).join(' ') + ' Z'
    )
    .join(' ');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(-w / 2 - pad).toFixed(4)} ${(-h / 2 - pad).toFixed(4)} ${(w + 2 * pad).toFixed(4)} ${(h + 2 * pad).toFixed(4)}">` +
    `<path d="${d}" fill="${color}" fill-opacity="0.85" stroke="#1e293b" stroke-width="${(Math.max(w, h) * 0.01).toFixed(4)}"/>` +
    `</svg>`
  );
}
```

Lưu ý type của `polygon-clipping`: nếu import kiểu trên báo lỗi type, dùng `import * as pc from 'polygon-clipping'` hoặc `const polygonClipping = (await import('polygon-clipping')).default` tùy bản types của package — chỉnh tối thiểu và ghi lại.

- [ ] **Step 4: Chạy test — PASS** (`npm test`)

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/cad/geometry.ts floor-manager/tests/geometry.test.ts
git commit -m "feat: footprint projection geometry with polygon union and hull fallback"
```

---

### Task 3: glb.ts — xuất GLB từ mesh (TDD)

**Files:**
- Create: `floor-manager/server/cad/glb.ts`
- Test: `floor-manager/tests/glb.test.ts`

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/glb.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { meshesToGlb } from '../server/cad/glb.js';
import type { CadMesh } from '../server/cad/geometry.js';

function tri(): CadMesh {
  return {
    positions: new Float32Array([0, 0, 0, 1000, 0, 0, 0, 1000, 0]),
    indices: new Uint32Array([0, 1, 2]),
  };
}

describe('meshesToGlb', () => {
  it('produces a parseable GLB with scaled, y-up positions', async () => {
    const glb = await meshesToGlb([tri()], 0.001, 'z');
    expect(glb.byteLength).toBeGreaterThan(20);
    // GLB magic 'glTF'
    expect(new TextDecoder().decode(glb.slice(0, 4))).toBe('glTF');

    const doc = await new NodeIO().readBinary(glb);
    const meshes = doc.getRoot().listMeshes();
    expect(meshes.length).toBe(1);
    const prim = meshes[0].listPrimitives()[0];
    const pos = prim.getAttribute('POSITION')!.getArray()!;
    // đỉnh (1000,0,0)*0.001, z-up -> y-up (x,z,-y): (1,0,0) giữ nguyên
    expect(pos[3]).toBeCloseTo(1, 5);
    // đỉnh (0,1000,0) -> (0, 0, -1)
    expect(pos[8]).toBeCloseTo(-1, 5);
  });

  it('keeps y-up meshes untouched apart from scaling', async () => {
    const glb = await meshesToGlb([tri()], 0.001, 'y');
    const doc = await new NodeIO().readBinary(glb);
    const pos = doc.getRoot().listMeshes()[0].listPrimitives()[0].getAttribute('POSITION')!.getArray()!;
    // (0,1000,0) -> (0,1,0)
    expect(pos[7]).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Chạy test — FAIL**

- [ ] **Step 3: Implement `server/cad/glb.ts`**

```ts
import { Document, NodeIO } from '@gltf-transform/core';
import type { CadMesh } from './geometry.js';

/**
 * Ghép CadMesh[] thành một GLB. unitScale đổi về mét.
 * upAxis 'z' (STEP): xoay về Y-up chuẩn glTF bằng (x,y,z) -> (x,z,-y).
 * upAxis 'y' (IFC/web-ifc): giữ nguyên trục.
 */
export async function meshesToGlb(
  meshes: CadMesh[],
  unitScale: number,
  upAxis: 'z' | 'y'
): Promise<Uint8Array> {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();

  for (const m of meshes) {
    const src = m.positions;
    const pos = new Float32Array(src.length);
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i] * unitScale;
      const y = src[i + 1] * unitScale;
      const z = src[i + 2] * unitScale;
      if (upAxis === 'z') {
        pos[i] = x;
        pos[i + 1] = z;
        pos[i + 2] = -y;
      } else {
        pos[i] = x;
        pos[i + 1] = y;
        pos[i + 2] = z;
      }
    }
    const position = doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer);
    const indices = doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(m.indices instanceof Uint32Array ? m.indices : new Uint32Array(m.indices))
      .setBuffer(buffer);
    const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
    const mesh = doc.createMesh().addPrimitive(prim);
    scene.addChild(doc.createNode().setMesh(mesh));
  }

  return new NodeIO().writeBinary(doc);
}
```

- [ ] **Step 4: Chạy test — PASS**

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/cad/glb.ts floor-manager/tests/glb.test.ts
git commit -m "feat: GLB export from raw CAD meshes"
```

---

### Task 4: queue.ts — hàng đợi convert in-process (TDD)

**Files:**
- Create: `floor-manager/server/cad/queue.ts`
- Test: `floor-manager/tests/queue.test.ts`

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/queue.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { ConvertQueue } from '../server/cad/queue.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('ConvertQueue', () => {
  it('runs at most `concurrency` jobs at once and processes all', async () => {
    let running = 0;
    let peak = 0;
    const done: string[] = [];
    const q = new ConvertQueue(async (id) => {
      running++;
      peak = Math.max(peak, running);
      await sleep(30);
      running--;
      done.push(id);
    }, 2);
    for (const id of ['a', 'b', 'c', 'd', 'e']) q.enqueue(id);
    await q.idle();
    expect(done.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(peak).toBe(2);
  });

  it('a throwing job does not stop the queue', async () => {
    const done: string[] = [];
    const q = new ConvertQueue(async (id) => {
      if (id === 'boom') throw new Error('x');
      done.push(id);
    }, 1);
    q.enqueue('boom');
    q.enqueue('ok');
    await q.idle();
    expect(done).toEqual(['ok']);
  });

  it('does not enqueue the same id twice while pending', async () => {
    let calls = 0;
    const q = new ConvertQueue(async () => {
      calls++;
      await sleep(20);
    }, 1);
    q.enqueue('x');
    q.enqueue('x');
    await q.idle();
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Chạy test — FAIL**

- [ ] **Step 3: Implement `server/cad/queue.ts`**

```ts
export type ConverterFn = (assetId: string) => Promise<void>;

/** Hàng đợi convert in-process. Converter tự lo cập nhật status trong DB. */
export class ConvertQueue {
  private pending: string[] = [];
  private runningIds = new Set<string>();

  constructor(
    private converter: ConverterFn,
    private concurrency = 2
  ) {}

  enqueue(assetId: string): void {
    if (this.pending.includes(assetId) || this.runningIds.has(assetId)) return;
    this.pending.push(assetId);
    this.drain();
  }

  private drain(): void {
    while (this.runningIds.size < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      this.runningIds.add(id);
      this.converter(id)
        .catch(() => {
          /* converter tự ghi lỗi vào Asset; queue không dừng */
        })
        .finally(() => {
          this.runningIds.delete(id);
          this.drain();
        });
    }
  }

  /** Chờ đến khi không còn job nào (dùng cho test). */
  async idle(): Promise<void> {
    while (this.runningIds.size > 0 || this.pending.length > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}
```

- [ ] **Step 4: Chạy test — PASS**

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/cad/queue.ts floor-manager/tests/queue.test.ts
git commit -m "feat: in-process conversion queue with bounded concurrency"
```

---

### Task 5: paths.ts + routes assets (upload/get/delete) (TDD)

Converter thật chưa nối (Task 10) — route enqueue vào queue được **inject**; test dùng converter giả.

**Files:**
- Create: `floor-manager/server/cad/paths.ts`
- Create: `floor-manager/server/routes/assets.ts`
- Modify: `floor-manager/server/app.ts` (mount router)
- Test: `floor-manager/tests/assets.test.ts`

- [ ] **Step 1: Implement `server/cad/paths.ts`** (không cần test riêng — hàm dựng chuỗi, được test gián tiếp)

```ts
import path from 'path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const STORAGE_DIR = process.env.STORAGE_DIR || './storage';

export function assetPaths(assetId: string, fileType?: string) {
  const sourceDir = path.resolve(STORAGE_DIR, 'sources', assetId);
  const artifactDir = path.resolve(UPLOAD_DIR, 'assets', assetId);
  return {
    sourceDir,
    artifactDir,
    sourceFile: fileType ? path.join(sourceDir, `source.${fileType}`) : undefined,
    footprintFile: path.join(artifactDir, 'footprint.json'),
    meshFile: path.join(artifactDir, 'mesh.glb'),
    thumbFile: path.join(artifactDir, 'thumb.svg'),
    footprintUrl: `/uploads/assets/${assetId}/footprint.json`,
    meshUrl: `/uploads/assets/${assetId}/mesh.glb`,
    thumbUrl: `/uploads/assets/${assetId}/thumb.svg`,
  };
}
```

- [ ] **Step 2: Viết test fail**

Tạo `floor-manager/tests/assets.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../server/app.js';
import prisma from '../server/db.js';

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');

async function makeProduct() {
  const proj = (await request(app).post('/api/projects').send({ name: 'P' })).body;
  return (
    await request(app).post('/api/products').send({ projectId: proj.id, name: 'B', code: 'B1' })
  ).body;
}

describe('assets routes', () => {
  it('uploads a file, creates pending asset, links product', async () => {
    const prod = await makeProduct();
    const res = await request(app)
      .post('/api/assets')
      .field('productId', prod.id)
      .attach('file', Buffer.from('0\nEOF\n'), 'block.dxf');
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.fileType).toBe('dxf');
    expect(res.body.fileName).toBe('block.dxf');

    const linked = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(linked!.assetId).toBe(res.body.id);
    // file gốc nằm trong storage/sources, không nằm trong uploads
    const src = path.resolve('./storage/sources', res.body.id, 'source.dxf');
    expect(fs.existsSync(src)).toBe(true);
  });

  it('rejects unsupported extensions', async () => {
    const res = await request(app)
      .post('/api/assets')
      .attach('file', Buffer.from('x'), 'note.txt');
    expect(res.status).toBe(400);
  });

  it('gets asset status with urls when ready', async () => {
    const created = (
      await request(app).post('/api/assets').attach('file', Buffer.from('0\nEOF\n'), 'a.dxf')
    ).body;
    await prisma.asset.update({ where: { id: created.id }, data: { status: 'ready' } });
    const res = await request(app).get(`/api/assets/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.footprintUrl).toBe(`/uploads/assets/${created.id}/footprint.json`);
    expect(res.body.thumbUrl).toBe(`/uploads/assets/${created.id}/thumb.svg`);
  });

  it('404 on unknown asset', async () => {
    const res = await request(app).get('/api/assets/nope');
    expect(res.status).toBe(404);
  });

  it('deletes asset: unlinks product, removes rows and files', async () => {
    const prod = await makeProduct();
    const created = (
      await request(app)
        .post('/api/assets')
        .field('productId', prod.id)
        .attach('file', Buffer.from('0\nEOF\n'), 'a.dxf')
    ).body;
    const res = await request(app).delete(`/api/assets/${created.id}`);
    expect(res.status).toBe(204);
    expect(await prisma.asset.findUnique({ where: { id: created.id } })).toBeNull();
    const p = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(p!.assetId).toBeNull();
    expect(fs.existsSync(path.resolve('./storage/sources', created.id))).toBe(false);
  });
});
```

- [ ] **Step 3: Chạy test — FAIL** (route chưa có)

- [ ] **Step 4: Implement `server/routes/assets.ts`**

```ts
import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../db.js';
import { assetPaths } from '../cad/paths.js';
import { ConvertQueue, type ConverterFn } from '../cad/queue.js';

const ALLOWED = ['dwg', 'dxf', 'step', 'stp', 'ifc'];
const TMP_DIR = path.resolve(process.env.STORAGE_DIR || './storage', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 200 * 1024 * 1024 },
});

// Converter thật được gắn ở Task 10; mặc định no-op để route hoạt động độc lập.
let converter: ConverterFn = async () => {};
export function setConverter(fn: ConverterFn): void {
  converter = fn;
}
export const convertQueue = new ConvertQueue((id) => converter(id), 2);

function serialize(asset: {
  id: string;
  fileName: string;
  fileType: string;
  status: string;
  error: string | null;
  unitScale: number;
  bboxLengthM: number | null;
  bboxWidthM: number | null;
  bboxHeightM: number | null;
  areaM2: number | null;
  createdAt: Date;
}) {
  const p = assetPaths(asset.id);
  const ready = asset.status === 'ready';
  return {
    ...asset,
    footprintUrl: ready ? p.footprintUrl : null,
    meshUrl: ready && fs.existsSync(p.meshFile) ? p.meshUrl : null,
    thumbUrl: ready ? p.thumbUrl : null,
  };
}

const router = Router();

// POST / — multipart: file (bắt buộc), productId?, unitScale?
router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
    if (!ALLOWED.includes(ext)) {
      fs.rmSync(req.file.path, { force: true });
      return res.status(400).json({ error: `File type .${ext} not supported (${ALLOWED.join(', ')})` });
    }
    const { productId } = req.body;
    const unitScale = req.body.unitScale
      ? Number(req.body.unitScale)
      : ext === 'ifc'
        ? 1
        : 0.001;

    const asset = await prisma.asset.create({
      data: { fileName: req.file.originalname, fileType: ext, unitScale },
    });
    const p = assetPaths(asset.id, ext);
    fs.mkdirSync(p.sourceDir, { recursive: true });
    fs.renameSync(req.file.path, p.sourceFile!);

    if (productId) {
      await prisma.product.update({ where: { id: String(productId) }, data: { assetId: asset.id } });
    }
    convertQueue.enqueue(asset.id);
    res.status(201).json(serialize(asset));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — trạng thái + url artifact
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const asset = await prisma.asset.findUnique({ where: { id: String(req.params.id) } });
    if (!asset) return res.status(404).json({ error: 'Not found' });
    res.json(serialize(asset));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — gỡ khỏi products (SetNull), xóa row + file
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const asset = await prisma.asset.findUnique({ where: { id } });
    if (!asset) return res.status(404).json({ error: 'Not found' });
    await prisma.asset.delete({ where: { id } }); // products.asset_id SET NULL bởi FK
    const p = assetPaths(id);
    fs.rmSync(p.sourceDir, { recursive: true, force: true });
    fs.rmSync(p.artifactDir, { recursive: true, force: true });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

- [ ] **Step 5: Mount router trong `server/app.ts`**

Thêm import + use theo pattern các router hiện có:
```ts
import assetsRouter from './routes/assets.js';
// ...
app.use('/api/assets', assetsRouter);
```

- [ ] **Step 6: Chạy test — PASS** (`npm test`)

- [ ] **Step 7: Commit**

```powershell
git add floor-manager/server/cad/paths.ts floor-manager/server/routes/assets.ts floor-manager/server/app.ts floor-manager/tests/assets.test.ts
git commit -m "feat: asset upload/status/delete routes with source-artifact separation"
```

---

### Task 6: convertDxf.ts (TDD, fixture viết tay)

**Files:**
- Create: `floor-manager/tests/fixtures/box.dxf`
- Create: `floor-manager/server/cad/convertDxf.ts`
- Test: `floor-manager/tests/convertDxf.test.ts`

- [ ] **Step 1: Tạo fixture `tests/fixtures/box.dxf`** — hình chữ nhật 4000×2000 mm, LWPOLYLINE đóng, $INSUNITS=4 (mm):

```
0
SECTION
2
HEADER
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0.0
20
0.0
10
4000.0
20
0.0
10
4000.0
20
2000.0
10
0.0
20
2000.0
0
ENDSEC
0
EOF
```
(File DXF là các cặp dòng group-code/giá trị — giữ nguyên từng dòng như trên, không thụt lề.)

- [ ] **Step 2: Viết test fail**

Tạo `floor-manager/tests/convertDxf.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { dxfToFootprint } from '../server/cad/convertDxf.js';

const fixture = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'box.dxf'), 'utf8');

describe('dxfToFootprint', () => {
  it('parses closed LWPOLYLINE into a centered 4x2 m footprint using $INSUNITS', () => {
    const fp = dxfToFootprint(fixture, undefined);
    expect(fp.bbox.lengthM).toBeCloseTo(4, 3);
    expect(fp.bbox.widthM).toBeCloseTo(2, 3);
    expect(fp.bbox.heightM).toBe(0);
    expect(fp.areaM2).toBeCloseTo(8, 2);
    expect(fp.polygons.length).toBe(1);
  });

  it('explicit unitScale overrides $INSUNITS', () => {
    const fp = dxfToFootprint(fixture, 0.01); // coi số liệu là cm
    expect(fp.bbox.lengthM).toBeCloseTo(40, 2);
  });

  it('falls back to convex hull when no closed polyline exists', () => {
    const open = fixture.replace('70\n1\n', '70\n0\n'); // polyline mở
    const fp = dxfToFootprint(open, undefined);
    expect(fp.polygons.length).toBe(1);
    expect(fp.areaM2).toBeGreaterThan(0);
  });

  it('throws a clear error on empty drawing', () => {
    expect(() => dxfToFootprint('0\nEOF\n', undefined)).toThrow(/no geometry/i);
  });
});
```

- [ ] **Step 3: Chạy test — FAIL**

- [ ] **Step 4: Implement `server/cad/convertDxf.ts`**

```ts
import DxfParser from 'dxf-parser';
import { convexHull, footprintArea, type Footprint, type Ring } from './geometry.js';

// $INSUNITS -> mét
const INSUNITS_SCALE: Record<number, number> = {
  1: 0.0254, // inch
  2: 0.3048, // feet
  4: 0.001, // mm
  5: 0.01, // cm
  6: 1, // m
};

/**
 * DXF text -> footprint. Ưu tiên các LWPOLYLINE/POLYLINE đóng;
 * nếu không có, lấy convex hull của mọi đỉnh. unitScale override $INSUNITS.
 */
export function dxfToFootprint(dxfText: string, unitScale: number | undefined): Footprint {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfText);
  if (!dxf) throw new Error('DXF parse failed');

  const insunits = Number(dxf.header?.['$INSUNITS'] ?? 0);
  const scale = unitScale ?? INSUNITS_SCALE[insunits] ?? 0.001;

  const closedRings: Ring[] = [];
  const allPoints: [number, number][] = [];

  for (const e of dxf.entities ?? []) {
    const ent = e as { type: string; vertices?: { x: number; y: number }[]; shape?: boolean; closed?: boolean };
    if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices?.length) {
      const ring: Ring = ent.vertices.map((v) => [v.x * scale, v.y * scale]);
      for (const p of ring) allPoints.push(p);
      const isClosed = ent.shape === true || ent.closed === true;
      if (isClosed && ring.length >= 3) closedRings.push(ring);
    } else if (ent.vertices?.length) {
      for (const v of ent.vertices) allPoints.push([v.x * scale, v.y * scale]);
    }
  }

  if (allPoints.length === 0) throw new Error('DXF contains no geometry');

  const rings = closedRings.length > 0 ? closedRings : [convexHull(allPoints)];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of allPoints) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  const polygons = rings.map((ring) =>
    ring.map(([x, y]) => [
      Math.round((x - cx) * 10000) / 10000,
      Math.round((y - cy) * 10000) / 10000,
    ] as [number, number])
  );

  return {
    polygons,
    areaM2: Math.round(footprintArea(polygons) * 10000) / 10000,
    bbox: {
      lengthM: Math.round((maxX - minX) * 10000) / 10000,
      widthM: Math.round((maxY - minY) * 10000) / 10000,
      heightM: 0,
    },
  };
}
```

Lưu ý: nếu types của `dxf-parser` không khớp cách import (`import DxfParser from 'dxf-parser'`), thử `import { DxfParser } from 'dxf-parser'` — chỉnh tối thiểu, ghi lại.

- [ ] **Step 5: Chạy test — PASS**

- [ ] **Step 6: Commit**

```powershell
git add floor-manager/tests/fixtures/box.dxf floor-manager/server/cad/convertDxf.ts floor-manager/tests/convertDxf.test.ts
git commit -m "feat: DXF to footprint conversion with INSUNITS handling"
```

---

### Task 7: convertStep.ts (occt-import-js; test tích hợp skipIf thiếu fixture)

**Files:**
- Create: `floor-manager/server/cad/convertStep.ts`
- Test: `floor-manager/tests/convertStep.test.ts`
- Fixture (nếu có): `floor-manager/tests/fixtures/box.step` — XIN USER một file STEP nhỏ thật; nếu chưa có thì test skip, KHÔNG chặn task.

- [ ] **Step 1: Viết test (skipIf)**

Tạo `floor-manager/tests/convertStep.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { stepToMeshes } from '../server/cad/convertStep.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'box.step');
const hasFixture = fs.existsSync(FIXTURE);

describe('stepToMeshes', () => {
  it.skipIf(!hasFixture)('reads a STEP file into triangle meshes', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const meshes = await stepToMeshes(buf);
    expect(meshes.length).toBeGreaterThan(0);
    const m = meshes[0];
    expect(m.positions.length % 3).toBe(0);
    expect(m.indices.length % 3).toBe(0);
    expect(m.positions.length).toBeGreaterThan(0);
  });

  it('rejects with a clear error on garbage input', async () => {
    await expect(stepToMeshes(Buffer.from('not a step file'))).rejects.toThrow(/STEP/i);
  });
});
```
Nếu test skip vì thiếu fixture: in cảnh báo trong báo cáo — "đặt file STEP nhỏ vào tests/fixtures/box.step để bật test tích hợp".

- [ ] **Step 2: Chạy test — case garbage phải FAIL (module chưa có)**

- [ ] **Step 3: Implement `server/cad/convertStep.ts`**

```ts
import type { CadMesh } from './geometry.js';

// occt-import-js là module WASM khởi tạo async; cache instance.
let occtPromise: Promise<any> | null = null;
async function getOcct(): Promise<any> {
  if (!occtPromise) {
    const mod = await import('occt-import-js');
    const factory = (mod as any).default ?? mod;
    occtPromise = factory();
  }
  return occtPromise;
}

/** Đọc STEP/STP buffer thành danh sách mesh tam giác (tọa độ = đơn vị file, Z-up). */
export async function stepToMeshes(fileBuffer: Buffer): Promise<CadMesh[]> {
  const occt = await getOcct();
  const result = occt.ReadStepFile(new Uint8Array(fileBuffer), null);
  if (!result || !result.success || !result.meshes?.length) {
    throw new Error('STEP read failed: file is not a valid STEP model or contains no solids');
  }
  return result.meshes.map((m: any) => ({
    positions: new Float32Array(m.attributes.position.array),
    indices: new Uint32Array(m.index.array),
  }));
}
```

- [ ] **Step 4: Chạy test — PASS** (garbage case pass; fixture case pass nếu có file)

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/cad/convertStep.ts floor-manager/tests/convertStep.test.ts
git commit -m "feat: STEP to mesh conversion via occt-import-js"
```
(Nếu đã thêm fixture: `git add floor-manager/tests/fixtures/box.step` — file nhỏ mới commit; >5MB thì đừng commit.)

---

### Task 8: convertIfc.ts (web-ifc; test tích hợp skipIf thiếu fixture)

**Files:**
- Create: `floor-manager/server/cad/convertIfc.ts`
- Test: `floor-manager/tests/convertIfc.test.ts`
- Fixture (nếu có): `floor-manager/tests/fixtures/box.ifc` — xin user; thiếu thì skip.

- [ ] **Step 1: Viết test (skipIf)**

Tạo `floor-manager/tests/convertIfc.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ifcToMeshes } from '../server/cad/convertIfc.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'box.ifc');
const hasFixture = fs.existsSync(FIXTURE);

describe('ifcToMeshes', () => {
  it.skipIf(!hasFixture)('reads an IFC file into transformed triangle meshes', async () => {
    const buf = fs.readFileSync(FIXTURE);
    const meshes = await ifcToMeshes(buf);
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes[0].positions.length % 3).toBe(0);
    expect(meshes[0].indices.length % 3).toBe(0);
  });

  it('rejects with a clear error on garbage input', async () => {
    await expect(ifcToMeshes(Buffer.from('not an ifc'))).rejects.toThrow(/IFC/i);
  });
});
```

- [ ] **Step 2: Chạy test — case garbage FAIL**

- [ ] **Step 3: Implement `server/cad/convertIfc.ts`**

```ts
import type { CadMesh } from './geometry.js';

let apiPromise: Promise<any> | null = null;
async function getIfcApi(): Promise<any> {
  if (!apiPromise) {
    apiPromise = (async () => {
      const WebIFC = await import('web-ifc');
      const api = new (WebIFC as any).IfcAPI();
      await api.Init();
      return api;
    })();
  }
  return apiPromise;
}

/**
 * Đọc IFC buffer thành mesh tam giác đã áp transform (tọa độ Y-up theo web-ifc, đơn vị mét).
 */
export async function ifcToMeshes(fileBuffer: Buffer): Promise<CadMesh[]> {
  const api = await getIfcApi();
  let modelID: number | null = null;
  try {
    modelID = api.OpenModel(new Uint8Array(fileBuffer));
    const meshes: CadMesh[] = [];
    api.StreamAllMeshes(modelID, (flatMesh: any) => {
      const geometries = flatMesh.geometries;
      for (let i = 0; i < geometries.size(); i++) {
        const placed = geometries.get(i);
        const geom = api.GetGeometry(modelID, placed.geometryExpressID);
        const verts: Float32Array = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
        const idx: Uint32Array = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
        const m: number[] = placed.flatTransformation;
        const positions = new Float32Array((verts.length / 6) * 3);
        // verts xen kẽ x,y,z,nx,ny,nz — áp ma trận 4x4 column-major
        for (let v = 0, p = 0; v < verts.length; v += 6, p += 3) {
          const x = verts[v], y = verts[v + 1], z = verts[v + 2];
          positions[p] = m[0] * x + m[4] * y + m[8] * z + m[12];
          positions[p + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
          positions[p + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
        }
        meshes.push({ positions, indices: new Uint32Array(idx) });
      }
    });
    if (meshes.length === 0) throw new Error('IFC contains no meshable elements');
    return meshes;
  } catch (err) {
    throw new Error(`IFC read failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    if (modelID !== null) {
      try { api.CloseModel(modelID); } catch { /* noop */ }
    }
  }
}
```
Lưu ý: nếu `OpenModel` với input rác không throw mà trả model rỗng, nhánh `meshes.length === 0` sẽ throw — test garbage vẫn pass (message chứa "IFC").

- [ ] **Step 4: Chạy test — PASS**

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/cad/convertIfc.ts floor-manager/tests/convertIfc.test.ts
git commit -m "feat: IFC to mesh conversion via web-ifc"
```

---

### Task 9: convertDwg.ts (ODA File Converter, test bằng fake exe)

**Files:**
- Create: `floor-manager/server/cad/convertDwg.ts`
- Create: `floor-manager/tests/fixtures/fake-oda.cmd`
- Test: `floor-manager/tests/convertDwg.test.ts`

- [ ] **Step 1: Tạo fake converter `tests/fixtures/fake-oda.cmd`** — giả lập ODA: copy fixture DXF vào thư mục output với tên tương ứng:

```bat
@echo off
rem args: %1=input dir  %2=output dir  (các arg sau bỏ qua)
for %%f in (%1\*.dwg) do copy /y "%~dp0box.dxf" "%~2\%%~nf.dxf" >nul
```

- [ ] **Step 2: Viết test fail**

Tạo `floor-manager/tests/convertDwg.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { dwgToDxfText } from '../server/cad/convertDwg.js';

const FAKE = path.join(import.meta.dirname, 'fixtures', 'fake-oda.cmd');

afterEach(() => {
  delete process.env.ODA_CONVERTER_PATH;
});

describe('dwgToDxfText', () => {
  it('throws a clear error when ODA_CONVERTER_PATH is not set', async () => {
    delete process.env.ODA_CONVERTER_PATH;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwg-'));
    const dwg = path.join(tmp, 'block.dwg');
    fs.writeFileSync(dwg, 'fake dwg');
    await expect(dwgToDxfText(dwg)).rejects.toThrow(/ODA_CONVERTER_PATH/);
  });

  it('invokes the converter and returns the produced DXF text', async () => {
    process.env.ODA_CONVERTER_PATH = FAKE;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwg-'));
    const dwg = path.join(tmp, 'block.dwg');
    fs.writeFileSync(dwg, 'fake dwg');
    const text = await dwgToDxfText(dwg);
    expect(text).toContain('LWPOLYLINE');
  });

  it('throws when converter produces no output', async () => {
    process.env.ODA_CONVERTER_PATH = 'cmd /c exit 0'.split(' ')[0]; // cmd tồn tại nhưng không tạo file
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dwg-'));
    const dwg = path.join(tmp, 'block.dwg');
    fs.writeFileSync(dwg, 'fake dwg');
    await expect(dwgToDxfText(dwg)).rejects.toThrow(/DXF/i);
  });
});
```

- [ ] **Step 3: Chạy test — FAIL**

- [ ] **Step 4: Implement `server/cad/convertDwg.ts`**

```ts
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * DWG -> DXF text qua ODA File Converter (env ODA_CONVERTER_PATH trỏ tới ODAFileConverter exe).
 * Cách gọi ODA: ODAFileConverter <inDir> <outDir> <outVer> <outType> <recurse> <audit>
 */
export async function dwgToDxfText(dwgFilePath: string): Promise<string> {
  const exe = process.env.ODA_CONVERTER_PATH;
  if (!exe) {
    throw new Error(
      'ODA_CONVERTER_PATH chưa cấu hình — cài ODA File Converter và đặt biến môi trường này để convert DWG'
    );
  }
  const inDir = path.dirname(dwgFilePath);
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oda-out-'));
  try {
    await execFileAsync(exe, [inDir, outDir, 'ACAD2018', 'DXF', '0', '1'], {
      timeout: 120_000,
      windowsHide: true,
      shell: false,
    });
    const base = path.basename(dwgFilePath, path.extname(dwgFilePath));
    const outFile = path.join(outDir, `${base}.dxf`);
    if (!fs.existsSync(outFile)) {
      throw new Error('ODA converter ran but produced no DXF output');
    }
    return fs.readFileSync(outFile, 'utf8');
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}
```
Lưu ý Windows: chạy file `.cmd` qua execFile cần `shell: true` — nếu test 2 fail vì lý do này, đổi `shell: false` thành `shell: process.platform === 'win32'` và ghi lại. Test 3 nếu `cmd` không nhận args kiểu đó mà throw sớm thì vẫn pass (throw chứa message khác) — chỉnh expect theo hành vi thực nếu cần, miễn là có lỗi rõ ràng.

- [ ] **Step 5: Chạy test — PASS**

- [ ] **Step 6: Commit**

```powershell
git add floor-manager/server/cad/convertDwg.ts floor-manager/tests/fixtures/fake-oda.cmd floor-manager/tests/convertDwg.test.ts
git commit -m "feat: DWG to DXF via ODA File Converter with graceful missing-binary error"
```

---

### Task 10: convert.ts dispatcher + nối queue + cập nhật Product + boot recovery (TDD end-to-end DXF)

**Files:**
- Create: `floor-manager/server/cad/convert.ts`
- Modify: `floor-manager/server/routes/assets.ts` (gắn converter thật)
- Modify: `floor-manager/server/routes/products.ts` (include asset trong list/get)
- Modify: `floor-manager/server/index.ts` (boot recovery)
- Test: thêm vào `floor-manager/tests/assets.test.ts`

- [ ] **Step 1: Viết test fail (thêm vào cuối `tests/assets.test.ts`)**

```ts
import { convertQueue } from '../server/routes/assets.js';

describe('end-to-end conversion (dxf)', () => {
  it('converts uploaded DXF to ready asset with artifacts and updates product', async () => {
    const prod = await makeProduct();
    const dxf = fs.readFileSync(FIXTURE_DXF);
    const created = (
      await request(app)
        .post('/api/assets')
        .field('productId', prod.id)
        .attach('file', dxf, 'block.dxf')
    ).body;

    await convertQueue.idle();

    const res = await request(app).get(`/api/assets/${created.id}`);
    expect(res.body.status).toBe('ready');
    expect(res.body.bboxLengthM).toBeCloseTo(4, 2);
    expect(res.body.areaM2).toBeCloseTo(8, 1);
    expect(res.body.meshUrl).toBeNull(); // DXF không có mesh

    const p = assetPathsForTest(created.id);
    expect(fs.existsSync(p.footprintFile)).toBe(true);
    expect(fs.existsSync(p.thumbFile)).toBe(true);
    const fp = JSON.parse(fs.readFileSync(p.footprintFile, 'utf8'));
    expect(fp.polygons.length).toBe(1);

    const updated = await prisma.product.findUnique({ where: { id: prod.id } });
    expect(updated!.areaM2).toBeCloseTo(8, 1);
    expect(updated!.thumbnail).toBe(`/uploads/assets/${created.id}/thumb.svg`);
    const meta = updated!.metadata as { widthM?: number; depthM?: number };
    expect(meta.widthM).toBeCloseTo(4, 2);
    expect(meta.depthM).toBeCloseTo(2, 2);
  });

  it('marks asset failed with error message on broken file', async () => {
    const created = (
      await request(app).post('/api/assets').attach('file', Buffer.from('0\nEOF\n'), 'bad.dxf')
    ).body;
    await convertQueue.idle();
    const res = await request(app).get(`/api/assets/${created.id}`);
    expect(res.body.status).toBe('failed');
    expect(res.body.error).toBeTruthy();
  });

  it('products list includes asset status', async () => {
    const prod = await makeProduct();
    await request(app)
      .post('/api/assets')
      .field('productId', prod.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'block.dxf');
    await convertQueue.idle();
    const list = (await request(app).get(`/api/products?projectId=${prod.projectId}`)).body;
    expect(list[0].asset.status).toBe('ready');
  });
});
```
Đầu file test thêm helper:
```ts
import { assetPaths as assetPathsForTest } from '../server/cad/paths.js';
```

- [ ] **Step 2: Chạy test — FAIL** (asset đứng ở pending vì converter còn no-op)

- [ ] **Step 3: Implement `server/cad/convert.ts`**

```ts
import fs from 'fs';
import prisma from '../db.js';
import { assetPaths } from './paths.js';
import { meshesToFootprint, footprintToSvg, type Footprint, type CadMesh } from './geometry.js';
import { meshesToGlb } from './glb.js';
import { dxfToFootprint } from './convertDxf.js';
import { stepToMeshes } from './convertStep.js';
import { ifcToMeshes } from './convertIfc.js';
import { dwgToDxfText } from './convertDwg.js';

/** Chạy convert cho 1 asset: đọc source -> artifact -> update Asset + Products liên kết. */
export async function runConversion(assetId: string): Promise<void> {
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) return;
  await prisma.asset.update({ where: { id: assetId }, data: { status: 'processing', error: null } });

  const p = assetPaths(assetId, asset.fileType);
  try {
    let footprint: Footprint;
    let glb: Uint8Array | null = null;

    if (asset.fileType === 'dxf' || asset.fileType === 'dwg') {
      const text =
        asset.fileType === 'dwg'
          ? await dwgToDxfText(p.sourceFile!)
          : fs.readFileSync(p.sourceFile!, 'utf8');
      // DXF: unitScale mặc định 0.001 do route đặt; $INSUNITS trong file được ưu tiên
      // trừ khi user override qua param (unitScale khác default).
      footprint = dxfToFootprint(text, asset.unitScale === 0.001 ? undefined : asset.unitScale);
    } else {
      const buf = fs.readFileSync(p.sourceFile!);
      let meshes: CadMesh[];
      let upAxis: 'z' | 'y';
      if (asset.fileType === 'ifc') {
        meshes = await ifcToMeshes(buf);
        upAxis = 'y';
      } else {
        meshes = await stepToMeshes(buf);
        upAxis = 'z';
      }
      footprint = meshesToFootprint(meshes, asset.unitScale, upAxis);
      glb = await meshesToGlb(meshes, asset.unitScale, upAxis);
    }

    fs.mkdirSync(p.artifactDir, { recursive: true });
    fs.writeFileSync(p.footprintFile, JSON.stringify(footprint));
    fs.writeFileSync(p.thumbFile, footprintToSvg(footprint, '#58a6ff'));
    if (glb) fs.writeFileSync(p.meshFile, glb);

    await prisma.asset.update({
      where: { id: assetId },
      data: {
        status: 'ready',
        error: null,
        bboxLengthM: footprint.bbox.lengthM,
        bboxWidthM: footprint.bbox.widthM,
        bboxHeightM: footprint.bbox.heightM,
        areaM2: footprint.areaM2,
      },
    });

    // Cập nhật mọi product gắn asset này để app dùng ngay số liệu thật
    const products = await prisma.product.findMany({ where: { assetId } });
    for (const prod of products) {
      const meta = (prod.metadata as Record<string, unknown> | null) ?? {};
      await prisma.product.update({
        where: { id: prod.id },
        data: {
          areaM2: footprint.areaM2,
          thumbnail: p.thumbUrl,
          file3dUrl: glb ? p.meshUrl : prod.file3dUrl,
          metadata: {
            ...meta,
            widthM: footprint.bbox.lengthM,
            depthM: footprint.bbox.widthM,
            heightM: footprint.bbox.heightM || (meta.heightM as number | undefined) || 0.5,
          },
        },
      });
    }
  } catch (err) {
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    await prisma.asset.update({
      where: { id: assetId },
      data: { status: 'failed', error: message },
    });
  }
}

/** Boot recovery: job đang processing khi server chết -> failed để user upload lại. */
export async function recoverStuckAssets(): Promise<void> {
  await prisma.asset.updateMany({
    where: { status: { in: ['pending', 'processing'] } },
    data: { status: 'failed', error: 'Server restarted during conversion — upload lại file' },
  });
}
```

- [ ] **Step 4: Gắn converter thật vào routes/assets.ts**

Thêm vào cuối `server/routes/assets.ts` (sau `export default router;` KHÔNG được — đặt ngay sau khai báo `convertQueue`):
```ts
import { runConversion } from '../cad/convert.js';
setConverter(runConversion);
```
(Import đặt trên đầu file cùng các import khác; `setConverter(runConversion)` đặt ngay dưới khai báo `convertQueue`.)

- [ ] **Step 5: products route include asset**

Trong `server/routes/projects.ts` KHÔNG đổi. Trong `server/routes/products.ts`:
- handler `GET /` (list): thêm `include: { asset: true }` vào `findMany` (nếu đã có `include` thì merge).
- handler `GET /:id`: thêm `include: { asset: true }` tương tự.

- [ ] **Step 6: Boot recovery trong `server/index.ts`**

Sau khi import app, trước `listen`:
```ts
const { recoverStuckAssets } = await import('./cad/convert.js');
await recoverStuckAssets();
```

- [ ] **Step 7: Chạy test — PASS toàn bộ** (`npm test`)

- [ ] **Step 8: Commit**

```powershell
git add floor-manager/server/cad/convert.ts floor-manager/server/routes/assets.ts floor-manager/server/routes/products.ts floor-manager/server/index.ts floor-manager/tests/assets.test.ts
git commit -m "feat: conversion dispatcher wired to queue, product auto-update, boot recovery"
```

---

### Task 11: Frontend api.ts + productCatalog (footprint, status, file3dUrl)

**Files:**
- Modify: `floor-manager-web/src/lib/services/api.ts`
- Modify: `floor-manager-web/src/lib/data/furnitureCatalog.ts` (interface FurnitureDef)
- Modify: `floor-manager-web/src/lib/stores/productCatalog.ts`

- [ ] **Step 1: api.ts**

Đọc file trước. Thêm export cạnh `API_BASE` (tên biến base hiện có — đọc file để lấy đúng tên; giả định `API_BASE = 'http://localhost:4000/api'`):
```ts
export const FILES_BASE = API_BASE.replace(/\/api$/, '');
```

Thêm interface (sau `ApiProduct`):
```ts
export interface ApiAsset {
	id: string;
	fileName: string;
	fileType: string;
	status: 'pending' | 'processing' | 'ready' | 'failed';
	error: string | null;
	unitScale: number;
	bboxLengthM: number | null;
	bboxWidthM: number | null;
	bboxHeightM: number | null;
	areaM2: number | null;
	createdAt: string;
	footprintUrl: string | null;
	meshUrl: string | null;
	thumbUrl: string | null;
}
```

Trong `ApiProduct` thêm 2 field:
```ts
	assetId: string | null;
	asset?: ApiAsset | null;
```

Thêm nhóm `assets` vào object `api` (upload dùng FormData — KHÔNG đi qua helper `http()` vì helper set Content-Type JSON; viết fetch riêng):
```ts
	assets: {
		get: (id: string) => http<ApiAsset>(`/assets/${id}`),
		remove: (id: string) => http<void>(`/assets/${id}`, { method: 'DELETE' }),
		upload: async (file: File, productId?: string, unitScale?: number): Promise<ApiAsset> => {
			const fd = new FormData();
			fd.append('file', file);
			if (productId) fd.append('productId', productId);
			if (unitScale) fd.append('unitScale', String(unitScale));
			const res = await fetch(`${API_BASE}/assets`, { method: 'POST', body: fd });
			if (!res.ok) throw new Error(`API POST /assets: ${res.status}`);
			return res.json();
		},
	},
```

- [ ] **Step 2: FurnitureDef (furnitureCatalog.ts)**

Interface `FurnitureDef` thêm các field optional (giữ nguyên field cũ):
```ts
	/** Footprint polygon (cm, canh tâm block) từ CAD asset — vẽ thay rect khi có */
	footprint?: [number, number][][];
	/** Trạng thái convert CAD của product (nếu có asset) */
	assetStatus?: 'pending' | 'processing' | 'ready' | 'failed';
	/** URL mesh.glb (đường dẫn tương đối backend) cho viewer 3D */
	file3dUrl?: string;
```

- [ ] **Step 3: productCatalog.ts**

Trong `productToDef(p: ApiProduct)` (dòng 9-23): thêm vào object trả về:
```ts
		assetStatus: p.asset?.status,
		file3dUrl: p.file3dUrl ?? undefined,
```

Trong `loadProductCatalog()`: sau khi `const products = await api.products.list();`, nạp footprint song song cho các product có asset ready:
```ts
	const defs = await Promise.all(
		products.map(async (p) => {
			const def = productToDef(p);
			if (p.asset?.status === 'ready' && p.asset.footprintUrl) {
				try {
					const res = await fetch(`${FILES_BASE}${p.asset.footprintUrl}`);
					if (res.ok) {
						const fp: { polygons: [number, number][][] } = await res.json();
						// mét -> cm
						def.footprint = fp.polygons.map((ring) =>
							ring.map(([x, y]) => [x * 100, y * 100] as [number, number])
						);
					}
				} catch {
					/* thiếu footprint -> vẽ rect như cũ */
				}
			}
			return def;
		})
	);
```
rồi set store bằng `defs` thay cho mảng map cũ. Import `FILES_BASE` từ api. Đọc kỹ phần set store hiện tại và giữ nguyên hành vi còn lại (merge với catalog tĩnh v.v. nếu có).

- [ ] **Step 4: svelte-check**

`npm run check` trong `floor-manager-web/` — 0 error.

- [ ] **Step 5: Commit**

```powershell
git add floor-manager-web/src/lib/services/api.ts floor-manager-web/src/lib/data/furnitureCatalog.ts floor-manager-web/src/lib/stores/productCatalog.ts
git commit -m "feat: frontend asset API and footprint-aware product catalog"
```

---

### Task 12: Trang Products — upload CAD + status chip + polling

**Files:**
- Modify: `floor-manager-web/src/routes/products/[projectId]/+page.svelte`

- [ ] **Step 1: Script — state + handlers**

Đọc file trước. Thêm vào script:
```ts
	import { onDestroy } from 'svelte';

	let uploadingFor = $state<string | null>(null);
	let uploadError = $state<string | null>(null);
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	async function uploadCad(product: ApiProduct, file: File) {
		uploadError = null;
		uploadingFor = product.id;
		try {
			// còn asset cũ thì xóa (upload lại = thay thế)
			if (product.assetId) {
				try { await api.assets.remove(product.assetId); } catch { /* asset có thể đã mất */ }
			}
			await api.assets.upload(file, product.id);
			await refresh();
			ensurePolling();
		} catch (e) {
			uploadError = `Upload thất bại: ${e instanceof Error ? e.message : e}`;
		} finally {
			uploadingFor = null;
		}
	}

	function onCadFileChange(product: ApiProduct, ev: Event) {
		const input = ev.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) uploadCad(product, file);
		input.value = '';
	}

	function ensurePolling() {
		if (pollTimer) return;
		pollTimer = setInterval(async () => {
			const busy = products.some(
				(p) => p.asset && (p.asset.status === 'pending' || p.asset.status === 'processing')
			);
			if (!busy) {
				clearInterval(pollTimer!);
				pollTimer = null;
				return;
			}
			await refresh();
		}, 2500);
	}

	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});
```
Sau `onMount(refresh)` (hoặc chỗ gọi refresh lần đầu) thêm `ensurePolling()` — gọi sau khi refresh xong lần đầu:
```ts
	onMount(async () => { await refresh(); ensurePolling(); });
```
(nếu file đang dùng `onMount(refresh)` thì thay bằng dạng trên).

- [ ] **Step 2: Bảng — thêm cột "CAD"**

Header: sau cột "Kích thước (m)" (trước cột Công đoạn) thêm `<th class="...">CAD</th>` (copy class các th hiện có).

Body row tương ứng:
```svelte
	<td class="px-3 py-2">
		{#if p.asset?.status === 'ready'}
			<span class="text-[11px] px-2 py-0.5 rounded-md bg-green-50 text-green-600 font-medium">✓ {p.asset.fileType.toUpperCase()}</span>
		{:else if p.asset?.status === 'failed'}
			<span class="text-[11px] px-2 py-0.5 rounded-md bg-red-50 text-red-600 font-medium" title={p.asset.error}>✗ Lỗi</span>
		{:else if p.asset}
			<span class="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 font-medium">⏳ Đang xử lý</span>
		{:else}
			<span class="text-[11px] text-gray-300">—</span>
		{/if}
	</td>
```

- [ ] **Step 3: Nút upload trong cột Actions**

Cạnh nút Edit/Delete của mỗi row thêm:
```svelte
	<label class="p-1.5 rounded-md text-gray-400 hover:text-blue-500 hover:bg-blue-50 cursor-pointer" title="Upload CAD (dwg, dxf, step, stp, ifc)">
		<input type="file" accept=".dwg,.dxf,.step,.stp,.ifc" class="hidden"
			onchange={(e) => onCadFileChange(p, e)} disabled={uploadingFor === p.id} />
		{#if uploadingFor === p.id}⏳{:else}📁{/if}
	</label>
```
(khớp style với các nút action hiện có — đọc markup thật rồi copy class.)

- [ ] **Step 4: Hiện lỗi upload** — dưới header trang (trên bảng):

```svelte
	{#if uploadError}
		<div class="mb-3 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{uploadError}</div>
	{/if}
```

- [ ] **Step 5: svelte-check** — 0 error. Kiểm tra tay nhanh: chạy backend + frontend, upload `tests/fixtures/box.dxf` cho 1 product → chip chuyển ⏳ → ✓ DXF (poll), areaM2 và kích thước của product tự cập nhật 4×2.

- [ ] **Step 6: Commit**

```powershell
git add floor-manager-web/src/routes/products/
git commit -m "feat: CAD upload with conversion status on products page"
```

---

### Task 13: Editor 2D vẽ footprint + BuildPanel khóa block chưa ready

**Files:**
- Modify: `floor-manager-web/src/lib/utils/canvasRenderer.ts` (thêm `drawFootprint`)
- Modify: `floor-manager-web/src/lib/components/editor/FloorPlanCanvas.svelte` (gọi khi có footprint)
- Modify: `floor-manager-web/src/lib/components/sidebar/BuildPanel.svelte` (disable khi asset chưa ready)

- [ ] **Step 1: `drawFootprint` trong canvasRenderer.ts**

Thêm export:
```ts
/**
 * Vẽ footprint polygon (cm, canh tâm 0,0) — ctx đã translate về tâm block và rotate sẵn.
 * scale: px trên cm (cùng scale mà block rect đang dùng).
 */
export function drawFootprint(
	ctx: CanvasRenderingContext2D,
	footprint: [number, number][][],
	scale: number,
	color: string,
	selected: boolean
): void {
	ctx.beginPath();
	for (const ring of footprint) {
		ring.forEach(([x, y], i) => {
			const px = x * scale;
			const py = -y * scale; // trục y canvas hướng xuống
			if (i === 0) ctx.moveTo(px, py);
			else ctx.lineTo(px, py);
		});
		ctx.closePath();
	}
	ctx.fillStyle = color;
	ctx.globalAlpha = 0.85;
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.strokeStyle = selected ? '#2563eb' : '#1e293b';
	ctx.lineWidth = selected ? 2 : 1;
	ctx.stroke();
}
```

- [ ] **Step 2: FloorPlanCanvas gọi drawFootprint**

Đọc block vẽ furniture (quanh dòng 906-987, chỗ đã `translate`/`rotate` rồi gọi `drawFurnitureIcon`). Trước lời gọi `drawFurnitureIcon(...)` thêm nhánh:
```ts
	const def = getCatalogItem(item.catalogId); // hàm lấy def đã có sẵn trong file/import — đọc code thật
	const orientation = (item as { orientation?: string }).orientation ?? 'bottom';
	if (def?.footprint && orientation === 'bottom') {
		drawFootprint(ctx, def.footprint, csScale, item.color ?? def.color, selected);
	} else {
		// đường vẽ cũ (drawFurnitureIcon / rect)
	}
```
trong đó `csScale` là hệ số px/cm mà code vẽ rect hiện tại dùng (đọc từ hàm `getCS()`/biến scale hiện có — dùng đúng biến đó). Import `drawFootprint` từ canvasRenderer. Nếu cấu trúc thực tế khác mô tả (ví dụ scale đã áp vào transform), điều chỉnh cho khớp — footprint đơn vị cm nên nếu ctx đã scale theo cm thì truyền `scale = 1`. Kiểm tra bằng mắt ở Step 5.

Lưu ý orientation ≠ 'bottom' (block dựng nghiêng/đứng): footprint gốc không còn đúng → giữ rect cũ (đã xử lý bằng điều kiện trên).

- [ ] **Step 3: BuildPanel disable khi chưa ready**

Trong nút/item catalog (chỗ `onFurnitureClick(item)`): 
```svelte
	{@const notReady = item.assetStatus && item.assetStatus !== 'ready'}
	<button ... disabled={notReady} class="... {notReady ? 'opacity-40 cursor-not-allowed' : ''}"
		onclick={() => { if (!notReady) onFurnitureClick(item); }}>
		...
		{#if item.assetStatus === 'failed'}
			<span class="text-[10px] text-red-500">CAD lỗi</span>
		{:else if notReady}
			<span class="text-[10px] text-amber-500">Đang convert…</span>
		{/if}
	</button>
```
(Đọc markup thật của item và chèn tối thiểu — product KHÔNG có asset vẫn kéo bình thường.)

- [ ] **Step 4: svelte-check** — 0 error.

- [ ] **Step 5: Kiểm tra tay**: mở editor layout, product có asset DXF ready → block vẽ đúng hình chữ nhật 4×2m theo footprint (thử cả xoay); product không asset → rect như cũ.

- [ ] **Step 6: Commit**

```powershell
git add floor-manager-web/src/lib/utils/canvasRenderer.ts floor-manager-web/src/lib/components/editor/FloorPlanCanvas.svelte floor-manager-web/src/lib/components/sidebar/BuildPanel.svelte
git commit -m "feat: editor draws real CAD footprints, locks unconverted blocks"
```

---

### Task 14: Viewer 3D load mesh.glb theo product

**Files:**
- Modify: `floor-manager-web/src/lib/utils/furnitureModelLoader.ts`

- [ ] **Step 1: Ưu tiên file3dUrl của product**

Trong `createFurnitureModelWithGLB(catalogId, def, onLoad)` (dòng ~255): trước khi tra `MODEL_MAP`, thêm nhánh:
```ts
	import { FILES_BASE } from '$lib/services/api';
	// ...
	const defWithUrl = def as typeof def & { file3dUrl?: string };
	if (defWithUrl.file3dUrl) {
		const url = defWithUrl.file3dUrl.startsWith('http')
			? defWithUrl.file3dUrl
			: `${FILES_BASE}${defWithUrl.file3dUrl}`;
		// dùng cùng cơ chế load + scaleToFit như MODEL_MAP hiện có:
		loadGlbInto(group, url, def, onLoad); // tên hàm nội bộ thực tế — đọc code, tái dùng đường load hiện có
		return group;
	}
```
Đọc kỹ hàm hiện tại: nó tạo model procedural trước rồi thay bằng GLB khi load xong — giữ nguyên cơ chế đó, chỉ đổi URL nguồn (`/models/...` → `FILES_BASE + file3dUrl`) và vẫn `scaleToFit()` theo def.width/depth/height (cm). Nếu hàm load nội bộ không tách riêng được, nhân bản tối thiểu logic loader.load(...) cho nhánh này.

- [ ] **Step 2: svelte-check** — 0 error.

- [ ] **Step 3: Kiểm tra tay** (cần fixture STEP thật từ user): upload STEP → ready → mở editor → chuyển chế độ 3D → block hiện mesh CAD thay vì hộp. Nếu chưa có file STEP thật: kiểm tra bằng DXF (không mesh → vẫn hộp như cũ, không lỗi console) và ghi chú lại.

- [ ] **Step 4: Commit**

```powershell
git add floor-manager-web/src/lib/utils/furnitureModelLoader.ts
git commit -m "feat: 3D viewer loads converted CAD mesh per product"
```

---

### Task 15: Kiểm tra tổng thể & hoàn tất

- [ ] **Step 1: Backend**: `npm test` (toàn bộ pass — kể cả các test skip có lý do rõ), `npm run typecheck` (sạch).

- [ ] **Step 2: Frontend**: `npm run check` (0 error), `npm run build` (thành công).

- [ ] **Step 3: E2E tay (backend + frontend chạy dev):**

1. Trang Products: upload `floor-manager/tests/fixtures/box.dxf` cho 1 product → chip ⏳ → ✓ DXF; kích thước product tự thành 4×2, areaM2=8.
2. Mở editor → kéo block đó vào layout → thấy footprint chữ nhật 4×2m (không phải rect mặc định 2×2), xoay OK.
3. Upload file rác đuôi .dxf → chip ✗ Lỗi với tooltip message; upload lại file đúng → ✓.
4. (Nếu có file STEP thật) upload STEP → ✓ STEP; 3D hiện mesh; footprint là silhouette thật.
5. Xóa product có asset → không lỗi; DELETE asset qua UI upload-lại hoạt động.
6. Restart backend giữa lúc đang convert (nếu bắt được) hoặc xác nhận `recoverStuckAssets` chạy khi boot (log/DB: pending/processing → failed).

Bước nào sai → sửa trước khi sang bước tiếp.

- [ ] **Step 4: README** — thêm mục "Import CAD" ngắn: định dạng hỗ trợ, DWG cần `ODA_CONVERTER_PATH`, artifact nằm `uploads/assets/`, file gốc nằm `storage/sources/` (không public), fixture test STEP/IFC là opt-in.

```powershell
git add README.md
git commit -m "docs: CAD import usage and ODA converter configuration"
```

---

## Self-review đã chạy

- **Spec coverage:** upload các định dạng dwg/dxf/step/stp/ifc ✅ (Task 5-10); artifact chuẩn hóa footprint+glb+thumb ✅ (Task 2,3,10); queue concurrency 2 + status ✅ (Task 4,10); UI trạng thái convert + chỉ block ready kéo được ✅ (Task 12,13); editor 2D dùng polygon thật ✅ (Task 13); 3D dùng mesh.glb ✅ (Task 14); diện tích footprint đổ vào areaM2 dùng cho báo cáo ✅ (Task 10). Import nền layout: hoãn có chủ đích (ghi ở đầu plan).
- **Type consistency:** `CadMesh`/`Footprint`/`Ring` định nghĩa 1 lần ở geometry.ts, các task sau import từ đó; `assetPaths` dùng chung route + convert + test.
- **Placeholder scan:** các chỗ "đọc code thật rồi khớp" là chỉ dẫn thích nghi có giới hạn cho file frontend lớn (FloorPlanCanvas/ThreeViewer/furnitureModelLoader) kèm điều kiện chấp nhận rõ ràng — không phải TBD logic.
