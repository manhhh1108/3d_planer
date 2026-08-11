# floor-manager-web

Frontend của **Floor Manager** — quản lý mặt bằng sản xuất / bãi chứa kết cấu thép.

Fork từ [open3dFloorplan](https://github.com/theLodgeBots/open3dFloorplan) (MIT), đã gỡ các tính năng thiết kế nhà ở và nối với backend Express/Prisma (`../floor-manager`).

## Chạy dev

```bash
npm install
npm run dev        # http://localhost:5173 (cần backend chạy ở :4000)
```

Build production: `npm run build` → `npm run preview` (http://localhost:4173).

Cấu hình API endpoint qua env `VITE_API_URL` (mặc định `http://localhost:4000/api`).

## Cấu trúc chính

```
src/routes/
  +page.svelte              Dashboard dự án
  project/[id]/             Danh sách mặt bằng của dự án
  products/[projectId]/     CRUD sản phẩm
  reports/[projectId]/      Báo cáo (tổng hợp / công đoạn / m² × ngày) + PDF
  editor/                   Layout editor 2D/3D (?layoutId=...)
src/lib/
  components/editor/        FloorPlanCanvas (canvas 2D), TimelineBar (snapshot theo ngày)
  components/viewer3d/      ThreeViewer (block 3D)
  services/api.ts           REST client
  services/mapping.ts       Quy đổi mét (backend) ↔ cm (editor)
  services/datastore.ts     backendStore: save = upsert snapshot hôm nay
  stores/productCatalog.ts  Catalog block sản phẩm nạp từ API
  stores/timeline.ts        Chế độ xem lại snapshot (read-only)
```

Xem README ở thư mục gốc repo để biết cách chạy toàn bộ hệ thống.
