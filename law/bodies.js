// The room's things as bodies (matter.md: everything falls until it rests, unless it is held; Tabor,
// 2026-10-25: nothing is glued to a place, and matter touching matter collides). Each thing is a body of
// its matter (its friction: law/matter.js) and its shape, an upright cylinder as wide and as tall as it
// is (the caller's: the room's things). What hands do to them are acts on the room's chain (law/room.js):
// picked up (in a hand), carried (where the hand has it as it goes, coarse: a tilt or a carry act), let go
// (where the hand was). The rest is this law, the same for everyone who replays the chain:
//   Falling  let go, a body falls straight down until it meets what is under its middle: the table's top,
//            another body's top, the floor.
//   Edges    its middle past the edge of what it falls past, but its foot over it, the edge catches its
//            foot and it topples off, falling on to lie on its side where it lands, its length the way it
//            fell (its foot where its middle was, its top past it).
//   Pushed   a carried body meeting a resting one pushes it out of its way, a little at a time as the hand
//            goes (no further than they touch), and what that one meets it pushes in turn. Met low, its foot
//            slides; met higher than its friction on what it stands on can hold it upright (the push's
//            height times that friction past its half width), it leans over its far edge as far as it is
//            pushed in, and once its middle is past that edge, it topples over the way it was pushed.
//            Pushed past the edge of what holds it, it falls.
//   startBodies(start) → state;  stepBodies(state, line, ctx) (a stamped room line: { at, act });  bodiesOf(lines, ctx)
//   state: { [thing]: { at: [x, y, z] (its foot, m), lying: null | [ux, uy] (the way its length lies from its foot),
//     held: the key holding it | null, moved: ms (the act it came to rest by), fell: { from: [x, y, z], ms } | null
//     (let go above where it rests: falling from there then) } } (plain data: copied as any state is)
//   ctx: { room: { table: { x0, x1, y0, y1, top, matter }, floor: matter }, shapes: thing → { r, h, matter } }
//   start: thing → [x, y, z] (where the room was made with it)
// Lengths in metres from whole-millimetre acts; + − × ÷ and √ only, so every machine regrows the same places.
import { MATTER } from './matter.js';

const mm = (p) => p.map((v) => v / 1000);
const msOf = (l) => Date.parse(l.at);
const STEP_OF = 0.5; // a push is gone through in steps of half the carried body's width (a resolution, not a rule)

// the friction between two matters (each row's, ‰): their mean, as the rows' rubbing is read elsewhere (law/making.js)
const mu = (a, b) => Math.sqrt((MATTER[a].friction / 1000) * (MATTER[b].friction / 1000));
const hyp = (x, y) => Math.sqrt(x * x + y * y);

export const startBodies = (start) => Object.fromEntries(Object.entries(start).map(([thing, at]) => [thing, { at: at.slice(), lying: null, held: null, moved: 0, fell: null }]));

export function stepBodies(S, l, { room, shapes }) {
  const a = l.act;
  if (a?.kind !== 'room' || !S[a.thing] || !shapes[a.thing]) return S;
  const T = room.table;
  const onTable = (x, y) => x >= T.x0 && x <= T.x1 && y >= T.y0 && y <= T.y1;
  // how far (x, y) is from the table's top, in the plane (0: over it), and the way out from it
  const offTable = (x, y) => {
    const nx = Math.max(T.x0, Math.min(T.x1, x)),
      ny = Math.max(T.y0, Math.min(T.y1, y));
    const d = hyp(x - nx, y - ny);
    return { d, out: d > 0 ? [(x - nx) / d, (y - ny) / d] : [0, 0] };
  };
  // where a body's middle is (in the plane): standing, over its foot; lying, half its length along it
  const middle = (thing, b) => (b.lying ? [b.at[0] + (b.lying[0] * shapes[thing].h) / 2, b.at[1] + (b.lying[1] * shapes[thing].h) / 2] : [b.at[0], b.at[1]]);
  const span = (thing, b) => [b.at[2], b.at[2] + (b.lying ? 2 * shapes[thing].r : shapes[thing].h)]; // (its heights)
  // what holds up a body whose middle is over (x, y), from `below` down: another standing body's top, the table, the floor
  function under(self, x, y, below) {
    let z = 0,
      on = room.floor;
    if (onTable(x, y) && T.top <= below + 1e-9) [z, on] = [T.top, T.matter];
    for (const [id, o] of Object.entries(S))
      if (id !== self && shapes[id] && !o.held && !o.lying) {
        const top = o.at[2] + shapes[id].h;
        if (top <= below + 1e-9 && top > z && hyp(x - o.at[0], y - o.at[1]) < shapes[id].r) [z, on] = [top, shapes[id].matter];
      }
    return { z, on };
  }
  // a body let go (its foot at p), or moved where it does not stand: it falls to what holds it, or off an edge
  function fall(thing, p, ms) {
    const b = S[thing],
      s = shapes[thing];
    const [x, y] = p;
    const u = under(thing, x, y, p[2]);
    const edge = offTable(x, y);
    b.held = null;
    b.moved = ms;
    b.fell = p[2] > u.z + 1e-9 ? { from: p.slice(), ms } : null;
    if (!onTable(x, y) && p[2] > T.top - 1e-9 && edge.d < s.r) {
      // the edge catches its foot: it topples off outward, and lies on the floor
      b.at = [x, y, under(thing, x, y, 0).z];
      b.lying = edge.out;
      return;
    }
    b.at = [x, y, u.z];
    if (b.lying) {
      // lying, it rests as it lies if its middle is held up; past an edge, it falls on
      const [mx, my] = middle(thing, b);
      if (!onTable(mx, my) && b.at[2] >= T.top - 1e-9) b.at[2] = 0;
    }
  }
  // a body moved where it lies or stands: still held up under its middle, or it falls
  function held(id, ms) {
    const o = S[id];
    const [mx, my] = middle(id, o);
    if (under(id, mx, my, o.at[2]).z < o.at[2] - 1e-9) fall(id, o.lying ? o.at : [mx, my, o.at[2]], ms);
  }
  // a resting body pushed out of a carried one's way (A's foot at a, its shape sa, going the way m: a unit
  // vector in the plane, or null going straight up or down)
  function shove(thing, a, sa, ms, depth = 0, m = null) {
    for (const [id, o] of Object.entries(S)) {
      if (id === thing || !shapes[id] || o.held || depth > 8) continue;
      const so = shapes[id];
      const [lo, hi] = span(id, o);
      const [alo, ahi] = [a[2], a[2] + sa.h];
      if (ahi <= lo || alo >= hi) continue; // (one passes over the other)
      const [cx, cy] = middle(id, o);
      const dx = cx - a[0],
        dy = cy - a[1];
      const d = hyp(dx, dy),
        reach = sa.r + so.r;
      if (d >= reach) continue;
      const n = d > 0 ? [dx / d, dy / d] : [1, 0];
      if (!o.lying) {
        // met higher than its friction holds it upright: it leans over its far edge as far as it is pushed
        // in (the push's depth over its height), and past where its middle comes over that edge (its half
        // width over half its height), it topples over the way it was pushed
        const at = (Math.max(alo, lo) + Math.min(ahi, hi)) / 2 - lo;
        if (at * mu(so.matter, under(id, o.at[0], o.at[1], o.at[2]).on) > so.r) {
          const way = m ?? n; // (pushed going somewhere: that way; else out from the push)
          const into = reach - (dx * way[0] + dy * way[1]); // how far the push has gone into it, the way it goes
          if (into / at <= so.r / (so.h / 2)) continue; // (it leans, and rights itself)
          o.at = [o.at[0] + way[0] * so.r, o.at[1] + way[1] * so.r, o.at[2]];
          o.lying = way;
          o.moved = ms;
          held(id, ms);
          shove(id, o.at, { r: so.r, h: 2 * so.r }, ms, depth + 1, way);
          continue;
        }
      }
      o.at = [o.at[0] + n[0] * (reach - d), o.at[1] + n[1] * (reach - d), o.at[2]]; // (as far as they touch)
      o.moved = ms;
      held(id, ms); // (pushed past the edge of what holds it: it falls)
      shove(id, o.lying ? [...middle(id, o), o.at[2]] : o.at, o.lying ? { r: so.r, h: 2 * so.r } : so, ms, depth + 1, n);
    }
  }
  // a carried body moved from where it was to p: it pushes what it meets on the way, a step at a time
  function carry(thing, p, ms) {
    const b = S[thing],
      s = shapes[thing];
    const from = b.at;
    b.at = p.slice();
    const flat = hyp(p[0] - from[0], p[1] - from[1]);
    const way = flat > 0 ? [(p[0] - from[0]) / flat, (p[1] - from[1]) / flat] : null;
    const n = Math.max(1, Math.ceil(Math.max(flat, Math.abs(p[2] - from[2])) / (s.r * STEP_OF)));
    for (let k = 1; k <= n; k++) shove(thing, [from[0] + ((p[0] - from[0]) * k) / n, from[1] + ((p[1] - from[1]) * k) / n, from[2] + ((p[2] - from[2]) * k) / n], s, ms, 0, way);
  }
  const b = S[a.thing];
  if (a.act === 'place') {
    if (a.to === null) {
      b.held = a.by;
      b.lying = null; // (in the hand: upright)
      b.fell = null;
    } else if (b.held === a.by || b.held === null) {
      if (b.held) carry(a.thing, mm(a.to), msOf(l));
      fall(a.thing, mm(a.to), msOf(l));
    }
  } else if ((a.act === 'tilt' || a.act === 'carry') && b.held === a.by) carry(a.thing, mm(a.pos), msOf(l));
  return S;
}

export function bodiesOf(lines, { start, ...ctx }) {
  const S = startBodies(start);
  for (const l of lines) stepBodies(S, l, ctx);
  return S;
}

// Where a body is drawn at an instant (ms): falling from where it was let go (its weight alone: z drops
// ½gt²) until it meets where it rests; else where it rests. → [x, y, z]
export function bodyAt(b, ms, g = 9.81) {
  if (!b.fell || ms <= b.fell.ms) return b.at;
  const t = (ms - b.fell.ms) / 1000;
  const z = b.fell.from[2] - 0.5 * g * t * t;
  return z <= b.at[2] ? b.at : [b.at[0], b.at[1], z];
}
