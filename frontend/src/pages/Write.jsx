import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keys as K, record as R, b64url } from 'penpals-law';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { kb } from '../format.js';
import LetterView from '../components/LetterView.jsx';
import SendControl from '../components/SendControl.jsx';
import ScripterInput from '../components/ScripterInput.jsx';
import PhotoSource from '../components/PhotoSource.jsx';
import Pad, { PAGES } from '../components/Pad.jsx';
import Hand from '../components/Hand.jsx';
import KeyGate from '../components/KeyGate.jsx';
import { PAPERS } from '../ink/index.js';
import { paperCss } from '../ink/paper.js';
import { newSheet, sealInk } from '../keys/session.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import { CELLS } from '../ink/live.js';
import InkWell from '../ink/InkWell.jsx';

const PAGE_WIDTH = 1400;
const DEFAULT_FAMILY = { grain: 8, weight: 8, tooth: 0 };

// Make a letter on the pad or from a photographed page, then save it to your
// profile, or save and send it in one go. `/write/:username` fills in the name.
// Every letter is sealed by your key: a pad letter is a sheet of your paper
// (its own, kept private by the server, which grows its look); a photo letter's
// seal names the exact scan and traced strokes.
export default function Write() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <p>Log in first to write a letter.</p>;
  return <KeyGate>{(writer) => <Writer key={writer.publicKey} writer={writer} user={user} />}</KeyGate>;
}

function Writer({ writer, user }) {
  const { username: presetTo = '' } = useParams();
  const [mode, setMode] = useState('pad'); // 'pad' | 'photo'
  const [photo, setPhoto] = useState(null); // PhotoSource's result
  const [preview, setPreview] = useState(null);
  const [strokes, setStrokes] = useState(0);
  const [inkColor, setInkColor] = useState(null); // null = detected (photo) or default
  const [paper, setPaper] = useState('parchment');
  const [to, setTo] = useState(presetTo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(null); // the letter once it is on the server
  const [kept, setKept] = useState(true);
  const [session, setSession] = useState(0); // bumps for "write another": a new sheet
  const [family, setFamily] = useState(null);

  // Letters are written on your book's paper family (its fibers are each sheet's own).
  useEffect(() => {
    api
      .get(`/api/books/${encodeURIComponent(user.username)}`)
      .then((d) => setFamily(d.skeleton.paperFamily ?? DEFAULT_FAMILY))
      .catch(() => setFamily(DEFAULT_FAMILY));
  }, [user.username]);

  const sheet = useMemo(() => newSheet(writer), [writer, session]); // eslint-disable-line react-hooks/exhaustive-deps
  const ink = useLiveInk(mode === 'pad' && family ? { paperKey: sheet.paperKey, family, size: { width: PAGE_WIDTH, height: PAGES.full } } : null, `${sheet.sheet}-${mode}`);

  const color = inkColor ?? (photo ?? preview)?.detectedColor ?? '#1a1a1a';

  const onPhoto = useCallback((next, empty = false) => {
    setPhoto(next);
    if (next) setPreview(next);
    else if (empty) setPreview(null);
  }, []);

  // After write mode plays the letter: straight on to saving and sending it.
  const toLetter = useCallback(() => {
    requestAnimationFrame(() => document.getElementById('letter')?.scrollIntoView({ block: 'start' }));
  }, []);

  function switchMode(next) {
    setMode(next);
    setPhoto(null);
    setPreview(null);
    setInkColor(null);
    setError(null);
  }

  async function savePad(recipient) {
    const settled = await ink.settle();
    if (!settled?.box[2]) throw new Error('Write something first.');
    const { line } = sealInk(writer, { sheet: sheet.sheet, seed: sheet.seed, use: 'letter', family, settled });
    const bottom = Math.ceil((settled.box[1] + settled.box[3]) / CELLS) + 40;
    const page = { width: PAGE_WIDTH, height: Math.max(PAGES.half, Math.min(PAGES.full, bottom)) };
    return api.post('/api/letters', { line, seed: b64url(sheet.seed), background: paper, page, to: recipient, playable: true });
  }

  async function savePhoto(recipient) {
    const png = new Uint8Array(await photo.png.arrayBuffer());
    const strokesBytes = photo.strokesBlob ? new Uint8Array(await photo.strokesBlob.arrayBuffer()) : null;
    const { line } = R.makePhoto({ sk: writer.sk, pk: writer.pk, sheet: K.newSheetId(), size: [photo.width, photo.height], png, strokes: strokesBytes });
    const form = new FormData();
    form.append('inkColor', color);
    form.append('background', paper);
    form.append('display', photo.display);
    form.append('playable', photo.playable === false ? '0' : '1');
    if (recipient) form.append('to', recipient);
    form.append('line', JSON.stringify(line));
    form.append('ink', photo.png, 'ink.png');
    if (photo.strokesBlob) form.append('strokes', photo.strokesBlob, 'letter.strokes');
    return api.upload('/api/letters/photo', form);
  }

  async function save(recipient) {
    setSaving(true);
    setError(null);
    try {
      const d = await (mode === 'pad' ? savePad(recipient) : savePhoto(recipient));
      setSaved(d.letter);
      setKept(d.kept);
    } catch (err) {
      const when = err.data?.retryAt ? ` Try again after ${new Date(err.data.retryAt).toLocaleTimeString()}.` : '';
      setError((err.law ? 'That is more ink than one sheet can hold. Undo some.' : err.message) + when);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setPhoto(null);
    setPreview(null);
    setSaved(null);
    setError(null);
    setInkColor(null);
    setStrokes(0);
    setSession((s) => s + 1);
  }

  if (saved) {
    return (
      <div className="stack narrow">
        <h1>{saved.sentAt ? `Sent to @${saved.to}` : 'On your profile'}</h1>
        <p className="meta">
          {saved.kind === 'pad' ? `sealed by your key · ${kb(saved.bytes)} of strokes` : saved.strokesUrl ? `${saved.strokeCount} strokes, ${kb(saved.strokesBytes)}` : kb(saved.bytes)} · loaded back
          from the server, exactly as a recipient sees it
        </p>
        {!kept && <p className="muted">Your profile is full, so no copy was kept there.</p>}
        <LetterView letter={saved} />
        <SendControl letter={saved} defaultTo={presetTo} onSent={setSaved} />
        <p>
          <Link to={`/u/${user.username}`}>your profile</Link> ·{' '}
          <button type="button" onClick={reset}>
            write another
          </button>
        </p>
      </div>
    );
  }

  const ready = mode === 'pad' ? strokes > 0 : !!photo;
  const summary =
    mode === 'photo' && preview
      ? !photo
        ? 'updating…'
        : [
            `ink ${kb(photo.png.size)}`,
            photo.strokesBlob && `strokes ${kb(photo.strokesBlob.size)} (${photo.strokeCount} strokes)`,
            photo.sourceBytes && `photo was ${kb(photo.sourceBytes)}`,
            `${photo.ms} ms`,
          ]
            .filter(Boolean)
            .join(' · ')
      : null;

  return (
    <div className={`write ${mode}`}>
      <h1 className="sr-only">Write a letter</h1>
      <div className="write-head">
        <div className="tabs" role="group" aria-label="How to write">
          <button type="button" aria-pressed={mode === 'pad'} onClick={() => switchMode('pad')}>
            Draw on screen
          </button>
          <button type="button" aria-pressed={mode === 'photo'} onClick={() => switchMode('photo')}>
            Photograph a page
          </button>
        </div>
        <a href="#letter" className="jump">
          <Hand>Send ↓</Hand>
        </a>
      </div>

      <section className="write-source">
        {mode === 'photo' ? (
          <PhotoSource key={session} onResult={onPhoto} />
        ) : (
          ink && <Pad key={sheet.sheet} ink={ink} inkColor={color} paper={paper} onPaperChange={setPaper} onWritten={toLetter} onChange={setStrokes} />
        )}
      </section>

      <section className="letter-section" id="letter">
        <h2>
          <Hand>Your letter</Hand>
        </h2>
        <div className="row">
          {mode === 'photo' ? (
            <label className="field">
              <span>Ink</span>
              <input type="color" value={color} onChange={(e) => setInkColor(e.target.value)} />
            </label>
          ) : (
            <span className="field">
              <span>Ink</span>
              <InkWell value={color} onChange={setInkColor} />
            </span>
          )}
          {mode === 'photo' && inkColor && photo?.detectedColor && (
            <button type="button" className="quiet" onClick={() => setInkColor(null)}>
              use detected
            </button>
          )}
          <label className="field">
            <span>Paper</span>
            <select value={paper} onChange={(e) => setPaper(e.target.value)}>
              {Object.entries(PAPERS).map(([id, p]) => (
                <option key={id} value={id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {mode === 'pad' && <p className="muted">On the pad, the colour is the ink in your pen: change it before you write (colours mix while wet).</p>}
        {mode === 'photo' &&
          (preview ? (
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
            <div className="preview-empty" style={{ background: paperCss(paper) }}>
              Pick a photo and your letter appears here.
            </div>
          ))}
        {summary && <p className="meta">{summary}</p>}

        <div className="send-box">
          <button type="button" className="primary" disabled={!ready || saving} onClick={() => save('')}>
            {saving ? 'Sealing…' : 'Save to my profile'}
          </button>
          <span className="or">or send it</span>
          <div className="row">
            <ScripterInput id="write-to" value={to} onChange={setTo} />
            <button type="button" className="seal" disabled={!ready || saving || !to} onClick={() => save(to)}>
              Save &amp; send
            </button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    </div>
  );
}
