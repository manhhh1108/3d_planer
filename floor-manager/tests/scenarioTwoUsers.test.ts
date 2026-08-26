/**
 * Diễn lại nguyên kịch bản hai người cùng mở một mặt bằng.
 *
 * Chạy trên app Express thật + DB thật (bản test), theo đúng thứ tự thao tác
 * người dùng làm. In ra từng bước để đọc được hành vi, không chỉ pass/fail.
 */
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken, planningToken } from './setup.js';

const DATE = '2026-08-26';
const AN = () => (r: request.Test) => r.set('Cookie', `access_token=${adminToken()}`);
const BINH = () => (r: request.Test) => r.set('Cookie', `access_token=${planningToken()}`);

const log = (s: string) => console.log('   ' + s);

async function setup() {
  const t = adminToken();
  const site = (await request(app).post('/api/sites')
    .set('Cookie', `access_token=${t}`).send({ name: 'Nhà máy chính' })).body;
  const layout = (await request(app).post('/api/layouts')
    .set('Cookie', `access_token=${t}`)
    .send({ siteId: site.id, name: 'VHE1', widthM: 100, heightM: 60 })).body;
  const project = (await request(app).post('/api/projects')
    .set('Cookie', `access_token=${t}`).send({ name: 'Dự án A' })).body;
  const mk = async (code: string) => (await request(app).post('/api/products')
    .set('Cookie', `access_token=${t}`)
    .send({ projectId: project.id, name: code, code, quantity: 3 })).body;
  return { layout, p1: await mk('KHOI-1'), p2: await mk('KHOI-2') };
}

const openLayout = (who: (r: request.Test) => request.Test, layoutId: string) =>
  who(request(app).put(`/api/layouts/${layoutId}/lock`)).send({ date: DATE });

const closeLayout = (who: (r: request.Test) => request.Test, layoutId: string) =>
  who(request(app).delete(`/api/layouts/${layoutId}/lock?date=${DATE}`));

const save = (who: (r: request.Test) => request.Test, layoutId: string, positions: unknown[]) =>
  who(request(app).post('/api/snapshots')).send({ layoutId, date: DATE, positions });

describe('KỊCH BẢN: An và Bình cùng mở một mặt bằng', () => {
  it('diễn từ lúc mở tới lúc bàn giao', async () => {
    const { layout, p1, p2 } = await setup();

    console.log('\n── 1. An mở mặt bằng trước ──');
    const anOpen = await openLayout(AN(), layout.id);
    log(`An giành được khoá: mine=${anOpen.body.mine}`);
    expect(anOpen.body.mine).toBe(true);

    console.log('\n── 2. Bình mở cùng mặt bằng, cùng ngày ──');
    const binhOpen = await openLayout(BINH(), layout.id);
    log(`Bình thấy: đang bị "${binhOpen.body.holder.name}" giữ, mine=${binhOpen.body.mine}`);
    log('=> giao diện Bình hiện banner vàng, KHÔNG cướp khoá');
    expect(binhOpen.body.mine).toBe(false);
    expect(binhOpen.body.holder.name).toBe('Admin');

    console.log('\n── 3. Bình vẫn đọc được mặt bằng ──');
    await save(AN(), layout.id, [
      { productId: p1.id, x: 10, y: 10 },
      { productId: p2.id, x: 20, y: 20 },
    ]);
    const read = await BINH()(request(app).get(`/api/snapshots?layoutId=${layout.id}`));
    log(`Bình đọc danh sách snapshot: HTTP ${read.status}, ${read.body.length} bản`);
    expect(read.status).toBe(200);

    console.log('\n── 4. Bình kéo block rồi bấm lưu ──');
    const blocked = await save(BINH(), layout.id, [
      { productId: p1.id, x: 99, y: 99 },
      { productId: p2.id, x: 20, y: 20 },
    ]);
    log(`Bị chặn: HTTP ${blocked.status} — "${blocked.body.error}"`);
    log('=> việc kéo thả của Bình còn nguyên trên màn hình, chỉ là chưa ghi xuống');
    expect(blocked.status).toBe(423);

    console.log('\n── 5. Dữ liệu của An không bị Bình đè ──');
    const afterBlocked = (await AN()(request(app).get(`/api/snapshots?layoutId=${layout.id}`))).body[0];
    const detail = (await AN()(request(app).get(`/api/snapshots/${afterBlocked.id}`))).body;
    const xs = detail.positions.map((p: { x: number }) => p.x).sort((a: number, b: number) => a - b);
    log(`Vị trí trên server vẫn là: x = ${xs.join(', ')} (không có 99)`);
    expect(xs).toEqual([10, 20]);

    console.log('\n── 6. An làm xong, đóng tab ──');
    await closeLayout(AN(), layout.id);
    const binhRetry = await openLayout(BINH(), layout.id);
    log(`Bình giành được khoá: mine=${binhRetry.body.mine}`);
    expect(binhRetry.body.mine).toBe(true);

    console.log('\n── 7. Bình chỉ dịch KHOI-1, không đụng KHOI-2 ──');
    const saved = await save(BINH(), layout.id, [
      { productId: p1.id, x: 55, y: 55 },
      { productId: p2.id, x: 20, y: 20 },
    ]);
    expect(saved.status).toBe(201);
    const author = Object.fromEntries(
      saved.body.positions.map((p: { x: number; updatedBy: string }) => [p.x, p.updatedBy]),
    );
    log(`KHOI-1 (vừa dịch tới x=55) -> ${author[55]}`);
    log(`KHOI-2 (không đụng tới)   -> ${author[20]}`);
    log('=> mỗi block nhớ đúng người thao tác cuối, không phải người lưu cuối');
    expect(author[55]).toBe('planning@test.com');
    expect(author[20]).toBe('admin@test.com');
  });

  it('An mất điện giữa chừng thì Bình không phải chờ mãi', async () => {
    const { layout, p1 } = await setup();

    await openLayout(AN(), layout.id);
    log('An đang giữ khoá, rồi máy tắt đột ngột — không kịp nhả khoá');

    let blocked = await save(BINH(), layout.id, [{ productId: p1.id, x: 1, y: 1 }]);
    log(`Ngay lúc đó Bình lưu: HTTP ${blocked.status}`);
    expect(blocked.status).toBe(423);

    // Client của An ngừng gia hạn -> khoá hết hạn sau 2 phút
    await prisma.layoutLock.updateMany({
      where: { layoutId: layout.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    log('Sau 2 phút không thấy gia hạn, khoá tự hết hạn');

    const ok = await save(BINH(), layout.id, [{ productId: p1.id, x: 1, y: 1 }]);
    log(`Bình lưu lại: HTTP ${ok.status} — không cần ai can thiệp`);
    expect(ok.status).toBe(201);
  });

  it('hai người soạn hai NGÀY khác nhau thì không chặn nhau', async () => {
    const { layout, p1 } = await setup();

    const a = await openLayout(AN(), layout.id);
    log(`An soạn cho ${DATE}: mine=${a.body.mine}`);

    const b = await BINH()(request(app).put(`/api/layouts/${layout.id}/lock`))
      .send({ date: '2026-09-01' });
    log(`Bình soạn cho 2026-09-01: mine=${b.body.mine}`);
    expect(b.body.mine).toBe(true);

    const sa = await save(AN(), layout.id, [{ productId: p1.id, x: 1, y: 1 }]);
    const sb = await BINH()(request(app).post('/api/snapshots'))
      .send({ layoutId: layout.id, date: '2026-09-01', positions: [{ productId: p1.id, x: 2, y: 2 }] });
    log(`Cả hai lưu cùng lúc: An ${sa.status}, Bình ${sb.status}`);
    expect(sa.status).toBe(201);
    expect(sb.status).toBe(201);
  });
});
