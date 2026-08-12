# Site/Layout Restructure Implementation Plan (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách Layout khỏi Project — thêm thực thể `Site` (mặt bằng vật lý), 1 layout chứa block của nhiều dự án; migration giữ nguyên dữ liệu cũ; UI quản lý site/layout.

**Architecture:** Backend Express 5 + Prisma 7 + Postgres (`floor-manager/`), frontend SvelteKit + Svelte 5 (`floor-manager-web/`). `Layout.projectId` → `Layout.siteId`; Project chỉ còn sở hữu Products. Snapshot/Position giữ nguyên nên editor không đổi — chỉ đổi cách nạp catalog (tất cả product thay vì theo project).

**Tech Stack:** Prisma migrate (SQL hand-edited backfill), vitest + supertest (backend test — mới), svelte-check (frontend).

**Spec:** `docs/superpowers/specs/2026-08-12-floor-manager-full-spec-design.md` mục 3 + giai đoạn 1 roadmap.

---

## Bối cảnh cho người không biết repo

- Backend chạy: `npm run server` trong `floor-manager/` (port 4000). DB: `docker compose up -d postgres` trong `floor-manager/` (user `floormanager` / pass `floormanager123`, db `floormanager`). Nếu lỗi PrismaClient: `npx prisma generate`.
- Frontend chạy: `npm run dev` trong `floor-manager-web/` (port 5173).
- Backend chưa có test framework — Task 1 thêm vitest + supertest.
- Mọi lệnh dưới đây chạy trong thư mục ghi ở đầu lệnh. Commit message viết bằng **tiếng Anh**.

## File Structure

| File | Trách nhiệm |
|---|---|
| `floor-manager/server/app.ts` (create) | Tạo Express app (tách khỏi listen để supertest dùng được) |
| `floor-manager/server/index.ts` (modify) | Chỉ còn dotenv + listen |
| `floor-manager/vitest.config.ts`, `floor-manager/tests/setup.ts` (create) | Hạ tầng test, truncate DB giữa các test |
| `floor-manager/tests/*.test.ts` (create) | Integration test cho routes |
| `floor-manager/prisma/schema.prisma` (modify) | Thêm `Site`, Layout.siteId |
| `floor-manager/server/routes/sites.ts` (create) | CRUD site |
| `floor-manager/server/routes/{layouts,projects,reports}.ts` (modify) | siteId filter; bỏ layouts khỏi project; occupation theo product.projectId |
| `floor-manager-web/src/lib/services/api.ts` (modify) | ApiSite, api.sites, ApiLayout.siteId |
| `floor-manager-web/src/lib/stores/productCatalog.ts`, `src/lib/services/datastore.ts` (modify) | Nạp catalog TẤT CẢ product |
| `floor-manager-web/src/routes/+page.svelte` (modify) | Trang chủ: 2 khu — Mặt bằng (sites) + Dự án |
| `floor-manager-web/src/routes/site/[id]/+page.svelte` (create) | Danh sách layout của site (chuyển từ trang project) |
| `floor-manager-web/src/routes/project/[id]/` (delete) | Trang project bỏ — card dự án link thẳng tới products |
| `floor-manager-web/src/routes/{products,reports}/[projectId]/+page.svelte` (modify) | Sửa link quay lại; reports chọn layout từ toàn bộ site |

**Lưu ý xuyên suốt:** sau Task 7, `npm run check` (frontend) sẽ còn lỗi ở các file chưa sửa — chỉ xanh hoàn toàn ở cuối Task 11. Backend test phải xanh sau MỖI task backend.

---

### Task 1: Hạ tầng test backend (vitest + supertest)

**Files:**
- Create: `floor-manager/server/app.ts`
- Modify: `floor-manager/server/index.ts`
- Create: `floor-manager/vitest.config.ts`
- Create: `floor-manager/tests/setup.ts`
- Create: `floor-manager/tests/app.test.ts`
- Modify: `floor-manager/package.json` (scripts + devDeps)

- [ ] **Step 1: Cài đặt dependency**

Chạy trong `floor-manager/`:
```powershell
npm install -D vitest supertest @types/supertest cross-env
```

- [ ] **Step 2: Tạo database test (một lần)**

```powershell
docker compose up -d postgres
docker compose exec postgres psql -U floormanager -c "CREATE DATABASE floormanager_test;"
```
Expected: `CREATE DATABASE`. Nếu báo `already exists` → bỏ qua, không sao.

- [ ] **Step 3: Tách app khỏi listen**

Tạo `floor-manager/server/app.ts`:
```ts
import express from 'express';
import cors from 'cors';
import path from 'path';
import projectsRouter from './routes/projects.js';
import productsRouter from './routes/products.js';
import layoutsRouter from './routes/layouts.js';
import snapshotsRouter from './routes/snapshots.js';
import reportsRouter from './routes/reports.js';
import filesRouter from './routes/files.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(import.meta.dirname, '../uploads')));

app.use('/api/projects', projectsRouter);
app.use('/api/products', productsRouter);
app.use('/api/layouts', layoutsRouter);
app.use('/api/snapshots', snapshotsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/files', filesRouter);

export default app;
```

Thay toàn bộ nội dung `floor-manager/server/index.ts` bằng:
```ts
import dotenv from 'dotenv';
dotenv.config();

const { default: app } = await import('./app.js');
const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```
(dynamic import để dotenv chạy trước khi `db.ts` đọc `DATABASE_URL`.)

- [ ] **Step 4: Config vitest + setup truncate**

Tạo `floor-manager/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['tests/setup.ts'],
    fileParallelism: false, // các test file dùng chung 1 DB
  },
});
```

Tạo `floor-manager/tests/setup.ts`:
```ts
import { beforeEach, afterAll } from 'vitest';
import prisma from '../server/db.js';

if (!process.env.DATABASE_URL?.includes('_test')) {
  throw new Error('Tests must run against floormanager_test — dùng `npm test`, đừng chạy vitest trực tiếp');
}

beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "positions","snapshots","layouts","products","projects" CASCADE'
  );
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

- [ ] **Step 5: Thêm scripts vào `floor-manager/package.json`**

Trong khối `"scripts"` thêm:
```json
"test": "npm run test:migrate && cross-env DATABASE_URL=postgresql://floormanager:floormanager123@localhost:5432/floormanager_test vitest run",
"test:migrate": "cross-env DATABASE_URL=postgresql://floormanager:floormanager123@localhost:5432/floormanager_test prisma migrate deploy"
```

- [ ] **Step 6: Viết smoke test**

Tạo `floor-manager/tests/app.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('app', () => {
  it('GET /api/projects returns empty list on clean DB', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
```

- [ ] **Step 7: Chạy test**

Chạy trong `floor-manager/`: `npm test`
Expected: 1 passed. (migrate deploy áp migration `init` lên DB test trước.)

- [ ] **Step 8: Xác nhận server dev vẫn chạy**

`npm run server` → thấy `Server running on http://localhost:4000` → Ctrl+C.

- [ ] **Step 9: Commit**

```powershell
git add floor-manager/server/app.ts floor-manager/server/index.ts floor-manager/vitest.config.ts floor-manager/tests/ floor-manager/package.json floor-manager/package-lock.json
git commit -m "test: add vitest + supertest infrastructure for backend"
```

---

### Task 2: Schema — thêm Site, Layout.siteId, migration backfill

**Files:**
- Modify: `floor-manager/prisma/schema.prisma`
- Create: `floor-manager/prisma/migrations/<timestamp>_site_layout_independent/migration.sql` (sinh bởi CLI rồi sửa tay)
- Modify: `floor-manager/tests/setup.ts` (thêm "sites" vào TRUNCATE)

- [ ] **Step 1: Sửa schema**

Trong `floor-manager/prisma/schema.prisma`:

Thêm model mới (sau `datasource`):
```prisma
model Site {
  id        String   @id @default(cuid())
  name      String
  address   String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now()) @map("created_at")
  layouts   Layout[]

  @@map("sites")
}
```

Trong `model Project`: xóa dòng `layouts     Layout[]`.

Trong `model Layout`: thay
```prisma
  projectId      String     @map("project_id")
```
bằng
```prisma
  siteId         String     @map("site_id")
```
và thay
```prisma
  project        Project    @relation(fields: [projectId], references: [id], onDelete: Cascade)
```
bằng
```prisma
  site           Site       @relation(fields: [siteId], references: [id], onDelete: Restrict)
```

- [ ] **Step 2: Sinh migration KHÔNG apply**

Chạy trong `floor-manager/`:
```powershell
npx prisma migrate dev --create-only --name site_layout_independent
```
Expected: tạo `prisma/migrations/<timestamp>_site_layout_independent/migration.sql`.

- [ ] **Step 3: Sửa tay SQL migration để backfill**

Thay TOÀN BỘ nội dung file `migration.sql` vừa sinh bằng:
```sql
-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- Default site + backfill existing layouts (data-preserving)
INSERT INTO "sites" ("id", "name") VALUES ('site-default', 'Nhà máy chính');

ALTER TABLE "layouts" ADD COLUMN "site_id" TEXT;
UPDATE "layouts" SET "site_id" = 'site-default';
ALTER TABLE "layouts" ALTER COLUMN "site_id" SET NOT NULL;

ALTER TABLE "layouts" DROP CONSTRAINT "layouts_project_id_fkey";
ALTER TABLE "layouts" DROP COLUMN "project_id";

-- AddForeignKey
ALTER TABLE "layouts" ADD CONSTRAINT "layouts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 4: Apply lên DB dev + generate client**

```powershell
npx prisma migrate dev
```
Expected: `Your database is now in sync with your schema` + client regenerated. KHÔNG được có cảnh báo reset/mất dữ liệu — nếu Prisma đòi reset, DỪNG LẠI và kiểm tra lại SQL.

- [ ] **Step 5: Kiểm tra dữ liệu cũ còn nguyên**

```powershell
docker compose exec postgres psql -U floormanager -d floormanager -c "SELECT id, name, site_id FROM layouts; SELECT id, name FROM sites;"
```
Expected: mọi layout cũ có `site_id = site-default`; bảng sites có 1 dòng `Nhà máy chính`.

- [ ] **Step 6: Cập nhật TRUNCATE trong test setup**

Trong `floor-manager/tests/setup.ts`, thay câu TRUNCATE bằng:
```ts
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "positions","snapshots","layouts","sites","products","projects" CASCADE'
  );
```

- [ ] **Step 7: Chạy test**

`npm test`
Expected: 1 passed (test:migrate áp migration mới lên DB test).

- [ ] **Step 8: Commit**

```powershell
git add floor-manager/prisma/ floor-manager/tests/setup.ts
git commit -m "feat: add Site model, decouple Layout from Project with backfill migration"
```

---

### Task 3: Routes CRUD cho Site (TDD)

**Files:**
- Test: `floor-manager/tests/sites.test.ts`
- Create: `floor-manager/server/routes/sites.ts`
- Modify: `floor-manager/server/app.ts`

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/sites.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('sites', () => {
  it('creates a site and lists it with layout count', async () => {
    const created = await request(app)
      .post('/api/sites')
      .send({ name: 'Xưởng 1', address: 'KCN A' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Xưởng 1');
    expect(created.body.active).toBe(true);

    const res = await request(app).get('/api/sites');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._count.layouts).toBe(0);
  });

  it('rejects create without name', async () => {
    const res = await request(app).post('/api/sites').send({ address: 'x' });
    expect(res.status).toBe(400);
  });

  it('gets a site with its layouts', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    await request(app)
      .post('/api/layouts')
      .send({ siteId: site.id, name: 'Bãi A', widthM: 100, heightM: 50 });

    const res = await request(app).get(`/api/sites/${site.id}`);
    expect(res.status).toBe(200);
    expect(res.body.layouts).toHaveLength(1);
    expect(res.body.layouts[0].name).toBe('Bãi A');
  });

  it('updates a site', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    const res = await request(app)
      .put(`/api/sites/${site.id}`)
      .send({ name: 'S2', active: false });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('S2');
    expect(res.body.active).toBe(false);
  });

  it('deletes an empty site', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    const res = await request(app).delete(`/api/sites/${site.id}`);
    expect(res.status).toBe(204);
  });

  it('refuses to delete a site that has layouts', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    await request(app)
      .post('/api/layouts')
      .send({ siteId: site.id, name: 'L', widthM: 10, heightM: 10 });
    const res = await request(app).delete(`/api/sites/${site.id}`);
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

`npm test`
Expected: các test sites FAIL với 404 (route chưa tồn tại). Lưu ý: `POST /api/layouts` với `siteId` đã hoạt động sẵn vì route đó pass thẳng `req.body` vào Prisma.

- [ ] **Step 3: Viết route**

Tạo `floor-manager/server/routes/sites.ts`:
```ts
import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

// GET / — list sites with layout counts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const sites = await prisma.site.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { layouts: true } } },
    });
    res.json(sites);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /:id — single site with layouts (+ snapshot counts)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const site = await prisma.site.findUnique({
      where: { id: req.params.id },
      include: {
        layouts: {
          orderBy: { createdAt: 'desc' },
          include: { _count: { select: { snapshots: true } } },
        },
      },
    });
    if (!site) return res.status(404).json({ error: 'Not found' });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST / — create site
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, address } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const site = await prisma.site.create({
      data: { name: String(name).trim(), address },
    });
    res.status(201).json(site);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /:id — update site
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, address, active } = req.body;
    const site = await prisma.site.update({
      where: { id: req.params.id },
      data: { name, address, active },
    });
    res.json(site);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /:id — refuse when site still has layouts
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const layoutCount = await prisma.layout.count({
      where: { siteId: req.params.id },
    });
    if (layoutCount > 0) {
      return res.status(409).json({ error: 'Site has layouts — delete them first' });
    }
    await prisma.site.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

Trong `floor-manager/server/app.ts` thêm import và mount (cạnh các router khác):
```ts
import sitesRouter from './routes/sites.js';
```
```ts
app.use('/api/sites', sitesRouter);
```

- [ ] **Step 4: Chạy test — phải PASS**

`npm test` → Expected: tất cả pass.

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/routes/sites.ts floor-manager/server/app.ts floor-manager/tests/sites.test.ts
git commit -m "feat: sites CRUD routes with delete guard"
```

---

### Task 4: Layouts route lọc theo siteId (TDD)

**Files:**
- Test: `floor-manager/tests/layouts.test.ts`
- Modify: `floor-manager/server/routes/layouts.ts:7-21`

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/layouts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('layouts', () => {
  it('filters layouts by siteId', async () => {
    const site1 = (await request(app).post('/api/sites').send({ name: 'A' })).body;
    const site2 = (await request(app).post('/api/sites').send({ name: 'B' })).body;
    await request(app)
      .post('/api/layouts')
      .send({ siteId: site1.id, name: 'L1', widthM: 10, heightM: 10 });
    await request(app)
      .post('/api/layouts')
      .send({ siteId: site2.id, name: 'L2', widthM: 10, heightM: 10 });

    const res = await request(app).get(`/api/layouts?siteId=${site1.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('L1');

    const all = await request(app).get('/api/layouts');
    expect(all.body).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

`npm test`
Expected: FAIL — route đang lọc theo `projectId` (field không còn tồn tại → Prisma error 500 khi có query param, hoặc trả cả 2 khi lọc).

- [ ] **Step 3: Sửa route**

Trong `floor-manager/server/routes/layouts.ts`, thay handler `GET /` (dòng 6-21) bằng:
```ts
// GET /?siteId=xxx — list layouts with snapshot count
router.get('/', async (req: Request, res: Response) => {
  try {
    const { siteId } = req.query;
    const layouts = await prisma.layout.findMany({
      where: siteId ? { siteId: String(siteId) } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { snapshots: true } },
      },
    });
    res.json(layouts);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Chạy test — phải PASS**

`npm test` → Expected: tất cả pass.

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/routes/layouts.ts floor-manager/tests/layouts.test.ts
git commit -m "feat: filter layouts by siteId instead of projectId"
```

---

### Task 5: Projects route bỏ quan hệ layouts (TDD)

**Files:**
- Test: `floor-manager/tests/projects.test.ts`
- Modify: `floor-manager/server/routes/projects.ts:7-35`

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/projects.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('projects', () => {
  it('lists projects with product count only', async () => {
    const proj = (await request(app).post('/api/projects').send({ name: 'P1' })).body;
    await request(app)
      .post('/api/products')
      .send({ projectId: proj.id, name: 'Block', code: 'B1' });

    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(200);
    expect(res.body[0]._count).toEqual({ products: 1 });
  });

  it('gets a project with products, without layouts', async () => {
    const proj = (await request(app).post('/api/projects').send({ name: 'P1' })).body;
    const res = await request(app).get(`/api/projects/${proj.id}`);
    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.layouts).toBeUndefined();
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

`npm test`
Expected: FAIL 500 — projects route vẫn `include`/`_count` field `layouts` không còn trong schema.

- [ ] **Step 3: Sửa route**

Trong `floor-manager/server/routes/projects.ts`:

Handler `GET /` — thay khối `include` bằng:
```ts
      include: {
        _count: {
          select: { products: true },
        },
      },
```

Handler `GET /:id` — thay dòng `include: { layouts: true, products: true },` bằng:
```ts
      include: { products: true },
```

- [ ] **Step 4: Chạy test — phải PASS**

`npm test` → Expected: tất cả pass.

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/routes/projects.ts floor-manager/tests/projects.test.ts
git commit -m "feat: drop layout relation from projects routes"
```

---

### Task 6: Reports occupation lọc theo dự án của product (TDD)

Layout giờ chứa block nhiều dự án → filter `projectId` phải lọc theo `position.product.projectId` (trước đây lọc `layout.projectId`). Thêm `projectName` vào output để phân biệt.

**Files:**
- Test: `floor-manager/tests/reports.test.ts`
- Modify: `floor-manager/server/routes/reports.ts:80-193`

- [ ] **Step 1: Viết test fail**

Tạo `floor-manager/tests/reports.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

async function seedSharedLayout() {
  const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
  const layout = (
    await request(app)
      .post('/api/layouts')
      .send({ siteId: site.id, name: 'L', widthM: 100, heightM: 50 })
  ).body;
  const projA = (await request(app).post('/api/projects').send({ name: 'Du an A' })).body;
  const projB = (await request(app).post('/api/projects').send({ name: 'Du an B' })).body;
  const prodA = (
    await request(app)
      .post('/api/products')
      .send({ projectId: projA.id, name: 'Block A', code: 'A1', areaM2: 20 })
  ).body;
  const prodB = (
    await request(app)
      .post('/api/products')
      .send({ projectId: projB.id, name: 'Block B', code: 'B1', areaM2: 30 })
  ).body;
  await request(app).post('/api/snapshots').send({
    layoutId: layout.id,
    date: '2026-08-01',
    positions: [
      { productId: prodA.id, x: 1, y: 1 },
      { productId: prodB.id, x: 5, y: 5 },
    ],
  });
  await request(app).post('/api/snapshots').send({
    layoutId: layout.id,
    date: '2026-08-03',
    positions: [{ productId: prodA.id, x: 1, y: 1 }],
  });
  return { layout, projA, projB };
}

describe('reports/occupation', () => {
  it('returns all periods when no filter given', async () => {
    await seedSharedLayout();
    const res = await request(app).get('/api/reports/occupation');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('filters by product project on a shared layout and includes projectName', async () => {
    const { projA } = await seedSharedLayout();
    const res = await request(app).get(`/api/reports/occupation?projectId=${projA.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].productCode).toBe('A1');
    expect(res.body[0].projectName).toBe('Du an A');
  });

  it('still filters by layoutId', async () => {
    const { layout } = await seedSharedLayout();
    const res = await request(app).get(`/api/reports/occupation?layoutId=${layout.id}`);
    expect(res.body).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Chạy test — phải FAIL**

`npm test`
Expected: FAIL — occupation đang tìm layouts theo `projectId` (field đã bỏ → 500) và không có `projectName`.

- [ ] **Step 3: Sửa handler occupation**

Trong `floor-manager/server/routes/reports.ts`, thay TOÀN BỘ handler `GET /occupation` (từ comment `// GET /occupation` đến hết handler, dòng 80-193) bằng:
```ts
// GET /occupation?projectId=xxx&layoutId=xxx — both optional
// projectId now filters by the PRODUCT's project (layouts are cross-project)
router.get('/occupation', async (req: Request, res: Response) => {
  try {
    const { projectId, layoutId } = req.query as { projectId?: string; layoutId?: string };

    let layoutIds: string[];
    if (layoutId) {
      layoutIds = [layoutId];
    } else {
      const layouts = await prisma.layout.findMany({ select: { id: true } });
      layoutIds = layouts.map((l) => l.id);
    }
    if (layoutIds.length === 0) return res.json([]);

    const snapshots = await prisma.snapshot.findMany({
      where: { layoutId: { in: layoutIds } },
      orderBy: { date: 'asc' },
      include: {
        positions: {
          include: { product: { include: { project: { select: { name: true } } } } },
        },
        layout: true,
      },
    });

    type OccupationPeriod = {
      productName: string;
      productCode: string;
      projectName: string;
      layoutName: string;
      startDate: string;
      endDate: string;
      days: number;
      areaM2: number;
      areaDays: number;
    };

    type ActiveInfo = {
      startDate: Date;
      productName: string;
      productCode: string;
      projectName: string;
      areaM2: number;
    };

    const periods: OccupationPeriod[] = [];

    const snapshotsByLayout = new Map<string, typeof snapshots>();
    for (const s of snapshots) {
      const arr = snapshotsByLayout.get(s.layoutId) ?? [];
      arr.push(s);
      snapshotsByLayout.set(s.layoutId, arr);
    }

    for (const [, layoutSnapshots] of snapshotsByLayout) {
      if (layoutSnapshots.length === 0) continue;
      const layoutName = layoutSnapshots[0].layout.name;

      const active = new Map<string, ActiveInfo>();

      const pushPeriod = (info: ActiveInfo, endDate: Date) => {
        const days = Math.max(1, Math.round((endDate.getTime() - info.startDate.getTime()) / 86400000));
        periods.push({
          layoutName,
          productName: info.productName,
          productCode: info.productCode,
          projectName: info.projectName,
          areaM2: info.areaM2,
          startDate: info.startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
          days,
          areaDays: Math.round(info.areaM2 * days * 10) / 10,
        });
      };

    for (let i = 0; i < layoutSnapshots.length; i++) {
        const snap = layoutSnapshots[i];
        const snapDate = new Date(snap.date);
        // filter theo dự án của product (nếu có query projectId)
        const relevant = snap.positions.filter(
          (p) => !projectId || p.product.projectId === projectId
        );
        const presentProductIds = new Set(relevant.map((p) => p.productId));

        for (const [pid, info] of active) {
          if (!presentProductIds.has(pid)) {
            const prevSnap = layoutSnapshots[i - 1];
            pushPeriod(info, prevSnap ? new Date(prevSnap.date) : snapDate);
            active.delete(pid);
          }
        }

        for (const pos of relevant) {
          if (!active.has(pos.productId)) {
            active.set(pos.productId, {
              startDate: snapDate,
              productName: pos.product.name,
              productCode: pos.product.code,
              projectName: pos.product.project.name,
              areaM2: pos.product.areaM2 ?? 0,
            });
          }
        }
      }

      const lastDate = new Date(layoutSnapshots[layoutSnapshots.length - 1].date);
      for (const [, info] of active) {
        pushPeriod(info, lastDate);
      }
    }

    res.json(periods);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
```

- [ ] **Step 4: Chạy test — phải PASS**

`npm test` → Expected: tất cả pass.

- [ ] **Step 5: Commit**

```powershell
git add floor-manager/server/routes/reports.ts floor-manager/tests/reports.test.ts
git commit -m "feat: occupation report filters by product project, adds projectName"
```

---

### Task 7: Frontend api.ts — ApiSite, siteId, catalog toàn cục

**Files:**
- Modify: `floor-manager-web/src/lib/services/api.ts`
- Modify: `floor-manager-web/src/lib/stores/productCatalog.ts:28-29`
- Modify: `floor-manager-web/src/lib/services/datastore.ts:127-135`

- [ ] **Step 1: Sửa api.ts**

Trong `floor-manager-web/src/lib/services/api.ts`:

Thêm interface (sau `ApiProject`):
```ts
export interface ApiSite {
	id: string;
	name: string;
	address: string | null;
	active: boolean;
	createdAt: string;
	_count?: { layouts: number };
	layouts?: (ApiLayout & { _count?: { snapshots: number } })[];
}
```

Trong `ApiProject`: đổi dòng `_count?: { layouts: number; products: number };` thành:
```ts
	_count?: { products: number };
```

Trong `ApiLayout`: đổi dòng `projectId: string;` thành:
```ts
	siteId: string;
```

Trong `api.projects.get`: đổi kiểu trả về thành:
```ts
		get: (id: string) =>
			http<ApiProject & { products: ApiProduct[] }>(`/projects/${id}`),
```

Trong `api.products.list`: cho phép không truyền projectId:
```ts
		list: (projectId?: string) =>
			http<ApiProduct[]>(projectId ? `/products?projectId=${projectId}` : '/products'),
```

Thay `api.layouts.list` và `create`:
```ts
		list: (siteId?: string) =>
			http<ApiLayout[]>(siteId ? `/layouts?siteId=${siteId}` : '/layouts'),
```
```ts
		create: (data: {
			siteId: string;
			name: string;
			widthM: number;
			heightM: number;
			gridSize?: number;
		}) => http<ApiLayout>('/layouts', { method: 'POST', body: JSON.stringify(data) }),
```
và trong `layouts.update` đổi `Omit<ApiLayout, 'id' | 'projectId' | 'snapshots'>` thành `Omit<ApiLayout, 'id' | 'siteId' | 'snapshots'>`.

Thêm nhóm `sites` vào object `api` (trước `products`):
```ts
	sites: {
		list: () => http<ApiSite[]>('/sites'),
		get: (id: string) => http<ApiSite>(`/sites/${id}`),
		create: (data: { name: string; address?: string }) =>
			http<ApiSite>('/sites', { method: 'POST', body: JSON.stringify(data) }),
		update: (id: string, data: { name?: string; address?: string; active?: boolean }) =>
			http<ApiSite>(`/sites/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
		remove: (id: string) => http<void>(`/sites/${id}`, { method: 'DELETE' }),
	},
```

Trong `api.reports.occupation`: đổi tham số và kiểu trả về:
```ts
		occupation: (projectId?: string) =>
			http<
				{
					productName: string;
					productCode: string;
					projectName: string;
					layoutName: string;
					startDate: string;
					endDate: string;
					days: number;
					areaM2: number;
					areaDays: number;
				}[]
			>(projectId ? `/reports/occupation?projectId=${projectId}` : '/reports/occupation'),
```

- [ ] **Step 2: Catalog nạp TẤT CẢ product**

Trong `floor-manager-web/src/lib/stores/productCatalog.ts`, thay signature hàm (dòng 28-29):
```ts
export async function loadProductCatalog(): Promise<void> {
	const products = await api.products.list();
```

Trong `floor-manager-web/src/lib/services/datastore.ts` (backendStore.load, dòng 130-131), thay:
```ts
    // Catalog sản phẩm phải sẵn sàng trước khi canvas render các block
    await loadProductCatalog();
```

- [ ] **Step 3: Chạy svelte-check — ghi nhận lỗi còn lại**

Chạy trong `floor-manager-web/`: `npm run check`
Expected: CÒN lỗi ở `src/routes/+page.svelte`, `src/routes/project/[id]/+page.svelte`, `src/routes/reports/[projectId]/+page.svelte` (các file sửa ở Task 8-11). KHÔNG được có lỗi ở `api.ts`, `productCatalog.ts`, `datastore.ts`.

- [ ] **Step 4: Commit**

```powershell
git add floor-manager-web/src/lib/services/api.ts floor-manager-web/src/lib/stores/productCatalog.ts floor-manager-web/src/lib/services/datastore.ts
git commit -m "feat: frontend API client for sites, global product catalog"
```

---

### Task 8: Trang chủ — khu Mặt bằng (sites) + khu Dự án

Trang chủ chia 2 khu: **Mặt bằng** (site card → `/site/[id]`, nút tạo site) và **Dự án** (card → `/products/[projectId]` vì trang project sẽ bị xóa ở Task 10).

**Files:**
- Modify: `floor-manager-web/src/routes/+page.svelte` (thay toàn bộ)

- [ ] **Step 1: Thay toàn bộ nội dung `+page.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { api, type ApiProject, type ApiSite } from '$lib/services/api';

  let sites = $state<ApiSite[]>([]);
  let projects = $state<ApiProject[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  let showCreateProject = $state(false);
  let newName = $state('');
  let newDesc = $state('');
  let confirmDeleteProjectId = $state<string | null>(null);

  let showCreateSite = $state(false);
  let newSiteName = $state('');
  let newSiteAddress = $state('');
  let siteError = $state<string | null>(null);
  let confirmDeleteSiteId = $state<string | null>(null);

  async function refresh() {
    loading = true;
    loadError = null;
    try {
      [sites, projects] = await Promise.all([api.sites.list(), api.projects.list()]);
    } catch (e: any) {
      loadError = 'Không kết nối được backend (http://localhost:4000). Chạy: npm run server trong floor-manager/';
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  async function createSite() {
    if (!newSiteName.trim()) return;
    const s = await api.sites.create({ name: newSiteName.trim(), address: newSiteAddress.trim() || undefined });
    showCreateSite = false;
    newSiteName = '';
    newSiteAddress = '';
    goto(`${base}/site/${s.id}`);
  }

  async function deleteSite(id: string) {
    siteError = null;
    try {
      await api.sites.remove(id);
    } catch {
      siteError = 'Không xóa được: mặt bằng còn layout. Xóa các layout trước.';
    }
    confirmDeleteSiteId = null;
    await refresh();
  }

  async function createProject() {
    if (!newName.trim()) return;
    const p = await api.projects.create({ name: newName.trim(), description: newDesc.trim() || undefined });
    showCreateProject = false;
    newName = '';
    newDesc = '';
    goto(`${base}/products/${p.id}`);
  }

  async function deleteProject(id: string) {
    await api.projects.remove(id);
    confirmDeleteProjectId = null;
    await refresh();
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('vi-VN');
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-5xl mx-auto px-6 py-5 flex items-center gap-3">
      <div class="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white text-lg font-bold">◧</div>
      <div>
        <h1 class="text-2xl font-bold text-white">Floor Manager</h1>
        <p class="text-sm text-white/50 mt-0.5">Quản lý mặt bằng sản xuất · {sites.length} mặt bằng · {projects.length} dự án</p>
      </div>
    </div>
  </div>

  <div class="max-w-5xl mx-auto px-6 py-8">
    {#if loadError}
      <div class="bg-red-50 border border-red-200 text-red-700 rounded-xl px-5 py-4 text-sm">
        <p class="font-semibold">Lỗi kết nối</p>
        <p>{loadError}</p>
        <button onclick={refresh} class="mt-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-semibold hover:bg-red-700">Thử lại</button>
      </div>
    {:else if loading}
      <div class="text-center py-24 text-gray-400">Đang tải...</div>
    {:else}
      <!-- ===== Khu Mặt bằng ===== -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold text-gray-800">🏭 Mặt bằng ({sites.length})</h2>
        <button onclick={() => showCreateSite = true} class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">
          + Thêm mặt bằng
        </button>
      </div>
      {#if siteError}
        <div class="mb-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-2 text-sm">{siteError}</div>
      {/if}
      {#if sites.length === 0}
        <div class="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300 mb-10">
          <p class="text-gray-400 font-medium">Chưa có mặt bằng nào</p>
          <p class="text-sm text-gray-400 mt-1">Thêm mặt bằng (nhà máy, kho bãi...) để bắt đầu bố trí</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {#each sites as site}
            <div class="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all relative">
              <a href={`${base}/site/${site.id}`} class="block">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg">🏭</div>
                  <div class="min-w-0">
                    <h3 class="font-semibold text-gray-800 truncate">{site.name}</h3>
                    <p class="text-xs text-gray-400 truncate">{site.address ?? 'Chưa có địa chỉ'}</p>
                  </div>
                </div>
                <div class="flex gap-2 mt-3">
                  <span class="text-[11px] text-gray-500 bg-gray-100 rounded-md px-2 py-0.5">🗺 {site._count?.layouts ?? 0} layout</span>
                  {#if !site.active}
                    <span class="text-[11px] text-gray-400 bg-gray-100 rounded-md px-2 py-0.5">Ngừng dùng</span>
                  {/if}
                </div>
              </a>
              {#if confirmDeleteSiteId === site.id}
                <div class="absolute top-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 flex items-center gap-2 z-10">
                  <span class="text-xs text-gray-500">Xóa?</span>
                  <button onclick={() => deleteSite(site.id)} class="px-2 py-0.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Có</button>
                  <button onclick={() => confirmDeleteSiteId = null} class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300">Không</button>
                </div>
              {:else}
                <button
                  onclick={() => confirmDeleteSiteId = site.id}
                  class="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="Xóa mặt bằng" aria-label="Xóa mặt bằng"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <!-- ===== Khu Dự án ===== -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold text-gray-800">📦 Dự án ({projects.length})</h2>
        <button onclick={() => showCreateProject = true} class="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 font-semibold text-sm">
          + Tạo dự án
        </button>
      </div>
      {#if projects.length === 0}
        <div class="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300">
          <p class="text-gray-400 font-medium">Chưa có dự án nào</p>
          <p class="text-sm text-gray-400 mt-1">Tạo dự án để quản lý danh sách sản phẩm/block</p>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {#each projects as project}
            <div class="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all relative">
              <a href={`${base}/products/${project.id}`} class="block">
                <h3 class="font-semibold text-gray-800 truncate pr-8">{project.name}</h3>
                <p class="text-sm text-gray-400 mt-1 line-clamp-2 min-h-[2.5rem]">{project.description ?? 'Không có mô tả'}</p>
                <div class="flex gap-2 mt-3">
                  <span class="text-[11px] text-gray-500 bg-gray-100 rounded-md px-2 py-0.5">📦 {project._count?.products ?? 0} sản phẩm</span>
                </div>
                <p class="text-[11px] text-gray-400 mt-3">Cập nhật: {formatDate(project.updatedAt)}</p>
              </a>
              {#if confirmDeleteProjectId === project.id}
                <div class="absolute top-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 flex items-center gap-2 z-10">
                  <span class="text-xs text-gray-500">Xóa?</span>
                  <button onclick={() => deleteProject(project.id)} class="px-2 py-0.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Có</button>
                  <button onclick={() => confirmDeleteProjectId = null} class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300">Không</button>
                </div>
              {:else}
                <button
                  onclick={() => confirmDeleteProjectId = project.id}
                  class="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                  title="Xóa dự án" aria-label="Xóa dự án"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Create site modal -->
  {#if showCreateSite}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={() => showCreateSite = false} onkeydown={(e) => { if (e.key === 'Escape') showCreateSite = false; }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">Thêm mặt bằng</h2>
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Tên mặt bằng *</span>
          <input type="text" bind:value={newSiteName} placeholder="VD: Nhà máy 2, Kho thuê KCN B..."
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') createSite(); }} />
        </label>
        <label class="block mb-5">
          <span class="text-xs font-medium text-gray-500">Địa chỉ</span>
          <input type="text" bind:value={newSiteAddress} placeholder="Địa chỉ (không bắt buộc)"
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none" />
        </label>
        <div class="flex gap-2 justify-end">
          <button onclick={() => showCreateSite = false} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onclick={createSite} disabled={!newSiteName.trim()} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">Tạo mặt bằng</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Create project modal -->
  {#if showCreateProject}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={() => showCreateProject = false} onkeydown={(e) => { if (e.key === 'Escape') showCreateProject = false; }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">Tạo dự án mới</h2>
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Tên dự án *</span>
          <input type="text" bind:value={newName} placeholder="VD: Đơn hàng XYZ"
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') createProject(); }} />
        </label>
        <label class="block mb-5">
          <span class="text-xs font-medium text-gray-500">Mô tả</span>
          <textarea bind:value={newDesc} rows="2" placeholder="Mô tả ngắn về dự án..."
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none resize-none"></textarea>
        </label>
        <div class="flex gap-2 justify-end">
          <button onclick={() => showCreateProject = false} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onclick={createProject} disabled={!newName.trim()} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">Tạo dự án</button>
        </div>
      </div>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Kiểm tra biên dịch trang này**

`npm run check` trong `floor-manager-web/`
Expected: KHÔNG còn lỗi ở `src/routes/+page.svelte` (còn lỗi ở project/[id] và reports là bình thường — sửa ở Task 10-11).

- [ ] **Step 3: Commit**

```powershell
git add floor-manager-web/src/routes/+page.svelte
git commit -m "feat: home page with sites section and project cards linking to products"
```

---

### Task 9: Trang site/[id] — quản lý layout của mặt bằng

**Files:**
- Create: `floor-manager-web/src/routes/site/[id]/+page.svelte`

- [ ] **Step 1: Tạo trang**

Tạo `floor-manager-web/src/routes/site/[id]/+page.svelte`:
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { goto } from '$app/navigation';
  import { api, type ApiSite } from '$lib/services/api';

  const siteId = $page.params.id ?? '';

  let site = $state<ApiSite | null>(null);
  let loading = $state(true);

  let showCreateLayout = $state(false);
  let newLayoutName = $state('');
  let newLayoutW = $state(100);
  let newLayoutH = $state(60);
  let confirmDeleteId = $state<string | null>(null);

  async function refresh() {
    loading = true;
    try {
      site = await api.sites.get(siteId);
    } finally {
      loading = false;
    }
  }

  onMount(refresh);

  async function createLayout() {
    if (!newLayoutName.trim() || newLayoutW <= 0 || newLayoutH <= 0) return;
    const layout = await api.layouts.create({
      siteId,
      name: newLayoutName.trim(),
      widthM: newLayoutW,
      heightM: newLayoutH,
    });
    showCreateLayout = false;
    newLayoutName = '';
    goto(`${base}/editor?layoutId=${layout.id}`);
  }

  async function deleteLayout(id: string) {
    await api.layouts.remove(id);
    confirmDeleteId = null;
    await refresh();
  }
</script>

<div class="min-h-screen bg-gray-50">
  <!-- Header -->
  <div class="bg-gradient-to-r from-slate-800 to-slate-700 shadow-sm">
    <div class="max-w-5xl mx-auto px-6 py-4 flex items-center gap-4">
      <a href={base || '/'} class="flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Trang chủ
      </a>
      <div class="h-5 w-px bg-white/20"></div>
      <div class="flex-1 min-w-0">
        <h1 class="text-xl font-bold text-white truncate">🏭 {site?.name ?? '...'}</h1>
        {#if site?.address}
          <p class="text-xs text-white/50 truncate">{site.address}</p>
        {/if}
      </div>
    </div>
  </div>

  <div class="max-w-5xl mx-auto px-6 py-8">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-base font-bold text-gray-800">Layout ({site?.layouts?.length ?? 0})</h2>
      <button onclick={() => showCreateLayout = true} class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">
        + Thêm layout
      </button>
    </div>

    {#if loading}
      <div class="text-center py-16 text-gray-400">Đang tải...</div>
    {:else if !site || (site.layouts?.length ?? 0) === 0}
      <div class="text-center py-16 bg-white rounded-xl border border-dashed border-gray-300">
        <div class="text-4xl mb-3">🗺</div>
        <p class="text-gray-400 font-medium">Chưa có layout nào</p>
        <p class="text-sm text-gray-400 mt-1">Thêm layout (bãi chứa, khu xưởng...) để bắt đầu bố trí block</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each site.layouts ?? [] as layout}
          <div class="group bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:border-blue-200 transition-all relative">
            <a href={`${base}/editor?layoutId=${layout.id}`} class="block">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-lg">🗺</div>
                <div class="min-w-0">
                  <h3 class="font-semibold text-gray-800 truncate">{layout.name}</h3>
                  <p class="text-xs text-gray-400">{layout.widthM} × {layout.heightM} m · {layout._count?.snapshots ?? 0} snapshot</p>
                </div>
              </div>
              <div class="mt-3 text-xs text-blue-600 font-medium">Mở editor →</div>
            </a>
            {#if confirmDeleteId === layout.id}
              <div class="absolute top-3 right-3 bg-white border border-gray-200 rounded-lg shadow-lg px-2 py-1.5 flex items-center gap-2 z-10">
                <span class="text-xs text-gray-500">Xóa?</span>
                <button onclick={() => deleteLayout(layout.id)} class="px-2 py-0.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">Có</button>
                <button onclick={() => confirmDeleteId = null} class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded hover:bg-gray-300">Không</button>
              </div>
            {:else}
              <button
                onclick={() => confirmDeleteId = layout.id}
                class="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                title="Xóa layout" aria-label="Xóa layout"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Create layout modal -->
  {#if showCreateLayout}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onclick={() => showCreateLayout = false} onkeydown={(e) => { if (e.key === 'Escape') showCreateLayout = false; }} role="dialog" tabindex="-1">
      <div class="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full mx-4" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="document">
        <h2 class="text-lg font-bold text-gray-800 mb-4">Thêm layout</h2>
        <label class="block mb-3">
          <span class="text-xs font-medium text-gray-500">Tên layout *</span>
          <input type="text" bind:value={newLayoutName} placeholder="VD: Bãi A, Khu xưởng 1..."
            class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            onkeydown={(e) => { if (e.key === 'Enter') createLayout(); }} />
        </label>
        <div class="grid grid-cols-2 gap-3 mb-5">
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Chiều rộng (m)</span>
            <input type="number" bind:value={newLayoutW} min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
          <label class="block">
            <span class="text-xs font-medium text-gray-500">Chiều dài (m)</span>
            <input type="number" bind:value={newLayoutH} min="1" class="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400" />
          </label>
        </div>
        <div class="flex gap-2 justify-end">
          <button onclick={() => showCreateLayout = false} class="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Hủy</button>
          <button onclick={createLayout} disabled={!newLayoutName.trim()} class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40">Tạo & mở editor</button>
        </div>
      </div>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Kiểm tra biên dịch**

`npm run check` — Expected: không có lỗi ở `src/routes/site/[id]/+page.svelte`.

- [ ] **Step 3: Commit**

```powershell
git add floor-manager-web/src/routes/site/
git commit -m "feat: site detail page with layout management"
```

---

### Task 10: Xóa trang project/[id], sửa link trang products

Trang project chỉ còn vai trò trung gian (layout đã chuyển sang site) → xóa; card dự án ở trang chủ đã link thẳng `/products/[projectId]` (Task 8).

**Files:**
- Delete: `floor-manager-web/src/routes/project/` (cả thư mục)
- Modify: `floor-manager-web/src/routes/products/[projectId]/+page.svelte:47,112`

- [ ] **Step 1: Xóa thư mục**

```powershell
Remove-Item -Recurse -Force floor-manager-web/src/routes/project
```

- [ ] **Step 2: Sửa trang products**

Trong `floor-manager-web/src/routes/products/[projectId]/+page.svelte`:

Dòng 47 — `api.projects.get(projectId)` giờ trả về không có `layouts`; nếu code chỗ này gán kiểu có layouts thì chỉnh theo kiểu mới `ApiProject & { products: ApiProduct[] }` (đa số trường hợp không phải sửa vì chỉ dùng `proj.name`).

Dòng ~112 — link quay lại `href={`${base}/project/${projectId}`}` đổi thành:
```svelte
      <a href={base || '/'} class="flex items-center gap-1 text-white/70 hover:text-white text-sm transition-colors">
```
và đổi nhãn link (text node ngay sau svg) thành `Trang chủ`.

Kiểm tra thêm: trong trang products nếu có link tới `/reports/${projectId}` thì GIỮ NGUYÊN (trang reports vẫn theo project). Nếu chưa có, thêm nút cạnh header (copy pattern nút từ header cũ của trang project):
```svelte
      <a href={`${base}/reports/${projectId}`} class="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 text-sm font-medium border border-white/20 transition-colors">
        📊 Báo cáo
      </a>
```

- [ ] **Step 3: Kiểm tra biên dịch**

`npm run check` — Expected: chỉ còn lỗi ở `src/routes/reports/[projectId]/+page.svelte` (Task 11).

- [ ] **Step 4: Commit**

```powershell
git add -A floor-manager-web/src/routes/project floor-manager-web/src/routes/products
git commit -m "feat: remove project detail page, products page links back to home"
```

---

### Task 11: Trang reports — chọn layout từ toàn hệ thống

**Files:**
- Modify: `floor-manager-web/src/routes/reports/[projectId]/+page.svelte:33-46,127-137,153`

- [ ] **Step 1: Sửa onMount nạp layouts toàn cục**

Thay khối `onMount` (dòng 33-46) bằng:
```ts
  onMount(async () => {
    try {
      const [proj, allLayouts] = await Promise.all([
        api.projects.get(projectId),
        api.layouts.list(),
      ]);
      projectName = proj.name;
      layouts = allLayouts;
      if (layouts.length > 0) {
        selectedLayoutId = layouts[0].id;
        await onLayoutChange();
      }
      occupation = await api.reports.occupation(projectId);
    } finally {
      loading = false;
    }
  });
```

- [ ] **Step 2: Hiện cột Dự án trong bảng chiếm dụng PDF**

Trong `exportPDF()`, nhánh occupation (dòng ~124-141): thêm cột `Du an` sau `Ma`:
```ts
        head: [['San pham', 'Ma', 'Du an', 'Layout', 'Tu ngay', 'Den ngay', 'So ngay', 'Dien tich (m2)', 'm2 x ngay']],
        body: occupation.map((r) => [
          stripDiacritics(r.productName),
          r.productCode,
          stripDiacritics(r.projectName),
          stripDiacritics(r.layoutName),
          fmt(r.startDate),
          fmt(r.endDate),
          r.days,
          r.areaM2,
          r.areaDays,
        ]),
        foot: [['', '', '', '', '', '', '', 'Tong', occupation.reduce((s, r) => s + r.areaDays, 0).toFixed(1)]],
```
Nếu phần HTML của tab occupation (dưới template) render bảng có cột Layout, thêm cột "Dự án" tương tự (`{r.projectName}`) — tìm `layoutName` trong template để định vị.

- [ ] **Step 3: Sửa link quay lại**

Dòng ~153: đổi `href={`${base}/project/${projectId}`}` thành `href={`${base}/products/${projectId}`}` (nhãn giữ nguyên hoặc đổi thành `Sản phẩm`).

- [ ] **Step 4: svelte-check phải XANH hoàn toàn**

`npm run check` — Expected: **0 errors** trên toàn bộ project.

- [ ] **Step 5: Commit**

```powershell
git add floor-manager-web/src/routes/reports/
git commit -m "feat: reports page selects layouts globally, shows project column"
```

---

### Task 12: Kiểm tra tổng thể & hoàn tất

- [ ] **Step 1: Toàn bộ backend test**

Trong `floor-manager/`: `npm test` — Expected: tất cả pass.

- [ ] **Step 2: Frontend build**

Trong `floor-manager-web/`: `npm run build` — Expected: build thành công.

- [ ] **Step 3: Kiểm tra thủ công E2E**

Chạy backend (`npm run server` trong `floor-manager/`) + frontend (`npm run dev` trong `floor-manager-web/`), mở `http://localhost:5173`:

1. Trang chủ hiện khu "Mặt bằng" — thấy site "Nhà máy chính" (từ migration) chứa các layout cũ.
2. Tạo site mới "Kho thuê B" → vào trang site → tạo layout → editor mở được.
3. Tạo 2 dự án, mỗi dự án 1 sản phẩm (trang Products) → mở editor một layout → catalog hiện sản phẩm của CẢ 2 dự án → kéo cả 2 block vào, Lưu Snapshot.
4. Trang Reports của dự án 1: tab chiếm dụng chỉ hiện block của dự án 1 (dù layout chứa cả 2); tab summary chọn được layout bất kỳ.
5. Xóa site có layout → hiện thông báo lỗi thân thiện, không xóa.

Nếu bước nào sai → sửa trước khi sang bước tiếp.

- [ ] **Step 4: Commit cuối (nếu có sửa) & cập nhật README**

Trong `README.md` (repo root) — cập nhật mô tả cấu trúc: Site chứa Layout, Project chỉ chứa Product. Rồi:
```powershell
git add README.md
git commit -m "docs: update README for site/layout restructure"
```
