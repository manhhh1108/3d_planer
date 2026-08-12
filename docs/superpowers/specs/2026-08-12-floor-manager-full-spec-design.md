# Floor Manager — Spec tổng thể theo yêu cầu khách hàng

Ngày: 2026-08-12
Trạng thái: Đã duyệt design qua brainstorming, chờ user review file spec.

## 1. Bối cảnh & yêu cầu khách hàng

Hệ thống quản lý mặt bằng nhà máy cho các block kết cấu thép lớn (đa phần đã có sẵn file 3D CAD). Yêu cầu KH cung cấp (nguyên văn tóm tắt):

- Nhập file 3D/2D của sản phẩm và layout: **DWG, STEP/STP, IFC** — mỗi block 1 file.
- Kéo thả block trên web, **lưu vị trí theo ngày**.
- Thuộc tính block: khối lượng, diện tích, công đoạn gia công...
- **Xuất mặt bằng ra PDF**.
- Báo cáo sử dụng mặt bằng theo **công đoạn, diện tích, thời gian chiếm dụng**.
- Tối đa **50 người truy cập đồng thời**.
- Layout **gộp sản phẩm của nhiều dự án** vào chung 1 mặt bằng (đã chốt: CÓ).
- 3 role: **admin** (toàn quyền) — **planning** (import, sắp xếp, tạo thông tin) — **viewer** (chỉ xem, comment trên layout).
- **Tạo thêm layout**: các mặt bằng cần kiểm soát có thể tăng (nhà máy khác, kho bãi thuê thêm).

### Hiện trạng (nhánh main, 2026-08-12)

- Frontend Svelte 5 (`floor-manager-web/`), backend Express + Prisma + Postgres (`floor-manager/`).
- Đã có: kéo thả block, snapshot theo ngày, thuộc tính block (weightKg, areaM2, processStage), dashboard project/products/reports, block flip theo mặt tiếp sàn.
- Chưa có: import CAD, auth/roles, comment, layout độc lập với project, báo cáo thời gian chiếm dụng, PDF hoàn thiện (thiếu font Việt).
- Quy ước: editor dùng cm, backend dùng mét, quy đổi ở `floor-manager-web/src/lib/services/mapping.ts`.

## 2. Các quyết định đã chốt

| Vấn đề | Quyết định |
|---|---|
| Layout ↔ Project | Layout độc lập, thuộc `Site`; 1 layout chứa block của nhiều project |
| Auth | Tài khoản nội bộ (email + mật khẩu), admin tạo tài khoản; có thể nâng cấp SSO sau |
| DWG | Convert trên server bằng ODA File Converter → DXF → parse |
| Kiến trúc import CAD | Phương án A: server xử lý toàn bộ, convert 1 lần thành artifact chuẩn hóa |
| Deploy | Server nội bộ trong LAN nhà máy, đóng gói docker-compose |
| Ưu tiên | Data model trước → Import CAD → Auth → phần còn lại |

## 3. Data model (Prisma)

Thay đổi so với schema hiện tại:

```
User        id, email (unique), passwordHash, name, role (ADMIN|PLANNING|VIEWER), active, createdAt
Site        id, name, address?, active, createdAt          // mặt bằng vật lý: xưởng A, kho thuê B...
Layout      siteId (thay projectId), name, widthM, heightM, backgroundFile?, gridSize
Project     giữ nguyên — KHÔNG còn quan hệ với Layout
Product     giữ projectId; thêm assetId? → Asset
Asset       id, fileName, fileType (dwg|dxf|step|stp|ifc), status (pending|processing|ready|failed),
            error?, sourcePath, footprintPath?, meshPath?, thumbnailPath?,
            bboxLengthM?, bboxWidthM?, bboxHeightM?, createdBy → User, createdAt
Snapshot    giữ nguyên (layoutId + date, unique); createdBy → User
Position    giữ nguyên (snapshotId, productId, x, y, rotation, scale, orientation)
Comment     id, layoutId, x, y, body, authorId → User, parentId? (thread), resolvedAt?, resolvedBy?, createdAt
```

- Vì Product thuộc Project còn Snapshot thuộc Layout (độc lập), một snapshot tự nhiên chứa position của block từ nhiều project → đạt yêu cầu gộp.
- Báo cáo theo dự án vẫn hoạt động: Position → Product → Project.

**Migration:** tạo 1 `Site` mặc định ("Nhà máy chính"), gán mọi Layout hiện có vào đó; bỏ cột `layouts.project_id`. Dữ liệu snapshot/position không đổi.

## 4. Pipeline import CAD (server-side)

```
Upload (multipart, giới hạn ~200MB) → uploads/assets/<assetId>/source.<ext>
  → job queue trong process (concurrency 2), Asset.status: pending → processing → ready|failed
     DWG  → ODA File Converter (container converter) → DXF
     DXF  → dxf-parser → entities → footprint polygon 2D
     STEP → occt-import-js (WASM trên Node) → mesh → glTF (.glb) + chiếu mesh xuống mặt sàn → footprint polygon
     IFC  → web-ifc (Node) → mesh → glTF + footprint (như STEP)
  → thumbnail: render offscreen (three.js + headless-gl) hoặc SVG từ footprint (fallback)
  → đọc kích thước bao, chuẩn hóa đơn vị về MÉT tại backend
```

Artifact mỗi asset: `source.<ext>` (gốc, không bao giờ gửi client), `footprint.json`, `mesh.glb`, `thumb.png`.

- Editor 2D vẽ bằng `footprint.json` (polygon thật, không phải bounding box — block có phần nhô ra); viewer 3D tải `mesh.glb`.
- Footprint dùng để tính diện tích chiếm dụng trong báo cáo.
- Trang Products hiển thị trạng thái convert; chỉ block `ready` mới kéo vào layout được. Convert lỗi hiển thị `error` và cho upload lại.
- Import layout nền (bản vẽ mặt bằng DWG/DXF): cùng pipeline, kết quả gán vào `Layout.backgroundFile` dạng SVG/geometry để vẽ nền.

## 5. Auth & phân quyền

- Email + mật khẩu (bcrypt), JWT ngắn hạn trong cookie httpOnly, refresh khi hết hạn. Admin tạo tài khoản, đặt lại mật khẩu, gán role, khóa tài khoản (`active=false`).
- Kiểm tra quyền bằng middleware backend trên mọi route (không chỉ ẩn nút UI). Frontend chưa đăng nhập → `/login`.

| Hành động | Admin | Planning | Viewer |
|---|---|---|---|
| Quản lý user, site | ✅ | ❌ | ❌ |
| Import CAD, tạo project/product/layout | ✅ | ✅ | ❌ |
| Kéo thả, lưu snapshot | ✅ | ✅ | ❌ |
| Xem layout, timeline, báo cáo, xuất PDF | ✅ | ✅ | ✅ |
| Comment trên layout | ✅ | ✅ | ✅ |

## 6. Comment trên layout

- Ghim comment tại tọa độ (x, y) trên layout — nút "Ghim comment" hoặc chuột phải. Bong bóng đánh số trên canvas.
- Panel bên liệt kê comment, trả lời theo thread (`parentId`), đánh dấu đã xử lý (tác giả hoặc planning/admin).
- Comment thuộc **layout**, không thuộc snapshot ngày → hiển thị ở mọi ngày (là trao đổi về mặt bằng, không phải về 1 ngày cụ thể).

## 7. Báo cáo

Trang Reports làm lại, phạm vi chọn: site/layout + khoảng ngày. Nguồn dữ liệu: chuỗi snapshot theo ngày.

1. **Theo công đoạn:** tổng diện tích chiếm dụng nhóm theo `processStage` từng ngày (stacked bar chart).
2. **Theo diện tích:** % sử dụng = Σ diện tích footprint các block / diện tích layout, theo ngày; ngưỡng cảnh báo mặc định 80% (cấu hình được).
3. **Thời gian chiếm dụng:** mỗi block — ngày đầu xuất hiện → ngày cuối trên layout (suy từ chuỗi snapshot), tổng số ngày chiếm dụng; bảng chi tiết + xuất CSV/Excel.

Diện tích tính bằng footprint polygon (kể cả phần xoay/flip theo `orientation`).

## 8. Xuất PDF

- Xuất mặt bằng của ngày đang xem: bản vẽ 2D (SVG → PDF, giữ tỷ lệ), khung tên (site/layout, ngày snapshot, người xuất, ngày xuất), bảng kê block (mã, tên, dự án, công đoạn, khối lượng, diện tích).
- Nhúng font Việt (Noto Sans) — sửa dứt điểm lỗi hiển thị tiếng Việt.

## 9. Triển khai

`docker-compose` gồm: `web` (SvelteKit build + nginx), `api` (Express), `postgres`, `converter` (image chứa ODA File Converter + occt, nhận job qua API nội bộ). Volume bền vững cho `uploads/` và data Postgres.

50 user đồng thời chủ yếu đọc — Express + Postgres đáp ứng tốt; convert CAD chạy hàng đợi nền, không chặn request. Kiểm thử tải trước khi bàn giao.

## 10. Roadmap

| Giai đoạn | Nội dung | Ghi chú |
|---|---|---|
| 1 | Tái cấu trúc data model (Site, Layout độc lập, migration) + UI quản lý site/layout | nền tảng, làm trước |
| 2 | Pipeline import CAD: STEP trước → DXF/DWG → IFC + UI trạng thái convert | rủi ro kỹ thuật cao nhất |
| 3 | Auth + 3 role + trang quản lý user | |
| 4 | Comment trên layout | |
| 5 | Báo cáo (công đoạn, diện tích, thời gian chiếm dụng) + xuất CSV/Excel | |
| 6 | PDF hoàn thiện (font Việt, khung tên, bảng kê) | |
| 7 | Docker hóa + kiểm thử tải 50 user | |

Mỗi giai đoạn sẽ có plan triển khai chi tiết riêng (docs/superpowers/plans/) khi bắt đầu.

## Ngoài phạm vi (YAGNI)

- SSO/Entra ID (thiết kế không chặn đường nâng cấp, nhưng chưa làm).
- Realtime cùng chỉnh sửa 1 layout (chỉ cần cảnh báo "người khác vừa lưu" nếu phát sinh xung đột).
- Phiên bản hóa file CAD (mỗi product 1 asset hiện hành; upload lại là thay thế).
- Notification/email.
