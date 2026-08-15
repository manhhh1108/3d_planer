# Phase 4: Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dashboard endpoint and transform the homepage into a factory overview with usage stats, process breakdowns, and recent activity.

**Architecture:** Single `GET /api/dashboard?date=` endpoint aggregates all metrics from existing tables (no migration needed). Frontend adds dashboard sections above the existing sites/projects list on `+page.svelte`. Bar charts use pure HTML/CSS.

**Tech Stack:** Backend: Express 5, Prisma 7, vitest + supertest. Frontend: SvelteKit 5, Svelte 5 `$state`/`$derived`, Tailwind CSS.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `floor-manager/server/routes/dashboard.ts` | **Create** — GET /api/dashboard endpoint, aggregation logic |
| `floor-manager/server/app.ts` | **Modify** — register dashboard router |
| `floor-manager/tests/dashboard.test.ts` | **Create** — integration tests for dashboard endpoint |
| `floor-manager-web/src/lib/services/api.ts` | **Modify** — add `api.dashboard.get(date?)` + `ApiDashboard` type |
| `floor-manager-web/src/routes/+page.svelte` | **Modify** — add dashboard sections above existing content |

---

### Task 1: Backend — Dashboard Route + Tests

**Files:**
- Create: `floor-manager/server/routes/dashboard.ts`
- Create: `floor-manager/tests/dashboard.test.ts`
- Modify: `floor-manager/server/app.ts`

- [ ] **Step 1: Write the test file with a helper to seed data**

Create `floor-manager/tests/dashboard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken } from './setup.js';

/** Seed a site -> layout -> project -> product -> snapshot with positions. */
async function seedLayoutWithSnapshot(overrides?: {
  snapshotDate?: Date;
  productStage?: string;
  productWeightKg?: number;
  productAreaM2?: number;
  layoutWidthM?: number;
  layoutHeightM?: number;
}) {
  const token = adminToken();
  const site = (await request(app).post('/api/sites')
    .set('Cookie', `access_token=${token}`)
    .send({ name: 'Site' })).body;

  const layout = (await request(app).post('/api/layouts')
    .set('Cookie', `access_token=${token}`)
    .send({
      siteId: site.id,
      name: 'Layout A',
      widthM: overrides?.layoutWidthM ?? 100,
      heightM: overrides?.layoutHeightM ?? 50,
    })).body;

  const project = (await request(app).post('/api/projects')
    .set('Cookie', `access_token=${token}`)
    .send({ name: 'Project' })).body;

  const product = (await request(app).post('/api/products')
    .set('Cookie', `access_token=${token}`)
    .send({
      projectId: project.id,
      name: 'Block',
      code: 'B1',
      processStage: overrides?.productStage ?? 'Han',
      weightKg: overrides?.productWeightKg ?? 5000,
      areaM2: overrides?.productAreaM2 ?? 20,
    })).body;

  const snapshotDate = overrides?.snapshotDate ?? new Date('2026-08-15');
  await request(app).post('/api/snapshots')
    .set('Cookie', `access_token=${token}`)
    .send({
      layoutId: layout.id,
      date: snapshotDate.toISOString().slice(0, 10),
      positions: [{ productId: product.id, x: 10, y: 10 }],
    });

  return { site, layout, project, product };
}

describe('GET /api/dashboard', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns zeros when database is empty', async () => {
    const res = await request(app)
      .get('/api/dashboard')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.counts.sites).toBe(0);
    expect(res.body.counts.projects).toBe(0);
    expect(res.body.counts.productsOnLayout).toBe(0);
    expect(res.body.counts.totalWeightKg).toBe(0);
    expect(res.body.counts.totalAreaM2).toBe(0);
    expect(res.body.layoutUsage).toEqual([]);
    expect(res.body.byProcessStage).toEqual([]);
    expect(res.body.recentActivity).toEqual([]);
  });

  it('returns correct counts and layout usage from latest snapshot', async () => {
    const { layout } = await seedLayoutWithSnapshot({
      productAreaM2: 20,
      layoutWidthM: 100,
      layoutHeightM: 50,
    });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.counts.sites).toBe(1);
    expect(res.body.counts.projects).toBe(1);
    expect(res.body.counts.productsOnLayout).toBe(1);
    expect(res.body.counts.totalWeightKg).toBe(5000);
    expect(res.body.counts.totalAreaM2).toBe(20);

    expect(res.body.layoutUsage).toHaveLength(1);
    expect(res.body.layoutUsage[0].layoutId).toBe(layout.id);
    expect(res.body.layoutUsage[0].usedAreaM2).toBe(20);
    expect(res.body.layoutUsage[0].totalAreaM2).toBe(5000); // 100 * 50
    expect(res.body.layoutUsage[0].usagePercent).toBeCloseTo(0.4, 1);
    expect(res.body.layoutUsage[0].productCount).toBe(1);
  });

  it('aggregates by process stage', async () => {
    await seedLayoutWithSnapshot({ productStage: 'Han', productAreaM2: 10, productWeightKg: 1000 });

    const res = await request(app)
      .get('/api/dashboard')
      .set('Cookie', `access_token=${adminToken()}`);
    const han = res.body.byProcessStage.find((s: any) => s.stage === 'Han');
    expect(han).toBeDefined();
    expect(han.count).toBe(1);
    expect(han.totalAreaM2).toBe(10);
    expect(han.totalWeightKg).toBe(1000);
  });

  it('filters by date parameter', async () => {
    await seedLayoutWithSnapshot({ snapshotDate: new Date('2026-08-10') });

    // With exact date match -> should find data
    const res1 = await request(app)
      .get('/api/dashboard?date=2026-08-10')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res1.body.counts.productsOnLayout).toBe(1);

    // With a different date -> no snapshot found -> zeros
    const res2 = await request(app)
      .get('/api/dashboard?date=2026-08-01')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res2.body.counts.productsOnLayout).toBe(0);
    // Layout still shows up but with 0 usage
    expect(res2.body.layoutUsage).toHaveLength(1);
    expect(res2.body.layoutUsage[0].usedAreaM2).toBe(0);
  });

  it('includes recent activity (snapshots and products)', async () => {
    await seedLayoutWithSnapshot();

    const res = await request(app)
      .get('/api/dashboard')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.body.recentActivity.length).toBeGreaterThanOrEqual(2);
    const types = res.body.recentActivity.map((a: any) => a.type);
    expect(types).toContain('snapshot');
    expect(types).toContain('product');
  });
});
```

- [ ] **Step 2: Create the dashboard route**

Create `floor-manager/server/routes/dashboard.ts`:

```typescript
import { Router, Request, Response } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  try {
    const dateParam = req.query.date as string | undefined;

    // --- counts (always from full DB) ---
    const [sitesCount, projectsCount] = await Promise.all([
      prisma.site.count(),
      prisma.project.count(),
    ]);

    // --- find relevant snapshot per layout ---
    const layouts = await prisma.layout.findMany({
      include: { site: { select: { name: true } } },
    });

    type SnapshotWithPositions = {
      id: string;
      layoutId: string;
      date: Date;
      createdAt: Date;
      createdBy: string | null;
      positions: {
        productId: string;
        product: {
          areaM2: number | null;
          weightKg: number | null;
          processStage: string | null;
        };
      }[];
    };

    const snapshotsByLayout: SnapshotWithPositions[] = [];

    for (const layout of layouts) {
      const snapshot = dateParam
        ? await prisma.snapshot.findUnique({
            where: { layoutId_date: { layoutId: layout.id, date: new Date(dateParam) } },
            include: {
              positions: {
                include: { product: { select: { areaM2: true, weightKg: true, processStage: true } } },
              },
            },
          })
        : await prisma.snapshot.findFirst({
            where: { layoutId: layout.id },
            orderBy: { date: 'desc' },
            include: {
              positions: {
                include: { product: { select: { areaM2: true, weightKg: true, processStage: true } } },
              },
            },
          });

      if (snapshot) snapshotsByLayout.push(snapshot);
    }

    // --- aggregate metrics from selected snapshots ---
    const productIds = new Set<string>();
    let totalWeightKg = 0;
    let totalAreaM2 = 0;
    const stageMap = new Map<string, { count: number; totalAreaM2: number; totalWeightKg: number }>();

    for (const snap of snapshotsByLayout) {
      for (const pos of snap.positions) {
        productIds.add(pos.productId);
        const area = pos.product.areaM2 ?? 0;
        const weight = pos.product.weightKg ?? 0;
        totalAreaM2 += area;
        totalWeightKg += weight;

        const stage = pos.product.processStage ?? 'Khac';
        const entry = stageMap.get(stage) ?? { count: 0, totalAreaM2: 0, totalWeightKg: 0 };
        entry.count++;
        entry.totalAreaM2 += area;
        entry.totalWeightKg += weight;
        stageMap.set(stage, entry);
      }
    }

    // --- layout usage ---
    const layoutUsage = layouts.map((layout) => {
      const snap = snapshotsByLayout.find((s) => s.layoutId === layout.id);
      const usedAreaM2 = snap
        ? snap.positions.reduce((sum, p) => sum + (p.product.areaM2 ?? 0), 0)
        : 0;
      const totalAreaM2 = layout.widthM * layout.heightM;
      return {
        layoutId: layout.id,
        layoutName: layout.name,
        siteName: layout.site.name,
        usedAreaM2: Math.round(usedAreaM2 * 100) / 100,
        totalAreaM2: Math.round(totalAreaM2 * 100) / 100,
        usagePercent: totalAreaM2 > 0 ? Math.round((usedAreaM2 / totalAreaM2) * 1000) / 10 : 0,
        productCount: snap ? snap.positions.length : 0,
      };
    });

    // --- by process stage ---
    const byProcessStage = [...stageMap.entries()].map(([stage, data]) => ({
      stage,
      count: data.count,
      totalAreaM2: Math.round(data.totalAreaM2 * 100) / 100,
      totalWeightKg: Math.round(data.totalWeightKg * 100) / 100,
    }));

    // --- recent activity ---
    const [recentSnapshots, recentProducts] = await Promise.all([
      prisma.snapshot.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { layout: { select: { name: true } } },
      }),
      prisma.product.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { project: { select: { name: true } } },
      }),
    ]);

    const recentActivity = [
      ...recentSnapshots.map((s) => ({
        type: 'snapshot' as const,
        description: `${s.layout.name} — snapshot ${new Date(s.date).toISOString().slice(0, 10)}`,
        layoutId: s.layoutId,
        createdBy: s.createdBy,
        createdAt: s.createdAt.toISOString(),
      })),
      ...recentProducts.map((p) => ({
        type: 'product' as const,
        description: `${p.code} ${p.name} — ${p.project.name}`,
        projectId: p.projectId,
        createdBy: null,
        createdAt: p.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 15);

    res.json({
      counts: {
        sites: sitesCount,
        projects: projectsCount,
        productsOnLayout: productIds.size,
        totalWeightKg: Math.round(totalWeightKg * 100) / 100,
        totalAreaM2: Math.round(totalAreaM2 * 100) / 100,
      },
      layoutUsage,
      byProcessStage,
      recentActivity,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

- [ ] **Step 3: Register the dashboard router in app.ts**

In `floor-manager/server/app.ts`, add import and route:

```typescript
// Add import at top (after existing imports):
import dashboardRouter from './routes/dashboard.js';

// Add route (after the auth line, before projects):
app.use('/api/dashboard', requireAuth, dashboardRouter);
```

- [ ] **Step 4: Run the tests**

```bash
cd D:/3D/floor-manager && npm test
```

Expected: all dashboard tests pass alongside existing tests.

- [ ] **Step 5: Commit**

```bash
cd D:/3D/floor-manager
git add server/routes/dashboard.ts server/app.ts tests/dashboard.test.ts
git commit -m "feat: add GET /api/dashboard endpoint with usage, stage, activity metrics"
```

---

### Task 2: Frontend — API Client + Dashboard Types

**Files:**
- Modify: `floor-manager-web/src/lib/services/api.ts`

- [ ] **Step 1: Add ApiDashboard type and api.dashboard.get()**

In `floor-manager-web/src/lib/services/api.ts`, add after the `ApiUser` interface (line 244):

```typescript
export interface ApiDashboard {
  counts: {
    sites: number;
    projects: number;
    productsOnLayout: number;
    totalWeightKg: number;
    totalAreaM2: number;
  };
  layoutUsage: {
    layoutId: string;
    layoutName: string;
    siteName: string;
    usedAreaM2: number;
    totalAreaM2: number;
    usagePercent: number;
    productCount: number;
  }[];
  byProcessStage: {
    stage: string;
    count: number;
    totalAreaM2: number;
    totalWeightKg: number;
  }[];
  recentActivity: {
    type: 'snapshot' | 'product';
    description: string;
    layoutId?: string;
    projectId?: string;
    createdBy: string | null;
    createdAt: string;
  }[];
}
```

Add inside the `api` object (e.g. after the `snapshots` section, before the closing `}`):

```typescript
  dashboard: {
    get: (date?: string) =>
      http<ApiDashboard>(date ? `/dashboard?date=${date}` : '/dashboard'),
  },
```

- [ ] **Step 2: Verify frontend builds**

```bash
cd D:/3D/floor-manager-web && npm run build
```

Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
cd D:/3D/floor-manager-web
git add src/lib/services/api.ts
git commit -m "feat: add api.dashboard.get() client and ApiDashboard type"
```

---

### Task 3: Frontend — Dashboard UI on Homepage

**Files:**
- Modify: `floor-manager-web/src/routes/+page.svelte`

- [ ] **Step 1: Add dashboard state and data fetching**

At the top of the `<script>` block in `+page.svelte`, add imports and state after the existing state variables:

```typescript
  import type { ApiDashboard } from '$lib/services/api';

  // Dashboard state
  let dashboard = $state<ApiDashboard | null>(null);
  let dashDate = $state('');  // '' = latest
  let dashLoading = $state(true);

  async function refreshDashboard() {
    dashLoading = true;
    try {
      dashboard = await api.dashboard.get(dashDate || undefined);
    } catch {
      // dashboard fetch failed — leave null, don't block page
    } finally {
      dashLoading = false;
    }
  }
```

Modify the existing `onMount` to also call `refreshDashboard`:

```typescript
  onMount(async () => {
    await Promise.all([refresh(), refreshDashboard()]);
  });
```

Add a helper for relative time display:

```typescript
  function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'vua xong';
    if (mins < 60) return `${mins} phut truoc`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} gio truoc`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} ngay truoc`;
    return new Date(iso).toLocaleDateString('vi-VN');
  }

  const STAGE_COLORS: Record<string, string> = {
    'Han': 'bg-amber-400',
    'Son': 'bg-green-400',
    'Lap rap': 'bg-blue-400',
    'Cat': 'bg-red-400',
    'Khac': 'bg-gray-400',
  };

  let maxStageArea = $derived(
    dashboard ? Math.max(...dashboard.byProcessStage.map(s => s.totalAreaM2), 1) : 1
  );
```

- [ ] **Step 2: Add dashboard HTML sections**

In the template, inside the `{:else}` block (after `loading` check, before the Sites section), add the dashboard UI. Insert right after `{:else}` (before `<!-- ===== Khu Mat bang ===== -->`):

```svelte
      <!-- ===== Dashboard ===== -->
      {#if dashboard}
        <!-- Date picker -->
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-base font-bold text-gray-800">Tong quan</h2>
          <div class="flex items-center gap-2">
            <input
              type="date"
              bind:value={dashDate}
              onchange={() => refreshDashboard()}
              class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400"
            />
            {#if dashDate}
              <button onclick={() => { dashDate = ''; refreshDashboard(); }}
                class="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 font-medium">
                Moi nhat
              </button>
            {/if}
          </div>
        </div>

        <!-- Summary Cards -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs text-gray-400 font-medium uppercase">Mat bang</p>
            <p class="text-2xl font-bold text-gray-800 mt-1">{dashboard.counts.sites}</p>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs text-gray-400 font-medium uppercase">Du an</p>
            <p class="text-2xl font-bold text-gray-800 mt-1">{dashboard.counts.projects}</p>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs text-gray-400 font-medium uppercase">SP tren mat bang</p>
            <p class="text-2xl font-bold text-gray-800 mt-1">{dashboard.counts.productsOnLayout}</p>
          </div>
          <div class="bg-white rounded-xl border border-gray-200 p-4">
            <p class="text-xs text-gray-400 font-medium uppercase">Tong khoi luong</p>
            <p class="text-2xl font-bold text-gray-800 mt-1">{(dashboard.counts.totalWeightKg / 1000).toFixed(1)} T</p>
          </div>
        </div>

        <!-- Layout Usage + Process Stage row -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <!-- Layout Usage Cards -->
          <div>
            <h3 class="text-sm font-semibold text-gray-600 mb-3">Ty le lap day</h3>
            {#if dashboard.layoutUsage.length === 0}
              <div class="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">Chua co layout</div>
            {:else}
              <div class="space-y-3">
                {#each dashboard.layoutUsage as lu}
                  <a href={`${base}/editor?layoutId=${lu.layoutId}`}
                    class="block bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all">
                    <div class="flex items-center justify-between mb-2">
                      <div>
                        <span class="font-medium text-gray-800 text-sm">{lu.layoutName}</span>
                        <span class="text-xs text-gray-400 ml-2">{lu.siteName}</span>
                      </div>
                      <span class="text-sm font-semibold {lu.usagePercent > 80 ? 'text-red-600' : lu.usagePercent > 50 ? 'text-amber-600' : 'text-green-600'}">
                        {lu.usagePercent}%
                      </span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-2.5">
                      <div
                        class="h-2.5 rounded-full transition-all {lu.usagePercent > 80 ? 'bg-red-500' : lu.usagePercent > 50 ? 'bg-amber-500' : 'bg-green-500'}"
                        style="width: {Math.min(lu.usagePercent, 100)}%"
                      ></div>
                    </div>
                    <p class="text-xs text-gray-400 mt-1.5">{lu.usedAreaM2} m2 / {lu.totalAreaM2} m2 · {lu.productCount} san pham</p>
                  </a>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Process Stage Chart -->
          <div>
            <h3 class="text-sm font-semibold text-gray-600 mb-3">Theo cong doan</h3>
            {#if dashboard.byProcessStage.length === 0}
              <div class="bg-white rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">Chua co du lieu</div>
            {:else}
              <div class="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                {#each dashboard.byProcessStage as stage}
                  <div>
                    <div class="flex items-center justify-between text-sm mb-1">
                      <span class="text-gray-700 font-medium">{stage.stage}</span>
                      <span class="text-gray-400 text-xs">{stage.count} SP · {stage.totalAreaM2} m2 · {(stage.totalWeightKg / 1000).toFixed(1)} T</span>
                    </div>
                    <div class="w-full bg-gray-100 rounded-full h-3">
                      <div
                        class="h-3 rounded-full {STAGE_COLORS[stage.stage] ?? 'bg-gray-400'}"
                        style="width: {(stage.totalAreaM2 / maxStageArea) * 100}%"
                      ></div>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        </div>

        <!-- Recent Activity -->
        {#if dashboard.recentActivity.length > 0}
          <div class="mb-8">
            <h3 class="text-sm font-semibold text-gray-600 mb-3">Hoat dong gan day</h3>
            <div class="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {#each dashboard.recentActivity as activity}
                <div class="px-4 py-3 flex items-center gap-3">
                  <div class="w-7 h-7 rounded-lg flex items-center justify-center text-sm
                    {activity.type === 'snapshot' ? 'bg-blue-50 text-blue-500' : 'bg-green-50 text-green-500'}">
                    {activity.type === 'snapshot' ? '📸' : '📦'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-700 truncate">{activity.description}</p>
                    {#if activity.createdBy}
                      <p class="text-xs text-gray-400">{activity.createdBy}</p>
                    {/if}
                  </div>
                  <span class="text-xs text-gray-400 whitespace-nowrap">{timeAgo(activity.createdAt)}</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <hr class="border-gray-200 mb-8" />
      {:else if dashLoading}
        <div class="text-center py-8 text-gray-400 text-sm mb-6">Dang tai dashboard...</div>
      {/if}
```

- [ ] **Step 3: Verify frontend builds**

```bash
cd D:/3D/floor-manager-web && npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd D:/3D/floor-manager-web
git add src/routes/+page.svelte
git commit -m "feat: add dashboard overview on homepage with usage, stages, activity"
```

---

### Task 4: Full Verification

- [ ] **Step 1: Run all backend tests**

```bash
cd D:/3D/floor-manager && npm test
```

Expected: all tests pass (including new dashboard tests).

- [ ] **Step 2: Run frontend build**

```bash
cd D:/3D/floor-manager-web && npm run build
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

1. Start backend: `cd D:/3D/floor-manager && npm run server`
2. Start frontend: `cd D:/3D/floor-manager-web && npm run dev`
3. Open http://localhost:5173
4. Verify dashboard sections appear above sites/projects
5. If data exists: verify summary cards, layout usage bars, process stage bars, recent activity
6. Test date picker: select a date, verify metrics update
7. Click "Moi nhat" button to reset
