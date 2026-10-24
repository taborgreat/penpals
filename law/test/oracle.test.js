import test from 'node:test';
import assert from 'node:assert/strict';
import { grow } from '../v1/sim.js';
import { growReference } from '../v1/reference.js';
import { settledCells } from '../v1/look.js';
import { encodeActs, decodeActs } from '../v1/acts.js';
import { fixtureBytes, testPaperKey } from '../tools/fixtures.js';

const family = { grain: 8, weight: 8, tooth: 0 };

function xorshift(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// A random small record: walks, dwells, every nib, pressure or not, pen changes, pauses.
function randomRecord(seed) {
  const r = xorshift(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const pen = () => ({ nib: int(0, 2), size: int(8, 70), flex: int(0, 150), flow: int(1, 15), rgb: [int(0, 255), int(0, 255), int(0, 255)], angle: int(0, 179) });
  const strokes = [];
  let clock = 0;
  const nStrokes = int(1, 4);
  for (let k = 0; k < nStrokes; k++) {
    const hasP = r() < 0.4;
    const n = int(2, 50);
    let x = int(100, 500), y = int(100, 500);
    const xs = [], ys = [], ts = [], ps = [];
    clock += k === 0 ? 0 : int(0, 1500);
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        clock += r() < 0.15 ? int(20, 120) : int(1, 16); // sometimes a dwell-like pause
        if (r() > 0.2) {
          x = Math.max(0, Math.min(700, x + int(-25, 25)));
          y = Math.max(0, Math.min(700, y + int(-25, 25)));
        }
      }
      xs.push(x);
      ys.push(y);
      ts.push(clock);
      ps.push(int(1, 255));
    }
    const pens = k === 0 ? [{ at: 0, ...pen() }] : r() < 0.5 ? [{ at: int(0, n - 1), flow: int(0, 15), rgb: [int(0, 255), int(0, 255), int(0, 255)] }] : [];
    strokes.push({ hasP, kind: hasP ? 2 : 0, synthP: false, x: xs, y: ys, t: ts, p: hasP ? ps : null, pens });
  }
  return decodeActs(encodeActs({ orgX: int(0, 40), orgY: int(0, 40), strokes }));
}

function same(name, rec, opts) {
  const fast = settledCells(grow(rec, opts).tiles);
  const ref = growReference(rec, opts).cells;
  assert.equal(fast.length, ref.length, `${name}: cell count`);
  for (let i = 0; i < ref.length; i++) {
    if (fast[i].join() !== ref[i].join()) assert.fail(`${name}: first difference at cell ${ref[i].slice(0, 2)}: fast ${fast[i]} vs reference ${ref[i]}`);
  }
}

test('the fast simulation equals the reference, cell for cell, on random writing', () => {
  for (let seed = 1; seed <= 24; seed++) {
    same(`seed ${seed}`, randomRecord(seed), { paperKey: testPaperKey(`oracle${seed}`), family: { grain: seed % 16, weight: (seed * 7) % 16, tooth: 0 } });
  }
});

test('the fast simulation equals the reference on the fixtures, at other scales too', () => {
  for (const name of ['hairline', 'dwell', 'mixWet', 'broad', 'flexPressure']) {
    const { rec } = fixtureBytes(name);
    same(name, rec, { paperKey: testPaperKey('oracle'), family });
  }
  const { rec } = fixtureBytes('cursive');
  same('cursive at 1.5×', rec, { paperKey: testPaperKey('oracle'), family, scale: 96 });
  same('cursive at 0.5×', rec, { paperKey: testPaperKey('oracle'), family, scale: 32 });
});
