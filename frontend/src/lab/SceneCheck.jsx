import { useEffect, useMemo, useRef, useState } from 'react';
import SceneView from '../scene/SceneView.jsx';
import { sceneSupported } from '../scene/support.js';

// /scene-check (dev only): law 2 fixtures in the scene, lit by the clock (or
// ?hour=), straight down or in 3D (?mode=3d), for looking at the renderer.
const NAMES = ['gallHairPool', 'flicks', 'tearThenInk', 'flexSquare', 'cockle'];
const CELLS = 2;

export default function SceneCheck() {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState(params.get('mode') === '3d' ? '3d' : '2d');
  const [loaded, setLoaded] = useState([]);
  const sceneRef = useRef(null);
  const worker = useRef(null);
  const waiting = useRef(new Map());
  const ask = (msg) => new Promise((resolve, reject) => {
    const id = Math.random();
    waiting.current.set(id, { resolve, reject });
    worker.current.postMessage({ ...msg, id });
  });

  useEffect(() => {
    if (params.get('hour')) {
      const h = Number(params.get('hour'));
      const RealDate = Date;
      globalThis.Date = class extends RealDate {
        constructor(...a) {
          if (a.length) super(...a);
          else {
            super();
            this.setHours(h, 0, 0, 0);
          }
        }
      };
    }
    worker.current = new Worker(new URL('./sceneWorker.js', import.meta.url), { type: 'module' });
    worker.current.onmessage = ({ data }) => {
      const p = waiting.current.get(data.id);
      waiting.current.delete(data.id);
      if (data.error) p?.reject(new Error(data.error));
      else p?.resolve(data);
    };
    (async () => {
      const out = [];
      let x = 20;
      for (const name of NAMES) {
        const { field, detail } = await ask({ type: 'field', name });
        out.push({ name, field, detail, origin: [x, 20] });
        x += field.box[2] / CELLS + 30;
        setLoaded([...out]);
      }
      // ?look=name&dist=&el=&az=: a close look at one sheet (3D)
      const look = params.get('look');
      if (look && params.get('mode') === '3d') {
        const l = out.find((o) => o.name === look);
        const cx = l.origin[0] + l.field.box[2] / CELLS / 2, cy = l.origin[1] + l.field.box[3] / CELLS / 2;
        setTimeout(() => sceneRef.current?.setCamera({ mode: '3d', target: [cx, cy], dist: Number(params.get('dist') ?? 120), az: Number(params.get('az') ?? 0), el: Number(params.get('el') ?? 40), fov: 40, view: 200 }), 50);
      }
    })();
    return () => worker.current.terminate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const width = loaded.length ? loaded.at(-1).origin[0] + loaded.at(-1).field.box[2] / CELLS + 20 : 1000;
  const height = Math.max(400, ...loaded.map((l) => l.field.box[3] / CELLS + 40));
  const sheets = useMemo(() => loaded.map((l) => ({
    id: l.name,
    box: l.field.box,
    origin: l.origin,
    cellPx: 1 / CELLS,
    field: l.field,
    detail: { data: l.detail, box: l.field.box },
  })), [loaded]);
  const at = (name) => loaded.find((l) => l.name === name);

  return (
    <div className="stack">
      <h1>Scene check</h1>
      <p className="muted" data-ready={loaded.length === NAMES.length ? 'yes' : 'no'} data-webgl={sceneSupported() ? 'yes' : 'no'}>
        {loaded.length}/{NAMES.length} sheets · {mode} · drag with the right button to turn, wheel to come closer, Light to move the sun.
      </p>
      <div style={{ height: 520, border: '1px solid var(--rule)' }}>
        {sceneSupported() ? (
          <SceneView
            ref={sceneRef}
            page={[width, height]}
            mode={mode}
            onMode={setMode}
            sheets={sheets}
            style={{ width: '100%', height: '100%' }}
            cutSide={(a, b) => {
              const l = at('gallHairPool');
              const toCell = (p) => [Math.round((p[0] - l.origin[0]) * CELLS + l.field.box[0]), Math.round((p[1] - l.origin[1]) * CELLS + l.field.box[1])];
              return ask({ type: 'side', name: 'gallHairPool', a: toCell(a), b: toCell(b) });
            }}
            moments={() => ask({ type: 'moments', name: 'gallHairPool' })}
          />
        ) : <p>No WebGL2 here: the flat look is shown instead.</p>}
      </div>
    </div>
  );
}
