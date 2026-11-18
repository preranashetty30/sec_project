import { useEffect, useRef, useState } from 'react';
import { Sparkles, Square } from 'lucide-react';
import { api, streamSse } from '../api.js';
import { useApi, useTitle } from '../hooks.js';
import { ErrorBoundary, ErrorState, PageHeader } from '../ui.jsx';

export function Coach() {
  useTitle('AI coach');
  const usage = useApi((signal) => api('/ai/usage', { signal }), []);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('idle'); // idle | waiting | streaming | done | error
  const [error, setError] = useState(null);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);

  const start = async () => {
    controller.current = new AbortController();
    setText('');
    setError(null);
    setStatus('waiting');
    try {
      await streamSse('/ai/coach', {
        signal: controller.current.signal,
        onToken: (t) => { setStatus('streaming'); setText((x) => x + t); },
      });
      setStatus('done');
    } catch (e) {
      if (e.name === 'AbortError') { setStatus('done'); return; }
      setError(e);
      setStatus('error');
    } finally {
      usage.reload();
    }
  };
  const busy = status === 'waiting' || status === 'streaming';
  const left = usage.data ? usage.data.feedback.limit - usage.data.feedback.used : null;

  return (
    <>
      <PageHeader title="AI coach" subtitle="A study plan built from your profile, projects and assessment results.">
        {busy ? (
          <button className="btn btn-secondary" onClick={() => controller.current?.abort()}><Square size={16} aria-hidden /> Stop</button>
        ) : (
          <button className="btn btn-primary" onClick={start} disabled={left === 0}><Sparkles size={16} aria-hidden /> {text ? 'New plan' : 'Get my plan'}</button>
        )}
      </PageHeader>
      {left !== null && <p className="small muted" style={{ marginBottom: 'var(--space-4)' }}>{left} of {usage.data.feedback.limit} AI feedback requests left today.</p>}
      <ErrorBoundary>
        {status === 'error' && <ErrorState error={error} onRetry={start} />}
        {status === 'waiting' && (
          <div className="card stack" aria-busy="true" role="status">
            <span className="sr-only">Writing your plan</span>
            {[95, 80, 88, 60].map((w) => <div key={w} className="skeleton sk-line" style={{ width: `${w}%` }} />)}
          </div>
        )}
        {text && <article className="card pre" aria-live="polite" aria-busy={busy}>{text}</article>}
        {status === 'idle' && !text && (
          <div className="card empty">
            <Sparkles size={36} aria-hidden />
            <h2>Ready when you are</h2>
            <p className="muted">The coach works best after you've added skills and taken at least one assessment.</p>
          </div>
        )}
      </ErrorBoundary>
    </>
  );
}
