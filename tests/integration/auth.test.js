'use strict';
const request = require('supertest');
const { createTestApp, registeredAgent, VALID_USER } = require('../helpers/testApp');

describe('auth API', () => {
  let app;
  beforeEach(async () => ({ app } = await createTestApp()));

  test('register -> me -> logout -> me', async () => {
    const agent = request.agent(app);
    const reg = await agent.post('/api/register').send({ ...VALID_USER, email: 'Thanh@Example.com' }).expect(201);
    expect(reg.body.user.email).toBe('thanh@example.com'); // normalised
    expect(reg.body.user.password).toBeUndefined();

    const me = await agent.get('/api/me').expect(200);
    expect(me.body).toMatchObject({ loggedIn: true, user: { full_name: 'Thanh', points: 0 } });

    await agent.post('/api/logout').expect(200);
    expect((await agent.get('/api/me')).body.loggedIn).toBe(false);
  });

  test('duplicate email is rejected (case-insensitive)', async () => {
    await registeredAgent(app);
    const res = await request(app).post('/api/register').send({ ...VALID_USER, email: 'THANH@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/);
  });

  test.each([
    [{ ...VALID_USER, email: 'bad' }],
    [{ ...VALID_USER, password: '123' }],
    [{ ...VALID_USER, phone: 'abc' }],
    [{ email: 'x@y.com' }],
  ])('invalid registration %j -> 400', async (body) => {
    await request(app).post('/api/register').send(body).expect(400);
  });

  test('login succeeds with correct password and sets session', async () => {
    await registeredAgent(app);
    const agent = request.agent(app);
    await agent.post('/api/login').send({ email: VALID_USER.email, password: VALID_USER.password }).expect(200);
    expect((await agent.get('/api/me')).body.loggedIn).toBe(true);
  });

  test('login fails with wrong password / unknown user / missing fields', async () => {
    await registeredAgent(app);
    expect((await request(app).post('/api/login').send({ email: VALID_USER.email, password: 'nope' })).status)
      .toBeGreaterThanOrEqual(400);
    expect((await request(app).post('/api/login').send({ email: 'ghost@x.com', password: 'whatever' })).status)
      .toBeGreaterThanOrEqual(400);
    await request(app).post('/api/login').send({}).expect(400);
  });

  test('session cookie is HttpOnly', async () => {
    const res = await request(app).post('/api/register').send(VALID_USER).expect(201);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
  });

  test('malformed JSON returns 400 JSON, not an HTML stack trace', async () => {
    const res = await request(app).post('/api/login').set('Content-Type', 'application/json').send('{bad json');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/json/);
  });
});
