import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { kb } from '../format.js';
import LetterView from '../components/LetterView.jsx';
import SendControl from '../components/SendControl.jsx';
import ScripterInput from '../components/ScripterInput.jsx';
import PhotoSource from '../components/PhotoSource.jsx';
import Pad from '../components/Pad.jsx';
import Hand from '../components/Hand.jsx';
import { PAPERS } from '../ink/index.js';
import { paperCss } from '../ink/paper.js';

// Make a letter from a photographed page or the drawing pad, then save it to
// your profile, or save and send it in one go. `/write/:username` fills in the name.
export default function Write() {
  const { username: presetTo = '' } = useParams();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState('pad'); // 'pad' | 'photo'
  const [result, setResult] = useState(null); // see PhotoSource / Pad for the shape; null while not ready
  const [preview, setPreview] = useState(null); // the last finished result, shown while the next one is made
  const [inkColor, setInkColor] = useState(null); // null = detected (photo) or default
  const [paper, setPaper] = useState('parchment');
  const [to, setTo] = useState(presetTo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null); // the letter once it is on the server
  const [kept, setKept] = useState(true);
  const [session, setSession] = useState(0); // bumps to remount the source for "write another"

  const color = inkColor ?? (result ?? preview)?.detectedColor ?? '#1a1a1a';

  // Sources report null while they work; the preview keeps the last letter
  // until the next is ready (no blinking), and clears only when told it's empty.
  const onResult = useCallback((next, empty = false) => {
    setResult(next);
    if (next) setPreview(next);
    else if (empty) setPreview(null);
  }, []);

  // After write mode plays the letter: straight on to saving and sending it.
  const toLetter = useCallback(() => {
    requestAnimationFrame(() => document.getElementById('letter')?.scrollIntoView({ block: 'start' }));
  }, []);

  function switchMode(next) {
    setMode(next);
    setResult(null);
    setPreview(null);
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
    setPreview(null);
    setSaved(null);
    setError(null);
    setInkColor(null);
    setSession((s) => s + 1);
  }

  if (loading) return null;
  if (!user) return <p>Log in first to write a letter.</p>;

  if (saved) {
    return (
      <div className="stack narrow">
        <h1>{saved.sentAt ? `Sent to @${saved.to}` : 'On your profile'}</h1>
        <p className="meta">
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

  const summary = !preview ? null : !result ? 'updating…' : [
    `ink ${kb(result.png.size)}`,
    result.strokesBlob && `strokes ${kb(result.strokesBlob.size)} (${result.strokeCount} strokes)`,
    result.sourceBytes && `photo was ${kb(result.sourceBytes)}`,
    `${result.ms} ms`,
  ].filter(Boolean).join(' · ');
  const empty = mode === 'photo' ? 'Pick a photo and your letter appears here.' : 'Start writing and your letter appears here.';

  return (
    <div className={`write ${mode}`}>
      <h1 className="sr-only">Write a letter</h1>
      <div className="write-head">
        <div className="tabs" role="group" aria-label="How to write">
          <button type="button" aria-pressed={mode === 'pad'} onClick={() => switchMode('pad')}>Draw on screen</button>
          <button type="button" aria-pressed={mode === 'photo'} onClick={() => switchMode('photo')}>Photograph a page</button>
        </div>
        <a href="#letter" className="jump"><Hand>Preview, download &amp; send ↓</Hand></a>
      </div>

      <section className="write-source">
        {mode === 'photo' ? <PhotoSource key={session} onResult={onResult} /> : <Pad key={session} onResult={onResult} inkColor={color} paper={paper} onPaperChange={setPaper} onWritten={toLetter} />}
      </section>

      <section className="letter-section" id="letter">
        <h2><Hand>Your letter</Hand></h2>
        <div className="row">
          <label className="field">
            <span>Ink</span>
            <input type="color" value={color} onChange={(e) => setInkColor(e.target.value)} />
          </label>
          {inkColor && result?.detectedColor && <button type="button" className="quiet" onClick={() => setInkColor(null)}>use detected</button>}
          <label className="field">
            <span>Paper</span>
            <select value={paper} onChange={(e) => setPaper(e.target.value)}>
              {Object.entries(PAPERS).map(([id, p]) => <option key={id} value={id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {preview ? (
          <LetterView
            letter={{
              inkUrl: preview.png,
              strokesData: preview.strokesData,
              display: preview.display,
              source: preview.source,
              playable: preview.playable,
              guides: preview.guides,
              inkColor: color,
              paper,
              from: user.username,
            }}
          />
        ) : (
          <div className="preview-empty" style={{ background: paperCss(paper) }}>{empty}</div>
        )}
        {summary && <p className="meta">{summary}</p>}

        <div className="send-box">
          <button type="button" className="primary" disabled={!result || saving} onClick={() => save('')}>
            {saving ? 'Saving…' : 'Save to my profile'}
          </button>
          <span className="or">or send it</span>
          <div className="row">
            <ScripterInput id="write-to" value={to} onChange={setTo} />
            <button type="button" className="seal" disabled={!result || saving || !to} onClick={() => save(to)}>
              Save &amp; send
            </button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
