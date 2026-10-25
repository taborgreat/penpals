// Where something let go of lands (rooms.md §3b): everything falls until it
// rests, straight down to the first surface below it. A drip of wax from a
// tilted candle lands on a sheet lying on the table (a drip act on that sheet,
// regrown with it), on the table itself (where drips collect for good), or on
// the floor; a candle set down comes to rest on the table or the floor.
//   geom    the room (light.js GEOM); at: [x, y] (room m) where it falls from
//   origin  the page's place in the room (light.js originOf)
//   sheets  the shared sheets on the table: [{ sheet, origin: [x, y], size: [w, h] }] (page px)
// → { on: 'sheet', sheet, q: { x, y } (that sheet's units), z } | { on: 'table' | 'floor', at: [x, y], z } (room m)

import { PX_PER_M } from '../scene/light/index.js';

export function landing(geom, [x, y], { origin, sheets = [] }) {
  const t = geom.table;
  if (x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1) {
    const px = (x - origin[0]) * PX_PER_M,
      py = (origin[1] - y) * PX_PER_M;
    const s = sheets.find((o) => px >= o.origin[0] && py >= o.origin[1] && px <= o.origin[0] + o.size[0] && py <= o.origin[1] + o.size[1]);
    if (s) return { on: 'sheet', sheet: s.sheet, q: { x: px - s.origin[0], y: py - s.origin[1] }, z: geom.pageOrigin[2] };
    return { on: 'table', at: [x, y], z: t.top };
  }
  return { on: 'floor', at: [x, y], z: 0 };
}

// Where a candle's wick is, standing at `foot` (room m), `height` tall, tilted `tilt`
// degrees toward the writer's right (+x): its drips fall from there.
export function wickOf(foot, height, tilt) {
  const a = (tilt * Math.PI) / 180;
  return [foot[0] + Math.sin(a) * height, foot[1], foot[2] + Math.cos(a) * height];
}
