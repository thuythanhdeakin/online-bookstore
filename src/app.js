'use strict';
/**
 * Express application factory. Separated from server.js (which only calls
 * listen) so tests can create an app with an in-memory DB and drive it
 * with Supertest - no real port, no shared state between tests.
 */
const path = require('path');
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const { createMetrics } = require('./metrics');
const authRoutes = require('./routes/auth');
const orderRoutes = require('./routes/orders');
const queryRoutes = require('./routes/queries');
const adminRoutes = require('./routes/admin');
const opsRoutes = require('./routes/ops');
const { listBooks } = require('./services/catalog');

/**
 * Content-Security-Policy: only our own origin + the CDNs the pages really use.
 * 'unsafe-inline' is still needed because the SIT774 pages use inline <script>
 * and onclick="" handlers - documented as residual risk in SECURITY.md.
 */
const CSP = {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
  scriptSrcAttr: ["'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com'],
  imgSrc: ["'self'", 'data:', 'https://covers.openlibrary.org', 'https://upload.wikimedia.org'],
  frameSrc: ['https://www.google.com'],
  connectSrc: ["'self'"],
  objectSrc: ["'none'"],
  upgradeInsecureRequests: null, // local demo runs over plain HTTP
};

function createApp({ db, config }) {
  const app = express();
  const metrics = createMetrics({ version: config.version, env: config.env });
  const deps = { db, metrics, config };

  app.disable('x-powered-by');
  app.use(metrics.middleware);
  app.use(helmet({ contentSecurityPolicy: { directives: CSP }, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(
    session({
      name: 'bookstore.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 1000 * 60 * 60 * 24, httpOnly: true, sameSite: 'lax', secure: config.cookieSecure },
    }),
  );

  app.use(opsRoutes(deps));
  app.get('/api/books', (req, res) => res.json(listBooks()));
  app.use('/api', authRoutes(deps));
  app.use('/api/orders', orderRoutes(deps));
  app.use('/api/queries', queryRoutes(deps));
  app.use('/api/users', adminRoutes(deps));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Central error handler - always JSON (the old version sent HTML stack traces)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body.' });
    console.error(JSON.stringify({ level: 'error', msg: err.message, path: req.path, stack: err.stack }));
    // Never leak internals (SQL errors, stack traces) to the client
    return res.status(500).json({ error: 'Internal server error' });
  });

  app.locals.metrics = metrics;
  return app;
}

module.exports = { createApp };
