import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Bell, CheckCheck, Download, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useApi, useTitle } from '../hooks.js';
import { Field, PageHeader, Skeleton, StateView, formatDateTime, useToast } from '../ui.jsx';
import { useSubmit } from './Auth.jsx';

export function Notifications() {
  useTitle('Notifications');
  const toast = useToast();
  const state = useApi((signal) => api('/notifications', { signal }), [], (d) => d.notifications.length === 0);

  const markAll = async () => {
    const before = state.data;
    const now = new Date().toISOString();
    state.setData((d) => ({ ...d, unread: 0, notifications: d.notifications.map((n) => ({ ...n, read_at: n.read_at ?? now })) }));
    try { await api('/notifications/read-all', { method: 'POST' }); } catch (e) { state.setData(before); toast(e.message, 'error'); }
  };
  const markOne = (n) => {
    if (n.read_at) return;
    state.setData((d) => ({ ...d, unread: d.unread - 1, notifications: d.notifications.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)) }));
    api(`/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
  };

  return (
    <>
      <PageHeader title="Notifications">
        {state.data?.unread > 0 && <button className="btn btn-secondary" onClick={markAll}><CheckCheck size={16} aria-hidden /> Mark all read</button>}
      </PageHeader>
      <StateView state={state} skeleton={<Skeleton rows={5} />} empty={{ icon: Bell, title: "You're all caught up", text: 'Grades, endorsements and approvals show up here.' }}>
        {(d) => (
          <section className="card">
            <ul className="list">
              {d.notifications.map((n) => (
                <li key={n.id} className="row-between" style={{ opacity: n.read_at ? 0.7 : 1 }}>
                  <span className="row grow">
                    {!n.read_at && <span className="badge lvl-intermediate">New</span>}
                    {n.link ? <Link to={n.link} onClick={() => markOne(n)}>{n.message}</Link> : <span>{n.message}</span>}
                  </span>
                  <span className="small muted">{formatDateTime(n.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </StateView>
    </>
  );
}

export function Settings() {
  useTitle('Account');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [pw, setPw] = useState({ current_password: '', new_password: '' });
  const [del, setDel] = useState('');
  const change = useSubmit();
  const remove = useSubmit();

  const submitPw = (e) => {
    e.preventDefault();
    change.run(async () => {
      await api('/auth/change-password', { method: 'POST', body: pw });
      setPw({ current_password: '', new_password: '' });
      toast('Password changed. Other devices were signed out.');
    });
  };
  const submitDelete = (e) => {
    e.preventDefault();
    if (!confirm('Permanently delete your account and all your data? This cannot be undone.')) return;
    remove.run(async () => {
      await api('/me', { method: 'DELETE', body: { password: del } });
      await logout();
      navigate('/');
    });
  };

  return (
    <>
      <PageHeader title="Account" subtitle={`${user.email} · ${user.role}`} />
      <div className="stack-lg">
        <form className="card stack" onSubmit={submitPw} noValidate>
          <h2>Change password</h2>
          {change.error && !Object.keys(change.fields).length && <p className="form-error" role="alert">{change.error.message}</p>}
          <div className="grid grid-2">
            <Field label="Current password" type="password" autoComplete="current-password" value={pw.current_password} error={change.fields.current_password}
              onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
            <Field label="New password" type="password" autoComplete="new-password" value={pw.new_password} error={change.fields.new_password}
              hint="At least 10 characters." onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </div>
          <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} disabled={change.busy}>Change password</button>
        </form>

        <section className="card stack">
          <h2>Your data</h2>
          <p className="muted">Download everything SkillProof stores about you as a JSON file.</p>
          <a className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} href="/api/v1/me/export" download><Download size={16} aria-hidden /> Export my data</a>
        </section>

        {user.role !== 'admin' && (
          <form className="card stack" onSubmit={submitDelete} noValidate style={{ borderColor: 'var(--color-danger)' }}>
            <h2>Delete account</h2>
            <p className="muted">Deletes your profile, projects, assessments and everything else. This cannot be undone.</p>
            {remove.error && !Object.keys(remove.fields).length && <p className="form-error" role="alert">{remove.error.message}</p>}
            <Field label="Confirm with your password" type="password" autoComplete="current-password" value={del} error={remove.fields.password} onChange={(e) => setDel(e.target.value)} />
            <button className="btn btn-danger" style={{ alignSelf: 'flex-start' }} disabled={remove.busy || !del}><Trash2 size={16} aria-hidden /> Delete my account</button>
          </form>
        )}
      </div>
    </>
  );
}
