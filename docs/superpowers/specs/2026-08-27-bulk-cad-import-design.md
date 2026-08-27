# Nhập nhiều file CAD cùng lúc

Ngày: 2026-08-27

## Mục tiêu

Cho phép chọn nhiều file CAD một lần (thực tế khoảng 30–50 file), mỗi file tạo
ra một sản phẩm trong dự án. Hiện tại mỗi sản phẩm phải tạo tay rồi upload CAD
riêng, nên nhập một lô hàng chục chi tiết mất hàng giờ thao tác lặp.

Ngoài phạm vi: nhập danh sách sản phẩm từ Excel/CSV, và ghép bảng mô tả với thư
mục CAD theo mã. Hai việc đó là tính năng riêng, không nằm trong bản này.

## Hiện trạng

Luồng upload một file (`POST /assets`, `server/routes/assets.ts`):

1. multer nhận file vào `storage/tmp`, giới hạn 200MB, đuôi cho phép
   `dwg | dxf | step | stp | ifc`.
2. Tạo bản ghi `Asset` trạng thái `pending`.
3. Chuyển file từ `tmp` vào `sources/`.
4. Nếu có `productId` thì gắn `assetId` vào sản phẩm.
5. `convertQueue.enqueue(assetId)`.

Convert (`server/cad/convert.ts`) đọc lại file gốc từ đĩa mỗi lần chạy, ghi ra
`footprint.json`, `thumb.svg`, `mesh.glb`, rồi cập nhật `Asset` (bbox, diện
tích, trạng thái) và các `Product` liên kết. Hàng đợi `ConvertQueue` nằm trong
bộ nhớ tiến trình, chạy 2 job song song, không lưu xuống DB.

Bốn sự thật định hình thiết kế:

- `Product.code` **không có ràng buộc duy nhất**, kể cả trong cùng dự án. Không
  có khoá tự nhiên nào để biết một file đã được nhập hay chưa.
- File CAD gốc **được giữ lại trên đĩa**, không chỗ nào xoá. Convert đọc lại từ
  đó nên **chạy lại convert là an toàn và cho kết quả y hệt**.
- `recoverStuckAssets()` (gọi ở `server/index.ts:6`) hiện đánh dấu **toàn bộ**
  asset `pending`/`processing` thành `failed` kèm lời nhắn "upload lại file".
- Chưa có endpoint hàng loạt nào trong `server/routes/`.

## Phương án đã chọn

**Một endpoint riêng, mỗi request một file.** Trình duyệt gửi 3 file song song
và vẽ tiến độ từng dòng.

Hai phương án bị loại:

- *Vòng lặp phía trình duyệt trên endpoint sẵn có* (`POST /products` rồi
  `POST /assets`): nhanh nhất để làm nhưng đặt quy tắc sinh mã và chống trùng
  vào trình duyệt nên không viết test được, và nếu bước upload hỏng thì để lại
  sản phẩm rỗng không ai dọn.
- *Bảng `ImportBatch` xử lý nền, client hỏi trạng thái*: đóng trình duyệt vẫn
  chạy tiếp và có lịch sử nhập, nhưng thêm bảng, migration và màn hình theo dõi
  — quá nặng cho tình huống một người ngồi chọn file rồi chờ xem chạy xong.

## Thiết kế

### 1. Hàm dùng chung `storeUploadedAsset`

Rút phần lưu file ở `assets.ts` (đoạn kiểm đuôi → tạo `Asset` → chuyển vào
`sources/` → đẩy hàng đợi) thành `server/cad/storeAsset.ts`:

```ts
storeUploadedAsset(file: Express.Multer.File, unitScale?: number): Promise<Asset>
```

`POST /assets` và endpoint nhập hàng loạt cùng gọi hàm này, nên không có chuyện
sửa một bên mà bên kia lệch. Hàm tự test được, không cần dựng HTTP.

### 2. `POST /api/products/import-cad`

Gate quyền `ADMIN` / `PLANNING`, giống các lệnh ghi khác của `products.ts`.
Nhận multipart: `file` (bắt buộc), `projectId` (bắt buộc).

1. Sinh mã: bỏ đuôi file, cắt khoảng trắng hai đầu. `662-01.dwg` → `662-01`.
   Mã rỗng → 400, xoá file tạm.
2. Đuôi file không nằm trong danh sách cho phép → 400, xoá file tạm.
3. Tra `(projectId, code)`. Đã tồn tại → xoá file tạm, trả
   `{ action: 'skipped', code, productId }`. Không tạo `Product` lẫn `Asset`.
4. Chưa tồn tại → tạo `Product` trước (`code` và `name` đều bằng mã,
   `quantity: 1`, màu mặc định). Nếu dính `P2002` — hai request cùng mã chạy
   song song, unique index chặn — thì xoá file tạm và trả `skipped` như bước 3.
5. Tạo sản phẩm xong mới gọi `storeUploadedAsset` rồi cập nhật `assetId`.
6. Trả `201 { action: 'created', code, productId, assetId }`.

Thứ tự này quan trọng: `storeUploadedAsset` vừa ghi DB vừa chuyển file trên đĩa
và đẩy hàng đợi, nên không gói vào transaction được. Tạo `Product` trước để cú
va chạm mã trùng xảy ra *trước khi* có `Asset` nào được sinh ra — nếu làm ngược
lại, mỗi lần trùng sẽ để lại một `Asset` mồ côi kèm file CAD nằm chết trong
`sources/`. Nếu `storeUploadedAsset` hỏng sau khi `Product` đã tạo, xoá
`Product` vừa tạo rồi trả lỗi, để lần nhập sau chạy lại được từ đầu.

Quy tắc **bỏ qua khi trùng mã** là quyết định của người dùng: sản phẩm cũ giữ
nguyên, nhập lại cả thư mục chỉ thêm những file mới, không bao giờ đè mất phần
đã chỉnh tay (màu, số lượng, công đoạn, tên).

### 3. DB: `@@unique([projectId, code])` trên `Product`

Thay đổi schema duy nhất của bản này. Ngoài chuyện làm khoá cho việc chống nhập
trùng, nó bịt khe hở mà bước tra cứu ở tầng ứng dụng không xử lý được: hai file
cùng mã gửi song song sẽ cùng vượt qua bước tra cứu và cùng tạo sản phẩm.

Migration là một `CREATE UNIQUE INDEX`.

**Kiểm tra bắt buộc trước khi deploy lên VPS** — migration sẽ dừng nếu DB đang
có mã trùng:

```sql
select project_id, code, count(*)
from products group by project_id, code having count(*) > 1;
```

DB local hiện sạch (9 sản phẩm, 0 trùng). Nếu VPS có trùng thì phải sửa mã tay
trước, không được để migration chạy rồi mới xử lý.

### 4. Hàng đợi chịu được restart

`recoverStuckAssets()` đổi hành vi: với mỗi asset `pending`/`processing`, nếu
file gốc còn trên đĩa thì đặt lại trạng thái `pending` và trả id ra để cho vào
hàng đợi; chỉ đánh `failed` khi file gốc thật sự không còn.

Hàm **trả về danh sách id**, `server/index.ts` chịu trách nhiệm gọi
`convertQueue.enqueue`. Làm vậy để `cad/convert.ts` không phải import ngược
`routes/assets.ts`.

Không đụng schema, nhưng đây là thứ quyết định tính năng có dùng được thật
không: 50 file chạy 2 job song song mất khoảng 10–30 phút tuỳ file STEP nặng
nhẹ, và trong khoảng đó chỉ cần một lần `pm2 restart` là cả lô hỏng theo cách
hiện tại.

Giữ nguyên `concurrency = 2`. Convert STEP đọc trọn file vào bộ nhớ nên tăng
song song là đánh đổi bằng RAM.

### 5. Giao diện

Nút "Nhập nhiều file CAD" ở trang sản phẩm, mở dialog mới
`BulkCadImportDialog.svelte`:

- Ô chọn nhiều file, `accept=".dwg,.dxf,.step,.stp,.ifc"`.
- Bảng một dòng mỗi file: tên file và trạng thái.
- Trạng thái: chờ → đang tải → đang chuyển đổi → *Đã tạo* / *Bỏ qua, mã đã có*
  / *Lỗi* kèm nguyên nhân.
- Gửi 3 file song song.
- Trạng thái convert lấy theo cơ chế polling sẵn có của trang sản phẩm.
- Dòng tổng kết: "Đã tạo N, bỏ qua M (mã đã có), lỗi K".
- Đóng dialog giữa chừng: file đã gửi vẫn convert tiếp ở máy chủ, file chưa gửi
  thì dừng — cảnh báo trước khi đóng.

Giữ nguyên phần lưu ý upload CAD đã có trong `CadDropzone.svelte`.

## Test

Backend (`tests/productImportCad.test.ts`):

- Mã suy đúng từ tên file, kể cả tên có dấu tiếng Việt và tên nhiều dấu chấm.
- Mã trùng → `skipped`, và **không** tạo thêm `Product` lẫn `Asset`.
- Hai request cùng mã chạy song song → đúng một sản phẩm được tạo.
- Đuôi file không hỗ trợ → 400, không để lại bản ghi lẫn file tạm.
- Thiếu `projectId` → 400.
- Boot recovery: asset `pending` còn file gốc → về hàng đợi; mất file gốc →
  `failed`.

`storeUploadedAsset` test riêng, không qua HTTP.

## Việc phát sinh, không làm trong bản này

`loadProductCatalog()` tải footprint của từng sản phẩm bằng một request riêng
(`floor-manager-web/src/lib/stores/productCatalog.ts:41`). Với 9 sản phẩm thì
không ai để ý; thêm 50 sản phẩm CAD thành ~60 request mỗi lần mở editor. Chưa
đến mức hỏng nhưng sẽ chậm thấy rõ. Cách sửa là gộp footprint vào thẳng
`GET /products`. Việc riêng, làm sau.

## Ước lượng

Backend kèm test ~3 giờ, giao diện ~3 giờ, migration ~30 phút.
