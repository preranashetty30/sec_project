// Structured JSON logs: one object per line.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, fatal: 50 };
const min = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function write(level, msg, meta) {
  if (LEVELS[level] < min) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta });
  (LEVELS[level] >= LEVELS.error ? process.stderr : process.stdout).write(line + '\n');
}

export const log = Object.fromEntries(Object.keys(LEVELS).map((l) => [l, (msg, meta = {}) => write(l, msg, meta)]));
export const errInfo = (e) => ({ name: e?.name, message: e?.message, code: e?.code, stack: e?.stack });
