import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking the session

  useEffect(() => {
    api.get('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  const value = useMemo(
    () => ({
      user: user ?? null,
      loading: user === undefined,
      async login(username, password) {
        setUser((await api.post('/api/auth/login', { username, password })).user);
      },
      async register(username, password) {
        setUser((await api.post('/api/auth/register', { username, password })).user);
      },
      async logout() {
        await api.post('/api/auth/logout');
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
