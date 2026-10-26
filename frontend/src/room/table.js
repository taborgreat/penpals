// The room as the law's drips land in it (matter-fixes.md §2): where each paper lies (law/paper.js:
// where it came to rest, its middle, read from the room's lay lines), and what is under a falling drip.
// Pure (no DOM): every machine lands drips with this same code, so a drip falls on the same paper, the
// same spot, for everyone.

import { landing, cornerOf } from './drops.js';
import { PX_PER_M } from '../scene/light/index.js';
import { HOLDER, STAMPER, PEN, JAR, PENDULUM, HAND, stamperRestOf, penRestOf, jarRestOf, pendulumRestOf } from '../scene/light/room.js';
import { CANDLE } from 'penpals-law/candle';
import { PENS, HOUSE } from 'penpals-law/room';

// Which papers lie in the room, and where, from the room's chain (its lay lines: { kind: 'lay', paper,
// rest: [x, y, z] mm, size }, rest null when it left). → [{ paper, at, size }]
export function lyingOn(lines) {
  const at = new Map();
  for (const l of lines) {
    if (l.kind !== 'lay') continue;
    if (!l.rest) at.delete(l.paper);
    else at.set(l.paper, { paper: l.paper, at: l.rest, size: l.size });
  }
  return [...at.values()];
}
export { cornerOf };

// A page `page` ([w, h] page px) on the room's table: where its page px (0, 0, 0) is
// (room m), centred on the room's page (light.js originOf).
export const originIn = (geom, [pageW, pageH]) => {
  const r = geom.pageRect;
  return [(r.x0 + r.x1) / 2 - pageW / 2 / PX_PER_M, (r.y0 + r.y1) / 2 + pageH / 2 / PX_PER_M, geom.pageOrigin[2]];
};

// The room's things as bodies (law/bodies.js): the table's top and the floor (wood), each thing's shape (an
// upright cylinder as wide and as tall as it is drawn: a candle in its holder, the stamper by its handle, the
// jar, each pen lying flat, the pendulum's stand and its bob on its thread, a being's bare hand) and its matter,
// and where the room was made with each.
export function bodiesContext(geom) {
  const t = geom.table;
  const candle = { r: HOLDER.radius, h: HOLDER.height + CANDLE.length, matter: 'metal' };
  const pen = { r: PEN.thick / 2, h: PEN.thick, matter: 'wood' };
  return {
    room: { table: { x0: t.x0, x1: t.x1, y0: t.y0, y1: t.y1, top: t.top, matter: 'wood' }, floor: 'wood' },
    shapes: {
      'candle-0': candle,
      'candle-1': candle,
      stamper: { r: STAMPER.grip, h: STAMPER.handle, matter: 'wood' },
      jar: { r: JAR.radius, h: JAR.height, matter: 'glass' },
      ...Object.fromEntries(PENS.map((p) => [p, pen])),
      // the pendulum: its stand a body, its bob hung from the arm's end (law/bodies.js bobAt)
      pendulum: {
        r: PENDULUM.foot,
        h: PENDULUM.height,
        matter: 'wood',
        bob: { arm: [PENDULUM.arm, 0, PENDULUM.height], len: PENDULUM.string, r: PENDULUM.bob, matter: 'metal', string: 'fiber' },
      },
      hand: { r: HAND.r, h: HAND.h, matter: 'skin' },
    },
    start: {
      'candle-0': geom.candles[0],
      'candle-1': geom.candles[1],
      stamper: stamperRestOf(geom),
      jar: jarRestOf(geom),
      pendulum: pendulumRestOf(geom),
      ...Object.fromEntries(PENS.map((p, k) => [p, penRestOf(geom, k)])),
    },
  };
}

// What the law needs to regrow a room's drips (law/wax.js): what is under a point, given the papers lying
// in it then; and where its candles are, as its bodies (bodiesContext).
export function waxContext({ geom }) {
  return {
    bodies: bodiesContext(geom),
    landing: (p, lying) => landing(geom, p, { papers: lying }),
  };
}

// The room's matter as its fire takes it (law/fire.js ctx): the house's shell (law/room.js HOUSE), the table's top
// and what else stands (its legs, the window's frame, the key corner: as they are drawn, each its law's matter), each
// thing's shape (its body's: a pen lies along the room's x, its length), a candle's holder, and a paper's units.
const ROW_OF = { table: 'wood', brass: 'metal' }; // (the drawn matter's name: its row in law/matter.js)
export function fireContext(geom) {
  const t = geom.table;
  const { shapes } = bodiesContext(geom);
  return {
    house: {
      size: geom.size,
      shell: HOUSE.shell,
      solids: [
        { id: 'table', matter: 'wood', box: [t.x0, t.y0, t.bottom, t.x1, t.y1, t.top] },
        ...geom.objects.filter((o) => o.box).map((o) => ({ id: o.id, matter: ROW_OF[o.matter] ?? o.matter, box: o.box })),
      ],
    },
    shapes: { ...shapes, ...Object.fromEntries(PENS.map((p) => [p, { ...shapes[p], length: PEN.length }])) },
    holder: { radius: HOLDER.radius, height: HOLDER.height },
    units: PX_PER_M,
  };
}
