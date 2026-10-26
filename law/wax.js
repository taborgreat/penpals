// The drips a room's candles let fall (matter-fixes.md §2). No one writes a drip:
// everyone regrows them from the room's chain alone: the signed acts that light the
// candles, put them out, carry and tilt them (law/room.js), and the lines that say
// where papers lie in it ({ kind: 'lay', paper, rest, size }, rest null: it left). Each candle is matter (law/candle.js): it burns while lit, its pool is
// what of it is past wax's melting heat, and what runs over its rim is a drip, as much
// as crossed: tilted, it falls from the rim's lowest point straight down onto whatever
// is under it (the caller's landing: frontend room/drops.js, room/table.js); upright,
// it runs down the candle's side into its holder's dish. A candle burnt down is
// replaced by a new one when it is next lit.
//
// Where each candle is, and how it leans, is its body's (law/bodies.js: carried, let go, falling, pushed and
// knocked over by what the hands do to any of the room's things), when the caller gives its bodies
// ({ room, shapes, start }); else where its last place or tilt act put it.
//   createRoomWax({ landing, bodies }) → { advance(lines, until) → drips so far, candle(which), at() }
//     (at: the ms the candles have been run to; advance again with a later until, or more lines)
//     landing([x, y], lying) → { on: 'paper', paper, q } | { on: 'table' | 'floor', at }
//     (lying: the papers in the room then, [{ paper, at, size }]); until: ms (the clock now)
//   dripsOf(lines, { landing, until })   the same, at once
//   a drip: { t (ms), which, from ([x, y, z] room m, or null in its dish), m (µg), amt, heat, on }
//   dripsOn(drips, paper, born) → the marks they make on a paper's record

import { CANDLES } from './room.js';
import { startBodies, stepBodies } from './bodies.js';
import { newCandle, stepCandle, spent, rimPoint, STEP_S } from './candle.js';
import { floorDiv } from './v1/int.js';
import { MAX_COORD, WAX_DRIP_MAX } from './v2/constants.js';

const STEP_MS = STEP_S * 1000;
// NEEDS RULING: a drip mark's amt (v2/sim.js) per µg of wax: the sheet's wax is in its own
// units, taken here from constants.js's own measure (a drop of 400000 about 3.5 mm across),
// as a dome half as tall as it is wide: about 3.8 mg.
export const AMT_PER_UG = 105;
const HEAT_MK = 400; // a drip mark's heat level: 0.4 °C above the air (v2/constants.js: Heat)

const msOf = (l) => Date.parse(l.at);
const stepOf = (ms) => floorDiv(ms, STEP_MS);
const metres = (p) => p.map((v) => v / 1000);
// (with bodies, any act that moves a thing may move a candle: it may be pushed)
// (and who comes and goes: the last one to leave puts the candles out, rooms.md §1b)
const isWaxy = (l, bodies) =>
  l.kind === 'lay' || l.kind === 'enter' || l.kind === 'leave' || CANDLES.includes(l.act?.thing) || (!!bodies && l.act?.kind === 'room' && ['place', 'tilt', 'carry'].includes(l.act.act));

// The candles from the start, and what they have let fall.
function fresh(bodies = null) {
  return {
    seen: 0,
    step: null,
    lying: [],
    drips: [],
    events: [],
    mark: null,
    here: [], // who is in the house (its enter and leave lines, the server's)
    bodies: bodies ? startBodies(bodies.start) : null,
    candles: CANDLES.map((thing) => ({ cd: newCandle(), lit: false, holder: null, pos: bodies?.start[thing] ?? null, deg: 0, way: [1, 0] })),
  };
}
// The candles just before the last acts known (what has fallen so far counted, not copied),
// to go on from when a line comes stamped after those acts but before where the candles
// have run to (the stamper's clock behind this one's).
const markOf = (s) => ({ ...structuredClone({ ...s, drips: [], mark: null }), fell: s.drips.length });
const fromMark = (s) => ({ ...structuredClone(s.mark), drips: s.drips.slice(0, s.mark.fell), mark: s.mark });
const cold = (c) => !c.lit && c.cd.rings.every((ring) => ring.cells.every((x) => x.E === 0));

function apply(s, l, bodies) {
  if (l.kind === 'enter' || l.kind === 'leave') {
    // the last one out puts the candles out as they go (rooms.md §1b: lit only while a being is here)
    s.here = l.kind === 'enter' ? [...new Set([...s.here, l.by])] : s.here.filter((b) => b !== l.by);
    if (l.kind === 'leave' && !s.here.length) for (const c of s.candles) c.lit = false;
    return;
  }
  if (l.kind === 'lay') {
    s.lying = s.lying.filter((x) => x.paper !== l.paper);
    if (l.rest) s.lying = [...s.lying, { paper: l.paper, at: l.rest, size: l.size }];
    return;
  }
  const a = l.act;
  if (s.bodies) {
    // where each candle is, held, standing, or lying the way it fell: its body's
    stepBodies(s.bodies, l, bodies);
    CANDLES.forEach((thing, i) => {
      const b = s.bodies[thing],
        c = s.candles[i];
      c.pos = b.at;
      c.holder = b.held;
      c.way = b.lying ?? [1, 0];
      c.deg = b.lying ? 90 : !b.held ? 0 : a.thing !== thing ? c.deg : a.act === 'tilt' ? a.deg : a.act === 'place' ? 0 : c.deg; // (taken up: upright)
    });
  }
  const c = s.candles[CANDLES.indexOf(a.thing)];
  if (!c || s.bodies) {
    if (c && a.act === 'light') {
      if (spent(c.cd)) c.cd = newCandle();
      c.lit = true;
    } else if (c && a.act === 'out') c.lit = false;
    return;
  }
  if (a.act === 'light') {
    if (spent(c.cd)) c.cd = newCandle(); // (a candle burnt down: a new one stands in its place)
    c.lit = true;
  } else if (a.act === 'out') c.lit = false;
  else if (a.act === 'place') {
    c.holder = a.to === null ? a.by : null;
    c.deg = 0; // picked up or set down: upright
    if (a.to !== null) c.pos = metres(a.to);
  } else if (a.act === 'tilt' && c.holder === a.by) {
    c.pos = metres(a.pos);
    c.deg = a.deg;
  }
}

// Run the candles on to `until`. → null, or the step of a line stamped before where they already are.
function run(s, lines, until, landing, bodies) {
  for (let i = s.seen; i < lines.length; i++) {
    const l = lines[i];
    if (!isWaxy(l, bodies)) continue;
    if (s.step !== null && stepOf(msOf(l)) < s.step) return stepOf(msOf(l));
    s.events.push([stepOf(msOf(l)), l]);
  }
  s.seen = lines.length;
  const end = stepOf(until);
  if (s.step === null) s.step = s.events.length ? s.events[0][0] : end;
  while (s.step <= end) {
    if (s.events.length && s.events.at(-1)[0] <= s.step) s.mark = markOf(s);
    while (s.events.length && s.events[0][0] <= s.step) apply(s, s.events.shift()[1], bodies);
    const t = s.step * STEP_MS;
    s.candles.forEach((c, which) => {
      for (const d of stepCandle(c.cd, { lit: c.lit, deg: c.deg })) {
        const heat = Math.min(255, floorDiv(d.T, HEAT_MK));
        if (!c.pos || c.deg === 0) s.drips.push({ t, which, from: null, m: d.m, amt: d.m * AMT_PER_UG, heat, on: { on: 'dish' } });
        else {
          const from = rimPoint(c.cd, c.pos, c.deg, c.way);
          s.drips.push({ t, which, from, m: d.m, amt: d.m * AMT_PER_UG, heat, on: landing([from[0], from[1]], s.lying) });
        }
      }
    });
    // nothing burning and every candle cold: nothing happens until the next act
    const next = s.events.length ? s.events[0][0] : end + 1;
    s.step = s.candles.every(cold) && next > s.step + 1 ? next : s.step + 1;
  }
  return null;
}

export function createRoomWax({ landing, bodies = null }) {
  let s = fresh(bodies);
  return {
    advance(lines, until) {
      const late = run(s, lines, until, landing, bodies);
      if (late !== null) {
        s = s.mark && late >= s.mark.step ? fromMark(s) : fresh(bodies);
        run(s, lines, until, landing, bodies);
      }
      return s.drips;
    },
    candle: (which) => s.candles[which],
    bodies: () => s.bodies, // (where each of the room's things is: law/bodies.js)
    at: () => (s.step === null ? null : s.step * STEP_MS),
  };
}

export const dripsOf = (lines, { landing, bodies = null, until = Date.now() }) => createRoomWax({ landing, bodies }).advance(lines, until);

// The drips that landed on a paper, as its record's marks take them: on the paper's clock
// (ms from its birth, `born`), in tenths of its units; a pour more than a mark holds, as
// several at that spot. → [{ t, x, y, amt, heat }]
export const dripsOn = (drips, paper, born) => dripsOnto(drips, (d) => (d.on?.on === 'paper' && d.on.paper === paper ? d.on.q : null), born);
// The drips that landed on any matter with a chain, where `where(drip)` gives each one's place on it (its
// units: { x, y }, or null: not on it): as dripsOn, for a house's table or floor (frontend room/drops.js).
export function dripsOnto(drips, where, born) {
  const c = (v) => Math.max(0, Math.min(MAX_COORD, Math.round(v * 10)));
  const out = [];
  for (const d of drips) {
    const q = where(d);
    if (!q) continue;
    for (let left = d.amt; left > 0; left -= WAX_DRIP_MAX) out.push({ t: d.t - born, x: c(q.x), y: c(q.y), amt: Math.min(left, WAX_DRIP_MAX), heat: d.heat });
  }
  return out;
}
