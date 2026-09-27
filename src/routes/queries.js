'use strict';
const express = require('express');
const { validateQuery, normaliseEmail } = require('../services/validation');
const { requireAdmin } = require('../middleware/auth');

module.exports = function queryRoutes({ db, config }) {
  const router = express.Router();

  router.post('/', (req, res) => {
    const body = req.body || {};
    const error = validateQuery(body);
    if (error) return res.status(400).json({ error });
    db.run('INSERT INTO queries (full_name, email, phone, query_message) VALUES (?, ?, ?, ?)', [
      body.full_name.trim(),
      normaliseEmail(body.email),
      body.phone ? body.phone.trim() : null,
      body.query_message.trim(),
    ]);
    return res.status(201).json({ success: true });
  });

  // Admin view of all queries (was public - contained customers' names, emails, phones)
  router.get('/', requireAdmin(config.adminEmails), (req, res) => {
    res.json(db.all('SELECT * FROM queries ORDER BY id DESC'));
  });

  return router;
};
