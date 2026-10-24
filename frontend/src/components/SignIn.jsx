import { useState } from 'react';
import { signIn } from '../keys/account.js';
import Hand from './Hand.jsx';

const WAYS = [
  ['password', 'Password'],
  ['words', '24 words'],
  ['key', 'Private key'],
];

// Sign in (accounts-change.md): your username, then your password, your 24
// words or your private key. No writing. `unlock` (with the name fixed) opens
// the key in a tab that is signed in but does not hold it.
export default function SignIn({ onDone, presetName = '', unlock = false }) {
  const [username, setUsername] = useState(presetName);
  const [way, setWay] = useState('password');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!username || !secret) return;
    setBusy(true);
    setError(null);
    try {
      const user = await signIn(way === 'password' ? { username, password: secret } : way === 'words' ? { username, words: secret } : { username, privateKey: secret });
      onDone?.(user);
    } catch (err) {
      setError(err.status === 404 ? 'There is no one by that name.' : err.message);
      if (err.code === 'no_password') setWay('words');
    } finally {
      setBusy(false);
    }
  }

  async function fromFile(e) {
    const f = e.target.files?.[0];
    if (f) setSecret((await f.text()).trim());
  }

  return (
    <form className="stack card auth signin" onSubmit={submit}>
      <h2>
        <Hand>{unlock ? 'Unlock to write' : 'log in'}</Hand>
      </h2>
      {unlock && <p className="muted">This tab does not hold your key yet. Open it here with your password, your words or your private key.</p>}
      {!unlock && (
        <>
          <label className="auth-field" htmlFor="in-name">
            <Hand>username</Hand>
          </label>
          <input id="in-name" value={username} onChange={(e) => setUsername(e.target.value.trim())} autoComplete="username" required />
        </>
      )}
      <div className="row sign-in-ways" role="tablist" aria-label="Sign in with">
        {WAYS.map(([w, label]) => (
          <button
            key={w}
            type="button"
            role="tab"
            aria-selected={way === w}
            className={way === w ? 'primary' : 'quiet'}
            onClick={() => {
              setWay(w);
              setSecret('');
              setError(null);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {way === 'password' && (
        <>
          <label className="auth-field" htmlFor="in-pw">
            <Hand>password</Hand>
          </label>
          <input id="in-pw" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="current-password" required />
        </>
      )}
      {way === 'words' && (
        <>
          <label className="auth-field" htmlFor="in-words">
            your 24 words
          </label>
          <textarea id="in-words" rows={3} value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} required />
        </>
      )}
      {way === 'key' && (
        <>
          <label className="auth-field" htmlFor="in-key">
            your private key
          </label>
          <input id="in-key" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" spellCheck={false} placeholder="penpals-key-1:…" required />
          <label className="meta">
            or from its file: <input type="file" accept=".txt,text/plain" onChange={fromFile} />
          </label>
        </>
      )}
      <button className="primary" disabled={busy || !secret || !username}>
        {busy ? 'Opening…' : unlock ? 'Unlock' : <Hand>Log in</Hand>}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
