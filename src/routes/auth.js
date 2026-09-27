'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const { normaliseEmail, validateRegistration } = require('../services/validation');

// Compared against when the e-mail does not exist, so a failed login takes the
// same time whether or not the account exists (prevents timing-based enumeration).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const LOGIN_FAILED = 'Invalid email or password.';

/** New session id on login -> prevents session fixation. */
function startSession(req, user, done) {
  req.session.regenerate((err) => {
    if (err) return done(err);
    req.session.userId = user.id;
    req.session.userName = user.full_name;
    req.session.email = user.email;
    return done();
  });
}

function createAuthLimiter(limit) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: true, // only failed attempts count towards the limit
    message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  });
}

module.exports = function authRoutes({ db, metrics, config }) {
  const router = express.Router();
  const authLimiter = createAuthLimiter(config.authRateLimit);

  router.post('/register', authLimiter, (req, res, next) => {
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
    return startSession(req, user, (err) => (err ? next(err) : res.status(201).json({ success: true, user })));
  });

  router.post('/login', authLimiter, (req, res, next) => {
    const { password } = req.body || {};
    const email = normaliseEmail(req.body && req.body.email);
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    const user = db.get('SELECT * FROM users WHERE email = ?', [email]);
    const passwordOk = bcrypt.compareSync(String(password), user ? user.password : DUMMY_HASH);
    if (!user || !passwordOk) {
      // Same message + status for "no such user" and "wrong password" (no account enumeration)
      metrics.loginFailures.inc();
      return res.status(401).json({ error: LOGIN_FAILED });
    }
    return startSession(req, user, (err) => (err ? next(err) : res.json({
      success: true, user: { id: user.id, full_name: user.full_name, email: user.email },
    })));
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('bookstore.sid');
      res.json({ success: true });
    });
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    const user = db.get('SELECT id, full_name, email, phone, points, created_at FROM users WHERE id = ?', [
      req.session.userId,
    ]);
    if (!user) return res.json({ loggedIn: false });
    const isAdmin = config.adminEmails.includes(user.email);
    return res.json({ loggedIn: true, user: { ...user, isAdmin } });
  });

  return router;
};
