'use strict';

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please log in.' });
  }
  return next();
}

module.exports = { requireLogin };
