import { useCallback, useMemo, useState } from 'react';
import Pad from '../components/VectorPad.jsx';
import { HandDrawn } from '../components/Hand.jsx';
import { HAND } from '../hand/registry.js';
import { HAND_LABELS } from '../hand/labels.js';
import { handName, makeHandAsset } from '../hand/asset.js';
import { download } from '../ink/export.js';

const LABEL_PAGE = { width: 1100, height: 470 }; // five ruled lines: write on a middle one, with room above and below

// A checklist entry: a text, or { text, name } when it needs a drawing of its own.
const toEntry = (l) => (typeof l === 'string' ? { text: l, name: handName(l) } : { text: l.text, name: l.name ?? handName(l.text) });

// Write the site's labels by hand. Pick a label, write it on one line of the
// pad, and save: in development it goes straight into src/hand/drawn/ and
// shows up around the site at once; otherwise it downloads to put there.
export default function HandStudio() {
  const labels = useMemo(() => {
    const listed = HAND_LABELS.map(toEntry);
    const names = new Set(listed.map((e) => e.name));
    const extra = Object.entries(HAND)
      .filter(([n]) => !names.has(n))
      .map(([n, a]) => ({ text: a.text, name: n }));
    return [...listed, ...extra];
  }, []);
  const firstMissing = labels.find((e) => !HAND[e.name]);
  const [entry, setEntry] = useState(firstMissing ?? labels[0]);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);
  const [session, setSession] = useState(0);
  const { text, name } = entry;
  const saved = HAND[name];
  const [scale, setScale] = useState(saved?.scale ?? 1);
  const written = useMemo(() => (result ? makeHandAsset(result.strokesData, text) : null), [result, text]);
  const draft = useMemo(() => (written ? { ...written, scale } : null), [written, scale]);
  const savedScaled = useMemo(() => (saved ? { ...saved, scale } : null), [saved, scale]);
  // Other drawn labels to compare sizes with.
  const others = useMemo(
    () =>
      Object.entries(HAND)
        .filter(([n]) => n !== name)
        .slice(0, 4),
    [name],
  );
  const onResult = useCallback((r) => setResult(r), []);
  const done = labels.filter((e) => HAND[e.name]).length;

  function pick(next) {
    if (!next.text.trim()) return;
    setEntry(next);
    setScale(HAND[next.name]?.scale ?? 1);
    setResult(null);
    setStatus(null);
    setSession((s) => s + 1);
  }

  async function save(asset = draft) {
    if (!asset) return;
    setStatus('Saving…');
    try {
      const res = await fetch('/__hand/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, asset }),
      });
      if (res.status === 404 || res.status === 405) {
        download(new Blob([JSON.stringify(asset)], { type: 'application/json' }), `${name}.json`);
        setStatus(`Downloaded ${name}.json. Put it in frontend/src/hand/drawn/.`);
        return;
      }
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
      setStatus(`Saved src/hand/drawn/${name}.json (${(JSON.stringify(asset).length / 1024).toFixed(1)} KB).`);
    } catch (err) {
      setStatus(`Couldn't save: ${err.message}`);
    }
  }

  const nextMissing = labels.find((e) => e.name !== name && !HAND[e.name]);

  return (
    <div className="studio">
      <div className="studio-head">
        <h1>Handwriting studio</h1>
        <p className="muted">
          {done} of {labels.length} labels drawn. Write the word on one ruled line, at the size you'd write it in a letter; the line spacing sets its size next to text.
        </p>
      </div>

      <ul className="studio-labels">
        {labels.map((e) => (
          <li key={e.name}>
            <button type="button" aria-pressed={e.name === name} className={HAND[e.name] ? 'drawn' : undefined} onClick={() => pick(e)} title={e.name}>
              {HAND[e.name] ? '✓ ' : ''}
              {e.text}
              {e.name !== handName(e.text) ? ` (${e.name})` : ''}
            </button>
          </li>
        ))}
        <li>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              pick(toEntry(custom.trim()));
              setCustom('');
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="another label…" />
            <button type="submit" disabled={!custom.trim()}>
              Add
            </button>
          </form>
        </li>
      </ul>

      <div className="studio-prompt">
        <span className="meta">write</span>
        <strong>{text}</strong>
        <span className="meta">
          → {name}.json{saved ? ' (drawn; saving replaces it)' : ''}
        </span>
      </div>

      <Pad key={`${name}-${session}`} size={LABEL_PAGE} onResult={onResult} hint="Write it on one line. Zoom in for a finer hand." />

      <div className="studio-preview">
        <h2>Preview</h2>
        {draft || saved ? (
          <div className="studio-samples">
            {[draft && ['new', draft], savedScaled && ['saved', savedScaled]].filter(Boolean).map(([which, asset]) => (
              <div key={which} className="studio-sample">
                <span className="meta">{which} · hover to replay</span>
                <p className="row">
                  <button type="button">
                    <HandDrawn key={JSON.stringify(asset.s).length + which} asset={asset} label={text} />
                  </button>
                  <button type="button" className="primary">
                    <HandDrawn asset={asset} label={text} />
                  </button>
                  <a href="#preview" onClick={(e) => e.preventDefault()}>
                    <HandDrawn asset={asset} label={text} />
                  </a>
                </p>
                <p style={{ fontSize: 28 }}>
                  <HandDrawn asset={asset} label={text} /> <span className="muted">next to text</span>
                </p>
                {others.length > 0 && (
                  <p className="studio-compare">
                    {others.map(([n, a]) => (
                      <HandDrawn key={n} asset={a} label={a.text} />
                    ))}
                    <HandDrawn asset={asset} label={text} />
                    <span className="meta">next to your other labels</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Write {text} above to see it here.</p>
        )}
        <div className="row">
          <label className="field">
            <span>Size</span>
            <input type="range" min="0.4" max="2.5" step="0.05" value={scale} onChange={(e) => setScale(Number(e.target.value))} />
            <output>{Math.round(scale * 100)}%</output>
          </label>
          <button type="button" className="primary" disabled={!draft} onClick={() => save()}>
            Save {name}.json
          </button>
          {!draft && saved && (saved.scale ?? 1) !== scale && (
            <button type="button" onClick={() => save(savedScaled)}>
              Save the new size
            </button>
          )}
          {nextMissing && (
            <button type="button" onClick={() => pick(nextMissing)}>
              Next: {nextMissing.text} →
            </button>
          )}
          {status && <span className="meta">{status}</span>}
        </div>
      </div>
    </div>
  );
}
