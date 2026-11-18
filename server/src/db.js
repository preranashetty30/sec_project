import pg from 'pg';
import { config, isProd } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: process.env.VERCEL ? 3 : isProd ? 10 : 5, // serverless: many small instances
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
});

export const query = (text, params) => pool.query(text, params);

export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0];
}

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
