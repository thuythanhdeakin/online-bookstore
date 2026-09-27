'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const initSqlJs = require('sql.js');
const { createDatabase, MIGRATIONS } = require('../../src/database');

describe('database migrations', () => {
  test('fresh database is migrated to the latest version', async () => {
    const db = await createDatabase(':memory:');
    const result = db.migrate();
    expect(result.from).toBe(0);
    expect(result.to).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(db.hasColumn('users', 'points')).toBe(true);
    expect(db.migrate().applied).toEqual([]); // idempotent
  });

  test('REGRESSION: legacy SIT774 database without "points" column is upgraded', async () => {
    // Re-create the exact schema found in the real bookstore.db (has query_message, no points)
    const SQL = await initSqlJs();
    const legacy = new SQL.Database();
    legacy.run(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, phone TEXT, query_message TEXT,
      created_at TEXT DEFAULT (datetime('now')))`);
    legacy.run("INSERT INTO users (full_name, email, password) VALUES ('Old', 'old@x.com', 'hash')");
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bs-')), 'legacy.db');
    fs.writeFileSync(file, Buffer.from(legacy.export()));

    const db = await createDatabase(file);
    expect(db.hasColumn('users', 'points')).toBe(false);
    db.migrate();
    expect(db.hasColumn('users', 'points')).toBe(true);
    expect(db.get("SELECT points FROM users WHERE email = 'old@x.com'").points).toBe(0);

    // changes were persisted to disk
    const reopened = await createDatabase(file);
    expect(reopened.schemaVersion()).toBe(MIGRATIONS.length);
  });

  test('transaction rolls back everything on error', async () => {
    const db = await createDatabase(':memory:');
    db.migrate();
    expect(() => db.transaction(() => {
      db.run("INSERT INTO queries (full_name, email, query_message) VALUES ('a', 'a@b.co', 'x')");
      throw new Error('boom');
    })).toThrow('boom');
    expect(db.get('SELECT COUNT(*) AS n FROM queries').n).toBe(0);
  });

  test('ping reports health', async () => {
    const db = await createDatabase(':memory:');
    expect(db.ping()).toBe(true);
    db.close();
    expect(db.ping()).toBe(false);
  });
});
