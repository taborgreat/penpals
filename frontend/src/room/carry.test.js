// Carrying (rooms.md §3b, Tests: Gravity): a thing let go of comes to rest on what is
// straight under it; held, it is a hand's height above that; each thing is where its body is
// (law/bodies.js, from the room's chain): let go in the air past the table's edge, it falls to the floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { restOf, heldOver, candleFoot, bodiesAfter, footNow, HAND_M } from './carry.js';
import { roomGeometry, ROOM, PX_PER_M } from '../scene/light/index.js';
import { originOf } from '../scene/light.js';

test('a candle set down rests on the table, or on the floor off it; held, it is a hand above; it stands where it was put', () => {
  const geom = roomGeometry(ROOM);
  const origin = originOf(1000, 1400, geom);
  const overTable = [origin[0] - 600 / PX_PER_M, origin[1] - 300 / PX_PER_M];
  assert.deepEqual(restOf(geom, origin, [], overTable), [...overTable, geom.table.top]);
  assert.deepEqual(restOf(geom, origin, [], [0.3, 0.3]), [0.3, 0.3, 0]);
  assert.ok(Math.abs(heldOver(geom, origin, [], overTable)[2] - (geom.table.top + HAND_M)) < 1e-12);
  assert.deepEqual(candleFoot(bodiesAfter([]), 1), geom.candles[1], 'where the room was made with it');
  const t = Date.UTC(2026, 9, 25, 12);
  const line = (k, a) => ({ at: new Date(t + k * 1000).toISOString(), act: { kind: 'room', by: 'ana', ...a } });
  const mm = (p) => p.map((v) => Math.round(v * 1000));
  const at = [geom.table.x1 + 0.3, geom.candles[1][1], geom.table.top + HAND_M];
  const lines = [line(1, { act: 'place', thing: 'candle-1', to: null }), line(2, { act: 'tilt', thing: 'candle-1', pos: mm(at), deg: 0 }), line(3, { act: 'place', thing: 'candle-1', to: mm(at) })];
  const B = bodiesAfter(lines);
  assert.deepEqual(
    candleFoot(B, 1).map((v) => Math.round(v * 1000)),
    [mm(at)[0], mm(at)[1], 0],
    'let go in the air past the table: on the floor',
  );
  assert.ok(footNow(B, 'candle-1', t + 3000 + 100)[2] > 0.5, 'a tenth of a second after: still falling');
});

test('a dropped pen rests on what is under it: a sheet on the table, the table, the floor', () => {
  const geom = roomGeometry(ROOM);
  const origin = originOf(1000, 1400, geom);
  const sheet = { sheet: 's1', origin: [100, 100], size: [400, 500] };
  const overSheet = [origin[0] + 200 / PX_PER_M, origin[1] - 300 / PX_PER_M, geom.table.top + 0.002];
  assert.deepEqual(restOf(geom, origin, [sheet], overSheet), [overSheet[0], overSheet[1], geom.pageOrigin[2]]);
  const offSheet = [origin[0] + 800 / PX_PER_M, origin[1] - 300 / PX_PER_M, geom.table.top + 0.002];
  assert.deepEqual(restOf(geom, origin, [sheet], offSheet), [offSheet[0], offSheet[1], geom.table.top]);
  assert.deepEqual(restOf(geom, origin, [sheet], [0.3, 0.3, 1]), [0.3, 0.3, 0]);
});
