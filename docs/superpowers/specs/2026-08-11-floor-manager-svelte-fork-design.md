# Floor Manager v2 - Fork open3dFloorplan Design Spec

> Thay the spec kien truc frontend trong `2026-08-10-floor-manager-design.md`.
> Data model, backend API, nghiep vu (snapshot, bao cao, CAD pipeline) van giu theo spec cu.

## Quyet dinh

Fork `references/open3dFloorplan` (MIT license) lam frontend moi, thay the frontend React + Konva hien tai (~1.400 dong, muc do khung suon). Backend Express + Prisma + PostgreSQL **giu nguyen**.

Ly do:
- Editor 2D (canvas pan/zoom/snap/grid ~5.000 LOC), undo/redo coalescing, drag/xoay/scale, chuyen 2D/3D da hoan thien va generic (khong dinh logic tuong/phong)
- Firebase chi dung cho analytics, go de dang; persistence qua interface `DataStore` (~100 LOC) de thay bang REST
- Catalog mo rong duoc: block san pham = 1 entry catalog + 1 ham BoxGeometry

## Kien truc moi

```
SvelteKit SPA (fork open3dFloorplan)
  ├── 2D Editor (Canvas 2D - FloorPlanCanvas.svelte)
  ├── 3D Viewer (Three.js - ThreeViewer.svelte)
  ├── Dashboard / Products / Reports (Svelte + Tailwind 4)
        │ REST API (fetch, qua DataStore interface)
        ▼
Node.js / Express (giu nguyen server/ hien tai)
        ▼
PostgreSQL (Prisma ORM, giu nguyen schema)
```

Tech stack frontend: Svelte 5, SvelteKit 2, Tailwind CSS 4, Three.js, Vite 7.

## Pham vi fork

### Bo (tinh nang nha o - xoa ngay khi fork)
- Tuong/cua/cua so/cau thang/cot: tools, rendering, hit-testing, types
- Room detection, room/house templates, room presets
- Catalog noi that 80+ mon, entourage, material/texture (materials.ts, textureGenerator.ts)
- ElevationView, PrintLayout, MaterialPicker, AreaSummaryPanel
- Firebase (firebase.ts, RoomPlan capture import)
- versionHistory, aiKeys

### Giu (dung ngay, khong doi)
- Canvas 2D: pan/zoom/snap/grid/drag (FloorPlanCanvas.svelte, canvasInteraction.ts, canvasRenderer.ts phan generic)
- Undo/redo coalescing (project.ts), UndoHistoryPanel
- 3D viewer co ban: scene, camera, orbit, dat block tren san
- BuildPanel/PropertiesPanel/LayersPanel/TopBar (don gian hoa)
- saveStatus (auto-save debounce 5s), settings (don vi, snap), theme

### Sua / noi backend
- `models/types.ts`: Floor -> Layout (width_m, height_m, background), FurnitureItem -> ProductPlacement
- `services/datastore.ts`: thay localStorage bang REST client goi backend hien co
  - Interface giu nguyen: save/load/list/delete/duplicate/thumbnail
- `furnitureCatalog.ts` -> product catalog load tu API (`GET /api/projects/:id/products`)
- `furnitureModels3d.ts`: block san pham = BoxGeometry theo width/depth/height + mau

### Them moi (scale sau, theo thu tu uu tien)
1. **Snapshot theo ngay + Timeline bar**: luu Position qua `POST /api/snapshots`, timeline chon ngay xem lai (port tu spec cu)
2. **Quan ly san pham**: trang CRUD san pham (ten, ma, KL, DT, cong doan, mau) noi voi `/api/products`
3. **Dashboard du an**: danh sach du an tu `/api/projects`
4. **Bao cao + xuat PDF**: 3 bao cao theo spec cu (tong hop, theo cong doan, m2 x ngay); jsPDF da co san trong fork
5. **Import CAD**: DWG->SVG background, STEP->glTF (BullMQ worker, theo spec cu - chua lam o giai doan nay)

## Cau truc thu muc

```
floor-manager-web/          # fork open3dFloorplan (frontend moi)
  src/lib/...               # giu cau truc goc
  src/routes/
    +page.svelte            # Dashboard du an
    editor/+page.svelte     # Layout editor (2D/3D)
    products/+page.svelte   # Quan ly san pham (them moi)
    reports/+page.svelte    # Bao cao (them moi)
floor-manager/server/       # backend giu nguyen
floor-manager/prisma/       # schema giu nguyen
floor-manager/src/          # frontend React cu - XOA sau khi fork chay on dinh
```

## Mapping data model

| open3dFloorplan | Floor Manager | Ghi chu |
|---|---|---|
| Project | Project | giu id/name, them description |
| Floor | Layout | width_m/height_m thay vi tuong bao; background = SVG tu DWG |
| FurnitureItem | Position (cua Product) | position/rotation giu; catalogId -> productId |
| FurnitureDef (catalog) | Product | load tu DB thay vi hardcode; width/depth tu area_m2 hoac file CAD |
| (khong co) | Snapshot | tap hop Position theo ngay - them moi |

Don vi: open3dFloorplan dung **cm**, Floor Manager dung **met** -> quy doi o tang API client (x100 khi vao editor, /100 khi luu).

## Trang thai luu

- Editor thao tac tren state in-memory (store Svelte) nhu goc
- Auto-save debounce 5s va nut "Luu Snapshot" deu goi `POST /api/snapshots` (upsert theo layoutId+date) chot vi tri cho ngay hom nay — khong can endpoint moi
- Chon ngay tren timeline -> load Position cua snapshot do o che do read-only

## UI Theme

Giu nguyen theme goc cua open3dFloorplan (da chon lam chuan o mockup):
top bar slate gradient, panel trang, accent xanh #2563eb, Tailwind.
Mockup tham khao: `mockups/index.html`.

## Khong lam o giai doan nay

- Phan quyen nguoi dung
- SharePoint integration
- Import CAD (DWG/STEP/IFC) - de giai doan sau, theo pipeline trong spec cu
- Mobile/responsive (giu nguyen kha nang co san cua fork, khong toi uu them)
