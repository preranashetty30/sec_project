import { config } from './config.js';
import { pool } from './db.js';
import { log, errInfo } from './log.js';
import { createApp } from './app.js';

process.on('unhandledRejection', (e) => { log.fatal('unhandled rejection', { err: errInfo(e) }); process.exit(1); });
process.on('uncaughtException', (e) => { log.fatal('uncaught exception', { err: errInfo(e) }); process.exit(1); });

try {
  await pool.query('SELECT 1');
} catch (e) {
  log.fatal('cannot connect to database (is `npm run db:start` running?)', { err: errInfo(e) });
  process.exit(1);
}

const server = createApp().listen(config.PORT, () =>
  log.info('api listening', { port: config.PORT, env: config.NODE_ENV, groq: Boolean(config.GROQ_API_KEY) }),
);

function shutdown(signal) {
  log.info('shutting down', { signal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
