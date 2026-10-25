import { useState } from 'react';
import { SIZES } from '../book/fresh.js';

// At your table with nothing in hand (one-world.md, the panel): new paper, and
// its type (the paper it is grown on: grain and weight; half a page or a whole
// one), which brings a fresh sheet onto the table. The sheet already there, if
// written on, is sealed into the book first, where it lies.
//   fresh: book/fresh.js; family: the paper the next sheet is grown on; onFamily(f): choose it
const RANGE = [...Array(16).keys()];

export default function PaperPanel({ fresh, family, onFamily }) {
  const [size, setSize] = useState('half');
  const f = family ?? { grain: 8, weight: 8, tooth: 0 };
  const pick = (field) => (e) => onFamily({ ...f, [field]: Number(e.target.value) });
  return (
    <div className="stack paper-panel">
      {fresh.sheet && <FreshSheet fresh={fresh} />}
      <div className="field" title="The paper the next sheet is grown on">
        <span>Paper</span>
        <label className="meta">
          grain{' '}
          <select value={f.grain} onChange={pick('grain')}>
            {RANGE.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="meta">
          weight{' '}
          <select value={f.weight} onChange={pick('weight')}>
            {RANGE.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Page</span>
        <div className="tabs" role="group" aria-label="Page">
          {Object.keys(SIZES).map((id) => (
            <button key={id} type="button" aria-pressed={size === id} onClick={() => setSize(id)}>
              {id}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="primary" disabled={fresh.busy} onClick={() => fresh.newPaper({ size: SIZES[size] })}>
        New paper
      </button>
      {fresh.error && <p className="error">{fresh.error}</p>}
    </div>
  );
}

// The fresh sheet on the table: how much is on it, a stroke lifted, or sealed into the book.
export function FreshSheet({ fresh }) {
  return (
    <div className="stack fresh-sheet">
      <p className="meta">
        A fresh sheet on the table: {fresh.strokes} stroke{fresh.strokes === 1 ? '' : 's'}. {fresh.strokes ? '' : 'Take the pen (H) and write on it.'}
      </p>
      <div className="row">
        <button type="button" className="quiet" onClick={fresh.undo} disabled={!fresh.strokes || fresh.busy}>
          Undo
        </button>
        <button type="button" onClick={fresh.seal} disabled={!fresh.strokes || fresh.busy}>
          {fresh.busy ? 'Sealing…' : 'Seal it into the book'}
        </button>
      </div>
    </div>
  );
}
