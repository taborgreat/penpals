// The room drawn (light-waves §4, brought in by cleanup-and-speed.md §7): its
// surfaces (floor, ceiling, walls, the table) as meshes over their patch grids,
// the window's panes, and the objects (legs, the frame, the candles' holders).
// Pure geometry and arithmetic here; the engine makes the meshes, the shader
// grows each surface cell by cell (light/surface.js) and lights it.
//
// The light on a surface: the room's settled light at its patches, less what
// came straight from the sun's disk and the flames (drawn per pixel, sharp),
// smoothed between patches at the grid's vertices. Through the eye's weights it
// becomes two colours a vertex: what the surface's light curve reflects (A) and
// what its dark curve adds (B); a cell of tone t shows A + t·B, plus the direct
// light the shader adds.

import { N, curves, surface as grown } from './light/index.js';

const { CELL_M } = grown;

const KIND = { plaster: grown.PLASTER, floor: grown.PLANKS, table: grown.BOARD };
const PAIR = { plaster: 'plaster', floor: 'floor', table: 'table', brass: 'brass', wax: 'wax', wick: 'wick', cloth: 'cloth', skin: 'skin' }; // matter → its curve pair
export const seedOf = (surface) => grown.seedMix(grown.DEFAULT_SEEDS[surface.id.startsWith('table') ? 'table' : surface.id] ?? grown.defaultSeed(surface.id));

// Every surface's mesh: vertices at its grid's line crossings (room m), each
// with its cell position (the surface's own cells, from its corner) and the
// patches it touches; quads where the grid's cell is a patch (an opening is a hole).
export function roomMeshes(geom) {
  return geom.surfaces.map((s) => {
    const { u: us, v: vs, cells } = s.grid;
    const nu = us.length,
      nv = vs.length;
    const pos = new Float32Array(nu * nv * 3);
    const cellPos = new Float32Array(nu * nv * 2);
    const touches = [];
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const k = j * nu + i;
        for (let c = 0; c < 3; c++) pos[3 * k + c] = s.origin[c] + s.u[c] * us[i] + s.v[c] * vs[j];
        cellPos[2 * k] = us[i] / CELL_M;
        cellPos[2 * k + 1] = vs[j] / CELL_M;
        const near = [];
        for (const [di, dj] of [
          [-1, -1],
          [0, -1],
          [-1, 0],
          [0, 0],
        ]) {
          const ci = i + di,
            cj = j + dj;
          if (ci < 0 || cj < 0 || ci >= nu - 1 || cj >= nv - 1) continue;
          const p = cells[cj * (nu - 1) + ci];
          if (p >= 0) near.push(p);
        }
        touches.push(near);
      }
    }
    const index = [];
    for (let j = 0; j < nv - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        if (cells[j * (nu - 1) + i] < 0) continue; // the window
        const a = j * nu + i,
          b = a + 1,
          c = a + nu,
          d = c + 1;
        // facing along the surface's normal (u × v is the normal, or its opposite)
        const uxv = [s.u[1] * s.v[2] - s.u[2] * s.v[1], s.u[2] * s.v[0] - s.u[0] * s.v[2], s.u[0] * s.v[1] - s.u[1] * s.v[0]];
        const along = uxv[0] * s.normal[0] + uxv[1] * s.normal[1] + uxv[2] * s.normal[2] > 0;
        if (along) index.push(a, b, d, a, d, c);
        else index.push(a, d, b, a, c, d);
      }
    }
    return { id: s.id, matter: s.matter, kind: KIND[s.matter], seed: seedOf(s), normal: s.normal, pos, cellPos, index, touches, top: s.id === 'table-top' };
  });
}

// A matter's light and dark curves (N values each).
export const pairOf = (matter) => curves.MATTER[PAIR[matter]];

// Each vertex's ambient colours (A, B: linear r, g, b) from the room's
// ambient light per patch (n × N) and the eye's weights (3 × N): into
// out[surface] = { A: Float32Array(V × 3), B: Float32Array(V × 3) }.
export function vertexLight(meshes, ambient, W, out = []) {
  const E = new Float64Array(N);
  meshes.forEach((m, si) => {
    const V = m.touches.length;
    const o = (out[si] ??= { A: new Float32Array(V * 3), B: new Float32Array(V * 3) });
    const { light, dark } = pairOf(m.matter);
    for (let k = 0; k < V; k++) {
      const near = m.touches[k];
      E.fill(0);
      for (const p of near) for (let b = 0; b < N; b++) E[b] += ambient[p * N + b] / near.length;
      for (let c = 0; c < 3; c++) {
        let a = 0,
          d = 0;
        for (let b = 0; b < N - 1; b++) {
          const w = (W[c * N + b] * E[b]) / Math.PI;
          a += w * light[b];
          d += w * (dark[b] - light[b]);
        }
        o.A[3 * k + c] = a;
        o.B[3 * k + c] = d;
      }
    }
  });
  return out;
}

// The room's ambient light as a spectrum at a point of surface `si` (its own
// u, v in m), as that surface's mesh carries it: each grid vertex the mean of
// the patches it touches, bilinear between them. A mark over the surface takes
// this at its corners (rooms.md §2), so where it holds no ink it is lit as the
// surface is. → out (N values).
export function spectrumAt(geom, meshes, si, u, v, ambient, out = new Float64Array(N)) {
  const { u: us, v: vs } = geom.surfaces[si].grid;
  const cell = (lines, x) => {
    let i = 0;
    while (i < lines.length - 2 && lines[i + 1] <= x) i++;
    return i;
  };
  const i = cell(us, u),
    j = cell(vs, v);
  const fu = Math.max(0, Math.min(1, (u - us[i]) / (us[i + 1] - us[i]))),
    fv = Math.max(0, Math.min(1, (v - vs[j]) / (vs[j + 1] - vs[j])));
  const nu = us.length;
  out.fill(0);
  for (const [di, dj] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const w = (di ? fu : 1 - fu) * (dj ? fv : 1 - fv);
    const near = meshes[si].touches[(j + dj) * nu + (i + di)];
    if (!w || !near.length) continue;
    for (const p of near) for (let b = 0; b < N; b++) out[b] += (w * ambient[p * N + b]) / near.length;
  }
  return out;
}

// The room's settled light at a point in it, room m (matter-fixes §4: a thing takes the
// light where it is, not the room's mean): the k patches nearest it that face it, each by
// the inverse square of its distance (softened by the patch's own size). → out (N values).
export function lightAt(geom, ambient, p, out = new Float64Array(N), k = 6) {
  const near = [];
  geom.patches.forEach((pa, i) => {
    const d = [p[0] - pa.center[0], p[1] - pa.center[1], p[2] - pa.center[2]];
    if (d[0] * pa.normal[0] + d[1] * pa.normal[1] + d[2] * pa.normal[2] < 0) return; // behind it: it does not see p
    const w = 1 / (d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + pa.area / 4);
    if (near.length < k || w > near[near.length - 1][0]) {
      near.push([w, i]);
      near.sort((a, b) => b[0] - a[0]);
      if (near.length > k) near.pop();
    }
  });
  out.fill(0);
  const total = near.reduce((t, [w]) => t + w, 0);
  for (const [w, i] of near) for (let b = 0; b < N; b++) out[b] += (w / total) * ambient[i * N + b];
  return out;
}

// A spectrum of light E on a matter, as the eye's two colours (A: what its light curve
// reflects; B: what its dark curve adds, a cell of tone t showing A + t·B).
export function colorsOf(E, W, matter) {
  const { light, dark } = typeof matter === 'object' ? matter : pairOf(matter); // (or a pair of its own: a book's cloth)
  const A = [0, 0, 0],
    B = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    for (let b = 0; b < N - 1; b++) {
      const w = (W[c * N + b] * E[b]) / Math.PI;
      A[c] += w * light[b];
      B[c] += w * (dark[b] - light[b]);
    }
  }
  return { A, B };
}

// The room's mean light over its patches, as A, B for a matter (what a thing not yet placed takes).
export function meanLight(ambient, n, W, matter) {
  const E = new Float64Array(N);
  for (let p = 0; p < n; p++) for (let b = 0; b < N; b++) E[b] += ambient[p * N + b] / n;
  return colorsOf(E, W, matter);
}
