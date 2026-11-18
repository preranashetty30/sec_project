import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Search, Star, StarOff } from 'lucide-react';
import { api } from '../api.js';
import { storage, useApi, useDebounce, useTitle } from '../hooks.js';
import { Avatar, Field, LevelBadge, PageHeader, Skeleton, StateView, Tooltip, useToast } from '../ui.jsx';
import { Report } from './Report.jsx';
import { LEVELS } from './util.js';

function StudentRow({ s, onToggle }) {
  return (
    <li className="row-between">
      <span className="row grow">
        <Avatar name={s.name} url={s.avatar_url} />
        <span className="stack-sm grow">
          <Link to={`/talent/${s.id}`}><strong>{s.name}</strong></Link>
          {s.headline && <span className="small muted">{s.headline}</span>}
          <span className="row">{(s.skills ?? []).slice(0, 6).map((k) => <span key={k.skill} className="row" style={{ gap: 4 }}><span className="small">{k.skill}</span><LevelBadge level={k.level} /></span>)}</span>
        </span>
      </span>
      {onToggle && (
        <Tooltip label={s.shortlisted ? 'Remove from shortlist' : 'Add to shortlist'}>
          <button className="btn btn-ghost icon-btn" aria-pressed={s.shortlisted} aria-label={`${s.shortlisted ? 'Remove' : 'Shortlist'} ${s.name}`} onClick={() => onToggle(s)}>
            {s.shortlisted ? <Star size={20} fill="currentColor" color="var(--color-warning)" aria-hidden /> : <Star size={20} aria-hidden />}
          </button>
        </Tooltip>
      )}
    </li>
  );
}

// Optimistic shortlist toggle shared by search and detail pages.
function useShortlistToggle(update) {
  const toast = useToast();
  return async (s) => {
    const next = !s.shortlisted;
    update(s.id, next);
    try {
      await api(`/shortlist/${s.id}`, next ? { method: 'PUT', body: {} } : { method: 'DELETE' });
    } catch (e) {
      update(s.id, !next);
      toast(e.message, 'error');
    }
  };
}

export function Talent() {
  useTitle('Find talent');
  const [filters, setFilters] = useState(() => storage.get('talent:filters') ?? { skill: '', min_level: 'beginner', q: '' });
  const [page, setPage] = useState(1);
  const skill = useDebounce(filters.skill.trim());
  const q = useDebounce(filters.q.trim());
  const change = (k, v) => {
    const next = { ...filters, [k]: v };
    setFilters(next);
    storage.set('talent:filters', next);
    setPage(1);
  };
  const state = useApi(async (signal) => {
    const params = new URLSearchParams({ min_level: filters.min_level, page: String(page) });
    if (skill) params.set('skill', skill);
    if (q) params.set('q', q);
    return api(`/talent?${params}`, { signal });
  }, [skill, q, filters.min_level, page], (d) => d.students.length === 0);

  const toggle = useShortlistToggle((id, value) =>
    state.setData((d) => ({ ...d, students: d.students.map((s) => (s.id === id ? { ...s, shortlisted: value } : s)) })));

  return (
    <>
      <PageHeader title="Find talent" subtitle="Students who opted in, filtered by levels they demonstrated in timed assessments." />
      <div className="card grid grid-3" style={{ marginBottom: 'var(--space-5)' }}>
        <Field label="Skill" value={filters.skill} placeholder="Python" onChange={(e) => change('skill', e.target.value)} />
        <Field label="Minimum level" id="min-level">
          <select id="min-level" className="input" value={filters.min_level} onChange={(e) => change('min_level', e.target.value)}>
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Name or headline" value={filters.q} placeholder="Search" onChange={(e) => change('q', e.target.value)} />
      </div>
      <StateView state={state} skeleton={<Skeleton rows={5} />}
        empty={{ icon: Search, title: 'No students match', text: 'Try a broader skill or a lower minimum level.', action: <button className="btn btn-secondary" onClick={() => { setFilters({ skill: '', min_level: 'beginner', q: '' }); storage.remove('talent:filters'); setPage(1); }}>Clear filters</button> }}>
        {(d) => (
          <section className="card stack">
            <ul className="list">{d.students.map((s) => <StudentRow key={s.id} s={s} onToggle={toggle} />)}</ul>
            <div className="row">
              {page > 1 && <button className="btn btn-secondary" onClick={() => setPage(page - 1)}>Previous</button>}
              {d.has_more && <button className="btn btn-secondary" onClick={() => setPage(page + 1)}>Next</button>}
            </div>
          </section>
        )}
      </StateView>
    </>
  );
}

export function TalentStudent() {
  const { id } = useParams();
  const state = useApi((signal) => api(`/talent/${id}`, { signal }), [id]);
  useTitle(state.data?.report.profile.name ?? 'Student');
  const toggle = useShortlistToggle((_, value) => state.setData((d) => ({ ...d, shortlisted: value })));
  return (
    <StateView state={state} skeleton={<Skeleton rows={8} />}>
      {(d) => (
        <div className="stack">
          <div className="row-between">
            <Link to="/talent" className="small">Back to search</Link>
            <button className={`btn ${d.shortlisted ? 'btn-secondary' : 'btn-primary'}`} onClick={() => toggle({ id, shortlisted: d.shortlisted })}>
              {d.shortlisted ? <><StarOff size={16} aria-hidden /> Remove from shortlist</> : <><Star size={16} aria-hidden /> Shortlist</>}
            </button>
          </div>
          <Report report={d.report} />
        </div>
      )}
    </StateView>
  );
}

export function Shortlist() {
  useTitle('Shortlist');
  const state = useApi((signal) => api('/shortlist', { signal }).then((d) => d.students.map((s) => ({ ...s, shortlisted: true }))), []);
  const toggle = useShortlistToggle((id, value) => state.setData((list) => list.map((s) => (s.id === id ? { ...s, shortlisted: value } : s))));
  return (
    <>
      <PageHeader title="Shortlist" subtitle="Students you've saved." />
      <StateView state={state} empty={{ icon: Star, title: 'Your shortlist is empty', action: <Link className="btn btn-primary" to="/talent">Find talent</Link> }}>
        {(list) => <section className="card"><ul className="list">{list.map((s) => <StudentRow key={s.id} s={s} onToggle={toggle} />)}</ul></section>}
      </StateView>
    </>
  );
}
