import { useState } from 'react';
import { Copy, ExternalLink, Plus, Trash2, Upload } from 'lucide-react';
import { api, uploadFile } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, usePersistentForm, useTitle } from '../hooks.js';
import { Avatar, Field, PageHeader, Skeleton, StateView, Tooltip, useToast } from '../ui.jsx';
import { useSubmit } from './Auth.jsx';
import { LEVELS } from './util.js';

export function Profile() {
  useTitle('Profile and skills');
  const state = useApi((signal) => api('/me/profile', { signal }).then((d) => d.profile), []);
  return (
    <>
      <PageHeader title="Profile and skills" subtitle="What appears on your skill report." />
      <div className="stack-lg">
        <StateView state={state} skeleton={<Skeleton rows={6} />}>
          {(profile) => (
            <>
              <ProfileForm profile={profile} />
              <Privacy profile={profile} onChange={(p) => state.setData({ ...profile, ...p })} />
            </>
          )}
        </StateView>
        <Skills />
      </div>
    </>
  );
}

const emptyEdu = { school: '', degree: '', field: '', start_year: '', end_year: '' };

function ProfileForm({ profile }) {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const initial = {
    name: profile.name, headline: profile.headline, bio: profile.bio, education: profile.education,
    interests: profile.interests.join(', '), avatar_url: profile.avatar_url,
  };
  const { values: f, set, clear, hasDraft } = usePersistentForm(`form:profile:${user.id}`, initial);
  const s = useSubmit();
  const [uploading, setUploading] = useState(false);

  const setEdu = (i, key, value) => set('education', f.education.map((e, j) => (j === i ? { ...e, [key]: value } : e)));
  const onAvatar = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try { set('avatar_url', await uploadFile('avatar', file)); } catch (err) { toast(err.message, 'error'); } finally { setUploading(false); }
  };
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const body = {
        ...f,
        interests: f.interests.split(',').map((x) => x.trim()).filter(Boolean),
        education: f.education.map((x) => ({ ...x, start_year: x.start_year || null, end_year: x.end_year || null })),
      };
      await api('/me/profile', { method: 'PUT', body });
      clear();
      setUser({ ...user, name: f.name });
      toast('Profile saved');
    });
  };

  return (
    <form className="card stack" onSubmit={submit} noValidate>
      <div className="row-between"><h2>About you</h2>{hasDraft && <span className="badge badge-muted">Unsaved draft restored</span>}</div>
      {s.error && <p className="form-error" role="alert">{s.error.message}</p>}
      <div className="row">
        <Avatar name={f.name} url={f.avatar_url} large />
        <label className="btn btn-secondary">
          <Upload size={16} aria-hidden /> {uploading ? 'Uploading' : 'Change photo'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onAvatar} disabled={uploading} />
        </label>
        {f.avatar_url && <button type="button" className="btn btn-ghost" onClick={() => set('avatar_url', null)}>Remove</button>}
      </div>
      <div className="grid grid-2">
        <Field label="Full name" value={f.name} error={s.fields.name} onChange={(e) => set('name', e.target.value)} />
        <Field label="Headline" value={f.headline} error={s.fields.headline} placeholder="CSE student building data tools" maxLength={120} onChange={(e) => set('headline', e.target.value)} />
      </div>
      <Field label="Bio" as="textarea" value={f.bio} error={s.fields.bio} maxLength={2000} onChange={(e) => set('bio', e.target.value)} />
      <Field label="Interests" value={f.interests} hint="Separate with commas, for example: machine learning, web apps" onChange={(e) => set('interests', e.target.value)} />
      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="row-between" style={{ width: '100%' }}><h3>Education</h3></legend>
        {f.education.map((e, i) => (
          <div key={i} className="card card-tight stack-sm">
            <div className="grid grid-2">
              <Field label="Institution" value={e.school} error={s.fields[`education.${i}.school`]} onChange={(ev) => setEdu(i, 'school', ev.target.value)} />
              <Field label="Degree" value={e.degree} placeholder="B.E." onChange={(ev) => setEdu(i, 'degree', ev.target.value)} />
              <Field label="Field of study" value={e.field} placeholder="Computer Science" onChange={(ev) => setEdu(i, 'field', ev.target.value)} />
              <div className="row">
                <div className="grow"><Field label="Start year" type="number" inputMode="numeric" value={e.start_year ?? ''} onChange={(ev) => setEdu(i, 'start_year', ev.target.value)} /></div>
                <div className="grow"><Field label="End year" type="number" inputMode="numeric" value={e.end_year ?? ''} onChange={(ev) => setEdu(i, 'end_year', ev.target.value)} /></div>
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-end' }} onClick={() => set('education', f.education.filter((_, j) => j !== i))}>
              <Trash2 size={16} aria-hidden /> Remove
            </button>
          </div>
        ))}
        {f.education.length < 10 && (
          <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => set('education', [...f.education, emptyEdu])}>
            <Plus size={16} aria-hidden /> Add education
          </button>
        )}
      </fieldset>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={s.busy}>{s.busy ? 'Saving' : 'Save profile'}</button>
    </form>
  );
}

function Privacy({ profile, onChange }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const link = `${location.origin}/p/${profile.public_slug}`;
  const update = async (patch) => {
    const next = { is_public: profile.is_public, recruiter_visible: profile.recruiter_visible, ...patch };
    onChange(next); // optimistic
    setBusy(true);
    try { await api('/me/privacy', { method: 'PUT', body: next }); } catch (e) {
      onChange({ is_public: profile.is_public, recruiter_visible: profile.recruiter_visible });
      toast(e.message, 'error');
    } finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { toast('Copy failed. Select the link and copy it.', 'error'); }
  };
  return (
    <section className="card stack">
      <h2>Sharing and privacy</h2>
      <p className="muted small">Your report is private until you turn sharing on. You can turn it off any time.</p>
      <label className="check">
        <input type="checkbox" checked={profile.is_public} disabled={busy} onChange={(e) => update({ is_public: e.target.checked })} />
        <span><strong>Public report link</strong><br /><span className="muted small">Anyone with the link can see your report (never your email or answers).</span></span>
      </label>
      {profile.is_public && (
        <div className="row">
          <code className="mono small grow" style={{ overflowWrap: 'anywhere' }}>{link}</code>
          <Tooltip label="Copy link"><button className="btn btn-secondary icon-btn" onClick={copy} aria-label="Copy report link"><Copy size={16} aria-hidden /></button></Tooltip>
          <a className="btn btn-secondary" href={`/p/${profile.public_slug}`} target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden /> Open</a>
        </div>
      )}
      <label className="check">
        <input type="checkbox" checked={profile.recruiter_visible} disabled={busy} onChange={(e) => update({ recruiter_visible: e.target.checked })} />
        <span><strong>Visible to recruiters</strong><br /><span className="muted small">Approved recruiters can find you by demonstrated skill and shortlist you.</span></span>
      </label>
    </section>
  );
}

function Skills() {
  const { user } = useAuth();
  const toast = useToast();
  const state = useApi((signal) => api('/me/skills', { signal }).then((d) => d.skills), []);
  const { values: f, set, clear } = usePersistentForm(`form:skill:${user.id}`, { name: '', self_level: 'beginner' });
  const s = useSubmit();

  const add = (e) => {
    e.preventDefault();
    s.run(async () => {
      const { skill } = await api('/me/skills', { method: 'POST', body: f });
      state.setData((list) => [...(list ?? []), skill].sort((a, b) => a.name.localeCompare(b.name)));
      clear();
      set('name', '');
    });
  };
  const remove = async (skill) => {
    const before = state.data;
    state.setData((list) => list.filter((x) => x.id !== skill.id)); // optimistic
    try { await api(`/me/skills/${skill.id}`, { method: 'DELETE' }); } catch (e) { state.setData(before); toast(e.message, 'error'); }
  };
  const changeLevel = async (skill, self_level) => {
    const before = state.data;
    state.setData((list) => list.map((x) => (x.id === skill.id ? { ...x, self_level } : x)));
    try { await api(`/me/skills/${skill.id}`, { method: 'PATCH', body: { self_level } }); } catch (e) { state.setData(before); toast(e.message, 'error'); }
  };

  return (
    <section className="card stack">
      <h2>Skills you want to demonstrate</h2>
      <form className="row" onSubmit={add} noValidate style={{ alignItems: 'flex-end' }}>
        <div className="grow"><Field label="Skill" value={f.name} error={s.fields.name ?? (s.error && !s.fields.self_level ? s.error.message : undefined)} placeholder="Python, React, SQL, Public speaking" onChange={(e) => set('name', e.target.value)} /></div>
        <Field label="Your level" id="new-skill-level">
          <select id="new-skill-level" className="input" value={f.self_level} onChange={(e) => set('self_level', e.target.value)}>
            {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <button className="btn btn-primary" disabled={s.busy}><Plus size={16} aria-hidden /> Add</button>
      </form>
      <StateView state={state} empty={{ title: 'No skills yet', text: 'Add the skills you want to prove. You can take an assessment for each one.' }}>
        {(skills) => (
          <ul className="list">
            {skills.map((sk) => (
              <li key={sk.id} className="row-between">
                <strong>{sk.name}</strong>
                <span className="row">
                  <select className="input" style={{ width: 'auto' }} value={sk.self_level} aria-label={`Level for ${sk.name}`} onChange={(e) => changeLevel(sk, e.target.value)}>
                    {LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  <Tooltip label={`Remove ${sk.name}`}>
                    <button className="btn btn-ghost icon-btn" onClick={() => remove(sk)} aria-label={`Remove ${sk.name}`}><Trash2 size={18} aria-hidden /></button>
                  </Tooltip>
                </span>
              </li>
            ))}
          </ul>
        )}
      </StateView>
    </section>
  );
}
