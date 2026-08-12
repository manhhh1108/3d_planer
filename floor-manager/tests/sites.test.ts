import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../server/app.js';

describe('sites', () => {
  it('creates a site and lists it with layout count', async () => {
    const created = await request(app)
      .post('/api/sites')
      .send({ name: 'Xưởng 1', address: 'KCN A' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Xưởng 1');
    expect(created.body.active).toBe(true);

    const res = await request(app).get('/api/sites');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]._count.layouts).toBe(0);
  });

  it('rejects create without name', async () => {
    const res = await request(app).post('/api/sites').send({ address: 'x' });
    expect(res.status).toBe(400);
  });

  it('gets a site with its layouts', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    await request(app)
      .post('/api/layouts')
      .send({ siteId: site.id, name: 'Bãi A', widthM: 100, heightM: 50 });

    const res = await request(app).get(`/api/sites/${site.id}`);
    expect(res.status).toBe(200);
    expect(res.body.layouts).toHaveLength(1);
    expect(res.body.layouts[0].name).toBe('Bãi A');
  });

  it('updates a site', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    const res = await request(app)
      .put(`/api/sites/${site.id}`)
      .send({ name: 'S2', active: false });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('S2');
    expect(res.body.active).toBe(false);
  });

  it('deletes an empty site', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    const res = await request(app).delete(`/api/sites/${site.id}`);
    expect(res.status).toBe(204);
  });

  it('refuses to delete a site that has layouts', async () => {
    const site = (await request(app).post('/api/sites').send({ name: 'S' })).body;
    await request(app)
      .post('/api/layouts')
      .send({ siteId: site.id, name: 'L', widthM: 10, heightM: 10 });
    const res = await request(app).delete(`/api/sites/${site.id}`);
    expect(res.status).toBe(409);
  });
});
