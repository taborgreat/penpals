import { useCallback, useMemo, useState } from 'react';
import Pad from '../components/Pad.jsx';
import { HandDrawn } from '../components/Hand.jsx';
import { HAND } from '../hand/registry.js';
import { HAND_LABELS } from '../hand/labels.js';
import { handName, makeHandAsset } from '../hand/asset.js';
import { download } from '../ink/export.js';

const LABEL_PAGE = { width: 1100, height: 470 }; // five ruled lines: write on a middle one, with room above and below

// Write the site's labels by hand. Pick a label, write it on one line of the
// pad, and save: in development it goes straight into src/hand/drawn/ and
// shows up around the site at once; otherwise it downloads to put there.
export default function HandStudio() {
  const labels = useMemo(() => {
    const listed = new Set(HAND_LABELS.map(handName));
    const extra = Object.values(HAND).filter((a) => !listed.has(handName(a.text))).map((a) => a.text);
    return [...HAND_LABELS, ...extra];
  }, []);
  const firstMissing = labels.find((t) => !HAND[handName(t)]);
  const [text, setText] = useState(firstMissing ?? labels[0]);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(0);
  const name = handName(text);
  const saved = HAND[name];
  const draft = useMemo(() => (result ? makeHandAsset(result.strokesData, text) : null), [result, text]);
  const onResult = useCallback((r) => setResult(r), []);
  const done = labels.filter((t) => HAND[handName(t)]).length;

  function pick(next) {
    if (!next.trim()) return;
    setText(next.trim());
    setResult(null);
    setStatus(null);
    setSession((s) => s + 1);
  }

  async function save() {
    if (!draft) return;
    setStatus('Saving…');
    try {
      const res = await fetch('/__hand/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, asset: draft }),
      });
      if (res.status === 404 || res.status === 405) {
        download(new Blob([JSON.stringify(draft)], { type: 'application/json' }), `${name}.json`);
        setStatus(`Downloaded ${name}.json. Put it in frontend/src/hand/drawn/.`);
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      setStatus(`Saved src/hand/drawn/${name}.json (${(JSON.stringify(draft).length / 1024).toFixed(1)} KB).`);
    } catch (err) {
      setStatus(`Couldn't save: ${err.message}`);
    }
  }

  const nextMissing = labels.find((t) => t !== text && !HAND[handName(t)]);

  return (
    <div className="studio">
      <div className="studio-head">
        <h1>Handwriting studio</h1>
        <p className="muted">
          {done} of {labels.length} labels drawn. Write the word on one ruled line, at the size you'd write it
          in a letter; the line spacing sets its size next to text.
        </p>
      </div>

      <ul className="studio-labels">
        {labels.map((t) => (
          <li key={t}>
            <button type="button" aria-pressed={t === text} className={HAND[handName(t)] ? 'drawn' : undefined} onClick={() => pick(t)}>
              {HAND[handName(t)] ? '✓ ' : ''}{t}
            </button>
          </li>
        ))}
        <li>
          <form className="row" onSubmit={(e) => { e.preventDefault(); pick(custom); setCustom(''); }}>
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="another label…" />
            <button type="submit" disabled={!custom.trim()}>Add</button>
          </form>
        </li>
      </ul>

      <div className="studio-prompt">
        <span className="meta">write</span>
        <strong>{text}</strong>
        <span className="meta">→ {name}.json{saved ? ' (drawn; saving replaces it)' : ''}</span>
      </div>

      <Pad key={`${name}-${session}`} size={LABEL_PAGE} onResult={onResult} hint="Write it on one line. Zoom in for a finer hand." />

      <div className="studio-preview">
        <h2>Preview</h2>
        {draft || saved ? (
          <div className="studio-samples">
            {[draft && ['new', draft], saved && ['saved', saved]].filter(Boolean).map(([which, asset]) => (
              <div key={which} className="studio-sample">
                <span className="meta">{which} · hover to replay</span>
                <p className="row">
                  <button type="button"><HandDrawn key={JSON.stringify(asset.s).length + which} asset={asset} label={text} /></button>
                  <button type="button" className="primary"><HandDrawn asset={asset} label={text} /></button>
                  <a href="#preview" onClick={(e) => e.preventDefault()}><HandDrawn asset={asset} label={text} /></a>
                </p>
                <p style={{ fontSize: 28 }}><HandDrawn asset={asset} label={text} /> <span className="muted">next to text</span></p>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Write {text} above to see it here.</p>
        )}
        <div className="row">
          <button type="button" className="primary" disabled={!draft} onClick={save}>Save {name}.json</button>
          {nextMissing && <button type="button" onClick={() => pick(nextMissing)}>Next: {nextMissing} →</button>}
          {status && <span className="meta">{status}</span>}
        </div>
      </div>
    </div>
  );
}
