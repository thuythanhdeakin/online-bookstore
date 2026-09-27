'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function readVersion() {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'VERSION'), 'utf8').trim();
  } catch {
    return '0.0.0';
  }
}

const SECURE_ENVS = new Set(['staging', 'production']);

/**
 * Session secret: REQUIRED in staging/production (fail fast at startup).
 * Previously hard-coded as 'bookstore-secret-key' in server.js, which lets
 * anyone who reads the repo forge session cookies.
 */
function resolveSessionSecret(env, appEnv) {
  if (env.SESSION_SECRET) {
    if (SECURE_ENVS.has(appEnv) && env.SESSION_SECRET.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters in ' + appEnv);
    }
    return env.SESSION_SECRET;
  }
  if (SECURE_ENVS.has(appEnv)) throw new Error('SESSION_SECRET is required in ' + appEnv);
  return crypto.randomBytes(32).toString('hex'); // dev/test: random per process
}

function parseList(value) {
  return (value || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean);
}

/** All configuration comes from environment variables (12-factor). */
function loadConfig(env = process.env) {
  const appEnv = env.APP_ENV || 'development';
  return {
    env: appEnv,
    version: env.APP_VERSION || readVersion(),
    port: Number(env.PORT) || 3000,
    dbPath: env.DB_PATH || path.join(__dirname, '..', 'data', 'bookstore.db'),
    sessionSecret: resolveSessionSecret(env, appEnv),
    adminEmails: parseList(env.ADMIN_EMAILS),
    authRateLimit: Number(env.AUTH_RATE_LIMIT) || 10, // attempts per IP per 15 min
    cookieSecure: env.COOKIE_SECURE === 'true',
    chaosEnabled: env.CHAOS_ENABLED === 'true',
    logLevel: env.LOG_LEVEL || 'info',
  };
}

module.exports = { loadConfig };
