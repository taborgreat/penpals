import { useState } from 'react';
import { v1 } from 'penpals-law';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { setPassword } from '../keys/account.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import KeyGate from './KeyGate.jsx';
import Pad from './Pad.jsx';

const PHRASE_PAD = { width: 1000, height: 420 };
const CALIBRATION = { paperKey: v1.calibrationPaperKey(), family: v1.CALIBRATION_FAMILY, law: 1 }; // the hand is read under law 1

// Your password backup, on or off (keys.md): your name, your phrase and your
// hand open your account; a password, if you add one, is needed as well.
// Changing it locks your key again, so it asks you to write your phrase first
// (and your current password, if there is one).
export default function PasswordSetting() {
  const { user, signedIn } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const on = !!user.passwordBackup;
  return (
    <div className="stack password-setting">
      <p>
        Password backup: <strong>{on ? 'on' : 'off'}</strong>.{' '}
        {!open && <button type="button" className="quiet" onClick={() => setOpen(true)}>{on ? 'Change or turn off' : 'Add one'}</button>}
      </p>
      <p className="muted">
        {on
          ? 'Signing in takes your phrase, your hand and this password.'
          : 'Signing in takes your phrase and your hand. Someone who learned your phrase and could write it like you would get in; a password stops them, and anyone who ever got hold of the server\'s files.'}
      </p>
      {open && (
        <KeyGate>
          {(writer) => <Change writer={writer} on={on} onDone={async () => { setOpen(false); signedIn((await api.get('/api/auth/me')).user); }} onCancel={() => setOpen(false)} />}
        </KeyGate>
      )}
    </div>
  );
}

function Change({ writer, on, onDone, onCancel }) {
  const [n, setN] = useState(0);
  const ink = useLiveInk({ ...CALIBRATION, size: PHRASE_PAD }, `pw-${n}`);
  const [strokes, setStrokes] = useState(0);
  const [current, setCurrent] = useState('');
  const [turnOff, setTurnOff] = useState(false);
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const wantsNew = !turnOff;
  const ready = strokes > 0 && (!on || current) && (!wantsNew || (next.length >= 8 && next === next2));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await setPassword(writer, { phraseActs: ink.acts(), current, next: wantsNew ? next : '' });
      onDone();
    } catch (err) {
      setError(err.message);
      if (err.code === 'not_opened') {
        setN((v) => v + 1);
        setStrokes(0);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack card" onSubmit={save}>
      <p>Write your phrase, as when you sign in:</p>
      {ink && <Pad key={n} ink={ink} size={PHRASE_PAD} onChange={setStrokes} hint="Your phrase, as you always write it." />}
      {on && (
        <>
          <label htmlFor="pw-current">Current password</label>
          <input id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          <label className="choice"><input type="checkbox" checked={turnOff} onChange={(e) => setTurnOff(e.target.checked)} /> Turn the password off</label>
        </>
      )}
      {wantsNew && (
        <>
          <label htmlFor="pw-next">{on ? 'New password' : 'Password'}</label>
          <input id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} />
          <label htmlFor="pw-next2">Again</label>
          <input id="pw-next2" type="password" value={next2} onChange={(e) => setNext2(e.target.value)} autoComplete="new-password" />
          {next2 && next !== next2 && <p className="meta">The two are not the same.</p>}
        </>
      )}
      <div className="row">
        <button type="button" className="quiet" onClick={onCancel}>Cancel</button>
        <button className="primary" disabled={!ready || busy}>{busy ? 'Locking your key again…' : turnOff ? 'Turn it off' : 'Save'}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
