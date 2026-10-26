// The house fire in the world (matter.md, "The test: start the house on fire"; one-matter.md Phase 8): from the moment
// a lit candle lies where it fell (its body's: law/bodies.js), the room's matter about it is one grid of the one rule
// for heat, phase and fire (law/heat.js), as everything is. No one writes a fire, nothing here burns by a clock or
// names a substance: everyone grows it from the room's chain alone, as the drips are (law/wax.js).
//
// The grid is the room's own matter (roomMatter: its shell, its table and what else stands, its things where their
// bodies are, the papers lying), at DX, in whole cells of the room's air (AIR_CELL: world.md's grain; the room's air
// is the coarser grid this one sits in): those the fallen candle and its holder lie in, and one more all round.
// - Its sides and its top are the room's air's: the heat its air passes them is the room's, and what rises out of
//   its top is too (vented: the caller hands it on). Its top is a room's air cell over what the candle fell onto, its
//   floor that matter's underside.
// - Wherever matter on one of its sides or its top comes a kelvin (the rule's grain) from the air's heat, it takes in
//   the room's air cells past that side, with the room's matter in them as it was: the fire is as large as the rule
//   carries it through matter, and the grid no larger.
// The candles standing in it are matter in it, as their law had them then; a standing flame stays its own law's
// (law/candle.js, at its own finer grain: at this one a wick's flame starves), its heat and smoke the room's air's.
// It runs until nothing in it is warmer than the air by the rule's grain, nothing alight (it sleeps). What it leaves
// is facts of the matter it touched: each paper's cells burnt away and when; char and ash where they lie; how hot
// each thing got (a holder past metal's melting heat runs: either passes, nothing is tuned).
//
//   kindle({ at (the fallen candle's foot, room m), way ([dx, dy]: the way it lies), which, cd (law/candle.js, as it
//     was), candles ([{ which, cd, lit, at (its foot), lying ([ux, uy] | null) }]: the room's candles), things ({ [thing]:
//     its body, law/bodies.js }: the room's other things), lying ([{ paper, at: [x, y, z] mm (its middle), size: [w, h]
//     (its units) }]), ctx }) → a fire:
//     { step(n) (n steps of DT), done, t (s run), burning() → [[x, y, z]] (room m: cells alight), smoke() → [[x, y,
//       z, µg]] (its smoke, summed in the room's air's cells, their middles), burnt(paper) →
//       [{ t (s from its kindling), x, y, w, h }] (its units: each cell burnt away, its corner), left() → [[x, y, z,
//       matter, µg]] (char and ash, where they lie), hottest() → { [owner]: °C }, flame() → { light (J shone so far),
//       K (its flames' heat: the hottest air on anything alight; 0 with none), released (J its burning has given),
//       fuel (what has burnt the most) }, vented (law/heat.js's: what rose out
//       of its top, nJ and µg), soot() (ppm of its smoke that is soot: what burnt, by each one's row), took (µg of the room's matter it took in as it grew), box ([x0, y0, z0, x1, y1, z1] room
//       m: the grid now), heat (the grid) }
//   ctx: { house: { size: [W, D, H], shell: { floor, walls, ceiling } (m thick: law/room.js HOUSE), solids: [{ id,
//     matter, box: [x0, y0, z0, x1, y1, z1] } | { id, matter, cyl: [x, y, r, z0, z1] }] (what stands in the room: the
//     table's top and legs, the window's frame, ...) }, shapes (law/bodies.js ctx shapes: each thing's r, h, matter;
//     with a length, it lies along the room's x: a pen), holder: { radius, height } (a candle's, m), units (a paper's
//     units a metre) }
//   reachOf({ at, way, cd, holder }) → [x0, y0, x1, y1] (room m): the cells of the room's air a fallen candle and its
//     holder lie in, and one more all round: where its grid begins
//
// NEEDS RULING (law/candle.js's own): the grain the rule runs at here, DX (finer is truer and dearer), and its step
// (the time warm air takes to rise a cell at that grain).
import { createHeat, heatOf } from './heat.js';
import { MATTER, AIR, idOf } from './matter.js';
import { CANDLE, heightOf, liquidOf } from './candle.js';

export const DX = 0.01; // m
export const DT = DX; // s (as the house-fire test steps it)
export const AIR_CELL = 0.1; // m: the room's air's grain (world.md Phase 3b: 10 cm cells)
const A = Math.round(AIR_CELL / DX); // (the grid's cells to one of the room's air's)
const GROWS = (1 | 2 | 4 | 8 | 16) << 6; // (law/heat.js edges: matter warm at its top or a side)
const PAPER = idOf('paper'),
  CHAR = idOf('char'),
  ASH = idOf('ash');

const cellOf = (v) => Math.floor(v / DX + 1e-9);
const down = (v) => Math.floor(v / AIR_CELL + 1e-9) * A;
const up = (v) => Math.ceil(v / AIR_CELL - 1e-9) * A;

// Where a fallen candle's grid begins (room m): the room's air cells it and its holder lie in, one more all round.
export function reachOf({ at, way, cd, holder }) {
  const L = heightOf(cd);
  const n = Math.hypot(way[0], way[1]) || 1;
  const u = [way[0] / n, way[1] / n];
  const tip = [at[0] + u[0] * (L + CANDLE.wick), at[1] + u[1] * (L + CANDLE.wick)];
  const h = [at[0] - u[0] * holder.radius, at[1] - u[1] * holder.radius];
  const x0 = Math.min(at[0], tip[0], h[0] - holder.radius),
    x1 = Math.max(at[0], tip[0], h[0] + holder.radius),
    y0 = Math.min(at[1], tip[1], h[1] - holder.radius),
    y1 = Math.max(at[1], tip[1], h[1] + holder.radius);
  return [(down(x0) - A) * DX, (down(y0) - A) * DX, (up(x1) + A) * DX, (up(y1) + A) * DX];
}

// The room's matter, cell by cell (global cells: x = gx·DX from the room's corner, the same for y; z = z0 + gz·DX):
// at(gx, gy, gz) → [matter, fill, owner] | null (its air). fill: the share of the cell it fills (a sheet, a wick, a
// thin dish: law/heat.js); owner: whose matter it is (a thing, a solid, the shell, the papers there).
function roomMatter({ z0, candles, things, lying, ctx }) {
  const { house, shapes, holder, units: U } = ctx;
  const [W, D, H] = house.size;
  const sh = house.shell;
  const R = CANDLE.radius;
  const wickFill = (Math.PI * CANDLE.wickRadius ** 2) / (DX * DX);
  // (a slab's share of a cell's height: what of [a, b] lies in the cell from z to z + DX)
  const share = (z, a, b) => Math.max(0, Math.min(1, (Math.min(b, z + DX) - Math.max(a, z)) / DX));
  const parts = [];
  // the candles: each its holder, its wick through it and past its top, its wax (as long as its law has it)
  const wicks = new Set();
  for (const c of candles) {
    if (!c.at) continue;
    const L = heightOf(c.cd);
    const [fx, fy, fz] = c.at;
    if (c.lying) {
      const n = Math.hypot(c.lying[0], c.lying[1]) || 1;
      const u = [c.lying[0] / n, c.lying[1] / n];
      const axisZ = fz + DX + R; // (lying on what holds it: its middle a radius over the first cell above that)
      const hold = [fx - u[0] * holder.radius, fy - u[1] * holder.radius]; // (its holder where it stood)
      parts.push({ owner: `holder-${c.which}`, matter: 'metal', at: (x, y, z) => ((x - hold[0]) ** 2 + (y - hold[1]) ** 2 <= holder.radius ** 2 ? share(z, fz, fz + holder.height) : 0) });
      for (let s = 0; s <= L + CANDLE.wick; s += DX / 4) wicks.add(`${cellOf(fx + u[0] * s)},${cellOf(fy + u[1] * s)},${cellOf(axisZ - z0)}:${c.which}`);
      parts.push({ owner: `candle-${c.which}`, matter: 'wick', at: (x, y, z, gx, gy, gz) => (wicks.has(`${gx},${gy},${gz}:${c.which}`) ? wickFill : 0) });
      parts.push({
        owner: `candle-${c.which}`,
        matter: 'wax',
        at: (x, y, z) => {
          const along = (x - fx) * u[0] + (y - fy) * u[1],
            across = -(x - fx) * u[1] + (y - fy) * u[0];
          return Math.hypot(across, z + DX / 2 - axisZ) <= R + DX / 2 && along >= 0 && along <= L ? 1 : 0;
        },
      });
    } else {
      const w0 = fz + holder.height,
        w1 = w0 + L;
      parts.push({ owner: `holder-${c.which}`, matter: 'metal', at: (x, y, z) => ((x - fx) ** 2 + (y - fy) ** 2 <= holder.radius ** 2 ? share(z, fz, w0) : 0) });
      parts.push({ owner: `candle-${c.which}`, matter: 'wick', at: (x, y, z, gx, gy) => (gx === cellOf(fx) && gy === cellOf(fy) && z + DX > w0 && z < w1 + CANDLE.wick ? wickFill : 0) });
      parts.push({ owner: `candle-${c.which}`, matter: 'wax', at: (x, y, z) => (Math.hypot(x - fx, y - fy) <= R + DX / 2 && z + DX / 2 >= w0 && z + DX / 2 <= w1 ? 1 : 0) });
    }
  }
  // the room's other things, each where its body is: one with a length lying along the room's x (a pen), the
  // others upright rounds as wide and as tall as they are (law/bodies.js shapes); not a hung weight (its stand is no
  // round: not yet matter here)
  const others = Object.entries(things ?? {}).filter(([thing, b]) => shapes[thing] && b?.at && !shapes[thing].bob && !thing.startsWith('candle-'));
  for (const [thing, b] of others) {
    const s = shapes[thing];
    const [fx, fy, fz] = b.at;
    if (s.length) parts.push({ owner: thing, matter: s.matter, at: (x, y, z) => (Math.abs(x - fx) <= s.length / 2 && Math.abs(y - fy) <= s.r ? share(z, fz, fz + s.h) : 0) });
    else parts.push({ owner: thing, matter: s.matter, at: (x, y, z) => ((x - fx) ** 2 + (y - fy) ** 2 <= s.r ** 2 ? share(z, fz, fz + s.h) : 0) });
  }
  // what stands in the room (the table and the rest), and its shell about it: the floor's boards, the walls' and the
  // ceiling's plaster
  for (const o of house.solids) {
    if (o.box) {
      const [x0, y0, a, x1, y1, b] = o.box;
      parts.push({ owner: o.id, matter: o.matter, at: (x, y, z) => (x >= x0 && x <= x1 && y >= y0 && y <= y1 ? share(z, a, b) : 0) });
    } else {
      const [cx, cy, r, a, b] = o.cyl;
      parts.push({ owner: o.id, matter: o.matter, at: (x, y, z) => ((x - cx) ** 2 + (y - cy) ** 2 <= r * r ? share(z, a, b) : 0) });
    }
  }
  const inside = (x, y) => x >= 0 && x <= W && y >= 0 && y <= D;
  parts.push({ owner: 'floor', matter: 'wood', at: (x, y, z) => (inside(x, y) ? share(z, -sh.floor, 0) : 0) });
  parts.push({ owner: 'ceiling', matter: 'plaster', at: (x, y, z) => (inside(x, y) ? share(z, H, H + sh.ceiling) : 0) });
  parts.push({
    owner: 'walls',
    matter: 'plaster',
    at: (x, y, z) => (!inside(x, y) && x >= -sh.walls && x <= W + sh.walls && y >= -sh.walls && y <= D + sh.walls ? share(z, -sh.floor, H + sh.ceiling) : 0),
  });
  // the papers lying, each a sheet on what holds it (stacked: their sheets together in one cell)
  const papers = lying.map((p) => {
    const [w, h] = p.size.map((v) => v / U);
    const [cx, cy, cz] = p.at.map((v) => v / 1000);
    return { paper: p.paper, x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2, z: cz, top: cy + h / 2, left: cx - w / 2 };
  });
  const sheet = MATTER.paper.ink.thickness / 1e6 / DX;
  function at(gx, gy, gz) {
    const x = (gx + 0.5) * DX,
      y = (gy + 0.5) * DX,
      z = z0 + gz * DX; // (the cell's foot)
    for (const p of parts) {
      const f = p.at(x, y, z, gx, gy, gz);
      if (f > 0) return [p.matter, f, p.owner];
    }
    const on = papers.filter((p) => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1 && z >= p.z - 1e-9 && z < p.z + DX - 1e-9);
    if (on.length) return ['paper', Math.min(1, on.length * sheet), `paper:${on.map((p) => p.paper).join(',')}`];
    return null;
  }
  return { at, papers };
}

export function kindle({ at, way, which = 0, cd, candles = null, things = {}, lying = [], ctx }) {
  const n = Math.hypot(way[0], way[1]) || 1;
  const u = [way[0] / n, way[1] / n];
  const reach = reachOf({ at, way, cd, holder: ctx.holder });
  // the room's candles, the fallen one as it fell (alight: the fire's now)
  const all = (candles ?? [{ which }]).map((c) => (c.which === which ? { ...c, cd, lit: true, at, lying: u } : c));
  const [W, D, H] = ctx.house.size;
  const sh = ctx.house.shell;
  // what it fell onto: the topmost face under its foot (the table's top), else the floor; and its underside
  const face = ctx.house.solids
    .filter((o) => o.box && at[0] >= o.box[0] && at[0] <= o.box[3] && at[1] >= o.box[1] && at[1] <= o.box[4] && o.box[5] <= at[2] + 1e-6)
    .reduce((best, o) => (!best || o.box[5] > best.box[5] ? o : best), null);
  const top = face ? face.box[5] : 0,
    under = face ? face.box[2] : -sh.floor;
  const z0 = top; // (the cells' z: z0 + gz·DX; what it lies on, whole cells under it)
  const M = roomMatter({ z0, candles: all, things, lying, ctx });
  // what bounds it: the shell's outside (past it, the world's)
  const lim = { x0: cellOf(-sh.walls), y0: cellOf(-sh.walls), x1: Math.ceil((W + sh.walls) / DX - 1e-9), y1: Math.ceil((D + sh.walls) / DX - 1e-9), z1: Math.ceil((H + sh.ceiling - z0) / DX - 1e-9) };
  const G = {
    x0: Math.max(lim.x0, Math.round(reach[0] / DX)),
    y0: Math.max(lim.y0, Math.round(reach[1] / DX)),
    x1: Math.min(lim.x1, Math.round(reach[2] / DX)),
    y1: Math.min(lim.y1, Math.round(reach[3] / DX)),
    z0: -Math.ceil((top - under) / DX - 1e-9),
  };
  G.z1 = Math.min(lim.z1, Math.round(((Math.ceil(top / AIR_CELL - 1e-9) + 1) * AIR_CELL - z0) / DX)); // (a room's air cell over it)
  let owner = null; // (each cell's owner, by index, as the grid is now)
  const sized = () => [G.x1 - G.x0, G.y1 - G.y0, G.z1 - G.z0];
  const grid = (from) => {
    const [nx, ny, nz] = sized();
    owner = new Array(nx * ny * nz);
    return createHeat({
      size: [nx, ny, nz],
      dx: DX,
      dt: DT,
      open: true,
      from,
      cellAt: (ix, iy, iz) => {
        const c = M.at(G.x0 + ix, G.y0 + iy, G.z0 + iz);
        if (!c) return null;
        owner[(iz * ny + iy) * nx + ix] = c[2];
        return [c[0], c[1]];
      },
    });
  };
  let h = grid(null);
  const middle = (i) => {
    const [ix, iy, iz] = h.coords(i);
    return [(G.x0 + ix + 0.5) * DX, (G.y0 + iy + 0.5) * DX, z0 + (G.z0 + iz + 0.5) * DX];
  };
  // every wick waxed (its pores full); the fallen candle's end alight, its pool molten about its wick's foot
  const ign = (MATTER.wax.heat.burns - AIR.temp) * 1000;
  const melt = (MATTER.wax.heat.melts - AIR.temp) * 1000;
  {
    const [nx, ny, nz] = sized();
    const wickOf = new Map(); // which → [[ix, iy, iz, along]]
    for (let i = 0; i < owner.length; i++) {
      if (!owner[i]?.startsWith('candle-') || h.at(...h.coords(i)).matter !== 'wick') continue;
      h.soak(i, 'wax', Math.floor((h.cells.m[i] * MATTER.wick.pores * MATTER.wax.density) / (MATTER.wick.density * 1000)));
      const w = Number(owner[i].slice('candle-'.length));
      const cn = all.find((x) => x.which === w);
      if (w !== which || !cn) continue;
      const [x, y, z] = middle(i);
      const along = cn.lying ? (x - cn.at[0]) * cn.lying[0] + (y - cn.at[1]) * cn.lying[1] : z - cn.at[2] - ctx.holder.height;
      if (!wickOf.has(w)) wickOf.set(w, []);
      wickOf.get(w).push([...h.coords(i), along]);
    }
    for (const [w, cells] of wickOf) {
      const cn = all.find((x) => x.which === w);
      const L = heightOf(cn.cd),
        pool = liquidOf(cn.cd);
      for (const [ix, iy, iz] of cells.filter((c) => c[3] > L)) {
        const i = h.index(ix, iy, iz);
        h.heat(i, Math.round(((h.cells.m[i] * MATTER.wick.heat.holds + h.cells.held[i] * MATTER.wax.heat.holds) * ign) / 1000) - h.cells.E[i]);
      }
      // the pool: as much as the candle held molten, in the wax beside the wick where it leaves the wax
      const foot = cells.filter((c) => c[3] <= L).reduce((a, c) => (!a || c[3] > a[3] ? c : a), null);
      if (!foot) continue;
      const near = [];
      for (const [ax, ay, az] of [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        const p = [foot[0] + ax, foot[1] + ay, foot[2] + az];
        if (p.every((v, k) => v >= 0 && v < [nx, ny, nz][k]) && h.at(...p).matter === 'wax') near.push(h.index(...p));
      }
      for (const i of near) {
        const m = h.cells.m[i];
        h.heat(i, heatOf(MATTER.wax, m, melt) + Math.min(m, Math.floor(pool / near.length)) * MATTER.wax.heat.fuses - h.cells.E[i]);
      }
    }
  }
  // the lowest heat any matter catches at (mK over the air): everything in it colder, and nothing alight, nothing
  // can catch again (with no flame, heat only spreads and leaves): the fire is over. (A cell asleep is within a kelvin
  // of the air.)
  const catches =
    Math.min(
      ...Object.values(MATTER)
        .map((m) => m.heat?.burns)
        .filter((b) => b !== null && b !== undefined),
    ) - AIR.temp;
  const over = () => {
    for (const i of h.live()) {
      const c = h.at(...h.coords(i));
      if (c.burning || c.T >= catches * 1000) return false;
    }
    return true;
  };
  // each paper's cells as the grid is now: [i, papers, gx, gy, key]
  let paperCells = [];
  const m0s = new Map(); // (global cell → its sheets' mass at first)
  const findPapers = () => {
    paperCells = [];
    for (let i = 0; i < owner.length; i++) {
      const o = owner[i];
      if (!o?.startsWith('paper:')) continue;
      const [ix, iy, iz] = h.coords(i);
      const key = `${G.x0 + ix},${G.y0 + iy},${G.z0 + iz}`;
      if (!m0s.has(key)) m0s.set(key, h.cells.m[i]);
      paperCells.push([i, o.slice('paper:'.length).split(','), G.x0 + ix, G.y0 + iy, key]);
    }
  };
  findPapers();
  const burnt = new Map(); // paper → [{ t, x, y, w, h }]
  const gone = new Set(); // (global cells burnt through)
  let steps = 0;
  const check = () => {
    for (const [i, ps, gx, gy, key] of paperCells) {
      if (gone.has(key) || (h.cells.mat[i] === PAPER && h.cells.m[i] * 2 > m0s.get(key))) continue; // (half of it burnt: a hole)
      gone.add(key);
      for (const paper of ps) {
        const p = M.papers.find((q) => q.paper === paper);
        const list = burnt.get(paper) ?? [];
        list.push({
          t: steps * DT,
          x: Math.max(0, Math.round((gx * DX - p.left) * ctx.units)),
          y: Math.max(0, Math.round((p.top - (gy + 1) * DX) * ctx.units)),
          w: Math.round(DX * ctx.units),
          h: Math.round(DX * ctx.units),
        });
        burnt.set(paper, list);
      }
    }
  };
  // how hot each thing got (mK over the air), kept as the grid grows
  const peaks = new Map();
  const keepPeaks = () => {
    for (let i = 0; i < owner.length; i++) {
      const o = owner[i];
      if (o && !o.startsWith('paper:') && h.peak[i] > (peaks.get(o) ?? 0)) peaks.set(o, h.peak[i]);
    }
  };
  // grown: past each side or its top where matter on it is warm, the room's air cells there
  const grow = () => {
    const e = h.edges >> 6;
    const was = { ...G };
    if (e & 2) G.x1 = Math.min(lim.x1, G.x1 + A);
    if (e & 4) G.x0 = Math.max(lim.x0, G.x0 - A);
    if (e & 8) G.y1 = Math.min(lim.y1, G.y1 + A);
    if (e & 16) G.y0 = Math.max(lim.y0, G.y0 - A);
    if (e & 1) G.z1 = Math.min(lim.z1, G.z1 + A);
    if (G.x0 === was.x0 && G.x1 === was.x1 && G.y0 === was.y0 && G.y1 === was.y1 && G.z1 === was.z1) return;
    keepPeaks();
    const before = h.total().matter;
    h = grid({ heat: h, at: [was.x0 - G.x0, was.y0 - G.y0, was.z0 - G.z0] });
    took += h.total().matter - before;
    findPapers();
  };
  let took = 0; // (µg of the room's matter it took in as it grew)
  const SECOND = Math.round(1 / DT);
  const fire = {
    step(k = 1) {
      for (let s = 0; s < k && !fire.done; s++) {
        h.step();
        steps++;
        if (h.edges & GROWS) grow();
        if (steps % SECOND === 0) {
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
    burning: () => [...h.live()].filter((i) => h.at(...h.coords(i)).burning).map(middle),
    burnt: (paper) => burnt.get(paper) ?? [],
    // what fire left, where it lies: char and ash (room m: their cells' middles; µg)
    left() {
      const out = [];
      const { mat, m, residue } = h.cells;
      for (let i = 0; i < mat.length; i++) {
        if (mat[i] === CHAR || mat[i] === ASH) out.push([...middle(i), mat[i] === CHAR ? 'char' : 'ash', m[i] + residue[i]]);
        else if (residue[i] > 0) out.push([...middle(i), MATTER[h.at(...h.coords(i)).matter]?.becomes?.burnt ?? 'ash', residue[i]]);
      }
      return out;
    },
    // its smoke where it is, summed in the room's air's cells (room m: their middles; µg)
    smoke() {
      const by = new Map();
      const { smoke } = h.cells;
      for (let i = 0; i < smoke.length; i++) {
        if (!(smoke[i] > 0)) continue;
        const k = middle(i)
          .map((v) => Math.floor(v / AIR_CELL + 1e-9))
          .join();
        by.set(k, (by.get(k) ?? 0) + smoke[i]);
      }
      return [...by].map(([k, ug]) => [...k.split(',').map((v) => (Number(v) + 0.5) * AIR_CELL), ug]);
    },
    // the hottest each thing got (°C)
    hottest() {
      keepPeaks();
      return Object.fromEntries([...peaks].map(([o, mK]) => [o, AIR.temp + mK / 1000]));
    },
    // its flames: all the light they have shone (J), and how hot they are (K: the hottest air on anything alight)
    flame() {
      let T = 0;
      const [nx, ny, nz] = sized();
      for (const i of h.live()) {
        const [ix, iy, iz] = h.coords(i);
        if (!h.at(ix, iy, iz).burning) continue;
        for (const [ax, ay, az] of [
          [0, 0, 1],
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
        ]) {
          const [x, y, z] = [ix + ax, iy + ay, iz + az];
          if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
          const c = h.at(x, y, z);
          if (c.matter === 'air' && c.T > T) T = c.T;
        }
      }
      // (and the heat its burning has released, J, and what has burnt the most: its fuel)
      const of = Object.entries(h.burnt.of);
      const released = of.reduce((n, [name, ug]) => n + ug * MATTER[name].heat.releases, 0) * 1e-9;
      const fuel = of.reduce((a, b) => (!a || b[1] > a[1] ? b : a), null)?.[0] ?? null;
      return { light: h.burnt.light * 1e-9, K: T > 0 ? AIR.temp + 273.15 + T / 1000 : 0, released, fuel };
    },
    // of its smoke, how much is soot (‰ of a million: what burnt, each by its row's soot)
    soot() {
      const of = Object.entries(h.burnt.of);
      const all = of.reduce((n, [, ug]) => n + ug, 0);
      return all > 0 ? of.reduce((n, [name, ug]) => n + ug * (MATTER[name].soot ?? 0), 0) / all : 0;
    },
    get vented() {
      return h.vented;
    },
    // the room's matter it has taken in as it grew (µg): with what it began with, all it has held
    get took() {
      return took;
    },
    get box() {
      return [G.x0 * DX, G.y0 * DX, z0 + G.z0 * DX, G.x1 * DX, G.y1 * DX, z0 + G.z1 * DX];
    },
    get heat() {
      return h;
    },
  };
  return fire;
}

// A paper's burns as its record's marks take them (law/paper.js growPaper burns): each cell burnt away, on the
// paper's clock (ms from its birth, `born`; the fire kindled at `t`, room ms), in tenths of its units.
//   burnt: kindle()'s burnt(paper) → [{ t (s from the kindling), x, y, w, h }]
export const burntOn = (burnt, t, born) => burnt.map((b) => ({ t: Math.max(0, Math.round(t + b.t * 1000 - born)), x: b.x * 10, y: b.y * 10, w: b.w * 10, h: b.h * 10 }));
