import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEOM } from './light.js';
import { roomCamera } from './light/index.js';
import * as K from './keys.js';

// outside.md Phase 1 and 2, in the room's geometry: walk, jump and land; fly and
// lower; crouch; sit and stand; the eye's zoom moves the eye only.
const DT = 1 / 60;
const run = (pose, keys, seconds) => {
  let p = pose;
  for (let t = 0; t < seconds; t += DT) {
    const input = K.inputOf(keys, p.mode === 'fly');
    p = p.mode === 'walk' ? roomCamera.walk(GEOM, p, input, DT) : roomCamera.fly(GEOM, p, input, DT);
  }
  return p;
};
const standing = () => K.standUp(GEOM, { yaw: 180, pitch: 0 }); // up from the chair, facing away from the table

test('standing up from the chair: at the seat, feet on the floor, on the ground', () => {
  const p = standing();
  assert.equal(p.mode, 'walk');
  assert.ok(Math.abs(p.pos[2] - roomCamera.EYE) < 1e-9);
  assert.ok(K.grounded(GEOM, p));
  assert.ok(K.atChair(GEOM, p));
});

test('W walks the body across the floor, and away from the chair', () => {
  const p = run(standing(), new Set(['w']), 1);
  assert.ok(Math.hypot(p.pos[0] - standing().pos[0], p.pos[1] - standing().pos[1]) > 1); // about WALK m in a second
  assert.ok(Math.abs(p.pos[2] - roomCamera.EYE) < 1e-9); // still on the floor
  assert.ok(!K.atChair(GEOM, p));
});

test('Space jumps: up to about JUMP_M, then back down onto the floor', () => {
  let p = K.jump(GEOM, standing());
  assert.ok(p.vz > 0);
  let top = p.pos[2];
  for (let t = 0; t < 1.5; t += DT) {
    p = roomCamera.walk(GEOM, p, {}, DT);
    top = Math.max(top, p.pos[2]);
  }
  assert.ok(Math.abs(top - roomCamera.EYE - K.JUMP_M) < 0.03, `top ${top}`);
  assert.ok(K.grounded(GEOM, p)); // landed
  assert.deepEqual(K.jump(GEOM, { ...p, vz: -1 }), { ...p, vz: -1 }); // no jumping in the air
});

test('Space twice flies: no falling; Space rises, Shift lowers; twice again, it falls until it rests', () => {
  const first = K.spacePress(null, 1000);
  const second = K.spacePress(first.at, 1200);
  assert.equal(first.double, false);
  assert.equal(second.double, true);
  assert.equal(K.spacePress(first.at, 1400).double, false); // too slow: a jump again
  let p = K.toggleFly(K.jump(GEOM, standing()));
  assert.equal(p.mode, 'fly');
  const hover = run(p, new Set(), 1);
  assert.ok(Math.abs(hover.pos[2] - p.pos[2]) < 1e-9); // flying: it stays where it is
  const up = run(hover, new Set([' ']), 0.5);
  assert.ok(up.pos[2] > hover.pos[2] + 0.2);
  const down = run(up, new Set(['shift']), 0.5);
  assert.ok(down.pos[2] < up.pos[2] - 0.2);
  p = run(K.toggleFly(down), new Set(), 2);
  assert.ok(K.grounded(GEOM, p)); // back on the floor
});

test('Shift on the ground crouches: the eye (and the head others see) lower, the body where it was', () => {
  const p = standing();
  const seen = K.headOf(p, true);
  assert.ok(Math.abs(seen.pos[2] - roomCamera.EYE * K.CROUCH) < 1e-9);
  assert.deepEqual(seen.pos.slice(0, 2), p.pos.slice(0, 2));
  assert.equal(K.headOf(p, false), p);
  assert.equal(K.headOf({ ...p, mode: 'fly' }, true).pos[2], p.pos[2]); // flying, Shift lowers instead
  assert.deepEqual(K.inputOf(new Set(['shift']), false), { forward: 0, right: 0, up: 0 }); // walking, it moves nothing
});

test('the zoom: the eye goes from the room to a bead of ink in a handful of turns, and back; the body never moves', () => {
  const head = standing();
  const body = structuredClone(head);
  const dir = [0, 0, -1]; // straight down at the floor under the head
  let offset = [0, 0, 0];
  let turns = 0;
  while (head.pos[2] + offset[2] > 5e-5) {
    // the point under the cursor is the floor right below: t is what is left of the way
    offset = K.zoomIn(offset, dir, head.pos[2] + offset[2], 100);
    turns++;
  }
  assert.ok(turns <= 16, `${turns} turns from 1.6 m to a bead`); // each turn halves what is left
  assert.ok(head.pos[2] + offset[2] > 0); // never through it
  assert.deepEqual(K.eyeOf(head, offset).pos.slice(0, 2), head.pos.slice(0, 2)); // along the ray under the cursor
  let back = 0;
  while (K.zoomed(offset)) {
    offset = K.zoomOut(offset, 100);
    back++;
  }
  assert.ok(back <= 25, `${back} turns back`);
  assert.deepEqual(head, body); // only the eye moved
});
