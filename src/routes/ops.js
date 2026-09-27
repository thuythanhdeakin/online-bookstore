'use strict';
/** Operational endpoints: liveness, readiness, metrics, chaos (incident simulation). */
const express = require('express');

module.exports = function opsRoutes({ db, metrics, config }) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', version: config.version, env: config.env });
  });

  router.get('/ready', (req, res) => {
    const dbOk = db.ping();
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ready' : 'not_ready',
      database: dbOk,
      schemaVersion: dbOk ? db.schemaVersion() : null,
    });
  });

  router.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.registry.contentType);
    res.send(await metrics.registry.metrics());
  });

  // Only mounted when CHAOS_ENABLED=true - used to prove alerting works.
  if (config.chaosEnabled) {
    router.get('/chaos/error', (req, res) => {
      res.status(500).json({ error: 'Simulated failure' });
    });
    router.get('/chaos/slow', async (req, res) => {
      const requested = Number(req.query.seconds ?? 2);
      const seconds = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), 10) : 2;
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      res.json({ slept: seconds });
    });
  }

  return router;
};
