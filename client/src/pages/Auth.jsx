import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { CheckCircle2, MailCheck } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Brand } from '../Layout.jsx';
import { usePersistentForm, useTitle } from '../hooks.js';
import { Field } from '../ui.jsx';

function AuthCard({ title, subtitle, children }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card stack">
        <Brand />
        <div className="card stack">
          <div className="stack-sm"><h1>{title}</h1>{subtitle && <p className="muted">{subtitle}</p>}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

// Shared submit handling: busy flag, form-level error, field errors.
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e); } finally { setBusy(false); }
  };
  return { busy, error, fields: error?.fields ?? {}, run };
}

const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard');

export function Login() {
  useTitle('Log in');
  const { user, setUser } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const s = useSubmit();
  useEffect(() => { if (user) navigate(safeNext(params.get('next')), { replace: true }); }, [user, navigate, params]);

  const submit = (e) => {
    e.preventDefault();
    s.run(async () => setUser((await api('/auth/login', { method: 'POST', body: form })).user));
  };
  return (
    <AuthCard title="Welcome back" subtitle="Log in to continue building your evidence.">
      <form className="stack" onSubmit={submit} noValidate>
        {s.error && !Object.keys(s.fields).length && <p className="form-error" role="alert">{s.error.message}</p>}
        <Field label="Email" type="email" autoComplete="email" required value={form.email} error={s.fields.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <Field label="Password" type="password" autoComplete="current-password" required value={form.password} error={s.fields.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button className="btn btn-primary" disabled={s.busy}>{s.busy ? 'Logging in' : 'Log in'}</button>
      </form>
      <div className="row-between small">
        <Link to="/forgot-password">Forgot password?</Link>
        <Link to="/register">Create an account</Link>
      </div>
    </AuthCard>
  );
}

export function Register() {
  useTitle('Create account');
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { values: f, set, clear } = usePersistentForm('form:register', { name: '', email: '', role: 'student', organization: '', password: '' });
  const s = useSubmit();
  useEffect(() => { if (user) navigate('/dashboard', { replace: true }); }, [user, navigate]);

  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      const { user: u } = await api('/auth/register', { method: 'POST', body: f });
      clear();
      setUser(u);
    });
  };
  return (
    <AuthCard title="Create your account" subtitle="Free for students, faculty and recruiters.">
      <form className="stack" onSubmit={submit} noValidate>
        {s.error && !Object.keys(s.fields).length && <p className="form-error" role="alert">{s.error.message}</p>}
        <Field label="I am a" id="role">
          <select className="input" id="role" value={f.role} onChange={(e) => set('role', e.target.value)}>
            <option value="student">Student</option>
            <option value="faculty">Faculty member</option>
            <option value="recruiter">Recruiter</option>
          </select>
        </Field>
        <Field label="Full name" autoComplete="name" value={f.name} error={s.fields.name} onChange={(e) => set('name', e.target.value)} />
        <Field label="Email" type="email" autoComplete="email" value={f.email} error={s.fields.email} onChange={(e) => set('email', e.target.value)} />
        {f.role !== 'student' && (
          <Field label={f.role === 'faculty' ? 'College or university' : 'Company'} value={f.organization} error={s.fields.organization}
            hint="An administrator approves faculty and recruiter accounts." onChange={(e) => set('organization', e.target.value)} />
        )}
        <Field label="Password" type="password" autoComplete="new-password" value={f.password} error={s.fields.password}
          hint="At least 10 characters." onChange={(e) => set('password', e.target.value)} />
        <p className="small muted">By creating an account you agree to use SkillProof honestly. Your report stays private until you share it.</p>
        <button className="btn btn-primary" disabled={s.busy}>{s.busy ? 'Creating account' : 'Create account'}</button>
      </form>
      <p className="small">Already registered? <Link to="/login">Log in</Link></p>
    </AuthCard>
  );
}

export function ForgotPassword() {
  useTitle('Forgot password');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const s = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => { await api('/auth/forgot-password', { method: 'POST', body: { email } }); setSent(true); });
  };
  return (
    <AuthCard title="Reset your password" subtitle="We'll email you a link that works for one hour.">
      {sent ? (
        <p className="row"><MailCheck color="var(--color-success)" aria-hidden /> If an account exists for {email}, a reset link is on its way.</p>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {s.error && <p className="form-error" role="alert">{s.error.message}</p>}
          <Field label="Email" type="email" autoComplete="email" value={email} error={s.fields.email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn-primary" disabled={s.busy}>Send reset link</button>
        </form>
      )}
      <Link className="small" to="/login">Back to log in</Link>
    </AuthCard>
  );
}

export function ResetPassword() {
  useTitle('Choose a new password');
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const s = useSubmit();
  const submit = (e) => {
    e.preventDefault();
    s.run(async () => {
      await api('/auth/reset-password', { method: 'POST', body: { token: params.get('token') ?? '', password } });
      setDone(true);
    });
  };
  return (
    <AuthCard title="Choose a new password">
      {done ? (
        <>
          <p className="row"><CheckCircle2 color="var(--color-success)" aria-hidden /> Password updated. All other sessions were signed out.</p>
          <Link className="btn btn-primary" to="/login">Log in</Link>
        </>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {s.error && !s.fields.password && <p className="form-error" role="alert">{s.error.message}</p>}
          <Field label="New password" type="password" autoComplete="new-password" value={password} error={s.fields.password}
            hint="At least 10 characters." onChange={(e) => setPassword(e.target.value)} />
          <button className="btn btn-primary" disabled={s.busy}>Update password</button>
        </form>
      )}
    </AuthCard>
  );
}

export { useSubmit };
