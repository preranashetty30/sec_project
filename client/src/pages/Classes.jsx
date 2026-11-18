import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BadgeCheck, Copy, GraduationCap, LogOut, Plus, Trash2, UserMinus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, usePersistentForm, useTitle } from '../hooks.js';
import { Field, LevelBadge, PageHeader, Skeleton, StateView, Tooltip, formatDate, useToast } from '../ui.jsx';
import { useSubmit } from './Auth.jsx';
import { Report } from './Report.jsx';

export function Classes() {
  const { user } = useAuth();
  useTitle('Classes');
  const state = useApi((signal) => api('/classes', { signal }).then((d) => d.classes), []);
  const faculty = user.role === 'faculty';
  return (
    <>
      <PageHeader title={faculty ? 'My classes' : 'Classes'} subtitle={faculty ? 'Create a class and share the join code with your students.' : 'Join your teacher\'s class so they can see and endorse your work.'} />
      <div className="stack-lg">
        {faculty ? <CreateClass onCreated={(c) => state.setData((l) => [c, ...(l ?? [])])} /> : <JoinClass onJoined={state.reload} />}
        <StateView state={state} skeleton={<Skeleton variant="cards" rows={3} />}
          empty={{ icon: GraduationCap, title: faculty ? 'No classes yet' : 'Not in a class yet', text: faculty ? 'Your classes appear here.' : 'Ask your teacher for an 8-character join code.' }}>
          {(classes) => (
            <div className="grid grid-3">
              {classes.map((c) => faculty ? (
                <Link key={c.id} to={`/classes/${c.id}`} className="card stack-sm" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <h3>{c.name}</h3>
                  <span className="muted">{c.member_count} students</span>
                  <span className="mono small">Code {c.join_code}</span>
                </Link>
              ) : (
                <StudentClassCard key={c.id} c={c} onLeft={() => state.setData((l) => l.filter((x) => x.id !== c.id))} />
              ))}
            </div>
          )}
        </StateView>
      </div>
    </>
  );
}

function StudentClassCard({ c, onLeft }) {
  const toast = useToast();
  const leave = async () => {
    if (!confirm(`Leave ${c.name}?`)) return;
    try { await api(`/classes/${c.id}/leave`, { method: 'POST' }); onLeft(); } catch (e) { toast(e.message, 'error'); }
  };
  return (
    <div className="card stack-sm">
      <h3>{c.name}</h3>
      <span className="muted">{c.faculty_name}{c.organization ? `, ${c.organization}` : ''}</span>
      <span className="small muted">Joined {formatDate(c.joined_at)}</span>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={leave}><LogOut size={16} aria-hidden /> Leave</button>
    </div>
  );
}

function CreateClass({ onCreated }) {
  const { user } = useAuth();
  const { values: f, set, clear } = usePersistentForm(`form:class:new:${user.id}`, { name: '' });
  const s = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const res = await api('/classes', { method: 'POST', body: f });
      clear();
      set('name', '');
      onCreated(res.class);
    });
  };
  return (
    <form className="card row" onSubmit={submit} noValidate style={{ alignItems: 'flex-end' }}>
      <div className="grow"><Field label="New class name" value={f.name} error={s.fields.name ?? s.error?.message} placeholder="CS201 Data Structures, Section A" onChange={(e) => set('name', e.target.value)} /></div>
      <button className="btn btn-primary" disabled={s.busy}><Plus size={16} aria-hidden /> Create class</button>
    </form>
  );
}

function JoinClass({ onJoined }) {
  const [code, setCode] = useState('');
  const toast = useToast();
  const s = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const res = await api('/classes/join', { method: 'POST', body: { code } });
      setCode('');
      toast(`Joined ${res.class.name}`);
      onJoined();
    });
  };
  return (
    <form className="card row" onSubmit={submit} noValidate style={{ alignItems: 'flex-end' }}>
      <div className="grow"><Field label="Join code" value={code} maxLength={8} className="input mono" style={{ textTransform: 'uppercase' }}
        error={s.fields.code ?? s.error?.message} placeholder="ABCD2345" onChange={(e) => setCode(e.target.value)} /></div>
      <button className="btn btn-primary" disabled={s.busy || code.trim().length !== 8}>Join class</button>
    </form>
  );
}

export function ClassDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const state = useApi((signal) => api(`/classes/${id}`, { signal }), [id]);
  useTitle(state.data?.class.name ?? 'Class');

  const removeMember = async (m) => {
    if (!confirm(`Remove ${m.name} from this class?`)) return;
    const before = state.data;
    state.setData((d) => ({ ...d, members: d.members.filter((x) => x.id !== m.id) }));
    try { await api(`/classes/${id}/members/${m.id}`, { method: 'DELETE' }); } catch (e) { state.setData(before); toast(e.message, 'error'); }
  };
  const deleteClass = async () => {
    if (!confirm('Delete this class? Students keep their own data.')) return;
    try { await api(`/classes/${id}`, { method: 'DELETE' }); navigate('/classes'); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <StateView state={state} skeleton={<Skeleton rows={6} />}>
      {({ class: c, members }) => (
        <>
          <PageHeader title={c.name} subtitle={`${members.length} students`}>
            <span className="chip mono">Code {c.join_code}</span>
            <Tooltip label="Copy join code">
              <button className="btn btn-secondary icon-btn" aria-label="Copy join code" onClick={() => navigator.clipboard.writeText(c.join_code).then(() => toast('Code copied'), () => toast('Copy failed', 'error'))}>
                <Copy size={16} aria-hidden />
              </button>
            </Tooltip>
            <button className="btn btn-danger" onClick={deleteClass}><Trash2 size={16} aria-hidden /> Delete class</button>
          </PageHeader>
          {members.length === 0 ? (
            <div className="card empty"><GraduationCap size={36} aria-hidden /><h2>No students yet</h2><p className="muted">Share the join code <span className="mono">{c.join_code}</span> with your class.</p></div>
          ) : (
            <section className="card table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Demonstrated levels</th><th>Projects</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td><Link to={`/classes/${c.id}/students/${m.id}`}>{m.name}</Link></td>
                      <td><div className="row">{m.skills.length ? m.skills.map((s) => <span key={s.skill} className="row" style={{ gap: 4 }}>{s.skill} <LevelBadge level={s.level} /></span>) : <span className="muted">None yet</span>}</div></td>
                      <td>{m.project_count}</td>
                      <td className="muted">{formatDate(m.joined_at)}</td>
                      <td><Tooltip label="Remove from class"><button className="btn btn-ghost icon-btn" aria-label={`Remove ${m.name}`} onClick={() => removeMember(m)}><UserMinus size={18} aria-hidden /></button></Tooltip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}
    </StateView>
  );
}

export function ClassStudent() {
  const { id, studentId } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const state = useApi((signal) => api(`/classes/${id}/students/${studentId}`, { signal }), [id, studentId]);
  useTitle(state.data?.report.profile.name ?? 'Student');

  const setEndorsement = async (p, endorse) => {
    const note = endorse ? prompt('Optional note for your endorsement (max 300 characters)', '') : null;
    if (endorse && note === null) return;
    const before = state.data;
    state.setData((d) => ({
      ...d,
      report: {
        ...d.report,
        projects: d.report.projects.map((x) => (x.id !== p.id ? x : {
          ...x,
          endorsements: endorse
            ? [...x.endorsements.filter((e) => e.faculty_id !== user.id), { faculty_id: user.id, faculty_name: user.name, organization: user.organization, note }]
            : x.endorsements.filter((e) => e.faculty_id !== user.id),
        })),
      },
    }));
    try {
      await api(`/projects/${p.id}/endorsement`, endorse ? { method: 'PUT', body: { note: note.slice(0, 300) } } : { method: 'DELETE' });
      toast(endorse ? 'Project endorsed' : 'Endorsement withdrawn');
    } catch (e) { state.setData(before); toast(e.message, 'error'); }
  };

  return (
    <StateView state={state} skeleton={<Skeleton rows={8} />}>
      {({ report, class: c }) => (
        <div className="stack">
          <Link to={`/classes/${c.id}`} className="small">Back to {c.name}</Link>
          <Report report={report} projectActions={(p) => {
            const mine = p.endorsements.some((e) => e.faculty_id === user.id);
            return (
              <button className={`btn btn-sm ${mine ? 'btn-secondary' : 'btn-accent'}`} onClick={() => setEndorsement(p, !mine)}>
                <BadgeCheck size={16} aria-hidden /> {mine ? 'Withdraw' : 'Endorse'}
              </button>
            );
          }} />
        </div>
      )}
    </StateView>
  );
}
