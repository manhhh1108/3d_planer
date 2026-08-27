# Nhập nhiều file CAD cùng lúc — Kế hoạch triển khai

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chọn nhiều file CAD một lần, mỗi file tạo một sản phẩm trong dự án; trùng mã thì bỏ qua.

**Architecture:** Một endpoint `POST /api/products/import-cad` nhận mỗi lần một file; trình duyệt gửi 3 file song song. Mã sản phẩm suy từ tên file, ràng buộc duy nhất `(projectId, code)` ở DB làm khoá chống trùng. Phần lưu file được rút thành hàm dùng chung với `POST /assets` để hai đường không lệch nhau. Hàng đợi convert được sửa để chạy lại job dở dang sau khi restart thay vì đánh hỏng cả lô.

**Tech Stack:** Express + Prisma 7 + PostgreSQL, multer, vitest + supertest (backend); SvelteKit 5 runes (frontend).

**Spec:** `docs/superpowers/specs/2026-08-27-bulk-cad-import-design.md`

---

## Bối cảnh cho người chưa quen codebase

- Backend ở `floor-manager/`, frontend ở `floor-manager-web/`. Hai project npm riêng.
- Chạy test backend: `cd floor-manager && npm test`. Lệnh này tự chạy `prisma migrate deploy` lên DB `floormanager_test` trước. **Docker PostgreSQL phải đang chạy** (container `floor-manager-postgres-1`).
- `tests/setup.ts` TRUNCATE toàn bộ bảng trước **mỗi** test, và cấp sẵn `adminToken()` / `planningToken()` / `viewerToken()`.
- Muốn thấy `console.log` trong test: `npx vitest run <file> --disable-console-intercept`.
- File CAD gốc nằm ở `storage/sources/<assetId>/source.<ext>`, artifact sinh ra ở `uploads/assets/<assetId>/`. Xem `server/cad/paths.ts`.
- Convert chạy nền qua `ConvertQueue` (`server/cad/queue.ts`), 2 job song song. Trong test, chờ nó xong bằng `await convertQueue.idle()`.
- Frontend **không có test runner**. Kiểm chứng bằng `npm run check` (svelte-check) và script esbuild trong thư mục scratchpad — xem Task 8.
- Commit bằng tiếng Anh, không thêm trailer `Co-Authored-By`.

## Cấu trúc file

| File | Trách nhiệm |
|---|---|
| `floor-manager/server/prismaError.ts` | *Tạo.* Nhận biết lỗi Prisma theo mã (P2002). |
| `floor-manager/server/cad/convertQueue.ts` | *Tạo.* Giữ một thể hiện `ConvertQueue` dùng chung toàn tiến trình. Tách khỏi `routes/assets.ts` để `cad/storeAsset.ts` dùng được mà không tạo vòng import. |
| `floor-manager/server/cad/storeAsset.ts` | *Tạo.* Cấu hình multer cho file CAD, kiểm đuôi file, và biến file vừa upload thành `Asset` (tạo bản ghi → dời file vào `sources/` → đẩy hàng đợi). |
| `floor-manager/server/routes/productsImportCad.ts` | *Tạo.* Suy mã sản phẩm từ tên file, và handler của `POST /products/import-cad`. |
| `floor-manager/server/routes/assets.ts` | *Sửa.* Dùng `storeAsset.ts` thay vì tự lưu file. Re-export `convertQueue` để test cũ không gãy. |
| `floor-manager/server/routes/products.ts` | *Sửa.* Gắn route `import-cad`; trả 409 khi trùng mã thay vì 500. |
| `floor-manager/server/cad/convert.ts` | *Sửa.* `recoverStuckAssets()` trả về danh sách asset cần chạy lại. |
| `floor-manager/server/index.ts` | *Sửa.* Đẩy các asset đó vào hàng đợi lúc khởi động. |
| `floor-manager/prisma/schema.prisma` | *Sửa.* `@@unique([projectId, code])` trên `Product`. |
| `floor-manager-web/src/lib/utils/concurrency.ts` | *Tạo.* Chạy một danh sách việc với giới hạn số việc song song. Hàm thuần, kiểm được bằng script. |
| `floor-manager-web/src/lib/services/api.ts` | *Sửa.* Thêm `api.products.importCad`. |
| `floor-manager-web/src/lib/components/products/CadUploadHints.svelte` | *Tạo.* Phần lưu ý chuẩn bị file CAD, tách khỏi `CadDropzone.svelte` để dialog nhập hàng loạt dùng lại. |
| `floor-manager-web/src/lib/components/products/CadDropzone.svelte` | *Sửa.* Dùng `CadUploadHints`. |
| `floor-manager-web/src/lib/components/products/BulkCadImportDialog.svelte` | *Tạo.* Dialog chọn nhiều file, bảng tiến độ, dòng tổng kết. |
| `floor-manager-web/src/routes/products/[projectId]/+page.svelte` | *Sửa.* Nút mở dialog. |
| `floor-manager/tests/productsImportCad.test.ts` | *Tạo.* Test endpoint và hàm suy mã. |
| `floor-manager/tests/storeAsset.test.ts` | *Tạo.* Test hàm lưu asset và boot recovery. |

---

## Task 1: Ràng buộc duy nhất `(projectId, code)`

**Files:**
- Create: `floor-manager/server/prismaError.ts`
- Modify: `floor-manager/prisma/schema.prisma:88-110`
- Modify: `floor-manager/server/routes/products.ts:137-172`, `:175-212`
- Test: `floor-manager/tests/productsImportCad.test.ts`

- [ ] **Step 1: Kiểm tra DB local chưa có mã trùng**

Bước này phải làm trước, vì migration sẽ dừng giữa chừng nếu đang có mã trùng.

```bash
docker exec floor-manager-postgres-1 psql -U floormanager -d floormanager -c \
  "select project_id, code, count(*) from products group by project_id, code having count(*) > 1;"
```

Kết quả mong đợi: `(0 rows)`. Nếu có dòng nào, dừng lại và sửa mã tay trước khi đi tiếp.

- [ ] **Step 2: Viết test thất bại**

Tạo `floor-manager/tests/productsImportCad.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken } from './setup.js';

async function makeProject() {
  return (
    await request(app)
      .post('/api/projects')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'P' })
  ).body;
}

describe('mã sản phẩm là duy nhất trong một dự án', () => {
  it('tạo trùng mã trong cùng dự án bị từ chối bằng 409', async () => {
    const proj = await makeProject();
    const first = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ projectId: proj.id, name: 'Dầm A', code: '662-01' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ projectId: proj.id, name: 'Dầm A lần hai', code: '662-01' });
    expect(second.status).toBe(409);

    const all = await prisma.product.findMany({ where: { projectId: proj.id } });
    expect(all).toHaveLength(1);
  });

  it('cùng mã ở hai dự án khác nhau thì vẫn được', async () => {
    const a = await makeProject();
    const b = await makeProject();
    const token = adminToken();
    const r1 = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: a.id, name: 'X', code: '662-01' });
    const r2 = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: b.id, name: 'X', code: '662-01' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  it('đổi mã sang mã đã có của dự án cũng bị 409', async () => {
    const proj = await makeProject();
    const token = adminToken();
    await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: proj.id, name: 'A', code: 'AAA' });
    const second = (
      await request(app)
        .post('/api/products')
        .set('Cookie', `access_token=${token}`)
        .send({ projectId: proj.id, name: 'B', code: 'BBB' })
    ).body;

    const res = await request(app)
      .put(`/api/products/${second.id}`)
      .set('Cookie', `access_token=${token}`)
      .send({ code: 'AAA' });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 3: Chạy test để thấy nó thất bại**

```bash
cd floor-manager && npx vitest run tests/productsImportCad.test.ts
```

Chạy trực tiếp `vitest` sẽ bị `setup.ts` chặn vì thiếu biến môi trường. Dùng:

```bash
cd floor-manager && npm test -- tests/productsImportCad.test.ts
```

Kỳ vọng: FAIL — test đầu nhận `201` thay vì `409` (chưa có ràng buộc nào), test thứ ba cũng vậy.

- [ ] **Step 4: Thêm ràng buộc vào schema**

Trong `floor-manager/prisma/schema.prisma`, khối `model Product`, thêm dòng `@@unique` ngay trước `@@map` (nếu chưa có `@@map` thì thêm vào cuối khối):

```prisma
  /// Mã sản phẩm là duy nhất trong một dự án. Đây là khoá để việc nhập
  /// hàng loạt biết một file CAD đã được nhập hay chưa, và để hai request
  /// cùng mã chạy song song không cùng tạo ra sản phẩm.
  @@unique([projectId, code])
```

- [ ] **Step 5: Tạo migration**

```bash
cd floor-manager && npx prisma migrate dev --name unique_product_code_per_project
```

Kỳ vọng: sinh thư mục `prisma/migrations/<timestamp>_unique_product_code_per_project/` chứa một `CREATE UNIQUE INDEX`, và Prisma Client được generate lại.

Mở file `migration.sql` đọc kiểm — nội dung phải đại loại:

```sql
CREATE UNIQUE INDEX "products_project_id_code_key" ON "products"("project_id", "code");
```

- [ ] **Step 6: Tạo hàm nhận biết lỗi trùng**

Tạo `floor-manager/server/prismaError.ts`:

```ts
/**
 * Prisma báo đụng ràng buộc duy nhất bằng mã lỗi P2002. Kiểm theo mã chứ không
 * theo lớp lỗi, vì Prisma 7 gói lỗi qua nhiều tầng và `instanceof` không ổn định
 * khi client được generate lại.
 */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}
```

- [ ] **Step 7: Trả 409 thay vì 500 ở products**

Trong `floor-manager/server/routes/products.ts`, thêm import ở đầu file:

```ts
import { isUniqueViolation } from '../prismaError.js';
```

Trong `router.post('/')`, thay khối `catch` cuối:

```ts
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: 'Mã sản phẩm đã tồn tại trong dự án này' });
    }
    res.status(500).json({ error: String(err) });
  }
```

Làm y hệt cho khối `catch` của `router.put('/:id')`.

- [ ] **Step 8: Chạy lại test**

```bash
cd floor-manager && npm test -- tests/productsImportCad.test.ts
```

Kỳ vọng: cả 3 test PASS.

- [ ] **Step 9: Chạy toàn bộ test backend**

```bash
cd floor-manager && npm test
```

Kỳ vọng: tất cả PASS. Ràng buộc mới không được làm gãy test cũ — `setup.ts` TRUNCATE trước mỗi test và mỗi helper tự tạo project riêng, nên các mã `B1`, `A1` lặp lại giữa các test nằm ở những dự án khác nhau.

Nếu có test nào gãy vì trùng mã trong **cùng** một dự án, sửa test đó cho mã khác nhau — đừng nới ràng buộc.

- [ ] **Step 10: Commit**

```bash
git add floor-manager/prisma/schema.prisma floor-manager/prisma/migrations \
        floor-manager/server/prismaError.ts floor-manager/server/routes/products.ts \
        floor-manager/tests/productsImportCad.test.ts
git commit -m "feat: make product code unique per project"
```

---

## Task 2: Tách hàng đợi convert ra module riêng

Mục đích: `cad/storeAsset.ts` (Task 3) cần đẩy việc vào hàng đợi, nhưng hàng đợi đang nằm trong `routes/assets.ts`. Nếu `storeAsset.ts` import ngược `routes/assets.ts` sẽ thành vòng import. Tách thể hiện hàng đợi ra một module lá.

**Files:**
- Create: `floor-manager/server/cad/convertQueue.ts`
- Modify: `floor-manager/server/routes/assets.ts:7-8`, `:20`

- [ ] **Step 1: Tạo module hàng đợi**

Tạo `floor-manager/server/cad/convertQueue.ts`:

```ts
import { ConvertQueue } from './queue.js';
import { runConversion } from './convert.js';

/**
 * Hàng đợi convert dùng chung toàn tiến trình.
 *
 * Để riêng một module lá (không import route nào) nên cả `routes/assets.ts` lẫn
 * `cad/storeAsset.ts` đều dùng được mà không tạo vòng import.
 *
 * Giữ 2 job song song: convert STEP đọc trọn file vào bộ nhớ, tăng số này là
 * đánh đổi bằng RAM.
 */
export const convertQueue = new ConvertQueue(runConversion, 2);
```

- [ ] **Step 2: Cho `assets.ts` dùng module mới và re-export**

Trong `floor-manager/server/routes/assets.ts`, xoá hai dòng import cũ:

```ts
import { ConvertQueue, type ConverterFn } from '../cad/queue.js';
import { runConversion } from '../cad/convert.js';
```

và xoá dòng:

```ts
export const convertQueue = new ConvertQueue(runConversion, 2);
```

Thay bằng, đặt cùng chỗ với các import khác:

```ts
import { convertQueue } from '../cad/convertQueue.js';

// Re-export: tests và code cũ vẫn import convertQueue từ đây.
export { convertQueue };
```

- [ ] **Step 3: Kiểm kiểu**

```bash
cd floor-manager && npm run typecheck
```

Kỳ vọng: không lỗi. Nếu báo `ConverterFn` khai báo mà không dùng, xoá luôn phần import đó.

- [ ] **Step 4: Chạy test asset**

```bash
cd floor-manager && npm test -- tests/assets.test.ts tests/queue.test.ts
```

Kỳ vọng: tất cả PASS. `tests/assets.test.ts:7` import `convertQueue` từ `routes/assets.js` — nhờ re-export nên vẫn chạy, và phải là **cùng một** thể hiện thì `convertQueue.idle()` mới chờ đúng.

- [ ] **Step 5: Commit**

```bash
git add floor-manager/server/cad/convertQueue.ts floor-manager/server/routes/assets.ts
git commit -m "refactor: extract shared convert queue into its own module"
```

---

## Task 3: Hàm dùng chung `storeUploadedAsset`

**Files:**
- Create: `floor-manager/server/cad/storeAsset.ts`
- Create: `floor-manager/tests/storeAsset.test.ts`
- Modify: `floor-manager/server/routes/assets.ts:11-18`, `:52-83`

- [ ] **Step 1: Viết test thất bại**

Tạo `floor-manager/tests/storeAsset.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import prisma from '../server/db.js';
import { assetPaths } from '../server/cad/paths.js';
import { convertQueue } from '../server/cad/convertQueue.js';
import { cadExtOf, ALLOWED_CAD_EXT, storeUploadedAsset } from '../server/cad/storeAsset.js';

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');

/** Giả lập file multer vừa nhận: một file thật nằm trong thư mục tạm. */
function fakeUpload(originalname: string, content = '0\nEOF\n') {
  const tmp = path.join(os.tmpdir(), `up-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, content);
  return { originalname, path: tmp };
}

describe('cadExtOf', () => {
  it('lấy đuôi file viết thường, bỏ dấu chấm', () => {
    expect(cadExtOf('662-01.DWG')).toBe('dwg');
    expect(cadExtOf('a.dxf')).toBe('dxf');
    expect(cadExtOf('10022-01-DC 1.1.stp')).toBe('stp');
  });

  it('không có đuôi thì trả chuỗi rỗng', () => {
    expect(cadExtOf('khongcoduoi')).toBe('');
    expect(ALLOWED_CAD_EXT.includes('')).toBe(false);
  });
});

describe('storeUploadedAsset', () => {
  it('tạo asset pending, dời file gốc vào sources/, đẩy vào hàng đợi', async () => {
    const up = fakeUpload('block.dxf');
    const asset = await storeUploadedAsset(up, 'dxf');

    expect(asset.status).toBe('pending');
    expect(asset.fileName).toBe('block.dxf');
    expect(asset.fileType).toBe('dxf');

    const p = assetPaths(asset.id, 'dxf');
    expect(fs.existsSync(p.sourceFile!)).toBe(true);
    // file tạm đã được dời đi, không nhân bản
    expect(fs.existsSync(up.path)).toBe(false);

    await convertQueue.idle();
    const after = await prisma.asset.findUnique({ where: { id: asset.id } });
    // file rỗng nên convert hỏng — điều cần khẳng định là nó ĐÃ chạy,
    // tức là hàng đợi có nhận việc, chứ không đứng yên ở pending.
    expect(after!.status).toBe('failed');
  });

  it('IFC mặc định unitScale = 1, các định dạng khác = 0.001', async () => {
    const ifc = await storeUploadedAsset(fakeUpload('a.ifc'), 'ifc');
    const dxf = await storeUploadedAsset(fakeUpload('a.dxf'), 'dxf');
    expect(ifc.unitScale).toBe(1);
    expect(dxf.unitScale).toBe(0.001);
    await convertQueue.idle();
  });

  it('unitScale truyền vào thì được ưu tiên', async () => {
    const a = await storeUploadedAsset(fakeUpload('a.dxf'), 'dxf', { unitScale: 0.01 });
    expect(a.unitScale).toBe(0.01);
    await convertQueue.idle();
  });

  it('gắn sản phẩm XONG mới đẩy hàng đợi, nên convert cập nhật được sản phẩm', async () => {
    // Đây là bất biến dễ vỡ nhất của hàm này. Convert chạy nền và chỉ cập nhật
    // những Product đang trỏ tới asset; đẩy hàng đợi trước khi gắn link thì với
    // file DXF nhỏ, convert xong trước lúc link kịp ghi và sản phẩm không bao
    // giờ nhận được kích thước.
    const proj = await prisma.project.create({ data: { name: 'P' } });
    const product = await prisma.product.create({
      data: { projectId: proj.id, name: 'X', code: 'X-1', quantity: 1 },
    });
    const dxf = fakeUpload('box.dxf', fs.readFileSync(FIXTURE_DXF, 'utf8'));

    const asset = await storeUploadedAsset(dxf, 'dxf', { productId: product.id });
    await convertQueue.idle();

    const linked = await prisma.product.findUnique({ where: { id: product.id } });
    expect(linked!.assetId).toBe(asset.id);
    expect(linked!.areaM2).toBeCloseTo(8, 1);
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

```bash
cd floor-manager && npm test -- tests/storeAsset.test.ts
```

Kỳ vọng: FAIL khi nạp module — `Cannot find module '../server/cad/storeAsset.js'`.

- [ ] **Step 3: Viết `storeAsset.ts`**

Tạo `floor-manager/server/cad/storeAsset.ts`:

```ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../db.js';
import { assetPaths } from './paths.js';
import { convertQueue } from './convertQueue.js';

export const ALLOWED_CAD_EXT = ['dwg', 'dxf', 'step', 'stp', 'ifc'];

const TMP_DIR = path.resolve(process.env.STORAGE_DIR || './storage', 'tmp');
fs.mkdirSync(TMP_DIR, { recursive: true });

/** Middleware multer dùng chung cho mọi endpoint nhận file CAD. */
export const cadUpload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 200 * 1024 * 1024 },
});

/** Đuôi file viết thường, không có dấu chấm. Không có đuôi thì trả chuỗi rỗng. */
export function cadExtOf(fileName: string): string {
  return path.extname(fileName).toLowerCase().replace('.', '');
}

/**
 * Biến file vừa upload thành một `Asset`: tạo bản ghi, dời file từ thư mục tạm
 * sang `storage/sources/<assetId>/`, gắn vào sản phẩm nếu có, rồi mới đẩy vào
 * hàng đợi convert.
 *
 * Dùng chung cho upload lẻ (`POST /assets`) và nhập hàng loạt
 * (`POST /products/import-cad`) để hai đường không lệch nhau.
 *
 * `productId` nằm trong hàm này chứ không để người gọi tự gắn sau, vì thứ tự
 * "gắn link xong mới enqueue" là bất biến bắt buộc: convert chạy nền và chỉ cập
 * nhật những Product đang trỏ tới asset. Enqueue trước thì với file DXF nhỏ,
 * convert xong trước lúc link kịp ghi và sản phẩm không bao giờ nhận được kích
 * thước, diện tích hay ảnh.
 *
 * Người gọi phải kiểm `ext` nằm trong `ALLOWED_CAD_EXT` trước.
 */
export async function storeUploadedAsset(
  file: { originalname: string; path: string },
  ext: string,
  opts: { unitScale?: number; productId?: string } = {},
) {
  const asset = await prisma.asset.create({
    data: {
      fileName: file.originalname,
      fileType: ext,
      unitScale: opts.unitScale ?? (ext === 'ifc' ? 1 : 0.001),
    },
  });
  const p = assetPaths(asset.id, ext);
  fs.mkdirSync(p.sourceDir, { recursive: true });
  fs.renameSync(file.path, p.sourceFile!);

  if (opts.productId) {
    await prisma.product.update({
      where: { id: opts.productId },
      data: { assetId: asset.id },
    });
  }

  convertQueue.enqueue(asset.id); // phải là bước CUỐI, xem ghi chú ở trên
  return asset;
}
```

- [ ] **Step 4: Chạy lại test**

```bash
cd floor-manager && npm test -- tests/storeAsset.test.ts
```

Kỳ vọng: cả 5 test PASS.

- [ ] **Step 5: Cho `POST /assets` dùng hàm chung**

Trong `floor-manager/server/routes/assets.ts`:

Xoá khối cấu hình cũ (các dòng khai báo `ALLOWED`, `TMP_DIR`, `fs.mkdirSync(TMP_DIR…)`, `const upload = multer({…})`), và thêm vào cụm import:

```ts
import { ALLOWED_CAD_EXT, cadUpload, cadExtOf, storeUploadedAsset } from '../cad/storeAsset.js';
```

Thay toàn bộ handler `POST /` bằng:

```ts
// POST / — multipart: file (bắt buộc), productId?, unitScale?
router.post('/', cadUpload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    const ext = cadExtOf(req.file.originalname);
    if (!ALLOWED_CAD_EXT.includes(ext)) {
      fs.rmSync(req.file.path, { force: true });
      return res
        .status(400)
        .json({ error: `File type .${ext} not supported (${ALLOWED_CAD_EXT.join(', ')})` });
    }
    const asset = await storeUploadedAsset(req.file, ext, {
      unitScale: req.body.unitScale ? Number(req.body.unitScale) : undefined,
      productId: req.body.productId ? String(req.body.productId) : undefined,
    });
    res.status(201).json(serialize(asset));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

`path` và `multer` có thể không còn được dùng trong file này — nếu `npm run typecheck` báo import thừa thì xoá. `fs` vẫn dùng (ở `serialize` và `DELETE`).

- [ ] **Step 6: Chạy test asset và typecheck**

```bash
cd floor-manager && npm run typecheck && npm test -- tests/assets.test.ts tests/storeAsset.test.ts
```

Kỳ vọng: typecheck sạch, toàn bộ PASS — kể cả test convert đầu-cuối và test `rejects unsupported extensions`.

- [ ] **Step 7: Kiểm ngược — chứng minh test bắt được lỗi thứ tự**

Tạm sửa `storeAsset.ts`: chuyển dòng `convertQueue.enqueue(asset.id)` lên **trước** khối `if (opts.productId)`.

```bash
cd floor-manager && npm test -- tests/storeAsset.test.ts
```

Kỳ vọng: test "gắn sản phẩm XONG mới đẩy hàng đợi" FAIL — `linked!.areaM2` là `null` vì convert chạy xong trước khi sản phẩm được gắn vào asset.

Nếu nó vẫn PASS thì test đang không kiểm đúng thứ cần kiểm (có thể máy chạy nhanh/chậm khác nhau) — đừng bỏ qua, hãy làm file DXF trong test nặng hơn hoặc kiểm trực tiếp thứ tự lời gọi.

Hoàn tác sửa đổi tạm này.

- [ ] **Step 8: Commit**

```bash
git add floor-manager/server/cad/storeAsset.ts floor-manager/server/routes/assets.ts \
        floor-manager/tests/storeAsset.test.ts
git commit -m "refactor: share CAD upload storage between asset routes"
```

---

## Task 4: Suy mã sản phẩm từ tên file

**Files:**
- Create: `floor-manager/server/routes/productsImportCad.ts`
- Test: `floor-manager/tests/productsImportCad.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào **đầu** `floor-manager/tests/productsImportCad.test.ts`, ngay sau các import có sẵn:

```ts
import { deriveProductCode } from '../server/routes/productsImportCad.js';
```

và thêm khối describe này vào cuối file:

```ts
describe('deriveProductCode', () => {
  it('bỏ đuôi file', () => {
    expect(deriveProductCode('662-01.dwg')).toBe('662-01');
    expect(deriveProductCode('FR01.DXF')).toBe('FR01');
  });

  it('chỉ bỏ đuôi cuối, giữ nguyên các dấu chấm khác', () => {
    expect(deriveProductCode('10022-01-DC 1.1.stp')).toBe('10022-01-DC 1.1');
  });

  it('giữ nguyên dấu tiếng Việt', () => {
    expect(deriveProductCode('Dầm chính A1.dwg')).toBe('Dầm chính A1');
  });

  it('cắt khoảng trắng thừa hai đầu', () => {
    expect(deriveProductCode('  662-01.dwg  ')).toBe('662-01');
  });

  it('bỏ phần đường dẫn nếu trình duyệt gửi kèm', () => {
    expect(deriveProductCode('CAD/662-01.dwg')).toBe('662-01');
    expect(deriveProductCode('C:\\CAD\\662-01.dwg')).toBe('662-01');
  });

  it('tên chỉ có đuôi thì trả chuỗi rỗng', () => {
    expect(deriveProductCode('.dwg')).toBe('');
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

```bash
cd floor-manager && npm test -- tests/productsImportCad.test.ts
```

Kỳ vọng: FAIL khi nạp module — `Cannot find module '../server/routes/productsImportCad.js'`.

- [ ] **Step 3: Viết hàm**

Tạo `floor-manager/server/routes/productsImportCad.ts`:

```ts
/**
 * Mã sản phẩm suy từ tên file CAD: bỏ đường dẫn, bỏ đuôi, cắt khoảng trắng.
 * `662-01.dwg` -> `662-01`.
 *
 * Chỉ bỏ đuôi cuối cùng, vì tên bản vẽ hay có dạng `10022-01-DC 1.1.stp` mà
 * phần `1.1` là số hiệu, không phải đuôi file.
 */
export function deriveProductCode(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '');
  return base.replace(/\.[^.]+$/, '').trim();
}
```

- [ ] **Step 4: Chạy lại test**

```bash
cd floor-manager && npm test -- tests/productsImportCad.test.ts
```

Kỳ vọng: 6 test của `deriveProductCode` PASS, 3 test của Task 1 vẫn PASS.

- [ ] **Step 5: Commit**

```bash
git add floor-manager/server/routes/productsImportCad.ts floor-manager/tests/productsImportCad.test.ts
git commit -m "feat: derive product code from CAD file name"
```

---

## Task 5: Endpoint `POST /products/import-cad`

**Files:**
- Modify: `floor-manager/server/routes/productsImportCad.ts`
- Modify: `floor-manager/server/routes/products.ts` (gắn route)
- Test: `floor-manager/tests/productsImportCad.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `floor-manager/tests/productsImportCad.test.ts`. Bổ sung các import còn thiếu ở đầu file:

```ts
import fs from 'fs';
import path from 'path';
import { convertQueue } from '../server/cad/convertQueue.js';
import { planningToken, viewerToken } from './setup.js';

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');
```

rồi thêm khối describe:

```ts
describe('POST /api/products/import-cad', () => {
  it('tạo sản phẩm mới với mã và tên lấy từ tên file', async () => {
    const proj = await makeProject();
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '662-01.dxf');

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('created');
    expect(res.body.code).toBe('662-01');

    const p = await prisma.product.findUnique({ where: { id: res.body.productId } });
    expect(p!.code).toBe('662-01');
    expect(p!.name).toBe('662-01');
    expect(p!.quantity).toBe(1);
    expect(p!.assetId).toBe(res.body.assetId);

    await convertQueue.idle();
    const done = await prisma.product.findUnique({ where: { id: res.body.productId } });
    expect(done!.areaM2).toBeCloseTo(8, 1);
  });

  it('mã đã có thì bỏ qua, không tạo thêm sản phẩm lẫn asset', async () => {
    const proj = await makeProject();
    const token = adminToken();
    const first = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${token}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '662-01.dxf');
    expect(first.status).toBe(201);
    const assetsAfterFirst = await prisma.asset.count();

    const second = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${token}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '662-01.dxf');

    expect(second.status).toBe(200);
    expect(second.body.action).toBe('skipped');
    expect(second.body.productId).toBe(first.body.productId);
    expect(await prisma.product.count({ where: { projectId: proj.id } })).toBe(1);
    expect(await prisma.asset.count()).toBe(assetsAfterFirst);
  });

  it('hai request cùng mã chạy song song chỉ tạo đúng một sản phẩm', async () => {
    const proj = await makeProject();
    const token = adminToken();
    const send = () =>
      request(app)
        .post('/api/products/import-cad')
        .set('Cookie', `access_token=${token}`)
        .field('projectId', proj.id)
        .attach('file', fs.readFileSync(FIXTURE_DXF), 'SONG-SONG.dxf');

    const [a, b] = await Promise.all([send(), send()]);
    const actions = [a.body.action, b.body.action].sort();
    expect(actions).toEqual(['created', 'skipped']);
    expect(await prisma.product.count({ where: { projectId: proj.id } })).toBe(1);
    await convertQueue.idle();
  });

  it('đuôi file không hỗ trợ thì 400 và không để lại bản ghi', async () => {
    const proj = await makeProject();
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', proj.id)
      .attach('file', Buffer.from('xin chao'), 'ghichu.txt');

    expect(res.status).toBe(400);
    expect(await prisma.product.count({ where: { projectId: proj.id } })).toBe(0);
    expect(await prisma.asset.count()).toBe(0);
  });

  it('thiếu projectId thì 400', async () => {
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'a.dxf');
    expect(res.status).toBe(400);
  });

  it('projectId không tồn tại thì 400, không phải 500', async () => {
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', 'khong-co-that')
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'a.dxf');
    expect(res.status).toBe(400);
    expect(await prisma.asset.count()).toBe(0);
  });

  it('tên file chỉ có đuôi thì 400', async () => {
    const proj = await makeProject();
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '.dxf');
    expect(res.status).toBe(400);
  });

  it('PLANNING nhập được, VIEWER thì không', async () => {
    const proj = await makeProject();
    const ok = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${planningToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'PL-01.dxf');
    expect(ok.status).toBe(201);

    const denied = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${viewerToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'VW-01.dxf');
    expect(denied.status).toBe(403);
    await convertQueue.idle();
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

```bash
cd floor-manager && npm test -- tests/productsImportCad.test.ts
```

Kỳ vọng: FAIL — các test mới nhận `404` vì route chưa tồn tại.

- [ ] **Step 3: Viết handler**

Thêm vào `floor-manager/server/routes/productsImportCad.ts`, giữ nguyên `deriveProductCode` đã có:

```ts
import { Request, Response } from 'express';
import fs from 'fs';
import prisma from '../db.js';
import { isUniqueViolation } from '../prismaError.js';
import { ALLOWED_CAD_EXT, cadExtOf, storeUploadedAsset } from '../cad/storeAsset.js';

/**
 * Nhập một file CAD thành một sản phẩm. Mỗi request một file — trình duyệt gửi
 * vài file song song. Mã sản phẩm lấy từ tên file; mã đã tồn tại trong dự án thì
 * bỏ qua, không đụng gì tới sản phẩm cũ.
 */
export async function importCadHandler(req: Request, res: Response) {
  const file = req.file;
  /** Bỏ file tạm khi không dùng tới, tránh rác đọng lại trong storage/tmp. */
  const discard = () => {
    if (file) fs.rmSync(file.path, { force: true });
  };

  try {
    if (!file) return res.status(400).json({ error: 'file is required' });

    const projectId = String(req.body.projectId ?? '');
    if (!projectId) {
      discard();
      return res.status(400).json({ error: 'projectId is required' });
    }

    const ext = cadExtOf(file.originalname);
    if (!ALLOWED_CAD_EXT.includes(ext)) {
      discard();
      return res
        .status(400)
        .json({ error: `File type .${ext} not supported (${ALLOWED_CAD_EXT.join(', ')})` });
    }

    const code = deriveProductCode(file.originalname);
    if (!code) {
      discard();
      return res.status(400).json({ error: 'Không suy được mã sản phẩm từ tên file' });
    }

    // Kiểm dự án trước, để projectId sai trả 400 thay vì để FK ném ra 500.
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      discard();
      return res.status(400).json({ error: 'projectId không tồn tại' });
    }

    const existing = await prisma.product.findFirst({ where: { projectId, code } });
    if (existing) {
      discard();
      return res.json({ action: 'skipped', code, productId: existing.id });
    }

    // Tạo Product TRƯỚC Asset. Va chạm mã trùng phải xảy ra khi chưa sinh Asset
    // nào — làm ngược lại thì mỗi lần trùng để lại một asset mồ côi kèm file CAD
    // nằm chết trong sources/, không có gì dọn.
    let product;
    try {
      product = await prisma.product.create({
        data: { projectId, name: code, code, quantity: 1 },
      });
    } catch (err) {
      // Hai request cùng mã chạy song song: cả hai cùng vượt qua bước tra cứu ở
      // trên, ràng buộc duy nhất chặn cái thứ hai lại.
      if (isUniqueViolation(err)) {
        discard();
        const dup = await prisma.product.findFirst({ where: { projectId, code } });
        return res.json({ action: 'skipped', code, productId: dup?.id ?? null });
      }
      throw err;
    }

    try {
      // productId truyền thẳng vào: hàm chung gắn link rồi mới đẩy hàng đợi,
      // nếu không convert có thể xong trước lúc link kịp ghi.
      const asset = await storeUploadedAsset(file, ext, { productId: product.id });
      return res.status(201).json({
        action: 'created',
        code,
        productId: product.id,
        assetId: asset.id,
      });
    } catch (err) {
      // Lưu file hỏng sau khi đã tạo sản phẩm: xoá sản phẩm rỗng vừa tạo để lần
      // nhập sau chạy lại được từ đầu thay vì bị chính nó chặn vì trùng mã.
      await prisma.product.delete({ where: { id: product.id } }).catch(() => {});
      throw err;
    }
  } catch (err) {
    discard();
    res.status(500).json({ error: String(err) });
  }
}
```

- [ ] **Step 4: Gắn route vào products router**

Trong `floor-manager/server/routes/products.ts`, thêm import:

```ts
import { cadUpload } from '../cad/storeAsset.js';
import { importCadHandler } from './productsImportCad.js';
```

và thêm dòng route ngay **sau** khối `router.use(...)` kiểm quyền (khoảng dòng 33), trước `router.get('/')`:

```ts
// POST /import-cad — multipart: file, projectId. Mỗi request một file.
router.post('/import-cad', cadUpload.single('file'), importCadHandler);
```

Đặt ở đây để nó nằm sau cổng quyền `ADMIN`/`PLANNING`, và vì không có route `POST /:id` nào nên không có xung đột đường dẫn.

- [ ] **Step 5: Chạy lại test**

```bash
cd floor-manager && npm test -- tests/productsImportCad.test.ts
```

Kỳ vọng: toàn bộ PASS.

Nếu test "hai request cùng mã chạy song song" thỉnh thoảng cho `['created','created']`, tức là ràng buộc duy nhất ở Task 1 chưa được áp lên DB test. Chạy `npm run test:migrate` rồi thử lại.

- [ ] **Step 6: Chứng minh test có giá trị — kiểm ngược**

Tạm sửa `productsImportCad.ts`: đổi khối bắt `isUniqueViolation` thành `throw err;`.

```bash
cd floor-manager && npm test -- tests/productsImportCad.test.ts
```

Kỳ vọng: test "hai request cùng mã chạy song song" FAIL (một request trả 500). Nếu nó vẫn PASS thì test đang không kiểm đúng thứ cần kiểm — sửa test, đừng bỏ qua.

Hoàn tác sửa đổi tạm này.

- [ ] **Step 7: Chạy toàn bộ test backend**

```bash
cd floor-manager && npm test
```

Kỳ vọng: tất cả PASS.

- [ ] **Step 8: Commit**

```bash
git add floor-manager/server/routes/productsImportCad.ts floor-manager/server/routes/products.ts \
        floor-manager/tests/productsImportCad.test.ts
git commit -m "feat: add bulk CAD import endpoint creating one product per file"
```

---

## Task 6: Hàng đợi chạy lại job dở dang sau restart

Hiện tại `recoverStuckAssets()` đánh dấu **toàn bộ** asset `pending`/`processing` thành `failed`. Nhập 50 file mất 10–30 phút; chỉ cần một lần `pm2 restart` trong khoảng đó là cả lô hỏng và người dùng phải upload lại từ đầu. File gốc không bao giờ bị xoá và convert đọc lại từ đó mỗi lần, nên chạy lại là an toàn.

**Files:**
- Modify: `floor-manager/server/cad/convert.ts:107-113`
- Modify: `floor-manager/server/index.ts`
- Test: `floor-manager/tests/storeAsset.test.ts`

- [ ] **Step 1: Viết test thất bại**

Thêm vào cuối `floor-manager/tests/storeAsset.test.ts`, và bổ sung import:

```ts
import { recoverStuckAssets } from '../server/cad/convert.js';
```

```ts
describe('recoverStuckAssets', () => {
  it('còn file gốc thì đưa về pending và trả id để chạy lại', async () => {
    const asset = await storeUploadedAsset(fakeUpload('lai.dxf'), 'dxf');
    await convertQueue.idle();
    // Giả lập server chết giữa chừng: bản ghi đang dở, file gốc vẫn còn
    await prisma.asset.update({
      where: { id: asset.id },
      data: { status: 'processing', error: null },
    });

    const retry = await recoverStuckAssets();

    expect(retry).toContain(asset.id);
    const after = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(after!.status).toBe('pending');
    expect(after!.error).toBeNull();
  });

  it('mất file gốc thì đánh failed và không chạy lại', async () => {
    const asset = await storeUploadedAsset(fakeUpload('mat.dxf'), 'dxf');
    await convertQueue.idle();
    await prisma.asset.update({ where: { id: asset.id }, data: { status: 'pending' } });
    fs.rmSync(assetPaths(asset.id, 'dxf').sourceDir, { recursive: true, force: true });

    const retry = await recoverStuckAssets();

    expect(retry).not.toContain(asset.id);
    const after = await prisma.asset.findUnique({ where: { id: asset.id } });
    expect(after!.status).toBe('failed');
    expect(after!.error).toBeTruthy();
  });

  it('không đụng tới asset đã xong hoặc đã hỏng', async () => {
    const done = await storeUploadedAsset(fakeUpload('xong.dxf'), 'dxf');
    await convertQueue.idle();
    await prisma.asset.update({ where: { id: done.id }, data: { status: 'ready', error: null } });

    const retry = await recoverStuckAssets();

    expect(retry).not.toContain(done.id);
    const after = await prisma.asset.findUnique({ where: { id: done.id } });
    expect(after!.status).toBe('ready');
  });
});
```

- [ ] **Step 2: Chạy test để thấy nó thất bại**

```bash
cd floor-manager && npm test -- tests/storeAsset.test.ts
```

Kỳ vọng: FAIL — `recoverStuckAssets()` hiện trả `undefined` nên `expect(retry).toContain(...)` ném lỗi, và asset bị đánh `failed` thay vì `pending`.

- [ ] **Step 3: Sửa `recoverStuckAssets`**

Trong `floor-manager/server/cad/convert.ts`, thay toàn bộ hàm:

```ts
/**
 * Boot recovery cho job convert đang dở khi server chết.
 *
 * File CAD gốc không bao giờ bị xoá và convert đọc lại từ đó mỗi lần chạy, nên
 * job dở dang chạy lại được và cho kết quả y hệt. Trước đây hàm này đánh hỏng cả
 * lô và bắt upload lại — với một lô nhập 50 file thì một lần restart là mất sạch.
 *
 * Trả về danh sách asset cần đưa lại vào hàng đợi. Việc enqueue để cho
 * `server/index.ts` làm, nhờ vậy file này không phải import ngược module hàng đợi.
 */
export async function recoverStuckAssets(): Promise<string[]> {
  const stuck = await prisma.asset.findMany({
    where: { status: { in: ['pending', 'processing'] } },
    select: { id: true, fileType: true },
  });

  const retry: string[] = [];
  for (const a of stuck) {
    const p = assetPaths(a.id, a.fileType);
    if (p.sourceFile && fs.existsSync(p.sourceFile)) {
      await prisma.asset.update({
        where: { id: a.id },
        data: { status: 'pending', error: null },
      });
      retry.push(a.id);
    } else {
      await prisma.asset.update({
        where: { id: a.id },
        data: { status: 'failed', error: 'Mất file gốc khi server khởi động lại — upload lại file' },
      });
    }
  }
  return retry;
}
```

`fs` và `assetPaths` đã được import sẵn ở đầu `convert.ts`, không cần thêm.

- [ ] **Step 4: Chạy lại test**

```bash
cd floor-manager && npm test -- tests/storeAsset.test.ts
```

Kỳ vọng: cả 3 test mới PASS.

- [ ] **Step 5: Đẩy vào hàng đợi lúc khởi động**

Thay `floor-manager/server/index.ts` bằng:

```ts
import dotenv from 'dotenv';
dotenv.config();

const { default: app } = await import('./app.js');
const { recoverStuckAssets } = await import('./cad/convert.js');
const { convertQueue } = await import('./cad/convertQueue.js');

// Job convert dở dang từ lần chạy trước: chạy lại thay vì bắt upload lại.
const retry = await recoverStuckAssets();
retry.forEach((id) => convertQueue.enqueue(id));
if (retry.length > 0) {
  console.log(`Đưa lại ${retry.length} file CAD vào hàng đợi convert`);
}

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 6: Typecheck và chạy toàn bộ test**

```bash
cd floor-manager && npm run typecheck && npm test
```

Kỳ vọng: typecheck sạch, tất cả test PASS.

- [ ] **Step 7: Commit**

```bash
git add floor-manager/server/cad/convert.ts floor-manager/server/index.ts \
        floor-manager/tests/storeAsset.test.ts
git commit -m "fix: requeue interrupted CAD conversions on boot instead of failing them"
```

---

## Task 7: Hàm chạy song song có giới hạn (frontend)

Gửi 50 file cùng lúc sẽ nghẽn trình duyệt lẫn máy chủ. Cần chạy 3 việc một lúc. Tách thành hàm thuần để kiểm chứng được — phía web không có test runner.

**Files:**
- Create: `floor-manager-web/src/lib/utils/concurrency.ts`

- [ ] **Step 1: Viết hàm**

Tạo `floor-manager-web/src/lib/utils/concurrency.ts`:

```ts
/**
 * Chạy một danh sách việc, mỗi lúc nhiều nhất `limit` việc chạy song song.
 *
 * Kết quả trả về **theo đúng thứ tự danh sách vào**, không theo thứ tự chạy xong,
 * để bảng tiến độ khớp dòng với file người dùng đã chọn.
 *
 * Một việc ném lỗi không làm hỏng cả lô: các việc còn lại vẫn chạy tiếp, và ô
 * tương ứng trong mảng kết quả nhận `{ ok: false, error }`.
 */
export type TaskResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function runWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  onDone?: (index: number, result: TaskResult<T>) => void,
): Promise<Array<TaskResult<T>>> {
  const results = new Array<TaskResult<T>>(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      onDone?.(i, results[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, () => worker()),
  );
  return results;
}
```

- [ ] **Step 2: Viết script kiểm chứng**

Phía web không có vitest. Dùng script chạy thẳng, giống cách đã kiểm `blockOrientation` và `cameraFit`.

Tạo `C:\Users\TTM-MA~1\AppData\Local\Temp\claude\d--Home-3d-planer\966daa6d-4354-4a1c-bec1-a4684fad26ed\scratchpad\checkconcurrency.mjs`:

```js
import { createRequire } from 'node:module';
const require_ = createRequire('file:///d:/Home/3d_planer/floor-manager-web/package.json');
const esbuild = require_('esbuild');

const built = await esbuild.build({
  entryPoints: ['d:/Home/3d_planer/floor-manager-web/src/lib/utils/concurrency.ts'],
  bundle: true, format: 'esm', write: false, logLevel: 'silent',
});
const { runWithLimit } = await import(
  'data:text/javascript;base64,' + Buffer.from(built.outputFiles[0].text).toString('base64')
);

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  PASS  ${name}`);
  else { console.log(`  FAIL  ${name}${detail !== undefined ? ' — ' + detail : ''}`); failures++; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) Kết quả giữ đúng thứ tự vào, dù chạy xong lộn xộn
{
  const delays = [30, 5, 20, 1, 15];
  const res = await runWithLimit(delays.map((d, i) => async () => { await sleep(d); return i; }), 3);
  check('giữ đúng thứ tự danh sách vào',
        JSON.stringify(res.map((r) => r.value)) === JSON.stringify([0, 1, 2, 3, 4]),
        JSON.stringify(res.map((r) => r.value)));
}

// 2) Không bao giờ vượt quá giới hạn song song
{
  let running = 0, peak = 0;
  await runWithLimit(
    Array.from({ length: 12 }, () => async () => {
      running++; peak = Math.max(peak, running);
      await sleep(5);
      running--;
    }), 3);
  check('không chạy quá 3 việc cùng lúc', peak === 3, `đỉnh = ${peak}`);
}

// 3) Một việc hỏng không kéo đổ cả lô
{
  const res = await runWithLimit([
    async () => 'a',
    async () => { throw new Error('vỡ'); },
    async () => 'c',
  ], 2);
  check('việc hỏng chỉ đánh dấu ô của nó', res[1].ok === false && String(res[1].error).includes('vỡ'));
  check('các việc khác vẫn chạy xong', res[0].value === 'a' && res[2].value === 'c');
}

// 4) Báo tiến độ từng việc ngay khi xong
{
  const seen = [];
  await runWithLimit(
    [50, 5, 20].map((d) => async () => { await sleep(d); return d; }),
    3,
    (i) => seen.push(i),
  );
  check('gọi onDone đủ 3 lần', seen.length === 3, seen.length);
  check('onDone báo theo thứ tự chạy XONG, không phải thứ tự vào',
        JSON.stringify(seen) === JSON.stringify([1, 2, 0]), JSON.stringify(seen));
}

// 5) Danh sách rỗng không treo
{
  const res = await runWithLimit([], 3);
  check('danh sách rỗng trả mảng rỗng', Array.isArray(res) && res.length === 0);
}

console.log(failures === 0 ? '\nTẤT CẢ PASS' : `\n${failures} CHECK FAIL`);
process.exit(failures === 0 ? 0 : 1);
```

- [ ] **Step 3: Chạy script**

```bash
node "C:\Users\TTM-MA~1\AppData\Local\Temp\claude\d--Home-3d-planer\966daa6d-4354-4a1c-bec1-a4684fad26ed\scratchpad\checkconcurrency.mjs"
```

Kỳ vọng: `TẤT CẢ PASS`.

- [ ] **Step 4: Kiểm ngược — chứng minh script bắt được lỗi**

Tạm sửa `concurrency.ts`: đổi `Math.min(limit, tasks.length)` thành `tasks.length` (bỏ giới hạn song song).

```bash
node "C:\Users\TTM-MA~1\AppData\Local\Temp\claude\d--Home-3d-planer\966daa6d-4354-4a1c-bec1-a4684fad26ed\scratchpad\checkconcurrency.mjs"
```

Kỳ vọng: check "không chạy quá 3 việc cùng lúc" FAIL với đỉnh = 12. Hoàn tác sửa đổi tạm.

- [ ] **Step 5: Commit**

```bash
git add floor-manager-web/src/lib/utils/concurrency.ts
git commit -m "feat: add bounded-concurrency task runner"
```

---

## Task 8: Gọi API từ frontend

**Files:**
- Modify: `floor-manager-web/src/lib/services/api.ts:192-205` (khối `products`)

- [ ] **Step 1: Thêm kiểu kết quả**

Trong `floor-manager-web/src/lib/services/api.ts`, thêm cạnh các interface khác (sau `ApiProduct`):

```ts
/** Kết quả nhập một file CAD. `skipped` nghĩa là mã đã có sẵn trong dự án. */
export interface ApiImportCadResult {
	action: 'created' | 'skipped';
	code: string;
	productId: string | null;
	assetId?: string;
}
```

- [ ] **Step 2: Thêm hàm gọi API**

Trong khối `products: { ... }`, thêm sau `create`:

```ts
		/**
		 * Nhập một file CAD thành một sản phẩm. Mã và tên lấy từ tên file.
		 * Mã đã tồn tại trong dự án thì máy chủ bỏ qua và trả `action: 'skipped'`.
		 */
		importCad: async (projectId: string, file: File): Promise<ApiImportCadResult> => {
			const fd = new FormData();
			fd.append('file', file);
			fd.append('projectId', projectId);
			const res = await fetch(`${BASE}/products/import-cad`, {
				method: 'POST',
				body: fd,
				credentials: 'include',
			});
			if (!res.ok) {
				// Server trả { error } — giữ lại message thật thay vì chỉ mã HTTP
				const detail = await res
					.json()
					.then((b) => (b && typeof b.error === 'string' ? b.error : null))
					.catch(() => null);
				throw new Error(detail ?? `API POST /products/import-cad: ${res.status}`);
			}
			return res.json();
		},
```

- [ ] **Step 3: Kiểm kiểu**

```bash
cd floor-manager-web && npm run check
```

Kỳ vọng: không có lỗi mới. (Cảnh báo sẵn có của project thì bỏ qua — so với kết quả chạy trước khi sửa.)

- [ ] **Step 4: Commit**

```bash
git add floor-manager-web/src/lib/services/api.ts
git commit -m "feat: add bulk CAD import API client method"
```

---

## Task 9: Tách phần lưu ý chuẩn bị file CAD

Phần lưu ý đang nằm cứng trong `CadDropzone.svelte` (khối `<details>`, dòng 138-164). Dialog nhập hàng loạt cần đúng nội dung đó — người nhập 50 file một lúc cần nó hơn người nhập lẻ. Tách ra thay vì chép lại, để sửa một chỗ là cả hai nơi cùng đổi.

**Files:**
- Create: `floor-manager-web/src/lib/components/products/CadUploadHints.svelte`
- Modify: `floor-manager-web/src/lib/components/products/CadDropzone.svelte:138-164`

- [ ] **Step 1: Tạo component lưu ý**

Tạo `floor-manager-web/src/lib/components/products/CadUploadHints.svelte`, chép **nguyên văn** khối `<details>` từ `CadDropzone.svelte`:

```svelte
<!--
  Lưu ý chuẩn bị file CAD. Dùng chung cho ô upload lẻ và dialog nhập hàng loạt —
  sửa nội dung ở đây là cả hai nơi cùng đổi.
  Thu gọn mặc định: người đã quen file CAD không phải đọc lại mỗi lần.
-->
<details class="mt-1.5 group">
  <summary class="text-[11px] text-gray-400 hover:text-blue-600 cursor-pointer select-none list-none flex items-center gap-1 w-fit">
    <span class="text-gray-300 group-open:rotate-90 transition-transform inline-block">▸</span>
    ⓘ Lưu ý khi chuẩn bị file CAD
  </summary>
  <ul class="mt-1.5 space-y-1.5 text-[11px] leading-relaxed text-gray-500 border-l-2 border-gray-100 pl-2.5">
    <li>
      <strong class="text-gray-700">Muốn thấy khối 3D thật → dùng STEP hoặc IFC.</strong>
      DWG/DXF chỉ cho biên dạng 2D, trong 3D sẽ hiện thành khối hộp.
    </li>
    <li>
      <strong class="text-gray-700">Chỉ giữ biên dạng chi tiết.</strong>
      Xoá khung tên, đường gióng kích thước, hình phóng to bên cạnh — mọi nét
      trong file đều bị tính vào kích thước block.
    </li>
    <li>
      <strong class="text-gray-700">Biên dạng ngoài nên là một polyline kín.</strong>
      Vẽ bằng nhiều đoạn rời thì chỗ lõm (chữ L, chữ U) sẽ bị lấp đầy. Lỗ khoan
      cứ để, app tự bỏ qua.
    </li>
    <li>
      <strong class="text-gray-700">File phải khai báo đơn vị.</strong>
      Không khai báo thì app hiểu là milimét — bản vẽ bằng mét sẽ nhỏ đi 1000 lần.
    </li>
  </ul>
</details>
```

- [ ] **Step 2: Cho `CadDropzone` dùng component mới**

Trong `floor-manager-web/src/lib/components/products/CadDropzone.svelte`, thêm import sau dòng 2:

```ts
  import CadUploadHints from './CadUploadHints.svelte';
```

Xoá toàn bộ khối từ dòng bình luận `<!-- Thu gọn mặc định: ... -->` tới `</details>` (dòng 138-164), thay bằng:

```svelte
  <CadUploadHints />
```

- [ ] **Step 3: Kiểm kiểu và nhìn bằng mắt**

```bash
cd floor-manager-web && npm run check
```

Kỳ vọng: không có lỗi mới.

Mở dialog "Sửa sản phẩm" trên trình duyệt, bấm vào dòng "ⓘ Lưu ý khi chuẩn bị file CAD". Phải mở ra đúng 4 gạch đầu dòng như trước, mũi tên ▸ xoay khi mở.

- [ ] **Step 4: Commit**

```bash
git add floor-manager-web/src/lib/components/products/CadUploadHints.svelte \
        floor-manager-web/src/lib/components/products/CadDropzone.svelte
git commit -m "refactor: extract CAD upload hints into a shared component"
```

---

## Task 10: Dialog nhập nhiều file

**Files:**
- Create: `floor-manager-web/src/lib/components/products/BulkCadImportDialog.svelte`

- [ ] **Step 1: Viết component**

Tạo `floor-manager-web/src/lib/components/products/BulkCadImportDialog.svelte`:

```svelte
<script lang="ts">
  import { api } from '$lib/services/api';
  import { runWithLimit } from '$lib/utils/concurrency';
  import CadUploadHints from './CadUploadHints.svelte';

  /** Gửi mấy file một lúc. Nhiều hơn nữa chỉ làm nghẽn, convert vẫn chạy 2 job. */
  const PARALLEL_UPLOADS = 3;
  const ACCEPT = '.dwg,.dxf,.step,.stp,.ifc';

  type RowState = 'waiting' | 'uploading' | 'created' | 'skipped' | 'error';
  type Row = { file: File; state: RowState; note: string };

  let { projectId, onclose }: { projectId: string; onclose: (imported: boolean) => void } = $props();

  let rows = $state<Row[]>([]);
  let running = $state(false);
  let finished = $state(false);

  let createdCount = $derived(rows.filter((r) => r.state === 'created').length);
  let skippedCount = $derived(rows.filter((r) => r.state === 'skipped').length);
  let errorCount = $derived(rows.filter((r) => r.state === 'error').length);

  const LABEL: Record<RowState, string> = {
    waiting: 'Chờ',
    uploading: 'Đang tải…',
    created: 'Đã tạo',
    skipped: 'Bỏ qua, mã đã có',
    error: 'Lỗi',
  };
  const TONE: Record<RowState, string> = {
    waiting: 'text-gray-400',
    uploading: 'text-blue-600',
    created: 'text-green-600',
    skipped: 'text-amber-600',
    error: 'text-red-600',
  };

  function onPick(ev: Event) {
    const input = ev.target as HTMLInputElement;
    rows = Array.from(input.files ?? []).map((file) => ({ file, state: 'waiting', note: '' }));
    finished = false;
    input.value = '';
  }

  async function start() {
    if (rows.length === 0 || running) return;
    running = true;
    finished = false;

    const tasks = rows.map((row, i) => async () => {
      rows[i] = { ...rows[i], state: 'uploading', note: '' };
      const res = await api.products.importCad(projectId, row.file);
      rows[i] = {
        ...rows[i],
        state: res.action === 'created' ? 'created' : 'skipped',
        note: res.code,
      };
      return res;
    });

    await runWithLimit(tasks, PARALLEL_UPLOADS, (i, result) => {
      if (!result.ok) {
        rows[i] = {
          ...rows[i],
          state: 'error',
          note: result.error instanceof Error ? result.error.message : String(result.error),
        };
      }
    });

    running = false;
    finished = true;
  }

  function requestClose() {
    // Đang gửi dở: file đã gửi vẫn convert tiếp ở máy chủ, nhưng file chưa gửi
    // thì dừng hẳn — phải nói rõ trước khi đóng.
    if (running && !confirm('Đang nhập dở. Đóng lại sẽ bỏ những file chưa gửi. Vẫn đóng?')) return;
    onclose(createdCount > 0);
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  onclick={requestClose}
  onkeydown={(e) => { if (e.key === 'Escape') requestClose(); }}
  role="dialog"
  tabindex="-1"
>
  <div
    class="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="document"
  >
    <h2 class="text-lg font-bold text-gray-800 mb-1">Nhập nhiều file CAD</h2>
    <p class="text-xs text-gray-500 mb-4">
      Mỗi file thành một sản phẩm. Mã và tên lấy từ tên file, bỏ phần đuôi —
      <code class="bg-gray-100 px-1 rounded">662-01.dwg</code> thành mã
      <code class="bg-gray-100 px-1 rounded">662-01</code>. Mã đã có trong dự án thì bỏ qua,
      sản phẩm cũ giữ nguyên.
    </p>

    <label class="block mb-4">
      <span class="text-xs font-medium text-gray-500">Chọn file ({ACCEPT})</span>
      <input
        type="file"
        multiple
        accept={ACCEPT}
        disabled={running}
        onchange={onPick}
        class="mt-1 w-full text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-lg file:border-0 file:bg-blue-50 file:text-blue-700 file:text-sm file:font-semibold disabled:opacity-50"
      />
      <CadUploadHints />
    </label>

    {#if rows.length > 0}
      <div class="flex-1 overflow-y-auto border border-gray-200 rounded-lg">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 sticky top-0">
            <tr>
              <th class="text-left px-3 py-2 font-medium text-gray-500 text-xs">Tên file</th>
              <th class="text-left px-3 py-2 font-medium text-gray-500 text-xs w-56">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as row (row.file.name + row.file.size)}
              <tr class="border-t border-gray-100">
                <td class="px-3 py-1.5 text-gray-700 truncate max-w-xs">{row.file.name}</td>
                <td class="px-3 py-1.5 {TONE[row.state]}">
                  {LABEL[row.state]}
                  {#if row.state === 'error'}
                    <span class="text-xs text-gray-500 block truncate">{row.note}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    {#if finished}
      <div class="mt-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700">
        Đã tạo {createdCount}, bỏ qua {skippedCount} (mã đã có), lỗi {errorCount}.
        {#if createdCount > 0}
          <span class="text-gray-500">Kích thước và ảnh sẽ hiện dần khi chuyển đổi xong.</span>
        {/if}
      </div>
    {/if}

    <div class="flex justify-end gap-2 mt-4">
      <button
        onclick={requestClose}
        class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-semibold"
      >
        {finished ? 'Đóng' : 'Hủy'}
      </button>
      <button
        onclick={start}
        disabled={running || rows.length === 0 || finished}
        class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-semibold disabled:opacity-50"
      >
        {running ? 'Đang nhập…' : `Nhập ${rows.length} file`}
      </button>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Kiểm kiểu**

```bash
cd floor-manager-web && npm run check
```

Kỳ vọng: không có lỗi mới.

- [ ] **Step 3: Commit**

```bash
git add floor-manager-web/src/lib/components/products/BulkCadImportDialog.svelte
git commit -m "feat: add bulk CAD import dialog"
```

---

## Task 11: Nút mở dialog ở trang sản phẩm

**Files:**
- Modify: `floor-manager-web/src/routes/products/[projectId]/+page.svelte:8`, `:20-50`, `:277-281`

- [ ] **Step 1: Thêm import và state**

Sau dòng import `CadDropzone` (dòng 8):

```ts
  import BulkCadImportDialog from '$lib/components/products/BulkCadImportDialog.svelte';
```

Thêm cạnh các khai báo `$state` khác (sau `let confirmDeleteId`, khoảng dòng 46):

```ts
  let showBulkImport = $state(false);
```

- [ ] **Step 2: Thêm hàm xử lý đóng dialog**

Thêm sau hàm `ensurePolling()` (khoảng dòng 113):

```ts
  /**
   * Nhập xong thì nạp lại danh sách và bật polling — asset vừa tạo còn đang
   * convert, kích thước và ảnh sẽ hiện dần.
   */
  async function onBulkImportClose(imported: boolean) {
    showBulkImport = false;
    if (imported) {
      await refresh();
      ensurePolling();
    }
  }
```

- [ ] **Step 3: Thêm nút**

Thay khối nút ở dòng 277-281:

```svelte
      {#if $canEdit}
      <button onclick={() => (showBulkImport = true)} class="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold text-sm">
        Nhập nhiều file CAD
      </button>
      <button onclick={openCreate} class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 font-semibold text-sm">
        + Thêm sản phẩm
      </button>
      {/if}
```

- [ ] **Step 4: Gắn dialog vào cuối trang**

Ngay trước thẻ `</div>` cuối cùng của file (dòng 527), sau khối `{#if showForm}…{/if}`:

```svelte
  {#if showBulkImport}
    <BulkCadImportDialog {projectId} onclose={onBulkImportClose} />
  {/if}
```

- [ ] **Step 5: Kiểm kiểu**

```bash
cd floor-manager-web && npm run check
```

Kỳ vọng: không có lỗi mới.

- [ ] **Step 6: Commit**

```bash
git add "floor-manager-web/src/routes/products/[projectId]/+page.svelte"
git commit -m "feat: wire bulk CAD import into products page"
```

---

## Task 12: Kiểm thử tay đầu-cuối

Backend đã có test tự động; phần này kiểm những thứ chỉ thấy được trên trình duyệt.

**Files:** không sửa file nào.

- [ ] **Step 1: Chạy backend và frontend**

Hai cửa sổ terminal riêng:

```bash
cd floor-manager && npm run server
```

```bash
cd floor-manager-web && npm run dev
```

Docker PostgreSQL phải đang chạy. Nếu schema DB dev chưa có ràng buộc mới:

```bash
cd floor-manager && npx prisma migrate deploy
```

- [ ] **Step 2: Nhập một lô file thật**

Mở trang sản phẩm của một dự án, bấm **Nhập nhiều file CAD**, chọn toàn bộ file trong `D:\Home\3d_planer\file_test\`.

Kiểm:
- Bảng liệt kê đủ số file đã chọn, tất cả ở trạng thái "Chờ".
- Bấm Nhập: các dòng chuyển sang "Đang tải…" **ba dòng một lúc**, không phải tất cả cùng lúc.
- Chạy xong hiện dòng tổng kết đúng số liệu.
- Đóng dialog: danh sách sản phẩm có thêm các sản phẩm mới, mã đúng bằng tên file bỏ đuôi.
- Ảnh thu nhỏ và kích thước hiện dần trong vòng vài chục giây mà **không cần tải lại trang** (polling).

- [ ] **Step 3: Nhập lại đúng lô đó**

Bấm Nhập nhiều file CAD lần nữa, chọn lại đúng những file vừa nhập.

Kiểm: mọi dòng đều "Bỏ qua, mã đã có"; tổng kết ghi `Đã tạo 0`; số sản phẩm trong danh sách **không đổi**; các sản phẩm cũ giữ nguyên màu, số lượng, công đoạn.

- [ ] **Step 4: Kiểm phục hồi sau restart**

Chọn một lô đủ lớn (10+ file) rồi bấm Nhập. Trong lúc bảng còn đang chạy, dừng backend (Ctrl+C) rồi chạy lại `npm run server`.

Kiểm: log khởi động in `Đưa lại N file CAD vào hàng đợi convert`; sau vài chục giây, tải lại trang sản phẩm thì các sản phẩm đó có kích thước và ảnh, **không** hiện banner CAD lỗi.

Đây là điểm mấu chốt của Task 6 — trước khi sửa, cả lô sẽ thành "failed".

- [ ] **Step 5: Kiểm quyền**

Đăng nhập bằng tài khoản VIEWER. Kiểm: nút "Nhập nhiều file CAD" không hiện (nằm trong `{#if $canEdit}`).

- [ ] **Step 6: Kiểm file lỗi**

Nhập một file `.dxf` hỏng (ví dụ file text chỉ có `0\nEOF\n` đổi tên thành `hong.dxf`).

Kiểm: dòng đó vẫn báo "Đã tạo" (sản phẩm được tạo, chỉ convert hỏng), và ở danh sách sản phẩm hiện banner cảnh báo CAD lỗi sẵn có. Đây là hành vi đúng — sản phẩm vẫn tồn tại để người dùng thay file khác, khớp với cách upload lẻ đang chạy.

- [ ] **Step 7: Dọn rác tạm**

```bash
cd floor-manager && ls storage/tmp
```

Kỳ vọng: trống hoặc không có file mới sinh ra từ lần nhập vừa rồi. Có file đọng lại nghĩa là còn nhánh nào quên gọi `discard()`.

---

## Task 13: Chuẩn bị deploy

**Files:** không sửa file nào.

- [ ] **Step 1: Kiểm mã trùng trên DB thật TRƯỚC khi deploy**

Trên VPS:

```bash
docker exec floor-manager-postgres-1 psql -U floormanager -d floormanager -c \
  "select project_id, code, count(*) from products group by project_id, code having count(*) > 1;"
```

**Nếu có dòng nào trả về, dừng lại.** `prisma migrate deploy` sẽ thất bại giữa chừng. Phải sửa mã trùng bằng tay trên giao diện (hoặc bằng SQL) trước, rồi chạy lại câu kiểm tra cho tới khi `(0 rows)`.

- [ ] **Step 2: Deploy backend**

```bash
cd /opt/app/3d_planer && git pull
cd floor-manager && npm ci && npx prisma migrate deploy && npx prisma generate
pm2 restart backend
pm2 logs backend --lines 30
```

Kỳ vọng: log không có lỗi migration. Nếu có file CAD đang dở từ trước, thấy dòng `Đưa lại N file CAD vào hàng đợi convert`.

- [ ] **Step 3: Deploy frontend**

```bash
cd /opt/app/3d_planer/floor-manager-web && npm ci && npm run build
pm2 restart frontend
```

- [ ] **Step 4: Xác nhận frontend mới thật sự được phục vụ**

```bash
cat build/client/_app/version.json
curl -s https://layout.vhe.com.vn/_app/version.json
```

Hai giá trị phải **giống nhau**. Khác nhau nghĩa là nginx hoặc pm2 đang phục vụ bản build cũ ở thư mục khác — đây đúng là vấn đề đã gặp trước đây, và phải xử lý xong thì tính năng mới lên được.

---

## Ghi chú: việc phát sinh, không làm trong kế hoạch này

`loadProductCatalog()` tải footprint của **từng** sản phẩm bằng một request riêng
(`floor-manager-web/src/lib/stores/productCatalog.ts:41`). Với 9 sản phẩm thì không ai
để ý; sau khi nhập thêm 50 sản phẩm CAD thì thành khoảng 60 request mỗi lần mở editor.
Chưa đến mức hỏng nhưng sẽ chậm thấy rõ. Cách sửa là gộp footprint vào thẳng
`GET /products`. Việc riêng, làm sau, không nằm trong kế hoạch này.
