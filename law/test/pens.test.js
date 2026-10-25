// The pens on the table are matter, and their settings are their facts (one-world.md, the panel for
// the pen in hand; rooms.md §3c): set by acts on the room's chain, the same for everyone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { room as R, keys as K, b64url } from '../index.js';

const sk = K.skFromK(new Uint8Array(32).fill(7));
const ana = { sk, pk: K.publicKeyOf(sk) };
const ROOM = b64url(ana.pk);
const make = (k, thing, set) => R.makeRoomAct({ sk: ana.sk, pk: ana.pk, room: ROOM, k, act: 'set', thing, set });
const PLAIN = { size: 'medium', flow: 7, spatter: 1, color: '#1a1a1a', dip: false };
const FLEX = { hairline: 14, maxWidth: 14, swell: 25, slant: 55, flow: 7, spatter: 3, color: '#1a1a1a', dip: true };
const BROAD = { size: '2.4 mm', angle: 35, flow: 7, spatter: 1, color: '#1a1a1a', dip: false };

test('three pens and the jar are things on the table; each pen is set by an act, as its nib takes it', () => {
  assert.deepEqual(R.PENS, ['pen', 'pen-flex', 'pen-broad']);
  for (const t of [...R.PENS, 'jar']) assert.ok(R.THINGS.includes(t), t);
  const a = make(1, 'pen', PLAIN);
  assert.ok(R.verifyRoomActSeal(a.act, a.seal));
  make(2, 'pen-flex', FLEX);
  make(3, 'pen-broad', BROAD);
  // a field its nib does not have, one missing, one out of range, the wrong thing
  assert.throws(() => make(4, 'pen', { ...PLAIN, angle: 3 }), /settings of this pen/);
  const { slant, ...noSlant } = FLEX; // eslint-disable-line no-unused-vars
  assert.throws(() => make(4, 'pen-flex', noSlant), /settings of this pen/);
  assert.throws(() => make(4, 'pen-broad', { ...BROAD, flow: 16 }), /flow is out of range/);
  assert.throws(() => make(4, 'pen', { ...PLAIN, color: 'red' }), /colour/);
  assert.throws(() => make(4, 'candle-0', PLAIN), /only a pen/);
  assert.throws(() => R.makeRoomAct({ sk: ana.sk, pk: ana.pk, room: ROOM, k: 4, act: 'light', thing: 'pen-flex' }), /candle/);
  // and the jar is picked up and set down like anything else
  R.makeRoomAct({ sk: ana.sk, pk: ana.pk, room: ROOM, k: 5, act: 'place', thing: 'jar', to: [1.5, 2.8, 0.74] });
});

test("a pen's settings now are its last set act on the chain", () => {
  const lines = [make(1, 'pen', PLAIN), make(2, 'pen-flex', FLEX), make(3, 'pen', { ...PLAIN, dip: true, color: '#22336a' })].map((m, n) => ({ n, ...m }));
  const now = R.penSettings(lines);
  assert.deepEqual(now.pen, { ...PLAIN, dip: true, color: '#22336a' });
  assert.deepEqual(now['pen-flex'], FLEX);
  assert.equal(now['pen-broad'], undefined, 'as it was made');
});

test('night is the one sun down: a summer evening at eight is still day, a winter one dark', () => {
  // Pacific: June 21 2026 20:00 PDT = 03:00 UTC the 22nd; Dec 21 2026 20:00 PST = 04:00 UTC the 22nd
  assert.equal(R.isNight(Date.parse('2026-06-22T03:00:00Z')), false);
  assert.equal(R.isNight(Date.parse('2026-12-22T04:00:00Z')), true);
  assert.equal(R.isNight(Date.parse('2026-06-21T19:00:00Z')), false, 'noon');
  assert.equal(R.isNight(Date.parse('2026-06-21T09:00:00Z')), true, '2 am');
});
