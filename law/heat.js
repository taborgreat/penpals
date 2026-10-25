// The one rule for heat, phase and fire (matter.md; one-matter.md Phase 5). It
// names no substance: every matter obeys it by its row in law/matter.js.
//
//   Heat     a cell holds heat (its enthalpy above the room's air), passes it to
//            the cells it touches (by both their conductivities), and to the air
//            through the air's film; air holds heat too.
//   Phase    past its melting heat a cell takes its heat of melting and is liquid;
//            cooling, it gives it back and sets (phaseOf: the candle's wax is this).
//   Fire     a release loop: a burnable cell past its ignition heat, touching air,
//            breaks apart as fast as its matter burns over the faces it shows the
//            air, and no faster than the fresh air there lets it (each matter burns
//            with so much air: its row's). Its flame heats what feeds it: of its
//            burning's heat, as much as keeps the cell at its ignition heat goes back
//            into it, and the rest into the air at its faces (the flame), the air it
//            burnt with spent; what is left
//            of it is its residue (char, ash), the rest smoke. Of the flame's heat, its
//            fuel's `shines` share leaves as light (a sooty flame glows): straight out every
//            way alike (its 26 neighbours' ways) until it lands on matter, which takes it as
//            heat; the rest heats the air.
//            The hot air heats its neighbours, which may cross their own thresholds. No fire code: a cell
//            burns because it is hot enough and has air, and stops when its fuel is
//            gone.
//   Air      warm air is lighter and rises: an air cell warmer than the air cell
//            above it rises into its place (a cell a step: the step is the time warm
//            air takes to rise a cell), the coolest air beside it coming in under it and
//            the air it pushed up going down there (a turn of the air: so a flame draws
//            fresh air in at its foot); held under a ceiling, it slides aside into the
//            coolest air beside it. Smoke and spent air go with their air.
//            Between air cells heat also goes by the air's own conductivity.
//   Wicking  a porous matter (its row `draws`, with `pores`) touching a liquid takes it up into
//            its pores, as fast as it draws and as much as its pores hold, the liquid's heat
//            with it, and passes it on to the drier pores beside it while it is liquid; soaked, it warms as both together, and what it holds burns before it
//            does (as the liquid's row: a wet wick does not burn, its oil does). So a candle's
//            flame is as big as its wick draws, and goes on where its wick meets melted wax.
//   Falling  a liquid cell, or loose residue, with air beneath falls until it rests.
//   Beyond   past the grid's edge is the rest of the world at the room's air: heat
//            crosses each edge face as it would into that air. An open grid (a
//            place under the sky, or a test's box) lets warm air rise out of its top,
//            fresh air coming in under it; what leaves is counted (vented). An opening in
//            its side (an open window, a door: world.md 3b) is the outside air at its own
//            heat: an air cell at it warmer than the outside goes out through it, smoke and
//            all, and the outside air comes in in its place (colder, it sinks: the room's warm
//            air leaves at the top of the opening, the outside's comes in at its foot). Air
//            colder than the room's sinks and, resting on something, slides into the warmer air
//            beside it (as warm air slides under a ceiling): it floods along the floor.
//   Settling smoke's grains fall through the air at their settling speed (Stokes: their size
//            and weight against the air's drag, slipping between its molecules) and stick
//            where they meet a face: falling onto it, or crossing the air's film to it as
//            they wander (Stokes–Einstein over the film's depth, the depth that gives the air
//            its film). So smoke thins. (settle(seconds): the caller's step for it.)
//   Sleep    only cells warmer or cooler than the air, burning, or carrying smoke
//            compute, with what they touch; a cold, still room costs nothing. A cell within
//            a kelvin of the air (the grain this rule keeps heat to) sleeps, keeping its heat,
//            until a neighbour's heat wakes it.
//
// Units: mass µg, heat nJ (1 J/(kg·K) = 1 nJ/(µg·K)), temperature mK above the air.
// Integers throughout (held in doubles below 2^53; the buoyant speed's square root
// is IEEE's, the same everywhere); deltas gathered over a step and then applied, cells
// visited in index order.
//
//   createHeat({ size: [nx, ny, nz], dx (m), dt (s), cellAt: (x, y, z) => matter name | [name, fill] | null (air),
//                opening?: (x, y, z, k) => whether the edge face beyond (k: up, +x, −x, +y, −y, down) is open })
//     (fill: the share of the cell it fills, the rest air: a sheet, a wick, a thin dish)
//     (dt: about the time warm air takes to rise a cell, dx over its buoyant speed: the caller's grain)
//     → { step(), heat(i, nJ), smokeIn(i, µg), outside(mK), openings(opening), settle(s), at(x, y, z), index(x, y, z), total(),
//         cells, peak, burnt, vented, settled, steps }

import { ROWS, MATTER, ORDER, idOf, AIR as ROOM } from './matter.js';
import { floorDiv } from './v1/int.js';
import { exp } from './dmath.js';

export const AIR_ID = idOf('air');
const KELVIN = 1000; // mK: the grain the rule keeps heat to (closer to the air than this, a cell sleeps)
// the 26 ways out of a cell (through its faces, edges and corners), up first
const WAYS = [];
for (const sz of [1, 0, -1]) for (const sy of [1, 0, -1]) for (const sx of [1, 0, -1]) if (sx || sy || sz) WAYS.push([sx, sy, sz]);
const meltsOf = (row) => row.heat.melts !== null && row.heat.melts !== undefined && !!row.heat.fuses;
const burnsOf = (row) => row.heat.burns !== null && row.heat.burns !== undefined && !!row.heat.releases;

// A cell's temperature above the room's air (mK) and how much of it is liquid (of 65536), from its
// mass (µg) and heat (nJ above the air): sensible to its melting heat, then its heat of melting,
// then sensible above. One rule for every matter (and the candle's wax: law/candle.js).
export function phaseOf(row, m, E) {
  if (m <= 0) return [0, 0];
  const C = m * row.heat.holds; // nJ / K
  if (!meltsOf(row)) return [floorDiv(E * 1000, C), 0];
  const MELT = (row.heat.melts - ROOM.temp) * 1000;
  const Es = floorDiv(C * MELT, 1000);
  if (E <= Es) return [floorDiv(E * 1000, C), 0];
  const Lm = m * row.heat.fuses;
  if (E <= Es + Lm) return [MELT, floorDiv((E - Es) * 65536, Lm)];
  return [MELT + floorDiv((E - Es - Lm) * 1000, C), 65536];
}
// The heat (nJ above the air) of m µg of a matter at T mK above the air (past its melting heat, molten).
export function heatOf(row, m, T) {
  const C = m * row.heat.holds;
  const molten = meltsOf(row) && T > (row.heat.melts - ROOM.temp) * 1000;
  return floorDiv(C * T, 1000) + (molten ? m * row.heat.fuses : 0);
}

// How fast smoke's grains settle and how fast they cross the air's film to a face (m/s), from the
// smoke's grains and the air's row: Stokes' drag with Cunningham's slip (the grains are about as
// small as the air's own mean free path), Stokes–Einstein's wandering, the film's depth from the
// air's conducting and its film.
const BOLTZMANN = 1.380649e-23,
  GAS = 8.314462618,
  ATM = 101325,
  G = 9.81;
export function grainSpeeds(smoke = MATTER.smoke, air = MATTER.air) {
  const g = smoke.grains;
  const T = ROOM.temp + 273.15;
  const mu = air.viscous * 1e-9; // Pa·s
  const free = (mu / ATM) * Math.sqrt((Math.PI * GAS * T) / (2 * (air.molar / 1000))); // the air's mean free path, m
  const d = g.size * 1e-9;
  const slip = 1 + ((2 * free) / d) * (1.257 + 0.4 * exp((-1.1 * d) / (2 * free)));
  const falls = (g.density * d * d * G * slip) / (18 * mu);
  const wanders = (BOLTZMANN * T * slip) / (3 * Math.PI * mu * d); // m²/s
  const film = air.heat.conducts / 1000 / ROOM.film; // m: the air's film's depth
  return { falls, sticks: wanders / film };
}

export function createHeat({ size: [nx, ny, nz], dx, dt = 1, cellAt, open = false, opening = null }) {
  const N = nx * ny * nz;
  const A = dx * dx,
    V = dx * dx * dx;
  const LAYER = nx * ny;
  const mat = new Uint8Array(N),
    m = new Float64Array(N),
    E = new Float64Array(N),
    smoke = new Float64Array(N), // µg of smoke in an air cell (what burnt, gone up)
    spent = new Float64Array(N), // µg of an air cell's air already burnt with
    residue = new Float64Array(N), // µg a burning cell leaves, gathering
    held = new Float64Array(N), // µg of liquid in a porous cell's pores
    heldMat = new Uint8Array(N), // and of what
    peak = new Float64Array(N); // each cell's hottest (mK)
  const index = (x, y, z) => (z * ny + y) * nx + x;
  const muOf = (row) => Math.round(row.density * V * 1e9); // µg in a whole cell of it
  const AIR_MU = muOf(MATTER.air);
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const i = index(x, y, z);
        const c = cellAt(x, y, z) ?? 'air';
        const [name, fill] = Array.isArray(c) ? c : [c, 1];
        mat[i] = idOf(name);
        m[i] = name === 'air' ? AIR_MU : Math.max(1, Math.round(muOf(MATTER[name]) * fill));
      }
  const isAir = (i) => mat[i] === AIR_ID;
  // the cells with a face open to the outside (an open window, a door), and the outside's heat (mK)
  let openCells = [];
  const isOpen = new Uint8Array(N); // (a bit a face: k)
  function openings(fn) {
    isOpen.fill(0);
    openCells = [];
    if (!fn) return;
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          if (x && y && z && x < nx - 1 && y < ny - 1 && z < nz - 1) continue;
          const i = index(x, y, z);
          [z === nz - 1, x === nx - 1, x === 0, y === ny - 1, y === 0, z === 0].forEach((edge, k) => {
            if (edge && fn(x, y, z, k)) isOpen[i] |= 1 << k;
          });
          if (isOpen[i]) openCells.push(i);
        }
  }
  openings(opening);
  let outsideT = 0;
  // its neighbours, in a fixed order: up, +x, -x, +y, -y, down (-1: past the edge)
  const nb = (i, k) => {
    switch (k) {
      case 0:
        return i + LAYER < N ? i + LAYER : -1;
      case 1:
        return (i % nx) + 1 < nx ? i + 1 : -1;
      case 2:
        return i % nx > 0 ? i - 1 : -1;
      case 3:
        return (floorDiv(i, nx) % ny) + 1 < ny ? i + nx : -1;
      case 4:
        return floorDiv(i, nx) % ny > 0 ? i - nx : -1;
      default:
        return i >= LAYER ? i - LAYER : -1;
    }
  };
  const around = (i) => [nb(i, 0), nb(i, 1), nb(i, 2), nb(i, 3), nb(i, 4), nb(i, 5)];
  // conductances, nJ per mK a step, by the pair of matters (the air's film where one is air)
  const conduct = new Float64Array(256 * 256).fill(-1);
  function gOf(a, b) {
    const key = a * 256 + b;
    let g = conduct[key];
    if (g >= 0) return g;
    let W; // W/K across a face
    if (a === AIR_ID && b === AIR_ID) W = (ROWS[a].heat.conducts / 1000) * (A / dx);
    else if (a === AIR_ID || b === AIR_ID) W = ROOM.film * A;
    else {
      const ka = ROWS[a].heat.conducts / 1000,
        kb = ROWS[b].heat.conducts / 1000;
      W = ((2 * ka * kb) / (ka + kb)) * (A / dx);
    }
    g = Math.round(W * dt * 1e6);
    conduct[key] = g;
    return g;
  }
  // stability: a cell gives at most an eighth of what it holds a mK, a step, across one face
  const capMK = (i) => (stamp[i] === steps ? capC[i] : (tOf(i), capC[i]));

  // the cells awake (and so computing), and a step's temperatures
  const awake = new Set();
  const isAwake = new Uint8Array(N),
    isTouched = new Uint8Array(N),
    isMoved = new Uint8Array(N);
  const Tc = new Float64Array(N),
    Lc = new Int32Array(N),
    capC = new Float64Array(N),
    stamp = new Int32Array(N).fill(-1);
  let steps = 0;
  const tOf = (i) => {
    if (stamp[i] !== steps) {
      if (held[i] > 0) {
        // soaked: it and what it holds warm together (what it holds stays liquid)
        Tc[i] = floorDiv(E[i] * 1000, m[i] * ROWS[mat[i]].heat.holds + held[i] * ROWS[heldMat[i]].heat.holds);
        Lc[i] = 0;
      } else phaseInto(ROWS[mat[i]], m[i], E[i], i);
      capC[i] = floorDiv(m[i] * ROWS[mat[i]].heat.holds, 8000);
      stamp[i] = steps;
    }
    return Tc[i];
  };
  // phaseOf, into this step's temperatures (no arrays: it runs for every cell every step)
  function phaseInto(row, mi, Ei, i) {
    if (mi <= 0) {
      Tc[i] = 0;
      Lc[i] = 0;
      return;
    }
    const C = mi * row.heat.holds;
    if (!meltsOf(row)) {
      Tc[i] = floorDiv(Ei * 1000, C);
      Lc[i] = 0;
      return;
    }
    const MELT = (row.heat.melts - ROOM.temp) * 1000;
    const Es = floorDiv(C * MELT, 1000);
    if (Ei <= Es) {
      Tc[i] = floorDiv(Ei * 1000, C);
      Lc[i] = 0;
      return;
    }
    const Lm = mi * row.heat.fuses;
    if (Ei <= Es + Lm) {
      Tc[i] = MELT;
      Lc[i] = floorDiv((Ei - Es) * 65536, Lm);
      return;
    }
    Tc[i] = MELT + floorDiv((Ei - Es - Lm) * 1000, C);
    Lc[i] = 65536;
  }
  // how much liquid a porous cell's pores hold (µg) of a liquid row
  const poresHold = (i, liquid) => floorDiv(m[i] * ROWS[mat[i]].pores * liquid.density, ROWS[mat[i]].density * 1000);
  const burnt = { mass: 0, smoke: 0, residue: 0 };
  const vented = { smoke: 0, heat: 0, light: 0 }; // what rose (or shone) out of the grid
  const settled = { smoke: 0 }; // smoke's grains stuck to the faces they met
  // how many of a cell's faces are the grid's edge
  const edges = (i) => {
    const x = i % nx,
      y = floorDiv(i, nx) % ny,
      z = floorDiv(i, LAYER);
    return (x === 0) + (x === nx - 1) + (y === 0) + (y === ny - 1) + (z === 0) + (z === nz - 1);
  };
  const dE = new Float64Array(N),
    dS = new Float64Array(N),
    dP = new Float64Array(N);

  function step() {
    // the air at an opening is awake while it is not at the outside's heat
    for (const i of openCells) if (isAir(i) && Math.abs(tOf(i) - outsideT) >= KELVIN) awake.add(i);
    const live = Int32Array.from(awake).sort();
    for (const i of live) isAwake[i] = 1;
    const touchedList = [];
    const touched = {
      add(i) {
        if (!isTouched[i]) {
          isTouched[i] = 1;
          touchedList.push(i);
        }
      },
    };
    for (const i of live) touched.add(i);
    const add = (i, q) => {
      dE[i] += q;
      touched.add(i);
    };
    // heat across each face of an awake cell (a pair of awake cells once, from the lower)
    for (const i of live) {
      for (let k = 0; k < 6; k++) {
        const j = nb(i, k);
        if (j < 0 || (isAwake[j] && j < i)) continue;
        const lo = i < j ? i : j,
          hi = i < j ? j : i;
        const d = tOf(lo) - tOf(hi);
        if (d === 0) continue;
        const g = Math.min(gOf(mat[lo], mat[hi]), capMK(lo), capMK(hi));
        add(lo, -g * d);
        add(hi, g * d);
      }
    }
    // beyond the edge: the room's air (its heat is the room's: 0 above it)
    for (const i of live) {
      const e = edges(i);
      if (!e || tOf(i) === 0) continue;
      const g = Math.min(gOf(mat[i], AIR_ID), capMK(i));
      add(i, -e * g * tOf(i));
    }
    // wicking: a porous cell takes up the liquid it touches
    for (const i of live) {
      const row = ROWS[mat[i]];
      if (!row.draws || m[i] <= 0) continue;
      let can = Math.round(row.draws * dt);
      for (const j of around(i)) {
        if (can <= 0) break;
        if (j < 0 || isAir(j) || m[j] <= 0) continue;
        if (held[j] > 0) {
          // along the wick: from fuller pores to drier, while what they hold is liquid
          const liquid = ROWS[heldMat[j]];
          if (mat[j] !== mat[i] || (held[i] > 0 && heldMat[i] !== heldMat[j])) continue;
          if (!meltsOf(liquid) || tOf(j) < (liquid.heat.melts - ROOM.temp) * 1000) continue;
          const capI = poresHold(i, liquid),
            capJ = poresHold(j, liquid);
          const take = Math.min(can, floorDiv(held[j] * capI - held[i] * capJ, capI + capJ));
          if (take <= 0) continue;
          const q = floorDiv(E[j] * take, m[j] + held[j]);
          held[j] -= take;
          E[j] -= q;
          heldMat[i] = heldMat[j];
          held[i] += take;
          E[i] += q;
          stamp[i] = stamp[j] = -1;
          touched.add(j);
          can -= take;
          continue;
        }
        if (held[i] > 0 && heldMat[i] !== mat[j]) continue;
        tOf(j);
        if (!Lc[j]) continue;
        const room = poresHold(i, ROWS[mat[j]]) - held[i];
        const take = Math.min(can, room, floorDiv(m[j] * Lc[j], 65536));
        if (take <= 0) continue;
        const q = floorDiv(E[j] * take, m[j]);
        m[j] -= take;
        E[j] -= q;
        heldMat[i] = mat[j];
        held[i] += take;
        E[i] += q;
        stamp[i] = stamp[j] = -1;
        touched.add(j);
        can -= take;
      }
    }
    // fire: a burnable cell past its ignition heat with air at its faces breaks apart (a soaked one,
    // what it holds first)
    for (const i of live) {
      const soaked = held[i] > 0;
      const row = soaked ? ROWS[heldMat[i]] : ROWS[mat[i]];
      const fuel = soaked ? held[i] : m[i];
      if (!burnsOf(row) || fuel <= 0 || tOf(i) < (row.heat.burns - ROOM.temp) * 1000) continue;
      const airs = around(i).filter((j) => j >= 0 && isAir(j));
      if (!airs.length) continue;
      const fresh = airs.reduce((n, a) => n + Math.max(0, m[a] - spent[a] - dP[a]), 0);
      const take = Math.min(fuel, Math.round(row.heat.burnRate * airs.length * A * dt * 1e6), floorDiv(fresh, row.heat.air)); // g/(m²·s) over its open faces → µg; as the air allows
      if (take <= 0) continue;
      let need = take * row.heat.air; // the air it burns with, from its open faces in turn
      for (const a of airs) {
        const can = Math.min(need, Math.max(0, m[a] - spent[a] - dP[a]));
        dP[a] += can;
        need -= can;
      }
      const left = floorDiv(take * (row.heat.leaves ?? 0), 1000);
      const carried = floorDiv(E[i] * take, m[i] + held[i]); // the heat of what left it goes with it
      let out = take * row.heat.releases + carried; // and the burning's own
      if (soaked) held[i] -= take;
      else m[i] -= take;
      E[i] -= carried;
      stamp[i] = -1;
      // its flame keeps what is left of it at its ignition heat (as much as the burning gives)
      if (m[i] > 0) {
        const own = ROWS[mat[i]];
        const at = (row.heat.burns - ROOM.temp) * 1000;
        const want = floorDiv((m[i] * own.heat.holds + held[i] * (soaked ? row.heat.holds : 0)) * at, 1000);
        const keep = Math.min(out, Math.max(0, want - E[i] - dE[i]));
        add(i, keep);
        out -= keep;
      }
      residue[i] += left;
      burnt.mass += take;
      burnt.residue += left;
      burnt.smoke += take - left;
      // its light: every way alike, to the first matter that way
      const light = floorDiv(out * (row.heat.shines ?? 0), 1000);
      if (light > 0) {
        const way = floorDiv(light, WAYS.length);
        out -= way * WAYS.length;
        const x0 = i % nx,
          y0 = floorDiv(i, nx) % ny,
          z0 = floorDiv(i, LAYER);
        for (const [sx, sy, sz] of WAYS) {
          let x = x0 + sx,
            y = y0 + sy,
            z = z0 + sz;
          for (; x >= 0 && x < nx && y >= 0 && y < ny && z >= 0 && z < nz; x += sx, y += sy, z += sz) {
            const j = index(x, y, z);
            if (!isAir(j)) {
              add(j, way);
              break;
            }
          }
          if (x < 0 || x >= nx || y < 0 || y >= ny || z < 0 || z >= nz) vented.light += way;
        }
      }
      const share = floorDiv(out, airs.length);
      airs.forEach((a, k) => add(a, k === 0 ? out - share * (airs.length - 1) : share));
      dS[airs[0]] += take - left; // (the smoke into the air above it, else beside it)
    }
    for (const i of touchedList) {
      E[i] += dE[i];
      dE[i] = 0;
      if (dS[i]) smoke[i] = Math.max(0, smoke[i] + dS[i]);
      dS[i] = 0;
      if (dP[i]) spent[i] = Math.max(0, spent[i] + dP[i]);
      dP[i] = 0;
    }
    steps++;
    // a cell burnt to nothing: its residue lies there now, else air comes in
    for (const i of live) {
      if (m[i] > 0 || isAir(i)) continue;
      held[i] = 0;
      const what = ROWS[mat[i]].becomes?.burnt;
      const T = Tc[i]; // (as hot as it was)
      if (residue[i] > 0 && what && what !== 'smoke' && MATTER[what]) {
        mat[i] = idOf(what);
        m[i] = residue[i];
      } else {
        mat[i] = AIR_ID;
        m[i] = AIR_MU;
      }
      E[i] = heatOf(ROWS[mat[i]], m[i], T);
      residue[i] = 0;
    }
    // warm air rises: from the top layer down, an air cell warmer than the air above it changes
    // places with it (so a warm cell goes up a cell a step); held under something, it slides into
    // the coolest air beside it that is cooler than it
    const swap = (i, j) => {
      [mat[i], mat[j]] = [mat[j], mat[i]];
      [m[i], m[j]] = [m[j], m[i]];
      [E[i], E[j]] = [E[j], E[i]];
      [smoke[i], smoke[j]] = [smoke[j], smoke[i]];
      [owedOnto[i], owedOnto[j]] = [owedOnto[j], owedOnto[i]];
      [owedDown[i], owedDown[j]] = [owedDown[j], owedDown[i]];
      [spent[i], spent[j]] = [spent[j], spent[i]];
      [residue[i], residue[j]] = [residue[j], residue[i]];
      [held[i], held[j]] = [held[j], held[i]];
      [heldMat[i], heldMat[j]] = [heldMat[j], heldMat[i]];
      stamp[i] = stamp[j] = -1;
      touched.add(i);
      touched.add(j);
    };
    const movedList = [];
    const moved = {
      has: (i) => isMoved[i] === 1,
      add(i) {
        if (!isMoved[i]) {
          isMoved[i] = 1;
          movedList.push(i);
        }
      },
    };
    const warm = Int32Array.from(touchedList.filter((i) => isAir(i)))
      .sort()
      .reverse();
    for (const i of warm) {
      if (moved.has(i)) continue;
      const up = i + LAYER;
      if (isOpen[i] && tOf(i) > outsideT) {
        // out through the opening: it goes, and the outside's air comes in in its place
        vented.smoke += smoke[i];
        vented.heat += E[i];
        smoke[i] = 0;
        spent[i] = 0;
        E[i] = heatOf(MATTER.air, m[i], outsideT);
        stamp[i] = -1;
        moved.add(i);
        continue;
      }
      if (open && up >= N && tOf(i) > 0) {
        // out of an open grid's top: it goes, and the room's air comes in under it
        vented.smoke += smoke[i];
        vented.heat += E[i];
        smoke[i] = 0;
        spent[i] = 0;
        E[i] = 0;
        stamp[i] = -1;
        continue; // (fresh, it is free for the warm air rising under it)
      }
      if (up < N && isAir(up) && !moved.has(up) && tOf(i) > tOf(up)) {
        // it rises; the coolest air beside it comes in under it, and the air it pushed up goes down
        // there (a turn of the air: a plume draws its air in at its foot)
        let side = -1;
        for (let k = 1; k < 5; k++) {
          const j = nb(i, k);
          if (j >= 0 && isAir(j) && !moved.has(j) && tOf(j) < tOf(i) && (side < 0 || tOf(j) < tOf(side))) side = j;
        }
        swap(i, up);
        if (side >= 0) {
          swap(i, side);
          moved.add(side);
        } else moved.add(i);
        moved.add(up); // (the air come in under it may rise on: a warm column rises as one)
        continue;
      }
      if (up < N && isAir(up)) continue; // (the air above is as warm: it stays)
      let best = -1;
      for (let k = 1; k < 5; k++) {
        const j = nb(i, k);
        if (j >= 0 && isAir(j) && !moved.has(j) && tOf(j) < tOf(i) && (best < 0 || tOf(j) < tOf(best))) best = j;
      }
      if (best >= 0) {
        swap(i, best);
        moved.add(best);
        moved.add(i);
      }
    }
    // cold air sinks: air colder than the room's, resting on something (the floor, the table), slides
    // into the warmest air beside it warmer than it (as warm air slides under a ceiling)
    for (const i of Int32Array.from(touchedList.filter((c) => isAir(c))).sort()) {
      if (moved.has(i) || tOf(i) > -KELVIN) continue;
      if (i >= LAYER && isAir(i - LAYER)) continue;
      let best = -1;
      for (let k = 1; k < 5; k++) {
        const j = nb(i, k);
        if (j >= 0 && isAir(j) && !moved.has(j) && tOf(j) > tOf(i) && (best < 0 || tOf(j) > tOf(best))) best = j;
      }
      if (best >= 0) {
        swap(i, best);
        moved.add(best);
        moved.add(i);
      }
    }
    // falling: a liquid cell, or loose residue, with air beneath changes places with it
    for (const i of Int32Array.from(touchedList).sort()) {
      if (i < LAYER || isAir(i)) continue;
      const j = i - LAYER;
      if (!isAir(j)) continue;
      const row = ROWS[mat[i]];
      tOf(i);
      const liquid = held[i] === 0 && Lc[i] === 65536;
      const loose = row === MATTER.ash || row === MATTER.char || row.strength === 0;
      if (!liquid && !loose) continue;
      swap(i, j);
    }
    // what stays awake: anything a kelvin or more from the air's heat, smoky, or burning down
    awake.clear();
    for (const i of live) isAwake[i] = 0;
    for (const i of movedList) isMoved[i] = 0;
    for (const i of touchedList) {
      isTouched[i] = 0;
      const t = tOf(i);
      if (t > peak[i]) peak[i] = t;
      if (t >= KELVIN || t <= -KELVIN || residue[i] > 0) awake.add(i); // (smoke at the air's heat goes nowhere)
    }
  }

  // Smoke's grains settling for `seconds`: falling a cell's share of the way down, onto what is under
  // it where that is not air; crossing the film to each face it touches (the grid's edges are faces).
  const speeds = grainSpeeds();
  const owedOnto = new Float64Array(N),
    owedDown = new Float64Array(N); // (each cell's share not yet a whole µg, carried to the next settling)
  function settle(seconds) {
    const Q = 65536;
    const fall = Math.min(Q, Math.round(((speeds.falls * seconds) / dx) * Q)),
      stick = Math.min(Q, Math.round(((speeds.sticks * seconds) / dx) * Q));
    let stuck = 0;
    for (let i = 0; i < N; i++) {
      if (!(smoke[i] > 0)) continue;
      let faces = 0;
      for (let k = 0; k < 6; k++) {
        const j = nb(i, k);
        if (j < 0 ? !(isOpen[i] & (1 << k)) : !isAir(j)) faces++;
      }
      const s0 = smoke[i];
      const a = s0 * Math.min(Q, faces * stick) + owedOnto[i];
      const onto = Math.min(s0, floorDiv(a, Q));
      owedOnto[i] = onto < s0 ? a - onto * Q : 0;
      const b = (s0 - onto) * fall + owedDown[i];
      const down = Math.min(s0 - onto, floorDiv(b, Q));
      owedDown[i] = down < s0 - onto ? b - down * Q : 0;
      const below = nb(i, 5);
      dS[i] -= onto + down;
      if (below >= 0 && isAir(below)) dS[below] += down;
      else if (below < 0 && isOpen[i] & 32)
        vented.smoke += down; // (out through an opening under it)
      else stuck += down;
      stuck += onto;
    }
    for (let i = 0; i < N; i++)
      if (dS[i]) {
        smoke[i] = Math.max(0, smoke[i] + dS[i]);
        dS[i] = 0;
      }
    settled.smoke += stuck;
    return stuck;
  }

  const nameOf = (i) => ORDER[mat[i]];
  return {
    step,
    index,
    settle,
    // the openings now (a window opened or shut): opening(x, y, z, k) as createHeat's
    openings,
    // a flame's smoke into an air cell (µg: what it burnt), with the flame's heat (heat())
    smokeIn(i, ug) {
      smoke[i] += ug;
      burnt.smoke += ug;
      awake.add(i);
    },
    // the outside air's heat (mK above the room's): what the openings let in
    outside(mK) {
      outsideT = mK;
    },
    // heat put into a cell (nJ): a flame against it, light it drank
    heat(i, nJ) {
      E[i] += nJ;
      stamp[i] = -1;
      awake.add(i);
    },
    // a porous cell soaked with µg of a liquid (a waxed wick), at the cell's heat
    soak(i, name, ug) {
      const T = tOf(i);
      heldMat[i] = idOf(name);
      held[i] = ug;
      E[i] = floorDiv((m[i] * ROWS[mat[i]].heat.holds + ug * MATTER[name].heat.holds) * T, 1000);
      stamp[i] = -1;
      awake.add(i);
    },
    at(x, y, z) {
      const i = index(x, y, z);
      const row = ROWS[mat[i]];
      const [T, liquid] = phaseOf(row, m[i], E[i]);
      return {
        matter: nameOf(i),
        m: m[i],
        E: E[i],
        T: held[i] > 0 ? tOf(i) : T,
        liquid,
        held: held[i],
        smoke: smoke[i],
        burning: (() => {
          const r = held[i] > 0 ? ROWS[heldMat[i]] : row;
          return burnsOf(r) && m[i] > 0 && tOf(i) >= (r.heat.burns - ROOM.temp) * 1000 && around(i).some((j) => j >= 0 && isAir(j));
        })(),
      };
    },
    // all the matter there is (µg): solids and liquids by kind, and smoke (the air's own aside)
    total() {
      const by = {};
      let all = 0;
      for (let i = 0; i < N; i++) {
        if (isAir(i)) continue;
        by[nameOf(i)] = (by[nameOf(i)] ?? 0) + m[i] + residue[i];
        if (held[i] > 0) by[ORDER[heldMat[i]]] = (by[ORDER[heldMat[i]]] ?? 0) + held[i];
        all += m[i] + residue[i] + held[i];
      }
      let sm = 0;
      for (let i = 0; i < N; i++) sm += smoke[i];
      return { by, matter: all, smoke: sm, all: all + sm };
    },
    cells: { mat, m, E, smoke, spent, held },
    peak,
    burnt,
    vented,
    settled,
    get awake() {
      return awake.size;
    },
    get steps() {
      return steps;
    },
  };
}
