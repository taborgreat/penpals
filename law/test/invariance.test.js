import test from 'node:test';
import assert from 'node:assert/strict';
import { grow } from '../v1/sim.js';
import { settledCells } from '../v1/look.js';
import { makePaper } from '../v1/paper.js';
import { encodeActs, decodeActs } from '../v1/acts.js';
import { EXP8 } from '../v1/tables.js';
import { PENS, testPaperKey } from '../tools/fixtures.js';

const family = { grain: 8, weight: 8, tooth: 0 };
const T = (c) => (c ? EXP8[Math.min(c[2] >> 2, 2047)] : 255);

// The same straight motion (vx, vy tenths per ms), sampled every `period` ms.
function line(period, vx, vy, ms = 1600) {
  const x = [],
    y = [],
    t = [];
  for (let tt = 0; tt <= ms; tt += period) {
    x.push(100 + vx * tt);
    y.push(100 + vy * tt);
    t.push(tt);
  }
  return decodeActs(encodeActs({ orgX: 10, orgY: 10, strokes: [{ hasP: false, kind: 0, synthP: false, x, y, t, p: null, pens: [{ at: 0, ...PENS.medium }] }] }));
}
const cellsOf = (rec, key = 'inv') => new Map(settledCells(grow(rec, { paperKey: testPaperKey(key), family }).tiles).map((c) => [`${c[0]},${c[1]}`, c]));

test('sampling rate does not change the ink: the same motion at 62.5, 125 and 250 Hz', () => {
  // along an axis the stamps fall in exactly the same places: identical facts
  const h = [16, 8, 4].map((p) => [...cellsOf(line(p, 2, 0)).values()].map((c) => c.join()).join(';'));
  assert.equal(h[0], h[1]);
  assert.equal(h[1], h[2]);
  // diagonally, rounding moves a stamp by at most a half-tenth: the ink differs by under 2/255 on average
  const m = [16, 8, 4].map((p) => cellsOf(line(p, 2, 1)));
  for (const [a, b] of [
    [0, 1],
    [1, 2],
    [0, 2],
  ]) {
    const keys = new Set([...m[a].keys(), ...m[b].keys()]);
    let sum = 0;
    for (const k of keys) sum += Math.abs(T(m[a].get(k)) - T(m[b].get(k)));
    assert.ok(sum / keys.size < 2, `mean |ΔT| ${(sum / keys.size).toFixed(2)}/255`);
  }
  // and no rate puts down more ink than another
  const totals = m.map((mm) => [...mm.values()].reduce((s, c) => s + c[2] + c[3] + c[4], 0));
  assert.ok(Math.max(...totals) / Math.min(...totals) < 1.01, `totals ${totals}`);
});

test('a dwell spreads about evenly in every direction (isotropy)', () => {
  const n = 120;
  const dwell = decodeActs(
    encodeActs({
      orgX: 20,
      orgY: 20,
      strokes: [{ hasP: false, kind: 0, synthP: false, x: Array(n).fill(500), y: Array(n).fill(500), t: Array.from({ length: n }, (_, i) => i * 10), p: null, pens: [{ at: 0, ...PENS.medium }] }],
    }),
  );
  for (const key of ['iso1', 'iso2', 'iso3']) {
    const m = cellsOf(dwell, key);
    const c = 2 * 20 + 100;
    const radii = [
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
      [0, -1],
      [1, -1],
    ].map(([dx, dy]) => {
      let r = 0;
      while ((m.get(`${c + dy * (r + 1)},${c + dx * (r + 1)}`)?.[2] ?? 0) >= 12) r++;
      return dx && dy ? r * Math.SQRT2 : r;
    });
    const mean = radii.reduce((s, v) => s + v, 0) / 8;
    const sd = Math.sqrt(radii.reduce((s, v) => s + (v - mean) ** 2, 0) / 8);
    assert.ok(sd / mean < 0.1, `${key}: radii ${radii.map((v) => v.toFixed(1))} spread ${((100 * sd) / mean).toFixed(1)}%`);
  }
});

test('the paper is a pure function of its coordinates: order and caching change nothing', () => {
  const key = testPaperKey('paper');
  const alone = makePaper(key, family).tileFields(32, -16);
  const warm = makePaper(key, family);
  for (let ty = -3; ty <= 3; ty++) for (let tx = -3; tx <= 5; tx++) warm.tileFields(tx * 16, ty * 16); // fill every cache around it
  const after = warm.tileFields(32, -16);
  for (const f of ['cap', 'hold', 'siz', 'z', 'link']) assert.deepEqual([...after[f]], [...alone[f]], f);
  // and different families grow different paper from the same key
  const other = makePaper(key, { grain: 2, weight: 13, tooth: 0 }).tileFields(32, -16);
  assert.notDeepEqual([...other.cap], [...alone.cap]);
});
