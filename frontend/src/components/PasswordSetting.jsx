import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { setPassword } from '../keys/account.js';
import KeyGate from './KeyGate.jsx';

// Your password backup, on or off (accounts-change.md): your 24 words or your
// private key always sign you in; with a password, your key is also kept on the
// server locked under it, so the password alone signs you in. Setting, changing
// or turning it off is signed by the key in this tab (no writing, no old password).
export default function PasswordSetting() {
  const { user, signedIn } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const on = !!user.passwordBackup;
  return (
    <div className="stack password-setting">
      <p>
        Password backup: <strong>{on ? 'on' : 'off'}</strong>.{' '}
        {!open && (
          <button type="button" className="quiet" onClick={() => setOpen(true)}>
            {on ? 'Change or turn off' : 'Add one'}
          </button>
        )}
      </p>
      <p className="muted">
        {on
          ? 'You sign in with this password, or your 24 words, or your private key. Your key is kept on the server locked under the password; every guess at it is counted.'
          : 'You sign in with your 24 words or your private key. A password would let you sign in with it alone: your key, locked under it, kept on the server.'}
      </p>
      {open && (
        <KeyGate>
          {(writer) => (
            <Change
              writer={writer}
              on={on}
              onDone={async () => {
                setOpen(false);
                signedIn((await api.get('/api/auth/me')).user);
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </KeyGate>
      )}
    </div>
  );
}

function Change({ writer, on, onDone, onCancel }) {
  const [turnOff, setTurnOff] = useState(false);
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ready = turnOff || (next.length >= 8 && next === next2);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setPassword(writer, turnOff ? '' : next);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack card" onSubmit={save}>
      {on && (
        <label className="choice">
          <input type="checkbox" checked={turnOff} onChange={(e) => setTurnOff(e.target.checked)} /> Turn the password off
        </label>
      )}
      {!turnOff && (
        <>
          <label htmlFor="pw-next">{on ? 'New password' : 'Password'}</label>
          <input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} />
          <label htmlFor="pw-next2">Again</label>
          <input id="pw-next2" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
          {next2 && next !== next2 && <p className="meta">The two are not the same.</p>}
        </>
      )}
      <div className="row">
        <button type="button" className="quiet" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary" disabled={!ready || busy}>
          {busy ? 'Locking your key…' : turnOff ? 'Turn it off' : 'Save'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
