import { useState } from 'react';
import { FileText, FolderGit2, Pencil, Plus, RefreshCw, Sparkles, Trash2, Upload } from 'lucide-react';
import { api, uploadFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, usePersistentForm, useTitle } from '../hooks.js';
import { Field, PageHeader, Skeleton, StateView, Tooltip, formatDate, useToast } from '../ui.jsx';
import { useSubmit } from './Auth.jsx';
import { ProjectCard } from './Report.jsx';

export function Evidence() {
  useTitle('Projects and certificates');
  const [editing, setEditing] = useState(null); // null | 'new' | project
  const projects = useApi((signal) => api('/projects', { signal }).then((d) => d.projects), []);

  const saved = (p) => {
    projects.setData((list) => [p, ...(list ?? []).filter((x) => x.id !== p.id)]);
    setEditing(null);
  };

  return (
    <>
      <PageHeader title="Projects and certificates" subtitle="Evidence of what you've built and learned.">
        {!editing && <button className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} aria-hidden /> Add project</button>}
      </PageHeader>
      <div className="stack-lg">
        {editing && <ProjectForm project={editing === 'new' ? null : editing} onSaved={saved} onCancel={() => setEditing(null)} />}
        <StateView state={projects} skeleton={<Skeleton variant="cards" rows={2} />}
          empty={{ icon: FolderGit2, title: 'Add your first project', text: 'Link a GitHub repository and we will pull real data from it.', action: !editing && <button className="btn btn-primary" onClick={() => setEditing('new')}>Add project</button> }}>
          {(list) => (
            <div className="grid grid-2">
              {list.map((p) => (
                <ProjectCard key={p.id} p={p} actions={<ProjectActions p={p} onEdit={() => setEditing(p)} state={projects} />} />
              ))}
            </div>
          )}
        </StateView>
        <Certificates />
      </div>
    </>
  );
}

function ProjectActions({ p, onEdit, state }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const run = async (kind, fn) => {
    setBusy(kind);
    try { await fn(); } catch (e) { toast(e.message, 'error'); } finally { setBusy(null); }
  };
  const replace = (project) => state.setData((list) => list.map((x) => (x.id === project.id ? project : x)));
  return (
    <span className="row" style={{ gap: 0 }}>
      <Tooltip label="Analyse with AI (uses 1 AI feedback)">
        <button className="btn btn-ghost icon-btn" disabled={Boolean(busy)} aria-label="Analyse with AI"
          onClick={() => run('ai', async () => replace((await api(`/projects/${p.id}/analyze`, { method: 'POST' })).project))}>
          <Sparkles size={18} aria-hidden className={busy === 'ai' ? 'skeleton' : undefined} />
        </button>
      </Tooltip>
      {p.repo_url && (
        <Tooltip label="Refresh GitHub data">
          <button className="btn btn-ghost icon-btn" disabled={Boolean(busy)} aria-label="Refresh GitHub data"
            onClick={() => run('gh', async () => replace((await api(`/projects/${p.id}/refresh-github`, { method: 'POST' })).project))}>
            <RefreshCw size={18} aria-hidden />
          </button>
        </Tooltip>
      )}
      <Tooltip label="Edit"><button className="btn btn-ghost icon-btn" onClick={onEdit} aria-label={`Edit ${p.title}`}><Pencil size={18} aria-hidden /></button></Tooltip>
      <Tooltip label="Delete">
        <button className="btn btn-ghost icon-btn" disabled={Boolean(busy)} aria-label={`Delete ${p.title}`}
          onClick={() => confirm(`Delete "${p.title}"?`) && run('del', async () => {
            await api(`/projects/${p.id}`, { method: 'DELETE' });
            state.setData((list) => list.filter((x) => x.id !== p.id));
          })}>
          <Trash2 size={18} aria-hidden />
        </button>
      </Tooltip>
    </span>
  );
}

function ProjectForm({ project, onSaved, onCancel }) {
  const { user } = useAuth();
  const toast = useToast();
  const initial = project
    ? { title: project.title, description: project.description, repo_url: project.repo_url ?? '', live_url: project.live_url ?? '', tags: project.tags.join(', ') }
    : { title: '', description: '', repo_url: '', live_url: '', tags: '' };
  const { values: f, set, clear } = usePersistentForm(`form:project:${project?.id ?? 'new'}:${user.id}`, initial);
  const s = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const body = { ...f, tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean) };
      const res = await api(project ? `/projects/${project.id}` : '/projects', { method: project ? 'PUT' : 'POST', body });
      clear();
      toast(project ? 'Project updated' : 'Project added');
      onSaved(res.project);
    });
  };
  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <h2>{project ? 'Edit project' : 'New project'}</h2>
      {s.error && !Object.keys(s.fields).length && <p className="form-error" role="alert">{s.error.message}</p>}
      <Field label="Title" value={f.title} error={s.fields.title} maxLength={120} onChange={(e) => set('title', e.target.value)} />
      <Field label="What did you build and how?" as="textarea" value={f.description} error={s.fields.description} maxLength={3000} onChange={(e) => set('description', e.target.value)} />
      <div className="grid grid-2">
        <Field label="GitHub repository" value={f.repo_url} error={s.fields.repo_url} placeholder="https://github.com/you/project"
          hint="Public repos show stars, languages and recent activity." onChange={(e) => set('repo_url', e.target.value)} />
        <Field label="Live demo link" value={f.live_url} error={s.fields.live_url} placeholder="https://" onChange={(e) => set('live_url', e.target.value)} />
      </div>
      <Field label="Tags" value={f.tags} hint="Comma separated, up to 10" onChange={(e) => set('tags', e.target.value)} />
      <div className="row">
        <button className="btn btn-primary" disabled={s.busy}>{s.busy ? 'Saving' : 'Save project'}</button>
        <button type="button" className="btn btn-ghost" onClick={() => { clear(); onCancel(); }}>Cancel</button>
      </div>
    </form>
  );
}

function Certificates() {
  const toast = useToast();
  const state = useApi((signal) => api('/certificates', { signal }).then((d) => d.certificates), []);
  const [form, setForm] = useState({ title: '', issuer: '', file: null });
  const s = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      if (!form.file) throw Object.assign(new Error('Choose a file'), { fields: { file: 'Choose a PDF or image' } });
      const file_url = await uploadFile('certificate', form.file);
      const { certificate } = await api('/certificates', { method: 'POST', body: { title: form.title, issuer: form.issuer, file_url } });
      state.setData((list) => [certificate, ...(list ?? [])]);
      setForm({ title: '', issuer: '', file: null });
      e.target.reset();
      toast('Certificate added');
    });
  };
  const remove = async (c) => {
    if (!confirm(`Delete "${c.title}"?`)) return;
    const before = state.data;
    state.setData((list) => list.filter((x) => x.id !== c.id));
    try { await api(`/certificates/${c.id}`, { method: 'DELETE' }); } catch (err) { state.setData(before); toast(err.message, 'error'); }
  };
  return (
    <section className="card stack">
      <h2>Certificates</h2>
      <form className="stack" onSubmit={submit} noValidate>
        {s.error && !Object.keys(s.fields).length && <p className="form-error" role="alert">{s.error.message}</p>}
        <div className="grid grid-3">
          <Field label="Title" value={form.title} error={s.fields.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Field label="Issuer" value={form.issuer} placeholder="Coursera, NPTEL" onChange={(e) => setForm({ ...form, issuer: e.target.value })} />
          <Field label="File (PDF or image, 5 MB max)" type="file" accept=".pdf,image/png,image/jpeg,image/webp" error={s.fields.file}
            onChange={(e) => setForm({ ...form, file: e.target.files?.[0] ?? null })} />
        </div>
        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} disabled={s.busy}><Upload size={16} aria-hidden /> {s.busy ? 'Uploading' : 'Upload certificate'}</button>
      </form>
      <StateView state={state} empty={{ icon: FileText, title: 'No certificates yet', text: 'Upload course certificates to back up your skills.' }}>
        {(list) => (
          <ul className="list">
            {list.map((c) => (
              <li key={c.id} className="row-between">
                <span className="row"><FileText size={18} aria-hidden /><span><a href={c.file_url} target="_blank" rel="noreferrer noopener">{c.title}</a><span className="muted small"> {c.issuer && `· ${c.issuer} `}· {formatDate(c.created_at)}</span></span></span>
                <Tooltip label="Delete"><button className="btn btn-ghost icon-btn" onClick={() => remove(c)} aria-label={`Delete ${c.title}`}><Trash2 size={18} aria-hidden /></button></Tooltip>
              </li>
            ))}
          </ul>
        )}
      </StateView>
    </section>
  );
}
