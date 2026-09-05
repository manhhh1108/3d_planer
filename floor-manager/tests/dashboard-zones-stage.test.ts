import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken } from './setup.js';

const admin = () => `access_token=${adminToken()}`;

/** Vuông cạnh `s` mét, gốc tại (ox, oy). */
const square = (s: number, ox = 0, oy = 0) => [
  { x: ox, y: oy }, { x: ox + s, y: oy }, { x: ox + s, y: oy + s }, { x: ox, y: oy + s },
];

async function seed(opts: {
  zones?: unknown;
  stageId?: string | null;
  processStage?: string | null;
}) {
  const site = (await request(app).post('/api/sites').set('Cookie', admin())
    .send({ name: 'Site' })).body;
  const layout = (await request(app).post('/api/layouts').set('Cookie', admin())
    .send({ siteId: site.id, name: 'L', widthM: 100, heightM: 50 })).body;
  const project = (await request(app).post('/api/projects').set('Cookie', admin())
    .send({ name: 'P' })).body;
  const product = (await request(app).post('/api/products').set('Cookie', admin())
    .send({
      projectId: project.id, name: 'Block', code: 'B1',
      processStage: opts.processStage ?? undefined, weightKg: 1000, areaM2: 20,
    })).body;
  const snapshot = (await request(app).post('/api/snapshots').set('Cookie', admin())
    .send({
      layoutId: layout.id, date: '2026-08-15', zones: opts.zones,
      positions: [{ productId: product.id, x: 10, y: 10, stageId: opts.stageId ?? undefined }],
    })).body;
  return { site, layout, project, product, snapshot };
}

async function makeStage(name: string) {
  return (await request(app).post('/api/stages').set('Cookie', admin())
    .send({ name, color: '#123456' })).body;
}

describe('diện tích mặt bằng tính theo vùng', () => {
  it('dashboard: có vùng thì mẫu số là tổng diện tích vùng', async () => {
    // 2 vùng 6x6 = 72 m², nhỏ hơn hẳn khung bao 100x50 = 5000 m²
    await seed({ zones: [
      { id: 'z1', points: square(6) },
      { id: 'z2', points: square(6, 20, 0) },
    ] });

    const res = await request(app).get('/api/dashboard').set('Cookie', admin());
    expect(res.status).toBe(200);
    const usage = res.body.layoutUsage[0];
    expect(usage.totalAreaM2).toBe(72);
    // 20 m² sản phẩm / 72 m² vùng
    expect(usage.usagePercent).toBe(27.8);
  });

  it('dashboard: chưa vẽ vùng thì vẫn dùng khung bao', async () => {
    await seed({});
    const res = await request(app).get('/api/dashboard').set('Cookie', admin());
    expect(res.body.layoutUsage[0].totalAreaM2).toBe(5000);
  });

  it('reports/summary: layoutArea lấy theo vùng', async () => {
    const { layout } = await seed({ zones: [{ id: 'z1', points: square(10) }] });
    const res = await request(app)
      .get(`/api/reports/summary?layoutId=${layout.id}&date=2026-08-15`)
      .set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.body.layoutArea).toBe(100);
    expect(res.body.usageRate).toBe(20); // 20/100
  });
});

describe('thống kê gộp theo công đoạn của vùng', () => {
  it('dashboard: ưu tiên stageId của vị trí hơn processStage của sản phẩm', async () => {
    const stage = await makeStage('Sơn');
    await seed({ stageId: stage.id, processStage: 'Han' });

    const res = await request(app).get('/api/dashboard').set('Cookie', admin());
    const names = res.body.byProcessStage.map((s: any) => s.stage);
    expect(names).toContain('Sơn');
    expect(names).not.toContain('Han');
  });

  it('dashboard: chưa gán vùng thì thoái lui về processStage', async () => {
    await seed({ processStage: 'Han' });
    const res = await request(app).get('/api/dashboard').set('Cookie', admin());
    expect(res.body.byProcessStage.map((s: any) => s.stage)).toContain('Han');
  });

  it('reports/by-process: gộp theo tên công đoạn của vùng', async () => {
    const stage = await makeStage('Đóng kiện');
    const { layout } = await seed({ stageId: stage.id, processStage: 'Han' });
    const res = await request(app)
      .get(`/api/reports/by-process?layoutId=${layout.id}&date=2026-08-15`)
      .set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.processStage)).toEqual(['Đóng kiện']);
  });

  it('reports/by-process-range: gộp theo tên công đoạn của vùng', async () => {
    const stage = await makeStage('Bảo ôn');
    const { layout } = await seed({ stageId: stage.id, processStage: 'Han' });
    const res = await request(app)
      .get(`/api/reports/by-process-range?layoutId=${layout.id}&startDate=2026-08-01&endDate=2026-08-31`)
      .set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(Object.keys(res.body[0].stages)).toEqual(['Bảo ôn']);
  });

  it('công đoạn đã tắt vẫn tra được tên (snapshot cũ còn trỏ tới)', async () => {
    const stage = await makeStage('Gá');
    await request(app).delete(`/api/stages/${stage.id}`).set('Cookie', admin());
    await seed({ stageId: stage.id, processStage: 'Han' });

    const res = await request(app).get('/api/dashboard').set('Cookie', admin());
    expect(res.body.byProcessStage.map((s: any) => s.stage)).toContain('Gá');
  });
});
