// A paper grown off the main thread (law/paper.js growPaper): its stamped acts, in the stamper's order, and
// the drips that landed on it, grown on its owner's paper into the scene's field. Every screen grows the
// same paper from the same acts.
// Its ink as it looks at its age (oak gall darkens in the air: the law's view, by the hour).
// In: { id, paper, lines, drips (law/wax.js dripsOn), burns (law/fire.js burntOn), seed (b64url), family, law (it was
// born under), ageH }   Out: { id, field | null, n, facts, seals: [took] } or { id, error }
// Or: { type: 'loose', id, paper, x, y (tenths of its units) }: what lies loose under a fingertip there, as its last
// growing had it (law/v2/sim.js 19, a pinch) → { id, ng, by: { [matter]: ng } }
import { paper as P, fromB64url, b64url, matter as M } from 'penpals-law';
import { viewBuckets } from 'penpals-law/laws';
import { sceneField } from 'penpals-law/v2/scene';
import { BEING } from 'penpals-law/making';
import { CELLS_PER_UNIT } from 'penpals-law/v1/constants';

const loose = new Map(); // paper → Int32Array [x, y (cells), ng, matter] each cell with loose matter on it

globalThis.onmessage = ({ data }) => {
  if (data.type === 'loose') {
    const cells = loose.get(data.paper);
    const cx = Math.floor((data.x * CELLS_PER_UNIT) / 10),
      cy = Math.floor((data.y * CELLS_PER_UNIT) / 10);
    const r = BEING.finger / 2 / M.CELL_M;
    const by = {};
    let ng = 0;
    for (let i = 0; cells && i < cells.length; i += 4) {
      const dx = cells[i] - cx,
        dy = cells[i + 1] - cy;
      if (dx * dx + dy * dy > r * r) continue;
      ng += cells[i + 2];
      const m = M.ORDER[cells[i + 3]];
      by[m] = (by[m] ?? 0) + cells[i + 2];
    }
    globalThis.postMessage({ id: data.id, ng, by });
    return;
  }
  const { id, paper, lines, drips = [], burns = [], seed, family, law, ageH = 0 } = data;
  try {
    const grown = P.growPaper(lines, { seed: fromB64url(seed, 64), family, law, drips, burns });
    if (paper) {
      const on = grown ? grown.cells.filter((c) => c[19] > 0) : [];
      const a = new Int32Array(on.length * 4);
      on.forEach((c, k) => a.set([c[1], c[0], c[19], c[20]], k * 4)); // (a settled cell: [y, x, ...]: law/v2/look.js)
      loose.set(paper, a);
    }
    const field = grown ? sceneField(grown.cells, grown.box, viewBuckets(law, { ageH })) : null;
    const out = { id, field, n: lines.length, facts: grown ? b64url(grown.facts) : null, seals: grown ? grown.seals.map((x) => x.took) : [] };
    globalThis.postMessage(out, field ? [field.surface.buffer, field.above.buffer, field.depth.buffer, field.rgba.buffer, field.abs.buffer, field.flags.buffer] : []);
  } catch (err) {
    globalThis.postMessage({ id, error: String(err?.message ?? err) });
  }
};
