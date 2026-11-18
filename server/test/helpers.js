// Test harness: real temporary Postgres + fake Groq server + the real app on a random port.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import http from 'node:http';
import EmbeddedPostgres from 'embedded-postgres';

const mcq = (n) => ({ type: 'mcq', prompt: `Question ${n}?`, options: ['a', 'b', 'c', 'd'], answer_index: 1, explanation: 'b is right' });

function startFakeGroq() {
  const state = { fail: false, calls: 0 };
  const server = http.createServer(async (req, res) => {
    let raw = '';
    for await (const c of req) raw += c;
    const body = JSON.parse(raw);
    state.calls++;
    if (state.fail) { res.writeHead(500); return res.end('boom'); }
    if (body.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      for (const t of ['Focus ', 'on ', 'testing.']) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      return res.end('data: [DONE]\n\n');
    }
    const system = body.messages[0].content;
    let content;
    if (system.includes('exam writer')) {
      content = {
        questions: [1, 2, 3, 4, 5, 6].map(mcq).concat(
          [7, 8, 9].map((n) => ({ type: 'short', prompt: `Explain ${n}`, rubric: 'key points' })),
          [{ type: 'code', prompt: 'Fix it', language: 'python', code: 'print(1/0)', rubric: 'handles error' }],
        ),
      };
    } else if (system.includes('grader')) {
      const payload = JSON.parse(body.messages[1].content);
      // Over-scores on purpose: the server must clamp to each item's points.
      content = { items: payload.items.map((i) => ({ id: i.id, score: 99, feedback: 'Good' })), strengths: ['Clear'], improvements: ['Depth'], summary: 'Solid' };
    } else {
      content = { summary: 'Demonstrates REST APIs.' };
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { total_tokens: 42 } }));
  });
  server.listen(0, '127.0.0.1');
  return { server, state, ready: once(server, 'listening') };
}

export async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'skillproof-test-'));
  const port = 5434;
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'test', password: 'test', port, persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('test');

  const groq = startFakeGroq();
  await groq.ready;
  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'fatal',
    DATABASE_URL: `postgresql://test:test@localhost:${port}/test`,
    GROQ_API_KEY: 'test-key',
    GROQ_BASE_URL: `http://127.0.0.1:${groq.server.address().port}`,
    APP_ORIGIN: 'http://localhost:5173',
  });

  const { migrate } = await import('../scripts/migrate.js');
  await migrate();
  const { createApp } = await import('../src/app.js');
  const db = await import('../src/db.js');
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');

  return {
    base: `http://127.0.0.1:${server.address().port}`,
    groq: groq.state,
    db,
    async teardown() {
      server.close();
      await db.pool.end();
      groq.server.close();
      await pg.stop();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// Minimal HTTP client with a cookie jar, like a browser tab.
export function client(base) {
  let cookie = '';
  return async (method, path, body, { headers = {} } = {}) => {
    const res = await fetch(`${base}/api/v1${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'x-skillproof': '1', ...(cookie && { cookie }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      if (kv.startsWith('sp_session=')) cookie = kv === 'sp_session=' ? '' : kv;
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  };
}
