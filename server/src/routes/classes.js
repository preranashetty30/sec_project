import { Router } from 'express';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { one, query } from '../db.js';
import { forbidden, notFound } from '../errors.js';
import { requireAuth, requireRole, validate } from '../middleware.js';
import { notify } from '../services/notify.js';
import { buildReport, RANK_SQL } from '../services/report.js';

const r = Router();
const faculty = requireRole('faculty');
const student = requireRole('student');
const idParam = z.object({ id: z.uuid() });
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L confusion
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const ownClass = async (id, facultyId) => {
  const c = await one('SELECT * FROM classes WHERE id = $1 AND faculty_id = $2', [id, facultyId]);
  if (!c) throw notFound('Class not found');
  return c;
};

r.get('/', requireAuth, async (req, res) => {
  if (req.user.role === 'faculty') {
    const { rows } = await query(
      `SELECT c.id, c.name, c.join_code, c.created_at, count(m.student_id)::int AS member_count
         FROM classes c LEFT JOIN class_members m ON m.class_id = c.id
        WHERE c.faculty_id = $1 GROUP BY c.id ORDER BY c.created_at DESC`,
      [req.user.id],
    );
    return res.json({ classes: rows });
  }
  if (req.user.role !== 'student') throw forbidden();
  const { rows } = await query(
    `SELECT c.id, c.name, u.name AS faculty_name, u.organization, m.joined_at
       FROM class_members m JOIN classes c ON c.id = m.class_id JOIN users u ON u.id = c.faculty_id
      WHERE m.student_id = $1 ORDER BY m.joined_at DESC`,
    [req.user.id],
  );
  res.json({ classes: rows });
});

r.post('/', faculty, validate({ body: z.object({ name: z.string().trim().min(1, 'Enter a class name').max(100) }) }), async (req, res) => {
  for (let i = 0; i < 3; i++) {
    try {
      const c = await one('INSERT INTO classes (faculty_id, name, join_code) VALUES ($1, $2, $3) RETURNING *', [req.user.id, req.valid.body.name, newCode()]);
      return res.status(201).json({ class: { ...c, member_count: 0 } });
    } catch (e) {
      if (e.code !== '23505') throw e; // join code collision: try another
    }
  }
  throw new Error('Could not generate a unique join code');
});

r.post('/join', student, validate({ body: z.object({ code: z.string().trim().toUpperCase().length(8, 'Codes are 8 characters') }) }), async (req, res) => {
  const c = await one('SELECT id, name, faculty_id FROM classes WHERE join_code = $1', [req.valid.body.code]);
  if (!c) throw notFound('No class has this code. Check it with your teacher.');
  const { rowCount } = await query('INSERT INTO class_members (class_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [c.id, req.user.id]);
  if (rowCount) await notify(c.faculty_id, 'class_join', `${req.user.name} joined ${c.name}`, `/classes/${c.id}`);
  res.json({ class: { id: c.id, name: c.name } });
});

r.get('/:id', faculty, validate({ params: idParam }), async (req, res) => {
  const c = await ownClass(req.valid.params.id, req.user.id);
  const { rows: members } = await query(
    `SELECT u.id, u.name, m.joined_at,
            (SELECT count(*)::int FROM projects p WHERE p.user_id = u.id) AS project_count,
            COALESCE((SELECT json_agg(b) FROM (
               SELECT DISTINCT ON (lower(a.skill)) a.skill, a.level_awarded AS level, a.percent
                 FROM assessments a WHERE a.user_id = u.id AND a.status = 'graded'
                ORDER BY lower(a.skill), ${RANK_SQL('a.level_awarded')} DESC, a.percent DESC) b), '[]') AS skills
       FROM class_members m JOIN users u ON u.id = m.student_id
      WHERE m.class_id = $1 ORDER BY lower(u.name)`,
    [c.id],
  );
  res.json({ class: c, members });
});

r.delete('/:id', faculty, validate({ params: idParam }), async (req, res) => {
  const c = await ownClass(req.valid.params.id, req.user.id);
  await query('DELETE FROM classes WHERE id = $1', [c.id]);
  res.status(204).end();
});

const memberParams = z.object({ id: z.uuid(), studentId: z.uuid() });

r.delete('/:id/members/:studentId', faculty, validate({ params: memberParams }), async (req, res) => {
  const c = await ownClass(req.valid.params.id, req.user.id);
  await query('DELETE FROM class_members WHERE class_id = $1 AND student_id = $2', [c.id, req.valid.params.studentId]);
  res.status(204).end();
});

r.post('/:id/leave', student, validate({ params: idParam }), async (req, res) => {
  await query('DELETE FROM class_members WHERE class_id = $1 AND student_id = $2', [req.valid.params.id, req.user.id]);
  res.status(204).end();
});

r.get('/:id/students/:studentId', faculty, validate({ params: memberParams }), async (req, res) => {
  const c = await ownClass(req.valid.params.id, req.user.id);
  const member = await one('SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2', [c.id, req.valid.params.studentId]);
  if (!member) throw notFound('Student not found in this class');
  const report = await buildReport(req.valid.params.studentId);
  if (!report) throw notFound('Student not found');
  res.json({ report, class: { id: c.id, name: c.name } });
});

export default r;
