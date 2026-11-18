// Vercel entrypoint for the "server" service (Express framework preset).
// Local development uses src/index.js instead (port listener + graceful shutdown).
import { createApp } from './src/app.js';
import { migrate } from './scripts/migrate.js';

// Create or update tables on cold start, so deploy order never matters. Idempotent and locked.
try {
  const applied = await migrate();
  if (applied.length) console.log(JSON.stringify({ level: 'info', msg: 'migrations applied', applied }));
} catch (e) {
  console.error(JSON.stringify({ level: 'error', msg: 'migrations failed', error: e.message }));
}

export default createApp();
