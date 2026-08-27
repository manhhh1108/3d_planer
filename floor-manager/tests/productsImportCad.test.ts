import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { convertQueue } from '../server/cad/convertQueue.js';
import { adminToken, planningToken, viewerToken } from './setup.js';
import { deriveProductCode } from '../server/routes/productsImportCad.js';

const FIXTURE_DXF = path.join(import.meta.dirname, 'fixtures', 'box.dxf');

async function makeProject() {
  return (
    await request(app)
      .post('/api/projects')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'P' })
  ).body;
}

describe('mã sản phẩm là duy nhất trong một dự án', () => {
  it('tạo trùng mã trong cùng dự án bị từ chối bằng 409', async () => {
    const proj = await makeProject();
    const first = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ projectId: proj.id, name: 'Dầm A', code: '662-01' });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ projectId: proj.id, name: 'Dầm A lần hai', code: '662-01' });
    expect(second.status).toBe(409);

    const all = await prisma.product.findMany({ where: { projectId: proj.id } });
    expect(all).toHaveLength(1);
  });

  it('cùng mã ở hai dự án khác nhau thì vẫn được', async () => {
    const a = await makeProject();
    const b = await makeProject();
    const token = adminToken();
    const r1 = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: a.id, name: 'X', code: '662-01' });
    const r2 = await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: b.id, name: 'X', code: '662-01' });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
  });

  it('đổi mã sang mã đã có của dự án cũng bị 409', async () => {
    const proj = await makeProject();
    const token = adminToken();
    await request(app)
      .post('/api/products')
      .set('Cookie', `access_token=${token}`)
      .send({ projectId: proj.id, name: 'A', code: 'AAA' });
    const second = (
      await request(app)
        .post('/api/products')
        .set('Cookie', `access_token=${token}`)
        .send({ projectId: proj.id, name: 'B', code: 'BBB' })
    ).body;

    const res = await request(app)
      .put(`/api/products/${second.id}`)
      .set('Cookie', `access_token=${token}`)
      .send({ code: 'AAA' });
    expect(res.status).toBe(409);
  });
});

describe('deriveProductCode', () => {
  it('bỏ đuôi file', () => {
    expect(deriveProductCode('662-01.dwg')).toBe('662-01');
    expect(deriveProductCode('FR01.DXF')).toBe('FR01');
  });

  it('chỉ bỏ đuôi cuối, giữ nguyên các dấu chấm khác', () => {
    expect(deriveProductCode('10022-01-DC 1.1.stp')).toBe('10022-01-DC 1.1');
  });

  it('giữ nguyên dấu tiếng Việt', () => {
    expect(deriveProductCode('Dầm chính A1.dwg')).toBe('Dầm chính A1');
  });

  it('cắt khoảng trắng thừa hai đầu', () => {
    expect(deriveProductCode('  662-01.dwg  ')).toBe('662-01');
  });

  it('bỏ phần đường dẫn nếu trình duyệt gửi kèm', () => {
    expect(deriveProductCode('CAD/662-01.dwg')).toBe('662-01');
    expect(deriveProductCode('C:\\CAD\\662-01.dwg')).toBe('662-01');
  });

  it('tên chỉ có đuôi thì trả chuỗi rỗng', () => {
    expect(deriveProductCode('.dwg')).toBe('');
  });
});

describe('POST /api/products/import-cad', () => {
  it('tạo sản phẩm mới với mã và tên lấy từ tên file', async () => {
    const proj = await makeProject();
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '662-01.dxf');

    expect(res.status).toBe(201);
    expect(res.body.action).toBe('created');
    expect(res.body.code).toBe('662-01');

    const p = await prisma.product.findUnique({ where: { id: res.body.productId } });
    expect(p!.code).toBe('662-01');
    expect(p!.name).toBe('662-01');
    expect(p!.quantity).toBe(1);
    expect(p!.assetId).toBe(res.body.assetId);

    await convertQueue.idle();
    const done = await prisma.product.findUnique({ where: { id: res.body.productId } });
    expect(done!.areaM2).toBeCloseTo(8, 1);
  });

  it('mã đã có thì bỏ qua, không tạo thêm sản phẩm lẫn asset', async () => {
    const proj = await makeProject();
    const token = adminToken();
    const first = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${token}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '662-01.dxf');
    expect(first.status).toBe(201);
    const assetsAfterFirst = await prisma.asset.count();

    const second = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${token}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '662-01.dxf');

    expect(second.status).toBe(200);
    expect(second.body.action).toBe('skipped');
    expect(second.body.productId).toBe(first.body.productId);
    expect(await prisma.product.count({ where: { projectId: proj.id } })).toBe(1);
    expect(await prisma.asset.count()).toBe(assetsAfterFirst);
  });

  it('hai request cùng mã chạy song song chỉ tạo đúng một sản phẩm', async () => {
    const proj = await makeProject();
    const token = adminToken();
    const send = () =>
      request(app)
        .post('/api/products/import-cad')
        .set('Cookie', `access_token=${token}`)
        .field('projectId', proj.id)
        .attach('file', fs.readFileSync(FIXTURE_DXF), 'SONG-SONG.dxf');

    const [a, b] = await Promise.all([send(), send()]);
    const actions = [a.body.action, b.body.action].sort();
    expect(actions).toEqual(['created', 'skipped']);
    expect(await prisma.product.count({ where: { projectId: proj.id } })).toBe(1);
    await convertQueue.idle();
  });

  it('đuôi file không hỗ trợ thì 400 và không để lại bản ghi', async () => {
    const proj = await makeProject();
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', proj.id)
      .attach('file', Buffer.from('xin chao'), 'ghichu.txt');

    expect(res.status).toBe(400);
    expect(await prisma.product.count({ where: { projectId: proj.id } })).toBe(0);
    expect(await prisma.asset.count()).toBe(0);
  });

  it('thiếu projectId thì 400', async () => {
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'a.dxf');
    expect(res.status).toBe(400);
  });

  it('projectId không tồn tại thì 400, không phải 500', async () => {
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', 'khong-co-that')
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'a.dxf');
    expect(res.status).toBe(400);
    expect(await prisma.asset.count()).toBe(0);
  });

  it('tên file chỉ có đuôi thì 400', async () => {
    const proj = await makeProject();
    const res = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${adminToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), '.dxf');
    expect(res.status).toBe(400);
  });

  it('PLANNING nhập được, VIEWER thì không', async () => {
    const proj = await makeProject();
    const ok = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${planningToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'PL-01.dxf');
    expect(ok.status).toBe(201);

    const denied = await request(app)
      .post('/api/products/import-cad')
      .set('Cookie', `access_token=${viewerToken()}`)
      .field('projectId', proj.id)
      .attach('file', fs.readFileSync(FIXTURE_DXF), 'VW-01.dxf');
    expect(denied.status).toBe(403);
    await convertQueue.idle();
  });
});
