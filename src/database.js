'use strict';
/**
 * SQLite access layer (sql.js = SQLite compiled to WebAssembly).
 *
 * Changes vs. the SIT774 version:
 *  - DB location comes from DB_PATH (each environment gets its own file,
 *    tests use ':memory:').
 *  - Versioned MIGRATIONS replace "CREATE TABLE IF NOT EXISTS". The old
 *    approach never added new columns to an existing database, which is
 *    exactly why production crashed with "no such column: points".
 *  - transaction() helper so an order + its items + loyalty points are
 *    written all-or-nothing.
 */
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

/**
 * Ordered list of schema migrations. NEVER edit an applied migration -
 * always append a new one. The current version is stored in
 * SQLite's built-in `PRAGMA user_version`.
 */
const MIGRATIONS = [
  {
    version: 1,
    name: 'base schema',
    up(db) {
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        phone TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT,
        query_message TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        total REAL NOT NULL,
        status TEXT DEFAULT 'confirmed',
        full_name TEXT, email TEXT, address TEXT, city TEXT, postcode TEXT,
        payment_method TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        author TEXT,
        price REAL NOT NULL,
        qty INTEGER NOT NULL,
        img TEXT,
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )`);
    },
  },
  {
    version: 2,
    name: 'loyalty points column on users',
    up(db, helpers) {
      if (!helpers.hasColumn('users', 'points')) {
        db.run('ALTER TABLE users ADD COLUMN points INTEGER NOT NULL DEFAULT 0');
      }
    },
  },
  {
    version: 3,
    name: 'indexes for order history lookups',
    up(db) {
      db.run('CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id)');
      db.run('CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)');
    },
  },
];

async function createDatabase(dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'bookstore.db')) {
  const SQL = await initSqlJs();
  const inMemory = dbPath === ':memory:';
  let db;
  if (!inMemory && fs.existsSync(dbPath)) {
    db = new SQL.Database(fs.readFileSync(dbPath));
  } else {
    db = new SQL.Database();
  }
  let inTransaction = false;

  function save() {
    if (inMemory || inTransaction) return;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(dbPath, Buffer.from(db.export()));
  }

  function run(sql, params = []) {
    db.run(sql, params);
    save();
  }

  function get(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      return stmt.step() ? stmt.getAsObject() : null;
    } finally {
      stmt.free();
    }
  }

  function all(sql, params = []) {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      return rows;
    } finally {
      stmt.free();
    }
  }

  function lastInsertId() {
    return get('SELECT last_insert_rowid() AS id').id;
  }

  /** Run fn() atomically: everything commits, or nothing does. */
  function transaction(fn) {
    db.run('BEGIN');
    inTransaction = true;
    try {
      const result = fn();
      db.run('COMMIT');
      inTransaction = false;
      save();
      return result;
    } catch (err) {
      db.run('ROLLBACK');
      inTransaction = false;
      throw err;
    }
  }

  function hasColumn(table, column) {
    return all(`PRAGMA table_info(${table})`).some((c) => c.name === column);
  }

  function schemaVersion() {
    return get('PRAGMA user_version').user_version;
  }

  function migrate() {
    const current = schemaVersion();
    const pending = MIGRATIONS.filter((m) => m.version > current);
    for (const m of pending) {
      transaction(() => {
        m.up(db, { hasColumn });
        db.run(`PRAGMA user_version = ${Number(m.version)}`);
      });
    }
    return { from: current, to: schemaVersion(), applied: pending.map((m) => m.name) };
  }

  function ping() {
    try {
      get('SELECT 1 AS ok');
      return true;
    } catch {
      return false;
    }
  }

  function close() {
    db.close();
  }

  return { run, get, all, transaction, lastInsertId, migrate, schemaVersion, hasColumn, ping, close };
}

module.exports = { createDatabase, MIGRATIONS };
