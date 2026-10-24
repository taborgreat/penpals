import { useEffect, useRef, useState } from 'react';
import { FIXTURES } from 'penpals-law/tools/fixtures';

// /law-check (dev only): the law running in this browser. Each fixture's look
// is drawn at one device pixel per cell (how fine the grain really is on this
// screen), then 2× and 4×. The facts digest must match Node's
// (`node law/tools/render.js` prints the same first 16 hex digits).
const PAPER = [246, 241, 231];

export default function LawCheck() {
  const [results, setResults] = useState({});
  useEffect(() => {
    const worker = new Worker(new URL('./lawWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => setResults((r) => ({ ...r, [data.name]: data }));
    for (const name of Object.keys(FIXTURES)) worker.postMessage({ name });
    return () => worker.terminate();
  }, []);
  const dpr = window.devicePixelRatio || 1;
  return (
    <div className="stack">
      <h1>Law check</h1>
      <p className="muted">
        Device pixel ratio {dpr}. The first picture of each is one device pixel per cell (a cell is half an ink unit). If the ink reads as blur
        at that size rather than as ink texture, the law needs more cells per unit before it is frozen.
      </p>
      {Object.keys(FIXTURES).map((name) => {
        const r = results[name];
        return (
          <section key={name} data-fixture={name} data-facts={r && !r.error ? r.facts : ''} data-error={r?.error ?? ''}>
            <h2 style={{ fontSize: '1em' }}>
              {name} {r && !r.error && <code>facts {r.facts.slice(0, 16)} · {r.ms.toFixed(0)} ms · {r.ticks} ticks</code>}
              {r?.error && <span className="error"> {r.error}</span>}
              {!r && <span className="muted"> growing…</span>}
            </h2>
            {r && !r.error && (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                {[1, 2, 4].map((k) => <Look key={k} data={r} cssWidth={(r.box[2] * k) / dpr} />)}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Look({ data, cssWidth }) {
  const ref = useRef(null);
  useEffect(() => {
    const [, , w, h] = data.box;
    const cv = ref.current;
    cv.width = w;
    cv.height = h;
    const img = cv.getContext('2d').createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      for (let c = 0; c < 3; c++) img.data[4 * i + c] = Math.round((PAPER[c] * data.rgb[3 * i + c]) / 255);
      img.data[4 * i + 3] = 255;
    }
    cv.getContext('2d').putImageData(img, 0, 0);
  }, [data]);
  return <canvas ref={ref} style={{ width: cssWidth, imageRendering: cssWidth > data.box[2] ? 'pixelated' : 'auto', maxWidth: 'none' }} />;
}
