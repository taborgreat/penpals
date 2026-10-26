// The house fire in the world (matter.md, "The test: start the house on fire"; one-matter.md Phase 8): a lit candle
// lying where it fell heats what it touches by the one rule for heat, phase and fire (law/heat.js), as everything
// does. No one writes a fire and nothing here names one: everyone grows it from the room's chain alone, as the
// drips are (law/wax.js). From the moment a lit candle lies (its body's: law/bodies.js), the matter about it, its
// own wax and wick (its molten pool as the candle law had it then), its holder, the wood under it, the papers lying
// there, is one grid of the heat rule at DX, run until nothing in it is warmer than the air by the rule's grain
// (it sleeps). What it leaves is facts of the matter it touched: each paper's cells burnt away, and when.
//
//   kindle({ at (its foot, room m), way ([dx, dy]: the way it lies), cd (law/candle.js, as it was), lying ([{ paper,
//     at: [x, y, z] mm (its middle), size: [w, h] (its units) }]), ctx }) → a fire:
//     { step(n) (n steps of DT), done, t (s run), burning() → [[x, y, z]] (room m: cells alight),
//       burnt(paper) → [{ t (s from its kindling), x, y, w, h }] (its units: each cell burnt away, its corner) }
//   ctx: { top (m: the face it lies on), under (that face's matter), within ([x0, y0, x1, y1] m: where that face
//     is), holder: { radius, height } (m: its holder's, standing where it stood), units (its units a metre: papers') }
//
// NEEDS RULING (law/candle.js's own): the grain the rule runs at here, DX (finer is truer and dearer), and its step
// (the time warm air takes to rise a cell at that grain).
import { createHeat, heatOf } from './heat.js';
import { MATTER, AIR } from './matter.js';
import { CANDLE, heightOf, liquidOf } from './candle.js';

export const DX = 0.01; // m
export const DT = DX; // s (as the house-fire test steps it)
const MARGIN = 0.08; // m of matter and air about it the grid holds (beyond it: the room's air, open)
const ABOVE = 0.2; // m of air over the face (its flame rises; past it the plume leaves the grid, open)
const BELOW = 0.04; // m of the face's matter under it (the table's thickness)

export function kindle({ at, way, cd, lying = [], ctx }) {
  const L = heightOf(cd),
    pool = liquidOf(cd);
  const R = CANDLE.radius,
    W = CANDLE.wick;
  const n = Math.hypot(way[0], way[1]) || 1;
  const u = [way[0] / n, way[1] / n];
  const tip = [at[0] + u[0] * (L + W), at[1] + u[1] * (L + W)];
  const holder = [at[0] - u[0] * ctx.holder.radius, at[1] - u[1] * ctx.holder.radius];
  const X0 = Math.min(at[0], tip[0], holder[0] - ctx.holder.radius) - MARGIN,
    Y0 = Math.min(at[1], tip[1], holder[1] - ctx.holder.radius) - MARGIN,
    X1 = Math.max(at[0], tip[0], holder[0] + ctx.holder.radius) + MARGIN,
    Y1 = Math.max(at[1], tip[1], holder[1] + ctx.holder.radius) + MARGIN;
  const Z0 = ctx.top - BELOW;
  const [nx, ny, nz] = [Math.round((X1 - X0) / DX), Math.round((Y1 - Y0) / DX), Math.round((BELOW + ABOVE) / DX)];
  const mid = (i, o) => o + (i + 0.5) * DX;
  const axisZ = ctx.top + DX + R; // (lying on the face: its middle a radius over the first cell above it)
  const wickFill = (Math.PI * CANDLE.wickRadius ** 2) / (DX * DX);
  const U = ctx.units;
  // each paper lying there: its rectangle (room m: its x along the room's, its y down the room's −y)
  const papers = lying.map((p) => {
    const [w, h] = p.size.map((v) => v / U);
    const [cx, cy] = [p.at[0] / 1000, p.at[1] / 1000];
    return { paper: p.paper, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, top: cy + h / 2, left: cx - w / 2 };
  });
  const [wx0, wy0, wx1, wy1] = ctx.within;
  // its wick: the cells its axis runs through, from its foot to past its top by the wick's length
  const wickCells = new Set();
  for (let s = 0; s <= L + W; s += DX / 4) {
    const ix = Math.floor((at[0] + u[0] * s - X0) / DX),
      iy = Math.floor((at[1] + u[1] * s - Y0) / DX),
      iz = Math.floor((axisZ - Z0) / DX);
    wickCells.add(`${ix},${iy},${iz}`);
  }
  function cellAt(ix, iy, iz) {
    const x = mid(ix, X0),
      y = mid(iy, Y0),
      z = mid(iz, Z0);
    if (z < ctx.top) return x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1 ? ctx.under : null;
    if ((x - holder[0]) ** 2 + (y - holder[1]) ** 2 <= ctx.holder.radius ** 2 && z < ctx.top + ctx.holder.height) return ['metal', Math.min(1, (ctx.top + ctx.holder.height - (z - DX / 2)) / DX)];
    if (z < ctx.top + DX && papers.some((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1)) return ['paper', MATTER.paper.ink.thickness / 1e6 / DX];
    const along = (x - at[0]) * u[0] + (y - at[1]) * u[1],
      across = -(x - at[0]) * u[1] + (y - at[1]) * u[0];
    const off = Math.hypot(across, z - axisZ);
    if (wickCells.has(`${ix},${iy},${iz}`)) return ['wick', wickFill];
    if (off <= R + DX / 2 && along >= 0 && along <= L) return 'wax';
    return null;
  }
  const h = createHeat({ size: [nx, ny, nz], dx: DX, dt: DT, cellAt, open: true });
  // the wick waxed (its pores full), its end alight; the pool molten about the wick's foot at the candle's top
  const ign = (MATTER.wax.heat.burns - AIR.temp) * 1000;
  const melt = (MATTER.wax.heat.melts - AIR.temp) * 1000;
  const ends = [];
  const paperCells = []; // [i, paper, ix, iy, m0]
  for (let iz = 0; iz < nz; iz++)
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++) {
        const i = h.index(ix, iy, iz);
        const c = h.at(ix, iy, iz);
        const x = mid(ix, X0),
          y = mid(iy, Y0);
        if (c.matter === 'paper') {
          const p = papers.find((q) => x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1);
          paperCells.push([i, p.paper, ix, iy, c.m]);
        }
        if (c.matter !== 'wick') continue;
        h.soak(i, 'wax', Math.floor((c.m * MATTER.wick.pores * MATTER.wax.density) / (MATTER.wick.density * 1000)));
        if ((x - at[0]) * u[0] + (y - at[1]) * u[1] > L) {
          h.heat(i, Math.round(((c.m * MATTER.wick.heat.holds + h.cells.held[i] * MATTER.wax.heat.holds) * ign) / 1000) - h.cells.E[i]);
          ends.push([ix, iy, iz]);
        }
      }
  // the pool: as much as the candle held molten, in the wax beside the wick where it leaves the wax
  for (const [ex, ey, ez] of ends.slice(0, 1)) {
    const back = [Math.round(ex - u[0]), Math.round(ey - u[1]), ez];
    const cells = [];
    for (const [ax, ay, az] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]) {
      const p = [back[0] + ax, back[1] + ay, back[2] + az];
      if (p.every((v, k) => v >= 0 && v < [nx, ny, nz][k]) && h.at(...p).matter === 'wax') cells.push(h.index(...p));
    }
    for (const i of cells) {
      const m = h.cells.m[i];
      h.heat(i, heatOf(MATTER.wax, m, melt) + Math.min(m, Math.floor(pool / cells.length)) * MATTER.wax.heat.fuses - h.cells.E[i]);
    }
  }
  // the lowest heat anything in it catches at (mK over the air): colder than that everywhere, with nothing alight,
  // nothing can catch again (with no flame, heat only spreads and leaves): the fire is over
  const catches = Math.min(...['paper', 'wax', 'wick', ctx.under].map((m) => MATTER[m].heat.burns).filter((b) => b !== null && b !== undefined)) - AIR.temp;
  const over = () => {
    let alight = false,
      hottest = 0;
    for (let iz = 0; iz < nz && !alight; iz++)
      for (let iy = 0; iy < ny && !alight; iy++)
        for (let ix = 0; ix < nx; ix++) {
          const c = h.at(ix, iy, iz);
          if (c.burning) {
            alight = true;
            break;
          }
          if (c.T > hottest) hottest = c.T;
        }
    return !alight && hottest < catches * 1000;
  };
  const burnt = new Map(); // paper → [{ t, x, y, w, h }]
  const gone = new Set();
  let steps = 0;
  const check = () => {
    for (const [i, paper, ix, iy, m0] of paperCells) {
      if (gone.has(i) || h.cells.m[i] * 2 > m0) continue; // (half of it burnt: a hole)
      gone.add(i);
      const p = papers.find((q) => q.paper === paper);
      const cx0 = X0 + ix * DX,
        cy1 = Y0 + (iy + 1) * DX;
      const list = burnt.get(paper) ?? [];
      list.push({ t: steps * DT, x: Math.max(0, Math.round((cx0 - p.left) * U)), y: Math.max(0, Math.round((p.top - cy1) * U)), w: Math.round(DX * U), h: Math.round(DX * U) });
      burnt.set(paper, list);
    }
  };
  const fire = {
    step(k = 1) {
      for (let s = 0; s < k && !fire.done; s++) {
        h.step();
        steps++;
        if (steps % Math.round(1 / DT) === 0) {
          check(); // (a second at a time: what has burnt away, and whether it is over)
          if (!h.awake || over()) fire.done = true;
        }
      }
      return fire;
    },
    done: false,
    get t() {
      return steps * DT;
    },
    // the cells alight now (room m: their middles)
    burning() {
      const out = [];
      for (let iz = 0; iz < nz; iz++)
        for (let iy = 0; iy < ny; iy++)
          for (let ix = 0; ix < nx; ix++) {
            const c = h.at(ix, iy, iz);
            if (c.burning) out.push([mid(ix, X0), mid(iy, Y0), mid(iz, Z0)]);
          }
      return out;
    },
    burnt: (paper) => burnt.get(paper) ?? [],
    heat: h,
  };
  return fire;
}

// A paper's burns as its record's marks take them (law/paper.js growPaper burns): each cell burnt away, on the
// paper's clock (ms from its birth, `born`; the fire kindled at `t`, room ms), in tenths of its units.
//   burnt: kindle()'s burnt(paper) → [{ t (s from the kindling), x, y, w, h }]
export const burntOn = (burnt, t, born) => burnt.map((b) => ({ t: Math.max(0, Math.round(t + b.t * 1000 - born)), x: b.x * 10, y: b.y * 10, w: b.w * 10, h: b.h * 10 }));
