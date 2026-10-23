import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import Hand from './Hand.jsx';

export default function AuthForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // The tabs change colour when chosen; tell their handwriting to follow.
  useEffect(() => {
    window.dispatchEvent(new Event('penpals:recolor'));
  }, [mode]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'login' ? login : register)(username, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack card auth" onSubmit={submit}>
      <div className="tabs auth-modes" role="group" aria-label="Log in or register">
        <button type="button" className="mode-login" aria-pressed={mode === 'login'} onClick={() => setMode('login')}><Hand>log in</Hand></button>
        <button type="button" className="mode-register" aria-pressed={mode === 'register'} onClick={() => setMode('register')}><Hand>register</Hand></button>
      </div>
      <label className="auth-field" htmlFor="auth-username"><Hand>username</Hand></label>
      <input id="auth-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      <label className="auth-field" htmlFor="auth-password"><Hand>password</Hand></label>
      <input
        id="auth-password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        required
      />
      <button className="primary" disabled={busy}>{mode === 'login' ? <Hand>Log in</Hand> : <Hand>Create account</Hand>}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
