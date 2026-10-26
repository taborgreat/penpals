import { useEffect, useMemo, useRef, useState } from 'react';
import { keys as K, record as R } from 'penpals-law';
import { api } from '../api.js';
import { keyFromK, newSheet } from '../keys/session.js';
import { register, makeKey, settleOn } from '../keys/account.js';
import { placeHouse } from '../room/world.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import { CELLS } from '../ink/live.js';
import { padPen } from '../ink/padPen.js';
import PenPanel, { usePen } from './PenPanel.jsx';
import Hand from './Hand.jsx';

const FAMILY = R.SIGNING_FAMILY; // the paper you sign on, and your book's first (changeable later)
export const SIGN_PAD = { width: 520, height: 200 }; // the slip on the lobby's table: small, so the eye is close and the ink big (a first taste of it)

// Making an account (accounts-change.md):
//   1. sign your name three times, on a paper grown from fresh randomness made
//      on this device as you begin; the key is made from that randomness and how
//      the three signatures settled, by the law, on that paper
//   2. choose your username
//   3. keep your key: the 24 words and the private key, shown once; a password
//      backup if you want one (the key locked on the server under it)
// The last signature, settled again on the key's own paper, is the first sheet
// of your book (public). The server gets the public key, that sheet, and with a
// password the locked keyring; never the key, the words, the randomness or the password.
// The signing is in the world (one-world.md): the paper is the slip on the lobby's table, the pen in
// your hand, and `onSheet({ scene, writer } | null)` hands that live sheet and the pen on it to the
// lobby's scene; this form holds only the pen's panel and the steps.
export default function Register({ onDone, onSheet }) {
  const [step, setStep] = useState('sign');
  const [r32] = useState(() => K.newR32()); // made as the signing begins
  const paper0 = useMemo(() => K.provisionalPaperKey(r32), [r32]);
  const [signatures, setSignatures] = useState([]); // the acts of each signature, as written
  const [Kbytes, setKbytes] = useState(null);
  const [username, setUsername] = useState('');
  const [nameState, setNameState] = useState(null); // null | 'checking' | 'free' | 'taken' | 'bad'
  const [kept, setKept] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [backup, setBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [n, setN] = useState(0); // bumps for a fresh pad
  const [strokes, setStrokes] = useState(0);

  const ink = useLiveInk(step === 'sign' ? { paperKey: paper0, family: FAMILY, size: SIGN_PAD } : null, `sign-${signatures.length}-${n}`);
  // the pen in your hand writes on it; the slip lies on the lobby's table, drawn in its scene
  const pen = usePen();
  useEffect(() => {
    setStrokes(0);
    if (!ink) return undefined;
    ink.scene?.(true);
    return ink.onChange(() => setStrokes(ink.strokes));
  }, [ink]);
  useEffect(() => {
    if (!ink) return;
    ink.setPen(pen.lawPen(ink.law));
    ink.capture.setFlex(pen.flexOf(ink.law));
  }, [ink, pen]);
  const live = useRef(null);
  live.current = { ink, paper: { size: SIGN_PAD, origin: [0, 0] } };
  const writer = useMemo(() => padPen(() => live.current, pen), [pen]);
  const onSheetRef = useRef(onSheet);
  onSheetRef.current = onSheet;
  useEffect(() => {
    onSheetRef.current?.(
      ink ? { scene: { id: `sign:${ink.law}:${signatures.length}-${n}`, box: [0, 0, SIGN_PAD.width * CELLS, SIGN_PAD.height * CELLS], origin: [0, 0], cellPx: 1 / CELLS, live: ink }, writer } : null,
    );
  }, [ink, writer]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onSheetRef.current?.(null), []);

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

  const words = useMemo(() => (Kbytes ? K.wordsOf(Kbytes) : ''), [Kbytes]);
  const privateKey = useMemo(() => (Kbytes ? K.privateKeyText(Kbytes) : ''), [Kbytes]);
  const passwordOk = !backup || (password.length >= 8 && password === password2);

  async function signed() {
    setBusy(true);
    setError(null);
    try {
      const acts = ink.acts();
      if (!acts) throw new Error('Sign your name first.');
      const all = [...signatures, acts];
      setSignatures(all);
      setStrokes(0);
      if (all.length === K.SIGNATURES) {
        setKbytes(await makeKey(r32, all));
        setStep('name');
      }
    } catch (err) {
      setSignatures([]); // (the key takes all three: they are signed again)
      setError(/no ink/.test(err.message) ? 'One of the signatures held no ink once it dried. Sign all three again.' : err.message);
      setN((v) => v + 1);
    } finally {
      setBusy(false);
    }
  }

  async function finish(e) {
    e.preventDefault();
    if (!kept || !passwordOk) return;
    setBusy(true);
    setError(null);
    try {
      const key = keyFromK(username, Kbytes);
      // the last signature again, on the key's own paper: sheet 0
      const sheet0 = newSheet(key, K.SHEET_ZERO);
      const settled = await settleOn(signatures[K.SIGNATURES - 1], sheet0.seed, FAMILY);
      const user = await register({ key, username, password: backup ? password : '', signature: { family: FAMILY, seed: sheet0.seed, settled } });
      await placeHouse(key).catch(() => {}); // your house drops near the start (one-world.md); if not now, when you are next in
      onDone?.(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([`${privateKey}\n`], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `penpals-key-${username || 'account'}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <div className="stack card auth register">
      <h2>
        <Hand>Make an account</Hand>
      </h2>
      <ol className="steps" aria-label="Steps">
        {['sign', 'name', 'keep'].map((s, i) => (
          <li key={s} aria-current={step === s ? 'step' : undefined}>
            {i + 1}
          </li>
        ))}
      </ol>

      {step === 'sign' && (
        <div className="stack">
          <p>
            Sign your name, three times, on the paper in front of you: the pen is in your hand. The ink is live: watch it bead, sink and dry. Your key is made from how these three settle on this
            paper, and the last one becomes the first page of your book, for everyone to see.
          </p>
          <p className="meta">
            Signature {signatures.length + 1} of {K.SIGNATURES} · {strokes} stroke{strokes === 1 ? '' : 's'}
          </p>
          <PenPanel pen={pen} law={ink?.law ?? 2} />
          <div className="row">
            <button type="button" className="quiet" disabled={!strokes || busy} onClick={() => ink?.undo()}>
              Undo
            </button>
            <button type="button" className="primary" disabled={!strokes || busy} onClick={signed}>
              {busy ? (signatures.length === K.SIGNATURES - 1 ? 'Making your key…' : 'Drying…') : 'Done'}
            </button>
          </div>
        </div>
      )}

      {step === 'name' && (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (nameState === 'free') setStep('keep');
          }}
        >
          <p>Your key is made. Now choose your username.</p>
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

      {step === 'keep' && (
        <form className="stack" onSubmit={finish}>
          <p>
            <strong>Keep your key.</strong> These 24 words are your key; so is the private key below. Either one signs you in from anywhere, and nobody, not even this site, can give them back if they
            are lost. Write the words down, or keep the private key somewhere safe. They are shown only now.
          </p>
          <ol className="key-words" aria-label="Your 24 words">
            {words.split(' ').map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ol>
          <label className="auth-field" htmlFor="reg-private">
            private key
          </label>
          <input id="reg-private" className="private-key" value={privateKey} readOnly onFocus={(e) => e.target.select()} />
          <div className="row">
            <button type="button" className="quiet" onClick={() => navigator.clipboard?.writeText(privateKey)}>
              Copy
            </button>
            <button type="button" className="quiet" onClick={download}>
              Download
            </button>
          </div>
          <label className="choice">
            <input type="checkbox" checked={kept} onChange={(e) => setKept(e.target.checked)} /> I have kept my words or my private key
          </label>
          <label className="choice">
            <input type="checkbox" checked={backup} onChange={(e) => setBackup(e.target.checked)} /> Also sign in with a password
          </label>
          <p className="muted">
            {backup
              ? 'Your key is locked under the password and kept on the server; every guess at it goes through the server, which counts them. The password never leaves this device.'
              : 'Without one, the server holds only your public key: your words or your private key sign you in. You can add a password later in your account.'}
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
            <button type="button" className="quiet" onClick={() => setStep('name')}>
              Back
            </button>
            <button className="primary" disabled={!kept || !passwordOk || busy}>
              {busy ? 'Making your account…' : 'Make my account'}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
