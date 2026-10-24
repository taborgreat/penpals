import test from 'node:test';
import assert from 'node:assert/strict';
import { readHand, handBits, handLevels, level, log2x8, ZONE_FEATURES, GLOBAL_FEATURES, CALIBRATION_SEED } from '../v1/hand.js';
import { encodeActs, decodeActs } from '../v1/acts.js';
import { fixtureBytes } from '../tools/fixtures.js';
import { hex } from '../tags.js';

test('the calibration paper is one public sheet, the same for everyone', () => {
  assert.equal(hex(CALIBRATION_SEED).length, 64);
  assert.equal(hex(CALIBRATION_SEED), hex(CALIBRATION_SEED));
});

test('a reading is deterministic and has the documented shape', () => {
  const { bytes } = fixtureBytes('cursive');
  const a = readHand(bytes, { zones: 8 });
  const b = readHand(bytes, { zones: 8 });
  assert.deepEqual([...a.zone], [...b.zone]);
  assert.deepEqual([...a.global], [...b.global]);
  assert.equal(a.zone.length, 8 * ZONE_FEATURES.length);
  assert.equal(a.global.length, GLOBAL_FEATURES.length);
  assert.ok(a.zone.every(Number.isInteger) && a.global.every(Number.isInteger));
  assert.equal(handBits(a).length, (8 * ZONE_FEATURES.length + GLOBAL_FEATURES.length) * 3);
});

test('the reading is of the hand, not of the pen it was written with', () => {
  const { bytes } = fixtureBytes('cursive');
  const rec = decodeActs(bytes);
  const other = encodeActs({
    ...rec,
    strokes: rec.strokes.map((s, i) => ({
      ...s, x: [...s.x], y: [...s.y], t: [...s.t], p: s.p ? [...s.p] : null,
      pens: i === 0 ? [{ at: 0, nib: 2, size: 200, flex: 0, flow: 13, rgb: [200, 10, 10], angle: 70 }] : [],
    })),
  });
  assert.deepEqual([...readHand(other).global], [...readHand(bytes).global]);
});

test('levels are Gray-coded: one level step flips one bit', () => {
  const spec = ['lin', 0, 10];
  for (let v = 0; v < 70; v += 10) {
    const r = { zone: new Int32Array(0), global: Int32Array.from({ length: GLOBAL_FEATURES.length }, () => v) };
    const r2 = { zone: new Int32Array(0), global: Int32Array.from({ length: GLOBAL_FEATURES.length }, () => v + 10) };
    assert.equal(level(v, spec) + 1, level(v + 10, spec));
    const a = handBits(r, { useZones: false });
    const b = handBits(r2, { useZones: false });
    // each feature changed level by at most one step under its own spec; Gray flips ≤ 1 bit per step
    const levelsA = handLevels(r, { useZones: false });
    const levelsB = handLevels(r2, { useZones: false });
    for (let f = 0; f < levelsA.length; f++) {
      const flips = [0, 1, 2].filter((k) => a[3 * f + k] !== b[3 * f + k]).length;
      assert.ok(flips <= Math.abs(levelsB[f] - levelsA[f]), `feature ${f}`);
    }
  }
  assert.equal(log2x8(1), 0);
  assert.equal(log2x8(2), 8);
  assert.equal(log2x8(3), 12);
  assert.equal(log2x8(1024), 80);
});
