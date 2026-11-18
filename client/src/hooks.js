import { useCallback, useEffect, useRef, useState } from 'react';

const defaultEmpty = (d) => d == null || (Array.isArray(d) && d.length === 0);

// Four-state data loading: loading | success | empty | error, with reload and local updates.
export function useApi(fetcher, deps, isEmpty = defaultEmpty) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [nonce, setNonce] = useState(0);
  const emptyRef = useRef(isEmpty);
  emptyRef.current = isEmpty;

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, status: 'loading', error: null }));
    fetcher(controller.signal)
      .then((data) => setState({ status: emptyRef.current(data) ? 'empty' : 'success', data, error: null }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ status: 'error', data: null, error }); });
    return () => controller.abort();
  }, [...deps, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((update) => setState((s) => {
    const data = typeof update === 'function' ? update(s.data) : update;
    return { status: emptyRef.current(data) ? 'empty' : 'success', data, error: null };
  }), []);
  return { ...state, reload, setData };
}

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};
export { storage };

const withoutSecrets = (values) =>
  Object.fromEntries(Object.entries(values).filter(([k]) => !/password/i.test(k)));

// Form state that survives errors and reloads. Saved only after the user edits; clear() after a successful submit.
export function usePersistentForm(key, initial) {
  const [values, setValues] = useState(() => ({ ...initial, ...(storage.get(key) ?? {}) }));
  const dirty = useRef(false);

  useEffect(() => {
    if (dirty.current) storage.set(key, withoutSecrets(values));
  }, [key, values]);

  const set = useCallback((name, value) => {
    dirty.current = true;
    setValues((v) => ({ ...v, [name]: value }));
  }, []);
  const clear = useCallback(() => { dirty.current = false; storage.remove(key); }, [key]);
  const reset = useCallback((next) => { dirty.current = false; storage.remove(key); setValues(next); }, [key]);
  return { values, set, clear, reset, hasDraft: storage.get(key) !== null };
}

export function useDebounce(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function useTitle(title) {
  useEffect(() => { document.title = title ? `${title} — SkillProof` : 'SkillProof'; }, [title]);
}
