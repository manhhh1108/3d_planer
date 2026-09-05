# Floor Manager

Web app quản lý mặt bằng sản xuất / bãi chứa kết cấu: kéo thả block sản phẩm lên layout 2D, lưu snapshot vị trí theo ngày, xem 3D, báo cáo chiếm dụng mặt bằng (m² × ngày), xuất PDF.

## Cấu trúc

```
floor-manager-web/   Frontend — SvelteKit + Tailwind + Three.js
                     (fork từ open3dFloorplan, MIT — đã gỡ tính năng nhà ở)
floor-manager/       Backend — Express + Prisma + PostgreSQL
  server/            API routes: sites, projects, products, layouts, snapshots, reports, files
  prisma/            schema.prisma
  tests/             Integration tests (vitest + supertest, DB floormanager_test)
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
npx prisma migrate deploy && npx prisma generate
# DB cũ đã tạo bằng `prisma db push` (chưa có bảng _prisma_migrations):
# baseline init trước rồi mới deploy để migration backfill Site chạy được:
#   npx prisma migrate resolve --applied 20260810145925_init
#   npx prisma migrate deploy

# 2. Backend (port 4000)
npm install
npm run server

# 3. Frontend (port 5173)
cd ../floor-manager-web
npm install
npm run dev
```

Mở http://localhost:5173 → tạo mặt bằng (site) → tạo layout → tạo dự án + sản phẩm → kéo thả block → "Lưu Snapshot".

## Test

| Lệnh | Ở đâu | Kiểm gì |
|---|---|---|
| `npm test` | `floor-manager/` | API + hội tụ dữ liệu (vitest + supertest, DB `floormanager_test`, tự migrate) |
| `npm test` | `floor-manager-web/` | Hàm thuần: hình học vùng, va chạm, biên dạng, quy tắc màu |
| `npm run test:e2e` | `floor-manager-web/` | Giao diện thật qua Playwright — xem bên dưới |

E2E tự dựng backend riêng ở cổng 4300 trên DB `floormanager_e2e` và web ở cổng
5273, nên không đụng vào DB dev lẫn DB test. Dữ liệu do `floor-manager/scripts/e2eSeed.ts`
dựng lại từ đầu mỗi lần chạy. Cần Postgres đang chạy và `npx playwright install chromium`
một lần.

Đọc màu trên canvas là cách duy nhất kiểm được "block đổi màu theo công đoạn" và
"cảnh báo va chạm": canvas 2D so trực tiếp mã màu, còn 3D so TÔNG MÀU vì ánh sáng
và tone mapping làm mã màu lệch xa màu gốc. Mỗi khẳng định đều dựng hai mặt bằng
chỉ khác nhau đúng một điểm rồi so hai trạng thái, thay vì bám vào một ngưỡng
số pixel tuyệt đối.


## Khái niệm chính

- **Site**: cơ sở vật lý (nhà máy, kho bãi thuê) — chứa các Layout; có thể thêm site mới khi mở rộng
- **Layout**: mặt bằng (bãi, xưởng) thuộc một Site — kích thước mét, grid; layout độc lập với dự án
- **Project**: dự án/đơn hàng — chỉ chứa danh sách Product (không sở hữu layout)
- **Product**: sản phẩm/thiết bị (mã, khối lượng, diện tích, công đoạn, màu, kích thước block)
- **Snapshot**: toàn bộ vị trí block của một layout tại một ngày (`@@unique(layoutId, date)`) — một snapshot có thể chứa block của NHIỀU dự án
- Báo cáo chiếm dụng lọc theo dự án của product (`?projectId=`) hoặc theo layout (`?layoutId=`), mỗi dòng kèm `projectName`
- Đơn vị: editor dùng **cm**, backend dùng **mét** — quy đổi ở `floor-manager-web/src/lib/services/mapping.ts`
- Xem ngày cũ trên timeline = chỉ đọc (không ghi đè snapshot hôm nay)

## Chưa làm (theo spec)

- Import CAD: DWG→SVG background, STEP/IFC→glTF (pipeline BullMQ — xem `docs/superpowers/specs/2026-08-10-floor-manager-design.md`)
- SharePoint integration, phân quyền người dùng
- Font tiếng Việt có dấu trong PDF export
