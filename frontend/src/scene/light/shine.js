// Shine comes from the surface (matter-fixes §5). No surface keeps a gloss of
// its own: how sharply light leaves it is how its faces lie.
//
//   Each face is a mirror. A surface whose faces are aligned throws a source
//   back in a sharp glint (polished brass); one whose faces are scattered
//   throws it back in a broad, faint sheen, or none to see (wood, plaster,
//   paper). How scattered they are is their slopes' variance (m², Beckmann's
//   roughness): read from the heights themselves where the heights are known
//   (the page's cells, slopeVariance), and from each grown kind's own grower
//   for the room and the things (ROUGH: its cells' faces, sampled, and what
//   lies below a cell, surface.js SUB). A source has a size: the sun's disk,
//   a flame's height; seen in a perfect mirror it is still that big, so the
//   lobe is never narrower than the source (sourceM2).
//
//   Up close (a cell several pixels wide) each cell is its own face; far away
//   (many cells in a pixel) the faces it holds widen the lobe instead (as
//   Toksvig's filtering of bumpy surfaces). The lobe is normalised: however
//   wide, it turns back the same share of the light, so zooming out keeps the
//   brightness and no highlight pops.
//
//   How much a face turns back is the matter's (its refractive index, law/
//   matter.js ior: F0 = ((n − 1) / (n + 1))², more toward grazing, Schlick's);
//   a metal turns back what its colour does.
//
// The shader's (nodes.js spectral) is this, in its own language. Scene only.

import { matter } from 'penpals-law';
import { growCell, SUB, KINDS, PLASTER, PLANKS, BOARD, BRASS, WAX, WICK, CLOTH, SKIN, CELL_PX, DROP_PX } from './surface.js';
import { SUN_RADIUS } from './air.js';

export { SUN_RADIUS };

// How much a face of matter with refractive index n turns back, head on.
export const f0Of = (n) => ((n - 1) / (n + 1)) ** 2;
// A matter's (law/matter.js), or null for a metal.
export const F0 = Object.freeze(Object.fromEntries(Object.entries(matter.MATTER).map(([k, m]) => [k, m.ior === null || m.ior === undefined ? null : f0Of(m.ior / 1000)])));
// Toward grazing, more (Schlick): cosD the cosine between the eye and the face's normal (the half vector).
export const fresnel = (f0, cosD) => f0 + (1 - f0) * (1 - Math.max(0, Math.min(1, cosD))) ** 5;

// Beckmann's distribution of faces: how many face the half vector (cosH its cosine to the surface's normal).
export function beckmann(cosH, m2) {
  const c2 = cosH * cosH;
  if (c2 <= 0 || m2 <= 0) return 0;
  return Math.exp(-(1 - c2) / (c2 * m2)) / (Math.PI * m2 * c2 * c2);
}

// A source seen from a point: its angular radius squared (the lobe never narrower).
export const sourceM2 = (radius, distance) => (radius / Math.max(distance, 1e-9)) ** 2;

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};
// The mirror part of what a surface sends toward the eye, from a source of irradiance 1 normal to its
// beam: F · D / (4 n·v) (radiance per irradiance). n, v (toward the eye), l (toward the source): unit.
export function glint(n, v, l, m2, f0) {
  const nl = dot(n, l),
    nv = dot(n, v);
  if (nl <= 0 || nv <= 0) return 0;
  const h = unit([v[0] + l[0], v[1] + l[1], v[2] + l[2]]);
  return (fresnel(f0, dot(h, v)) * beckmann(dot(n, h), m2)) / (4 * nv);
}

// The variance of a block's faces' slopes (m²): each cell's face to its +x and +y neighbours, its
// rise over a cell (`heights` in page px, row by row, `w` across; cells cellPx apart).
export function slopeVariance(heights, w, cellPx = CELL_PX) {
  const rows = Math.floor(heights.length / w);
  let n = 0,
    sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0;
  for (let y = 0; y + 1 < rows; y++)
    for (let x = 0; x + 1 < w; x++) {
      const h = heights[y * w + x];
      const gx = (heights[y * w + x + 1] - h) / cellPx,
        gy = (heights[(y + 1) * w + x] - h) / cellPx;
      sx += gx;
      sy += gy;
      sxx += gx * gx;
      syy += gy * gy;
      n++;
    }
  if (!n) return 0;
  return sxx / n - (sx / n) ** 2 + (syy / n - (sy / n) ** 2);
}
// What lies below a cell: [height (units, RMS), apart (cells)] → its faces' slopes' variance.
export const subM2 = ([amp, apart]) => 2 * ((amp * DROP_PX) / (apart * CELL_PX)) ** 2;

// Each grown kind's roughness: its own cells' faces (sampled from its grower, at true scale) and what lies
// below a cell. { [kind]: { cells, sub, m2 } }: m2 far away (all of it in the lobe), sub up close (each
// cell its own face).
const SAMPLE = 64;
function roughOf(kind) {
  const h = new Float64Array(SAMPLE * SAMPLE);
  for (let y = 0; y < SAMPLE; y++) for (let x = 0; x < SAMPLE; x++) h[y * SAMPLE + x] = growCell(kind, 0x5eed, 1000 + x, 1000 + y).height * DROP_PX;
  const cells = slopeVariance(h, SAMPLE);
  const sub = subM2(SUB[kind]);
  return { cells, sub, m2: cells + sub };
}
export const ROUGH = Object.freeze(Object.fromEntries(Object.values(KINDS).map((k) => [k, Object.freeze(roughOf(k))])));
// The paper's own, below its cells (its fibers finer than the grain): as the grower's kinds.
export const PAPER_SUB = subM2([12, 0.5]);
// Each grown kind's matter (law/matter.js): how much its faces turn back (null: a metal, its colour).
export const MATTER_OF = Object.freeze({ [PLASTER]: 'plaster', [PLANKS]: 'oak', [BOARD]: 'oak', [BRASS]: 'brass', [WAX]: 'wax', [WICK]: 'wick', [CLOTH]: 'fiber', [SKIN]: 'skin' });
export const f0OfKind = (kind) => F0[MATTER_OF[kind]] ?? null;

// A sheet's faces' scatter about a block, as the shade bake has it (nodes.js facesScatter): its top
// the paper's surface and fibers, or what stands over them where that stands higher; drops of
// height `surface` and `above` (the scene field's), fiber relief `detail` (page px). Below a cell,
// the paper's own scatter where its fibers are the top; a liquid standing over them is smooth.
export function scatterOf(surface, above, detail, w) {
  let fibers = 0;
  const top = Float64Array.from(surface, (s, k) => {
    const paper = s * DROP_PX + detail[k],
      over = (s + above[k]) * DROP_PX;
    if (paper >= over) fibers++;
    return Math.max(paper, over);
  });
  return slopeVariance(top, w) + PAPER_SUB * (fibers / surface.length);
}
