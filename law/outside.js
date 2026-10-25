// The outside (outside.md Part 2): one shared space grown from the world's public seed, the houses
// standing in it on their plots (law/world.js). Nothing about it is stored but what has been done to it
// (its facts: Phase 5); the rest is the seed's, the same for everyone who looks. Everything with + − × ÷
// and law/dmath.js, so every machine grows the same ground.
//   Dirt     the ground: rolling, its height the seed's (a smooth noise, OUTSIDE.hills).
//   Stones   loose on it, of many sizes, now and then: most stone, some soft chalk, some ore (stone that
//            holds metal) (their rows: their hardness, their weight, the ore's metal).
//   Water    the rain runs down the dirt and stands where the ground is low: each hollow filled to the
//            height its rim lets it out at (spilling over the lowest of it), the rest running on.
//   Clay     where water meets dirt: the dirt at a pond's edge.
//   Grass    grows on the dirt everywhere else.
//   Trees    oaks (law/matter.js TREES), each from its own seed, sprouted some years ago (the seed's),
//            grown by the tree's law to the day under the place's sun and its rain (law/weather.js:
//            a year of it, every day's share alike).
//   Houses   stand on their plots: no tree or stone where a house stands, or in the start's clearing.
//   groundAt(x, y) → m      stonesIn(i, j), treesIn(i, j) → each cell's (OUTSIDE's cells)
//   waterAt(x, y) → m of water standing there      matterAt(x, y) → 'water' | 'clay' | 'grass'
//   near(x, y, r, { houses }) → { stones, trees } within r      treeNow(tree, day) → law/tree.js tree
// World metres: x east, y north (law/world.js: a plot's centre at [i, j] · PLOT_M).
import { createTree } from './tree.js';
import { PLOT_M, centreOf } from './world.js';
import { weatherAt } from './weather.js';

export const SEED = 'penpals:the world'; // the world's public seed
// How the ground rolls (a hill's breadth and height, m); how often a stone lies in a cell and how big
// the biggest is (m, its radius); how often a tree stands in a cell and how old the oldest is (years).
// The world's makeup: Tabor's to set.
export const OUTSIDE = Object.freeze({
  hills: { size: 40, height: 1.5 },
  stones: { cell: 2, share: 0.25, smallest: 0.02, biggest: 0.25, soft: 0.2, ore: 0.08 },
  trees: { cell: 7, share: 0.35, oldest: 80 },
});
// the grain the water is found at (m), and how far each piece of ground is looked over for its hollows (m)
export const WATER = Object.freeze({ cell: 1, tile: 64 });
// the day the world's trees are counted from (law/sun.js days: Jan 1, 2026): each sprouted its age before it
export const EPOCH = Math.floor(Date.UTC(2026, 0, 1) / 86400000) + 719528;

const fmix = (h) => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
const seedOf = (s) => {
  let h = 0x811c9dc5;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 0x01000193) >>> 0;
  return h;
};
const S = seedOf(SEED);
// a cell's own number, 0..1, for what (each field its own)
const draw = (what, i, j, k = 0) => fmix((fmix((S ^ Math.imul(what, 0x27d4eb2f)) >>> 0) + Math.imul(i, 0x9e3779b9) + Math.imul(j, 0x85ebca77) + Math.imul(k, 0xc2b2ae3d)) >>> 0) / 4294967296;

// --- the dirt ---
// value noise: each lattice point its own height, smoothly between
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y, what) {
  const i = Math.floor(x),
    j = Math.floor(y);
  const fx = smooth(x - i),
    fy = smooth(y - j);
  const a = draw(what, i, j),
    b = draw(what, i + 1, j),
    c = draw(what, i, j + 1),
    d = draw(what, i + 1, j + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function groundAt(x, y) {
  const { size, height } = OUTSIDE.hills;
  const n = noise(x / size, y / size, 1) + 0.5 * noise((2 * x) / size, (2 * y) / size, 2);
  return height * (n / 1.5 - 0.5) * 2;
}

// --- what lies and stands on it ---
export function stonesIn(i, j) {
  const { cell, share, smallest, biggest } = OUTSIDE.stones;
  if (draw(3, i, j) >= share) return [];
  const x = (i + draw(4, i, j)) * cell,
    y = (j + draw(5, i, j)) * cell;
  const r = smallest * (biggest / smallest) ** draw(6, i, j); // (as many small as big, in each doubling)
  const m = draw(11, i, j);
  return [{ id: `stone:${i},${j}`, at: [x, y, groundAt(x, y)], r, matter: m < OUTSIDE.stones.soft ? 'chalk' : m < OUTSIDE.stones.soft + OUTSIDE.stones.ore ? 'ore' : 'stone' }];
}
export function treesIn(i, j) {
  const { cell, share, oldest } = OUTSIDE.trees;
  if (draw(7, i, j) >= share) return [];
  const x = (i + 0.2 + 0.6 * draw(8, i, j)) * cell,
    y = (j + 0.2 + 0.6 * draw(9, i, j)) * cell;
  const age = 1 + (oldest - 1) * draw(10, i, j);
  return [{ id: `tree:${i},${j}`, at: [x, y, groundAt(x, y)], kind: 'oak', planted: Math.floor(EPOCH - age * 365.2422) }];
}
// No tree or stone where a house stands (its plot's yard), nor in the start's clearing.
const clear = (x, y, houses) => {
  const free = (c) => Math.max(Math.abs(x - c[0]), Math.abs(y - c[1])) > PLOT_M / 2 - 1;
  return free(centreOf([0, 0])) && houses.every((h) => free(centreOf(h.plot)));
};
export function near(x, y, r, { houses = [] } = {}) {
  const out = { stones: [], trees: [] };
  const within = (p) => (p.at[0] - x) ** 2 + (p.at[1] - y) ** 2 <= r * r && clear(p.at[0], p.at[1], houses);
  const each = (cell, fn, into) => {
    for (let i = Math.floor((x - r) / cell); i <= Math.floor((x + r) / cell); i++)
      for (let j = Math.floor((y - r) / cell); j <= Math.floor((y + r) / cell); j++) for (const p of fn(i, j)) if (within(p)) into.push(p);
  };
  each(OUTSIDE.stones.cell, stonesIn, out.stones);
  each(OUTSIDE.trees.cell, treesIn, out.trees);
  return out;
}

// --- the water ---
// A tile of ground (WATER.tile a side, on its cell grid): each cell's water level, by the priority
// flood: from the tile's edge (where water runs off) inward, lowest first, each cell's level no lower
// than its ground and no lower than the level the water reached it at.
const tiles = new Map();
function waterTile(ti, tj) {
  const key = `${ti},${tj}`;
  if (tiles.has(key)) return tiles.get(key);
  const { cell, tile } = WATER;
  const n = tile / cell;
  const x0 = ti * tile,
    y0 = tj * tile;
  const g = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = groundAt(x0 + (i + 0.5) * cell, y0 + (j + 0.5) * cell);
  const level = new Float64Array(n * n).fill(Infinity);
  // a heap of [level, index]
  const heap = [];
  const push = (v, k) => {
    heap.push([v, k]);
    for (let c = heap.length - 1; c > 0;) {
      const p = (c - 1) >> 1;
      if (heap[p][0] < heap[c][0] || (heap[p][0] === heap[c][0] && heap[p][1] <= heap[c][1])) break;
      [heap[p], heap[c]] = [heap[c], heap[p]];
      c = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let c = 0; ;) {
        const l = 2 * c + 1,
          r = l + 1;
        let m = c;
        const less = (a, b) => heap[a][0] < heap[b][0] || (heap[a][0] === heap[b][0] && heap[a][1] < heap[b][1]);
        if (l < heap.length && less(l, m)) m = l;
        if (r < heap.length && less(r, m)) m = r;
        if (m === c) break;
        [heap[m], heap[c]] = [heap[c], heap[m]];
        c = m;
      }
    }
    return top;
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) {
        level[j * n + i] = g[j * n + i];
        push(g[j * n + i], j * n + i);
      }
  while (heap.length) {
    const [v, k] = pop();
    const i = k % n,
      j = Math.floor(k / n);
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const a = i + di,
        b = j + dj;
      if (a < 0 || b < 0 || a >= n || b >= n) continue;
      const q = b * n + a;
      if (level[q] !== Infinity) continue;
      level[q] = Math.max(g[q], v);
      push(level[q], q);
    }
  }
  const depth = level.map((v, k) => v - g[k]);
  if (tiles.size > 64) tiles.clear();
  tiles.set(key, depth);
  return depth;
}
const cellOf = (x, y) => {
  const { cell, tile } = WATER;
  const ti = Math.floor(x / tile),
    tj = Math.floor(y / tile);
  const i = Math.floor((x - ti * tile) / cell),
    j = Math.floor((y - tj * tile) / cell);
  return { ti, tj, k: j * (tile / cell) + i };
};
export function waterAt(x, y) {
  const { ti, tj, k } = cellOf(x, y);
  return waterTile(ti, tj)[k];
}
export function matterAt(x, y) {
  if (waterAt(x, y) > 0) return 'water';
  const c = WATER.cell;
  for (const [dx, dy] of [
    [c, 0],
    [-c, 0],
    [0, c],
    [0, -c],
  ])
    if (waterAt(x + dx, y + dy) > 0) return 'clay';
  return 'grass';
}

// --- a tree, grown ---
// The place's rain over a year (law/weather.js over the world's seed: a week of each month, hour by
// hour), as much each day: kg a m².
let daily = null;
export function dailyRain() {
  if (daily === null) {
    let mm = 0,
      hours = 0;
    for (let m = 0; m < 12; m++) for (let h = 0; h < 7 * 24; h++, hours++) mm += weatherAt(SEED, Date.UTC(2025, m, 1) + h * 3600000).rain;
    daily = (mm / hours) * 24;
  }
  return daily;
}
const grown = new Map(); // id@day → the tree
export function treeNow(t, day) {
  const key = `${t.id}@${day}`;
  if (!grown.has(key)) {
    const T = createTree({ kind: t.kind, day: t.planted, at: [t.at[0], t.at[1]] });
    const kg = dailyRain();
    const waters = [];
    for (let d = t.planted; d < day; d++) waters.push({ day: d, kg });
    T.grow(day, waters);
    if (grown.size > 256) grown.clear();
    grown.set(key, T);
  }
  return grown.get(key);
}
