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
