'use strict';
/** Entry point: load config, migrate the database, start HTTP server. */
const { loadConfig } = require('./config');
const { createDatabase } = require('./database');
const { createApp } = require('./app');

async function main() {
  const config = loadConfig();
  const db = await createDatabase(config.dbPath);
  const migration = db.migrate();
  console.log(JSON.stringify({ level: 'info', msg: 'database migrated', ...migration }));

  const app = createApp({ db, config });
  const server = app.listen(config.port, () => {
    console.log(JSON.stringify({
      level: 'info', msg: 'server started', port: config.port, env: config.env, version: config.version,
    }));
  });

  // Graceful shutdown so `docker stop` / redeploys don't cut requests mid-write
  const shutdown = (signal) => {
    console.log(JSON.stringify({ level: 'info', msg: `received ${signal}, shutting down` }));
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
