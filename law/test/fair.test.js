// Direction fairness (outside.md §1.3): a law on a grid makes circles only if it
// treats every direction the same. On an even sheet (the same paper in every cell,
// no fibers: the law alone, not the paper's grain), one free drop settles round
// within one cell wherever it falls on the grid; and a mark turned settles the same
// turned: exactly, mirrored or turned a quarter (law 3), and within the grid's own
// grain turned an eighth.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSim } from '../v2/sim.js';
import { makePaper } from '../v2/paper.js';
import { testPaperKey, PENS } from '../tools/fixtures.js';
import { TILE } from '../v1/constants.js';

const key = testPaperKey('fair');
const family = { grain: 8, weight: 8, tooth: 0 };
const real = makePaper(key, family).tileFields(0, 0);
const mid = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
// an even sheet: every cell the paper's middle, no fibers, no ridges
const EVEN = {
  dominant: 0,
  tileFields: () => ({
    cap: new Uint16Array(TILE * TILE).fill(mid(real.cap)),
    hold: new Uint16Array(TILE * TILE).fill(mid(real.hold)),
    siz: new Uint8Array(TILE * TILE).fill(mid(real.siz)),
    z: new Uint16Array(TILE * TILE).fill(mid(real.z)),
    link: new Uint16Array(TILE * TILE * 8),
    ridge: new Uint8Array(TILE * TILE).fill(128),
  }),
};

// A drop: the nib held still at (x, y) (tenths), n ticks of 10 ms. → Map 'x,y' → ink (settled)
function drop(pen, n, { x = 1000, y = 1000, law = 3 } = {}) {
  const sim = createSim({ paperKey: key, family, paper: EVEN, law });
  sim.setPen(pen);
  sim.strokeStart(x, y, 0, 255);
  for (let i = 1; i < n; i++) sim.act(x, y, i * 10, 255);
  const m = new Map();
  for (const t of sim.finish().tiles)
    for (let i = 0; i < TILE * TILE; i++) {
      const v = t.F[3 * i] + t.F[3 * i + 1] + t.F[3 * i + 2];
      if (v) m.set(`${t.tx * TILE + (i % TILE)},${t.ty * TILE + Math.floor(i / TILE)}`, v);
    }
  return m;
}
// Its outline's distance from the point (cells) in 16 directions: where the ink falls below 15% of its most.
function radii(m, x = 1000, y = 1000) {
  const cx = (2 * x) / 10 - 0.5,
    cy = (2 * y) / 10 - 0.5; // (a cell's value sits at its index; the point is between)
  const at = (fx, fy) => {
    const x0 = Math.floor(fx),
      y0 = Math.floor(fy),
      ax = fx - x0,
      ay = fy - y0;
    const v = (i, j) => m.get(`${i},${j}`) ?? 0;
    return v(x0, y0) * (1 - ax) * (1 - ay) + v(x0 + 1, y0) * ax * (1 - ay) + v(x0, y0 + 1) * (1 - ax) * ay + v(x0 + 1, y0 + 1) * ax * ay;
  };
  const th = 0.15 * Math.max(...m.values());
  return [...Array(16).keys()].map((k) => {
    const a = (k * Math.PI) / 8;
    let r = 0;
    while (at(cx + Math.cos(a) * (r + 0.05), cy + Math.sin(a) * (r + 0.05)) >= th && r < 200) r += 0.05;
    return r;
  });
}
const spread = (r) => Math.max(...r) - Math.min(...r);
// The drop's cells moved by a turn about the point (the nib at a cell's corner: (200, 200) in cells)
const turned = (m, f) => new Map([...m].map(([k, v]) => [f(...k.split(',').map(Number)).join(), v]));
const mirror = (x, y) => [399 - x, y];
const quarter = (x, y) => [399 - y, x];

test('one free drop settles round within one cell, wherever it falls on the grid', () => {
  for (const [pen, n] of [
    [PENS.fine, 150],
    [PENS.medium, 60],
    [PENS.heavy, 120],
  ]) {
    for (const at of [
      { x: 1000, y: 1000 }, // on a cell's corner
      { x: 1003, y: 1007 }, // inside a cell
    ]) {
      const r = radii(drop(pen, n, at), at.x, at.y);
      assert.ok(spread(r) <= 1, `size ${pen.size}, at ${at.x},${at.y}: radii ${r.map((v) => v.toFixed(1))}`);
    }
  }
});

test('a mark turned settles the same turned: mirrored and a quarter turn exactly, an eighth within the grid (law 3)', () => {
  const broad = (angle, law = 3) => drop({ ...PENS.broad, angle }, 100, { law });
  // mirrored: 45° is 135° seen in a mirror, 22° is 158°: cell for cell
  assert.deepEqual(turned(broad(45), mirror), broad(135));
  assert.deepEqual(turned(broad(22), mirror), broad(158));
  // a quarter turn: 0° turned is 90°, cell for cell
  assert.deepEqual(turned(broad(0), quarter), broad(90));
  // an eighth: the outline turned within the grid's own grain (square cells)
  const r0 = radii(broad(0));
  const r45 = radii(broad(45));
  const worst = Math.max(...r45.map((v, k) => Math.abs(v - r0[(k - 2 + 16) % 16])));
  assert.ok(worst <= 1.5, `turned an eighth: ${worst.toFixed(2)} cells`);
  // law 2 was not fair: a nib on a cell's corner fed one way more than its mirror
  assert.notDeepEqual(turned(broad(45, 2), mirror), broad(135, 2));
});
