// Where something let go of lands (rooms.md §3b): everything falls until it
// rests, straight down to the first surface below it. A drip of wax from a
// tilted candle lands on a paper lying there (a mark of that paper's record,
// regrown with it), on the table itself (where drips collect for good), or on
// the floor.
//   geom    the room (light.js GEOM); at: [x, y] (room m) where it falls from
//   papers  those lying in the room: [{ paper, at: [x, y, z] (mm: its middle), size: [w, h] (its units) }]
// → { on: 'paper', paper, q: { x, y } (its units), z } | { on: 'table' | 'floor', at: [x, y], z } (room m)

import { PX_PER_M } from '../scene/light/index.js';

// A paper lying with its middle at `at` (mm), `size` its units: its corner (its units' origin) in the room
// (m). Its units run along the room's +x, and down its page along the room's −y.
export const cornerOf = (at, size) => [at[0] / 1000 - size[0] / 2 / PX_PER_M, at[1] / 1000 + size[1] / 2 / PX_PER_M, at[2] / 1000];

export function landing(geom, [x, y], { papers = [] } = {}) {
  const t = geom.table;
  const over = x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1;
  const z = over ? t.top : 0;
  for (const p of papers) {
    const [cx, cy, cz] = cornerOf(p.at, p.size);
    const qx = (x - cx) * PX_PER_M,
      qy = (cy - y) * PX_PER_M;
    if (Math.abs(cz - z) < 1e-6 && qx >= 0 && qy >= 0 && qx <= p.size[0] && qy <= p.size[1]) return { on: 'paper', paper: p.paper, q: { x: qx, y: qy }, z };
  }
  return { on: over ? 'table' : 'floor', at: [x, y], z };
}

// Where a candle's wick is, standing at `foot` (room m), `height` tall, tilted `tilt`
// degrees toward the writer's right (+x): its drips fall from there.
export function wickOf(foot, height, tilt) {
  const a = (tilt * Math.PI) / 180;
  return [foot[0] + Math.sin(a) * height, foot[1], foot[2] + Math.cos(a) * height];
}
