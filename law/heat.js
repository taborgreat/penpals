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
//            of it is its residue (char, ash), the rest smoke. The hot air heats its
//            neighbours, which may cross their own thresholds. No fire code: a cell
//            burns because it is hot enough and has air, and stops when its fuel is
//            gone.
//   Air      warm air is lighter and rises: an air cell warmer than the air cell
//            above it changes places with it (a cell a step: the step is the time
//            warm air takes to rise a cell); held under a ceiling, it slides aside
//            into the coolest air beside it. Smoke and spent air go with their air.
//            Between air cells heat also goes by the air's own conductivity.
//   Falling  a liquid cell, or loose residue, with air beneath falls until it rests.
//   Beyond   past the grid's edge is the rest of the world at the room's air: heat
//            crosses each edge face as it would into that air. An open grid (a
//            place under the sky, or a test's box) lets warm air rise out of its top,
//            fresh air coming in under it; what leaves is counted (vented).
//   Sleep    only cells warmer or cooler than the air, burning, or carrying smoke
//            compute, with what they touch; a cold, still room costs nothing.
//
// Units: mass µg, heat nJ (1 J/(kg·K) = 1 nJ/(µg·K)), temperature mK above the air.
// Integers throughout (held in doubles below 2^53; the buoyant speed's square root
// is IEEE's, the same everywhere); deltas gathered over a step and then applied, cells
// visited in index order.
//
//   createHeat({ size: [nx, ny, nz], dx (m), dt (s), cellAt: (x, y, z) => matter name | null (air) })
//     (dt: about the time warm air takes to rise a cell, dx over its buoyant speed: the caller's grain)
//     → { step(), heat(i, nJ), at(x, y, z), index(x, y, z), total(), cells, peak, burnt, steps }

import { ROWS, MATTER, ORDER, idOf, AIR as ROOM } from './matter.js';
import { floorDiv } from './v1/int.js';

export const AIR_ID = idOf('air');
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

export function createHeat({ size: [nx, ny, nz], dx, dt = 1, cellAt, open = false }) {
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
    peak = new Float64Array(N); // each cell's hottest (mK)
  const index = (x, y, z) => (z * ny + y) * nx + x;
  const muOf = (row) => Math.round(row.density * V * 1e9); // µg in a whole cell of it
  const AIR_MU = muOf(MATTER.air);
  for (let z = 0; z < nz; z++)
    for (let y = 0; y < ny; y++)
      for (let x = 0; x < nx; x++) {
        const i = index(x, y, z);
        const name = cellAt(x, y, z) ?? 'air';
        mat[i] = idOf(name);
        m[i] = muOf(MATTER[name]);
      }
  const isAir = (i) => mat[i] === AIR_ID;
  // its neighbours, in a fixed order: up, +x, -x, +y, -y, down (-1: past the edge)
  const around = (i) => {
    const x = i % nx,
      y = floorDiv(i, nx) % ny,
      z = floorDiv(i, LAYER);
    return [z + 1 < nz ? i + LAYER : -1, x + 1 < nx ? i + 1 : -1, x > 0 ? i - 1 : -1, y + 1 < ny ? i + nx : -1, y > 0 ? i - nx : -1, z > 0 ? i - LAYER : -1];
  };
  // conductances, nJ per mK a step, by the pair of matters (the air's film where one is air)
  const conduct = new Map();
  function gOf(a, b) {
    const key = a * 256 + b;
    let g = conduct.get(key);
    if (g !== undefined) return g;
    let W; // W/K across a face
    if (a === AIR_ID && b === AIR_ID) W = (ROWS[a].heat.conducts / 1000) * (A / dx);
    else if (a === AIR_ID || b === AIR_ID) W = ROOM.film * A;
    else {
      const ka = ROWS[a].heat.conducts / 1000,
        kb = ROWS[b].heat.conducts / 1000;
      W = ((2 * ka * kb) / (ka + kb)) * (A / dx);
    }
    g = Math.round(W * dt * 1e6);
    conduct.set(key, g);
    return g;
  }
  // stability: a cell gives at most an eighth of what it holds a mK, a step, across one face
  const capMK = (i) => floorDiv(m[i] * ROWS[mat[i]].heat.holds, 8000);

  // the cells awake (and so computing), and a step's temperatures
  const awake = new Set();
  const Tc = new Float64Array(N),
    Lc = new Int32Array(N),
    stamp = new Int32Array(N).fill(-1);
  let steps = 0;
  const tOf = (i) => {
    if (stamp[i] !== steps) {
      [Tc[i], Lc[i]] = phaseOf(ROWS[mat[i]], m[i], E[i]);
      stamp[i] = steps;
    }
    return Tc[i];
  };
  const burnt = { mass: 0, smoke: 0, residue: 0 };
  const vented = { smoke: 0, heat: 0 }; // what rose out of an open grid
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
    const live = [...awake].sort((a, b) => a - b);
    const touched = new Set(live);
    const add = (i, q) => {
      dE[i] += q;
      touched.add(i);
    };
    // heat across each face of an awake cell (a pair of awake cells once, from the lower)
    for (const i of live) {
      const nb = around(i);
      for (let k = 0; k < 6; k++) {
        const j = nb[k];
        if (j < 0 || (awake.has(j) && j < i)) continue;
        const [lo, hi] = i < j ? [i, j] : [j, i];
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
    // fire: a burnable cell past its ignition heat with air at its faces breaks apart
    for (const i of live) {
      const row = ROWS[mat[i]];
      if (!burnsOf(row) || m[i] <= 0 || tOf(i) < (row.heat.burns - ROOM.temp) * 1000) continue;
      const airs = around(i).filter((j) => j >= 0 && isAir(j));
      if (!airs.length) continue;
      const fresh = airs.reduce((n, a) => n + Math.max(0, m[a] - spent[a] - dP[a]), 0);
      const take = Math.min(m[i], Math.round(row.heat.burnRate * airs.length * A * dt * 1e6), floorDiv(fresh, row.heat.air)); // g/(m²·s) over its open faces → µg; as the air allows
      if (take <= 0) continue;
      let need = take * row.heat.air; // the air it burns with, from its open faces in turn
      for (const a of airs) {
        const can = Math.min(need, Math.max(0, m[a] - spent[a] - dP[a]));
        dP[a] += can;
        need -= can;
      }
      const left = floorDiv(take * (row.heat.leaves ?? 0), 1000);
      const carried = floorDiv(E[i] * take, m[i]); // the heat of what left it goes with it
      let out = take * row.heat.releases + carried; // and the burning's own
      m[i] -= take;
      E[i] -= carried;
      // its flame keeps what is left of it at its ignition heat (as much as the burning gives)
      if (m[i] > 0) {
        const keep = Math.min(out, Math.max(0, heatOf(row, m[i], (row.heat.burns - ROOM.temp) * 1000) - E[i] - dE[i]));
        add(i, keep);
        out -= keep;
      }
      residue[i] += left;
      burnt.mass += take;
      burnt.residue += left;
      burnt.smoke += take - left;
      const share = floorDiv(out, airs.length);
      airs.forEach((a, k) => add(a, k === 0 ? out - share * (airs.length - 1) : share));
      dS[airs[0]] += take - left; // (the smoke into the air above it, else beside it)
    }
    for (const i of touched) {
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
      [spent[i], spent[j]] = [spent[j], spent[i]];
      [residue[i], residue[j]] = [residue[j], residue[i]];
      stamp[i] = stamp[j] = -1;
      touched.add(i);
      touched.add(j);
    };
    const moved = new Set();
    const warm = [...touched].filter((i) => isAir(i)).sort((a, b) => b - a);
    for (const i of warm) {
      if (moved.has(i)) continue;
      const up = i + LAYER;
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
        swap(i, up);
        moved.add(up);
        moved.add(i);
        continue;
      }
      if (up < N && isAir(up)) continue; // (the air above is as warm: it stays)
      let best = -1;
      for (const j of around(i).slice(1, 5)) if (j >= 0 && isAir(j) && !moved.has(j) && tOf(j) < tOf(i) && (best < 0 || tOf(j) < tOf(best))) best = j;
      if (best >= 0) {
        swap(i, best);
        moved.add(best);
        moved.add(i);
      }
    }
    // falling: a liquid cell, or loose residue, with air beneath changes places with it
    for (const i of [...touched].sort((a, b) => a - b)) {
      if (i < LAYER || isAir(i)) continue;
      const j = i - LAYER;
      if (!isAir(j)) continue;
      const row = ROWS[mat[i]];
      const liquid = phaseOf(row, m[i], E[i])[1] === 65536;
      const loose = row === MATTER.ash || row === MATTER.char || row.strength === 0;
      if (!liquid && !loose) continue;
      swap(i, j);
    }
    // what stays awake: anything not at the air's heat, smoky, or burning down
    awake.clear();
    for (const i of touched) {
      const t = tOf(i);
      if (t > peak[i]) peak[i] = t;
      if (t !== 0 || smoke[i] > 0 || residue[i] > 0) awake.add(i);
    }
  }

  const nameOf = (i) => ORDER[mat[i]];
  return {
    step,
    index,
    // heat put into a cell (nJ): a flame against it, light it drank
    heat(i, nJ) {
      E[i] += nJ;
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
        T,
        liquid,
        smoke: smoke[i],
        burning: burnsOf(row) && m[i] > 0 && T >= (row.heat.burns - ROOM.temp) * 1000 && around(i).some((j) => j >= 0 && isAir(j)),
      };
    },
    // all the matter there is (µg): solids and liquids by kind, and smoke (the air's own aside)
    total() {
      const by = {};
      let all = 0;
      for (let i = 0; i < N; i++) {
        if (isAir(i)) continue;
        by[nameOf(i)] = (by[nameOf(i)] ?? 0) + m[i] + residue[i];
        all += m[i] + residue[i];
      }
      let sm = 0;
      for (let i = 0; i < N; i++) sm += smoke[i];
      return { by, matter: all, smoke: sm, all: all + sm };
    },
    cells: { mat, m, E, smoke, spent },
    peak,
    burnt,
    vented,
    get awake() {
      return awake.size;
    },
    get steps() {
      return steps;
    },
  };
}
