// Joined rooms (rooms.md §7): two rooms of the same shape side by side, one
// geometry, so they render and light as one. The space is closed (every ray meets
// something), light crosses the opening (all of the wall, or only the door), the
// eye passes the door but not the wall, the shelf leaves a shared wall, and the
// baked files are each joining's own.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOM, JOINS, SIDES, joinedGeometry, roomGeometry, formFactors, decodeRoom, hit, PASS } from './room.js';
import { clearance } from './roomCamera.js';
import { shelfLayout } from '../shelf.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const crossing = (g, ff) => {
  const n = g.patches.length,
    cols = n + g.openings.length;
  const other = (j) => g.surfaces[g.patches[j].surface].id.startsWith('b:');
  let leak = 0,
    across = 0;
  for (let i = 0; i < n; i++) {
    let row = 0;
    for (let j = 0; j < cols; j++) row += ff[i * cols + j];
    leak = Math.max(leak, 1 - row);
    if (!other(i)) for (let j = 0; j < n; j++) if (other(j)) across += ff[i * cols + j];
  }
  return { leak, across };
};

test('two rooms joined are one closed space; light crosses all of the wall when it is down, only the door when it stands', () => {
  const wall = joinedGeometry(ROOM, 'wall', 'right');
  const door = joinedGeometry(ROOM, 'door', 'right');
  const w = crossing(wall, formFactors(wall, { positions: 2, directions: 8 }));
  const d = crossing(door, formFactors(door, { positions: 2, directions: 8 }));
  assert.ok(w.leak < 1e-6 && d.leak < 1e-6, 'every ray meets something');
  assert.ok(d.across > 1, 'through the door');
  assert.ok(w.across > 3 * d.across, `the wall down lets far more through: ${w.across} vs ${d.across}`);
  assert.ok(!wall.surfaces.some((s) => s.id === 'wall-right' || s.id === 'b:wall-left'), 'the wall between is down');
  assert.ok(door.surfaces.find((s) => s.id === 'wall-right').grid.cells.includes(PASS), 'a door in it');
  // a ray straight through the door goes on into the other room; one at the wall beside it stops
  const D = door.size[1];
  const yDoor = (door.join.door.y0 + door.join.door.y1) / 2;
  assert.ok(door.surfaces[hit(door, [1.5, yDoor, 1], [1, 0, 0]).surface].id.startsWith('b:'));
  assert.equal(door.surfaces[hit(door, [1.5, D - 0.2, 1], [1, 0, 0]).surface].id, 'wall-right');
});

test('the eye passes the door, not the wall; the other table is solid; my page, table and candles are mine, on either side', () => {
  const door = joinedGeometry(ROOM, 'door', 'right');
  const x = door.join.x;
  const yDoor = (door.join.door.y0 + door.join.door.y1) / 2;
  assert.ok(clearance(door, [x, yDoor, 1]) > 0.2, 'in the doorway: room to pass');
  assert.equal(clearance(door, [x, door.size[1] - 0.3, 1]), 0, 'in the wall');
  const wall = joinedGeometry(ROOM, 'wall', 'right');
  assert.ok(clearance(wall, [x, door.size[1] - 0.6, 1]) > 0.2, 'the wall down: one space');
  for (const side of SIDES) {
    const g = joinedGeometry(ROOM, 'door', side);
    const one = roomGeometry(ROOM);
    const dx = g.mine.x0;
    assert.equal(dx, side === 'right' ? 0 : one.size[0]);
    assert.deepEqual(g.pageOrigin, [one.pageOrigin[0] + dx, one.pageOrigin[1], one.pageOrigin[2]]);
    assert.equal(g.table.x0, one.table.x0 + dx);
    assert.deepEqual(g.candles, one.candles.map((c) => [c[0] + dx, c[1], c[2]]));
    assert.equal(g.patches[g.page].kind, 'page');
    // the shelf on a wall of my own: off the shared wall when the other room is on my left
    const { board } = shelfLayout(g, 1);
    if (side === 'left') assert.ok(Math.abs(board[3] - g.mine.x1) < 1e-9, 'on my right wall');
    else assert.equal(board[0], 0);
  }
});

test('each joining is baked, and its files are its geometry', () => {
  for (const o of JOINS)
    for (const s of SIDES) {
      const name = `joined-${o}-${s}`;
      const json = fs.readFileSync(path.join(here, '..', '..', '..', 'public', 'room', `${name}.json`), 'utf8');
      const bin = fs.readFileSync(path.join(here, '..', '..', '..', 'public', 'room', `${name}.ff`));
      const room = decodeRoom(json, bin);
      const g = joinedGeometry(ROOM, o, s);
      assert.equal(room.patches.length, g.patches.length);
      assert.deepEqual(room.join, g.join);
      assert.equal(room.F.length, g.patches.length ** 2);
    }
});
