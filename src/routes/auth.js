'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { normaliseEmail, validateRegistration } = require('../services/validation');

module.exports = function authRoutes({ db, metrics }) {
  const router = express.Router();

  router.post('/register', (req, res) => {
    const error = validateRegistration(req.body || {});
    if (error) return res.status(400).json({ error });

    const { full_name: fullName, password, phone } = req.body;
    const email = normaliseEmail(req.body.email);
    if (db.get('SELECT id FROM users WHERE email = ?', [email])) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }
    const hashed = bcrypt.hashSync(password, 10);
    db.run('INSERT INTO users (full_name, email, password, phone) VALUES (?, ?, ?, ?)', [
      fullName.trim(),
      email,
      hashed,
      phone ? phone.trim() : null,
    ]);
    const user = db.get('SELECT id, full_name, email FROM users WHERE email = ?', [email]);
    metrics.usersRegistered.inc();
    req.session.userId = user.id;
    req.session.userName = user.full_name;
    return res.status(201).json({ success: true, user });
  });

  router.post('/login', (req, res) => {
    const { password } = req.body || {};
    const email = normaliseEmail(req.body && req.body.email);
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      metrics.loginFailures.inc();
      return res.status(400).json({ error: 'No account found with this email.' });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      metrics.loginFailures.inc();
      return res.status(400).json({ error: 'Incorrect password.' });
    }
    req.session.userId = user.id;
    req.session.userName = user.full_name;
    return res.json({ success: true, user: { id: user.id, full_name: user.full_name, email: user.email } });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ success: true }));
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    const user = db.get('SELECT id, full_name, email, phone, points, created_at FROM users WHERE id = ?', [
      req.session.userId,
    ]);
    if (!user) return res.json({ loggedIn: false });
    return res.json({ loggedIn: true, user });
  });

  return router;
};
