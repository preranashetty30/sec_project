import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, client } from './helpers.js';

let env;
const pw = 'correct-horse-battery';
const reg = (c, email, role = 'student', extra = {}) =>
  c('POST', '/auth/register', { email, password: pw, name: email.split('@')[0], role, organization: role === 'student' ? '' : 'Acme', ...extra });

let A, B, fac, rec, adm;

before(async () => {
  env = await setup();
  [A, B, fac, rec, adm] = [1, 2, 3, 4, 5].map(() => client(env.base));
  const { hashPassword } = await import('../src/lib/passwords.js');
  await env.db.query(`INSERT INTO users (email, password_hash, name, role, email_verified_at) VALUES ('admin@x.io', $1, 'Admin', 'admin', now())`, [await hashPassword(pw)]);
  assert.equal((await adm('POST', '/auth/login', { email: 'admin@x.io', password: pw })).status, 200);
});
after(() => env?.teardown());

test('health reports database ok', async () => {
  const res = await fetch(`${env.base}/health`).then((r) => r.json());
  assert.equal(res.checks.database, 'ok');
});

test('register, login, csrf and errors', async () => {
  assert.equal((await reg(A, 'a@x.io')).status, 201);
  assert.equal((await reg(B, 'b@x.io')).status, 201);
  assert.equal((await reg(client(env.base), 'A@X.io')).status, 409);
  const bad = await client(env.base)('POST', '/auth/login', { email: 'a@x.io', password: 'wrong-password' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.message, 'Email or password is incorrect');
  assert.ok(bad.body.error.requestId);
  assert.equal((await A('GET', '/auth/me')).body.user.role, 'student');
  assert.equal((await A('POST', '/me/skills', { name: 'x', self_level: 'beginner' }, { headers: { 'x-skillproof': '' } })).status, 403);
  const invalid = await A('POST', '/me/skills', { name: '', self_level: 'guru' });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.error.fields.self_level);
});

test('pending faculty and recruiter need admin approval (audited)', async () => {
  await reg(fac, 'f@x.io', 'faculty');
  await reg(rec, 'r@x.io', 'recruiter');
  const blocked = await fac('POST', '/classes', { name: 'CS101' });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error.message, /awaiting approval/);
  assert.equal((await A('GET', '/admin/users')).status, 403);
  const { users } = (await adm('GET', '/admin/users?status=pending')).body;
  assert.equal(users.length, 2);
  for (const u of users) assert.equal((await adm('PATCH', `/admin/users/${u.id}`, { status: 'active' })).status, 200);
  const { entries } = (await adm('GET', '/admin/audit')).body;
  assert.equal(entries.filter((e) => e.action === 'user.approve').length, 2);
});

test('skills are isolated per user', async () => {
  const s = (await A('POST', '/me/skills', { name: 'Python', self_level: 'intermediate' })).body.skill;
  assert.equal((await A('POST', '/me/skills', { name: 'python', self_level: 'beginner' })).status, 409);
  assert.equal((await B('DELETE', `/me/skills/${s.id}`)).status, 404);
  assert.equal((await B('GET', '/me/skills')).body.skills.length, 0);
});

let attemptId;
test('assessment: no answers leak, integrity counted, graded and clamped', async () => {
  const start = await A('POST', '/assessments', { skill: 'Python', self_level: 'intermediate', topics: 'pandas' });
  assert.equal(start.status, 201);
  const a = start.body.assessment;
  attemptId = a.id;
  assert.equal(a.questions.length, 10);
  assert.ok(a.questions.every((q) => q.answer_index === undefined && q.rubric === undefined));
  assert.equal((await A('POST', '/assessments', { skill: 'SQL', self_level: 'beginner' })).status, 409);
  assert.equal((await B('GET', `/assessments/${a.id}`)).status, 404);

  for (let i = 0; i < 3; i++) await A('POST', `/assessments/${a.id}/events`, { type: 'tab_switch' });
  const responses = Object.fromEntries(a.questions.map((q) => [q.id, q.type === 'mcq' ? 1 : 'my answer']));
  const done = await A('POST', `/assessments/${a.id}/submit`, { responses });
  assert.equal(done.status, 200);
  const g = done.body.assessment;
  assert.equal(g.status, 'graded');
  assert.equal(g.score, 15);
  assert.equal(g.percent, 100);
  assert.equal(g.level_awarded, 'intermediate');
  assert.equal(g.tab_switches, 3);
  assert.equal(g.flagged, true);
  assert.equal((await A('POST', `/assessments/${a.id}/submit`, { responses })).status, 409);
  assert.equal((await A('POST', '/assessments', { skill: 'python', self_level: 'beginner' })).status, 429);
});

test('AI failure refunds the quota', async () => {
  env.groq.fail = true;
  const res = await B('POST', '/assessments', { skill: 'Go', self_level: 'beginner' });
  env.groq.fail = false;
  assert.equal(res.status, 502);
  assert.equal((await B('GET', '/ai/usage')).body.assessment.used, 0);
});

test('coach streams tokens over SSE', async () => {
  const res = await A('GET', '/ai/coach');
  assert.equal(res.status, 200);
  assert.match(res.body, /event: token/);
  assert.match(res.body, /event: done/);
  assert.equal((await A('GET', '/ai/usage')).body.feedback.used, 1);
});

test('public report is opt-in and hides private data', async () => {
  assert.equal((await A('PUT', '/me/privacy', { is_public: true, recruiter_visible: true })).status, 200);
  const slug = (await A('GET', '/me/profile')).body.profile.public_slug;
  const pub = await client(env.base)('GET', `/public/reports/${slug}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.report.demonstrated[0].level, 'intermediate');
  const raw = JSON.stringify(pub.body);
  assert.ok(!raw.includes('a@x.io') && !raw.includes('answer_index') && !raw.includes('my answer'));
});

test('classes and endorsements respect membership', async () => {
  const cls = (await fac('POST', '/classes', { name: 'CS101' })).body.class;
  assert.equal((await A('POST', '/classes/join', { code: cls.join_code.toLowerCase() })).status, 200);
  const pa = (await A('POST', '/projects', { title: 'API', description: 'REST' })).body.project;
  const pb = (await B('POST', '/projects', { title: 'Other' })).body.project;
  assert.equal((await fac('PUT', `/projects/${pa.id}/endorsement`, { note: 'Great' })).status, 200);
  assert.equal((await fac('PUT', `/projects/${pb.id}/endorsement`, {})).status, 403);
  assert.equal((await A('GET', '/projects')).body.projects[0].endorsements[0].note, 'Great');
  const detail = (await fac('GET', `/classes/${cls.id}`)).body;
  assert.equal(detail.members[0].skills[0].level, 'intermediate');
  assert.equal((await A('POST', '/projects', { title: 'x', repo_url: 'https://gitlab.com/a/b' })).status, 400);
  assert.equal((await A('POST', `/projects/${pa.id}/analyze`)).body.project.ai_summary, 'Demonstrates REST APIs.');
});

test('recruiter search, shortlist and notification', async () => {
  const found = (await rec('GET', '/talent?skill=pyt&min_level=intermediate')).body.students;
  assert.equal(found.length, 1);
  assert.equal((await rec('GET', '/talent?skill=python&min_level=advanced')).body.students.length, 0);
  assert.equal((await rec('PUT', `/shortlist/${found[0].id}`, { note: 'call' })).status, 200);
  const n = (await A('GET', '/notifications')).body;
  assert.ok(n.notifications.some((x) => x.kind === 'shortlist'));
  assert.equal((await A('GET', '/talent')).status, 403);
});

test('export and delete account', async () => {
  const exp = await B('GET', '/me/export');
  assert.equal(exp.body.user.email, 'b@x.io');
  assert.equal((await B('DELETE', '/me', { password: 'nope' })).status, 400);
  assert.equal((await B('DELETE', '/me', { password: pw })).status, 204);
  assert.equal((await B('GET', '/auth/me')).status, 401);
});
