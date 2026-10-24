// The hand is frozen only by real hands passing the gate (lab/freeze.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { decide, applyFreeze, HAND_FILE } from '../lab/freeze.js';

// A report as lab/analyze.js writes it, for the implemented measure (facts, centred).
function report({ phraseGenuine, phoneShift = 0, tracer, stitcher, pageGenuine = [40, 50, 60, 70, 80, 60, 70], pageAttack = [300, 320, 310], ...extra }) {
  const res = (arm, genuine, perDevice, att) => ({
    kind: 'facts',
    arm,
    center: true,
    reliable: false,
    nBits: arm === 'B' ? 300 : 1092,
    genuine,
    cross: genuine.map((d) => d + 15),
    perDevice,
    attackers: { impostor: [100, 120], tracer: att.tracer, copier: [], stitcher: att.stitcher },
  });
  const desktop = phraseGenuine;
  const phone = phraseGenuine.map((d) => d + phoneShift);
  return {
    synthetic: false,
    people: ['ana', 'bo', 'cy'],
    devices: ['desktop', 'phone'],
    results: [res('B', [...desktop, ...phone], { desktop, phone }, { tracer, stitcher }), res('PAGE', pageGenuine, { desktop: pageGenuine }, { tracer: pageAttack, stitcher: pageAttack })],
    ...extra,
  };
}
const steady = Array.from({ length: 21 }, (_, i) => 8 + (i % 9)); // 8..16

test('a steady hand that keeps tracers and the stitcher out passes, at the smallest radius that works', () => {
  const d = decide(report({ phraseGenuine: steady, tracer: [60, 70, 80], stitcher: [55, 65] }));
  assert.equal(d.ok, true, d.problems.join('; '));
  assert.equal(d.radii.phrase, 16);
  assert.ok(d.codes.phrase.k >= 32);
  assert.equal(d.radii.page, 80);
});

test('the stitcher decides; synthetic or thin data never freezes', () => {
  assert.equal(decide(report({ phraseGenuine: steady, tracer: [60, 70], stitcher: [12, 60] })).ok, false);
  assert.match(decide(report({ phraseGenuine: steady, tracer: [60], stitcher: [60], synthetic: true })).problems.join(), /synthetic/);
  assert.match(decide(report({ phraseGenuine: steady.slice(0, 5), tracer: [60], stitcher: [60] })).problems.join(), /tested desktop phrase writings/);
  assert.match(decide(report({ phraseGenuine: steady, tracer: [60], stitcher: [60], people: ['ana'] })).problems.join(), /people/);
});

test('a phone that reads far from its own sketch fails the per-device rule', () => {
  const d = decide(report({ phraseGenuine: steady, phoneShift: 40, tracer: [200], stitcher: [200] }));
  assert.ok(d.radii.phrase >= 56, 'the radius grows to cover the phone');
  const tooLoose = decide(report({ phraseGenuine: steady, phoneShift: 40, tracer: [50], stitcher: [200] }));
  assert.equal(tooLoose.ok, false, 'and then tracers get in');
});

test('applying writes the radii and turns the flag off (on a copy)', () => {
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'freeze-')), 'hand.js');
  fs.copyFileSync(HAND_FILE, copy);
  applyFreeze({ radii: { phrase: 17, page: 70 } }, copy);
  const s = fs.readFileSync(copy, 'utf8');
  assert.match(s, /export const PHRASE_RADIUS = 17;/);
  assert.match(s, /export const PAGE_RADIUS = 70;/);
  assert.match(s, /export const LAW_HAND_UNFROZEN = false;/);
  assert.match(fs.readFileSync(HAND_FILE, 'utf8'), /export const LAW_HAND_UNFROZEN = true;/, 'the real file is untouched');
});
