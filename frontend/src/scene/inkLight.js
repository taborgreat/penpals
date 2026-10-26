// Ink on the house's surfaces in the room's light (light-waves §4: ink changes the light; rooms.md §2): a
// patch ink lies on refuses what its cells do, each inked cell its own curve (light/matter.js: R = R_surface
// · exp(−A_ink)), the rest of the patch its surface's own; the bounce solver takes them as the patches'
// reflectance (light/settle.js roomAbsorption `curves`). Nothing else changes: a patch no ink touches is
// left to its surface.
//   markedCurves(geom, marks, baseOf) → { [patch]: reflectance (N) }
//   geom: the room (light/room.js roomGeometry, or the decoded room: its surfaces' grids name their patches)
//   marks: SceneView's (rooms.md §2): [{ surface (scene/surfaces.js id), origin, cellUnits, box, rgba }], rgba
//     each cell's look (colour to alpha over white: the law's transmittance)
//   baseOf(patch) → its reflectance unwritten (N)
import { N } from './light/axis.js';
import { cellReflectance } from './light/matter.js';
import { CELL_M } from './light/surface.js';
import { surfaceFrame, toRoom, ROOM_SURFACE } from './surfaces.js';

const lineOf = (lines, x) => {
  let lo = 0,
    hi = lines.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (lines[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
};

export function markedCurves(geom, marks, baseOf) {
  const inked = new Map(); // patch → [{ abs }]
  const abs = [0, 0, 0];
  for (const mk of marks ?? []) {
    if (!mk.rgba) continue;
    const frame = surfaceFrame(geom, mk.surface);
    const si = geom.surfaces.findIndex((s) => s.id === ROOM_SURFACE[mk.surface]);
    if (!frame || si < 0) continue;
    const s = geom.surfaces[si];
    const [, , bw, bh] = mk.box; // (its cells from the box's corner, at origin)
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const k = 4 * (y * bw + x);
        const a = mk.rgba[k + 3];
        if (!a) continue;
        // the cell's transmittance, as its look has it over white, as absorbance (the law's 1/1024)
        for (let c = 0; c < 3; c++) abs[c] = 1024 * -Math.log(Math.max(1 / 255, 1 - (a / 255) * (1 - mk.rgba[k + c] / 255)));
        const at = toRoom(frame, [mk.origin[0] + (x + 0.5) * mk.cellUnits, mk.origin[1] + (y + 0.5) * mk.cellUnits]);
        const d = [at[0] - s.origin[0], at[1] - s.origin[1], at[2] - s.origin[2]];
        const u = d[0] * s.u[0] + d[1] * s.u[1] + d[2] * s.u[2],
          v = d[0] * s.v[0] + d[1] * s.v[1] + d[2] * s.v[2];
        if (u < 0 || v < 0 || u > s.size[0] || v > s.size[1]) continue;
        const { u: gu, v: gv, cells } = s.grid;
        const patch = cells[lineOf(gv, v) * (gu.length - 1) + lineOf(gu, u)];
        if (patch < 0) continue; // (an opening: nothing to write on)
        if (!inked.has(patch)) inked.set(patch, []);
        inked.get(patch).push([...abs]);
      }
  }
  const out = {};
  const R = new Float64Array(N);
  for (const [patch, cells] of inked) {
    const base = baseOf(patch);
    const all = Math.max(cells.length, Math.round(geom.patches[patch].area / (CELL_M * CELL_M)));
    const sum = Float64Array.from(base, (v) => v * (all - cells.length));
    for (const c of cells) {
      cellReflectance(base, c, 0, R);
      for (let b = 0; b < N; b++) sum[b] += R[b];
    }
    out[patch] = Array.from(sum, (v) => v / all);
  }
  return out;
}
