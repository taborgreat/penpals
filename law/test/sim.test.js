import test from 'node:test';
import assert from 'node:assert/strict';
import { grow } from '../v1/sim.js';
import { settledCells, boxOf, lookRGB, factsDigest, lookDigest } from '../v1/look.js';
import { ABS_Q } from '../v1/tables.js';
import { fixtureBytes } from '../tools/fixtures.js';
import { testPaperKey } from '../tools/render.js';
import { hex } from '../tags.js';

const family = { grain: 8, weight: 8, tooth: 0 };
const paperKey = testPaperKey('tests');

function run(name, opts = {}) {
  const { bytes, rec } = fixtureBytes(name);
  const res = grow(rec, { paperKey, family, ...opts });
  const cells = settledCells(res.tiles);
  const box = boxOf(cells);
  return { bytes, rec, res, cells, box, facts: hex(factsDigest({ cells, box, actsBytes: bytes, family })) };
}

test('pigment is conserved exactly: every deposited unit ends up fixed', () => {
  for (const name of ['hairline', 'dwell', 'cursive']) {
    const { rec } = fixtureBytes(name);
    const rgb = rec.strokes[0].pens[0].rgb;
    const added = [0, 0, 0];
    const instrument = {
      tile() {}, wet() {}, strokeStart() {}, step() {}, finish() {}, fiber() {},
      deposit(t, i, g) { for (let c = 0; c < 3; c++) added[c] += Math.floor((g * ABS_Q[rgb[c]]) / 256); },
    };
    const res = grow(rec, { paperKey, family, instrument });
    const fixed = [0, 0, 0];
    for (const t of res.tiles) for (let i = 0; i < t.F.length; i++) fixed[i % 3] += t.F[i];
    assert.deepEqual(fixed, added, name);
  }
});

test('the same acts on the same paper settle the same, every time', () => {
  const a = run('mixWet');
  const b = run('mixWet');
  assert.equal(a.facts, b.facts);
});

test('different paper, different ink; same paper, different scale, different ink', () => {
  const { rec, bytes } = fixtureBytes('slowCurve');
  const grown = (key, scale = 64) => {
    const res = grow(rec, { paperKey: key, family, scale });
    const cells = settledCells(res.tiles);
    return hex(factsDigest({ cells, box: boxOf(cells), actsBytes: bytes, family, scale }));
  };
  assert.notEqual(grown(testPaperKey('one')), grown(testPaperKey('two')));
  assert.notEqual(grown(paperKey, 64), grown(paperKey, 96));
});

test('a fast hairline is starved, a dwell pools, and the pool dries to a ring', () => {
  const hair = run('hairline');
  const meanF = (cells) => cells.reduce((s, c) => s + c[2], 0) / cells.length;
  const dwell = run('dwell');
  assert.ok(meanF(hair.cells) * 3 < meanF(dwell.cells), 'hairline much lighter than a dwelled line');
  // Ring: averaged over circles around the hold point (cell 142, 58 in the
  // fixture), the rim of the pool holds more pigment than its middle.
  const map = new Map(dwell.cells.map((c) => [`${c[0]},${c[1]}`, c[2]]));
  const sums = [];
  const counts = [];
  for (let dy = -14; dy <= 14; dy++) {
    for (let dx = -14; dx <= 14; dx++) {
      const d = Math.round(Math.hypot(dx, dy));
      if (d > 14) continue;
      sums[d] = (sums[d] ?? 0) + (map.get(`${58 + dy},${142 + dx}`) ?? 0);
      counts[d] = (counts[d] ?? 0) + 1;
    }
  }
  const radial = sums.map((s, d) => s / counts[d]);
  const middle = radial.slice(2, 8).sort((p, q) => p - q)[3];
  const rim = Math.max(...radial.slice(8, 12));
  assert.ok(rim > middle * 1.08, `rim ${rim.toFixed(0)} vs middle ${middle.toFixed(0)}`);
});

test('look: transmittance over white, digest is over pixels', () => {
  const r = run('hairline');
  const rgb = lookRGB(r.cells, r.box);
  assert.equal(rgb.length, r.box[2] * r.box[3] * 3);
  assert.ok(rgb.some((v) => v < 255));
  assert.equal(hex(lookDigest(rgb, r.box)).length, 64);
});
