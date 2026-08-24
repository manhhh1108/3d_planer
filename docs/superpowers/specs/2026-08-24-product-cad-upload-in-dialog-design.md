# Upload file CAD ngay trong dialog Sửa/Thêm sản phẩm

Ngày: 2026-08-24

## Bối cảnh

Trang `products/[projectId]` hiện chỉ cho import CAD qua nút "Import CAD" ở từng
dòng bảng. Người dùng mở dialog "Sửa sản phẩm" thì không gắn được file CAD, phải
đóng dialog rồi tìm lại đúng dòng. Yêu cầu: cho upload file ngay trong dialog.

## Phạm vi

- Chỉ file CAD (`.dwg .dxf .step .stp .ifc`) — đúng loại `POST /assets` đang nhận.
- Không sửa backend. Giới hạn 200MB của `server/routes/assets.ts` giữ nguyên.
- Nút "Import CAD" ở dòng bảng giữ nguyên, hoạt động song song.
- Ngoài phạm vi: đính kèm tài liệu bất kỳ, ảnh thumbnail riêng, upload nhiều file.

## Thiết kế

### Component `CadDropzone.svelte`

`src/lib/components/products/CadDropzone.svelte` — presentational thuần, không
gọi API.

Props: `asset: ApiAsset | null`, `pendingFile: File | null`, `disabled: boolean`,
`error: string | null`, `onselect: (f: File) => void`, `onclear: () => void`.

Trạng thái hiển thị:

| Trạng thái | Nội dung |
|---|---|
| Chưa có gì | Icon upload + "Kéo thả hoặc bấm để chọn file CAD" + "dwg, dxf, step, stp, ifc — tối đa 200MB" |
| Đã chọn file mới | Tên file + dung lượng + nút ✕ + "sẽ tải lên khi bấm Lưu" |
| Asset `ready` | Tên file + badge loại (xanh) + "Thay file" |
| Asset `pending`/`processing` | Badge "Đang xử lý…" (hổ phách), vẫn cho thay file |
| Asset `failed` | Badge đỏ + `asset.error` + "Chọn lại file" |

Hỗ trợ cả kéo-thả lẫn click. Validate đuôi file và dung lượng ở client trước khi
gọi `onselect`.

### Luồng trong `+page.svelte`

State mới: `fPendingFile`, `fExistingAsset`, `formUploading`, `formError`.
`openCreate()` reset về null; `openEdit(p)` gán `fExistingAsset = p.asset ?? null`.

`submit()`:

1. Create hoặc update product. Với create, gán `editingId = created.id` ngay sau
   khi tạo thành công.
2. Nếu có `fPendingFile`: xoá asset cũ (`api.assets.remove`, nuốt lỗi), rồi
   `api.assets.upload(fPendingFile, productId)`.
3. Đóng dialog → `refresh()` → `ensurePolling()`.

Trong lúc `formUploading`: nút Lưu disable và đổi chữ "Đang tải file…"; chặn đóng
dialog bằng click nền / Esc.

### Lỗi và edge case

- Product lưu xong nhưng upload lỗi → dialog không đóng, hiện lỗi trong dropzone,
  giữ file để thử lại. `editingId` đã set nên lần thử lại đi nhánh update, không
  tạo sản phẩm trùng.
- `api.assets.upload` sửa để đọc trường `error` trong body JSON, hiện được thông
  báo thật của server thay vì chỉ mã số HTTP.
- File > 200MB hoặc sai đuôi: chặn ở client.
- Người dùng read-only: dialog vốn chỉ mở khi `$canEdit`, không cần kiểm tra thêm.

## Kiểm chứng

Web app không có test runner (chỉ `svelte-check`). Kiểm chứng gồm:

- `npm run check` sạch.
- Chạy tay 4 luồng: thêm mới kèm file; sửa + thay file; sửa không đụng file
  (asset cũ phải còn nguyên); upload sai định dạng.
