import { useEffect, useMemo, useState } from 'react';
import { paperCss, PAPERS } from '../ink/paper.js';
import FilmDownload from './FilmDownload.jsx';
import InkItem from '../book/InkItem.jsx';
import { CELLS } from '../book/ink.js';
import SceneView from '../scene/SceneView.jsx';
import { sceneOn, sceneSupported, setViewChoice, useLowPower } from '../scene/support.js';
import { sceneOf, hexRgb } from '../scene/sources.js';

// A letter written on the pad (Living Ink): its sealed record's look, grown by
// the server from the letter's own private sheet, laid on its paper where it
// was written, and revealed along its strokes the first time it is seen.
// `letter`: the server's letter ({ lineUrl, lookUrl, page, box, background }).
// Shown as the scene where the device can (lit by the time of day; 2D or 3D):
// the server's scene field, heights and colours, never the letter's paper.
export default function PadLetter({ letter }) {
  const [line, setLine] = useState(null);
  const [error, setError] = useState(null);
  const [round, setRound] = useState(0); // Watch again: a new reveal
  const [scene, setScene] = useState(() => sceneOn());
  const lowPower = useLowPower();
  useEffect(() => { setScene(sceneOn()); }, [lowPower]);
  const [sceneMode, setSceneMode] = useState('3d'); // always 3D
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!scene || !line || !letter.id) return undefined;
    let alive = true;
    sceneOf({ line, seed: null, lookUrl: letter.lookUrl, sceneUrl: `/api/letters/${letter.id}/look?mode=scene` })
      .then((d) => { if (alive) setData(d); })
      .catch(() => { if (alive) setScene(false); });
    return () => { alive = false; };
  }, [scene, line, letter.id, letter.lookUrl]);
  const page = letter.page ?? { width: letter.width, height: letter.height };
  // the whole page is the sheet (it was written on it); the ink falls in its box
  const sheets = useMemo(() => {
    if (!data) return [];
    return [{ id: 'letter', box: [0, 0, Math.ceil(page.width * CELLS), Math.ceil(page.height * CELLS)], origin: [0, 0], cellPx: 1 / CELLS, field: data.field, look: data.look }];
  }, [data, page.width, page.height]);

  useEffect(() => {
    let alive = true;
    fetch(letter.lineUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`could not load it (${r.status})`))))
      .then((d) => { if (alive) setLine(d.line); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [letter.lineUrl]);

  if (error) return <p className="error">Could not load the letter: {error}</p>;
  const box = line?.ink.box ?? letter.box;
  const pct = (v, of) => `${(v / CELLS / of) * 100}%`;
  return (
    <div className="letter-box">
      <div className="letter pad-letter" style={{ background: paperCss(letter.background ?? letter.paper ?? 'plain'), aspectRatio: `${page.width} / ${page.height}`, position: 'relative', '--ratio': page.width / page.height }}>
        {line && box && !(scene && data) && (
          <span className="ink-item" style={{ position: 'absolute', left: pct(box[0], page.width), top: pct(box[1], page.height), width: pct(box[2], page.width), height: pct(box[3], page.height) }}>
            <InkItem key={round} src={letter.lookUrl} body={line.ink} />
          </span>
        )}
        {scene && data && (
          <SceneView
            className="letter-scene"
            page={[page.width, page.height]}
            mode={sceneMode}
            onMode={setSceneMode}
            sheets={sheets}
            paper={hexRgb((PAPERS[letter.background ?? letter.paper] ?? PAPERS.plain).color)}
            onFlat={() => { setViewChoice('flat'); setScene(false); }}
          />
        )}
      </div>
      {line && (
        <div className="row">
          <button type="button" className="watch" onClick={() => setRound((r) => r + 1)}>▶ Watch</button>
          <span className="meta" title="Sealed by the writer's key: the server grew this from the sheet, and it must match the seal">sealed</span>
          <span className="spacer" />
          {!scene && sceneSupported() && (
            <button type="button" className="quiet" onClick={() => { setViewChoice('scene'); setScene(true); }} title="The letter lit, in 3D">Scene</button>
          )}
          {letter.id && <FilmDownload source={{ url: `/api/letters/${letter.id}/film` }} background={(PAPERS[letter.background] ?? PAPERS.plain).color} name={`penpals-${letter.from ?? ''}-${letter.id}`} />}
        </div>
      )}
    </div>
  );
}
