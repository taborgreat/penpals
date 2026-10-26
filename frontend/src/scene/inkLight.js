// Ink on the house's surfaces in the room's light (light-waves §4: ink changes the light; rooms.md §2): a
// patch ink lies on refuses what its cells do, each inked cell its own curve (light/matter.js: R = R_surface
// · exp(−A_ink)), the rest of the patch its surface's own; the bounce solver takes them as the patches'
// reflectance (light/settle.js roomAbsorption `curves`). Nothing else changes: a patch no ink touches is
// left to its surface.
//   markedCurves(geom, marks, baseOf) → { [patch]: reflectance (N) }
//   geom: the room (light/room.js roomGeometry, or the decoded room: its surfaces' grids name their patches)
//   marks: SceneView's (rooms.md §2): [{ surface (scene/surfaces.js id), origin, cellUnits, box, abs }], abs
//     each cell's ink by its absorbances (law/v2/look.js lookAbs: three channels, natural; oak gall, of GALL_ABS)
//   baseOf(patch) → its reflectance unwritten (N)
//
// Papers lying in the room (light-waves §4: a patch takes its cells' averaged absorption; law/paper.js: a
// paper is matter, lying anywhere): a patch a paper lies on refuses what the paper does over the share of it
// the paper covers (the paper's own curve through its ink, averaged over its cells), the rest of it what it
// did. A paper over another hides it.
//   papersCurves(geom, papers, baseOf, paper) → { [patch]: reflectance (N) }
//   papers: [{ x0, y0, x1, y1, z (room m: where it lies, level), cells (all of its cells), abs? (its ink by its
//     absorbances over some of them: law/v2/scene.js sceneField) }]; paper: blank paper's reflectance (N)
import { N } from './light/axis.js';
import { cellReflectance } from './light/matter.js';
import { GALL_ABS } from 'penpals-law/v2/sim';
import { CELL_M } from './light/surface.js';
import { patchOn, patchUnder } from './light/room.js';
import { surfaceFrame, toRoom, ROOM_SURFACE } from './surfaces.js';

export function markedCurves(geom, marks, baseOf) {
  const inked = new Map(); // patch → [[abs, gall]]
  const abs = [0, 0, 0];
  for (const mk of marks ?? []) {
    if (!mk.abs) continue;
    const frame = surfaceFrame(geom, mk.surface);
    const si = geom.surfaces.findIndex((s) => s.id === ROOM_SURFACE[mk.surface]);
    if (!frame || si < 0) continue;
    const s = geom.surfaces[si];
    const [, , bw, bh] = mk.box; // (its cells from the box's corner, at origin)
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const k = 4 * (y * bw + x);
        if (!(mk.abs[k] || mk.abs[k + 1] || mk.abs[k + 2] || mk.abs[k + 3])) continue;
        for (let c = 0; c < 3; c++) abs[c] = 1024 * mk.abs[k + c]; // (light/matter.js: the law's 1/1024)
        const gall = GALL_ABS * mk.abs[k + 3];
        const at = toRoom(frame, [mk.origin[0] + (x + 0.5) * mk.cellUnits, mk.origin[1] + (y + 0.5) * mk.cellUnits]);
        const d = [at[0] - s.origin[0], at[1] - s.origin[1], at[2] - s.origin[2]];
        const u = d[0] * s.u[0] + d[1] * s.u[1] + d[2] * s.u[2],
          v = d[0] * s.v[0] + d[1] * s.v[1] + d[2] * s.v[2];
        if (u < 0 || v < 0 || u > s.size[0] || v > s.size[1]) continue;
        const patch = patchOn(s, u, v);
        if (patch < 0) continue; // (an opening: nothing to write on)
        if (!inked.has(patch)) inked.set(patch, []);
        inked.get(patch).push([[...abs], gall]);
      }
  }
  const out = {};
  const R = new Float64Array(N);
  for (const [patch, cells] of inked) {
    const base = baseOf(patch);
    const all = Math.max(cells.length, Math.round(geom.patches[patch].area / (CELL_M * CELL_M)));
    const sum = Float64Array.from(base, (v) => v * (all - cells.length));
    for (const [c, gall] of cells) {
      cellReflectance(base, c, gall, R);
      for (let b = 0; b < N; b++) sum[b] += R[b];
    }
    out[patch] = Array.from(sum, (v) => v / all);
  }
  return out;
}

// A paper's reflectance over all its cells: the inked ones through their ink (at most SAMPLES of them, evenly
// taken), the rest blank. Kept by its ink (a field grows anew when its chain does).
const SAMPLES = 20000;
const means = new WeakMap(); // abs → { paper, R }
function paperMean(paper, abs, cells) {
  if (!abs || !cells) return paper;
  const was = means.get(abs);
  if (was?.paper === paper) return was.R;
  const inked = [];
  for (let k = 0; k < abs.length; k += 4) if (abs[k] || abs[k + 1] || abs[k + 2] || abs[k + 3]) inked.push(k);
  const step = Math.max(1, Math.ceil(inked.length / SAMPLES));
  const sum = new Float64Array(N),
    R = new Float64Array(N);
  let n = 0;
  for (let i = 0; i < inked.length; i += step, n++) {
    const k = inked[i];
    cellReflectance(paper, [1024 * abs[k], 1024 * abs[k + 1], 1024 * abs[k + 2]], GALL_ABS * abs[k + 3], R);
    for (let b = 0; b < N; b++) sum[b] += R[b];
  }
  const share = Math.min(1, inked.length / cells);
  const mean = Array.from(paper, (v, b) => v * (1 - share) + (n ? sum[b] / n : 0) * share);
  means.set(abs, { paper, R: mean });
  return mean;
}

const GRID_M = 0.01; // where papers lie is taken a square this wide at a time (room m)
export function papersCurves(geom, papers, baseOf, paper) {
  const top = new Map(); // a square of the room's floor plan → { patch, R } of the uppermost paper on it
  for (const pp of [...(papers ?? [])].sort((a, b) => a.z - b.z)) {
    const R = paperMean(paper, pp.abs, pp.cells);
    for (let gy = Math.ceil(pp.y0 / GRID_M - 0.5); (gy + 0.5) * GRID_M < pp.y1; gy++)
      for (let gx = Math.ceil(pp.x0 / GRID_M - 0.5); (gx + 0.5) * GRID_M < pp.x1; gx++) {
        const patch = patchUnder(geom, [(gx + 0.5) * GRID_M, (gy + 0.5) * GRID_M, pp.z]);
        if (patch >= 0) top.set(`${gx},${gy}`, { patch, R });
      }
  }
  const under = new Map(); // patch → [R of each square of paper on it]
  for (const { patch, R } of top.values()) {
    if (!under.has(patch)) under.set(patch, []);
    under.get(patch).push(R);
  }
  const out = {};
  for (const [patch, rs] of under) {
    const base = baseOf(patch);
    const area = geom.patches[patch].area;
    const covered = Math.min(1, (rs.length * GRID_M * GRID_M) / area);
    const sum = new Float64Array(N);
    for (const R of rs) for (let b = 0; b < N; b++) sum[b] += R[b] / rs.length;
    out[patch] = Array.from(base, (v, b) => v * (1 - covered) + sum[b] * covered);
  }
  return out;
}
