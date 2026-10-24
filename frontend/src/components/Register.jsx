import { useEffect, useMemo, useState } from 'react';
import { keys as K, v1 } from 'penpals-law';
import { api } from '../api.js';
import { keyFromK, newSheet } from '../keys/session.js';
import { register, readingOf, enrolCheck } from '../keys/account.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import Pad from './Pad.jsx';
import Hand from './Hand.jsx';

const FAMILY = Object.freeze({ grain: 8, weight: 8, tooth: 0 }); // the paper your book starts on (changeable later)
const PHRASE_PAD = { width: 1000, height: 420 };
const NAME_PAD = { width: 760, height: 300 };
const PAGE_PAD = { width: 1400, height: 905 };
const CALIBRATION = { paperKey: v1.calibrationPaperKey(), family: v1.CALIBRATION_FAMILY, law: 1 }; // the hand is read under law 1

// Making an account (keys.md, design B). Six steps, all on this device until
// the last: a name; a password backup, or none; your secret login phrase, written three
// times; your name, signed (the first sheet of your book, public); and the
// calibration page (private). Then the device makes your key and locks it with
// your hand (and the password, if you chose one); the server gets the public key, the locked
// keyring, and the sketches, never the key, the password or the phrase.
// (This is long on purpose, for the experiment; keys.md says so.)
export default function Register({ onDone }) {
  const [step, setStep] = useState('name');
  const [username, setUsername] = useState('');
  const [nameState, setNameState] = useState(null); // null | 'checking' | 'free' | 'taken' | 'bad'
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [backup, setBackup] = useState(false); // a password as well as the hand (the writer's choice)
  const [phrases, setPhrases] = useState([]); // readings of the phrase
  const [signature, setSignature] = useState(null); // { family, seed, settled }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [n, setN] = useState(0); // bumps for a fresh pad
  const [loose, setLoose] = useState(null); // three writings further apart than a sketch tolerates

  // The key is made once, here: the name is signed with it before the account exists.
  const key = useMemo(() => (step === 'sign' || signature ? keyFromK(username, K.newK()) : null), [step === 'sign' || !!signature]); // eslint-disable-line react-hooks/exhaustive-deps
  const sheet0 = useMemo(() => (key ? newSheet(key, K.SHEET_ZERO) : null), [key]);

  const padSpec =
    step === 'phrase'
      ? { ...CALIBRATION, size: PHRASE_PAD }
      : step === 'sign' && sheet0
        ? { paperKey: sheet0.paperKey, family: FAMILY, size: NAME_PAD }
        : step === 'page'
          ? { ...CALIBRATION, size: PAGE_PAD }
          : null;
  const ink = useLiveInk(padSpec, `${step}-${n}`);
  const [strokes, setStrokes] = useState(0);

  useEffect(() => {
    if (!username) return setNameState(null);
    setNameState('checking');
    const t = setTimeout(() => {
      api
        .get(`/api/auth/name/${encodeURIComponent(username)}`)
        .then((d) => setNameState(!d.valid ? 'bad' : d.free ? 'free' : 'taken'))
        .catch(() => setNameState(null));
    }, 250);
    return () => clearTimeout(t);
  }, [username]);

  const passwordOk = !backup || (password.length >= 8 && password === password2);
  const next = (s) => {
    setError(null);
    setStrokes(0);
    setStep(s);
  };

  async function phraseDone() {
    setBusy(true);
    setError(null);
    try {
      const reading = await readingOf('phrase', ink.acts());
      const all = [...phrases, reading];
      if (all.length < 3) {
        setPhrases(all);
        setN((v) => v + 1);
        setStrokes(0);
      } else {
        const check = enrolCheck('phrase', all);
        if (!check.ok) {
          setLoose(all);
          setError(
            `Those three differ more than a sketch tolerates (${check.spread} bits apart; it opens within ${check.radius}). Write it three more times the way you will each time you sign in, or keep these: signing in may then take a few tries, and the calibration page always works.`,
          );
        } else {
          setPhrases(all);
          next('sign');
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function signDone() {
    setBusy(true);
    setError(null);
    try {
      const settled = await ink.settle();
      if (!settled || !settled.box[2]) throw new Error('Sign your name first.');
      setSignature({ family: FAMILY, seed: sheet0.seed, settled });
      next('page');
    } catch (err) {
      setError(err.law ? 'That is more ink than a signature can hold. Clear it and sign again.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  async function pageDone() {
    setBusy(true);
    setError(null);
    try {
      const pageReading = await readingOf('page', ink.acts());
      setStep('making');
      const user = await register({ key, username, password: backup ? password : '', phraseReadings: phrases, pageReading, signature });
      onDone?.(user);
    } catch (err) {
      setStep('page');
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack card auth register">
      <h2>
        <Hand>Make an account</Hand>
      </h2>
      <ol className="steps" aria-label="Steps">
        {['name', 'password', 'phrase', 'sign', 'page'].map((s, i) => (
          <li key={s} aria-current={step === s ? 'step' : undefined}>
            {i + 1}
          </li>
        ))}
      </ol>

      {step === 'name' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameState === 'free') next('password');
          }}
        >
          <label className="auth-field" htmlFor="reg-name">
            <Hand>username</Hand>
          </label>
          <input id="reg-name" value={username} onChange={(e) => setUsername(e.target.value.trim())} autoComplete="username" maxLength={20} required />
          <p className="meta">
            {nameState === 'checking' && 'checking…'}
            {nameState === 'free' && 'free'}
            {nameState === 'taken' && 'taken'}
            {nameState === 'bad' && '2 to 20 letters, numbers or underscores'}
          </p>
          <button className="primary" disabled={nameState !== 'free'}>
            Next
          </button>
        </form>
      )}

      {step === 'password' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordOk) next('phrase');
          }}
        >
          <p>Your name, your secret phrase and the way you write it open your account. A password is an optional backup on top.</p>
          <label className="choice">
            <input type="radio" name="backup" checked={!backup} onChange={() => setBackup(false)} /> No password: my name and my hand
          </label>
          <label className="choice">
            <input type="radio" name="backup" checked={backup} onChange={() => setBackup(true)} /> Add a password backup
          </label>
          <p className="muted">
            {backup
              ? 'Then someone who learned your phrase and how you write it still needs the password, and so does anyone who ever got hold of the files on the server. It never leaves this device.'
              : 'Every guess at your hand is one the server answers and counts (5 an hour). But someone who learned your phrase and could write it like you would get in, and so could anyone who got hold of the files on the server and tried long enough. You can add a password later in your account.'}
          </p>
          {backup && (
            <>
              <label className="auth-field" htmlFor="reg-pw">
                <Hand>password</Hand>
              </label>
              <input id="reg-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
              <label className="auth-field" htmlFor="reg-pw2">
                again
              </label>
              <input id="reg-pw2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" required />
              {password2 && password !== password2 && <p className="meta">The two are not the same.</p>}
            </>
          )}
          <div className="row">
            <button type="button" className="quiet" onClick={() => next('name')}>
              Back
            </button>
            <button className="primary" disabled={!passwordOk}>
              Next
            </button>
          </div>
        </form>
      )}

      {step === 'phrase' && (
        <div className="stack">
          <p>
            Think of a short phrase only you know, four words or so. You will <strong>write</strong> it each time you sign in. Never type it anywhere, and never write it anywhere others can see: how
            you write it is part of your key, and it stays secret only as long as the phrase does.
          </p>
          <p className="meta">Writing {phrases.length + 1} of 3, as you normally would.</p>
          {loose ? (
            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setLoose(null);
                  setPhrases([]);
                  setN((v) => v + 1);
                  setStrokes(0);
                  setError(null);
                }}
              >
                Write it three more times
              </button>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setPhrases(loose);
                  setLoose(null);
                  next('sign');
                }}
              >
                Keep these
              </button>
            </div>
          ) : (
            <>
              {ink && <Pad key={`p${n}`} ink={ink} size={PHRASE_PAD} chase onChange={setStrokes} hint="Write your phrase on a line." />}
              <div className="row">
                <button
                  type="button"
                  className="quiet"
                  onClick={() => {
                    setPhrases([]);
                    next('password');
                  }}
                >
                  Back
                </button>
                <button type="button" className="primary" disabled={!strokes || busy} onClick={phraseDone}>
                  {busy ? 'Reading…' : 'Done'}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 'sign' && (
        <div className="stack">
          <p>
            Now sign your name, <strong>{username}</strong>. This is the first page of your book: everyone sees it, wherever your name shows.
          </p>
          {ink && <Pad key={`s${n}`} ink={ink} size={NAME_PAD} onChange={setStrokes} hint="Sign on a line." />}
          <div className="row">
            <button type="button" className="primary" disabled={!strokes || busy} onClick={signDone}>
              {busy ? 'Drying…' : 'Done'}
            </button>
          </div>
        </div>
      )}

      {(step === 'page' || step === 'making') && (
        <div className="stack">
          <p>Last: copy this out in your own hand. It stays on this device; if your phrase ever stops opening your key, writing this page again does.</p>
          <blockquote className="calibration-text">{v1.CALIBRATION_TEXT}</blockquote>
          {ink && <Pad key={`g${n}`} ink={ink} size={PAGE_PAD} chase prompt={v1.CALIBRATION_TEXT} onChange={setStrokes} hint="Copy the text above." />}
          <div className="row">
            <button type="button" className="primary" disabled={!strokes || busy || step === 'making'} onClick={pageDone}>
              {step === 'making' ? 'Making your key…' : 'Make my account'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
