import test from 'node:test';
import assert from 'node:assert/strict';
import { markedCurves } from './inkLight.js';
import { roomGeometry, ROOM } from './light/room.js';
import { N } from './light/axis.js';

const geom = roomGeometry(ROOM);
const white = () => new Array(N).fill(0.8);

// a block of dark ink (the look: black, fully there) on the far wall, w × h cells, at `at` (its units)
const block = (w, h, at = [400, 600]) => ({ surface: 'wall-far', origin: at, cellUnits: 0.5, box: [0, 0, w, h], rgba: new Uint8Array(w * h * 4).fill(0).map((_, i) => (i % 4 === 3 ? 255 : 10)) });

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
  const clear = { ...block(10, 10), rgba: new Uint8Array(400) };
  assert.deepEqual(markedCurves(geom, [clear], white), {});
});
