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
const PAIR = { plaster: 'plaster', floor: 'floor', table: 'table' }; // matter → its curve pair
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

// The objects' (and anything else's) ambient: the room's mean over its patches, as A, B for a matter.
export function meanLight(ambient, n, W, matter) {
  const E = new Float64Array(N);
  for (let p = 0; p < n; p++) for (let b = 0; b < N; b++) E[b] += ambient[p * N + b] / n;
  const { light, dark } = matter === 'brass' ? { light: curves.MATTER.brass, dark: curves.MATTER.brass } : pairOf(matter);
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
