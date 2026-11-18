import { config } from '../config.js';
import { one, query } from '../db.js';
import { tooMany } from '../errors.js';

export const limits = () => ({ assessment: config.AI_DAILY_ASSESSMENTS, feedback: config.AI_DAILY_FEEDBACK });
const TODAY = "(now() AT TIME ZONE 'utc')::date";

function secondsToUtcMidnight() {
  const now = new Date();
  return Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now) / 1000);
}

// Atomic: the row is only incremented while under the limit, so concurrent requests cannot overshoot.
async function reserve(userId, kind) {
  const limit = limits()[kind];
  const row = await one(
    `INSERT INTO ai_usage (user_id, day, kind, count) VALUES ($1, ${TODAY}, $2, 1)
     ON CONFLICT (user_id, day, kind) DO UPDATE SET count = ai_usage.count + 1 WHERE ai_usage.count < $3
     RETURNING count`,
    [userId, kind, limit],
  );
  if (!row) {
    const what = kind === 'assessment' ? 'assessment' : 'AI feedback';
    throw tooMany(`You've used today's ${what} limit (${limit}). It resets at midnight UTC.`, secondsToUtcMidnight());
  }
}

const refund = (userId, kind) =>
  query(`UPDATE ai_usage SET count = greatest(count - 1, 0) WHERE user_id = $1 AND day = ${TODAY} AND kind = $2`, [userId, kind]);

export const addTokens = (userId, kind, tokens) =>
  query(`UPDATE ai_usage SET tokens = tokens + $3 WHERE user_id = $1 AND day = ${TODAY} AND kind = $2`, [userId, kind, tokens]);

// Charges one unit; refunds it if fn throws (AI failure is not the student's fault).
export async function withQuota(userId, kind, fn) {
  await reserve(userId, kind);
  try {
    return await fn();
  } catch (e) {
    await refund(userId, kind).catch(() => {});
    throw e;
  }
}

export { refund };

export async function usageToday(userId) {
  const { rows } = await query(`SELECT kind, count FROM ai_usage WHERE user_id = $1 AND day = ${TODAY}`, [userId]);
  const used = Object.fromEntries(rows.map((r) => [r.kind, r.count]));
  const l = limits();
  return {
    assessment: { used: used.assessment ?? 0, limit: l.assessment },
    feedback: { used: used.feedback ?? 0, limit: l.feedback },
    resets_in_seconds: secondsToUtcMidnight(),
  };
}
