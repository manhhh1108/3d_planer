import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';
import { adminToken } from './setup.js';

describe('layouts', () => {
  it('filters layouts by siteId', async () => {
    const site1 = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'A' })).body;
    const site2 = (await request(app)
      .post('/api/sites')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ name: 'B' })).body;
    await request(app)
      .post('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ siteId: site1.id, name: 'L1', widthM: 10, heightM: 10 });
    await request(app)
      .post('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`)
      .send({ siteId: site2.id, name: 'L2', widthM: 10, heightM: 10 });

    const res = await request(app)
      .get(`/api/layouts?siteId=${site1.id}`)
      .set('Cookie', `access_token=${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('L1');

    const all = await request(app)
      .get('/api/layouts')
      .set('Cookie', `access_token=${adminToken()}`);
    expect(all.body).toHaveLength(2);
  });
});
