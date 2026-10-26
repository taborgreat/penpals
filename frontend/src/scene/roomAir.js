// The room's air (world.md Phase 3b): a coarse grid of it, AIR_DX cells, under the one heat rule
// (law/heat.js). The candles' flames heat it (their burning's heat, less what leaves as light) and
// fill it with their smoke (what they burn: light/candle.js smokeRate); warm smoke rises, spreads
// under the ceiling and cools; an open window lets the room's air out where it is warmer than the
// outside's, and the outside's in; the smoke's grains settle and stick to the faces (the heat
// rule's settling, every SETTLE_S of the world's clock). Only smoke or moving air computes: a still
// room costs nothing. A room no one drew meanwhile is caught up in its own steps (while anything
// moves), then settled in one go. Scene only: none of it is recorded.
// A fire (law/fire.js) gives it what rises out of its own finer grid's top: its heat and its smoke, there. Of its
// smoke, so much is soot (the grains that darken it) as each source gave: a candle's wax its row's share, a fire's
// what burnt in it (law/fire.js soot), one share for the room's air (its smoke mixed).
//   createRoomAir(geom) → { to(worldS, { flames, fires, open, outside }), soot() (kg/m³ of the smoke's grains,
//     the room's mean), smoke() (µg in its air), sooty() (ppm of it that is soot), cells() ([[x, y, z, µg]]: where
//     it is), heat (the grid) }
//   roomAirOf(key, geom): one a space, kept while the page is (a room left and come back to is as it
//     would have been, watched)
import { createHeat } from 'penpals-law/heat';
import { matter, fire } from 'penpals-law';

const { MATTER, AIR } = matter;
export const AIR_DX = fire.AIR_CELL; // m (world.md: 10 cm cells; a fire's finer grid sits in them)
export const SETTLE_S = 3600; // s of the world's clock between settlings (a grain of time: Tabor's to set)
const BUDGET_MS = 6; // a frame's share of work catching up (more waits for the next frame)

// The time warm air takes to rise a cell: a candle's plume rises at about (g·Q / ρcT)^⅓ (its
// buoyancy flux's own speed: Morton, Taylor and Turner), Q a fed flame's heat.
const FLAME_W = (MATTER.wick.draws / 1e6) * (MATTER.wax.heat.releases / 1000);
const RISE = Math.cbrt((9.81 * FLAME_W) / (MATTER.air.density * MATTER.air.heat.holds * (AIR.temp + 273.15)));
export const AIR_DT = AIR_DX / RISE;

export function createRoomAir(geom) {
  const [W, D, H] = geom.size;
  const nx = Math.round(W / AIR_DX),
    ny = Math.round(D / AIR_DX),
    nz = Math.round(H / AIR_DX);
  const tb = geom.table;
  const cellOf = (p) => [Math.min(nx - 1, Math.max(0, Math.floor(p[0] / AIR_DX))), Math.min(ny - 1, Math.max(0, Math.floor(p[1] / AIR_DX))), Math.min(nz - 1, Math.max(0, Math.floor(p[2] / AIR_DX)))];
  const mid = (k) => (k + 0.5) * AIR_DX;
  const heat = createHeat({
    size: [nx, ny, nz],
    dx: AIR_DX,
    dt: AIR_DT,
    cellAt: (x, y, z) => (mid(x) > tb.x0 && mid(x) < tb.x1 && mid(y) > tb.y0 && mid(y) < tb.y1 && mid(z) > tb.bottom && mid(z) < tb.top ? 'wood' : null),
  });
  const w = geom.window;
  const windowFace = (x, y, z, k) => k === 3 && mid(x) > w.x0 && mid(x) < w.x1 && mid(z) > w.z0 && mid(z) < w.z1;
  const d = geom.door; // (in the near wall: its face k 4)
  const doorFace = (x, y, z, k) => !!d && k === 4 && mid(x) > d.x0 && mid(x) < d.x1 && mid(z) > d.z0 && mid(z) < d.z1;
  let open = '';
  let origin = null; // the world's clock (s) the air began at
  let k = 0; // its steps since (the clock it has come to: origin + k·AIR_DT, counted, never summed)
  const clock = () => origin + k * AIR_DT;
  const shine = MATTER.wax.heat.shines / 1000;
  const volume = W * D * H;
  let fed = 0,
    sootFed = 0; // (µg of smoke put in, and of soot in it: its share)
  const sooty = () => (fed > 0 ? sootFed / fed : MATTER.wax.soot);

  return {
    heat,
    // the air come to `t` (s, the world's clock): flames ([{ lit, pos (room m), heatRate (W), smokeRate
    // (g/s) }]: the light's), fires ([{ top (room m), heat (W), smoke (g/s) }]: what rises from each), the window
    // open or not, the door, the outside's heat (°C above the room's air)
    to(t, { flames = [], fires = [], open: o = false, door = false, outside = 0 } = {}) {
      if (`${o}|${door}` !== open) {
        open = `${o}|${door}`;
        heat.openings(o || door ? (x, y, z, k) => (o && windowFace(x, y, z, k)) || (door && doorFace(x, y, z, k)) : null);
      }
      heat.outside(Math.round(outside * 1000));
      if (origin === null || t < clock()) {
        origin = t; // (begun, or the clock set back: from here)
        k = 0;
        return;
      }
      const lit = flames.filter((f) => f.lit && f.smokeRate > 0);
      const rising = fires.filter((f) => f.heat > 0 || f.smoke > 0);
      const started = performance.now();
      while (origin + (k + 1) * AIR_DT <= t) {
        const last = clock(),
          next = origin + (k + 1) * AIR_DT;
        if (Math.floor(next / SETTLE_S) > Math.floor(last / SETTLE_S)) heat.settle(SETTLE_S);
        if (!lit.length && !rising.length && !heat.awake) {
          // still: nothing moves until t but the settling
          const steps = Math.floor((t - origin) / AIR_DT);
          const to = origin + steps * AIR_DT;
          for (let n = Math.floor(to / SETTLE_S) - Math.floor(next / SETTLE_S); n > 0; n--) heat.settle(SETTLE_S);
          k = steps;
          break;
        }
        for (const f of lit) {
          const i = heat.index(...cellOf(f.pos));
          heat.heat(i, Math.round(f.heatRate * (1 - shine) * AIR_DT * 1e9));
          const ug = Math.round(f.smokeRate * AIR_DT * 1e6);
          heat.smokeIn(i, ug);
          fed += ug;
          sootFed += ug * MATTER.wax.soot;
        }
        for (const f of rising) {
          const i = heat.index(...cellOf(f.top));
          heat.heat(i, Math.round(f.heat * AIR_DT * 1e9));
          const ug = Math.round(f.smoke * AIR_DT * 1e6);
          heat.smokeIn(i, ug);
          fed += ug;
          sootFed += ug * (f.soot ?? 0);
        }
        heat.step();
        k++;
        if (performance.now() - started > BUDGET_MS) break; // (the rest next frame)
      }
    },
    smoke: () => heat.total().smoke,
    // its smoke where it is: each cell with any, [[x, y, z (room m: its middle), µg]]
    cells() {
      const out = [];
      const { smoke } = heat.cells;
      for (let i = 0; i < smoke.length; i++) {
        if (!(smoke[i] > 0)) continue;
        out.push([mid(i % nx), mid(Math.floor(i / nx) % ny), mid(Math.floor(i / (nx * ny))), smoke[i]]);
      }
      return out;
    },
    soot: () => (heat.total().smoke * (sooty() / 1e6) * 1e-9) / volume,
    sooty,
    get at() {
      return origin === null ? null : clock();
    },
  };
}

const rooms = new Map();
export function roomAirOf(key, geom) {
  if (!rooms.has(key)) rooms.set(key, createRoomAir(geom));
  return rooms.get(key);
}
