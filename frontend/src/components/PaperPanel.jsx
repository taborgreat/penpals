import { useState } from 'react';
import { SIZES } from '../book/fresh.js';
import { PAPERS } from '../ink/paper.js';
import { RULE_MM, ruleSpacing, ruleMm } from '../book/ruled.js';

// At your table with nothing in hand (one-world.md, the panel): new paper, and
// its type (the paper it is grown on: grain and weight; half a page or a whole
// one), which brings a fresh sheet onto the table. The sheet already there, if
// written on, is sealed into the book first, where it lies. The page it lies on:
// its paper (its colour) and its ruled lines and their height (book/ruled.js).
//   fresh: book/fresh.js; family: the paper the next sheet is grown on; onFamily(f): choose it
//   page: { background, rule } (the page on the table); pageWidth (its px); onPaper(color), onRule(spacing)
const RANGE = [...Array(16).keys()];

export default function PaperPanel({ fresh, family, onFamily, page = null, pageWidth = 1000, onPaper = null, onRule = null }) {
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
      {page && onPaper && (
        <div className="field" title="The page's paper: its colour">
          <span>Its colour</span>
          <div className="tabs" role="group" aria-label="The page's paper">
            {Object.entries(PAPERS).map(([id, p]) => (
              <button key={id} type="button" aria-pressed={page.background?.toLowerCase() === p.color} onClick={() => onPaper(p.color)}>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {page && onRule && (
        <label className="field" title="Lines printed on the page, so far apart">
          <span>Lines</span>
          <select value={ruleMm(page.rule ?? 0, pageWidth)} onChange={(e) => onRule(Number(e.target.value) ? ruleSpacing(Number(e.target.value), pageWidth) : 0)}>
            <option value={0}>none</option>
            {RULE_MM.map((mm) => (
              <option key={mm} value={mm}>
                ruled, {mm} mm
              </option>
            ))}
          </select>
        </label>
      )}
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
