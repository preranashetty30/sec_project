import { one, query } from '../db.js';

export const RANK_SQL = (col) => `array_position(ARRAY['not_demonstrated','beginner','intermediate','advanced']::text[], ${col})`;
const RANK = { not_demonstrated: 1, beginner: 2, intermediate: 3, advanced: 4 };

// Best graded level per skill (case-insensitive), highest level then highest percent.
export function bestLevels(assessments) {
  const best = new Map();
  for (const a of assessments) {
    if (a.level_awarded === 'not_demonstrated') continue;
    const key = a.skill.toLowerCase();
    const cur = best.get(key);
    if (!cur || RANK[a.level_awarded] > RANK[cur.level] || (RANK[a.level_awarded] === RANK[cur.level] && a.percent > cur.percent)) {
      best.set(key, { skill: a.skill, level: a.level_awarded, percent: a.percent });
    }
  }
  return [...best.values()].sort((a, b) => RANK[b.level] - RANK[a.level] || a.skill.localeCompare(b.skill));
}

export async function projectsFor(userId) {
  const { rows } = await query(
    `SELECT p.*,
            COALESCE(json_agg(json_build_object('faculty_id', u.id, 'faculty_name', u.name, 'organization', u.organization,
                                                'note', e.note, 'created_at', e.created_at))
                     FILTER (WHERE e.faculty_id IS NOT NULL), '[]') AS endorsements
       FROM projects p
       LEFT JOIN endorsements e ON e.project_id = p.id
       LEFT JOIN users u ON u.id = e.faculty_id
      WHERE p.user_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
    [userId],
  );
  return rows;
}

// Shared by public report, recruiter view and faculty view. Never includes email or answers.
export async function buildReport(userId) {
  const profile = await one(
    `SELECT u.id, u.name, p.headline, p.bio, p.education, p.interests, p.avatar_url, p.public_slug
       FROM users u JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1 AND u.status = 'active'`,
    [userId],
  );
  if (!profile) return null;
  const [skills, assessments, projects, certificates] = await Promise.all([
    query('SELECT name, self_level FROM skills WHERE user_id = $1 ORDER BY lower(name)', [userId]).then((r) => r.rows),
    query(
      `SELECT id, skill, self_level, level_awarded, percent, graded_at, tab_switches, paste_events, flagged
         FROM assessments WHERE user_id = $1 AND status = 'graded' ORDER BY graded_at DESC LIMIT 50`,
      [userId],
    ).then((r) => r.rows),
    projectsFor(userId),
    query('SELECT id, title, issuer, file_url, created_at FROM certificates WHERE user_id = $1 ORDER BY created_at DESC', [userId]).then((r) => r.rows),
  ]);
  return { profile, skills, demonstrated: bestLevels(assessments), assessments, projects, certificates };
}
