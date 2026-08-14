import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken } from './setup.js';

async function seedSharedLayout() {
  const cookie = () => ({ Cookie: `access_token=${adminToken()}` });
  const site = (await request(app).post('/api/sites').set(cookie()).send({ name: 'S' })).body;
  const layout = (
    await request(app)
      .post('/api/layouts')
      .set(cookie())
      .send({ siteId: site.id, name: 'L', widthM: 100, heightM: 50 })
  ).body;
  const projA = (await request(app).post('/api/projects').set(cookie()).send({ name: 'Du an A' })).body;
  const projB = (await request(app).post('/api/projects').set(cookie()).send({ name: 'Du an B' })).body;
  const prodA = (
    await request(app)
      .post('/api/products')
      .set(cookie())
      .send({ projectId: projA.id, name: 'Block A', code: 'A1', areaM2: 20 })
  ).body;
  const prodB = (
    await request(app)
      .post('/api/products')
      .set(cookie())
      .send({ projectId: projB.id, name: 'Block B', code: 'B1', areaM2: 30 })
  ).body;
  await request(app).post('/api/snapshots').set(cookie()).send({
    layoutId: layout.id,
    date: '2026-08-01',
    positions: [
      { productId: prodA.id, x: 1, y: 1 },
      { productId: prodB.id, x: 5, y: 5 },
    ],
  });
  await request(app).post('/api/snapshots').set(cookie()).send({
    layoutId: layout.id,
    date: '2026-08-03',
    positions: [{ productId: prodA.id, x: 1, y: 1 }],
  });
  return { layout, projA, projB, prodA, prodB };
}

describe('reports/occupation', () => {
  it('returns all periods when no filter given', async () => {
    await seedSharedLayout();
    const res = await request(app)
      .get('/api/reports/occupation')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);

    // prodA present in both snapshots: Aug 1 → Aug 3, 2 days
    const rowA = res.body.find((r: any) => r.productCode === 'A1');
    expect(rowA).toMatchObject({
      startDate: '2026-08-01',
      endDate: '2026-08-03',
      days: 2,
      areaM2: 20,
      areaDays: 40,
    });
    // prodB gone by Aug 3: period closes at previous snapshot date, min 1 day
    const rowB = res.body.find((r: any) => r.productCode === 'B1');
    expect(rowB).toMatchObject({
      startDate: '2026-08-01',
      endDate: '2026-08-01',
      days: 1,
      areaM2: 30,
      areaDays: 30,
    });
  });

  it('filters by product project on a shared layout and includes projectName', async () => {
    const { projA } = await seedSharedLayout();
    const res = await request(app)
      .get(`/api/reports/occupation?projectId=${projA.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].productCode).toBe('A1');
    expect(res.body[0].projectName).toBe('Du an A');
  });

  it('still filters by layoutId', async () => {
    const { layout } = await seedSharedLayout();
    const res = await request(app)
      .get(`/api/reports/occupation?layoutId=${layout.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('starts a new period when a product reappears after absence', async () => {
    const { layout, prodB } = await seedSharedLayout();
    await request(app)
      .post('/api/snapshots')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({
        layoutId: layout.id,
        date: '2026-08-05',
        positions: [{ productId: prodB.id, x: 5, y: 5 }],
      });

    const res = await request(app)
      .get('/api/reports/occupation')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    const rowsB = res.body.filter((r: any) => r.productCode === 'B1');
    expect(rowsB).toHaveLength(2);
    expect(rowsB.map((r: any) => [r.startDate, r.endDate])).toEqual([
      ['2026-08-01', '2026-08-01'],
      ['2026-08-05', '2026-08-05'],
    ]);
  });
});
