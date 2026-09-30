import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function AuthForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

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
    <form className="stack card" onSubmit={submit}>
      <div className="row">
        <label><input type="radio" checked={mode === 'login'} onChange={() => setMode('login')} /> log in</label>
        <label><input type="radio" checked={mode === 'register'} onChange={() => setMode('register')} /> register</label>
      </div>
      <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
      <input
        placeholder="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        required
      />
      <button disabled={busy}>{mode === 'login' ? 'Log in' : 'Create account'}</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
