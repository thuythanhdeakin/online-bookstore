'use strict';
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');

describe('queries API', () => {
  let app;
  beforeEach(async () => ({ app } = await createTestApp()));

  test('submit a query', async () => {
    await request(app).post('/api/queries')
      .send({ full_name: 'T', email: 't@x.com', query_message: 'Do you ship to Perth?' }).expect(201);
  });

  test.each([
    [{ full_name: 'T', email: 't@x.com' }],
    [{ full_name: 'T', email: 'bad', query_message: 'hi' }],
    [{ full_name: 'T', email: 't@x.com', query_message: 'hi', phone: 'abc' }],
  ])('invalid query %j -> 400', async (body) => {
    await request(app).post('/api/queries').send(body).expect(400);
  });
});

describe('ops endpoints', () => {
  test('health, ready, metrics', async () => {
    const { app } = await createTestApp();
    const health = await request(app).get('/health').expect(200);
    expect(health.body).toMatchObject({ status: 'ok', env: 'test' });

    const ready = await request(app).get('/ready').expect(200);
    expect(ready.body).toMatchObject({ status: 'ready', database: true, schemaVersion: 3 });

    const metrics = await request(app).get('/metrics').expect(200);
    expect(metrics.text).toMatch(/http_requests_total\{method="GET",route="\/health",status="200"\}/);
    expect(metrics.text).toMatch(/bookstore_app_info/);
    expect(metrics.text).toMatch(/process_cpu_user_seconds_total/);
  });

  test('ready returns 503 when the database is down', async () => {
    const { app, db } = await createTestApp();
    db.close();
    const res = await request(app).get('/ready').expect(503);
    expect(res.body.database).toBe(false);
  });

  test('chaos endpoints exist only when enabled', async () => {
    const on = (await createTestApp()).app;
    await request(on).get('/chaos/error').expect(500);
    expect((await request(on).get('/chaos/slow?seconds=0')).body.slept).toBe(0);
    const off = (await createTestApp({ chaosEnabled: false })).app;
    await request(off).get('/chaos/error').expect(404);
  });

  test('static front-end pages are served', async () => {
    const { app } = await createTestApp();
    const res = await request(app).get('/index.html').expect(200);
    expect(res.text).toMatch(/Online Bookstore/);
  });

  test('catalogue endpoint lists books with prices', async () => {
    const { app } = await createTestApp();
    const res = await request(app).get('/api/books').expect(200);
    expect(res.body.length).toBe(12);
    expect(res.body[0]).toMatchObject({ title: 'The Great Gatsby', price: 18.99 });
  });

  test('unknown API route -> JSON 404', async () => {
    const { app } = await createTestApp();
    const res = await request(app).get('/api/does-not-exist').expect(404);
    expect(res.body.error).toBe('Not found');
  });
});
