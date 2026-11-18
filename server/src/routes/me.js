import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { authLimit, requireAuth, requireRole, validate, SESSION_COOKIE } from '../middleware.js';
import { verifyPassword } from '../lib/passwords.js';
import { ownsUpload } from '../lib/cloudinary.js';
import { LEVELS } from '../services/assessment.js';

const r = Router();
const student = requireRole('student');
const idParam = z.object({ id: z.uuid() });

r.get('/profile', student, async (req, res) => {
  const profile = await one(
    `SELECT u.name, p.headline, p.bio, p.education, p.interests, p.avatar_url, p.public_slug, p.is_public, p.recruiter_visible
       FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
    [req.user.id],
  );
  res.json({ profile });
});

const year = z.coerce.number().int().min(1950).max(2100).nullable().optional();
const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(100),
  headline: z.string().trim().max(120).default(''),
  bio: z.string().trim().max(2000).default(''),
  education: z.array(z.object({
    school: z.string().trim().min(1, 'Enter the institution').max(120),
    degree: z.string().trim().max(120).default(''),
    field: z.string().trim().max(120).default(''),
    start_year: year,
    end_year: year,
  })).max(10).default([]),
  interests: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  avatar_url: z.string().max(500).nullable().default(null),
});

r.put('/profile', student, validate({ body: profileSchema }), async (req, res) => {
  const b = req.valid.body;
  if (b.avatar_url && !ownsUpload(b.avatar_url, req.user.id, 'avatar')) throw badRequest('Avatar must be uploaded through SkillProof');
  await query('UPDATE users SET name = $2 WHERE id = $1', [req.user.id, b.name]);
  await query(
    `UPDATE profiles SET headline = $2, bio = $3, education = $4, interests = $5, avatar_url = $6, updated_at = now() WHERE user_id = $1`,
    [req.user.id, b.headline, b.bio, JSON.stringify(b.education), b.interests, b.avatar_url],
  );
  res.json({ ok: true });
});

r.put('/privacy', student, validate({ body: z.object({ is_public: z.boolean(), recruiter_visible: z.boolean() }) }), async (req, res) => {
  const { is_public, recruiter_visible } = req.valid.body;
  await query('UPDATE profiles SET is_public = $2, recruiter_visible = $3, updated_at = now() WHERE user_id = $1', [req.user.id, is_public, recruiter_visible]);
  res.json({ ok: true });
});

// Skills
const skillSchema = z.object({ name: z.string().trim().min(1, 'Enter a skill').max(60), self_level: z.enum(LEVELS) });

r.get('/skills', student, async (req, res) => {
  const { rows } = await query('SELECT id, name, self_level, created_at FROM skills WHERE user_id = $1 ORDER BY lower(name)', [req.user.id]);
  res.json({ skills: rows });
});

r.post('/skills', student, validate({ body: skillSchema }), async (req, res) => {
  const { count } = await one('SELECT count(*)::int AS count FROM skills WHERE user_id = $1', [req.user.id]);
  if (count >= 30) throw badRequest('You can list up to 30 skills');
  const skill = await one(
    `INSERT INTO skills (user_id, name, self_level) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING id, name, self_level, created_at`,
    [req.user.id, req.valid.body.name, req.valid.body.self_level],
  );
  if (!skill) throw conflict('You already listed this skill');
  res.status(201).json({ skill });
});

r.patch('/skills/:id', student, validate({ params: idParam, body: skillSchema.pick({ self_level: true }) }), async (req, res) => {
  const skill = await one('UPDATE skills SET self_level = $3 WHERE id = $1 AND user_id = $2 RETURNING id, name, self_level',
    [req.valid.params.id, req.user.id, req.valid.body.self_level]);
  if (!skill) throw notFound('Skill not found');
  res.json({ skill });
});

r.delete('/skills/:id', student, validate({ params: idParam }), async (req, res) => {
  const { rowCount } = await query('DELETE FROM skills WHERE id = $1 AND user_id = $2', [req.valid.params.id, req.user.id]);
  if (!rowCount) throw notFound('Skill not found');
  res.status(204).end();
});

// Data rights: export everything, delete account.
r.get('/export', requireAuth, async (req, res) => {
  const id = req.user.id;
  const get = (sql) => query(sql, [id]).then((x) => x.rows);
  const data = {
    exported_at: new Date().toISOString(),
    user: (await get('SELECT id, email, name, role, status, organization, email_verified_at, created_at FROM users WHERE id = $1'))[0],
    profile: (await get('SELECT * FROM profiles WHERE user_id = $1'))[0] ?? null,
    skills: await get('SELECT * FROM skills WHERE user_id = $1'),
    projects: await get('SELECT * FROM projects WHERE user_id = $1'),
    certificates: await get('SELECT * FROM certificates WHERE user_id = $1'),
    assessments: await get('SELECT * FROM assessments WHERE user_id = $1'),
    classes_joined: await get('SELECT class_id, joined_at FROM class_members WHERE student_id = $1'),
    classes_owned: await get('SELECT * FROM classes WHERE faculty_id = $1'),
    endorsements_given: await get('SELECT * FROM endorsements WHERE faculty_id = $1'),
    shortlist: await get('SELECT * FROM shortlists WHERE recruiter_id = $1'),
    notifications: await get('SELECT * FROM notifications WHERE user_id = $1'),
    ai_usage: await get('SELECT * FROM ai_usage WHERE user_id = $1'),
  };
  res.set('Content-Disposition', 'attachment; filename="skillproof-export.json"').json(data);
});

r.delete('/', authLimit, requireAuth, validate({ body: z.object({ password: z.string().min(1).max(128) }) }), async (req, res) => {
  if (req.user.role === 'admin') throw forbidden('Admin accounts cannot be deleted from the app');
  const { password_hash } = await one('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await verifyPassword(req.valid.body.password, password_hash))) throw badRequest('Password is incorrect', { password: 'Password is incorrect' });
  // seniordev: uploaded Cloudinary files are left in place; add Admin API deletion if storage matters.
  await query('DELETE FROM users WHERE id = $1', [req.user.id]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
});

export default r;
