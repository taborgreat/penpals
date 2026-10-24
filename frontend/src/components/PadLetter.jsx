import { useEffect, useState } from 'react';
import { paperCss, PAPERS } from '../ink/paper.js';
import FilmDownload from './FilmDownload.jsx';
import InkItem from '../book/InkItem.jsx';
import { CELLS } from '../book/ink.js';

// A letter written on the pad (Living Ink): its sealed record's look, grown by
// the server from the letter's own private sheet, laid on its paper where it
// was written, and revealed along its strokes the first time it is seen.
// `letter`: the server's letter ({ lineUrl, lookUrl, page, box, background }).
export default function PadLetter({ letter }) {
  const [line, setLine] = useState(null);
  const [error, setError] = useState(null);
  const [round, setRound] = useState(0); // Watch again: a new reveal

  useEffect(() => {
    let alive = true;
    fetch(letter.lineUrl)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`could not load it (${r.status})`))))
      .then((d) => { if (alive) setLine(d.line); })
      .catch((err) => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [letter.lineUrl]);

  if (error) return <p className="error">Could not load the letter: {error}</p>;
  const page = letter.page ?? { width: letter.width, height: letter.height };
  const box = line?.ink.box ?? letter.box;
  const pct = (v, of) => `${(v / CELLS / of) * 100}%`;
  return (
    <div className="letter-box">
      <div className="letter pad-letter" style={{ background: paperCss(letter.background ?? letter.paper ?? 'plain'), aspectRatio: `${page.width} / ${page.height}`, position: 'relative' }}>
        {line && box && (
          <span className="ink-item" style={{ position: 'absolute', left: pct(box[0], page.width), top: pct(box[1], page.height), width: pct(box[2], page.width), height: pct(box[3], page.height) }}>
            <InkItem key={round} src={letter.lookUrl} body={line.ink} />
          </span>
        )}
      </div>
      {line && (
        <div className="row">
          <button type="button" className="watch" onClick={() => setRound((r) => r + 1)}>▶ Watch</button>
          <span className="meta" title="Sealed by the writer's key: the server grew this from the sheet, and it must match the seal">sealed</span>
          <span className="spacer" />
          {letter.id && <FilmDownload source={{ url: `/api/letters/${letter.id}/film` }} background={(PAPERS[letter.background] ?? PAPERS.plain).color} name={`penpals-${letter.from ?? ''}-${letter.id}`} />}
        </div>
      )}
    </div>
  );
}
