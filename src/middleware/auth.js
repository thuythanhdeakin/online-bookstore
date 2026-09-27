'use strict';

function requireLogin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Please log in.' });
  }
  return next();
}

/**
 * Admin-only routes. Admins are listed in ADMIN_EMAILS (comma separated),
 * so no admin account is hard-coded in the source.
 * Fixes: /api/users and GET /api/queries were readable by ANYONE (OWASP A01 Broken Access Control).
 */
function requireAdmin(adminEmails) {
  const admins = new Set(adminEmails);
  return function adminGuard(req, res, next) {
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Please log in.' });
    }
    if (!admins.has(req.session.email)) {
      return res.status(403).json({ error: 'Admin access required.' });
    }
    return next();
  };
}

module.exports = { requireLogin, requireAdmin };
