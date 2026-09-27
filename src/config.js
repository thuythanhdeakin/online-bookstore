'use strict';
const fs = require('fs');
const path = require('path');

function readVersion() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

/** All configuration comes from environment variables (12-factor). */
function loadConfig(env = process.env) {
  return {
    env: env.APP_ENV || 'development',
    version: env.APP_VERSION || readVersion(),
    port: Number(env.PORT) || 3000,
    dbPath: env.DB_PATH || path.join(__dirname, '..', 'data', 'bookstore.db'),
    sessionSecret: env.SESSION_SECRET || 'bookstore-secret-key',
    cookieSecure: env.COOKIE_SECURE === 'true',
    chaosEnabled: env.CHAOS_ENABLED === 'true',
    logLevel: env.LOG_LEVEL || 'info',
  };
}

module.exports = { loadConfig };
