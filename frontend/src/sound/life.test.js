// The sounds of life (world.md Phase 6): beings' sounds are their acts, heard as they happen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chirpRate, chirps, singing, wingbeats } from './life.js';
import { place } from './music.js';

const bug = { pos: [3, 6, 0.1], seed: 11, pitch: 2800, loud: 1e-4 };

test("a chirp's rate follows the air's heat (Dolbear's law); too cold, the bug is still", () => {
  const per = (c) => chirps(bug, 0, 600, c).length / 10; // a minute's
  assert.ok(Math.abs(per(20) - (4 * 68 - 160)) <= 2, `${per(20)} a minute at 20 °C (112 by Dolbear)`);
  assert.ok(per(28) > per(20) * 1.3, 'warmer, faster');
  assert.equal(chirps(bug, 0, 600, 4).length, 0, 'at 4 °C, nothing');
  assert.equal(chirpRate(4), 0);
  const ts = chirps(bug, 0, 60, 20).map((e) => e.t);
  const gaps = ts.slice(1).map((t, i) => t - ts[i]);
  assert.ok(Math.max(...gaps) - Math.min(...gaps) > 0.05, 'a living thing, not a clock');
  assert.ok(
    chirps(bug, 0, 10, 20).every((e) => e.ring.f === 2800),
    'its wing rings at its own pitch',
  );
});

test("birds sing most at dawn, little through the day, not at night, nor in the rain; no being's sound is moved onto the pulse", () => {
  assert.ok(singing(4) > singing(40) * 3);
  assert.equal(singing(-20), 0);
  assert.equal(singing(4, 3), 0, 'sheltering');
  const sounds = [...chirps(bug, 0, 5, 22), ...wingbeats({ pos: [2, 5, 2], flaps: 18, mass: 0.02, seed: 4 }, 0, 1)];
  assert.ok(sounds.length > 10);
  for (const e of sounds) assert.deepEqual(place({ ...e, world: 1.75e9 + e.t }, 'ana'), { ...e, world: 1.75e9 + e.t }, `${e.kind}: as it happened`);
  const beats = wingbeats({ pos: [2, 5, 2], flaps: 18, mass: 0.02, seed: 4 }, 0, 1);
  assert.equal(beats.length, 18, 'one rush a beat');
  assert.ok(wingbeats({ pos: [2, 5, 2], flaps: 4, mass: 0.5, seed: 4 }, 0, 1)[0].bands.reduce((a, x) => a + x, 0) > beats[0].bands.reduce((a, x) => a + x, 0), 'a heavier, slower wing pushes harder');
});
