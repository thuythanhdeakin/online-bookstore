'use strict';
const request = require('supertest');
const { createTestApp, registeredAgent, DELIVERY } = require('../helpers/testApp');

describe('orders API', () => {
  let app;
  let db;
  beforeEach(async () => ({ app, db } = await createTestApp()));

  test('requires login', async () => {
    await request(app).get('/api/orders').expect(401);
    await request(app).post('/api/orders').send(DELIVERY).expect(401);
  });

  test('place order -> server-side total, items saved, loyalty points added', async () => {
    const agent = await registeredAgent(app);
    const res = await agent.post('/api/orders').send({
      ...DELIVERY,
      total: 0.01, // tampered client total must be ignored
      items: [
        { title: 'The Great Gatsby', price: 0, qty: 2, img: 'https://covers.openlibrary.org/a.jpg' },
        { title: 'A Brief History of Time', price: 0, qty: 1 },
      ],
    }).expect(201);
    expect(res.body.total).toBe(67.97);
    expect(res.body.pointsEarned).toBe(67);

    const history = (await agent.get('/api/orders').expect(200)).body;
    expect(history).toHaveLength(1);
    expect(history[0].total).toBe(67.97);
    expect(history[0].items).toHaveLength(2);
    expect(history[0].items[0]).toMatchObject({ title: 'The Great Gatsby', price: 18.99, qty: 2 });

    expect((await agent.get('/api/me')).body.user.points).toBe(67);
  });

  test('each order gets the correct id even when placed within the same second', async () => {
    const agent = await registeredAgent(app);
    const a = await agent.post('/api/orders').send({ ...DELIVERY, items: [{ title: 'The Great Gatsby', qty: 1 }] });
    const b = await agent.post('/api/orders').send({ ...DELIVERY, items: [{ title: "Charlotte's Web", qty: 1 }] });
    expect(b.body.orderId).toBe(a.body.orderId + 1);
    const history = (await agent.get('/api/orders')).body;
    expect(history.map((o) => o.items[0].title)).toEqual(["Charlotte's Web", 'The Great Gatsby']);
  });

  test.each([
    [{ items: [] }, /empty/],
    [{ items: [{ title: 'Fake Book', qty: 1 }] }, /Unknown book/],
    [{ items: [{ title: 'The Great Gatsby', qty: -1 }] }, /quantity/],
    [{ postcode: 'abcd', items: [{ title: 'The Great Gatsby', qty: 1 }] }, /Postcode/],
    [{ city: '', items: [{ title: 'The Great Gatsby', qty: 1 }] }, /required/],
  ])('invalid order %j -> 400', async (override, message) => {
    const agent = await registeredAgent(app);
    const res = await agent.post('/api/orders').send({ ...DELIVERY, ...override }).expect(400);
    expect(res.body.error).toMatch(message);
    expect(db.get('SELECT COUNT(*) AS n FROM orders').n).toBe(0); // nothing half-written
  });

  test('users only see their own orders', async () => {
    const alice = await registeredAgent(app);
    await alice.post('/api/orders').send({ ...DELIVERY, items: [{ title: 'The Great Gatsby', qty: 1 }] }).expect(201);
    const bob = await registeredAgent(app, { full_name: 'Bob', email: 'bob@example.com', password: 'secret123' });
    expect((await bob.get('/api/orders')).body).toEqual([]);
  });
});
