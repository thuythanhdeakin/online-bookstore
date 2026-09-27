'use strict';
/** Prometheus metrics (scraped from GET /metrics). */
const client = require('prom-client');

function createMetrics({ version, env }) {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry }); // CPU, memory, event-loop lag, GC

  const httpRequests = new client.Counter({
    name: 'http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });
  const httpDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request latency in seconds',
    labelNames: ['method', 'route'],
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });
  const ordersPlaced = new client.Counter({
    name: 'bookstore_orders_total',
    help: 'Orders placed',
    registers: [registry],
  });
  const revenue = new client.Counter({
    name: 'bookstore_revenue_dollars_total',
    help: 'Revenue in AUD from placed orders',
    registers: [registry],
  });
  const usersRegistered = new client.Counter({
    name: 'bookstore_users_registered_total',
    help: 'User registrations',
    registers: [registry],
  });
  const loginFailures = new client.Counter({
    name: 'bookstore_login_failures_total',
    help: 'Failed login attempts',
    registers: [registry],
  });
  const appInfo = new client.Gauge({
    name: 'bookstore_app_info',
    help: 'Build information',
    labelNames: ['version', 'env'],
    registers: [registry],
  });
  appInfo.labels(version, env).set(1);

  /** Express middleware recording count + latency per ROUTE TEMPLATE (low cardinality). */
  function middleware(req, res, next) {
    if (req.path === '/metrics') return next();
    const end = httpDuration.startTimer();
    res.on('finish', () => {
      let route = 'static';
      if (req.route && req.route.path) route = (req.baseUrl || '') + req.route.path;
      else if (res.statusCode === 404) route = 'not_found';
      const labels = { method: req.method, route };
      end(labels);
      httpRequests.inc({ ...labels, status: String(res.statusCode) });
    });
    return next();
  }

  return { registry, middleware, ordersPlaced, revenue, usersRegistered, loginFailures };
}

module.exports = { createMetrics };
