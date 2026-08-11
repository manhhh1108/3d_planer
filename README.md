# Floor Manager

Web app quản lý mặt bằng sản xuất / bãi chứa kết cấu: kéo thả block sản phẩm lên layout 2D, lưu snapshot vị trí theo ngày, xem 3D, báo cáo chiếm dụng mặt bằng (m² × ngày), xuất PDF.

## Cấu trúc

```
floor-manager-web/   Frontend — SvelteKit + Tailwind + Three.js
                     (fork từ open3dFloorplan, MIT — đã gỡ tính năng nhà ở)
floor-manager/       Backend — Express + Prisma + PostgreSQL
  server/            API routes: projects, products, layouts, snapshots, reports, files
  prisma/            schema.prisma
  docker-compose.yml PostgreSQL + Redis
docs/superpowers/    Design specs + implementation plans
mockups/             Wireframe HTML (tham khảo theme)
references/          Repo tham khảo (react-planner, open3dFloorplan, ej2)
```

## Chạy dev

```bash
# 1. Database
cd floor-manager
docker compose up -d postgres
# tạo .env nếu chưa có:
#   DATABASE_URL="postgresql://floormanager:floormanager123@localhost:5432/floormanager"
#   PORT=4000
npx prisma db push && npx prisma generate

# 2. Backend (port 4000)
npm install
npm run server

# 3. Frontend (port 5173)
cd ../floor-manager-web
npm install
npm run dev
```

Mở http://localhost:5173 → tạo dự án → thêm sản phẩm → tạo mặt bằng → kéo thả block → "Lưu Snapshot".

## Khái niệm chính

- **Product**: sản phẩm/thiết bị (mã, khối lượng, diện tích, công đoạn, màu, kích thước block)
- **Layout**: mặt bằng (bãi, xưởng) — kích thước mét, grid
- **Snapshot**: toàn bộ vị trí block của một layout tại một ngày (`@@unique(layoutId, date)`)
- Đơn vị: editor dùng **cm**, backend dùng **mét** — quy đổi ở `floor-manager-web/src/lib/services/mapping.ts`
- Xem ngày cũ trên timeline = chỉ đọc (không ghi đè snapshot hôm nay)

## Chưa làm (theo spec)

- Import CAD: DWG→SVG background, STEP/IFC→glTF (pipeline BullMQ — xem `docs/superpowers/specs/2026-08-10-floor-manager-design.md`)
- SharePoint integration, phân quyền người dùng
- Font tiếng Việt có dấu trong PDF export
