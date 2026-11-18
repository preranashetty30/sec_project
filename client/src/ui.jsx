import { Component, createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Inbox, RefreshCw, X } from 'lucide-react';

export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI error', error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card error-state" role="alert">
        <AlertTriangle size={32} aria-hidden />
        <h2>Something went wrong in this section</h2>
        <p className="muted">The rest of SkillProof still works.</p>
        <button className="btn btn-secondary" onClick={() => this.setState({ error: null })}>
          <RefreshCw size={16} aria-hidden /> Reload section
        </button>
      </div>
    );
  }
}

export function Skeleton({ rows = 3, variant = 'list' }) {
  if (variant === 'cards') {
    return (
      <div className="grid grid-3" aria-busy="true" aria-label="Loading">
        {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton sk-block" />)}
      </div>
    );
  }
  return (
    <div className="card stack" aria-busy="true" aria-label="Loading">
      <div className="skeleton sk-title" />
      {Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton sk-line" style={{ width: `${90 - i * 12}%` }} />)}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card error-state" role="alert">
      <AlertTriangle size={32} aria-hidden />
      <p>{error?.message ?? 'Something went wrong.'}</p>
      {error?.requestId && <p className="small muted mono">Reference: {error.requestId}</p>}
      {onRetry && <button className="btn btn-secondary" onClick={onRetry}><RefreshCw size={16} aria-hidden /> Try again</button>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="card empty">
      <Icon size={36} aria-hidden />
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

// Renders the right one of the four states for a useApi() result.
export function StateView({ state, skeleton = <Skeleton />, empty, children }) {
  if (state.status === 'loading') return skeleton;
  if (state.status === 'error') return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.status === 'empty' && empty) return <Empty {...empty} />;
  return <div className="fade-in">{children(state.data)}</div>;
}

export function PageHeader({ title, subtitle, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, [title]);
  return (
    <header className="page-header">
      <div>
        <h1 tabIndex={-1} ref={ref}>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function Tooltip({ label, children }) {
  const [open, setOpen] = useState(false);
  const [below, setBelow] = useState(false);
  const timer = useRef();
  const id = useId();
  const wrap = useRef(null);
  const show = (delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setBelow((wrap.current?.getBoundingClientRect().top ?? 100) < 48);
      setOpen(true);
    }, delay);
  };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <span
      className="tooltip-wrap" ref={wrap}
      onMouseEnter={() => show(200)} onMouseLeave={hide}
      onFocus={() => show(0)} onBlur={hide}
      onKeyDown={(e) => e.key === 'Escape' && hide()}
      aria-describedby={open ? id : undefined}
    >
      {children}
      {open && <span role="tooltip" id={id} className={`tooltip${below ? ' below' : ''}`}>{label}</span>}
    </span>
  );
}

export function Field({ label, error, hint, id, as = 'input', children, ...props }) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const Tag = as;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      {children ?? (
        <Tag
          id={fieldId} className="input" aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-err` : hint ? `${fieldId}-hint` : undefined}
          {...props}
        />
      )}
      {hint && !error && <span className="hint" id={`${fieldId}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${fieldId}-err`} role="alert">{error}</span>}
    </div>
  );
}

const LEVEL_TEXT = { advanced: 'Advanced', intermediate: 'Intermediate', beginner: 'Beginner', not_demonstrated: 'Not yet demonstrated' };
export const levelText = (l) => LEVEL_TEXT[l] ?? l;
export function LevelBadge({ level, percent }) {
  return (
    <span className={`badge lvl-${level}`}>
      {level !== 'not_demonstrated' && <CheckCircle2 size={12} aria-hidden />}
      {levelText(level)}{percent != null && ` · ${Math.round(percent)}%`}
    </span>
  );
}

export function Avatar({ name, url, large }) {
  const cls = `avatar${large ? ' avatar-lg' : ''}`;
  if (url) {
    const src = url.replace('/upload/', '/upload/c_fill,w_176,h_176,f_auto,q_auto/');
    return <img className={cls} src={src} alt="" width={large ? 88 : 48} height={large ? 88 : 48} loading="lazy" />;
  }
  return <span className={cls} aria-hidden>{(name ?? '?').trim().charAt(0).toUpperCase()}</span>;
}

export const formatDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const formatDateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const toast = useCallback((message, type = 'info') => {
    const id = crypto.randomUUID();
    setToasts((t) => [...t.slice(-2), { id, message, type }]);
    setTimeout(() => dismiss(id), type === 'error' ? 7000 : 4000);
  }, [dismiss]);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.type === 'error' ? ' toast-error' : ''}`} role={t.type === 'error' ? 'alert' : 'status'}>
            <span className="grow">{t.message}</span>
            <button className="btn btn-ghost btn-sm icon-btn" style={{ color: 'inherit' }} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={16} aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
