// The melt pool and its drips (rooms.md §3b, Tests: Wax): a hot candle tilted past
// its lip drips onto the paper and the wax stays; upright it does not; a candle
// left after its flame went out is set when the room is entered the next day.
import test from 'node:test';
import assert from 'node:assert/strict';
import { poolOf, dripOf, POOL_MAX, FILL_MS, LIP_DEG } from '../wax.js';
import { lawOf } from '../laws.js';
import { testPaperKey } from '../tools/fixtures.js';

test('a lit candle melts a pool; out, it sets again, all of it by the next day', () => {
  assert.equal(poolOf({ litMs: 0 }), 0);
  assert.equal(poolOf({ litMs: FILL_MS / 2 }), POOL_MAX / 2);
  assert.equal(poolOf({ litMs: 10 * FILL_MS }), POOL_MAX, 'no fuller than full');
  assert.ok(poolOf({ litMs: FILL_MS, outMs: 60000 }) < POOL_MAX, 'cooling');
  assert.equal(poolOf({ litMs: FILL_MS, outMs: 24 * 3600 * 1000 }), 0, 'set by the next day');
});

test('tilted past its lip a hot candle drips, more the more liquid and the further tilted; upright or set, nothing falls', () => {
  assert.equal(dripOf(POOL_MAX, 0), null, 'upright');
  assert.equal(dripOf(POOL_MAX, LIP_DEG), null, 'at the lip');
  assert.equal(dripOf(0, 60), null, 'set');
  const a = dripOf(POOL_MAX, 40),
    b = dripOf(POOL_MAX, 70),
    c = dripOf(POOL_MAX / 4, 70);
  assert.ok(a && b && c);
  assert.ok(b.amt > a.amt, 'further tilted: more');
  assert.ok(b.amt > c.amt && b.heat > c.heat, 'more liquid: more, and hotter');
  // and the drip is a fact on the sheet: the law grows it, and it stays
  const L = lawOf(3);
  const rec = { orgX: 0, orgY: 0, strokes: [], marks: [{ kind: 'drip', t: 0, x: 2000, y: 2000, ...b }] };
  const res = L.grow(L.decodeCanonical(L.encodeActs(rec)), { paperKey: testPaperKey('wax'), family: { grain: 8, weight: 8, tooth: 0 } });
  const cells = L.settledCells(res.tiles);
  assert.ok(cells.filter((x) => x[15] > 0).length > 100, 'wax on the paper');
});
