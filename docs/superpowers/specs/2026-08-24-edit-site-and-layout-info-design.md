# Sửa thông tin mặt bằng và layout trên trang `/site/[id]`

Ngày: 2026-08-24

## Bối cảnh

Trang `/site/[id]` cho tạo/xoá layout và import nền DXF, nhưng không sửa được
thông tin nào: tên/địa chỉ mặt bằng không có chỗ sửa ở bất kỳ trang nào (trang
chủ chỉ tạo và xoá), tên/kích thước layout cũng vậy.

`api.sites.update` và `api.layouts.update` đã có sẵn, backend nhận PUT đầy đủ.
Đây là việc thuần frontend.

## Phạm vi

- Sửa mặt bằng: `name`, `address`, `active`.
- Sửa layout: `name`, `widthM`, `heightM`.
- Chỉ `$isAdmin`, cùng quyền với nút thêm/xoá layout đang dùng.
- Không sửa backend.
- Ngoài phạm vi: đổi nền DXF (đã có), di chuyển layout sang mặt bằng khác,
  tự động dời block khi thu nhỏ layout.

## Thiết kế

### Header mặt bằng

Nút bút chì cạnh `🏭 {site.name}`, chỉ hiện khi `$isAdmin`. Mở modal
"Sửa mặt bằng" với: Tên * / Địa chỉ / checkbox "Đang hoạt động".
Lưu → `api.sites.update(siteId, {...})` → `refresh()`.

### Thẻ layout

Nút bút chì cạnh nút xoá ở góc phải thẻ, cùng kiểu hiện-khi-hover.

Modal "Thêm layout" hiện có được dùng lại cho cả sửa, theo pattern `editingId`
của trang sản phẩm:

- `editingLayoutId: string | null` quyết định tiêu đề ("Thêm layout" /
  "Sửa layout") và nhãn nút ("Tạo & mở editor" / "Lưu thay đổi").
- Tạo mới: giữ nguyên hành vi cũ — tạo xong `goto` sang editor.
- Sửa: `api.layouts.update` → đóng modal → `refresh()`, không điều hướng.

### Cảnh báo thu nhỏ

Khi đang sửa một layout có `_count.snapshots > 0` và rộng hoặc dài nhỏ hơn giá
trị cũ, hiện dòng cảnh báo vàng trong modal: block đã đặt có thể nằm ngoài biên
mới. Chỉ cảnh báo, không chặn lưu.

### Lỗi

Mỗi modal có banner đỏ riêng; khi lỗi thì modal không đóng để người dùng sửa và
thử lại. Nút Lưu disable trong lúc đang gửi.

## Kiểm chứng

`npm run check` 0 errors và `npm run build` pass. Chạy tay: sửa tên/địa chỉ mặt
bằng (header cập nhật), sửa tên layout, thu nhỏ layout có snapshot (thấy cảnh
báo), tạo layout mới (vẫn nhảy sang editor), và mở trang bằng tài khoản không
phải admin (không thấy nút bút chì nào).
