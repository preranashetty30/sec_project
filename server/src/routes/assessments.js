import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { one, query, tx } from '../db.js';
import { conflict, gone, notFound, tooMany } from '../errors.js';
import { aiLimit, requireRole, validate } from '../middleware.js';
import { withQuota, addTokens } from '../lib/quota.js';
import { notify } from '../services/notify.js';
import { LEVELS, DURATION_MINUTES, generateQuestions, gradeAttempt, maxScore, publicQuestions } from '../services/assessment.js';

const r = Router();
r.use(requireRole('student'));
const idParam = z.object({ id: z.uuid() });
const GRACE = "interval '60 seconds'";

// Attempts abandoned past their deadline stop blocking new ones.
const expireStale = (userId) =>
  query(`UPDATE assessments SET status = 'expired' WHERE user_id = $1 AND status = 'in_progress' AND deadline_at < now() - ${GRACE}`, [userId]);

const LEVEL_LABEL = { not_demonstrated: 'Not yet demonstrated', beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };

function view(a) {
  const done = a.status === 'graded';
  return {
    id: a.id, skill: a.skill, self_level: a.self_level, topics: a.topics, status: a.status,
    started_at: a.started_at, deadline_at: a.deadline_at, submitted_at: a.submitted_at, graded_at: a.graded_at,
    server_now: new Date().toISOString(),
    questions: done ? a.questions : publicQuestions(a.questions),
    responses: done ? a.responses : undefined,
    results: done ? a.results : undefined,
    score: a.score, max_score: a.max_score, percent: a.percent, level_awarded: a.level_awarded,
    tab_switches: a.tab_switches, paste_events: a.paste_events, flagged: a.flagged,
  };
}

const ownAttempt = async (id, userId) => {
  const a = await one('SELECT * FROM assessments WHERE id = $1 AND user_id = $2', [id, userId]);
  if (!a) throw notFound('Assessment not found');
  return a;
};

r.get('/', async (req, res) => {
  await expireStale(req.user.id);
  const { rows } = await query(
    `SELECT id, skill, self_level, status, started_at, deadline_at, percent, level_awarded, tab_switches, paste_events, flagged
       FROM assessments WHERE user_id = $1 ORDER BY started_at DESC LIMIT 100`,
    [req.user.id],
  );
  res.json({ assessments: rows });
});

const startSchema = z.object({
  skill: z.string().trim().min(1, 'Enter a skill').max(60),
  self_level: z.enum(LEVELS),
  topics: z.string().trim().max(300).default(''),
  job_context: z.string().trim().max(2000).default(''),
});

r.post('/', aiLimit, validate({ body: startSchema }), async (req, res) => {
  const b = req.valid.body;
  const userId = req.user.id;
  await expireStale(userId);

  const active = await one(`SELECT id FROM assessments WHERE user_id = $1 AND status = 'in_progress'`, [userId]);
  if (active) throw conflict('Finish your current assessment first', { assessment_id: active.id });

  const last = await one(
    `SELECT coalesce(submitted_at, deadline_at) + interval '24 hours' AS retry_at FROM assessments
      WHERE user_id = $1 AND lower(skill) = lower($2) AND status <> 'in_progress'
      ORDER BY started_at DESC LIMIT 1`,
    [userId, b.skill],
  );
  if (last && last.retry_at > new Date()) {
    throw tooMany(`You can retake ${b.skill} after ${last.retry_at.toUTCString()}`,
      Math.ceil((last.retry_at - Date.now()) / 1000), { retry_at: last.retry_at });
  }

  const { rows: projects } = await query('SELECT title FROM projects WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5', [userId]);
  const id = randomUUID();
  const questions = await withQuota(userId, 'assessment', async () => {
    const out = await generateQuestions({ ...b, projects: projects.map((p) => p.title) }, id);
    await addTokens(userId, 'assessment', out.tokens);
    return out.questions;
  });

  try {
    const a = await one(
      `INSERT INTO assessments (id, user_id, skill, self_level, topics, job_context, questions, max_score, deadline_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(mins => $9)) RETURNING *`,
      [id, userId, b.skill, b.self_level, b.topics, b.job_context, JSON.stringify(questions), maxScore(questions), DURATION_MINUTES],
    );
    res.status(201).json({ assessment: view(a) });
  } catch (e) {
    if (e.code === '23505') throw conflict('Finish your current assessment first');
    throw e;
  }
});

r.get('/:id', validate({ params: idParam }), async (req, res) => {
  await expireStale(req.user.id);
  res.json({ assessment: view(await ownAttempt(req.valid.params.id, req.user.id)) });
});

r.post('/:id/events', validate({ params: idParam, body: z.object({ type: z.enum(['tab_switch', 'paste']) }) }), async (req, res) => {
  const tab = req.valid.body.type === 'tab_switch' ? 1 : 0;
  const row = await one(
    `UPDATE assessments
        SET tab_switches = tab_switches + $3, paste_events = paste_events + $4,
            flagged = flagged OR tab_switches + $3 >= 3 OR paste_events + $4 >= 3
      WHERE id = $1 AND user_id = $2 AND status = 'in_progress' AND deadline_at > now() - ${GRACE}
      RETURNING tab_switches, paste_events, flagged`,
    [req.valid.params.id, req.user.id, tab, 1 - tab],
  );
  if (!row) throw conflict('This assessment is no longer running');
  res.json(row);
});

async function grade(attempt, user) {
  const g = await gradeAttempt(attempt);
  await addTokens(user.id, 'assessment', g.tokens);
  const a = await one(
    `UPDATE assessments SET status = 'graded', results = $2, score = $3, percent = $4, level_awarded = $5, graded_at = now()
      WHERE id = $1 AND status = 'submitted' RETURNING *`,
    [attempt.id, JSON.stringify(g.results), g.score, g.percent, g.level],
  );
  if (!a) return ownAttempt(attempt.id, user.id); // graded concurrently
  await notify(user.id, 'graded', `Your ${a.skill} assessment is graded: ${LEVEL_LABEL[a.level_awarded]} (${a.percent}%)`, `/assessments/${a.id}`);
  return a;
}

const responsesSchema = z.object({
  responses: z.record(z.string().regex(/^q\d{1,2}$/), z.union([z.number().int().min(0).max(3), z.string().max(4000)])),
});

r.post('/:id/submit', aiLimit, validate({ params: idParam, body: responsesSchema }), async (req, res) => {
  const outcome = await tx(async (c) => {
    const { rows: [a] } = await c.query('SELECT * FROM assessments WHERE id = $1 AND user_id = $2 FOR UPDATE', [req.valid.params.id, req.user.id]);
    if (!a) return { error: notFound('Assessment not found') };
    if (a.status !== 'in_progress') return { error: conflict('This assessment was already submitted') };
    const { rows: [late] } = await c.query(`SELECT now() > $1::timestamptz + ${GRACE} AS late`, [a.deadline_at]);
    if (late.late) {
      await c.query(`UPDATE assessments SET status = 'expired' WHERE id = $1`, [a.id]);
      return { error: gone('Time is up. This attempt has expired.') };
    }
    const { rows: [saved] } = await c.query(
      `UPDATE assessments SET responses = $2, status = 'submitted', submitted_at = now() WHERE id = $1 RETURNING *`,
      [a.id, JSON.stringify(req.valid.body.responses)],
    );
    return { attempt: saved };
  });
  if (outcome.error) throw outcome.error;
  // If grading fails the attempt stays 'submitted' and the client offers "Retry grading".
  res.json({ assessment: view(await grade(outcome.attempt, req.user)) });
});

r.post('/:id/grade', aiLimit, validate({ params: idParam }), async (req, res) => {
  const a = await ownAttempt(req.valid.params.id, req.user.id);
  if (a.status !== 'submitted') throw conflict('Only submitted attempts can be graded');
  res.json({ assessment: view(await grade(a, req.user)) });
});

export default r;
