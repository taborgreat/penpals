// The sound core (world.md Phase 1): every sound an event, heard from where it happened, in three
// tiers by how near and how many; silence costs nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPEED, BANDS, airAbsorption, throughPane, absorbs } from './bands.js';
import { heard } from './hear.js';
import { grain } from './grain.js';
import { createEar, VOICES, CLOUD } from './ear.js';

const HEAD = { pos: [1.5, 2, 1.2], yaw: 0, pitch: 0 }; // facing +y
// a click: a short, broadband event
const click = (t, pos, seed, strength = 1) => ({ t, pos, seed, dur: 0.01, attack: 0.0005, bands: BANDS.map(() => strength), kind: 'click' });
// an ear whose sounds are only counted
function counted() {
  const got = { voices: [], clouds: [], washes: [], idle: 0 };
  const out = { voice: (g, at, pos, h) => got.voices.push({ g, at, pos, h }), cloud: (b, at, s) => got.clouds.push({ b, at, s }), wash: (s) => s && got.washes.push(s), idle: () => got.idle++ };
  return { ear: createEar({ out }), got };
}

test('the air: sound runs at its speed (from the air row: 343 m/s at 20 °C); it drinks the highs over distance; glass drinks the highs most', () => {
  assert.ok(Math.abs(SPEED - 343.2) < 1, `${SPEED.toFixed(1)} m/s`);
  assert.ok(airAbsorption(8000) > 10 * airAbsorption(500), 'the air drinks 8 kHz far more than 500 Hz');
  const pane = throughPane('glass');
  assert.ok(pane[2] > pane[8] * 10, 'a pane lets the lows through and stops the highs');
  assert.ok(absorbs('fiber')[6] > absorbs('plaster')[6] * 5, 'cloth drinks the highs, plaster hardly');
});

test('a click is heard from where it is: left, right, near, far', () => {
  const at = (dx, dy) => heard([HEAD.pos[0] + dx, HEAD.pos[1] + dy, HEAD.pos[2]], HEAD);
  const left = at(-1, 0),
    right = at(1, 0),
    near = at(0, 0.5),
    far = at(0, 8);
  assert.ok(Math.abs(left.az + 90) < 1e-6 && Math.abs(right.az - 90) < 1e-6, `${left.az} ${right.az}`);
  assert.ok(Math.abs(near.az) < 1e-6, 'ahead');
  assert.ok(Math.abs(near.gain / far.gain - 16) < 1e-6, 'sixteen times nearer, sixteen times louder (as the wave spreads)');
  assert.ok(Math.abs(far.delay - 8 / SPEED) < 1e-9, 'and later by the time sound takes');
  assert.ok(far.air[9] < near.air[9] && far.air[2] > 0.999, 'far, the highest band dulled, the low not');
  // turned to face the source on the right, it is ahead
  assert.ok(Math.abs(heard([HEAD.pos[0] + 1, HEAD.pos[1], HEAD.pos[2]], { ...HEAD, yaw: 90 }).az) < 1e-6);
  // the voice is played from the source's place (the panner turns it for the head)
  const { ear, got } = counted();
  ear.head(HEAD);
  ear.hear(click(0, [0.5, 2, 1.2], 1));
  ear.frame(0, 0.05);
  assert.deepEqual(got.voices[0].pos, [0.5, 2, 1.2]);
  assert.ok(got.voices[0].h.az < -89);
});

test('never mechanical, never random: each grain its event (seeded), the same event the same grain', () => {
  const a = grain({ bands: BANDS.map(() => 1), seed: 7 }),
    b = grain({ bands: BANDS.map(() => 1), seed: 8 }),
    c = grain({ bands: BANDS.map(() => 1), seed: 7 });
  assert.deepEqual([...a], [...c]);
  assert.notDeepEqual([...a], [...b]);
  const energy = (g) => g.reduce((s, v) => s + v * v, 0);
  assert.ok(energy(grain({ bands: BANDS.map(() => 4), seed: 7 })) > energy(a) * 3, 'a stronger event, a louder grain');
});

test('tiers: the nearest and loudest are voices (32 at most), the next few hundred a cloud, the rest a wash', () => {
  const { ear, got } = counted();
  ear.head(HEAD);
  for (let k = 0; k < 1000; k++) ear.hear(click(k * 0.00004, [HEAD.pos[0] + Math.cos(k), HEAD.pos[1] + 1 + (k % 50) * 0.2, HEAD.pos[2]], k + 1));
  const r = ear.frame(0, 0.05);
  assert.deepEqual([r.voices, r.cloud, r.wash], [VOICES, CLOUD, 1000 - VOICES - CLOUD]);
  assert.equal(got.voices.length, VOICES);
  assert.equal(got.clouds.length, 1, 'the cloud is one texture');
  assert.ok(got.washes[0].rate > 0);
  // the voices are the loudest (nearest)
  const quietestVoice = Math.min(...got.voices.map((v) => v.h.gain));
  assert.ok(quietestVoice >= 1 / 3.5, `the voices are the near ones (${quietestVoice})`);
});

test('a hundred clicks a second stay within budget; silence does no work', () => {
  const { ear, got } = counted();
  ear.head(HEAD);
  const t0 = performance.now();
  let most = 0;
  for (let f = 0; f < 50; f++) {
    // 20 ms frames: two clicks in each
    for (let k = 0; k < 2; k++) ear.hear(click(f * 0.02 + k * 0.01, [HEAD.pos[0] + Math.sin(f + k), HEAD.pos[1] + 1 + k, 1], f * 2 + k + 1));
    const r = ear.frame(f * 0.02, 0.02);
    most = Math.max(most, r.voices ?? 0);
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 150, `a second of 100 clicks: ${ms.toFixed(1)} ms of work`);
  assert.ok(most <= VOICES);
  assert.equal(got.voices.length, 100);
  // silence: frames with nothing to sound make nothing
  const made = ear.made;
  for (let f = 0; f < 100; f++) assert.equal(ear.frame(10 + f * 0.02).idle, true);
  assert.equal(ear.made, made, 'no grain made in silence');
  assert.equal(got.idle, 1, 'the audio told once that it may sleep');
});
