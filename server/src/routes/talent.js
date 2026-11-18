import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { notFound } from '../errors.js';
import { requireRole, validate } from '../middleware.js';
import { notify } from '../services/notify.js';
import { buildReport, RANK_SQL } from '../services/report.js';
import { LEVELS } from '../services/assessment.js';

export const talent = Router();
export const shortlist = Router();
talent.use(requireRole('recruiter'));
shortlist.use(requireRole('recruiter'));

const PAGE = 20;
const likeEscape = (s) => s.replace(/[\\%_]/g, '\\$&');
const VISIBLE = `u.role = 'student' AND u.status = 'active' AND p.recruiter_visible`;
const SKILLS_JSON = `COALESCE((SELECT json_agg(b) FROM (
    SELECT DISTINCT ON (lower(a.skill)) a.skill, a.level_awarded AS level, a.percent
      FROM assessments a WHERE a.user_id = u.id AND a.status = 'graded' AND a.level_awarded <> 'not_demonstrated'
     ORDER BY lower(a.skill), ${RANK_SQL('a.level_awarded')} DESC, a.percent DESC) b), '[]')`;

const searchSchema = z.object({
  skill: z.string().trim().max(60).optional(),
  min_level: z.enum(LEVELS).default('beginner'),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
});

talent.get('/', validate({ query: searchSchema }), async (req, res) => {
  const { skill, min_level, q, page } = req.valid.query;
  const { rows } = await query(
    `SELECT u.id, u.name, p.headline, p.avatar_url, ${SKILLS_JSON} AS skills,
            EXISTS (SELECT 1 FROM shortlists s WHERE s.recruiter_id = $1 AND s.student_id = u.id) AS shortlisted
       FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE ${VISIBLE}
        AND ($2::text IS NULL OR EXISTS (
              SELECT 1 FROM assessments a WHERE a.user_id = u.id AND a.status = 'graded'
                 AND lower(a.skill) LIKE lower($2) || '%'
                 AND ${RANK_SQL('a.level_awarded')} >= ${RANK_SQL('$3::text')}))
        AND ($4::text IS NULL OR u.name ILIKE '%' || $4 || '%' OR p.headline ILIKE '%' || $4 || '%')
      ORDER BY lower(u.name), u.id
      LIMIT ${PAGE + 1} OFFSET $5`,
    [req.user.id, skill ? likeEscape(skill) : null, min_level, q ? likeEscape(q) : null, (page - 1) * PAGE],
  );
  res.json({ students: rows.slice(0, PAGE), has_more: rows.length > PAGE, page });
});

const visibleStudent = async (id) => {
  const s = await one(`SELECT u.id, u.name FROM users u JOIN profiles p ON p.user_id = u.id WHERE u.id = $1 AND ${VISIBLE}`, [id]);
  if (!s) throw notFound('Student not found or not visible to recruiters');
  return s;
};
const studentParam = z.object({ id: z.uuid() });

talent.get('/:id', validate({ params: studentParam }), async (req, res) => {
  await visibleStudent(req.valid.params.id);
  const [report, s] = await Promise.all([
    buildReport(req.valid.params.id),
    one('SELECT note FROM shortlists WHERE recruiter_id = $1 AND student_id = $2', [req.user.id, req.valid.params.id]),
  ]);
  res.json({ report, shortlisted: Boolean(s), note: s?.note ?? '' });
});

shortlist.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.name, p.headline, p.avatar_url, s.note, s.created_at, ${SKILLS_JSON} AS skills
       FROM shortlists s JOIN users u ON u.id = s.student_id JOIN profiles p ON p.user_id = u.id
      WHERE s.recruiter_id = $1 AND ${VISIBLE}
      ORDER BY s.created_at DESC`,
    [req.user.id],
  );
  res.json({ students: rows });
});

shortlist.put('/:id', validate({ params: studentParam, body: z.object({ note: z.string().trim().max(300).default('') }) }), async (req, res) => {
  const s = await visibleStudent(req.valid.params.id);
  const { inserted } = await one(
    `INSERT INTO shortlists (recruiter_id, student_id, note) VALUES ($1, $2, $3)
     ON CONFLICT (recruiter_id, student_id) DO UPDATE SET note = EXCLUDED.note
     RETURNING (xmax = 0) AS inserted`,
    [req.user.id, s.id, req.valid.body.note],
  );
  if (inserted) await notify(s.id, 'shortlist', `A recruiter from ${req.user.organization ?? 'a company'} shortlisted you`, '/dashboard');
  res.json({ ok: true });
});

shortlist.delete('/:id', validate({ params: studentParam }), async (req, res) => {
  await query('DELETE FROM shortlists WHERE recruiter_id = $1 AND student_id = $2', [req.user.id, req.valid.params.id]);
  res.status(204).end();
});
