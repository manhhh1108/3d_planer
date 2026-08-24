import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken } from './setup.js';

const T = () => adminToken();
const auth = (r: request.Test) => r.set('Cookie', `access_token=${T()}`);

async function makeSite(name: string) {
  return (await auth(request(app).post('/api/sites')).send({ name })).body;
}
async function makeLayout(siteId: string, name: string) {
  return (await auth(request(app).post('/api/layouts'))
    .send({ siteId, name, widthM: 100, heightM: 60 })).body;
}
async function makeProduct(projectId: string, code: string, quantity = 1) {
  return (await auth(request(app).post('/api/products'))
    .send({ projectId, name: code, code, quantity })).body;
}
async function makeProject(name = 'P') {
  return (await auth(request(app).post('/api/projects')).send({ name })).body;
}
async function place(layoutId: string, date: string, productIds: string[]) {
  return (await auth(request(app).post('/api/snapshots')).send({
    layoutId,
    date,
    positions: productIds.map((productId, i) => ({ productId, x: i, y: 0 })),
  })).body;
}
async function usage(excludeLayoutId?: string) {
  const q = excludeLayoutId ? `?excludeLayoutId=${excludeLayoutId}` : '';
  const res = await auth(request(app).get(`/api/products/usage${q}`));
  expect(res.status).toBe(200);
  return res.body as {
    productId: string;
    count: number;
    layouts: { layoutId: string; layoutName: string; siteName: string; count: number }[];
  }[];
}

describe('product usage across layouts', () => {
  it('không có bố trí nào thì trả mảng rỗng', async () => {
    expect(await usage()).toEqual([]);
  });

  it('đếm được bản đang nằm ở mặt bằng khác, kèm tên mặt bằng và công trường', async () => {
    const site = await makeSite('Nhà máy chính');
    const a = await makeLayout(site.id, 'VHE1');
    const b = await makeLayout(site.id, 'VHE2');
    const proj = await makeProject();
    const prod = await makeProduct(proj.id, 'ID01');

    await place(a.id, '2026-08-24', [prod.id]);

    // Đứng ở mặt bằng B thì bản kia đã bị chiếm
    const fromB = await usage(b.id);
    expect(fromB).toHaveLength(1);
    expect(fromB[0].productId).toBe(prod.id);
    expect(fromB[0].count).toBe(1);
    expect(fromB[0].layouts).toEqual([
      { layoutId: a.id, layoutName: 'VHE1', siteName: 'Nhà máy chính', count: 1 },
    ]);

    // Đứng ở chính mặt bằng A thì không tự trừ mình
    expect(await usage(a.id)).toEqual([]);
  });

  it('chỉ tính snapshot mới nhất, snapshot cũ là lịch sử không chiếm chỗ', async () => {
    const site = await makeSite('S');
    const a = await makeLayout(site.id, 'A');
    const b = await makeLayout(site.id, 'B');
    const proj = await makeProject();
    const prod = await makeProduct(proj.id, 'ID01');

    await place(a.id, '2026-08-20', [prod.id]); // hôm trước có đặt
    await place(a.id, '2026-08-24', []);        // hôm nay đã dỡ đi

    expect(await usage(b.id)).toEqual([]);
  });

  it('cộng dồn qua nhiều mặt bằng và nhiều công trường', async () => {
    const s1 = await makeSite('Công trường 1');
    const s2 = await makeSite('Công trường 2');
    const a = await makeLayout(s1.id, 'A');
    const b = await makeLayout(s2.id, 'B');
    const c = await makeLayout(s1.id, 'C');
    const proj = await makeProject();
    const prod = await makeProduct(proj.id, 'ID01', 5);

    await place(a.id, '2026-08-24', [prod.id, prod.id]); // 2 bản ở A
    await place(b.id, '2026-08-24', [prod.id]);          // 1 bản ở B

    const fromC = await usage(c.id);
    expect(fromC).toHaveLength(1);
    expect(fromC[0].count).toBe(3);
    expect(fromC[0].layouts.map((l) => l.layoutName).sort()).toEqual(['A', 'B']);
    expect(fromC[0].layouts.find((l) => l.layoutName === 'A')!.count).toBe(2);
    expect(fromC[0].layouts.find((l) => l.layoutName === 'B')!.siteName).toBe('Công trường 2');

    // Đứng ở A thì chỉ còn 1 bản của B bị chiếm
    const fromA = await usage(a.id);
    expect(fromA[0].count).toBe(1);
  });

  it('không excludeLayoutId thì tính toàn bộ', async () => {
    const site = await makeSite('S');
    const a = await makeLayout(site.id, 'A');
    const proj = await makeProject();
    const prod = await makeProduct(proj.id, 'ID01');
    await place(a.id, '2026-08-24', [prod.id]);

    const all = await usage();
    expect(all).toHaveLength(1);
    expect(all[0].count).toBe(1);
  });

  it('"usage" không bị nhầm thành id sản phẩm', async () => {
    // GET /:id đứng sau /usage trong router — nếu đảo thứ tự sẽ ra 404
    const res = await auth(request(app).get('/api/products/usage'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('position elevation', () => {
  it('lưu và đọc lại cao độ của block', async () => {
    const site = await makeSite('S');
    const layout = await makeLayout(site.id, 'L');
    const proj = await makeProject();
    const prod = await makeProduct(proj.id, 'ID01', 3);

    const snap = (await auth(request(app).post('/api/snapshots')).send({
      layoutId: layout.id,
      date: '2026-08-24',
      positions: [
        { productId: prod.id, x: 1, y: 2, elevationM: 3.5 },
        { productId: prod.id, x: 4, y: 5 }, // không gửi -> mặc định 0
      ],
    })).body;

    const got = (await auth(request(app).get(`/api/snapshots/${snap.id}`))).body;
    const byX = Object.fromEntries(got.positions.map((p: { x: number; elevationM: number }) => [p.x, p.elevationM]));
    expect(byX[1]).toBe(3.5);
    expect(byX[4]).toBe(0);
  });

  it('cao độ không hợp lệ thì về 0 chứ không làm hỏng lần lưu', async () => {
    const site = await makeSite('S');
    const layout = await makeLayout(site.id, 'L');
    const proj = await makeProject();
    const prod = await makeProduct(proj.id, 'ID01');

    const res = await auth(request(app).post('/api/snapshots')).send({
      layoutId: layout.id,
      date: '2026-08-24',
      positions: [{ productId: prod.id, x: 0, y: 0, elevationM: 'cao' }],
    });
    expect(res.status).toBe(201);
    const got = (await auth(request(app).get(`/api/snapshots/${res.body.id}`))).body;
    expect(got.positions[0].elevationM).toBe(0);
  });
});
