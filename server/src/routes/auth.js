import { Router } from 'express';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { isProd } from '../config.js';
import { one, query, tx } from '../db.js';
import { AppError, badRequest, conflict, forbidden } from '../errors.js';
import { authLimit, requireAuth, validate, SESSION_COOKIE } from '../middleware.js';
import { hashPassword, verifyPassword, DUMMY_HASH, newToken, sha256 } from '../lib/passwords.js';
import { sendEmailSafe, link } from '../lib/email.js';
import { notifyAdmins } from '../services/notify.js';

const r = Router();

export const email = z.string().trim().toLowerCase().max(254).pipe(z.email('Enter a valid email address'));
export const password = z.string().min(10, 'Use at least 10 characters').max(128);
const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/', maxAge: 7 * 24 * 3600 * 1000 };

export const userView = (u) => ({
  id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
  organization: u.organization,
});

async function startSession(res, userId, userAgent) {
  const token = newToken();
  await query('DELETE FROM sessions WHERE user_id = $1 AND expires_at < now()', [userId]);
  await query(
    `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent) VALUES ($1, $2, now() + interval '7 days', $3)`,
    [sha256(token), userId, (userAgent ?? '').slice(0, 200)],
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions);
}

async function issueEmailToken(userId, purpose, hours) {
  const token = newToken();
  await query(
    `INSERT INTO email_tokens (token_hash, user_id, purpose, expires_at) VALUES ($1, $2, $3, now() + make_interval(hours => $4))`,
    [sha256(token), userId, purpose, hours],
  );
  return token;
}

async function consumeToken(token, purpose) {
  const row = await one(
    `UPDATE email_tokens SET used_at = now()
      WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > now()
      RETURNING user_id`,
    [sha256(token), purpose],
  );
  if (!row) throw badRequest('This link is invalid, already used or expired. Request a new one.');
  return row.user_id;
}

const slugify = (name) =>
  `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'student'}-${randomBytes(4).toString('hex')}`;

const registerSchema = z.object({
  email,
  password,
  name: z.string().trim().min(1, 'Enter your name').max(100),
  role: z.enum(['student', 'faculty', 'recruiter']),
  organization: z.string().trim().max(120).default(''),
}).refine((d) => d.role === 'student' || d.organization, {
  message: 'Organisation is required for faculty and recruiters', path: ['organization'],
});

r.post('/register', authLimit, validate({ body: registerSchema }), async (req, res) => {
  const { email, password, name, role, organization } = req.valid.body;
  const hash = await hashPassword(password);
  const user = await tx(async (c) => {
    const { rows: [u] } = await c.query(
      `INSERT INTO users (email, password_hash, name, role, status, organization)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING RETURNING *`,
      [email, hash, name, role, role === 'student' ? 'active' : 'pending', organization || null],
    );
    if (!u) throw conflict('Email is already registered. Try logging in instead.');
    if (role === 'student') await c.query('INSERT INTO profiles (user_id, public_slug) VALUES ($1, $2)', [u.id, slugify(name)]);
    return u;
  });
  if (user.status === 'pending') {
    await notifyAdmins('approval', `${name} (${role}, ${organization}) is waiting for approval`, '/admin');
  }
  await startSession(res, user.id, req.get('user-agent'));
  res.status(201).json({ user: userView(user) });
});

const loginSchema = z.object({ email, password: z.string().min(1).max(128) });

r.post('/login', authLimit, validate({ body: loginSchema }), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await one('SELECT * FROM users WHERE lower(email) = $1', [email]);
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect');
  if (user.status === 'suspended') throw forbidden('This account is suspended. Contact the administrator.');
  await startSession(res, user.id, req.get('user-agent'));
  res.json({ user: userView(user) });
});

r.post('/logout', requireAuth, async (req, res) => {
  await query('DELETE FROM sessions WHERE token_hash = $1', [req.sessionHash]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

r.get('/me', requireAuth, (req, res) => res.json({ user: userView(req.user) }));

const tokenBody = z.object({ token: z.string().min(20).max(200) });

r.post('/forgot-password', authLimit, validate({ body: z.object({ email }) }), async (req, res) => {
  const user = await one(`SELECT id, name, email FROM users WHERE lower(email) = $1 AND status <> 'suspended'`, [req.valid.body.email]);
  if (user) {
    const token = await issueEmailToken(user.id, 'reset', 1);
    sendEmailSafe(user.email, 'Reset your SkillProof password',
      `Hi ${user.name},\n\nReset your password here:\n${link(`/reset-password?token=${token}`)}\n\nThis link expires in 1 hour. If you didn't ask for this, ignore this email.`);
  }
  res.json({ ok: true }); // same answer either way: no account enumeration
});

r.post('/reset-password', authLimit, validate({ body: tokenBody.extend({ password }) }), async (req, res) => {
  const userId = await consumeToken(req.valid.body.token, 'reset');
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, await hashPassword(req.valid.body.password)]);
  await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  res.json({ ok: true });
});

r.post('/change-password', authLimit, requireAuth,
  validate({ body: z.object({ current_password: z.string().min(1).max(128), new_password: password }) }),
  async (req, res) => {
    const { password_hash } = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(req.valid.body.current_password, password_hash))) {
      throw badRequest('Current password is incorrect', { current_password: 'Current password is incorrect' });
    }
    await query('UPDATE users SET password_hash = $2 WHERE id = $1', [req.user.id, await hashPassword(req.valid.body.new_password)]);
    await query('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, req.sessionHash]);
    res.json({ ok: true });
  });

export default r;
