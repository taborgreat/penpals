// One rule for heat, phase and fire (one-matter.md Phase 5; matter.md): every matter by its row,
// nothing in the rule naming a substance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHeat, phaseOf, heatOf } from '../heat.js';
import { MATTER, AIR } from '../matter.js';

const C = (deg) => (deg - AIR.temp) * 1000; // °C → mK above the room's air
// One cell of `name`, in a box of air (5 × 5 × 5, a cell `dx` on a side), heated to `deg`.
function lone(name, deg, dx = 0.01) {
  const h = createHeat({ size: [5, 5, 5], dx, dt: 0.03, open: true, cellAt: (x, y, z) => (x === 2 && y === 2 && z === 2 ? name : null) });
  const i = h.index(2, 2, 2);
  h.heat(i, heatOf(MATTER[name], h.cells.m[i], C(deg)) - h.cells.E[i]);
  return { h, i };
}
const find = (h, name) => {
  for (let i = 0; i < h.cells.mat.length; i++) if (h.at(i % 5, Math.floor(i / 5) % 5, Math.floor(i / 25)).matter === name) return i;
  return -1;
};
const where = (h, i) => h.at(i % 5, Math.floor(i / 5) % 5, Math.floor(i / 25));

test('the rule names no substance: it reads rows', () => {
  const src = fs.readFileSync(new URL('../heat.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const name of ['paper', 'wood', 'wax', 'metal', 'plaster', 'stone', 'candle', 'house', 'fire'])
    assert.ok(!new RegExp(`['"\`]${name}['"\`]|\\b${name}\\b(?!s)`, 'i').test(src.replace(/MATTER\.(air|ash|char)/g, '')), `heat.js names ${name}`);
});

test('phase: wax melts past its melting heat and sets again as it cools; its heat of melting taken and given back', () => {
  const w = MATTER.wax;
  const m = 1000;
  assert.deepEqual(phaseOf(w, m, heatOf(w, m, C(50))), [C(50), 0]);
  assert.equal(phaseOf(w, m, heatOf(w, m, C(70)))[1], 65536, 'liquid above 60 °C');
  // at its melting heat, half its heat of melting in: half liquid, and no warmer
  const half = heatOf(w, m, C(60)) + (m * w.heat.fuses) / 2;
  assert.deepEqual(phaseOf(w, m, half), [C(60), 32768]);
  // a hot drop of it in the air cools and sets (a 4 mm drop: still air takes a while)
  const { h, i } = lone('wax', 90, 0.004);
  assert.equal(where(h, i).liquid, 65536);
  let k = i;
  for (let s = 0; s < 120000 && where(h, k).liquid; s++) {
    h.step();
    k = find(h, 'wax');
  }
  assert.ok(k >= 0, 'still there');
  assert.equal(where(h, k).liquid, 0, 'set');
  assert.ok(Math.floor(k / 25) <= 2, 'and liquid, it fell (it rests on the box floor, or where it set)');
});

test('fire: paper past its ignition heat burns to its ash, as fast as its row and the air allow; nothing is lost', () => {
  const { h, i } = lone('paper', 260);
  const made = h.total().matter;
  const before = h.cells.m[i];
  h.step();
  assert.ok(where(h, i).burning, 'burning');
  for (let s = 0; s < 40000 && h.cells.m[i] > 0 && where(h, i).matter === 'paper'; s++) h.step();
  assert.ok(h.burnt.mass > 0 && h.burnt.mass <= before + 1);
  const t = h.total();
  assert.ok(t.by.ash > 0, 'it leaves ash');
  assert.equal(Math.round(t.matter + t.smoke + h.vented.smoke), Math.round(made), 'what it was is what it left and what went up');
  assert.ok(t.smoke + h.vented.smoke > t.by.ash, 'most of it went up as smoke');
  // the air above it took its heat: hotter than the paper ever was
  assert.ok(Math.max(...h.peak) > C(400));
});

test('fire: below its ignition heat nothing burns; a matter that does not burn never does', () => {
  const cool = lone('paper', 200);
  for (let s = 0; s < 50; s++) cool.h.step();
  assert.equal(cool.h.burnt.mass, 0);
  for (const name of ['plaster', 'stone', 'metal']) {
    const hot = lone(name, 800);
    for (let s = 0; s < 20; s++) hot.h.step();
    assert.equal(hot.h.burnt.mass, 0, `${name} does not burn`);
  }
});

test('metal melts only past its point: hot below it, solid; past it, liquid, and it falls until it rests', () => {
  const under = lone('metal', 850);
  under.h.step();
  assert.equal(where(under.h, under.i).liquid, 0, '850 °C: solid');
  const over = lone('metal', 1100);
  assert.equal(where(over.h, over.i).liquid, 65536, '1100 °C: liquid');
  over.h.step();
  over.h.step();
  const k = find(over.h, 'metal');
  assert.ok(Math.floor(k / 25) < 2, 'it ran down');
  assert.equal(over.h.total().by.metal, under.h.total().by.metal, 'none of it lost');
});

test('the same acts give the same heat everywhere: two runs, byte for byte', () => {
  const run = () => {
    const { h } = lone('paper', 300);
    for (let s = 0; s < 40; s++) h.step();
    return JSON.stringify([...h.cells.E, ...h.cells.m, ...h.cells.smoke]);
  };
  assert.equal(run(), run());
});

test('wicking: a wick in molten wax lifts it as fast as it draws, and its flame burns that, not the wick', () => {
  // a pool of molten wax a cell deep, a wick standing in it (a candle's: its fill), lit
  const dx = 0.005;
  const fill = (Math.PI * 0.00075 ** 2) / (dx * dx);
  const h = createHeat({
    size: [5, 5, 6],
    dx,
    dt: dx,
    open: true,
    cellAt: (x, y, z) => (z === 0 ? 'wood' : z === 1 ? (x === 2 && y === 2 ? ['wick', fill] : 'wax') : x === 2 && y === 2 && z === 2 ? ['wick', fill] : null),
  });
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) if (!(x === 2 && y === 2)) h.heat(h.index(x, y, 1), heatOf(MATTER.wax, h.cells.m[h.index(x, y, 1)], C(70)) - h.cells.E[h.index(x, y, 1)]);
  const foot = h.index(2, 2, 1),
    tip = h.index(2, 2, 2);
  for (const i of [foot, tip]) h.soak(i, 'wax', Math.floor((h.cells.m[i] * MATTER.wick.pores * MATTER.wax.density) / (MATTER.wick.density * 1000)));
  h.heat(foot, Math.round(((h.cells.m[foot] * MATTER.wick.heat.holds + h.cells.held[foot] * MATTER.wax.heat.holds) * C(70)) / 1000) - h.cells.E[foot]);
  h.heat(tip, Math.round(((h.cells.m[tip] * MATTER.wick.heat.holds + h.cells.held[tip] * MATTER.wax.heat.holds) * C(260)) / 1000) - h.cells.E[tip]);
  const wick = h.cells.m[tip];
  for (let s = 0; s < 800; s++) h.step(); // 4 s: its wick has burnt what it was waxed with
  const before = h.burnt.mass;
  for (let s = 0; s < 400; s++) h.step(); // 2 s more
  const perS = (h.burnt.mass - before) / 2; // µg/s
  assert.ok(where(h, 2).burning || h.at(2, 2, 2).burning, 'still alight');
  assert.ok(perS > 0.5 * MATTER.wick.draws && perS <= 1.05 * MATTER.wick.draws, `it burns ${perS.toFixed(0)} µg/s; its wick draws ${MATTER.wick.draws}`);
  assert.ok(h.cells.m[tip] > 0.9 * wick, 'a wet wick does not burn');
});

test("light: of a flame its fuel's share shines out every way and warms the first matter it meets", () => {
  // a lone burning sheet, a plaster wall 4 cells off across air: the wall warms though no air touches both
  const dx = 0.01;
  const h = createHeat({ size: [7, 3, 3], dx, dt: dx, open: true, cellAt: (x, y, z) => (x === 1 && y === 1 && z === 1 ? ['paper', 0.01] : x === 6 && y === 1 && z === 1 ? 'plaster' : null) });
  const i = h.index(1, 1, 1);
  h.heat(i, heatOf(MATTER.paper, h.cells.m[i], C(300)) - h.cells.E[i]);
  const wall = h.index(6, 1, 1);
  for (let s = 0; s < 3; s++) h.step();
  assert.ok(h.burnt.mass > 0);
  assert.ok(h.peak[wall] > 0, 'the wall took the light');
  assert.ok(h.vented.light > 0, 'and some shone out of the box');
});

test('a cell part full (a sheet, a wick): it holds its share of a whole cell of its matter', () => {
  const h = createHeat({ size: [2, 1, 1], dx: 0.01, cellAt: (x) => (x === 0 ? ['paper', 0.01] : 'paper') });
  assert.equal(Math.round(h.cells.m[1] / 100), Math.round(h.cells.m[0]));
});
