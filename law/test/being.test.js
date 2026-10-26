// The being (rooms.md §4, Tests: "Neck law", "The being").
import test from 'node:test';
import assert from 'node:assert/strict';
import { neck, isAct, quantize, checkPose, glide, encodeMove, decodeMove, NECK_YAW, NECK_PITCH, STEP_M, MAX_RATE, wrap } from '../being.js';

test('the neck law: the head never past 70° of the body or 80° up or down; past it the body turns by exactly the excess', () => {
  // a small look is just the head
  assert.deepEqual(neck(0, 30, 10), { body: 0, yaw: 30, pitch: 10 });
  // a big turn swings the whole body, by exactly the excess
  const n = neck(0, 100, 0);
  assert.equal(n.body, 100 - NECK_YAW);
  assert.equal(wrap(n.yaw - n.body), NECK_YAW);
  assert.equal(neck(10, -120, 0).body, 10 + (-130 + NECK_YAW));
  // across the back (wrapping): the shortest way round
  const back = neck(170, -170, 0);
  assert.deepEqual(back, { body: 170, yaw: -170, pitch: 0 });
  // up and down
  assert.equal(neck(0, 0, 95).pitch, NECK_PITCH);
  assert.equal(neck(0, 0, -95).pitch, -NECK_PITCH);
  // anywhere, never past the limit
  for (let i = 0; i < 2000; i++) {
    const r = neck(((i * 37) % 360) - 180, ((i * 101) % 360) - 180, ((i * 13) % 200) - 100);
    assert.ok(Math.abs(wrap(r.yaw - r.body)) <= NECK_YAW + 1e-9 && Math.abs(r.pitch) <= NECK_PITCH);
  }
});

test('the being: motion acts only past the step or the angle, at most five a second', () => {
  const at = (x, yaw = 0) => ({ pos: [x, 1, 1.2], yaw, pitch: 0, body: 0 });
  assert.equal(isAct(null, 0, at(0), 0), true, 'the first');
  assert.equal(isAct(at(0), 0, at(STEP_M * 0.8), 1000), false, 'a small motion is not recorded');
  assert.equal(isAct(at(0), 0, at(STEP_M * 1.2), 1000), true);
  assert.equal(isAct(at(0), 0, at(0, 4), 1000), false, 'a small turn neither');
  assert.equal(isAct(at(0), 0, at(0, 6), 1000), true);
  assert.equal(isAct(at(0), 0, at(1), 1000 / MAX_RATE - 1), false, 'not faster than five a second');
  // a second of moving steadily: at most five acts
  let last = null,
    lastAt = -1e9,
    sent = 0;
  for (let t = 0; t <= 1000; t += 10) {
    const p = at(t / 100);
    if (isAct(last, lastAt, p, t)) {
      last = p;
      lastAt = t;
      sent++;
    }
  }
  assert.ok(sent <= MAX_RATE + 1, `${sent}`);
  // what crosses the wire: exact, the neck law applied, in the room
  const q = quantize({ pos: [1.23456, 2.0001, 1.2], yaw: 120.04, pitch: 10, body: 0 });
  assert.deepEqual(q, { pos: [1.235, 2, 1.2], yaw: 120, pitch: 10, body: 50, size: 1 });
  assert.ok(checkPose(q) && !checkPose({ ...q, pos: [1e9, 0, 0] }) && checkPose({ ...q, pos: [99, -40, 3] }) && !checkPose({ ...q, yaw: NaN }));
  // others see it glide between acts
  const mid = glide(at(0, 0), at(1, 90), 0.5);
  assert.ok(Math.abs(mid.pos[0] - 0.5) < 1e-9 && Math.abs(mid.yaw - 45) < 1e-9);
  assert.deepEqual(glide(at(0), at(1), 1).pos, at(1).pos);
});

test('motion acts are small: delta-encoded like strokes, a few bytes each, and read back exactly', () => {
  let last = null;
  let bytes = 0;
  const poses = [];
  for (let k = 0; k < 40; k++) {
    const pose = quantize({ pos: [1.2 + 0.06 * k, 2.4 - 0.01 * k, 1.6], yaw: -170 + 9 * k, pitch: 5 - k / 4, body: -170 + 9 * k, size: 1 });
    const d = encodeMove(last, pose);
    if (k) bytes += d.length;
    assert.deepEqual(decodeMove(last, d), pose, `act ${k}`);
    poses.push(pose);
    last = pose;
  }
  assert.ok(bytes / 39 < 16, `${(bytes / 39).toFixed(1)} characters a step`);
  assert.throws(() => decodeMove(null, ''), /cut short/);
});
