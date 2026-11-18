// Creates (or promotes) an admin account. Non-interactive: ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD env vars.
import { createInterface } from 'node:readline/promises';
import { pool } from '../src/db.js';
import { hashPassword } from '../src/lib/passwords.js';

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = async (envName, question) => process.env[envName] || (await rl.question(question)).trim();

try {
  const email = (await ask('ADMIN_EMAIL', 'Admin email: ')).toLowerCase();
  const name = await ask('ADMIN_NAME', 'Admin name: ');
  const password = await ask('ADMIN_PASSWORD', 'Password (min 10 chars, shown as you type): ');
  if (!/^\S+@\S+\.\S+$/.test(email) || !name || password.length < 10) throw new Error('Need a valid email, a name and a password of at least 10 characters');
  const { rows } = await pool.query(
    `INSERT INTO users (email, password_hash, name, role, status, email_verified_at)
     VALUES ($1, $2, $3, 'admin', 'active', now())
     ON CONFLICT ((lower(email))) DO UPDATE SET role = 'admin', status = 'active', password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [email, await hashPassword(password), name],
  );
  console.log(`Admin ready: ${email} (${rows[0].id})`);
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}
