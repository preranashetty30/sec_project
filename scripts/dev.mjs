// Runs the API (:4000) and the web app (:5173) together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const run = (ws, env = {}) =>
  spawn(`npm run dev -w ${ws}`, { stdio: 'inherit', shell: true, env: { ...process.env, ...env } });

const procs = [run('server', { PORT: '4000' }), run('client')];
const stop = () => procs.forEach((p) => p.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
procs.forEach((p) => p.on('exit', (code) => { if (code) { stop(); process.exitCode = code; } }));
