// The room's air and the candles' smoke (world.md Phase 3b), on the one heat rule.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGeometry, ROOM } from './light/room.js';
import { candleState, NEW_CANDLE } from './light/candle.js';
import { hazeOf } from './light/smoke.js';
import { createRoomAir, AIR_DX, AIR_DT, SETTLE_S } from './roomAir.js';

const geom = roomGeometry(ROOM);
const T0 = 1.75e9;
const st = candleState(NEW_CANDLE, 0, { lit: true });
const flameAt = (k) => ({ ...st, lit: true, pos: [geom.candles[k % 2][0] + 0.15 * Math.floor(k / 2), geom.candles[k % 2][1], geom.candles[k % 2][2] + st.flameAt] });
// burn `flames` for `s` seconds, a second a frame (and caught up at the end: a busy machine's frames each
// do only their budget's share, the rest left for the frames after)
function burn(air, from, s, flames, opts = {}) {
  for (let t = from + 1; t <= from + s; t++) air.to(t, { flames, ...opts });
  while (air.at + AIR_DT <= from + s) air.to(from + s, { flames, ...opts });
  return from + s;
}
// to t, frame after frame until it is there (a frame does a frame's share)
function until(air, t, opts = {}) {
  while (air.at + 1 < t) air.to(t, opts);
}
const layers = (air) => {
  const { smoke } = air.heat.cells;
  const [nx, ny] = [Math.round(geom.size[0] / AIR_DX), Math.round(geom.size[1] / AIR_DX)];
  const out = [];
  for (let i = 0; i < smoke.length; i++) out[Math.floor(i / (nx * ny))] = (out[Math.floor(i / (nx * ny))] ?? 0) + smoke[i];
  return out;
};

test("one candle's smoke rises and spreads under the ceiling, then thins to nothing over time", () => {
  const air = createRoomAir(geom);
  air.to(T0);
  const t = burn(air, T0, 600, [flameAt(0)]);
  const made = air.smoke();
  assert.ok(Math.abs(made - st.smokeRate * 1e6 * 600) < st.smokeRate * 1e6 * 2, 'what the flame burnt is in the air');
  const L = layers(air);
  const top = L.slice(-4).reduce((a, x) => a + x, 0);
  assert.ok(top > made / 2, `most of it under the ceiling (${((100 * top) / made).toFixed(0)}% in its top 40 cm)`);
  until(air, t + 60 * 86400);
  assert.ok(air.smoke() < made * 0.02, `two months on: ${((100 * air.smoke()) / made).toFixed(2)}% left`);
  assert.ok(air.heat.settled.smoke > made * 0.9, 'settled on the faces');
});

test('many candles fill the room: as much smoke as they burn; enough of them, a visible haze', () => {
  const one = createRoomAir(geom),
    four = createRoomAir(geom);
  one.to(T0);
  four.to(T0);
  burn(one, T0, 300, [flameAt(0)]);
  burn(four, T0, 300, [0, 1, 2, 3].map(flameAt));
  assert.ok(Math.abs(four.smoke() / one.smoke() - 4) < 0.05);
  // the haze a candle-second leaves (its soot), and how many candle-hours make the room's far wall dim
  const perCandleS = one.soot() / 300;
  const at550 = 8; // (the bin of 560 nm)
  const visible = 0.1 / geom.size[1]; // a tenth of the light gone across the room
  const candleHours = visible / hazeOf(perCandleS).ext[at550] / 3600;
  assert.ok(candleHours > 20, `a candle for an evening leaves no haze to see (${candleHours.toFixed(0)} candle-hours make one)`);
  assert.ok(hazeOf(perCandleS * 3600 * candleHours).ext[at550] * geom.size[1] >= 0.1 - 1e-9);
  assert.ok(hazeOf(1e-5).ext[0] > hazeOf(1e-5).ext[15], 'soot drinks blue more than red: a smoky room yellows');
});

test('an open window lets the smoke out where the room is warmer than outside; what hangs above it stays', () => {
  const shut = createRoomAir(geom),
    open = createRoomAir(geom);
  const cold = { outside: -10 };
  for (const a of [shut, open]) {
    a.to(T0);
    burn(a, T0, 1200, [flameAt(0)], cold);
  }
  const before = open.smoke();
  burn(shut, T0 + 1200, 1800, [], cold);
  burn(open, T0 + 1200, 1800, [], { ...cold, open: true });
  assert.ok(open.heat.vented.smoke > before * 0.03, `out through it: ${((100 * open.heat.vented.smoke) / before).toFixed(1)}%`);
  assert.ok(open.smoke() < shut.smoke() * 0.97, `${(open.smoke() / 1e6).toFixed(2)} g left open, ${(shut.smoke() / 1e6).toFixed(2)} g shut`);
  const head = Math.floor(geom.window.z1 / AIR_DX);
  const above = (a) =>
    layers(a)
      .slice(head + 1)
      .reduce((x, y) => x + y, 0);
  assert.ok(above(open) > above(shut) * 0.7, 'the smoke above the window head is not drawn out through it');
});

test('a room left and come back to holds the same smoke as one watched the whole time', () => {
  const watched = createRoomAir(geom),
    left = createRoomAir(geom);
  for (const a of [watched, left]) {
    a.to(T0);
    burn(a, T0, 120, [flameAt(0)]);
  }
  const end = T0 + 120 + SETTLE_S * 3 + 500;
  for (let t = T0 + 121; t <= end; t += 5) watched.to(t); // a frame every 5 s
  until(left, end); // nothing drawn meanwhile: caught up when it is
  watched.to(end);
  assert.equal(watched.at, left.at);
  assert.deepEqual([...watched.heat.cells.smoke], [...left.heat.cells.smoke]);
  assert.deepEqual([...watched.heat.cells.E], [...left.heat.cells.E]);
});
