// The candles heard (world.md Phase 3): a lit candle crackles, the more the longer its wick.
import test from 'node:test';
import assert from 'node:assert/strict';
import { candleState, NEW_CANDLE, WICK_TRIM, WICK_LONG } from '../scene/light/candle.js';
import { crackles, crackleRate } from './candle.js';

const flame = (wick, lit = true) => ({ ...candleState(NEW_CANDLE, 0, { lit }), wick, which: 0, pos: [1.2, 2.9, 0.9], lit });

test('a lit candle crackles; a long wick crackles more; one out is silent', () => {
  const t0 = 1.75e9;
  const trimmed = crackles(flame(WICK_TRIM), t0, t0 + 600).length;
  const long = crackles(flame(WICK_LONG), t0, t0 + 600).length;
  assert.ok(trimmed > 10, `${trimmed} in ten minutes, trimmed`);
  assert.ok(long > trimmed * 1.3, `${long}, its wick long`);
  assert.equal(crackles(flame(WICK_TRIM, false), t0, t0 + 600).length, 0);
  assert.equal(crackleRate(flame(WICK_TRIM, false)), 0);
});

test('never even, never random: the same moment crackles alike, wherever it is heard from', () => {
  const t0 = 1.75e9;
  const a = crackles(flame(WICK_TRIM), t0, t0 + 120);
  const b = [...crackles(flame(WICK_TRIM), t0, t0 + 50), ...crackles(flame(WICK_TRIM), t0 + 50, t0 + 120)];
  assert.deepEqual(a, b, 'heard frame by frame or all at once: the same crackles');
  const gaps = a.slice(1).map((e, i) => e.t - a[i].t);
  assert.ok(Math.max(...gaps) > 1.5 * Math.min(...gaps), 'not evenly spaced');
  assert.ok(
    a.every((e) => e.matter),
    'matter meeting matter (placed on the pulse: Phase 3c)',
  );
  assert.ok(a[0].bands.reduce((s, x) => s + x, 0) > 0);
});
