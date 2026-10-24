import { useState } from 'react';
import InkItem from './InkItem.jsx';
import { traceHere } from '../ink/grown.js';

// Walk back (keys.md): tap a spot of a piece of writing and see why it looks
// that way: the paper there (its capacity, sizing, fibers), when the nib was
// over it and how much ink it gave, the water that stood or ran in along a
// fiber, and what settled. It grows the sheet again on this device, so it needs
// the sheet's seed: yours (your key is in this tab) or a sheet that is open.
export default function WalkBack({ line, seed, src, onClose }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const body = line.ink;
  const [, , w, h] = body.box;

  async function pick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const cell = [body.box[0] + Math.floor(((e.clientX - r.left) / r.width) * w), body.box[1] + Math.floor(((e.clientY - r.top) / r.height) * h)];
    setBusy(true);
    setError(null);
    try {
      setResult(await traceHere(body, seed, cell));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const t = result;
  return (
    <div className="stack card walk-back">
      <div className="row">
        <strong>Walk back</strong>
        <span className="meta">tap any spot of the writing</span>
        <span className="spacer" />
        <button type="button" className="quiet" onClick={onClose}>Close</button>
      </div>
      <button type="button" className="walk-back-art" style={{ aspectRatio: `${w} / ${h}` }} onClick={pick} disabled={busy} aria-label="Pick a spot">
        <InkItem src={src} body={body} />
      </button>
      {busy && <p className="muted">Growing the sheet again…</p>}
      {error && <p className="error">{error}</p>}
      {t && (
        <dl className="trace">
          <dt>cell</dt><dd>{t.cell.join(', ')}</dd>
          {t.paper && (
            <>
              <dt>paper</dt>
              <dd>
                holds {t.paper.capacity} drops before the surface wets; sizing {t.paper.sizing}; height {t.paper.height}
                {t.paper.fibers.length ? `; fibers toward ${t.paper.fibers.map((f) => `${f.toward} (${f.conductance})`).join(', ')}` : '; no fiber here'}
              </dd>
            </>
          )}
          <dt>the nib</dt>
          <dd>
            {t.deposits.length
              ? `${t.deposits.reduce((s, d) => s + d.drops, 0)} drops over ${t.deposits.length} tick${t.deposits.length === 1 ? '' : 's'}, from ${t.deposits[0].at} ms (stroke ${t.deposits[0].stroke + 1}, act ${t.deposits[0].act})${t.deposits[0].p ? `, pressure ${t.deposits[0].p}` : ''} to ${t.deposits.at(-1).at} ms`
              : 'never over this cell: whatever is here came by water'}
          </dd>
          <dt>water</dt>
          <dd>
            {t.water.wetAt === null ? 'never wet' : `wet at ${t.water.wetAt} ms, dry by ${t.water.dryAt} ms; at most ${t.water.peak} drops at ${t.water.peakAt} ms${t.water.standing ? `, ${t.water.standing} of them standing above the paper (a bead)` : ''}`}
          </dd>
          {t.carried.length > 0 && (
            <>
              <dt>carried in</dt>
              <dd>{t.carried.map((c) => `${c.drops} along a fiber from the ${c.from}`).join('; ')}</dd>
            </>
          )}
          <dt>settled</dt>
          <dd>
            pigment {t.settled.fixed.join(' / ')}; shows as{' '}
            <span className="swatch" style={{ background: `rgb(${t.settled.transmittance.join(',')})` }} /> rgb({t.settled.transmittance.join(', ')})
          </dd>
        </dl>
      )}
    </div>
  );
}
