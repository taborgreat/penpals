import test from 'node:test';
import assert from 'node:assert/strict';
import { worldHit } from './worldRay.js';
import { roomGeometry, ROOM } from './light/room.js';
import { ARM } from './reach.js';

const geom = roomGeometry(ROOM);
const [W, D] = geom.size;
const winMid = (geom.window.z0 + geom.window.z1) / 2;
const norm = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
const empty = { stones: [], sticks: [], trees: [], made: [], galls: [], hives: [], mailboxes: [], feathers: [] };
const flat = () => 0;
const world = (over = {}) => ({ geom, opens: { door: false, window: false, shutters: true }, houses: [], spec: { ...empty }, ground: flat, ...over });

test('in the house: the wall the eye looks at, as the room has it', () => {
  const h = worldHit(world(), [W / 2, D / 2, 1.5], [-1, 0, 0]);
  assert.equal(h.kind, 'room');
  assert.ok(h.patch >= 0);
  assert.ok(Math.abs(h.t - W / 2) < 1e-6);
});

test('through the window: the eye goes on to what is out there, past any arm; the shutters shut stop it', () => {
  const stone = { id: 'stone:1,1', at: [W / 2, D + 6, winMid], r: 0.1 };
  const w = world({ spec: { ...empty, stones: [stone] } });
  const h = worldHit(w, [W / 2, D - 1, winMid], [0, 1, 0]);
  assert.equal(h.kind, 'stone', 'the glass is seen through');
  assert.ok(h.t > ARM, 'no arm limits the eye');
  assert.equal(h.opening?.kind, 'window', 'the window it looked through');
  const shut = worldHit({ ...w, opens: { door: false, window: false, shutters: false } }, [W / 2, D - 1, winMid], [0, 1, 0]);
  assert.equal(shut.kind, 'opening', 'shut: the shutters');
  assert.ok(Math.abs(shut.t - 1) < 1e-6);
  const hand = worldHit(w, [W / 2, D - 1, winMid], [0, 1, 0], { hand: true });
  assert.equal(hand.kind, 'opening', 'a hand: the glass, the sash shut');
});

test('outside: the others’ houses are matter (their shell); through an open door, their room', () => {
  const other = { key: 'bo', at: [0, -20, 0], opens: { door: false, shutters: true } };
  const eye = [geom.door.x0 + 0.2, -30, 1];
  const h = worldHit(world({ houses: [other] }), eye, [0, 1, 0]);
  assert.equal(h.kind, 'house');
  assert.equal(h.key, 'bo');
  assert.ok(Math.abs(h.t - 10) < 1e-6, 'its near wall');
  assert.equal(h.inside, false);
  const open = worldHit(world({ houses: [{ ...other, opens: { door: true, shutters: true } }] }), eye, [0, 1, 0]);
  assert.equal(open.key, 'bo');
  assert.equal(open.inside, true, 'in through its door');
  assert.ok(open.t > 10);
});

test('this house from outside: its wall, not the far side of its room', () => {
  const h = worldHit(world(), [W / 2 + 0.6, -4, 1.2], [0, 1, 0]);
  assert.equal(h.kind, 'house');
  assert.equal(h.key, null);
  assert.ok(Math.abs(h.t - 4) < 1e-6);
});

test('the ground far off: the eye reaches it (to the grown outside), a hand only near', () => {
  const eye = [W / 2, -2, 1.6];
  const dir = norm([0, -20, -1.6]);
  const h = worldHit(world(), eye, dir);
  assert.equal(h.kind, 'ground');
  assert.ok(Math.abs(h.at[1] - -22) < 0.01, `it meets the ground 20 m on: ${h.at}`);
  assert.ok(Math.abs(h.at[2]) < 1e-3);
});
