import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { kb } from '../format.js';
import LetterView from '../components/LetterView.jsx';
import SendControl from '../components/SendControl.jsx';
import ScripterInput from '../components/ScripterInput.jsx';
import PhotoSource from '../components/PhotoSource.jsx';
import Pad from '../components/Pad.jsx';
import { PAPERS } from '../ink/index.js';

// Make a letter from a photographed page or the drawing pad, then save it to
// your profile, or save and send it in one go. `/write/:username` fills in the name.
export default function Write() {
  const { username: presetTo = '' } = useParams();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState('photo'); // 'photo' | 'pad'
  const [result, setResult] = useState(null); // see PhotoSource / Pad for the shape
  const [inkColor, setInkColor] = useState(null); // null = detected (photo) or default
  const [paper, setPaper] = useState('plain');
  const [to, setTo] = useState(presetTo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null); // the letter once it is on the server
  const [kept, setKept] = useState(true);
  const [session, setSession] = useState(0); // bumps to remount the source for "write another"

  const color = inkColor ?? result?.detectedColor ?? '#1a1a1a';

  function switchMode(next) {
    setMode(next);
    setResult(null);
    setInkColor(null);
    setError(null);
  }

  async function save(recipient) {
    if (!result) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('inkColor', color);
      form.append('paper', paper);
      form.append('source', result.source);
      form.append('display', result.display);
      form.append('playable', result.playable === false ? '0' : '1');
      if (recipient) form.append('to', recipient);
      form.append('ink', result.png, 'ink.png');
      if (result.strokesBlob) form.append('strokes', result.strokesBlob, 'letter.strokes');
      const d = await api.upload('/api/letters', form);
      setSaved(d.letter);
      setKept(d.kept);
    } catch (err) {
      const when = err.data?.retryAt ? ` Try again after ${new Date(err.data.retryAt).toLocaleTimeString()}.` : '';
      setError(err.message + when);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setSaved(null);
    setError(null);
    setInkColor(null);
    setSession((s) => s + 1);
  }

  if (loading) return null;
  if (!user) return <p>Log in first to write a letter.</p>;

  if (saved) {
    return (
      <div className="stack">
        <h1>{saved.sentAt ? `Sent to @${saved.to}` : 'On your profile'}</h1>
        <p className="muted">
          {saved.strokesUrl ? `${saved.strokeCount} strokes, ${kb(saved.strokesBytes)}` : kb(saved.bytes)} · loaded back from the server, exactly as a recipient sees it
        </p>
        {!kept && <p className="muted">Your profile is full, so no copy was kept there.</p>}
        <LetterView letter={saved} />
        <SendControl letter={saved} defaultTo={presetTo} onSent={setSaved} />
        <p>
          <Link to={`/u/${user.username}`}>your profile</Link> ·{' '}
          <button type="button" onClick={reset}>write another</button>
        </p>
      </div>
    );
  }

  const summary = result
    ? [
      `ink ${kb(result.png.size)}`,
      result.strokesBlob && `strokes ${kb(result.strokesBlob.size)} (${result.strokeCount} strokes)`,
      result.sourceBytes && `photo was ${kb(result.sourceBytes)}`,
      `${result.ms} ms`,
    ].filter(Boolean).join(' · ')
    : mode === 'photo' ? 'Pick a photo to see the letter here.' : 'Draw something to see the letter here.';

  return (
    <>
      <h1>Write</h1>
      <div className="row">
        <button type="button" disabled={mode === 'photo'} onClick={() => switchMode('photo')}>Photograph a page</button>
        <button type="button" disabled={mode === 'pad'} onClick={() => switchMode('pad')}>Draw on screen</button>
      </div>

      {mode === 'photo' ? <PhotoSource key={session} onResult={setResult} /> : <Pad key={session} onResult={setResult} />}

      <h2>Letter</h2>
      <div className="row">
        <label>
          Ink colour <input type="color" value={color} onChange={(e) => setInkColor(e.target.value)} />
        </label>
        {inkColor && result?.detectedColor && <button type="button" onClick={() => setInkColor(null)}>use detected</button>}
        <label>
          Paper{' '}
          <select value={paper} onChange={(e) => setPaper(e.target.value)}>
            {Object.entries(PAPERS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <p className="muted">{summary}</p>
      {result && (
        <LetterView
          letter={{
            inkUrl: result.png,
            strokesData: result.strokesData,
            display: result.display,
            source: result.source,
            playable: result.playable,
            guides: result.guides,
            inkColor: color,
            paper,
          }}
        />
      )}

      <div className="row">
        <button type="button" disabled={!result || saving} onClick={() => save('')}>
          {saving ? 'Saving…' : 'Save to my profile'}
        </button>
        <span className="muted">or</span>
        <label>
          send to <ScripterInput id="write-to" value={to} onChange={setTo} />
        </label>
        <button type="button" disabled={!result || saving || !to} onClick={() => save(to)}>
          Save &amp; send
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}
