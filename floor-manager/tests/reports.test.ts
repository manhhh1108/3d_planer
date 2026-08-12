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
