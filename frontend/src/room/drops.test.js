// Gravity (rooms.md §3b, Tests): a drip lands on the first surface straight below it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { landing, wickOf } from './drops.js';
import { roomGeometry, ROOM, PX_PER_M } from '../scene/light/index.js';
import { originOf } from '../scene/light.js';

test('a drip lands on the first surface straight below it: a sheet on the table, the table, the floor', () => {
  const geom = roomGeometry(ROOM);
  const origin = originOf(1000, 1400, geom);
  const sheets = [{ sheet: 'abc', origin: [100, -660], size: [800, 600] }];
  const room = (px, py) => [origin[0] + px / PX_PER_M, origin[1] - py / PX_PER_M];
  const onSheet = landing(geom, room(500, -300), { origin, sheets });
  assert.equal(onSheet.on, 'sheet');
  assert.equal(onSheet.sheet, 'abc');
  assert.ok(Math.abs(onSheet.q.x - 400) < 1e-6 && Math.abs(onSheet.q.y - 360) < 1e-6, 'at the point under it, in the sheet');
  assert.equal(landing(geom, room(-600, 300), { origin, sheets }).on, 'table');
  assert.equal(landing(geom, room(-600, 300), { origin, sheets }).z, geom.table.top);
  const off = landing(geom, [0.2, 0.2], { origin, sheets });
  assert.deepEqual([off.on, off.z], ['floor', 0]);
  // tilted, the wick leans over: its drips fall from beside the foot
  const w = wickOf([1, 1, 0.74], 0.1, 90);
  assert.ok(Math.abs(w[0] - 1.1) < 1e-9 && Math.abs(w[2] - 0.74) < 1e-9);
});
