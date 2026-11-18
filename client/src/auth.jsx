import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null, error: null });

  const refresh = useCallback(async () => {
    try {
      const { user } = await api('/auth/me');
      setState({ status: 'ready', user, error: null });
    } catch (error) {
      setState(error.status === 401 ? { status: 'ready', user: null, error: null } : { status: 'error', user: null, error });
    }
  }, []);

  useEffect(() => {
    refresh();
    setUnauthorizedHandler(() => setState({ status: 'ready', user: null, error: null }));
  }, [refresh]);

  const value = {
    ...state,
    refresh,
    setUser: (user) => setState({ status: 'ready', user, error: null }),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setState({ status: 'ready', user: null, error: null });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
