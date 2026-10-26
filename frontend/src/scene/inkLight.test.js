import test from 'node:test';
import assert from 'node:assert/strict';
import { markedCurves, papersCurves } from './inkLight.js';
import { roomGeometry, ROOM } from './light/room.js';
import { N } from './light/axis.js';

const geom = roomGeometry(ROOM);
const white = () => new Array(N).fill(0.8);

// a block of dark ink (each channel's absorbance 3: black) on the far wall, w × h cells, at `at` (its units)
const block = (w, h, at = [400, 600]) => ({ surface: 'wall-far', origin: at, cellUnits: 0.5, box: [0, 0, w, h], abs: new Float32Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 0 : 3)) });

test('ink on a wall darkens the patch it lies on, by its share; no other patch changes', () => {
  const small = markedCurves(geom, [block(40, 40)], white);
  const big = markedCurves(geom, [block(400, 400)], white);
  const patches = Object.keys(small);
  assert.equal(patches.length, 1, 'one patch under the ink');
  const p = patches[0];
  const mean = (c) => c.reduce((s, v) => s + v, 0) / c.length;
  assert.ok(mean(small[p]) < 0.8, 'darker than the bare wall');
  assert.ok(mean(big[p]) < mean(small[p]), 'more ink, darker');
  assert.equal(geom.surfaces[geom.patches[p].surface].id, 'wall-far', 'on the wall it was written on');
});

test('no ink, or ink with nothing in it, changes nothing', () => {
  assert.deepEqual(markedCurves(geom, [], white), {});
  const clear = { ...block(10, 10), abs: new Float32Array(400) };
  assert.deepEqual(markedCurves(geom, [clear], white), {});
});

// papers lying in the room (law/paper.js: a paper is matter, anywhere): a half page, its far-left corner at (x, y)
const PAPER = new Array(N).fill(0.85);
const lyingAt = (x, y, z, more = {}) => ({ x0: x, y0: y - 0.108, x1: x + 0.154, y1: y, z, cells: 1000, ...more });
const tableZ = geom.table.top + 0.0005;
const wood = () => new Array(N).fill(0.2);

test('a paper lying on the table brightens the patch it lies on (paper over wood), by its share; on the floor, a floor patch', () => {
  const t = geom.table;
  const on = papersCurves(geom, [lyingAt(t.x0 + 0.1, t.y1 - 0.05, tableZ)], wood, PAPER);
  const patches = Object.keys(on).map(Number);
  assert.ok(patches.length >= 1);
  for (const p of patches) {
    assert.equal(geom.surfaces[geom.patches[p].surface].id, 'table-top', 'on the table top');
    assert.ok(on[p][5] > 0.2 && on[p][5] <= 0.85, 'between the wood and the paper, by the share it covers');
  }
  const floor = papersCurves(geom, [lyingAt(1.0, 1.5, 0.0005)], wood, PAPER);
  assert.ok(Object.keys(floor).every((p) => geom.surfaces[geom.patches[p].surface].id === 'floor'));
  assert.ok(Object.keys(floor).length >= 1);
  // held in the air, it lies on nothing
  assert.deepEqual(papersCurves(geom, [lyingAt(1.0, 1.5, 1.2)], wood, PAPER), {});
});

test("a paper over another hides it; a paper's ink darkens what it gives back", () => {
  const t = geom.table;
  const one = papersCurves(geom, [lyingAt(t.x0 + 0.1, t.y1 - 0.05, tableZ)], wood, PAPER);
  const two = papersCurves(geom, [lyingAt(t.x0 + 0.1, t.y1 - 0.05, tableZ), lyingAt(t.x0 + 0.1, t.y1 - 0.05, tableZ + 0.0001)], wood, PAPER);
  assert.deepEqual(two, one, 'the same place covered once');
  const abs = new Float32Array(600 * 4).map((_, i) => (i % 4 === 3 ? 0 : 2)); // 600 of its 1000 cells dark
  const inked = papersCurves(geom, [lyingAt(t.x0 + 0.1, t.y1 - 0.05, tableZ, { abs })], wood, PAPER);
  for (const p of Object.keys(one)) assert.ok(inked[p][5] < one[p][5], 'its ink drinks');
});
