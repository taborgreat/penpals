import { useState } from 'react';
import { v1 } from 'penpals-law';
import { signIn, NOT_OPENED } from '../keys/account.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import Pad from './Pad.jsx';
import Hand from './Hand.jsx';

const PHRASE_PAD = { width: 1000, height: 420 };
const PAGE_PAD = { width: 1400, height: 905 };
const CALIBRATION = { paperKey: v1.calibrationPaperKey(), family: v1.CALIBRATION_FAMILY, law: 1 }; // the hand is read under law 1

// Sign in: write your secret phrase (and type your password, if the account has a backup). `unlock` (with the
// name fixed) opens the key in a tab that is signed in but does not hold it.
// A wrong password and a wrong phrase fail alike. If the phrase stops working,
// the calibration page written out in full opens it too (and the phrase as you
// write it now becomes a new rhythm).
export default function SignIn({ onDone, presetName = '', unlock = false }) {
  const [username, setUsername] = useState(presetName);
  const [password, setPassword] = useState('');
  const [usePage, setUsePage] = useState(false);
  const [failedPhrase, setFailedPhrase] = useState(null);
  const [strokes, setStrokes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [n, setN] = useState(0);
  const [ask, setAsk] = useState(false); // the account turned out to want its password
  const ink = useLiveInk({ ...CALIBRATION, size: usePage ? PAGE_PAD : PHRASE_PAD }, `${usePage}-${n}`);

  async function submit(e) {
    e.preventDefault();
    if (!ink || !strokes) return;
    setBusy(true);
    setError(null);
    try {
      const acts = ink.acts();
      const user = await signIn(usePage
        ? { username, password, pageActs: acts, failedPhrase }
        : { username, password, phraseActs: acts });
      onDone?.(user);
    } catch (err) {
      setError(err.status === 404 ? 'There is no one by that name.' : err.message);
      if (err.code === 'needs_password') {
        setAsk(true); // keep the writing: only the password is missing
        document.getElementById('in-pw')?.focus();
        return;
      }
      if (!usePage && err.code === 'not_opened') setFailedPhrase(ink.acts());
      setN((v) => v + 1);
      setStrokes(0);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack card auth signin" onSubmit={submit}>
      <h2><Hand>{unlock ? 'Unlock to write' : 'log in'}</Hand></h2>
      {unlock && <p className="muted">This tab does not hold your key yet. Write your phrase to open it here.</p>}
      {!unlock && (
        <>
          <label className="auth-field" htmlFor="in-name"><Hand>username</Hand></label>
          <input id="in-name" value={username} onChange={(e) => setUsername(e.target.value.trim())} autoComplete="username" required />
        </>
      )}
      <p>{usePage ? <>Copy out the calibration page:</> : <>Write your phrase:</>}</p>
      {usePage && <blockquote className="calibration-text">{v1.CALIBRATION_TEXT}</blockquote>}
      {ink && <Pad key={`${usePage}-${n}`} ink={ink} size={usePage ? PAGE_PAD : PHRASE_PAD} chase prompt={usePage ? v1.CALIBRATION_TEXT : null} onChange={setStrokes} hint={usePage ? 'Copy the text above.' : 'Write your phrase as you always do.'} />}
      <label className="auth-field" htmlFor="in-pw"><Hand>password</Hand> {!ask && <span className="meta">(only if you set one)</span>}</label>
      <input id="in-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required={ask} />
      <button className="primary" disabled={busy || !strokes || !username || (ask && !password)}>{busy ? 'Opening…' : unlock ? 'Unlock' : <Hand>Log in</Hand>}</button>
      {error && <p className="error" role="alert">{error}</p>}
      {error === NOT_OPENED && !usePage && (
        <p className="meta">
          Still no luck? <button type="button" className="quiet" onClick={() => { setUsePage(true); setError(null); setN((v) => v + 1); }}>Write the calibration page instead</button>
        </p>
      )}
      {usePage && <p className="meta"><button type="button" className="quiet" onClick={() => { setUsePage(false); setN((v) => v + 1); }}>Back to the phrase</button></p>}
    </form>
  );
}
