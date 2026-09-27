'use strict';
const express = require('express');

module.exports = function adminRoutes({ db }) {
  const router = express.Router();

  // Admin view of all registered users (used by useradmin.html)
  router.get('/', (req, res) => {
    res.json(db.all('SELECT id, full_name, email, phone, points, created_at FROM users ORDER BY id DESC'));
  });

  return router;
};
