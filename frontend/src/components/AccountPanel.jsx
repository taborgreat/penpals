import { useEffect, useState } from 'react';
import { keys as K } from 'penpals-law';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { setPassword, signOutEverywhere } from '../keys/account.js';
import KeyGate from './KeyGate.jsx';

// Your account, at the corner of your own house (one-world.md, the panel's
// rulings): the password backup, your keys, and signing out here or everywhere.
// Each is signed by the key in this tab (accounts-change.md); without it, unlock first.
export default function AccountPanel() {
  return <KeyGate>{(key) => <Account key={key.publicKey} writer={key} />}</KeyGate>;
}

function Account({ writer }) {
  const { user, signedIn, logout } = useAuth();
  const [changing, setChanging] = useState(false);
  const [shown, setShown] = useState(false); // the words and the private key, on screen
  const [error, setError] = useState(null);
  const on = !!user?.passwordBackup;
  // whether your house is private: only you come into it and see its book (rooms.md §4; one-world.md keeps it)
  const [closed, setClosed] = useState(null);
  useEffect(() => {
    api
      .get('/api/social')
      .then((d) => setClosed(!!d.private))
      .catch(() => {});
  }, []);
  const shut = async (value) => {
    setError(null);
    try {
      setClosed((await api.post('/api/social/private', { private: value })).private);
    } catch (err) {
      setError(err.message);
    }
  };
  const everywhere = async () => {
    if (!window.confirm('Sign out on every device, this one too?')) return;
    setError(null);
    try {
      await signOutEverywhere(writer);
      await logout();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="stack account-panel">
      <section className="stack">
        <p>
          Password backup: <strong>{on ? 'on' : 'off'}</strong>.{' '}
          {!changing && (
            <button type="button" className="quiet" onClick={() => setChanging(true)}>
              {on ? 'Change or turn off' : 'Add one'}
            </button>
          )}
        </p>
        <p className="muted">
          {on
            ? 'You sign in with this password, or your 24 words, or your private key. Your key is kept on the server locked under the password; every guess at it is counted.'
            : 'You sign in with your 24 words or your private key. A password would let you sign in with it alone: your key, locked under it, kept on the server.'}
        </p>
        {changing && (
          <Change
            writer={writer}
            on={on}
            onDone={async () => {
              setChanging(false);
              signedIn((await api.get('/api/auth/me')).user);
            }}
            onCancel={() => setChanging(false)}
          />
        )}
      </section>
      <section className="stack">
        <p className="meta fingerprint" title={`Your public key: ${writer.publicKey}`}>
          key · {writer.fingerprint}
        </p>
        <p className="meta key-text">{writer.publicKey}</p>
        {shown ? (
          <>
            <p className="muted">Anyone with these is you. Keep them somewhere only you can reach.</p>
            <p className="key-words">{K.wordsOf(writer.K)}</p>
            <p className="key-text">{K.privateKeyText(writer.K)}</p>
            <button type="button" className="quiet" onClick={() => setShown(false)}>
              Hide them
            </button>
          </>
        ) : (
          <button type="button" className="quiet" onClick={() => setShown(true)}>
            Show your 24 words and private key
          </button>
        )}
      </section>
      {closed !== null && (
        <section className="stack">
          <p>
            Your house: <strong>{closed ? 'private' : 'open'}</strong>.{' '}
            <button type="button" className="quiet" onClick={() => shut(!closed)}>
              {closed ? 'Open it' : 'Make it private'}
            </button>
          </p>
          <p className="muted">{closed ? 'Only you come into it and read its book; others see its closed door.' : 'Anyone may walk in through its door and read its book.'}</p>
        </section>
      )}
      <p className="row">
        <button type="button" className="quiet logout" onClick={logout} title="Ends this device's session">
          Sign out here
        </button>
        <button type="button" className="quiet" onClick={everywhere} title="Ends every session of this account">
          Sign out everywhere
        </button>
      </p>
      {error && <p className="error">{error}</p>}
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
    <form className="stack" onSubmit={save}>
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
