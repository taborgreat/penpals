// Rain on the window (world.md Phase 5): the glass is the only place rain is followed drop by drop,
// so what it costs is bounded by the pane, as ink is by its paper. A pane standing upright takes
// rain only as the wind slants it: the drops a square metre of ground takes a second, times the
// wind's push against their fall. Each lands where its seed says (a tick on the glass: an event,
// heard), and stands as a bead (a cap, at the glass's wetting angle: law/matter.js glass.wetting)
// while the glass's grip on its edge (the water's tension across its width, by the glass's
// hysteresis) holds its weight; heavier, it runs down, as fast as its weight past that grip drags
// against the water's own viscosity, joining every bead it meets, and leaves the pane at its foot.
//   createPane({ width, height (m), seed, at(x, y) → room m }) →
//     { step(dt, { rain (mm/h), wind (m/s), t (s, the world's clock) }) → events (the landings), add(x, y, v),
//       beads: [{ x, y (m, from the pane's top left), v (m³), a (m: its round's radius), moving }],
//       heights(w, h) → Float32Array w × h (m of water standing on the glass) }
import { matter } from 'penpals-law';
import { knock } from '../sound/bands.js';

const { MATTER } = matter;
const W = MATTER.water,
  GLASS = MATTER.glass.wetting;
const G = 9.81,
  RAD = Math.PI / 180;
const theta = GLASS.angle * RAD,
  adv = (GLASS.angle + GLASS.hysteresis / 2) * RAD,
  rec = (GLASS.angle - GLASS.hysteresis / 2) * RAD;
const gamma = W.tension / 1000,
  mu = W.viscous * 1e-9;
const CAP = (2 - 3 * Math.cos(theta) + Math.cos(theta) ** 3) / Math.sin(theta) ** 3; // V = (π a³ / 3) · CAP
export const roundOf = (v) => Math.cbrt((3 * v) / (Math.PI * CAP));
const grip = (a) => gamma * 2 * a * (Math.cos(rec) - Math.cos(adv)); // N: what holds a bead's edge
const weight = (v) => W.density * v * G;
// the largest bead the glass holds
export const HELD = (() => {
  let lo = 1e-12,
    hi = 1e-5;
  for (let k = 0; k < 60; k++) {
    const v = Math.sqrt(lo * hi);
    if (weight(v) > grip(roundOf(v))) hi = v;
    else lo = v;
  }
  return lo;
})();

// rain as it falls (Marshall–Palmer's middle drop at that rate, Atlas's fall): its drop, how fast it
// falls, how many land on a square metre of ground a second
export function rainDrops(mm) {
  const D = 0.000895 * mm ** 0.21;
  const fall = 9.65 - 10.3 * Math.exp(-0.6 * D * 1000);
  const v = (Math.PI * D ** 3) / 6;
  return { D, fall, v, perM2: mm / 3600 / 1000 / v };
}

const fmix = (h) => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
const mix = (a, b) => fmix((fmix(a >>> 0) + Math.imul(b, 0x9e3779b9)) >>> 0) / 4294967296; // (MurmurHash3's finish, twice)

export function createPane({ width, height, seed = 1, at = (x, y) => [x, 0, -y] }) {
  const beads = new Set();
  let landed = 0; // drops landed so far (each its own seed)
  let owed = 0; // a share of a drop not yet landed
  const cell = 0.01; // m: the grid beads are found by (wider than any bead the glass holds still)
  const grid = new Map(); // cell → its beads (a held bead stays where it is: only a new or running one can meet another)
  const cellOf = (b) => Math.floor(b.x / cell) * 65536 + Math.floor(b.y / cell);
  const place = (b) => {
    b.cell = cellOf(b);
    if (!grid.has(b.cell)) grid.set(b.cell, new Set());
    grid.get(b.cell).add(b);
  };
  const lift = (b) => grid.get(b.cell)?.delete(b);
  // the beads it touches join it, the larger taking the smaller in at their middle by weight: → the one left
  const meet = (b) => {
    for (let reach = 1; ;) {
      let other = null;
      const cx = Math.floor(b.x / cell),
        cy = Math.floor(b.y / cell);
      for (let dx = -reach; dx <= reach && !other; dx++)
        for (let dy = -reach; dy <= reach && !other; dy++)
          for (const o of grid.get((cx + dx) * 65536 + cy + dy) ?? [])
            if (o !== b && Math.hypot(o.x - b.x, o.y - b.y) <= o.a + b.a) {
              other = o;
              break;
            }
      if (!other) return b;
      const [big, small] = other.v >= b.v ? [other, b] : [b, other];
      lift(big);
      lift(small);
      beads.delete(small);
      const v = big.v + small.v;
      big.x = (big.x * big.v + small.x * small.v) / v;
      big.y = (big.y * big.v + small.y * small.v) / v;
      big.v = v;
      big.a = roundOf(v);
      place(big);
      b = big;
      reach = Math.max(1, Math.ceil((2 * b.a) / cell)); // (grown: it may reach further)
    }
  };
  return {
    get beads() {
      return [...beads];
    },
    // a bead put on the glass (x, y: m from its top left; v: m³ of water), taking in what it touches
    add(x, y, v) {
      const b = { x, y, v, a: roundOf(v), moving: false };
      beads.add(b);
      place(b);
      return meet(b);
    },
    step(dt, { rain = 0, wind = 0, t = 0 } = {}) {
      const events = [];
      if (rain > 0 && wind > 0) {
        const r = rainDrops(rain);
        owed += r.perM2 * (wind / r.fall) * width * height * dt;
        const rate = owed / dt;
        while (owed >= 1) {
          owed -= 1;
          const k = landed++;
          const x = width * mix(seed, 2 * k),
            y = height * mix(seed, 2 * k + 1);
          const b = { x, y, v: r.v, a: roundOf(r.v), moving: false };
          beads.add(b);
          place(b);
          meet(b);
          const m = W.density * r.v;
          const tick = knock(0.5 * m * wind * wind, r.D / wind); // (it meets the glass at the wind's speed)
          events.push({
            kind: 'rain-glass',
            matter: true,
            t: t - owed / rate,
            world: t - owed / rate,
            rate,
            pos: at(x, y),
            bands: tick.bands,
            dur: tick.dur,
            attack: tick.dur / 2,
            seed: (seed ^ (k * 2654435761)) >>> 0,
          });
        }
      }
      // each bead held, or running down, taking in what it meets; at the pane's foot it leaves
      for (const b of [...beads]) {
        if (!beads.has(b)) continue; // (taken in already)
        const F = weight(b.v) - grip(b.a);
        b.moving = F > 0;
        if (!b.moving) continue;
        lift(b);
        b.y += (F / (6 * Math.PI * mu * b.a)) * dt;
        if (b.y - b.a >= height) {
          beads.delete(b);
          continue;
        }
        place(b);
        meet(b);
      }
      return events;
    },
    // the water standing on the glass: each bead a cap of a sphere (its round, its height)
    heights(w, h) {
      const out = new Float32Array(w * h);
      for (const b of beads) {
        const R = b.a / Math.sin(theta); // (the sphere it is a cap of)
        const x0 = Math.max(0, Math.floor(((b.x - b.a) / width) * w)),
          x1 = Math.min(w - 1, Math.ceil(((b.x + b.a) / width) * w)),
          y0 = Math.max(0, Math.floor(((b.y - b.a) / height) * h)),
          y1 = Math.min(h - 1, Math.ceil(((b.y + b.a) / height) * h));
        for (let j = y0; j <= y1; j++)
          for (let i = x0; i <= x1; i++) {
            const dx = ((i + 0.5) / w) * width - b.x,
              dy = ((j + 0.5) / h) * height - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 >= b.a * b.a) continue;
            const z = Math.sqrt(R * R - d2) - R * Math.cos(theta);
            if (z > out[j * w + i]) out[j * w + i] = z;
          }
      }
      return out;
    },
  };
}
