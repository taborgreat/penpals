import { useMemo, useState } from 'react';
import InkItem from './InkItem.jsx';
import { traceHere, depthHere, viewAt, momentsHere } from '../ink/grown.js';
import SceneView from '../scene/SceneView.jsx';
import { sceneSupported, useLowPower } from '../scene/support.js';
import { sceneOf } from '../scene/sources.js';
import { CELLS } from './ink.js';

// Walk back (keys.md): tap a spot of a piece of writing and see why it looks
// that way: the paper there (its capacity, sizing, fibers), when the nib was
// over it and how much ink it gave, the water that stood or ran in along a
// fiber, and what settled. It grows the sheet again on this device, so it needs
// the sheet's seed: yours (your key is in this tab) or a sheet that is open.
// Ink of law 2 also has depth: the dent, how far the ink sank, the film the ink
// dried to, the water the paper remembers; a cut through the paper along the row
// you tapped (the side view); and the sheet in the scene, its own paper and all,
// to turn in 3D, cut through, and band by the moments its ink went down.
export default function WalkBack({ line, seed, src, onClose }) {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [picture, setPicture] = useState(null); // { mode, url, width, height }
  const [scene, setScene] = useState(null); // { field, detail } once asked for
  const [sceneMode, setSceneMode] = useState('3d');
  const body = line.ink;
  const [, , w, h] = body.box;
  const deep = body.law >= 2;
  const lowPower = useLowPower(); // (the scene stands down on low power)

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

  async function show(mode) {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'scene') {
        setScene(await sceneOf({ line, seed }));
        return;
      }
      const row = result ? result.cell[1] : body.box[1] + (h >> 1);
      const cut = [body.box[0], row, body.box[0] + w - 1, row];
      if (picture) URL.revokeObjectURL(picture.url);
      setPicture({ mode, ...(await depthHere(body, seed, { mode, cut, view: viewAt(line) })) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  // the sheet framed on its own (its box at the scene's origin)
  const sheets = useMemo(() => (scene ? [{ id: 'sheet', box: scene.field.box, origin: [0, 0], cellPx: 1 / CELLS, field: scene.field, detail: scene.detail }] : []), [scene]);
  const toCell = (p) => [Math.round(p[0] * CELLS) + scene.field.box[0], Math.round(p[1] * CELLS) + scene.field.box[1]];

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
      {deep && (
        <div className="row">
          <button type="button" className="quiet" onClick={() => show('side')} disabled={busy} title="A cut through the paper along the row you tapped">
            Side view{t ? ' here' : ''}
          </button>
          {sceneSupported() && (
            <button type="button" className="quiet" onClick={() => show('scene')} disabled={busy} title="The sheet in the scene: turn it, cut through it, band it by its moments">
              Scene
            </button>
          )}
        </div>
      )}
      {picture && (
        <figure className="depth-view">
          <img src={picture.url} width={picture.width} height={picture.height} alt="A cut through the paper" />
          <figcaption className="meta">the paper in layers; the liquid sunk into it, the ink darker near the top; the film it dried to above; a break where it tore</figcaption>
        </figure>
      )}
      {scene && !lowPower && (
        <div className="walk-back-scene">
          <SceneView
            page={[scene.field.box[2] / CELLS, scene.field.box[3] / CELLS]}
            mode={sceneMode}
            onMode={setSceneMode}
            sheets={sheets}
            cutSide={(a, b) => depthHere(body, seed, { mode: 'side', cut: [...toCell(a), ...toCell(b)], view: viewAt(line) }).then(async (d) => {
              const img = await createImageBitmap(await (await fetch(d.url)).blob());
              const c = document.createElement('canvas');
              c.width = img.width;
              c.height = img.height;
              c.getContext('2d').drawImage(img, 0, 0);
              return { width: img.width, height: img.height, rgba: new Uint8Array(c.getContext('2d').getImageData(0, 0, img.width, img.height).data.buffer) };
            })}
            moments={() => momentsHere(body, seed)}
          />
        </div>
      )}
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
          {t.depth && (
            <>
              <dt>depth</dt>
              <dd>
                {t.depth.torn
                  ? 'torn through: worked while wet until the fibers gave; it holds nothing'
                  : [
                    t.depth.dent ? `pressed ${t.depth.dent} deep` : 'not pressed in',
                    `ink sank ${t.depth.depth} of the paper's layers`,
                    t.depth.peak ? `a bead stood ${t.depth.peak} high` : null,
                    t.depth.soak ? `the paper remembers water (${t.depth.soak})` : null,
                    t.depth.cockle ? `it dried buckled (ridge ${t.depth.cockle})` : null,
                    t.depth.wear ? `worn ${t.depth.wear}` : null,
                  ].filter(Boolean).join('; ')}
              </dd>
            </>
          )}
          <dt>settled</dt>
          <dd>
            pigment {t.settled.fixed.join(' / ')}{t.settled.gall ? `; oak gall ${t.settled.gall} (it darkens with air over days)` : ''}; shows as{' '}
            <span className="swatch" style={{ background: `rgb(${t.settled.transmittance.join(',')})` }} /> rgb({t.settled.transmittance.join(', ')})
          </dd>
        </dl>
      )}
    </div>
  );
}
