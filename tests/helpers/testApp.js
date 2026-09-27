'use strict';
const request = require('supertest');
const { createDatabase } = require('../../src/database');
const { createApp } = require('../../src/app');
const { loadConfig } = require('../../src/config');

/** Fresh app + in-memory database for every test file / test. */
async function createTestApp(overrides = {}) {
  const db = await createDatabase(':memory:');
  db.migrate();
  const config = {
    ...loadConfig({ APP_ENV: 'test', SESSION_SECRET: 'test-secret', CHAOS_ENABLED: 'true' }),
    ...overrides,
  };
  const app = createApp({ db, config });
  return { app, db, config };
}

const VALID_USER = { full_name: 'Thanh', email: 'thanh@example.com', password: 'secret123', phone: '0412 345 678' };

/** Returns a supertest agent that keeps the session cookie (logged in). */
async function registeredAgent(app, user = VALID_USER) {
  const agent = request.agent(app);
  await agent.post('/api/register').send(user).expect(201);
  return agent;
}

const DELIVERY = {
  full_name: 'Thanh',
  email: 'thanh@example.com',
  address: '123 Example St',
  city: 'Melbourne',
  postcode: '3000',
  payment_method: 'Credit Card',
};

module.exports = { createTestApp, registeredAgent, VALID_USER, DELIVERY };
