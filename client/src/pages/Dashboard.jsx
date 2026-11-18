import { Link } from 'react-router';
import { CheckCircle2, Circle, ClipboardCheck, GraduationCap, Search, Shield, Sparkles, Star } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useTitle } from '../hooks.js';
import { Empty, LevelBadge, PageHeader, Skeleton, StateView, formatDate } from '../ui.jsx';
import { bestLevels } from './util.js';

export function Dashboard() {
  const { user } = useAuth();
  useTitle('Dashboard');
  const Comp = { student: StudentDash, faculty: FacultyDash, recruiter: RecruiterDash, admin: AdminDash }[user.role];
  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(' ')[0]}`} subtitle="Here's where things stand." />
      <Comp />
    </>
  );
}

function StudentDash() {
  const state = useApi(async (signal) => {
    const [profile, skills, projects, assessments, usage] = await Promise.all([
      api('/me/profile', { signal }), api('/me/skills', { signal }), api('/projects', { signal }),
      api('/assessments', { signal }), api('/ai/usage', { signal }),
    ]);
    return { profile: profile.profile, skills: skills.skills, projects: projects.projects, assessments: assessments.assessments, usage };
  }, []);
  return (
    <StateView state={state} skeleton={<Skeleton rows={5} />}>
      {(d) => {
        const graded = d.assessments.filter((a) => a.status === 'graded');
        const steps = [
          ['Add your skills', d.skills.length > 0, '/profile'],
          ['Add a project', d.projects.length > 0, '/evidence'],
          ['Take an assessment', graded.length > 0, '/assessments'],
          ['Share your report', d.profile.is_public, '/profile'],
        ];
        const best = bestLevels(graded);
        return (
          <div className="stack-lg">
            <div className="grid grid-3">
              <div className="card stat"><span className="muted">Demonstrated skills</span><strong>{best.length}</strong></div>
              <div className="card stat"><span className="muted">Projects</span><strong>{d.projects.length}</strong></div>
              <div className="card stat">
                <span className="muted">AI assessments left today</span>
                <strong>{d.usage.assessment.limit - d.usage.assessment.used}<span className="muted small"> / {d.usage.assessment.limit}</span></strong>
              </div>
            </div>
            <div className="grid grid-2">
              <section className="card">
                <h2>Get to a shareable report</h2>
                <ul className="list">
                  {steps.map(([label, done, to]) => (
                    <li key={label} className="row-between">
                      <span className="row">{done ? <CheckCircle2 color="var(--color-success)" aria-hidden /> : <Circle color="var(--color-fg-muted)" aria-hidden />} {label}</span>
                      {!done && <Link className="btn btn-secondary btn-sm" to={to}>Start</Link>}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card">
                <h2>Your levels</h2>
                {best.length === 0 ? <p className="muted">Take an assessment to see your first level here.</p> : (
                  <ul className="list">
                    {best.map((b) => (
                      <li key={b.skill} className="stack-sm">
                        <div className="row-between"><strong>{b.skill}</strong><LevelBadge level={b.level} percent={b.percent} /></div>
                        <div className="bar" role="img" aria-label={`${b.percent}%`}><span style={{ width: `${b.percent}%` }} /></div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
            <section className="card">
              <div className="row-between"><h2>Recent assessments</h2><Link to="/assessments">All assessments</Link></div>
              {d.assessments.length === 0 ? <p className="muted">None yet.</p> : (
                <ul className="list">
                  {d.assessments.slice(0, 5).map((a) => (
                    <li key={a.id} className="row-between">
                      <Link to={a.status === 'in_progress' ? `/assessments/${a.id}/take` : `/assessments/${a.id}`}>{a.skill}</Link>
                      <span className="row">{a.level_awarded ? <LevelBadge level={a.level_awarded} percent={a.percent} /> : <span className="badge badge-muted">{a.status.replace('_', ' ')}</span>}<span className="small muted">{formatDate(a.started_at)}</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <Link to="/coach" className="card row" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Sparkles color="var(--color-primary)" aria-hidden /><span className="grow"><strong>Ask the AI coach</strong><br /><span className="muted small">A study plan from your results.</span></span>
            </Link>
          </div>
        );
      }}
    </StateView>
  );
}

function FacultyDash() {
  const state = useApi((signal) => api('/classes', { signal }).then((d) => d.classes), []);
  return (
    <StateView state={state} empty={{ icon: GraduationCap, title: 'No classes yet', text: 'Create a class and share its join code with students.', action: <Link className="btn btn-primary" to="/classes">Create a class</Link> }}>
      {(classes) => (
        <div className="grid grid-3">
          {classes.map((c) => (
            <Link key={c.id} to={`/classes/${c.id}`} className="card stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
              <h3>{c.name}</h3><span className="muted">{c.member_count} students · code <span className="mono">{c.join_code}</span></span>
            </Link>
          ))}
        </div>
      )}
    </StateView>
  );
}

function RecruiterDash() {
  const state = useApi((signal) => api('/shortlist', { signal }).then((d) => d.students), []);
  return (
    <div className="stack">
      <Link className="btn btn-primary" to="/talent" style={{ alignSelf: 'flex-start' }}><Search size={18} aria-hidden /> Search students by demonstrated skill</Link>
      <StateView state={state} empty={{ icon: Star, title: 'Your shortlist is empty', text: 'Shortlisted students appear here.' }}>
        {(students) => (
          <section className="card"><h2>Shortlist</h2>
            <ul className="list">{students.map((s) => <li key={s.id}><Link to={`/talent/${s.id}`}>{s.name}</Link> <span className="muted small">{s.headline}</span></li>)}</ul>
          </section>
        )}
      </StateView>
    </div>
  );
}

function AdminDash() {
  const state = useApi((signal) => api('/admin/stats', { signal }).then((d) => d.stats), []);
  return (
    <StateView state={state}>
      {(s) => (
        <div className="stack">
          <div className="grid grid-3">
            {Object.entries(s.users_by_role ?? {}).map(([role, n]) => <div key={role} className="card stat"><span className="muted">{role}s</span><strong>{n}</strong></div>)}
            <div className="card stat"><span className="muted">Pending approvals</span><strong>{s.pending}</strong></div>
            <div className="card stat"><span className="muted">Assessments (24 h)</span><strong>{s.assessments_24h}</strong></div>
            <div className="card stat"><span className="muted">AI calls today</span><strong>{s.ai_calls_today}</strong></div>
            <div className="card stat"><span className="muted">Errors (24 h)</span><strong>{s.errors_24h}</strong></div>
          </div>
          {s.pending > 0 ? <Link className="btn btn-primary" style={{ alignSelf: 'flex-start' }} to="/admin"><Shield size={18} aria-hidden /> Review pending accounts</Link>
            : <Empty icon={ClipboardCheck} title="Nothing waiting" text="No accounts need approval." />}
        </div>
      )}
    </StateView>
  );
}
