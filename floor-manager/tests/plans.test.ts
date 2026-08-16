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

    const created = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'Plan T9' })).body;
    expect(created.name).toBe('Plan T9');
    expect(created.active).toBe(true);

    const list = (await request(app).get(`/api/plans?layoutId=${layout.id}`).set('Cookie', `access_token=${token}`)).body;
    expect(list).toHaveLength(1);
    expect(list[0]._count.items).toBe(0);

    const updated = (await request(app).put(`/api/plans/${created.id}`).set('Cookie', `access_token=${token}`)
      .send({ name: 'Plan T10', active: false })).body;
    expect(updated.name).toBe('Plan T10');
    expect(updated.active).toBe(false);

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

    const item = (await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: product.id, x: 10, y: 20, startDate: '2026-09-01', endDate: '2026-09-15' })).body;
    expect(item.x).toBe(10);
    expect(item.product.name).toBe('Block');

    const items = (await request(app).get(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)).body;
    expect(items).toHaveLength(1);

    const updated = (await request(app).put(`/api/plans/items/${item.id}`).set('Cookie', `access_token=${token}`)
      .send({ startDate: '2026-09-05', endDate: '2026-09-20' })).body;
    expect(updated.startDate).toContain('2026-09-05');

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

    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pA.id, x: 10, y: 10, startDate: '2026-09-01', endDate: '2026-09-10' });
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pB.id, x: 10, y: 10, startDate: '2026-09-10', endDate: '2026-09-20' });

    const res = await request(app).get(`/api/plans/${plan.id}/conflicts`).set('Cookie', `access_token=${token}`);
    expect(res.body.conflicts).toHaveLength(0);
  });
});

describe('Optimistic Locking', () => {
  it('rejects plan update with stale version', async () => {
    const { layout } = await seedSiteLayout();
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Update with correct version
    const r1 = await request(app).put(`/api/plans/${plan.id}`).set('Cookie', `access_token=${token}`)
      .send({ name: 'Updated', version: 1 });
    expect(r1.status).toBe(200);
    expect(r1.body.version).toBe(2);

    // Update with stale version
    const r2 = await request(app).put(`/api/plans/${plan.id}`).set('Cookie', `access_token=${token}`)
      .send({ name: 'Stale', version: 1 });
    expect(r2.status).toBe(409);
    expect(r2.body.currentVersion).toBe(2);
  });

  it('rejects plan item create with stale plan version', async () => {
    const { layout } = await seedSiteLayout();
    const { product } = await seedProduct();
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Create item with correct version
    const r1 = await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: product.id, x: 10, y: 10, startDate: '2026-09-01', endDate: '2026-09-15', planVersion: 1 });
    expect(r1.status).toBe(201);

    // Plan version is now 2 — create with stale version 1
    const r2 = await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: product.id, x: 20, y: 20, startDate: '2026-09-01', endDate: '2026-09-15', planVersion: 1 });
    expect(r2.status).toBe(409);
  });

  it('allows mutations without version (backward compatible)', async () => {
    const { layout } = await seedSiteLayout();
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Update without version — should succeed
    const r1 = await request(app).put(`/api/plans/${plan.id}`).set('Cookie', `access_token=${token}`)
      .send({ name: 'No version check' });
    expect(r1.status).toBe(200);
  });
});

describe('Plan vs Snapshot Comparison', () => {
  it('returns empty when no snapshot exists', async () => {
    const { layout } = await seedSiteLayout();
    const token = adminToken();
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    const res = await request(app).get(`/api/plans/${plan.id}/compare`).set('Cookie', `access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.snapshotId).toBeNull();
    expect(res.body.items).toEqual([]);
    expect(res.body.summary).toEqual({ matched: 0, misplaced: 0, missing: 0, unplanned: 0 });
  });

  it('classifies matched, misplaced, missing, unplanned correctly', async () => {
    const { layout } = await seedSiteLayout();
    const { product: pA } = await seedProduct({ name: 'A', code: 'A1' });
    const { product: pB } = await seedProduct({ name: 'B', code: 'B1' });
    const { product: pC } = await seedProduct({ name: 'C', code: 'C1' });
    const { product: pD } = await seedProduct({ name: 'D', code: 'D1' });
    const token = adminToken();

    // Create plan with items for A, B, C (not D)
    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    const today = new Date().toISOString().slice(0, 10);
    const futureEnd = '2099-12-31';

    // A at (10,10), B at (50,50), C at (80,80)
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pA.id, x: 10, y: 10, startDate: '2020-01-01', endDate: futureEnd });
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pB.id, x: 50, y: 50, startDate: '2020-01-01', endDate: futureEnd });
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pC.id, x: 80, y: 80, startDate: '2020-01-01', endDate: futureEnd });

    // Create snapshot: A at (10,10) matched, B at (40,40) misplaced, D at (20,20) unplanned, C missing
    await request(app).post('/api/snapshots').set('Cookie', `access_token=${token}`)
      .send({
        layoutId: layout.id,
        date: today,
        positions: [
          { productId: pA.id, x: 10, y: 10 },
          { productId: pB.id, x: 40, y: 40 },
          { productId: pD.id, x: 20, y: 20 },
        ],
      });

    const res = await request(app).get(`/api/plans/${plan.id}/compare`).set('Cookie', `access_token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.summary.matched).toBe(1);    // A
    expect(res.body.summary.misplaced).toBe(1);   // B (dist ~14.14m)
    expect(res.body.summary.missing).toBe(1);     // C
    expect(res.body.summary.unplanned).toBe(1);   // D

    const a = res.body.items.find((i: any) => i.productCode === 'A1');
    expect(a.status).toBe('matched');
    expect(a.distanceM).toBe(0);

    const b = res.body.items.find((i: any) => i.productCode === 'B1');
    expect(b.status).toBe('misplaced');
    expect(b.distanceM).toBeGreaterThan(2);

    const c = res.body.items.find((i: any) => i.productCode === 'C1');
    expect(c.status).toBe('missing');
    expect(c.actual).toBeNull();

    const d = res.body.items.find((i: any) => i.productCode === 'D1');
    expect(d.status).toBe('unplanned');
    expect(d.planned).toBeNull();
  });

  it('filters plan items by snapshot date', async () => {
    const { layout } = await seedSiteLayout();
    const { product: pA } = await seedProduct({ name: 'A', code: 'A1' });
    const token = adminToken();

    const plan = (await request(app).post('/api/plans').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, name: 'P' })).body;

    // Plan item: Sep 1 - Sep 15
    await request(app).post(`/api/plans/${plan.id}/items`).set('Cookie', `access_token=${token}`)
      .send({ productId: pA.id, x: 10, y: 10, startDate: '2026-09-01', endDate: '2026-09-15' });

    // Snapshot on Aug 1 (before plan item period)
    await request(app).post('/api/snapshots').set('Cookie', `access_token=${token}`)
      .send({ layoutId: layout.id, date: '2026-08-01', positions: [{ productId: pA.id, x: 10, y: 10 }] });

    const res = await request(app).get(`/api/plans/${plan.id}/compare`).set('Cookie', `access_token=${token}`);
    // Plan item not active on Aug 1, so A is unplanned
    expect(res.body.summary.unplanned).toBe(1);
    expect(res.body.summary.matched).toBe(0);
  });
});
