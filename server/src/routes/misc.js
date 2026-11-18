// Notifications, admin console and public reports.
import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireAuth, requireRole, validate } from '../middleware.js';
import { sendEmailSafe, link } from '../lib/email.js';
import { audit, notify } from '../services/notify.js';
import { buildReport } from '../services/report.js';

const idParam = z.object({ id: z.uuid() });

export const notifications = Router();
notifications.use(requireAuth);

notifications.get('/', async (req, res) => {
  const [{ rows }, { unread }] = await Promise.all([
    query('SELECT id, kind, message, link, read_at, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50', [req.user.id]),
    one('SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read_at IS NULL', [req.user.id]),
  ]);
  res.json({ notifications: rows, unread });
});

notifications.post('/read-all', async (req, res) => {
  await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
  res.json({ ok: true });
});

notifications.post('/:id/read', validate({ params: idParam }), async (req, res) => {
  await query('UPDATE notifications SET read_at = coalesce(read_at, now()) WHERE id = $1 AND user_id = $2', [req.valid.params.id, req.user.id]);
  res.json({ ok: true });
});

export const admin = Router();
admin.use(requireRole('admin'));

admin.get('/stats', async (req, res) => {
  const stats = await one(
    `SELECT
       (SELECT json_object_agg(role, n) FROM (SELECT role, count(*)::int AS n FROM users GROUP BY role) x) AS users_by_role,
       (SELECT count(*)::int FROM users WHERE status = 'pending') AS pending,
       (SELECT count(*)::int FROM assessments WHERE started_at > now() - interval '24 hours') AS assessments_24h,
       (SELECT count(*)::int FROM assessments WHERE status = 'graded') AS assessments_graded,
       (SELECT coalesce(sum(count), 0)::int FROM ai_usage WHERE day = (now() AT TIME ZONE 'utc')::date) AS ai_calls_today,
       (SELECT count(*)::int FROM error_events WHERE created_at > now() - interval '24 hours') AS errors_24h`,
  );
  res.json({ stats });
});

const usersQuery = z.object({
  status: z.enum(['active', 'pending', 'suspended']).optional(),
  role: z.enum(['student', 'faculty', 'recruiter', 'admin']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

admin.get('/users', validate({ query: usersQuery }), async (req, res) => {
  const { status, role, q, page } = req.valid.query;
  const { rows } = await query(
    `SELECT id, email, name, role, status, organization, email_verified_at, created_at FROM users
      WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR role = $2)
        AND ($3::text IS NULL OR email ILIKE '%' || $3 || '%' OR name ILIKE '%' || $3 || '%')
      ORDER BY created_at DESC LIMIT 51 OFFSET $4`,
    [status ?? null, role ?? null, q ? q.replace(/[\\%_]/g, '\\$&') : null, (page - 1) * 50],
  );
  res.json({ users: rows.slice(0, 50), has_more: rows.length > 50, page });
});

admin.patch('/users/:id', validate({ params: idParam, body: z.object({ status: z.enum(['active', 'suspended']) }) }), async (req, res) => {
  const { id } = req.valid.params;
  const { status } = req.valid.body;
  if (id === req.user.id) throw badRequest('You cannot change your own account status');
  const before = await one('SELECT id, email, name, role, status FROM users WHERE id = $1', [id]);
  if (!before) throw notFound('User not found');
  if (before.role === 'admin') throw badRequest('Admin accounts are managed from the server command line');
  await query('UPDATE users SET status = $2 WHERE id = $1', [id, status]);
  if (status === 'suspended') await query('DELETE FROM sessions WHERE user_id = $1', [id]);
  await audit(req.user.id, `user.${status === 'active' ? (before.status === 'pending' ? 'approve' : 'reactivate') : 'suspend'}`, 'user', id, { from: before.status, to: status });
  if (before.status === 'pending' && status === 'active') {
    await notify(id, 'approved', 'Your account has been approved. Welcome to SkillProof!', '/dashboard');
    sendEmailSafe(before.email, 'Your SkillProof account is approved', `Hi ${before.name},\n\nAn administrator approved your account. Log in here: ${link('/login')}`);
  }
  res.json({ ok: true });
});

admin.get('/audit', async (req, res) => {
  const { rows } = await query(
    `SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.created_at, u.email AS actor_email
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200`,
  );
  res.json({ entries: rows });
});

admin.get('/errors', async (req, res) => {
  const { rows } = await query('SELECT id, request_id, user_id, method, path, message, created_at FROM error_events ORDER BY created_at DESC LIMIT 100');
  res.json({ errors: rows });
});

export const publicRoutes = Router();

publicRoutes.get('/reports/:slug', validate({ params: z.object({ slug: z.string().regex(/^[a-z0-9-]{3,60}$/) }) }), async (req, res) => {
  const p = await one(
    `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
      WHERE p.public_slug = $1 AND p.is_public AND u.status = 'active'`,
    [req.valid.params.slug],
  );
  const report = p && (await buildReport(p.user_id));
  if (!report) throw notFound('This report is private or does not exist');
  res.json({ report });
});
