import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import prisma from '../server/db.js';
import { adminToken } from './setup.js';
import { deriveProductCode } from '../server/routes/productsImportCad.js';

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
