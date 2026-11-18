// Applies migrations/*.sql in order, once each. Safe to run repeatedly and from parallel
// serverless instances: everything runs in one transaction behind an advisory lock
// (transaction-scoped, so it also works through Neon's pooled connection).
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const LOCK_ID = 727274;

export async function migrate() {
  const { pool } = await import('../src/db.js');
  const dir = new URL('../migrations/', import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_ID]);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const done = new Set(rows.map((r) => r.name));
    const applied = [];
    for (const file of files.filter((f) => !done.has(f))) {
      try {
        await client.query(await readFile(new URL(file, dir), 'utf8'));
      } catch (e) {
        throw new Error(`Migration ${file} failed: ${e.message}`);
      }
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      applied.push(file);
    }
    await client.query('COMMIT');
    return applied;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { pool } = await import('../src/db.js');
  try {
    const applied = await migrate();
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'Database is up to date');
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
