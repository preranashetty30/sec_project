import { useState } from 'react';
import { CheckCircle2, Ban, RotateCcw, Users, ScrollText, Bug } from 'lucide-react';
import { api } from '../api.js';
import { useApi, useDebounce, useTitle } from '../hooks.js';
import { Field, PageHeader, Skeleton, StateView, formatDateTime, useToast } from '../ui.jsx';

const TABS = [['users', 'Users', Users], ['audit', 'Audit log', ScrollText], ['errors', 'Errors', Bug]];

export function Admin() {
  useTitle('Admin console');
  const [tab, setTab] = useState('users');
  return (
    <>
      <PageHeader title="Admin console" subtitle="Approve accounts, review actions and errors." />
      <div className="tabs" role="tablist">
        {TABS.map(([id, label, Icon]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}><Icon size={16} aria-hidden /> {label}</button>
        ))}
      </div>
      <div role="tabpanel">{tab === 'users' ? <UsersTab /> : tab === 'audit' ? <AuditTab /> : <ErrorsTab />}</div>
    </>
  );
}

function UsersTab() {
  const toast = useToast();
  const [filters, setFilters] = useState({ status: 'pending', role: '', q: '' });
  const q = useDebounce(filters.q.trim());
  const state = useApi((signal) => {
    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.role) params.set('role', filters.role);
    if (q) params.set('q', q);
    return api(`/admin/users?${params}`, { signal }).then((d) => d.users);
  }, [filters.status, filters.role, q]);

  const setStatus = async (u, status) => {
    const verb = status === 'suspended' ? 'Suspend' : u.status === 'pending' ? 'Approve' : 'Reactivate';
    if (!confirm(`${verb} ${u.name} (${u.email})?`)) return;
    try {
      await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status } });
      toast(`${{ Suspend: 'Suspended', Approve: 'Approved', Reactivate: 'Reactivated' }[verb]} ${u.name}`);
      state.reload();
    } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="stack">
      <div className="card grid grid-3">
        <Field label="Status" id="f-status">
          <select id="f-status" className="input" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">Any</option><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option>
          </select>
        </Field>
        <Field label="Role" id="f-role">
          <select id="f-role" className="input" value={filters.role} onChange={(e) => setFilters({ ...filters, role: e.target.value })}>
            <option value="">Any</option><option value="student">Student</option><option value="faculty">Faculty</option><option value="recruiter">Recruiter</option><option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Search" value={filters.q} placeholder="Name or email" onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
      </div>
      <StateView state={state} skeleton={<Skeleton rows={5} />} empty={{ icon: CheckCircle2, title: 'No users match', text: filters.status === 'pending' ? 'No accounts are waiting for approval.' : undefined }}>
        {(users) => (
          <section className="card table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><strong>{u.name}</strong><br /><span className="small muted">{u.email}{u.organization ? ` · ${u.organization}` : ''}</span></td>
                    <td>{u.role}</td>
                    <td><span className={`badge ${u.status === 'active' ? 'lvl-advanced' : u.status === 'pending' ? 'lvl-beginner' : 'badge-danger'}`}>{u.status}</span></td>
                    <td className="muted">{formatDateTime(u.created_at)}</td>
                    <td>
                      {u.role !== 'admin' && (
                        <div className="row">
                          {u.status !== 'active' && <button className="btn btn-accent btn-sm" onClick={() => setStatus(u, 'active')}>{u.status === 'pending' ? <><CheckCircle2 size={16} aria-hidden /> Approve</> : <><RotateCcw size={16} aria-hidden /> Reactivate</>}</button>}
                          {u.status !== 'suspended' && <button className="btn btn-danger btn-sm" onClick={() => setStatus(u, 'suspended')}><Ban size={16} aria-hidden /> Suspend</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </StateView>
    </div>
  );
}

function AuditTab() {
  const state = useApi((signal) => api('/admin/audit', { signal }).then((d) => d.entries), []);
  return (
    <StateView state={state} empty={{ icon: ScrollText, title: 'No admin actions yet' }}>
      {(rows) => (
        <section className="card table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="muted">{formatDateTime(r.created_at)}</td><td>{r.actor_email ?? 'deleted'}</td><td>{r.action}</td><td className="mono small">{r.target_id}</td><td className="mono small">{JSON.stringify(r.metadata)}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </StateView>
  );
}

function ErrorsTab() {
  const state = useApi((signal) => api('/admin/errors', { signal }).then((d) => d.errors), []);
  return (
    <StateView state={state} empty={{ icon: CheckCircle2, title: 'No server errors recorded' }}>
      {(rows) => (
        <section className="card table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Request</th><th>Path</th><th>Message</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td className="muted">{formatDateTime(r.created_at)}</td><td className="mono small">{r.request_id}</td><td className="mono small">{r.method} {r.path}</td><td>{r.message}</td></tr>
            ))}</tbody>
          </table>
        </section>
      )}
    </StateView>
  );
}
