// The room's light in parts (settle.js) and the worker that settles it
// (lightWorker.js): the parts add up to the whole, flicker needs no solve,
// no one present means nothing lit, a written wall changes the room.
import test from 'node:test';
import assert from 'node:assert/strict';
import { N } from './axis.js';
import { roomGeometry, formFactors, encodeRoom, decodeRoom } from './room.js';
import { directLight } from './direct.js';
import { solve } from './bounce.js';
import { roomAbsorption, settleParts, combine, daySources, meanTone } from './settle.js';
import { handle, flamesOf } from './lightWorker.js';
import { candleState, NEW_CANDLE } from './candle.js';
import { cellReflectance } from './matter.js';
import { MATTER } from './curves.js';
import { PLASTER, defaultSeed } from './surface.js';

const geom = roomGeometry();
const { json, bin } = encodeRoom(geom, formFactors(geom, { positions: 4, directions: 16 }));
const room = decodeRoom(json, bin);
const absorption = roomAbsorption(room);
const at = (light, i) => light.slice(i * N, (i + 1) * N).reduce((t, v) => t + v, 0);
const DUSK = { az: 70, el: 4 };

test('settle: the parts add up to the whole, so a flicker scales a part instead of solving again', () => {
  const candles = [{ ...NEW_CANDLE, which: 0 }, { ...NEW_CANDLE, which: 1 }];
  const flames = flamesOf(room, candles);
  const parts = settleParts(room, absorption, { sun: DUSK, flames });
  for (const t of [0, 0.37, 1.9]) {
    const scales = candles.map((c) => candleState(c, t, { which: c.which }).intensity);
    const now = combine(parts, scales);
    // the same light solved whole, every source at its strength now
    const whole = solve(room.patches, room.F, absorption, directLight(room, { ...daySources(DUSK), flames: flames.map((f, k) => ({ ...f, intensity: f.intensity.map((v) => v * scales[k]) })) })).light;
    for (const i of [room.page, 0, 40, 120]) assert.ok(Math.abs(at(now, i) - at(whole, i)) <= 2e-3 * at(whole, i), `patch ${i}`);
  }
});

test('settle: light reacts only when a being is there', () => {
  const parts = settleParts(room, absorption, { sun: { az: 0, el: 60 }, flames: flamesOf(room, [{ litMs: 0 }]), present: false });
  assert.ok(parts.day.every((v) => v === 0) && parts.flames[0].every((v) => v === 0));
  const night = settleParts(room, absorption, { sun: { az: 0, el: -30 } });
  assert.ok(night.day.every((v) => v === 0), 'night: the sun grants nothing');
});

test('settle: a written wall changes the room\'s light; grown surfaces drink by their own average', () => {
  const plaster = meanTone(PLASTER, defaultSeed('wall-left'));
  assert.ok(plaster > 0 && plaster < 255);
  const wall = room.patches.findIndex((p) => room.surfaces[p.surface].id === 'wall-left' && p.center[2] > 1 && p.center[1] > 2);
  const red = cellReflectance(MATTER.plaster.light, [200, 3000, 3000]); // a dark red written over it
  const sun = { az: 0, el: 40 };
  const clean = settleParts(room, absorption, { sun });
  const written = settleParts(room, roomAbsorption(room, { curves: { [wall]: red } }), { sun });
  assert.ok(at(written.day, room.page) < at(clean.day, room.page), 'the page gets less back from the darkened wall');
});

test('the light worker: a room, then parts as typed arrays, with the flames\' strengths now', () => {
  assert.equal(handle({ type: 'settle', id: 1 }).error, 'no room yet');
  const r = handle({ type: 'room', json, bin });
  assert.equal(r.n, room.patches.length);
  const out = handle({ type: 'settle', id: 2, sun: { az: 0, el: 50 }, candles: [{ ...NEW_CANDLE, which: 0 }, { ...NEW_CANDLE, which: 1 }] });
  assert.equal(out.id, 2);
  assert.ok(out.day instanceof Float32Array && out.day.length === room.patches.length * N);
  assert.equal(out.flames.length, 2);
  assert.ok(out.scales.every((s) => s > 0));
  assert.ok(out.day[room.page * N + 8] > 0);
  assert.ok(out.ms < 2000, `${out.ms.toFixed(0)} ms`);
  const spent = handle({ type: 'settle', id: 3, candles: [{ ...NEW_CANDLE, spent: true, which: 0 }] });
  assert.ok(spent.flames[0].every((v) => v === 0) && spent.scales[0] === 0, 'a spent candle gives nothing');
});
