// Local PostgreSQL without installing anything. Data lives in server/.pgdata (git-ignored).
import { existsSync } from 'node:fs';
import EmbeddedPostgres from 'embedded-postgres';

const pg = new EmbeddedPostgres({
  databaseDir: '.pgdata',
  user: 'skillproof',
  password: 'skillproof',
  port: 5433,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

if (!existsSync('.pgdata/PG_VERSION')) await pg.initialise();
await pg.start();
await pg.createDatabase('skillproof').catch(() => {}); // already exists
console.log('PostgreSQL running: postgresql://skillproof:skillproof@localhost:5433/skillproof  (Ctrl+C to stop)');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30); // keep the process alive
