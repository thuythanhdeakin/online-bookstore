'use strict';
/**
 * Smoke / end-to-end tests against a DEPLOYED environment.
 *   BASE_URL=http://bookstore-staging:3000 npx jest tests/smoke
 * Skipped automatically when BASE_URL is not set.
 */
const BASE_URL = process.env.BASE_URL;
const EXPECTED_VERSION = process.env.EXPECTED_VERSION;
const READ_ONLY = process.env.SMOKE_READ_ONLY === 'true';
const d = BASE_URL ? describe : describe.skip;

async function call(path, options = {}, cookie) {
  const headers = { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) };
  const res = await fetch(BASE_URL + path, { ...options, headers });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body, cookie: res.headers.get('set-cookie') };
}

d(`smoke tests against ${BASE_URL}`, () => {
  test('health + version', async () => {
    const { status, body } = await call('/health');
    expect(status).toBe(200);
    if (EXPECTED_VERSION) expect(body.version).toBe(EXPECTED_VERSION);
  });

  test('ready (DB reachable, schema migrated)', async () => {
    const { status, body } = await call('/ready');
    expect(status).toBe(200);
    expect(body.schemaVersion).toBeGreaterThanOrEqual(3);
  });

  test('home page and metrics are served', async () => {
    expect((await call('/index.html')).status).toBe(200);
    expect((await call('/metrics')).body).toMatch(/http_requests_total/);
  });

  (READ_ONLY ? test.skip : test)('customer journey: register -> order -> history', async () => {
    const email = `smoke-${Date.now()}@example.com`;
    const reg = await call('/api/register', {
      method: 'POST', body: JSON.stringify({ full_name: 'Smoke', email, password: 'smoke123' }),
    });
    expect(reg.status).toBe(201);
    const cookie = reg.cookie.split(';')[0];
    const order = await call('/api/orders', {
      method: 'POST',
      body: JSON.stringify({
        full_name: 'Smoke', email, address: '1 Test St', city: 'Melbourne', postcode: '3000',
        payment_method: 'PayPal', items: [{ title: 'The Great Gatsby', qty: 1 }],
      }),
    }, cookie);
    expect(order.status).toBe(201);
    expect(order.body.total).toBe(18.99);
    const history = await call('/api/orders', {}, cookie);
    expect(history.body[0].items[0].title).toBe('The Great Gatsby');
  });
});
