# Phase 5: Production Planning + Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production planning with Plan/PlanItem models, Gantt chart in the editor, and conflict detection with suggestions.

**Architecture:** New `Plan` and `PlanItem` Prisma models parallel to existing Snapshot/Position. Backend CRUD + conflict detection endpoint. Frontend adds a "Ke hoach" tab in the editor with a Gantt chart (pure HTML/CSS), plan toolbar, and conflict panel.

**Tech Stack:** Backend: Express 5, Prisma 7, vitest + supertest. Frontend: SvelteKit 5, Svelte 5 `$state`/`$derived`, Tailwind CSS, HTML5 drag-and-drop.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `floor-manager/prisma/schema.prisma` | **Modify** — add Plan, PlanItem models |
| `floor-manager/server/routes/plans.ts` | **Create** — CRUD plans + items + conflicts |
| `floor-manager/server/app.ts` | **Modify** — register plans router |
| `floor-manager/tests/setup.ts` | **Modify** — add plans/plan_items to TRUNCATE |
| `floor-manager/tests/plans.test.ts` | **Create** — test CRUD + conflict detection |
| `floor-manager-web/src/lib/services/api.ts` | **Modify** — add api.plans.* + types |
| `floor-manager-web/src/routes/editor/+page.svelte` | **Modify** — add tab bar |
| `floor-manager-web/src/lib/components/editor/PlanToolbar.svelte` | **Create** — plan selector + create/delete |
| `floor-manager-web/src/lib/components/editor/GanttChart.svelte` | **Create** — Gantt chart with drag/resize |
| `floor-manager-web/src/lib/components/editor/ConflictPanel.svelte` | **Create** — conflict warnings |

---

### Task 1: Prisma Schema + Migration

**Files:**
- Modify: `floor-manager/prisma/schema.prisma`
- Modify: `floor-manager/tests/setup.ts`

- [ ] **Step 1: Add Plan and PlanItem models to schema.prisma**

Add at the end of `floor-manager/prisma/schema.prisma` (before the closing of the file), and add `plans Plan[]` to the Layout model, and `planItems PlanItem[]` to the Product model:

In the `Layout` model, add after `snapshots Snapshot[]`:
```prisma
  plans      Plan[]
```

In the `Product` model, add after `positions Position[]`:
```prisma
  planItems  PlanItem[]
```

Add at end of file:
```prisma
model Plan {
  id        String     @id @default(cuid())
  layoutId  String     @map("layout_id")
  name      String
  active    Boolean    @default(true)
  createdAt DateTime   @default(now()) @map("created_at")
  layout    Layout     @relation(fields: [layoutId], references: [id], onDelete: Cascade)
  items     PlanItem[]

  @@map("plans")
}

model PlanItem {
  id        String   @id @default(cuid())
  planId    String   @map("plan_id")
  productId String   @map("product_id")
  x         Float
  y         Float
  rotation  Float    @default(0)
  startDate DateTime @map("start_date") @db.Date
  endDate   DateTime @map("end_date") @db.Date
  createdAt DateTime @default(now()) @map("created_at")
  plan      Plan     @relation(fields: [planId], references: [id], onDelete: Cascade)
  product   Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@map("plan_items")
}
```

- [ ] **Step 2: Run migration**

```bash
cd D:/3D/floor-manager && npx prisma migrate dev --name add_plan_and_plan_item
```

- [ ] **Step 3: Update test setup TRUNCATE**

In `floor-manager/tests/setup.ts`, update the TRUNCATE statement to include the new tables. Change line 24 from:
```typescript
    'TRUNCATE TABLE "positions","snapshots","layouts","sites","products","projects","assets","users" CASCADE'
```
to:
```typescript
    'TRUNCATE TABLE "plan_items","plans","positions","snapshots","layouts","sites","products","projects","assets","users" CASCADE'
```

- [ ] **Step 4: Generate Prisma client and run existing tests**

```bash
cd D:/3D/floor-manager && npx prisma generate && npm test
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
cd D:/3D/floor-manager
git add prisma/schema.prisma prisma/migrations/ tests/setup.ts
git commit -m "feat: add Plan and PlanItem models for production scheduling"
```

---

### Task 2: Backend — Plan + PlanItem CRUD Routes

**Files:**
- Create: `floor-manager/server/routes/plans.ts`
- Modify: `floor-manager/server/app.ts`
- Create: `floor-manager/tests/plans.test.ts`

- [ ] **Step 1: Create the plans route**

Create `floor-manager/server/routes/plans.ts`:

```typescript
import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Write operations require ADMIN or PLANNING role
router.use((req, _res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  return requireRole('ADMIN', 'PLANNING')(req, _res, next);
});

// GET /plans?layoutId=xxx
router.get('/', async (req: Request, res: Response) => {
  try {
    const { layoutId } = req.query;
    if (!layoutId) return res.status(400).json({ error: 'layoutId is required' });
    const plans = await prisma.plan.findMany({
      where: { layoutId: String(layoutId) },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { items: true } } },
    });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /plans
router.post('/', async (req: Request, res: Response) => {
  try {
    const { layoutId, name } = req.body;
    if (!layoutId || !name) return res.status(400).json({ error: 'layoutId and name are required' });
    const plan = await prisma.plan.create({ data: { layoutId, name } });
    res.status(201).json(plan);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /plans/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { name, active } = req.body;
    const plan = await prisma.plan.update({
      where: { id: String(req.params.id) },
      data: { ...(name !== undefined && { name }), ...(active !== undefined && { active }) },
    });
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /plans/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await prisma.plan.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /plans/:id/items
router.get('/:id/items', async (req: Request, res: Response) => {
  try {
    const items = await prisma.planItem.findMany({
      where: { planId: String(req.params.id) },
      orderBy: { startDate: 'asc' },
      include: {
        product: {
          select: { id: true, name: true, code: true, processStage: true, color: true, areaM2: true, weightKg: true, metadata: true },
        },
      },
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /plans/:id/items
router.post('/:id/items', async (req: Request, res: Response) => {
  try {
    const { productId, x, y, rotation, startDate, endDate } = req.body;
    if (!productId || x == null || y == null || !startDate || !endDate) {
      return res.status(400).json({ error: 'productId, x, y, startDate, endDate are required' });
    }
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }
    const item = await prisma.planItem.create({
      data: {
        planId: String(req.params.id),
        productId,
        x: Number(x),
        y: Number(y),
        rotation: Number(rotation ?? 0),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      },
      include: {
        product: {
          select: { id: true, name: true, code: true, processStage: true, color: true, areaM2: true, weightKg: true, metadata: true },
        },
      },
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PUT /plan-items/:id
router.put('/items/:id', async (req: Request, res: Response) => {
  try {
    const { x, y, rotation, startDate, endDate } = req.body;
    const data: Record<string, unknown> = {};
    if (x != null) data.x = Number(x);
    if (y != null) data.y = Number(y);
    if (rotation != null) data.rotation = Number(rotation);
    if (startDate) data.startDate = new Date(startDate);
    if (endDate) data.endDate = new Date(endDate);
    if (data.startDate && data.endDate && (data.startDate as Date) >= (data.endDate as Date)) {
      return res.status(400).json({ error: 'startDate must be before endDate' });
    }
    const item = await prisma.planItem.update({
      where: { id: String(req.params.id) },
      data,
      include: {
        product: {
          select: { id: true, name: true, code: true, processStage: true, color: true, areaM2: true, weightKg: true, metadata: true },
        },
      },
    });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /plan-items/:id
router.delete('/items/:id', async (req: Request, res: Response) => {
  try {
    await prisma.planItem.delete({ where: { id: String(req.params.id) } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /plans/:id/conflicts
router.get('/:id/conflicts', async (req: Request, res: Response) => {
  try {
    const items = await prisma.planItem.findMany({
      where: { planId: String(req.params.id) },
      include: {
        product: {
          select: { id: true, name: true, code: true, metadata: true },
        },
      },
    });

    type ConflictItem = { id: string; productName: string; startDate: string; endDate: string };
    type Conflict = { itemA: ConflictItem; itemB: ConflictItem; overlapStart: string; overlapEnd: string };
    type Suggestion = { itemId: string; suggestedStart: string; reason: string };

    const conflicts: Conflict[] = [];
    const conflictedIds = new Set<string>();

    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];

        // Check time overlap
        const aStart = new Date(a.startDate).getTime();
        const aEnd = new Date(a.endDate).getTime();
        const bStart = new Date(b.startDate).getTime();
        const bEnd = new Date(b.endDate).getTime();
        if (aStart >= bEnd || bStart >= aEnd) continue;

        // Check bounding box overlap
        const aMeta = a.product.metadata as { widthM?: number; depthM?: number } | null;
        const bMeta = b.product.metadata as { widthM?: number; depthM?: number } | null;
        const aW = (aMeta?.widthM ?? 1) / 2;
        const aD = (aMeta?.depthM ?? 1) / 2;
        const bW = (bMeta?.widthM ?? 1) / 2;
        const bD = (bMeta?.depthM ?? 1) / 2;

        const xOverlap = Math.abs(a.x - b.x) < (aW + bW);
        const yOverlap = Math.abs(a.y - b.y) < (aD + bD);
        if (!xOverlap || !yOverlap) continue;

        const overlapStart = new Date(Math.max(aStart, bStart));
        const overlapEnd = new Date(Math.min(aEnd, bEnd));

        conflicts.push({
          itemA: { id: a.id, productName: a.product.name, startDate: a.startDate.toISOString().slice(0, 10), endDate: a.endDate.toISOString().slice(0, 10) },
          itemB: { id: b.id, productName: b.product.name, startDate: b.startDate.toISOString().slice(0, 10), endDate: b.endDate.toISOString().slice(0, 10) },
          overlapStart: overlapStart.toISOString().slice(0, 10),
          overlapEnd: overlapEnd.toISOString().slice(0, 10),
        });
        conflictedIds.add(a.id);
        conflictedIds.add(b.id);
      }
    }

    // Suggestions: for each conflicted item, find earliest start after all overlapping items at same position
    const suggestions: Suggestion[] = [];
    for (const id of conflictedIds) {
      const item = items.find((i) => i.id === id)!;
      const overlapping = items.filter((other) => {
        if (other.id === id) return false;
        const oMeta = other.product.metadata as { widthM?: number; depthM?: number } | null;
        const iMeta = item.product.metadata as { widthM?: number; depthM?: number } | null;
        const iW = (iMeta?.widthM ?? 1) / 2;
        const iD = (iMeta?.depthM ?? 1) / 2;
        const oW = (oMeta?.widthM ?? 1) / 2;
        const oD = (oMeta?.depthM ?? 1) / 2;
        return Math.abs(item.x - other.x) < (iW + oW) && Math.abs(item.y - other.y) < (iD + oD);
      });
      if (overlapping.length === 0) continue;

      // Find the latest endDate of all overlapping items
      const latestEnd = overlapping.reduce(
        (max, o) => Math.max(max, new Date(o.endDate).getTime()),
        0
      );
      const suggestedStart = new Date(latestEnd);
      // Add 1 day
      suggestedStart.setDate(suggestedStart.getDate() + 1);

      suggestions.push({
        itemId: id,
        suggestedStart: suggestedStart.toISOString().slice(0, 10),
        reason: `Thoi gian som nhat khong xung dot tai vi tri (${item.x}, ${item.y})`,
      });
    }

    res.json({ conflicts, suggestions });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

- [ ] **Step 2: Register route in app.ts**

In `floor-manager/server/app.ts`, add import:
```typescript
import plansRouter from './routes/plans.js';
```

Add route (after the layouts line):
```typescript
app.use('/api/plans', requireAuth, plansRouter);
```

- [ ] **Step 3: Write tests**

Create `floor-manager/tests/plans.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken, viewerToken } from './setup.js';

async function seedSiteLayout() {
  const token = adminToken();
  const site = (await request(app).post('/api/sites').set('Cookie', `access_token=${token}`).send({ name: 'S' })).body;
  const layout = (await request(app).post('/api/layouts').set('Cookie', `access_token=${token}`).send({ siteId: site.id, name: 'L', widthM: 100, heightM: 50 })).body;
  return { site, layout };
}

async function seedProduct(overrides?: { widthM?: number; depthM?: number; name?: string; code?: string }) {
  const token = adminToken();
  const project = (await request(app).post('/api/projects').set('Cookie', `access_token=${token}`).send({ name: 'P' })).body;
  const metadata: Record<string, number> = {};
  if (overrides?.widthM) metadata.widthM = overrides.widthM;
  if (overrides?.depthM) metadata.depthM = overrides.depthM;
  const product = (await request(app).post('/api/products').set('Cookie', `access_token=${token}`).send({
    projectId: project.id,
    name: overrides?.name ?? 'Block',
    code: overrides?.code ?? 'B1',
    processStage: 'Han',
    metadata: Object.keys(metadata).length ? metadata : null,
  })).body;
  return { project, product };
}

describe('Plan CRUD', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/plans?layoutId=x')).status).toBe(401);
  });

  it('requires layoutId query', async () => {
    const res = await request(app).get('/api/plans').set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it('creates, lists, updates, deletes a plan', async () => {
    const { layout } = await seedSiteLayout();
    const token = adminToken();

    // Create
    const created = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'Plan T9' })).body;
    expect(created.name).toBe('Plan T9');
    expect(created.active).toBe(true);

    // List
    const list = (await request(app).get(`/api/plans?layoutId=${layout.id}`).set('Cookie', `access_token=${token}`)).body;
    expect(list).toHaveLength(1);
    expect(list[0]._count.items).toBe(0);

    // Update
    const updated = (await request(app).put(`/api/plans/${created.id}`).set('Cookie', `access_token=${token}`)
      .send({ name: 'Plan T10', active: false })).body;
    expect(updated.name).toBe('Plan T10');
    expect(updated.active).toBe(false);

    // Delete
    const del = await request(app).delete(`/api/plans/${created.id}`).set('Cookie', `access_token=${token}`);
    expect(del.status).toBe(204);
    const after = (await request(app).get(`/api/plans?layoutId=${layout.id}`).set('Cookie', `access_token=${token}`)).body;
    expect(after).toHaveLength(0);
  });

  it('VIEWER cannot create plans', async () => {
    const { layout } = await seedSiteLayout();
    const res = await request(app).post('/api/plans').set('Cookie', `access_token=${viewerToken()}`)
      .send({ layoutId: layout.id, name: 'X' });
    expect(res.status).toBe(403);
  });
});

describe('PlanItem CRUD', () => {
  it('creates, lists, updates, deletes plan items', async () => {
    const { layout } = await seedSiteLayout();
    const { product } = await seedProduct();
    const token = adminToken();

    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Create item
    const item = (await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: product.id, x: 10, y: 20, startDate: '2026-09-01', endDate: '2026-09-15' })).body;
    expect(item.x).toBe(10);
    expect(item.product.name).toBe('Block');

    // List items
    const items = (await request(app).get(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)).body;
    expect(items).toHaveLength(1);

    // Update item
    const updated = (await request(app).put(`/api/plans/items/${item.id}`).set('Cookie', `access_token=${token}`)
      .send({ startDate: '2026-09-05', endDate: '2026-09-20' })).body;
    expect(updated.startDate).toContain('2026-09-05');

    // Delete item
    expect((await request(app).delete(`/api/plans/items/${item.id}`).set('Cookie', `access_token=${token}`)).status).toBe(204);
    const after = (await request(app).get(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)).body;
    expect(after).toHaveLength(0);
  });

  it('rejects startDate >= endDate', async () => {
    const { layout } = await seedSiteLayout();
    const { product } = await seedProduct();
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    const res = await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: product.id, x: 0, y: 0, startDate: '2026-09-15', endDate: '2026-09-01' });
    expect(res.status).toBe(400);
  });

  it('rejects missing required fields', async () => {
    const { layout } = await seedSiteLayout();
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    const res = await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ x: 0, y: 0 });
    expect(res.status).toBe(400);
  });
});

describe('Conflict Detection', () => {
  it('returns empty when no conflicts', async () => {
    const { layout } = await seedSiteLayout();
    const { product: pA } = await seedProduct({ name: 'A', code: 'A1', widthM: 2, depthM: 2 });
    const { product: pB } = await seedProduct({ name: 'B', code: 'B1', widthM: 2, depthM: 2 });
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Same time but different positions (far apart)
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pA.id, x: 0, y: 0, startDate: '2026-09-01', endDate: '2026-09-15' });
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pB.id, x: 50, y: 50, startDate: '2026-09-01', endDate: '2026-09-15' });

    const res = await request(app).get(`/api/plans/${plan.id}/conflicts`).set('Cookie', `access_token=${token}`);
    expect(res.body.conflicts).toHaveLength(0);
    expect(res.body.suggestions).toHaveLength(0);
  });

  it('detects time + position overlap and suggests resolution', async () => {
    const { layout } = await seedSiteLayout();
    const { product: pA } = await seedProduct({ name: 'A', code: 'A1', widthM: 4, depthM: 4 });
    const { product: pB } = await seedProduct({ name: 'B', code: 'B1', widthM: 4, depthM: 4 });
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Same position, overlapping time
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pA.id, x: 10, y: 10, startDate: '2026-09-01', endDate: '2026-09-15' });
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pB.id, x: 10, y: 10, startDate: '2026-09-10', endDate: '2026-09-25' });

    const res = await request(app).get(`/api/plans/${plan.id}/conflicts`).set('Cookie', `access_token=${token}`);
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.conflicts[0].overlapStart).toBe('2026-09-10');
    expect(res.body.conflicts[0].overlapEnd).toBe('2026-09-15');
    expect(res.body.suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('no conflict when time ranges do not overlap', async () => {
    const { layout } = await seedSiteLayout();
    const { product: pA } = await seedProduct({ name: 'A', code: 'A1', widthM: 4, depthM: 4 });
    const { product: pB } = await seedProduct({ name: 'B', code: 'B1', widthM: 4, depthM: 4 });
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Same position but sequential time
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pA.id, x: 10, y: 10, startDate: '2026-09-01', endDate: '2026-09-10' });
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pB.id, x: 10, y: 10, startDate: '2026-09-10', endDate: '2026-09-20' });

    const res = await request(app).get(`/api/plans/${plan.id}/conflicts`).set('Cookie', `access_token=${token}`);
    expect(res.body.conflicts).toHaveLength(0);
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd D:/3D/floor-manager && npm test
```

Expected: all tests pass including new plan tests.

- [ ] **Step 5: Commit**

```bash
cd D:/3D/floor-manager
git add server/routes/plans.ts server/app.ts tests/plans.test.ts
git commit -m "feat: add Plan/PlanItem CRUD routes with conflict detection"
```

---

### Task 3: Frontend — API Client + Types

**Files:**
- Modify: `floor-manager-web/src/lib/services/api.ts`

- [ ] **Step 1: Add types and api.plans methods**

In `floor-manager-web/src/lib/services/api.ts`, add after the `ApiDashboard` interface:

```typescript
export interface ApiPlan {
  id: string;
  layoutId: string;
  name: string;
  active: boolean;
  createdAt: string;
  _count?: { items: number };
}

export interface ApiPlanItem {
  id: string;
  planId: string;
  productId: string;
  x: number;
  y: number;
  rotation: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  product?: {
    id: string;
    name: string;
    code: string;
    processStage: string | null;
    color: string;
    areaM2: number | null;
    weightKg: number | null;
    metadata: { widthM?: number; depthM?: number; heightM?: number } | null;
  };
}

export interface ApiConflict {
  itemA: { id: string; productName: string; startDate: string; endDate: string };
  itemB: { id: string; productName: string; startDate: string; endDate: string };
  overlapStart: string;
  overlapEnd: string;
}

export interface ApiConflictResult {
  conflicts: ApiConflict[];
  suggestions: { itemId: string; suggestedStart: string; reason: string }[];
}
```

Add inside the `api` object (after `dashboard`):

```typescript
  plans: {
    list: (layoutId: string) => http<ApiPlan[]>(`/plans?layoutId=${layoutId}`),
    create: (data: { layoutId: string; name: string }) =>
      http<ApiPlan>('/plans', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: { name?: string; active?: boolean }) =>
      http<ApiPlan>(`/plans/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: string) => http<void>(`/plans/${id}`, { method: 'DELETE' }),
    items: (planId: string) => http<ApiPlanItem[]>(`/plans/${planId}/items`),
    createItem: (planId: string, data: { productId: string; x: number; y: number; rotation?: number; startDate: string; endDate: string }) =>
      http<ApiPlanItem>(`/plans/${planId}/items`, { method: 'POST', body: JSON.stringify(data) }),
    updateItem: (itemId: string, data: { x?: number; y?: number; rotation?: number; startDate?: string; endDate?: string }) =>
      http<ApiPlanItem>(`/plans/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) }),
    removeItem: (itemId: string) => http<void>(`/plans/items/${itemId}`, { method: 'DELETE' }),
    conflicts: (planId: string) => http<ApiConflictResult>(`/plans/${planId}/conflicts`),
  },
```

- [ ] **Step 2: Verify build**

```bash
cd D:/3D/floor-manager-web && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd D:/3D/floor-manager-web
git add src/lib/services/api.ts
git commit -m "feat: add api.plans client with types for Plan, PlanItem, Conflict"
```

---

### Task 4: Frontend — Editor Tab Bar

**Files:**
- Modify: `floor-manager-web/src/routes/editor/+page.svelte`

- [ ] **Step 1: Add tab state and tab bar UI**

In the `<script>` block of `editor/+page.svelte`, add after the existing state variables:

```typescript
  let activeTab = $state<'layout' | 'planning'>('layout');
```

Add lazy-load for the planning components (similar to ThreeViewer pattern):

```typescript
  let GanttChart: any = $state(null);
  let PlanToolbar: any = $state(null);
  let ConflictPanel: any = $state(null);
  $effect(() => {
    if (activeTab === 'planning' && !GanttChart) {
      Promise.all([
        import('$lib/components/editor/GanttChart.svelte'),
        import('$lib/components/editor/PlanToolbar.svelte'),
        import('$lib/components/editor/ConflictPanel.svelte'),
      ]).then(([g, p, c]) => {
        GanttChart = g.default;
        PlanToolbar = p.default;
        ConflictPanel = c.default;
      });
    }
  });
```

Add plan state:

```typescript
  import type { ApiPlan, ApiPlanItem, ApiConflictResult } from '$lib/services/api';

  let plans = $state<ApiPlan[]>([]);
  let selectedPlanId = $state<string | null>(null);
  let planItems = $state<ApiPlanItem[]>([]);
  let conflictResult = $state<ApiConflictResult | null>(null);

  async function loadPlans() {
    if (!backendLayoutId) return;
    plans = await api.plans.list(backendLayoutId);
    if (plans.length > 0 && !selectedPlanId) selectedPlanId = plans[0].id;
    if (selectedPlanId) await loadPlanItems();
  }

  async function loadPlanItems() {
    if (!selectedPlanId) { planItems = []; conflictResult = null; return; }
    planItems = await api.plans.items(selectedPlanId);
    conflictResult = await api.plans.conflicts(selectedPlanId);
  }
```

- [ ] **Step 2: Add tab bar to the template**

In the template, inside `{#if ready}`, wrap the existing content area with a tab bar. Right after `<TopBar .../>` (line 131), before the `<div class="flex flex-1 overflow-hidden">`, add:

```svelte
    <!-- Tab bar (only in backend mode) -->
    {#if backendLayoutId}
      <div class="flex border-b border-gray-200 bg-white px-4">
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'layout' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => activeTab = 'layout'}
        >Bo tri</button>
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'planning' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}"
          onclick={() => { activeTab = 'planning'; loadPlans(); }}
        >Ke hoach</button>
      </div>
    {/if}
```

Wrap the existing editor content (the `<div class="flex flex-1 overflow-hidden">` through the `TimelineBar`) so it only shows when `activeTab === 'layout'` or not in backend mode:

```svelte
    {#if activeTab === 'layout' || !backendLayoutId}
      <!-- existing editor content here -->
      <div class="flex flex-1 overflow-hidden">
        ...existing code...
      </div>
      {#if backendLayoutId}
        <TimelineBar layoutId={backendLayoutId} />
      {/if}
    {:else}
      <!-- Planning tab -->
      <div class="flex flex-1 overflow-hidden flex-col">
        {#if PlanToolbar && GanttChart && ConflictPanel}
          <PlanToolbar
            {plans}
            {selectedPlanId}
            layoutId={backendLayoutId}
            onSelectPlan={(id) => { selectedPlanId = id; loadPlanItems(); }}
            onPlansChanged={loadPlans}
          />
          <div class="flex-1 overflow-auto">
            <GanttChart
              items={planItems}
              planId={selectedPlanId}
              conflicts={conflictResult?.conflicts ?? []}
              onItemsChanged={loadPlanItems}
            />
          </div>
          <ConflictPanel
            conflicts={conflictResult?.conflicts ?? []}
            suggestions={conflictResult?.suggestions ?? []}
            planId={selectedPlanId}
            onApplySuggestion={loadPlanItems}
          />
        {:else}
          <div class="flex items-center justify-center h-full text-gray-400">Dang tai...</div>
        {/if}
      </div>
    {/if}
```

- [ ] **Step 3: Verify build**

```bash
cd D:/3D/floor-manager-web && npm run build
```

Note: build will fail because the 3 components don't exist yet. Create placeholder files first:

Create `floor-manager-web/src/lib/components/editor/PlanToolbar.svelte`:
```svelte
<script lang="ts">
  import type { ApiPlan } from '$lib/services/api';
  let { plans = [], selectedPlanId = null, layoutId = '', onSelectPlan = (_id: string) => {}, onPlansChanged = () => {} }: {
    plans: ApiPlan[];
    selectedPlanId: string | null;
    layoutId: string;
    onSelectPlan: (id: string) => void;
    onPlansChanged: () => void;
  } = $props();
</script>
<div class="p-2 border-b border-gray-200 bg-gray-50 text-sm text-gray-500">PlanToolbar placeholder</div>
```

Create `floor-manager-web/src/lib/components/editor/GanttChart.svelte`:
```svelte
<script lang="ts">
  import type { ApiPlanItem, ApiConflict } from '$lib/services/api';
  let { items = [], planId = null, conflicts = [], onItemsChanged = () => {} }: {
    items: ApiPlanItem[];
    planId: string | null;
    conflicts: ApiConflict[];
    onItemsChanged: () => void;
  } = $props();
</script>
<div class="p-4 text-sm text-gray-500">GanttChart placeholder — {items.length} items</div>
```

Create `floor-manager-web/src/lib/components/editor/ConflictPanel.svelte`:
```svelte
<script lang="ts">
  import type { ApiConflict } from '$lib/services/api';
  let { conflicts = [], suggestions = [], planId = null, onApplySuggestion = () => {} }: {
    conflicts: ApiConflict[];
    suggestions: { itemId: string; suggestedStart: string; reason: string }[];
    planId: string | null;
    onApplySuggestion: () => void;
  } = $props();
</script>
{#if conflicts.length > 0}
  <div class="p-2 border-t border-red-200 bg-red-50 text-sm text-red-600">ConflictPanel placeholder — {conflicts.length} xung dot</div>
{/if}
```

Now run build:
```bash
cd D:/3D/floor-manager-web && npm run build
```

- [ ] **Step 4: Commit**

```bash
cd D:/3D/floor-manager-web
git add src/routes/editor/+page.svelte src/lib/components/editor/PlanToolbar.svelte src/lib/components/editor/GanttChart.svelte src/lib/components/editor/ConflictPanel.svelte
git commit -m "feat: add planning tab bar in editor with placeholder components"
```

---

### Task 5: Frontend — PlanToolbar Component

**Files:**
- Modify: `floor-manager-web/src/lib/components/editor/PlanToolbar.svelte`

- [ ] **Step 1: Implement PlanToolbar**

Replace the placeholder with the full implementation:

```svelte
<script lang="ts">
  import { api, type ApiPlan } from '$lib/services/api';

  let { plans = [], selectedPlanId = null, layoutId = '', onSelectPlan = (_id: string) => {}, onPlansChanged = () => {} }: {
    plans: ApiPlan[];
    selectedPlanId: string | null;
    layoutId: string;
    onSelectPlan: (id: string) => void;
    onPlansChanged: () => void;
  } = $props();

  let showCreate = $state(false);
  let newName = $state('');
  let confirmDeleteId = $state<string | null>(null);

  async function createPlan() {
    if (!newName.trim() || !layoutId) return;
    const plan = await api.plans.create({ layoutId, name: newName.trim() });
    newName = '';
    showCreate = false;
    await onPlansChanged();
    onSelectPlan(plan.id);
  }

  async function deletePlan(id: string) {
    await api.plans.remove(id);
    confirmDeleteId = null;
    await onPlansChanged();
  }
</script>

<div class="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50">
  <span class="text-xs font-semibold text-gray-500 uppercase">Plan:</span>

  {#if plans.length > 0}
    <select
      class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white outline-none focus:border-blue-400"
      value={selectedPlanId}
      onchange={(e) => onSelectPlan((e.target as HTMLSelectElement).value)}
    >
      {#each plans as plan}
        <option value={plan.id}>{plan.name} ({plan._count?.items ?? 0} items)</option>
      {/each}
    </select>
  {:else}
    <span class="text-sm text-gray-400">Chua co plan</span>
  {/if}

  {#if showCreate}
    <input
      type="text"
      bind:value={newName}
      placeholder="Ten plan..."
      class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 w-40"
      onkeydown={(e) => { if (e.key === 'Enter') createPlan(); if (e.key === 'Escape') showCreate = false; }}
    />
    <button onclick={createPlan} disabled={!newName.trim()} class="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-semibold hover:bg-blue-600 disabled:opacity-40">Tao</button>
    <button onclick={() => showCreate = false} class="px-2 py-1.5 text-xs text-gray-500">Huy</button>
  {:else}
    <button onclick={() => showCreate = true} class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100">+ Tao plan</button>
  {/if}

  {#if selectedPlanId}
    {#if confirmDeleteId === selectedPlanId}
      <div class="flex items-center gap-1 ml-auto">
        <span class="text-xs text-red-500">Xoa plan?</span>
        <button onclick={() => deletePlan(selectedPlanId!)} class="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600">Co</button>
        <button onclick={() => confirmDeleteId = null} class="px-2 py-1 bg-gray-200 text-xs rounded">Khong</button>
      </div>
    {:else}
      <button onclick={() => confirmDeleteId = selectedPlanId} class="ml-auto px-3 py-1.5 text-xs text-red-500 bg-red-50 rounded-lg hover:bg-red-100">Xoa plan</button>
    {/if}
  {/if}
</div>
```

- [ ] **Step 2: Verify build**

```bash
cd D:/3D/floor-manager-web && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd D:/3D/floor-manager-web
git add src/lib/components/editor/PlanToolbar.svelte
git commit -m "feat: implement PlanToolbar with create/select/delete"
```

---

### Task 6: Frontend — GanttChart Component

**Files:**
- Modify: `floor-manager-web/src/lib/components/editor/GanttChart.svelte`

- [ ] **Step 1: Implement GanttChart**

Replace the placeholder with full implementation:

```svelte
<script lang="ts">
  import { api, type ApiPlanItem, type ApiConflict } from '$lib/services/api';

  let { items = [], planId = null, conflicts = [], onItemsChanged = () => {} }: {
    items: ApiPlanItem[];
    planId: string | null;
    conflicts: ApiConflict[];
    onItemsChanged: () => void;
  } = $props();

  const DAY_MS = 86400000;
  const DAY_WIDTH = 32; // px per day
  const ROW_HEIGHT = 40;
  const HEADER_HEIGHT = 48;

  // Compute date range from items
  let dateRange = $derived(() => {
    if (items.length === 0) {
      const today = new Date();
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      const end = new Date(today);
      end.setDate(end.getDate() + 30);
      return { start, end };
    }
    const starts = items.map(i => new Date(i.startDate).getTime());
    const ends = items.map(i => new Date(i.endDate).getTime());
    const minStart = new Date(Math.min(...starts));
    const maxEnd = new Date(Math.max(...ends));
    minStart.setDate(minStart.getDate() - 7);
    maxEnd.setDate(maxEnd.getDate() + 14);
    return { start: minStart, end: maxEnd };
  });

  let totalDays = $derived(Math.ceil((dateRange().end.getTime() - dateRange().start.getTime()) / DAY_MS));
  let chartWidth = $derived(totalDays * DAY_WIDTH);

  // Group items by product row
  let rows = $derived(() => {
    const map = new Map<string, { productName: string; productCode: string; color: string; items: ApiPlanItem[] }>();
    for (const item of items) {
      const key = item.productId;
      if (!map.has(key)) {
        map.set(key, {
          productName: item.product?.name ?? '?',
          productCode: item.product?.code ?? '?',
          color: item.product?.color ?? '#58a6ff',
          items: [],
        });
      }
      map.get(key)!.items.push(item);
    }
    return [...map.values()];
  });

  let conflictedIds = $derived(new Set(conflicts.flatMap(c => [c.itemA.id, c.itemB.id])));

  function dayOffset(dateStr: string): number {
    return (new Date(dateStr).getTime() - dateRange().start.getTime()) / DAY_MS;
  }

  function dayWidth(startStr: string, endStr: string): number {
    return (new Date(endStr).getTime() - new Date(startStr).getTime()) / DAY_MS;
  }

  function formatDate(d: Date): string {
    return `${d.getDate()}/${d.getMonth() + 1}`;
  }

  // Generate header dates
  let headerDates = $derived(() => {
    const dates: { date: Date; x: number }[] = [];
    const start = dateRange().start;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      if (d.getDay() === 1 || i === 0) { // Show Mondays + first day
        dates.push({ date: d, x: i * DAY_WIDTH });
      }
    }
    return dates;
  });

  // Drag state
  let dragType = $state<'move' | 'resize-start' | 'resize-end' | null>(null);
  let dragItemId = $state<string | null>(null);
  let dragStartX = $state(0);
  let dragOrigStart = $state('');
  let dragOrigEnd = $state('');

  function onBarMouseDown(e: MouseEvent, item: ApiPlanItem, type: 'move' | 'resize-start' | 'resize-end') {
    e.preventDefault();
    dragType = type;
    dragItemId = item.id;
    dragStartX = e.clientX;
    dragOrigStart = item.startDate;
    dragOrigEnd = item.endDate;

    const onMouseMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartX;
      const daysDelta = Math.round(dx / DAY_WIDTH);
      if (daysDelta === 0) return;

      const origStart = new Date(dragOrigStart);
      const origEnd = new Date(dragOrigEnd);

      if (type === 'move') {
        origStart.setDate(origStart.getDate() + daysDelta);
        origEnd.setDate(origEnd.getDate() + daysDelta);
      } else if (type === 'resize-start') {
        origStart.setDate(origStart.getDate() + daysDelta);
        if (origStart >= origEnd) return;
      } else {
        origEnd.setDate(origEnd.getDate() + daysDelta);
        if (origStart >= origEnd) return;
      }

      // Visual feedback: update local item
      const idx = items.findIndex(i => i.id === item.id);
      if (idx >= 0) {
        items[idx] = { ...items[idx], startDate: origStart.toISOString().slice(0, 10), endDate: origEnd.toISOString().slice(0, 10) };
      }
    };

    const onMouseUp = async () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      if (!dragItemId) return;

      const updated = items.find(i => i.id === dragItemId);
      if (updated && (updated.startDate !== dragOrigStart || updated.endDate !== dragOrigEnd)) {
        await api.plans.updateItem(dragItemId, {
          startDate: updated.startDate,
          endDate: updated.endDate,
        });
        onItemsChanged();
      }
      dragType = null;
      dragItemId = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  // Drop handler for new items from product sidebar
  async function onDrop(e: DragEvent) {
    e.preventDefault();
    const productId = e.dataTransfer?.getData('text/plan-product-id');
    if (!productId || !planId) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const dayIndex = Math.floor(x / DAY_WIDTH);
    const startDate = new Date(dateRange().start);
    startDate.setDate(startDate.getDate() + dayIndex);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // default 7 days

    // Prompt for position
    const posStr = prompt('Vi tri (x, y) tren mat bang (met):', '10, 10');
    if (!posStr) return;
    const [px, py] = posStr.split(',').map(Number);
    if (isNaN(px) || isNaN(py)) return;

    await api.plans.createItem(planId, {
      productId,
      x: px,
      y: py,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    });
    onItemsChanged();
  }

  // Delete item
  async function deleteItem(id: string) {
    await api.plans.removeItem(id);
    onItemsChanged();
  }

  const STAGE_COLORS: Record<string, string> = {
    'Han': '#f59e0b',
    'Son': '#22c55e',
    'Lap rap': '#3b82f6',
    'Cat': '#ef4444',
    'Khac': '#6b7280',
  };
</script>

<div
  class="relative overflow-auto bg-white"
  style="min-height: {HEADER_HEIGHT + rows().length * ROW_HEIGHT + 60}px"
  ondragover={(e) => e.preventDefault()}
  ondrop={onDrop}
  role="presentation"
>
  {#if items.length === 0 && planId}
    <div class="flex items-center justify-center h-full min-h-[200px] text-gray-400 text-sm">
      Keo san pham tu danh sach ben trai vao day de tao ke hoach
    </div>
  {:else}
    <!-- Header: dates -->
    <div class="sticky top-0 z-10 bg-gray-50 border-b border-gray-200" style="height: {HEADER_HEIGHT}px; width: {chartWidth}px">
      {#each headerDates() as hd}
        <div class="absolute top-0 text-[10px] text-gray-400 font-medium px-1" style="left: {hd.x}px; height: {HEADER_HEIGHT}px; line-height: {HEADER_HEIGHT}px">
          {formatDate(hd.date)}
        </div>
      {/each}
    </div>

    <!-- Rows -->
    <div style="width: {chartWidth}px; position: relative">
      {#each rows() as row, rowIdx}
        <div class="relative border-b border-gray-100" style="height: {ROW_HEIGHT}px">
          <!-- Row label -->
          <div class="absolute left-0 top-0 z-10 bg-white border-r border-gray-200 px-2 flex items-center gap-1 text-xs font-medium text-gray-700 sticky" style="height: {ROW_HEIGHT}px; width: 120px">
            <span class="w-2 h-2 rounded-full" style="background: {row.color}"></span>
            <span class="truncate">{row.productCode}</span>
          </div>

          <!-- Bars -->
          {#each row.items as item}
            {@const left = dayOffset(item.startDate) * DAY_WIDTH + 120}
            {@const width = dayWidth(item.startDate, item.endDate) * DAY_WIDTH}
            {@const isConflicted = conflictedIds.has(item.id)}
            {@const stageColor = STAGE_COLORS[item.product?.processStage ?? 'Khac'] ?? '#6b7280'}
            <div
              class="absolute top-1 rounded-md flex items-center text-[10px] text-white font-medium px-1 cursor-grab select-none group"
              class:ring-2={isConflicted}
              class:ring-red-500={isConflicted}
              class:animate-pulse={isConflicted}
              style="left: {left}px; width: {Math.max(width, 8)}px; height: {ROW_HEIGHT - 8}px; background: {stageColor}"
              onmousedown={(e) => onBarMouseDown(e, item, 'move')}
              title="{item.product?.name}: {item.startDate} → {item.endDate}"
              role="button"
              tabindex="0"
            >
              <!-- Resize handle left -->
              <div
                class="absolute left-0 top-0 w-2 h-full cursor-w-resize"
                onmousedown|stopPropagation={(e) => onBarMouseDown(e, item, 'resize-start')}
                role="presentation"
              ></div>

              <span class="truncate flex-1">{item.product?.name ?? '?'}</span>

              <!-- Delete button -->
              <button
                class="opacity-0 group-hover:opacity-100 ml-1 w-4 h-4 rounded bg-black/30 text-white text-[8px] flex items-center justify-center hover:bg-black/50"
                onclick|stopPropagation={() => deleteItem(item.id)}
                title="Xoa"
              >x</button>

              <!-- Resize handle right -->
              <div
                class="absolute right-0 top-0 w-2 h-full cursor-e-resize"
                onmousedown|stopPropagation={(e) => onBarMouseDown(e, item, 'resize-end')}
                role="presentation"
              ></div>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Verify build**

```bash
cd D:/3D/floor-manager-web && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd D:/3D/floor-manager-web
git add src/lib/components/editor/GanttChart.svelte
git commit -m "feat: implement GanttChart with drag-resize bars and drop-to-create"
```

---

### Task 7: Frontend — ConflictPanel Component

**Files:**
- Modify: `floor-manager-web/src/lib/components/editor/ConflictPanel.svelte`

- [ ] **Step 1: Implement ConflictPanel**

Replace the placeholder:

```svelte
<script lang="ts">
  import { api, type ApiConflict } from '$lib/services/api';

  let { conflicts = [], suggestions = [], planId = null, onApplySuggestion = () => {} }: {
    conflicts: ApiConflict[];
    suggestions: { itemId: string; suggestedStart: string; reason: string }[];
    planId: string | null;
    onApplySuggestion: () => void;
  } = $props();

  let applying = $state<string | null>(null);

  async function applySuggestion(s: { itemId: string; suggestedStart: string }) {
    applying = s.itemId;
    try {
      await api.plans.updateItem(s.itemId, { startDate: s.suggestedStart });
      onApplySuggestion();
    } finally {
      applying = null;
    }
  }
</script>

{#if conflicts.length > 0}
  <div class="border-t border-red-200 bg-red-50/50 max-h-40 overflow-auto">
    <div class="px-4 py-2 flex items-center gap-2">
      <span class="text-xs font-semibold text-red-600 uppercase">{conflicts.length} xung dot</span>
    </div>
    <div class="divide-y divide-red-100">
      {#each conflicts as c, i}
        <div class="px-4 py-2 text-xs">
          <p class="text-red-700">
            <span class="font-semibold">{c.itemA.productName}</span> ({c.itemA.startDate} → {c.itemA.endDate})
            va
            <span class="font-semibold">{c.itemB.productName}</span> ({c.itemB.startDate} → {c.itemB.endDate})
          </p>
          <p class="text-red-500">Chong nhau: {c.overlapStart} → {c.overlapEnd}</p>
          {#each suggestions.filter(s => s.itemId === c.itemA.id || s.itemId === c.itemB.id) as s}
            <button
              class="mt-1 px-2 py-1 bg-blue-50 text-blue-600 rounded text-[11px] font-medium hover:bg-blue-100 disabled:opacity-40"
              onclick={() => applySuggestion(s)}
              disabled={applying === s.itemId}
            >
              {applying === s.itemId ? '...' : `Dich sang ${s.suggestedStart}`}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Verify build**

```bash
cd D:/3D/floor-manager-web && npm run build
```

- [ ] **Step 3: Commit**

```bash
cd D:/3D/floor-manager-web
git add src/lib/components/editor/ConflictPanel.svelte
git commit -m "feat: implement ConflictPanel with apply-suggestion buttons"
```

---

### Task 8: Full Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd D:/3D/floor-manager && npm test
```

Expected: all tests pass including plan tests.

- [ ] **Step 2: Run frontend build**

```bash
cd D:/3D/floor-manager-web && npm run build
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

1. Start backend + frontend
2. Open editor for a layout
3. Click "Ke hoach" tab
4. Create a new plan
5. (If products exist) drag a product onto the Gantt to create a PlanItem
6. Resize/move bars on the Gantt
7. Create overlapping items at same position to trigger conflict detection
8. Verify ConflictPanel shows warnings with suggestions
9. Click "Dich sang..." to apply a suggestion
