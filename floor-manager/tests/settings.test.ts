import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken, viewerToken } from './setup.js';

const admin = () => `access_token=${adminToken()}`;
const viewer = () => `access_token=${viewerToken()}`;

describe('/api/settings/outsideZonePolicy', () => {
  it('GET trả mặc định "warn" khi chưa set', async () => {
    const res = await request(app).get('/api/settings/outsideZonePolicy').set('Cookie', viewer());
    expect(res.status).toBe(200);
    expect(res.body.value).toBe('warn');
  });

  it('ADMIN đặt được giá trị hợp lệ, chặn giá trị sai', async () => {
    const ok = await request(app)
      .put('/api/settings/outsideZonePolicy')
      .set('Cookie', admin())
      .send({ value: 'block' });
    expect(ok.status).toBe(200);
    expect(ok.body.value).toBe('block');

    const bad = await request(app)
      .put('/api/settings/outsideZonePolicy')
      .set('Cookie', admin())
      .send({ value: 'nonsense' });
    expect(bad.status).toBe(400);
  });

  it('VIEWER không được PUT', async () => {
    const res = await request(app)
      .put('/api/settings/outsideZonePolicy')
      .set('Cookie', viewer())
      .send({ value: 'silent' });
    expect(res.status).toBe(403);
  });

  it('defaultMarginCm: GET mặc định 50, ADMIN set số hợp lệ, chặn số âm/không phải số', async () => {
    const def = await request(app).get('/api/settings/defaultMarginCm').set('Cookie', viewer());
    expect(def.body.value).toBe(50);
    const ok = await request(app).put('/api/settings/defaultMarginCm').set('Cookie', admin()).send({ value: 40 });
    expect(ok.status).toBe(200); expect(ok.body.value).toBe(40);
    const bad = await request(app).put('/api/settings/defaultMarginCm').set('Cookie', admin()).send({ value: -5 });
    expect(bad.status).toBe(400);
    const bad2 = await request(app).put('/api/settings/defaultMarginCm').set('Cookie', admin()).send({ value: 'x' });
    expect(bad2.status).toBe(400);
  });
});
