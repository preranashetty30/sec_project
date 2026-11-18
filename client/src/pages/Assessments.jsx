import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Clock, Send, XCircle } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, usePersistentForm, useTitle } from '../hooks.js';
import { ErrorState, Field, LevelBadge, PageHeader, Skeleton, StateView, formatDateTime, useToast } from '../ui.jsx';
import { useSubmit } from './Auth.jsx';
import { Integrity } from './Report.jsx';
import { LEVELS, formatClock } from './util.js';

export function Assessments() {
  useTitle('Assessments');
  const list = useApi((signal) => api('/assessments', { signal }).then((d) => d.assessments), []);
  return (
    <>
      <PageHeader title="Assessments" subtitle="10 questions, 20 minutes, written by AI for your level. One attempt per skill every 24 hours." />
      <div className="stack-lg">
        <StartForm active={list.data?.find((a) => a.status === 'in_progress')} />
        <StateView state={list} empty={{ icon: ClipboardCheck, title: 'No attempts yet', text: 'Your graded assessments will appear here.' }}>
          {(rows) => (
            <section className="card">
              <h2>History</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Skill</th><th>Claimed</th><th>Status</th><th>Integrity</th><th>Started</th></tr></thead>
                  <tbody>
                    {rows.map((a) => (
                      <tr key={a.id}>
                        <td><Link to={a.status === 'in_progress' ? `/assessments/${a.id}/take` : `/assessments/${a.id}`}>{a.skill}</Link></td>
                        <td className="muted">{a.self_level}</td>
                        <td>{a.level_awarded ? <LevelBadge level={a.level_awarded} percent={a.percent} /> : <span className="badge badge-muted">{a.status.replace('_', ' ')}</span>}</td>
                        <td><Integrity a={a} /></td>
                        <td className="muted">{formatDateTime(a.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </StateView>
      </div>
    </>
  );
}

function StartForm({ active }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const skills = useApi((signal) => api('/me/skills', { signal }).then((d) => d.skills), []);
  const { values: f, set, clear } = usePersistentForm(`form:assessment-start:${user.id}`, { skill: '', self_level: 'beginner', topics: '', job_context: '' });
  const s = useSubmit();

  if (active) {
    return (
      <div className="banner banner-info">
        <Clock size={18} aria-hidden /><span className="grow">You have a {active.skill} assessment in progress.</span>
        <Link className="btn btn-primary btn-sm" to={`/assessments/${active.id}/take`}>Continue</Link>
      </div>
    );
  }
  if (s.busy) {
    return (
      <div className="card stack" aria-busy="true" role="status">
        <h2>Writing your questions</h2>
        <p className="muted">The AI is preparing a fresh assessment for {f.skill}. This takes up to 15 seconds. The timer starts only when the questions appear.</p>
        {[1, 2, 3].map((i) => <div key={i} className="skeleton sk-block" />)}
      </div>
    );
  }
  const pick = (sk) => { set('skill', sk.name); set('self_level', sk.self_level); };
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const { assessment } = await api('/assessments', { method: 'POST', body: f });
      clear();
      navigate(`/assessments/${assessment.id}/take`);
    });
  };
  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h2>Start a new assessment</h2>
      {s.error && !Object.keys(s.fields).length && <p className="form-error" role="alert">{s.error.message}</p>}
      {skills.data?.length > 0 && (
        <div className="row small"><span className="muted">Your skills:</span>{skills.data.map((sk) => <button type="button" key={sk.id} className="chip" style={{ border: 0, cursor: 'pointer' }} onClick={() => pick(sk)}>{sk.name}</button>)}</div>
      )}
      <div className="grid grid-2">
        <Field label="Skill" value={f.skill} error={s.fields.skill} placeholder="Python" maxLength={60} onChange={(e) => set('skill', e.target.value)} />
        <Field label="Level you claim" id="start-level">
          <select id="start-level" className="input" value={f.self_level} onChange={(e) => set('self_level', e.target.value)}>
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Focus topics (optional)" value={f.topics} maxLength={300} placeholder="pandas, list comprehensions, testing" error={s.fields.topics} onChange={(e) => set('topics', e.target.value)} />
      <Field label="Target job description (optional)" as="textarea" value={f.job_context} maxLength={2000} error={s.fields.job_context}
        hint="Paste a job post and questions will lean toward it." onChange={(e) => set('job_context', e.target.value)} />
      <p className="small muted">Stay on this tab during the test: tab switches and pastes are counted and shown on your report.</p>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Generate assessment</button>
    </form>
  );
}

export function AssessmentTake() {
  const { id } = useParams();
  useTitle('Assessment in progress');
  const state = useApi((signal) => api(`/assessments/${id}`, { signal }).then((d) => d.assessment), [id]);
  if (state.status === 'loading') return <Skeleton rows={8} />;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  const a = state.data;
  if (a.status !== 'in_progress') return <AssessmentResultView a={a} reload={state.reload} />;
  return <Exam a={a} />;
}

function Exam({ a }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { values: answers, set, clear } = usePersistentForm(`answers:${a.id}`, {});
  const [counts, setCounts] = useState({ tab_switches: a.tab_switches, paste_events: a.paste_events });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const offset = useRef(new Date(a.server_now) - Date.now()); // server clock is the source of truth
  const deadline = new Date(a.deadline_at).getTime();
  const [left, setLeft] = useState(deadline - (Date.now() + offset.current));
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const sent = useRef(false);

  const submit = useCallback(async (auto = false) => {
    if (sent.current) return;
    sent.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/assessments/${a.id}/submit`, { method: 'POST', body: { responses: answersRef.current } });
      clear();
      navigate(`/assessments/${a.id}`, { replace: true });
    } catch (e) {
      if (e.status === 409 || e.status === 410 || e.status === 502) { clear(); navigate(`/assessments/${a.id}`, { replace: true }); return; }
      sent.current = false;
      setSubmitting(false);
      setError(e);
      if (auto) toast('Auto-submit failed. Press Submit to try again.', 'error');
    }
  }, [a.id, clear, navigate, toast]);

  useEffect(() => {
    const t = setInterval(() => {
      const ms = deadline - (Date.now() + offset.current);
      setLeft(ms);
      if (ms <= 0) { clearInterval(t); submit(true); }
    }, 500);
    return () => clearInterval(t);
  }, [deadline, submit]);

  useEffect(() => {
    const report = (type) => api(`/assessments/${a.id}/events`, { method: 'POST', body: { type } })
      .then((c) => setCounts(c)).catch(() => {});
    const onVisibility = () => { if (document.visibilityState === 'hidden') report('tab_switch'); };
    const onPaste = () => report('paste');
    const onLeave = (e) => { e.preventDefault(); };
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('paste', onPaste);
    window.addEventListener('beforeunload', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('paste', onPaste);
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [a.id]);

  const answered = a.questions.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '').length;
  return (
    <div className="stack">
      <div className="exam-bar row-between">
        <div><h1 style={{ fontSize: 'var(--text-xl)' }}>{a.skill} <span className="muted small">· {a.self_level}</span></h1>
          <span className="small muted">{answered}/{a.questions.length} answered · tab switches {counts.tab_switches} · pastes {counts.paste_events}</span></div>
        <span className={`timer${left < 120_000 ? ' warn' : ''}`} role="timer" aria-label={`Time left ${formatClock(left)}`}><Clock size={18} aria-hidden /> {formatClock(left)}</span>
      </div>
      {counts.tab_switches > 0 && <div className="banner banner-warning" role="status"><AlertTriangle size={18} aria-hidden /> Leaving this tab is recorded on your report.</div>}
      {a.questions.map((q, i) => (
        <section key={q.id} className="card question" aria-labelledby={`${q.id}-h`} onContextMenu={(e) => e.preventDefault()}>
          <p className="small muted">Question {i + 1} · {q.type === 'mcq' ? 'Multiple choice' : q.type === 'short' ? 'Short answer' : 'Practical task'} · {q.points} {q.points === 1 ? 'point' : 'points'}</p>
          <h2 id={`${q.id}-h`} className="pre" style={{ fontSize: 'var(--text-lg)', fontFamily: 'var(--font-body)', marginTop: 'var(--space-2)' }}>{q.prompt}</h2>
          {q.code && <pre className="code">{q.code}</pre>}
          {q.type === 'mcq' ? (
            <div className="options" role="radiogroup" aria-labelledby={`${q.id}-h`}>
              {q.options.map((opt, j) => (
                <label key={j} className="option">
                  <input type="radio" name={q.id} checked={answers[q.id] === j} onChange={() => set(q.id, j)} />
                  <span className="pre">{opt}</span>
                </label>
              ))}
            </div>
          ) : (
            <textarea className="input" style={{ marginTop: 'var(--space-3)', minHeight: q.type === 'code' ? 180 : 120, fontFamily: q.type === 'code' ? 'var(--font-mono)' : undefined, userSelect: 'text' }}
              aria-labelledby={`${q.id}-h`} maxLength={4000} value={answers[q.id] ?? ''} onChange={(e) => set(q.id, e.target.value)}
              placeholder={q.type === 'code' ? 'Write your fix or solution and explain it' : 'Answer in 2-5 sentences'} />
          )}
        </section>
      ))}
      {error && <p className="form-error" role="alert">{error.message}</p>}
      <div className="row">
        <button className="btn btn-primary" disabled={submitting} onClick={() => confirm(`Submit now? ${answered}/${a.questions.length} answered.`) && submit()}>
          <Send size={16} aria-hidden /> {submitting ? 'Grading your answers' : 'Submit assessment'}
        </button>
        {submitting && <span className="muted small" role="status">The AI is grading. This takes a few seconds.</span>}
      </div>
    </div>
  );
}

export function AssessmentResult() {
  const { id } = useParams();
  useTitle('Assessment result');
  const state = useApi((signal) => api(`/assessments/${id}`, { signal }).then((d) => d.assessment), [id]);
  return (
    <StateView state={state} skeleton={<Skeleton rows={8} />}>
      {(a) => <AssessmentResultView a={a} reload={state.reload} />}
    </StateView>
  );
}

function AssessmentResultView({ a, reload }) {
  const toast = useToast();
  const [grading, setGrading] = useState(false);
  if (a.status === 'in_progress') return <div className="card empty"><h1>{a.skill}</h1><Link className="btn btn-primary" to={`/assessments/${a.id}/take`}>Continue assessment</Link></div>;
  if (a.status === 'expired') {
    return <div className="card empty"><XCircle size={36} aria-hidden /><h1>Time ran out</h1><p className="muted">This {a.skill} attempt expired before it was submitted. You can retake it 24 hours after the deadline.</p><Link className="btn btn-secondary" to="/assessments">Back to assessments</Link></div>;
  }
  if (a.status === 'submitted') {
    const retry = async () => {
      setGrading(true);
      try { await api(`/assessments/${a.id}/grade`, { method: 'POST' }); reload(); } catch (e) { toast(e.message, 'error'); } finally { setGrading(false); }
    };
    return (
      <div className="card empty">
        <h1>Submitted, waiting for grading</h1>
        <p className="muted">The AI couldn't grade this attempt yet. Your answers are saved.</p>
        <button className="btn btn-primary" onClick={retry} disabled={grading}>{grading ? 'Grading' : 'Retry grading'}</button>
      </div>
    );
  }
  const r = a.results;
  return (
    <div className="stack-lg">
      <PageHeader title={`${a.skill} result`} subtitle={`Claimed ${a.self_level} · graded ${formatDateTime(a.graded_at)}`}>
        <Link className="btn btn-secondary" to="/assessments">All assessments</Link>
      </PageHeader>
      <section className="card row" style={{ gap: 'var(--space-6)' }}>
        <div className="stack-sm"><span className="score-ring">{Math.round(a.percent)}%</span><span className="muted">{a.score} / {a.max_score} points</span></div>
        <div className="stack-sm grow">
          <LevelBadge level={a.level_awarded} />
          <p className="pre">{r.summary}</p>
          <Integrity a={a} />
        </div>
      </section>
      <div className="grid grid-2">
        <section className="card"><h2>Strengths</h2><ul>{r.strengths.map((x) => <li key={x}>{x}</li>)}</ul></section>
        <section className="card"><h2>What to improve</h2><ul>{r.improvements.map((x) => <li key={x}>{x}</li>)}</ul><Link to="/coach">Get a study plan from the AI coach</Link></section>
      </div>
      {a.questions.map((q, i) => {
        const item = r.items[q.id];
        const answer = a.responses?.[q.id];
        return (
          <section key={q.id} className="card stack-sm">
            <div className="row-between"><span className="small muted">Question {i + 1}</span><span className={`badge ${item.score === item.points ? 'lvl-advanced' : item.score > 0 ? 'lvl-beginner' : 'badge-danger'}`}>{item.score}/{item.points}</span></div>
            <h3 className="pre" style={{ fontFamily: 'var(--font-body)' }}>{q.prompt}</h3>
            {q.code && <pre className="code">{q.code}</pre>}
            {q.type === 'mcq' ? (
              <div className="options">
                {q.options.map((opt, j) => (
                  <div key={j} className={`option${j === q.answer_index ? ' correct' : j === answer ? ' wrong' : ''}`}>
                    {j === q.answer_index ? <CheckCircle2 size={18} aria-label="Correct answer" /> : j === answer ? <XCircle size={18} aria-label="Your answer" /> : <span style={{ width: 18 }} />}
                    <span className="pre">{opt}</span>
                  </div>
                ))}
                {q.explanation && <p className="small muted">{q.explanation}</p>}
              </div>
            ) : (
              <>
                <p className="small muted">Your answer</p>
                <p className="pre" style={{ background: 'var(--color-surface-2)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)' }}>{answer || 'No answer'}</p>
                <p className="small"><strong>Feedback:</strong> {item.feedback}</p>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
