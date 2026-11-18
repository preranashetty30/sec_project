const RANK = { not_demonstrated: 1, beginner: 2, intermediate: 3, advanced: 4 };

// Same rule as the server: best level per skill (case-insensitive), then best percent.
export function bestLevels(graded) {
  const best = new Map();
  for (const a of graded) {
    if (a.level_awarded === 'not_demonstrated') continue;
    const k = a.skill.toLowerCase();
    const cur = best.get(k);
    if (!cur || RANK[a.level_awarded] > RANK[cur.level] || (RANK[a.level_awarded] === RANK[cur.level] && a.percent > cur.percent)) {
      best.set(k, { skill: a.skill, level: a.level_awarded, percent: a.percent });
    }
  }
  return [...best.values()].sort((a, b) => RANK[b.level] - RANK[a.level] || a.skill.localeCompare(b.skill));
}

export const LEVELS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['advanced', 'Advanced']];

export const formatClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
