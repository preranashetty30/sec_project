import { Link, useParams } from 'react-router';
import { Award, BadgeCheck, ExternalLink, FileText, FolderGit2, GitFork, ShieldAlert, Star } from 'lucide-react';
import { api } from '../api.js';
import { useApi, useTitle } from '../hooks.js';
import { Brand, ThemeToggle } from '../Layout.jsx';
import { Avatar, Empty, LevelBadge, Skeleton, StateView, Tooltip, formatDate } from '../ui.jsx';

export function Integrity({ a }) {
  const label = `${a.tab_switches} tab switches, ${a.paste_events} pastes during the timed attempt`;
  return (
    <Tooltip label={label}>
      <span className={`badge ${a.flagged ? 'badge-danger' : 'badge-muted'}`} tabIndex={0}>
        {a.flagged && <ShieldAlert size={12} aria-hidden />}
        {a.flagged ? 'Flagged' : 'Clean'} · {a.tab_switches}/{a.paste_events}
      </span>
    </Tooltip>
  );
}

export function ProjectCard({ p, actions }) {
  const gh = p.github_meta;
  return (
    <article className="card stack-sm">
      <div className="row-between">
        <h3>{p.title}</h3>
        {actions}
      </div>
      {p.description && <p className="muted pre">{p.description}</p>}
      {p.tags?.length > 0 && <div className="row">{p.tags.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
      {gh && !gh.error && (
        <div className="row small muted">
          <span className="row" style={{ gap: 4 }}><Star size={14} aria-hidden /> {gh.stars}</span>
          <span className="row" style={{ gap: 4 }}><GitFork size={14} aria-hidden /> {gh.forks}</span>
          {gh.languages?.length > 0 && <span>{gh.languages.join(', ')}</span>}
          {gh.pushed_at && <span>Updated {formatDate(gh.pushed_at)}</span>}
        </div>
      )}
      {gh?.error && <p className="small muted">GitHub: {gh.error}</p>}
      {p.ai_summary && <p className="small pre" style={{ borderLeft: '3px solid var(--color-secondary)', paddingLeft: 'var(--space-3)' }}>{p.ai_summary}</p>}
      {p.endorsements?.map((e) => (
        <p key={e.faculty_id} className="small row" style={{ color: 'var(--color-success)' }}>
          <BadgeCheck size={16} aria-hidden /> Endorsed by {e.faculty_name}{e.organization ? `, ${e.organization}` : ''}{e.note ? `: "${e.note}"` : ''}
        </p>
      ))}
      <div className="row small">
        {p.repo_url && <a href={p.repo_url} target="_blank" rel="noreferrer noopener" className="row" style={{ gap: 4 }}><FolderGit2 size={14} aria-hidden /> Repository</a>}
        {p.live_url && <a href={p.live_url} target="_blank" rel="noreferrer noopener" className="row" style={{ gap: 4 }}><ExternalLink size={14} aria-hidden /> Live demo</a>}
      </div>
    </article>
  );
}

// The skill report used by public links, recruiters and faculty.
export function Report({ report, projectActions }) {
  const { profile, demonstrated, skills, assessments, projects, certificates } = report;
  return (
    <div className="stack-lg">
      <section className="card row" style={{ alignItems: 'flex-start' }}>
        <Avatar name={profile.name} url={profile.avatar_url} large />
        <div className="grow stack-sm">
          <h1>{profile.name}</h1>
          {profile.headline && <p className="muted">{profile.headline}</p>}
          {profile.bio && <p className="pre">{profile.bio}</p>}
          {profile.education?.map((e, i) => (
            <p key={i} className="small">{[e.degree, e.field].filter(Boolean).join(', ')}{e.degree || e.field ? ' · ' : ''}{e.school}{e.start_year ? ` (${e.start_year}${e.end_year ? `-${e.end_year}` : ''})` : ''}</p>
          ))}
          {profile.interests?.length > 0 && <div className="row">{profile.interests.map((t) => <span className="chip" key={t}>{t}</span>)}</div>}
        </div>
      </section>

      <section className="stack" aria-labelledby="demo-h">
        <h2 id="demo-h" className="row"><Award size={20} aria-hidden /> Demonstrated skills</h2>
        {demonstrated.length === 0 ? <Empty title="No skills demonstrated yet" text="Levels appear here after graded assessments." /> : (
          <div className="grid grid-3">
            {demonstrated.map((d) => (
              <div key={d.skill} className="card card-tight stack-sm">
                <strong>{d.skill}</strong>
                <LevelBadge level={d.level} percent={d.percent} />
              </div>
            ))}
          </div>
        )}
        {skills.length > 0 && <p className="small muted">Also lists: {skills.map((s) => s.name).join(', ')}</p>}
      </section>

      {assessments.length > 0 && (
        <section className="card" aria-labelledby="att-h">
          <h2 id="att-h">Assessment history</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Skill</th><th>Claimed</th><th>Result</th><th>Integrity</th><th>Date</th></tr></thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.skill}</td><td className="muted">{a.self_level}</td>
                    <td><LevelBadge level={a.level_awarded} percent={a.percent} /></td>
                    <td><Integrity a={a} /></td><td className="muted">{formatDate(a.graded_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="small muted" style={{ marginTop: 'var(--space-3)' }}>Each attempt is a unique AI-written, 20-minute timed test graded against a rubric.</p>
        </section>
      )}

      <section className="stack" aria-labelledby="proj-h">
        <h2 id="proj-h" className="row"><FolderGit2 size={20} aria-hidden /> Projects</h2>
        {projects.length === 0 ? <Empty title="No projects yet" /> : (
          <div className="grid grid-2">{projects.map((p) => <ProjectCard key={p.id} p={p} actions={projectActions?.(p)} />)}</div>
        )}
      </section>

      {certificates.length > 0 && (
        <section className="card" aria-labelledby="cert-h">
          <h2 id="cert-h">Certificates</h2>
          <ul className="list">
            {certificates.map((c) => (
              <li key={c.id} className="row-between">
                <span className="row"><FileText size={18} aria-hidden /> {c.title}{c.issuer && <span className="muted"> · {c.issuer}</span>}</span>
                <a href={c.file_url} target="_blank" rel="noreferrer noopener">View</a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function PublicReport() {
  const { slug } = useParams();
  const state = useApi((signal) => api(`/public/reports/${encodeURIComponent(slug)}`, { signal }).then((d) => d.report), [slug]);
  useTitle(state.data ? `${state.data.profile.name}'s skill report` : 'Skill report');
  return (
    <>
      <header className="public-header no-print"><Brand /><div className="row"><ThemeToggle /><Link className="btn btn-secondary" to="/register">Create your own</Link></div></header>
      <main id="main" className="main">
        <StateView state={state} skeleton={<Skeleton rows={6} />}>{(report) => <Report report={report} />}</StateView>
      </main>
    </>
  );
}
