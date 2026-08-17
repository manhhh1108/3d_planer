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

describe('GET /api/reports/by-process-range', () => {
  it('400 nếu thiếu endDate', async () => {
    const res = await request(app)
      .get('/api/reports/by-process-range?layoutId=x&startDate=2026-01-01')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(400);
  });

  it('trả về [] nếu không có snapshot trong khoảng ngày', async () => {
    const tok = adminToken();
    const site = (await request(app).post('/api/sites').set('Cookie', `access_token=${tok}`)
      .send({ name: 'SBP' })).body;
    const layout = (await request(app).post('/api/layouts').set('Cookie', `access_token=${tok}`)
      .send({ siteId: site.id, name: 'LBP', widthM: 50, heightM: 30 })).body;

    const res = await request(app)
      .get(`/api/reports/by-process-range?layoutId=${layout.id}&startDate=2026-01-01&endDate=2026-01-31`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('trả về series với đúng stages và dates', async () => {
    const tok = adminToken();
    const site = (await request(app).post('/api/sites').set('Cookie', `access_token=${tok}`)
      .send({ name: 'SBP2' })).body;
    const layout = (await request(app).post('/api/layouts').set('Cookie', `access_token=${tok}`)
      .send({ siteId: site.id, name: 'LBP2', widthM: 100, heightM: 50 })).body;
    const project = (await request(app).post('/api/projects').set('Cookie', `access_token=${tok}`)
      .send({ name: 'PBP' })).body;
    const product = (await request(app).post('/api/products').set('Cookie', `access_token=${tok}`)
      .send({ projectId: project.id, name: 'Block BP', code: 'BP', areaM2: 20, processStage: 'Hàn' })).body;

    await request(app).post('/api/snapshots').set('Cookie', `access_token=${tok}`)
      .send({ layoutId: layout.id, date: '2026-08-01', positions: [{ productId: product.id, x: 0, y: 0, rotation: 0, scale: 1, orientation: 'bottom' }] });
    await request(app).post('/api/snapshots').set('Cookie', `access_token=${tok}`)
      .send({ layoutId: layout.id, date: '2026-08-03', positions: [{ productId: product.id, x: 0, y: 0, rotation: 0, scale: 1, orientation: 'bottom' }] });

    const res = await request(app)
      .get(`/api/reports/by-process-range?layoutId=${layout.id}&startDate=2026-08-01&endDate=2026-08-03`)
      .set('Cookie', `access_token=${tok}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].date).toBe('2026-08-01');
    expect(res.body[0].stages['Hàn']).toBe(20);
    expect(res.body[1].date).toBe('2026-08-03');
    // snapshot giữa (2026-08-02) không có → không xuất hiện
  });

  it('chỉ trả snapshot trong khoảng ngày, bỏ qua ngoài phạm vi', async () => {
    const tok = adminToken();
    const site = (await request(app).post('/api/sites').set('Cookie', `access_token=${tok}`)
      .send({ name: 'SBP3' })).body;
    const layout = (await request(app).post('/api/layouts').set('Cookie', `access_token=${tok}`)
      .send({ siteId: site.id, name: 'LBP3', widthM: 50, heightM: 30 })).body;
    const project = (await request(app).post('/api/projects').set('Cookie', `access_token=${tok}`)
      .send({ name: 'PBP3' })).body;
    const product = (await request(app).post('/api/products').set('Cookie', `access_token=${tok}`)
      .send({ projectId: project.id, name: 'B3', code: 'B3', areaM2: 10 })).body;

    // 3 snapshots: 01/07, 01/08, 01/09
    for (const date of ['2026-07-01', '2026-08-01', '2026-09-01']) {
      await request(app).post('/api/snapshots').set('Cookie', `access_token=${tok}`)
        .send({ layoutId: layout.id, date, positions: [{ productId: product.id, x: 0, y: 0, rotation: 0, scale: 1, orientation: 'bottom' }] });
    }

    const res = await request(app)
      .get(`/api/reports/by-process-range?layoutId=${layout.id}&startDate=2026-08-01&endDate=2026-08-31`)
      .set('Cookie', `access_token=${tok}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].date).toBe('2026-08-01');
  });
});

describe('GET /api/reports/occupation — date range filter', () => {
  async function seedOcc() {
    const tok = adminToken();
    const site = (await request(app).post('/api/sites').set('Cookie', `access_token=${tok}`)
      .send({ name: 'SOcc' })).body;
    const layout = (await request(app).post('/api/layouts').set('Cookie', `access_token=${tok}`)
      .send({ siteId: site.id, name: 'LOcc', widthM: 50, heightM: 30 })).body;
    const project = (await request(app).post('/api/projects').set('Cookie', `access_token=${tok}`)
      .send({ name: 'POcc' })).body;
    const product = (await request(app).post('/api/products').set('Cookie', `access_token=${tok}`)
      .send({ projectId: project.id, name: 'BOcc', code: 'OC', areaM2: 15 })).body;

    for (const date of ['2026-07-01', '2026-08-01']) {
      await request(app).post('/api/snapshots').set('Cookie', `access_token=${tok}`)
        .send({ layoutId: layout.id, date, positions: [{ productId: product.id, x: 0, y: 0, rotation: 0, scale: 1, orientation: 'bottom' }] });
    }
    return { layoutId: layout.id as string };
  }

  it('không filter — trả về toàn bộ (2 snapshot → 1 period liên tục)', async () => {
    const { layoutId } = await seedOcc();
    const res = await request(app)
      .get(`/api/reports/occupation?layoutId=${layoutId}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('startDate filter — bỏ snapshot trước, chỉ còn 1 snapshot → 1 period', async () => {
    const { layoutId } = await seedOcc();
    const res = await request(app)
      .get(`/api/reports/occupation?layoutId=${layoutId}&startDate=2026-08-01`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].startDate).toBe('2026-08-01');
  });

  it('endDate filter — chỉ giữ snapshot trước ngày đó', async () => {
    const { layoutId } = await seedOcc();
    const res = await request(app)
      .get(`/api/reports/occupation?layoutId=${layoutId}&endDate=2026-07-31`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].startDate).toBe('2026-07-01');
  });
});
