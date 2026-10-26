// A candle as matter (matter-fixes.md §2; rooms.md §1b, §3b). No set amounts: its wax
// is cells under the one heat rule; the pool is every cell past wax's melting heat;
// a drip is whatever liquid crosses the rim, as much as crossed; the candle shortens
// by what burnt and what dripped, and the wax it was made with is always burnt +
// dripped + what is left.
//
// Its cells: rings DR wide about the wick, each a stack of cells DR tall (the top one
// part full); a cell holds its wax (µg) and its heat (nJ above the room's air: its
// enthalpy, so a melting cell stays at the melting heat until it has taken wax's heat
// of melting, and a setting one gives it back). Every ring holds heat in cells down to
// the deepest ring's top less SLAB; below that the candle's body is at the air's heat.
// Each step:
//   - lit, the wick (it holds what its pores do) lifts liquid from the ring at its foot as
//     fast as it draws, and the flame burns what the wick holds at that pace: that wax
//     leaves as smoke, and of the heat its burning releases, FLAME_TO_POOL goes into the
//     faces of wax its foot (just above the wax at the wick) can see: each ring's top
//     below it and each ring's wall facing it across the cup, as each faces it (cos / r²),
//     none behind taller wax;
//   - heat flows between touching cells (wax conducts) and from open faces to the air
//     (the air's film), a face bounded by the thinner cell (§1);
//   - liquid runs by the flow law (as ink pools level, and as a bead stands at a dry
//     edge) and within a step comes to rest: level in the tilted frame; it wets a dry
//     ring, or breaks over the rim, only where it stands at least as deep as its own
//     capillary length (√(tension / (density · g)): surface tension holds a thinner film
//     where it is); what stands above the rim's lowest point runs over and leaves: a drip.
//     Running, it stirs itself across (warm wax floats: a pool mixes sideways, not down).
// Integers throughout (µg, nJ, mK); the tilt by the law's own sine table.
//
//   newCandle() → state     stepCandle(state, { lit, deg }) → [{ m (µg), T (mK above the air), upright }]
//   heightOf(state) (m)     liquidOf(state) (µg)     massOf(state) (µg)     rimPoint(state, foot, deg, way)
//   (way: [ux, uy], the way it leans in the plane: toward +x unless said)
//   flameOf(state) → { fed (0..1), burntS }: what the drawn flame reads (scene/light/candle.js)
//   shapeOf(state) → [{ r0, r1, top, liquid } (m)]: each ring as it stands, its pool's depth (the drawn candle's)
//   HOLD_M (m): how deep liquid wax stands at a dry edge before it runs (its capillary length)

import { MATTER, AIR } from './matter.js';
import { phaseOf } from './heat.js';
import { COSSIN_Q14 } from './v1/tables.js';
import { floorDiv, isqrt } from './v1/int.js';

const WAX = MATTER.wax;
const WICK = MATTER.wick;

// A new candle (m), as the light draws it (scene/light/candle.js DIAMETER, HEIGHT, WICK_TRIM):
// its round, its length, how far its wick stands above the wax, its wick's thickness, and where
// its flame's foot (its blue base, where it heats the wax) stands above the wax at the wick.
export const CANDLE = Object.freeze({ radius: 0.011, length: 0.25, wick: 0.008, wickRadius: 0.00075, flameFoot: 0.002 });
// NEEDS RULING: the candle's grain and step for the heat rule (a resolution: the same rule at
// any; finer is truer and dearer), and the flame as it heats its wax: the share of its burning's
// heat that reaches the wax, and where its foot stands (CANDLE.flameFoot): not yet grown from the
// flame as matter (world.md 3b).
export const DR = 0.001;
export const STEP_S = 1;
export const SLAB = 30;
export const FLAME_TO_POOL = 0.03;

// --- from the matter, at this grain (integers) ---
const NR = Math.round(CANDLE.radius / DR);
const AREA = Array.from({ length: NR }, (_, k) => Math.PI * DR * DR * ((k + 1) ** 2 - k ** 2)); // m²: each ring's top
const FULL = AREA.map((a) => Math.round(WAX.density * a * DR * 1e9)); // µg in a full cell of each ring
const C_UG = WAX.heat.holds; // nJ / (µg·K) (1 J/(kg·K) = 1 nJ/(µg·K))
const MELT = (WAX.heat.melts - AIR.temp) * 1000; // mK above the air
const FUSE = WAX.heat.fuses; // nJ / µg
const POOL_SHARE = Math.round(WAX.heat.releases * FLAME_TO_POOL); // nJ into the wax / µg burnt
const K_W = WAX.heat.conducts / 1000; // W / (m·K)
const UP = AREA.map((a) => Math.round(((K_W * a) / DR) * STEP_S * 1e9)); // nJ / K a step: a cell to the one above
const OUT = Array.from({ length: NR }, (_, k) => Math.round(K_W * 2 * Math.PI * (k + 1) * DR * STEP_S * 1e9)); // to the ring outside (2πr·DR / DR)
const AIR_TOP = AREA.map((a) => Math.round(AIR.film * a * STEP_S * 1e9)); // a top open to the air
const AIR_SIDE = Math.round(AIR.film * 2 * Math.PI * CANDLE.radius * DR * STEP_S * 1e9); // the candle's side, a cell's height
const AIR_WALL = Array.from({ length: NR }, (_, k) => Math.round(AIR.film * 2 * Math.PI * k * DR * DR * STEP_S * 1e9)); // a ring's inner wall, open
const DRAW = WICK.draws * STEP_S; // µg the wick lifts a step
const WICK_HOLDS = Math.round(WAX.density * Math.PI * CANDLE.wickRadius ** 2 * CANDLE.wick * (WICK.pores / 1000) * 1e9);
const LAYERS = Math.round(CANDLE.length / DR);
const G = 9.81; // m/s²
export const HOLD_M = Math.sqrt(WAX.tension / 1000 / (WAX.density * G)); // how deep liquid wax stands at a dry edge before it runs
// heights in the law's own measure: sixteenths of a cell (DR), as integers
const SUB = 16;
const HOLD = Math.round((HOLD_M / DR) * SUB);
const FOOT = Math.round((CANDLE.flameFoot / DR) * SUB);
const SECTORS = 36; // (a tilted pool, looked at every 10° about the candle: the law's sine table's whole degrees)

const capOf = (m) => m * C_UG; // nJ / K
// A cell's heat above the air (mK) and how much of it is liquid (of 65536): the one rule for
// heat and phase (law/heat.js phaseOf, one-matter.md Phase 5), applied to wax.
const stateOf = (c) => phaseOf(WAX, c.m, c.E);
// the heat a µg of a cell's liquid carries with it (nJ)
const liquidHeat = (T) => floorDiv(C_UG * Math.max(T, MELT), 1000) + FUSE;

export function newCandle() {
  return {
    rings: FULL.map((f) => ({ base: LAYERS - SLAB, cells: Array.from({ length: SLAB }, () => ({ m: f, E: 0 })) })),
    wick: WICK_HOLDS, // µg of wax in the wick (a new candle's wick is waxed)
    burnt: 0,
    dripped: 0,
    fed: 0, // µg its flame burnt in the last step (0 out; less than the wick draws while it starves)
  };
}
// the wax a new candle is made of (µg): what burns, drips and is left always add up to it
export const MADE_UG = FULL.reduce((a, f) => a + f * LAYERS, 0) + WICK_HOLDS;

const massUg = (ring) => ring.cells.reduce((a, c) => a + c.m, 0);
// a ring's top (sixteenths of a cell above the candle's foot)
function topOf(cd, k) {
  const r = cd.rings[k];
  return r.base * SUB + floorDiv(massUg(r) * SUB, FULL[k]);
}
export const massOf = (cd) => cd.rings.reduce((a, r, k) => a + r.base * FULL[k] + massUg(r), 0) + cd.wick;
// how tall it stands (m): its rim
export const heightOf = (cd) => (Math.max(...cd.rings.map((_, k) => topOf(cd, k))) / SUB) * DR;
export const spent = (cd) => topOf(cd, 0) < SUB; // burnt down to its foot
// the liquid at a ring's top (µg): its cells from the top down while they hold liquid
function topLiquid(ring) {
  let sum = 0;
  for (let a = ring.cells.length - 1; a >= 0; a--) {
    const [, f] = stateOf(ring.cells[a]);
    if (!f) break;
    sum += floorDiv(ring.cells[a].m * f, 65536);
  }
  return sum;
}
export const liquidOf = (cd) => cd.rings.reduce((a, r) => a + topLiquid(r), 0);
// Its shape as it stands (matter-fixes §2: the drawn candle is the law's): each ring about the wick, its round (m),
// how high its top stands over the candle's foot (m), and how deep the liquid at its top is (m).
export const shapeOf = (cd) => cd.rings.map((r, k) => ({ r0: k * DR, r1: (k + 1) * DR, top: (topOf(cd, k) / SUB) * DR, liquid: (topLiquid(r) / FULL[k]) * DR }));
// Its flame as the scene draws it (matter-fixes §6): how well fed it was in the last step (0..1, of
// what the wick draws) and how long it has burnt in all (s, at that draw), for its wick's cycles.
export const flameOf = (cd) => ({ fed: (cd.fed ?? 0) / DRAW, burntS: cd.burnt / DRAW });

// Take up to `m` µg of liquid off a ring's top. → [µg taken, nJ it carried]
function takeLiquid(ring, m) {
  let got = 0,
    heat = 0;
  while (got < m && ring.cells.length) {
    const c = ring.cells[ring.cells.length - 1];
    const [T, f] = stateOf(c);
    const liq = floorDiv(c.m * f, 65536);
    if (!liq) break;
    const take = Math.min(liq, m - got);
    const e = take * liquidHeat(T);
    c.m -= take;
    c.E = Math.max(0, c.E - e);
    got += take;
    heat += e;
    if (c.m === 0) ring.cells.pop();
    else break; // (what is left of it is solid, or enough was taken)
  }
  return [got, heat];
}
// Pour `m` µg carrying `heat` nJ onto ring k's top, a cell at a time.
function pour(cd, k, m, heat) {
  const ring = cd.rings[k];
  let left = m,
    h = heat;
  while (left > 0) {
    const top = ring.cells[ring.cells.length - 1];
    const partial = top && top.m < FULL[k];
    const add = Math.min(left, partial ? FULL[k] - top.m : FULL[k]);
    const e = floorDiv(h * add, left);
    if (partial) {
      top.m += add;
      top.E += e;
    } else ring.cells.push({ m: add, E: e });
    left -= add;
    h -= e;
  }
}
// Every ring holds heat in cells down to the deepest ring's top less SLAB: its body there comes in
// (as cold as the air), so a wall beside a deep pool warms and melts like any wax.
function deepen(cd) {
  const floor = Math.max(0, Math.min(...cd.rings.map((r) => r.base + r.cells.length)) - SLAB);
  cd.rings.forEach((r, k) => {
    while (r.base > floor) {
      r.base--;
      r.cells.unshift({ m: FULL[k], E: 0 });
    }
  });
}

// The faces the flame's foot can see (from FOOT above the wax at the wick, on the axis): each
// ring's top below it and each ring's wall facing it across the cup, as each faces it (cos / r²)
// and none behind taller wax. → [[ring, cell, weight]]
function seen(cd) {
  const top = cd.rings.map((_, k) => topOf(cd, k));
  const fz = top[0] + FOOT;
  // is the line from the flame's foot to (radius r, height z), both in sixteenths, clear of taller wax?
  const clear = (r, z) => {
    for (let j = 1; (j + 1) * SUB < r; j++) {
      const rj = (j + 1) * SUB; // (ring j's outer edge, where it stands nearest the line)
      if (top[j] * r > fz * r + (z - fz) * rj) return false;
    }
    return true;
  };
  const out = [];
  cd.rings.forEach((ring, k) => {
    if (!ring.cells.length) return;
    const rm = k * SUB + SUB / 2; // the ring's middle
    if (top[k] < fz && clear(rm, top[k])) {
      const dz = fz - top[k];
      const r2 = rm * rm + dz * dz;
      out.push([k, ring.cells.length - 1, floorDiv(Math.round(AREA[k] * 1e8) * dz * 2 ** 20, r2 * isqrt(r2))]);
    }
    if (k === 0) return;
    // its wall, facing the axis: each of its cells above the ring inside it
    const ri = k * SUB;
    const face = Math.round(2 * Math.PI * k * DR * DR * 1e8); // a cell's wall (×1e8 m²)
    for (let a = ring.cells.length - 1; a >= 0; a--) {
      const z = (ring.base + a) * SUB + SUB / 2;
      if (z <= top[k - 1]) break;
      if (z > top[k] || !clear(ri, z)) continue;
      const dz = z - fz;
      const r2 = ri * ri + dz * dz;
      out.push([k, a, floorDiv(face * ri * 2 ** 20, r2 * isqrt(r2))]);
    }
  });
  return out;
}

// One step of the candle. lit: its flame burning; deg: tilted (0..90) toward +x.
// → what ran over its rim: [{ m (µg), T (mK above the air), upright }]
export function stepCandle(cd, { lit, deg = 0 }) {
  // the flame: the wick burns what it holds, as fast as it draws, and lifts again from its foot
  let heat = 0;
  cd.fed = 0;
  if (lit && !spent(cd)) {
    const burn = Math.min(DRAW, cd.wick);
    cd.wick -= burn;
    cd.burnt += burn;
    cd.fed = burn;
    heat = burn * POOL_SHARE;
    const [lifted] = takeLiquid(cd.rings[0], Math.min(DRAW, WICK_HOLDS - cd.wick));
    cd.wick += lifted;
  }
  deepen(cd);
  const dE = cd.rings.map((r) => new Array(r.cells.length).fill(0));
  if (heat) {
    // of the heat its burning releases, the wax's share goes into the faces its foot sees
    const faces = seen(cd);
    const sum = faces.reduce((a, f) => a + f[2], 0);
    let left = heat;
    if (sum)
      for (const [k, a, w] of faces) {
        const q = floorDiv(heat * w, sum);
        dE[k][a] += q;
        left -= q;
      }
    if (cd.rings[0].cells.length) dE[0][cd.rings[0].cells.length - 1] += left;
  }
  // heat: up each ring, across to the next ring out, to the body below, to the air
  const T = cd.rings.map((r) => r.cells.map((c) => stateOf(c)[0]));
  const bound = (k, a, g) => Math.min(g, floorDiv(capOf(cd.rings[k].cells[a].m), 8));
  cd.rings.forEach((ring, k) => {
    const n = ring.cells.length;
    for (let a = 0; a < n; a++) {
      const Ta = T[k][a];
      if (a + 1 < n) {
        const q = floorDiv(Math.min(bound(k, a, UP[k]), bound(k, a + 1, UP[k])) * (Ta - T[k][a + 1]), 1000);
        dE[k][a] -= q;
        dE[k][a + 1] += q;
      } else dE[k][a] -= floorDiv(bound(k, a, AIR_TOP[k]) * Ta, 1000); // its top, open to the air
      if (a === 0 && ring.base > 0) dE[k][a] -= floorDiv(bound(k, a, UP[k]) * Ta, 1000); // to the body below
      // its inner wall, where the ring inside stands lower: open to the air
      if (k > 0) {
        const inner = cd.rings[k - 1];
        if (ring.base + a - inner.base >= inner.cells.length) dE[k][a] -= floorDiv(bound(k, a, AIR_WALL[k]) * Ta, 1000);
      }
      // across to the ring outside it at the same height, or the candle's side
      if (k + 1 === NR) {
        dE[k][a] -= floorDiv(bound(k, a, AIR_SIDE) * Ta, 1000);
        continue;
      }
      const o = cd.rings[k + 1];
      const b = ring.base + a - o.base;
      if (b < 0 || b >= o.cells.length) continue; // (below its body: as cold as the air, through the cell below; above it: its own top's air)
      const q = floorDiv(Math.min(bound(k, a, OUT[k]), bound(k + 1, b, OUT[k])) * (Ta - T[k + 1][b]), 1000);
      dE[k][a] -= q;
      dE[k + 1][b] += q;
    }
  });
  cd.rings.forEach((r, k) => r.cells.forEach((c, a) => (c.E = Math.max(0, c.E + dE[k][a]))));
  stir(cd);
  return run(cd, Math.max(0, Math.min(89, deg))); // (lying flat, as at 89°: a film thinner than its capillary length still stands)
}

// The liquid that touches, stirred by its own running: warm wax floats, so a pool mixes across,
// not down. Each layer's whole-liquid cells in rings side by side even out to one heat a µg.
function stir(cd) {
  const byZ = new Map(); // layer → [[ring, cell]] (rings in order)
  cd.rings.forEach((r, k) =>
    r.cells.forEach((c, a) => {
      if (stateOf(c)[1] !== 65536) return;
      const z = r.base + a;
      if (!byZ.has(z)) byZ.set(z, []);
      byZ.get(z).push([k, a]);
    }),
  );
  for (const row of byZ.values()) {
    for (let s = 0; s < row.length;) {
      let e = s + 1;
      while (e < row.length && row[e][0] === row[e - 1][0] + 1) e++;
      if (e - s > 1) {
        let m = 0,
          E = 0;
        for (let i = s; i < e; i++) {
          const c = cd.rings[row[i][0]].cells[row[i][1]];
          m += c.m;
          E += c.E;
        }
        let left = E;
        for (let i = s; i < e; i++) {
          const c = cd.rings[row[i][0]].cells[row[i][1]];
          const q = i === e - 1 ? left : floorDiv(E * c.m, m);
          c.E = q;
          left -= q;
        }
      }
      s = e;
    }
  }
}

// The liquid comes to rest within a step, as the flow law's ticks leave it: the pool (its rings
// from the wick out, and the dry ones it stands deep enough beside to wet) lies level in the
// tilted frame, each ring looked at in SECTORS about the candle; whatever stands above the rim's
// lowest point (its outer ring, on the side tilted down) runs over there and leaves.
// (Levels in the tilted frame ×16384: cos × height − sin × how far along +x, in sixteenths.)
const XS = Array.from({ length: NR }, (_, k) =>
  Array.from({ length: SECTORS }, (_, s) => {
    const deg = s * 10;
    const cs = deg <= 180 ? COSSIN_Q14[2 * (deg % 180)] * (deg === 180 ? -1 : 1) : -COSSIN_Q14[2 * (deg - 180)];
    return floorDiv((k * SUB + SUB / 2) * cs, 16384);
  }),
);
function run(cd, deg) {
  const cos = COSSIN_Q14[2 * deg],
    sin = COSSIN_Q14[2 * deg + 1];
  const liq0 = cd.rings.map(topLiquid);
  if (!liq0.some((v) => v > 0)) return [];
  const taken = cd.rings.map((r, k) => (liq0[k] ? takeLiquid(r, liq0[k]) : [0, 0]));
  const V = taken.reduce((a, t) => a + t[0], 0);
  const heat = taken.reduce((a, t) => a + t[1], 0);
  if (!V) return [];
  const bed = cd.rings.map((_, k) => topOf(cd, k));
  const depth = (k, s, P) => (cos === 0 ? 0 : Math.max(0, floorDiv(P + sin * XS[k][s], cos) - bed[k]));
  const deepest = (k, P) => {
    let d = 0;
    for (let s = 0; s < SECTORS; s++) d = Math.max(d, depth(k, s, P));
    return d;
  };
  const holds = (k, P) => {
    let d = 0;
    for (let s = 0; s < SECTORS; s++) d += depth(k, s, P);
    return floorDiv(d * FULL[k], SUB * SECTORS);
  };
  // the pool: from the wick out, while the next ring is wet or the pool stands deep enough beside it to wet it
  const reach = (P) => {
    let n = 1;
    while (n < NR && (liq0[n] > 0 || deepest(n - 1, P) >= HOLD)) n++;
    return n;
  };
  const volume = (P) => {
    let v = 0;
    const n = reach(P);
    for (let k = 0; k < n; k++) v += holds(k, P);
    return v;
  };
  const levelOf = (W) => {
    let lo = Math.min(...bed) * cos - sin * NR * SUB - 1,
      hi = Math.max(...bed) * cos + sin * NR * SUB + cos * SUB * LAYERS + 1;
    while (hi - lo > 1) {
      const mid = lo + floorDiv(hi - lo, 2);
      if (volume(mid) <= W) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  let keep = V;
  let P = 0;
  if (cos === 0) keep = 0;
  else {
    P = levelOf(V);
    // the rim's lowest point: its outer ring, on the side tilted down, if the pool stands deep enough there
    const edge = cos * bed[NR - 1] - sin * NR * SUB;
    if (reach(P) === NR && depth(NR - 1, 0, P) >= HOLD && P > edge) {
      P = edge;
      keep = Math.min(V, volume(edge));
    }
  }
  // laid again ring by ring at that level (stirred: one heat a µg); the rest over the rim
  const n = keep ? reach(P) : 0;
  const shares = cd.rings.map((_, k) => (k < n ? holds(k, P) : 0));
  let laid = shares.reduce((a, b) => a + b, 0);
  for (let k = NR - 1; k >= 0 && laid > keep; k--) {
    const off = Math.min(shares[k], laid - keep); // (whole µg: what rounding over-laid comes off the outermost)
    shares[k] -= off;
    laid -= off;
  }
  if (laid < keep) shares[0] += keep - laid;
  let heatLeft = heat;
  shares.forEach((m, k) => {
    if (!m) return;
    const e = floorDiv(heat * m, V);
    pour(cd, k, m, e);
    heatLeft -= e;
  });
  const spilt = V - keep;
  if (spilt <= 0) return [];
  cd.dripped += spilt;
  return [{ m: spilt, T: Math.max(0, floorDiv((floorDiv(heatLeft, spilt) - FUSE) * 1000, C_UG)), upright: deg === 0 }];
}

// Where its rim's lowest point is, on the candle standing at `foot` (room m) tilted `deg` toward
// +x: the top of its outer ring on that side (its own frame turned by the law's sine table).
export function rimPoint(cd, foot, deg, way = [1, 0]) {
  const zc = (topOf(cd, NR - 1) / SUB) * DR;
  const cos = COSSIN_Q14[2 * deg] / 16384,
    sin = COSSIN_Q14[2 * deg + 1] / 16384;
  const out = CANDLE.radius * cos + zc * sin; // (how far out the way it leans)
  return [foot[0] + out * way[0], foot[1] + out * way[1], foot[2] - CANDLE.radius * sin + zc * cos].map((v) => Math.round(v * 1000) / 1000);
}
