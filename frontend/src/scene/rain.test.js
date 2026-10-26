// Rain out there (world.md Phase 4): as many drops hang in the air as fall at its rate, none under a roof,
// each falling at its own speed and carried by the wind; the eye moves through the same rain.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rainNear } from './rain.js';
import { rainDrops } from './glass.js';

test('rain near the eye: its drops at the rate the weather gives, falling, carried; none under a roof or below the ground', () => {
  assert.equal(rainNear({ rate: 0, eye: [0, 0, 1.6], t: 0 }), null, 'no rain: none');
  const eye = [5, -5, 1.6];
  const r = rainNear({ rate: 10, eye, t: 100, drawn: 4000 });
  const { D, fall } = rainDrops(10);
  assert.equal(r.D, D);
  assert.equal(r.velocity[2], -fall);
  // as many as the air about the eye holds at that rate: a cube of the side that holds them, about the eye
  const side = Math.cbrt(4000 / (rainDrops(10).perM2 / fall));
  for (let i = 0; i < r.n; i++) for (let k = 0; k < 3; k++) assert.ok(Math.abs(r.at[3 * i + k] - eye[k]) <= side / 2 + 1e-9);
  // a moment later each has fallen as fast as it falls (or come round again at the top of the cube)
  const later = rainNear({ rate: 10, eye, t: 100.01, drawn: 4000 });
  const fell = r.at[2] - later.at[2];
  assert.ok(Math.abs(fell - fall * 0.01) < 1e-6 || fell < 0, `fell ${fell}`);
  // under a roof (a house over the eye), none; below the ground, none
  const under = rainNear({ rate: 10, eye, t: 100, drawn: 4000, roofs: [[eye[0] - 50, eye[1] - 50, eye[0] + 50, eye[1] + 50, 100]] });
  assert.equal(under.n, 0);
  const above = rainNear({ rate: 10, eye, t: 100, drawn: 4000, ground: eye[2] });
  for (let i = 0; i < above.n; i++) assert.ok(above.at[3 * i + 2] >= eye[2]);
  assert.ok(above.n > 0 && above.n < r.n);
  // the wind carries them
  const blown = rainNear({ rate: 10, wind: [0, -6], eye, t: 100, drawn: 4000 });
  assert.deepEqual(blown.velocity.slice(0, 2), [0, -6]);
});
