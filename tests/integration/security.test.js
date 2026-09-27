'use strict';
/**
 * Security regression tests - one per finding in SECURITY.md, so a fixed
 * vulnerability can never silently come back.
 */
const request = require('supertest');
const { createTestApp, registeredAgent, VALID_USER } = require('../helpers/testApp');
const { loadConfig } = require('../../src/config');

const ADMIN = { full_name: 'Admin', email: 'admin@bookstore.local', password: 'adminpass1' };

describe('SEC-1 broken access control on admin endpoints', () => {
  test.each(['/api/users', '/api/queries'])('%s: anonymous 401, customer 403, admin 200', async (url) => {
    const { app } = await createTestApp();
    await request(app).get(url).expect(401);
    const customer = await registeredAgent(app);
    await customer.get(url).expect(403);
    const admin = await registeredAgent(app, ADMIN);
    const res = await admin.get(url).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (url === '/api/users') expect(res.body[0].password).toBeUndefined();
  });

  test('/api/me tells the front-end who is admin', async () => {
    const { app } = await createTestApp();
    const admin = await registeredAgent(app, ADMIN);
    expect((await admin.get('/api/me')).body.user.isAdmin).toBe(true);
    const customer = await registeredAgent(app);
    expect((await customer.get('/api/me')).body.user.isAdmin).toBe(false);
  });
});

describe('SEC-2 authentication hardening', () => {
  test('same 401 + message for unknown email and wrong password (no enumeration)', async () => {
    const { app } = await createTestApp();
    await registeredAgent(app);
    const wrongPw = await request(app).post('/api/login').send({ email: VALID_USER.email, password: 'wrong-pass' });
    const noUser = await request(app).post('/api/login').send({ email: 'ghost@example.com', password: 'wrong-pass' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });

  test('login is rate limited per IP after repeated failures', async () => {
    const { app } = await createTestApp({ authRateLimit: 3 });
    const attempt = () => request(app).post('/api/login').send({ email: 'x@y.com', password: 'nope1234' });
    for (let i = 0; i < 3; i += 1) expect((await attempt()).status).toBe(401);
    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/Too many attempts/);
  });

  test('session id changes on login (session fixation)', async () => {
    const { app } = await createTestApp();
    await registeredAgent(app);
    const agent = request.agent(app);
    const first = await agent.post('/api/login').send({ email: VALID_USER.email, password: VALID_USER.password });
    const second = await agent.post('/api/login').send({ email: VALID_USER.email, password: VALID_USER.password });
    const sid = (r) => r.headers['set-cookie'][0].split(';')[0];
    expect(sid(first)).not.toBe(sid(second));
  });

  test('logout clears the session cookie', async () => {
    const { app } = await createTestApp();
    const agent = await registeredAgent(app);
    const res = await agent.post('/api/logout').expect(200);
    expect(res.headers['set-cookie'][0]).toMatch(/bookstore\.sid=;/);
  });
});

describe('SEC-3 secrets and configuration', () => {
  test('SESSION_SECRET is mandatory and strong in production/staging', () => {
    expect(() => loadConfig({ APP_ENV: 'production' })).toThrow(/required/);
    expect(() => loadConfig({ APP_ENV: 'staging', SESSION_SECRET: 'short' })).toThrow(/32 characters/);
    expect(loadConfig({ APP_ENV: 'production', SESSION_SECRET: 'x'.repeat(40) }).sessionSecret).toHaveLength(40);
  });

  test('development gets a random secret, never the old hard-coded one', () => {
    const a = loadConfig({}).sessionSecret;
    const b = loadConfig({}).sessionSecret;
    expect(a).not.toBe('bookstore-secret-key');
    expect(a).not.toBe(b);
  });
});

describe('SEC-4 information disclosure & security headers', () => {
  test('internal errors return a generic message (no SQL / stack trace)', async () => {
    const { app, db } = await createTestApp();
    const agent = await registeredAgent(app);
    db.close(); // force the next DB call to throw
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await agent.get('/api/me').expect(500);
    spy.mockRestore();
    expect(res.body).toEqual({ error: 'Internal server error' });
  });

  test('helmet security headers + CSP are sent', async () => {
    const { app } = await createTestApp();
    const res = await request(app).get('/index.html').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['content-security-policy']).toMatch(/object-src 'none'/);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
