// A candle's melt pool and its drips (matter-fixes.md §2). No one writes a drip:
// everyone regrows them from the room's chain (backend store/rooms.js), the same
// on every machine.
//
// A candle burns while someone is in the room at night (the room's clock: the
// light's sunPlace has the sun down before 6:00 and from 18:00). Its top is a
// pool under the heat rule (v2/constants.js: Heat): rings of wax about the wick,
// the flame's heat going into the innermost each step, flowing ring to ring and
// leaving each cell to the air; a ring above its melting heat is liquid. While it
// burns, the flame melts its way down and the pool fills again.
//
// Tilting is the being's act: { kind: 'tilt', by, thing, pos, deg } on the room's
// chain, coarse like head motion (past TILT_STEP or a step moved, at most MAX_RATE
// a second), by whoever holds the candle (its last place act: picked up by them).
// Each step the law looks: is the pool's liquid past the lip at this tilt? What is
// past it gathers at the lip and falls as a drip (DROP_WAX of it, or a pour at
// once), as hot as the pool, straight down from the wick (drops.js wickOf) onto
// whatever is under it (drops.js landing): a sheet lying on the table, the table,
// the floor. Set down, a candle stands upright. Where the shared sheets lie is on
// the chain too: { kind: 'lay', sheet, slot } (slot null: it left the table).
//
//   dripsOf(lines, { night, wickOf, landing, until }) → [{ t, which, from, amt, heat, on }]
//     lines: the room's chain ({ n, at (ISO), by, kind, ... }); night(ms) → boolean
//     (nightIn(timeZone)); wickOf(foot, height, deg) → [x, y, z]; landing([x, y], lying)
//     → { on: 'sheet', sheet, q } | { on: 'table' | 'floor', at } with lying the sheets
//     on the table then ([{ sheet, slot }]); until: ms (the clock now)
//   t: ms (the clock); from: where it fell from (room m); amt, heat: as a drip mark takes them
//
// Integers on the pool's path; the fall and the landing are the helpers' arithmetic,
// the same on every machine.

import { HEAT_Q, WAX_CONDUCT, WAX_COOL, WAX_MELT, TICK_MS, DRY_EVERY, WAX_DRIP_MAX, MAX_COORD } from './v2/constants.js';
import { floorDiv, ceilDiv } from './v1/int.js';
import { MAX_RATE, STEP_M } from './being.js';

export const CANDLES = ['candle-0', 'candle-1'];
export const STEP_MS = TICK_MS * DRY_EVERY; // the heat rule's step
// The candle's top: RINGS rings about the wick, ring k (2k + 1) cells of CELL_WAX each
// (the sheet's wax units: a cell as deep as a thick drip).
export const RINGS = 8;
export const CELL_WAX = 1024;
export const POOL_WAX = RINGS * RINGS * CELL_WAX; // (Σ 2k + 1 over the rings: RINGS²)
const CELLS = Array.from({ length: RINGS }, (_, k) => 2 * k + 1);
const MASS = CELLS.map((c) => c * CELL_WAX);
export const FLAME_Q = 250000; // heat the flame gives the innermost ring a step (Tabor's to set: candle.js heatRate's share that reaches the wax)
export const REFILL = 32; // wax a step the burning flame melts down into the pool (the candle sinks)
export const LIP_DEG = 20; // tilted past this, the pool spills over its lip (Tabor's to set)
export const DROP_WAX = 1024; // wax gathered at the lip that falls as a drip
export const AMT_PER_WAX = 390; // a drip mark's amt (v2/sim.js) per wax of the pool: a drop about 3.5 mm across
const DRIP_WAX_MAX = floorDiv(WAX_DRIP_MAX, AMT_PER_WAX);
// The candle as it sinks: CANDLE_M tall when new, burnt down in BURN_MS of lit time, then
// a new one (candle.js HEIGHT, BURN_HOURS: the light's candle sinks by its wick cycles, within millimetres of this).
export const CANDLE_M = 0.25;
export const BURN_MS = 12 * 3600000;
export const heightOf = (litMs) => (CANDLE_M * (BURN_MS - (litMs % BURN_MS))) / BURN_MS;

// --- the tilt act ---

export const TILT_MAX = 90;
export const TILT_STEP = 5; // degrees: a tilt act only past this turn, a step moved, or across the lip

// Whether the held candle has tilted or moved enough since the last act sent (at `lastAt`
// ms) to be an act now: { pos, deg }.
export function isTiltAct(last, lastAt, next, now) {
  if (!last) return true;
  if (now - lastAt < 1000 / MAX_RATE) return false;
  const moved = Math.hypot(...next.pos.map((v, k) => v - last.pos[k]));
  return moved > STEP_M || Math.abs(next.deg - last.deg) >= TILT_STEP || next.deg > LIP_DEG !== last.deg > LIP_DEG;
}
// A tilt act made exact for the wire: mm, whole degrees.
export const quantizeTilt = ({ thing, pos, deg }) => ({ thing, pos: pos.map((v) => Math.round(v * 1000) / 1000), deg: Math.max(0, Math.min(TILT_MAX, Math.round(deg))) });
// A tilt act as anyone may send it: a candle, inside the room's reach, a whole degree.
export function checkTilt(act, size = [3.048, 3.353, 2.438]) {
  if (!act || !CANDLES.includes(act.thing) || !Array.isArray(act.pos) || act.pos.length !== 3) return false;
  if (!act.pos.every((v, k) => typeof v === 'number' && Number.isFinite(v) && v >= -1 && v <= size[k] + 1)) return false;
  return Number.isInteger(act.deg) && act.deg >= 0 && act.deg <= TILT_MAX;
}

// --- night, on the room's clock ---

// The room's clock in `timeZone` (no zone: UTC, the same for everyone): night is the
// sun down (light/air.js sunPlace: below the horizon before 6:00 and from 18:00).
export function nightIn(timeZone) {
  let hourOf;
  try {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: timeZone || 'UTC', hour12: false, hour: 'numeric' });
    hourOf = (ms) => Number(f.formatToParts(new Date(ms)).find((p) => p.type === 'hour').value) % 24;
  } catch {
    hourOf = (ms) => new Date(ms).getUTCHours();
  }
  return (ms) => {
    const h = hourOf(ms);
    return h < 6 || h >= 18;
  };
}

// --- the pool ---

export const newPool = () => ({ Q: new Array(RINGS).fill(0), lost: 0, lip: 0 });
const same = (a, b) => a.lost === b.lost && a.lip === b.lip && a.Q.every((q, k) => q === b.Q[k]);

// The pool now: how much is liquid (less what has spilled) and how hot (level above the air).
export function poolNow(p) {
  let liquid = 0,
    heat = 0;
  for (let k = 0; k < RINGS; k++) {
    const T = floorDiv(p.Q[k], MASS[k]);
    if (T >= WAX_MELT * HEAT_Q) {
      liquid += MASS[k];
      heat += MASS[k] * T;
    }
  }
  return { liquid: Math.max(0, liquid - p.lost), level: liquid ? Math.min(255, floorDiv(heat, liquid * HEAT_Q)) : 0 };
}

// One step of the heat rule on the candle's top (lit: the flame gives its heat), then the
// lip at this tilt. → the drips that fall ([{ amt, heat }]), the pool changed in place.
export function stepPool(p, lit, deg) {
  const T = p.Q.map((q, k) => floorDiv(q, MASS[k]));
  const dQ = new Array(RINGS).fill(0);
  if (lit) dQ[0] += FLAME_Q;
  for (let k = 0; k + 1 < RINGS; k++) {
    const d = T[k] - T[k + 1];
    if (d === 0) continue;
    const q = floorDiv(Math.abs(d) * CELL_WAX * WAX_CONDUCT * (2 * k + 2), 4096); // (the cells of ring k + 1 along ring k)
    dQ[k] -= d > 0 ? q : -q;
    dQ[k + 1] += d > 0 ? q : -q;
  }
  for (let k = 0; k < RINGS; k++) dQ[k] -= T[k] === 0 ? p.Q[k] : ceilDiv(T[k] * WAX_COOL * CELLS[k], 256);
  for (let k = 0; k < RINGS; k++) p.Q[k] = Math.max(0, p.Q[k] + dQ[k]);
  if (lit) p.lost = Math.max(0, p.lost - REFILL);
  const out = [];
  if (deg > LIP_DEG) {
    const { liquid, level } = poolNow(p);
    const over = liquid - floorDiv(POOL_WAX * (TILT_MAX - deg), TILT_MAX - LIP_DEG);
    if (over > 0) {
      p.lost += over;
      p.lip += over;
    }
    while (p.lip >= DROP_WAX) {
      const w = Math.min(p.lip, DRIP_WAX_MAX);
      out.push({ amt: w * AMT_PER_WAX, heat: level });
      p.lip -= w;
    }
  } else if (p.lip > 0) {
    p.lost = Math.max(0, p.lost - p.lip); // upright again: what gathered at the lip runs back
    p.lip = 0;
  }
  return out;
}

// --- the drips a room's chain makes ---

const msOf = (l) => Date.parse(l.at);
const stepOf = (ms) => floorDiv(ms, STEP_MS);

// When someone was in the room, from its enter and leave acts: [[from, to), ...] (ms).
function presence(lines, until) {
  const here = new Set();
  const out = [];
  let since = null;
  for (const l of lines) {
    if (l.kind !== 'enter' && l.kind !== 'leave') continue;
    const was = here.size > 0;
    if (l.kind === 'enter') here.add(l.by);
    else here.delete(l.by);
    if (!was && here.size) since = msOf(l);
    if (was && !here.size) {
      out.push([since, msOf(l)]);
      since = null;
    }
  }
  if (since !== null && until > since) out.push([since, until]);
  return out;
}

// The steps at which `lit` changes, within presence: night begins and ends on the hour of
// the room's clock (every zone is a whole number of quarter hours off), so each quarter
// hour is looked at (and each presence's ends).
const QUARTER = 900000;
function litChanges(spans, night) {
  const out = []; // [step, lit]
  for (const [a, b] of spans) {
    let lit = night(a);
    out.push([stepOf(a), lit]);
    for (let h = (floorDiv(a, QUARTER) + 1) * QUARTER; h < b; h += QUARTER) {
      const n = night(h);
      if (n !== lit) out.push([stepOf(h), (lit = n)]);
    }
    if (lit) out.push([stepOf(b), false]);
  }
  return out;
}

export function dripsOf(lines, { night, wickOf, landing, until = Date.now() }) {
  const end = stepOf(until);
  const changes = litChanges(presence(lines, until), night);
  // every event on one clock of steps: lit changes, holding and tilting, sheets laid down
  const events = []; // [step, order, kind, data]
  changes.forEach(([s, lit], i) => events.push([s, 0, i, 'lit', lit]));
  const holder = {}; // thing → who holds it (a tilt counts only from them)
  lines.forEach((l, i) => {
    if (l.kind === 'place' && CANDLES.includes(l.thing)) events.push([stepOf(msOf(l)), 1, i, 'place', l]);
    if (l.kind === 'tilt') events.push([stepOf(msOf(l)), 1, i, 'tilt', l]);
    if (l.kind === 'lay') events.push([stepOf(msOf(l)), 1, i, 'lay', l]);
  });
  events.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const drips = [];
  const candles = CANDLES.map(() => ({ pool: newPool(), pos: null, deg: 0, litMs: 0 }));
  let lying = []; // [{ sheet, slot }]
  let lit = false;
  let step = events.length ? events[0][0] : end;
  let ei = 0;
  const cold = (c) => c.pool.lip === 0 && c.pool.Q.every((q) => q === 0); // (what spilled stays spilled until it burns again)
  while (step <= end) {
    // what happens at this step
    while (ei < events.length && events[ei][0] <= step) {
      const [, , , kind, data] = events[ei++];
      if (kind === 'lit') lit = data;
      else if (kind === 'lay') {
        lying = lying.filter((s) => s.sheet !== data.sheet);
        if (data.slot !== null) lying = [...lying, { sheet: data.sheet, slot: data.slot }].sort((a, b) => a.slot - b.slot);
      } else {
        const c = candles[CANDLES.indexOf(data.thing)];
        if (kind === 'place') {
          holder[data.thing] = data.to === null ? data.by : null;
          c.deg = 0; // picked up or set down: upright
          if (data.to) c.pos = data.to;
        } else if (holder[data.thing] === data.by) {
          c.pos = data.pos;
          c.deg = data.deg;
        }
      }
    }
    // the step itself, each candle under the heat rule
    let steady = true;
    candles.forEach((c, which) => {
      const before = { Q: [...c.pool.Q], lost: c.pool.lost, lip: c.pool.lip };
      const fell = stepPool(c.pool, lit, c.deg);
      if (lit) c.litMs += STEP_MS;
      for (const d of fell) {
        // (to the millimetre: a sine's last bit may differ between engines; the point it falls from does not)
        const from = wickOf(c.pos ?? [0, 0, 0], heightOf(c.litMs), c.deg).map((v) => Math.round(v * 1000) / 1000);
        drips.push({ t: step * STEP_MS, which, from, ...d, on: landing([from[0], from[1]], lying) });
      }
      if (fell.length || !same(before, c.pool) || c.deg > LIP_DEG) steady = false;
    });
    // nothing can drip until the next event: burning, every pool settled and every candle
    // upright; or nothing burning and every pool cold. On to it (lit time still counts).
    const next = ei < events.length ? events[ei][0] : end + 1;
    if (next > step + 1 && ((lit && steady) || (!lit && candles.every(cold)))) {
      if (lit) for (const c of candles) c.litMs += (Math.min(next, end + 1) - step - 1) * STEP_MS;
      step = next;
    } else step++;
  }
  return drips;
}

// The drips that landed on a sheet, as its record's marks take them: on the sheet's clock
// (ms from its birth, `born`), in tenths of its units. → [{ t, x, y, amt, heat }]
export function dripsOn(drips, sheet, born) {
  const c = (v) => Math.max(0, Math.min(MAX_COORD, Math.round(v * 10)));
  return drips.filter((d) => d.on?.on === 'sheet' && d.on.sheet === sheet).map((d) => ({ t: d.t - born, x: c(d.on.q.x), y: c(d.on.q.y), amt: d.amt, heat: d.heat }));
}
