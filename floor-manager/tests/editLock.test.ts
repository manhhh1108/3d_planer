import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken, planningToken, viewerToken } from './setup.js';

const DATE = '2026-08-24';
const as = (token: string) => (r: request.Test) => r.set('Cookie', `access_token=${token}`);
const admin = () => as(adminToken());
const planner = () => as(planningToken());

async function seed() {
  const site = (await admin()(request(app).post('/api/sites')).send({ name: 'S' })).body;
  const layout = (await admin()(request(app).post('/api/layouts'))
    .send({ siteId: site.id, name: 'L', widthM: 100, heightM: 60 })).body;
  const project = (await admin()(request(app).post('/api/projects')).send({ name: 'P' })).body;
  const product = (await admin()(request(app).post('/api/products'))
    .send({ projectId: project.id, name: 'B', code: 'B1', quantity: 5 })).body;
  return { layout, product };
}

const save = (who: (r: request.Test) => request.Test, layoutId: string, positions: unknown[]) =>
  who(request(app).post('/api/snapshots')).send({ layoutId, date: DATE, positions });

describe('khoá chỉnh sửa mặt bằng', () => {
  it('người giành trước giữ khoá; người sau thấy đúng ai đang giữ', async () => {
    const { layout } = await seed();

    const first = await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    expect(first.status).toBe(200);
    expect(first.body.locked).toBe(true);
    expect(first.body.mine).toBe(true);
    expect(first.body.holder.name).toBe('Admin');

    // Người thứ hai giành: KHÔNG cướp được, và thấy tên người đang giữ
    const second = await planner()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    expect(second.status).toBe(200);
    expect(second.body.locked).toBe(true);
    expect(second.body.mine).toBe(false);
    expect(second.body.holder.name).toBe('Admin');
  });

  it('GET cho biết ai đang giữ mà không đụng vào khoá', async () => {
    const { layout } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });

    const seen = await planner()(request(app).get(`/api/layouts/${layout.id}/lock?date=${DATE}`));
    expect(seen.body.locked).toBe(true);
    expect(seen.body.mine).toBe(false);
    expect(seen.body.holder.email).toBe('admin@test.com');
  });

  it('mặt bằng chưa ai mở thì khoá trống', async () => {
    const { layout } = await seed();
    const res = await admin()(request(app).get(`/api/layouts/${layout.id}/lock?date=${DATE}`));
    expect(res.body).toEqual({ locked: false, holder: null, mine: false });
  });

  it('khoá theo từng NGÀY — soạn ngày khác không đụng nhau', async () => {
    const { layout } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });

    const other = await planner()(request(app).put(`/api/layouts/${layout.id}/lock`))
      .send({ date: '2026-09-01' });
    expect(other.body.mine).toBe(true);
  });

  it('khoá hết hạn thì người khác giành được — không kẹt khi ai đó đóng tab', async () => {
    const { layout } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });

    await prisma.layoutLock.updateMany({
      where: { layoutId: layout.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await planner()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    expect(res.body.mine).toBe(true);
    expect(res.body.holder.email).toBe('planning@test.com');
  });

  it('nhả khoá xong người khác giành được ngay', async () => {
    const { layout } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    const rel = await admin()(request(app).delete(`/api/layouts/${layout.id}/lock?date=${DATE}`));
    expect(rel.status).toBe(200);

    const res = await planner()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    expect(res.body.mine).toBe(true);
  });

  it('không nhả được khoá của người khác', async () => {
    const { layout } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    const res = await planner()(request(app).delete(`/api/layouts/${layout.id}/lock?date=${DATE}`));
    expect(res.status).toBe(403);
  });

  it('VIEWER không giành được khoá', async () => {
    const { layout } = await seed();
    const res = await as(viewerToken())(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    expect(res.status).toBe(403);
  });
});

describe('khoá chặn LƯU chứ không chặn xem', () => {
  it('người giữ khoá lưu được', async () => {
    const { layout, product } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    const res = await save(admin(), layout.id, [{ productId: product.id, x: 1, y: 1 }]);
    expect(res.status).toBe(201);
  });

  it('người khác bị chặn lưu với 423 và biết ai đang giữ', async () => {
    const { layout, product } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });

    const res = await save(planner(), layout.id, [{ productId: product.id, x: 5, y: 5 }]);
    expect(res.status).toBe(423);
    expect(res.body.holder.name).toBe('Admin');
    expect(res.body.error).toContain('Admin');
  });

  it('vẫn ĐỌC được mặt bằng dù người khác đang giữ khoá', async () => {
    const { layout, product } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    await save(admin(), layout.id, [{ productId: product.id, x: 1, y: 1 }]);

    const list = await planner()(request(app).get(`/api/snapshots?layoutId=${layout.id}`));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
  });

  it('không ai giữ khoá thì ai lưu cũng được', async () => {
    const { layout, product } = await seed();
    const res = await save(planner(), layout.id, [{ productId: product.id, x: 2, y: 2 }]);
    expect(res.status).toBe(201);
  });

  it('khoá hết hạn thì hết chặn', async () => {
    const { layout, product } = await seed();
    await admin()(request(app).put(`/api/layouts/${layout.id}/lock`)).send({ date: DATE });
    await prisma.layoutLock.updateMany({
      where: { layoutId: layout.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const res = await save(planner(), layout.id, [{ productId: product.id, x: 3, y: 3 }]);
    expect(res.status).toBe(201);
  });
});

describe('người thao tác cuối với từng block', () => {
  const posOf = (body: { positions: { x: number; updatedBy: string }[] }) =>
    Object.fromEntries(body.positions.map((p) => [p.x, p.updatedBy]));

  it('ghi nhận người đặt block', async () => {
    const { layout, product } = await seed();
    const res = await save(admin(), layout.id, [{ productId: product.id, x: 1, y: 1 }]);
    expect(res.body.positions[0].updatedBy).toBe('admin@test.com');
  });

  it('block KHÔNG bị đụng tới thì giữ nguyên người cũ, dù người khác lưu đè', async () => {
    const { layout, product } = await seed();
    await save(admin(), layout.id, [
      { productId: product.id, x: 1, y: 1 },
      { productId: product.id, x: 2, y: 2 },
    ]);

    // Người khác lưu, chỉ dịch block thứ hai
    const res = await save(planner(), layout.id, [
      { productId: product.id, x: 1, y: 1 },
      { productId: product.id, x: 9, y: 9 },
    ]);
    expect(res.status).toBe(201);

    const by = posOf(res.body);
    expect(by[1]).toBe('admin@test.com');    // không đụng tới -> giữ nguyên
    expect(by[9]).toBe('planning@test.com'); // vừa dịch -> người mới
  });

  it('block mới thêm ghi tên người thêm', async () => {
    const { layout, product } = await seed();
    await save(admin(), layout.id, [{ productId: product.id, x: 1, y: 1 }]);
    const res = await save(planner(), layout.id, [
      { productId: product.id, x: 1, y: 1 },
      { productId: product.id, x: 7, y: 7 },
    ]);
    const by = posOf(res.body);
    expect(by[1]).toBe('admin@test.com');
    expect(by[7]).toBe('planning@test.com');
  });

  it('đổi xoay hoặc cao độ cũng tính là thao tác', async () => {
    const { layout, product } = await seed();
    await save(admin(), layout.id, [{ productId: product.id, x: 1, y: 1, rotation: 0 }]);
    const res = await save(planner(), layout.id, [
      { productId: product.id, x: 1, y: 1, rotation: 90 },
    ]);
    expect(res.body.positions[0].updatedBy).toBe('planning@test.com');
  });

  it('lưu lại y nguyên thì không đổi tên ai', async () => {
    const { layout, product } = await seed();
    await save(admin(), layout.id, [{ productId: product.id, x: 1, y: 1 }]);
    const res = await save(planner(), layout.id, [{ productId: product.id, x: 1, y: 1 }]);
    expect(res.body.positions[0].updatedBy).toBe('admin@test.com');
  });
});
