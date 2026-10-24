import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { forgetKey } from './keys/session.js';

const AuthContext = createContext(null);

// Who is signed in (the cookie session). The account key lives apart from it,
// in this tab only (keys/session.js): a signed-in tab without it can read but
// must unlock to write.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking the session

  useEffect(() => {
    api.get('/api/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  const value = useMemo(
    () => ({
      user: user ?? null,
      loading: user === undefined,
      signedIn(next) {
        setUser(next);
      },
      async logout() {
        forgetKey();
        await api.post('/api/auth/logout').catch(() => {});
        setUser(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
