// The room's things in the light (matter-fixes §4): each takes the room's settled
// light where it is, from the patches nearest it, not the room's mean. (What blocks
// each source, the depth maps, is drawn on the GPU: e2e/shadows.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { N, LUMENS, xyzOf, decodeRoom } from './light/index.js';
import { CMF } from './light/curves.js';
import { handle } from './light/lightWorker.js';
import { lightAt, meanLight, colorsOf } from './roomDraw.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const baked = path.join(here, '..', '..', 'public', 'room');
const json = fs.readFileSync(path.join(baked, 'room.json'), 'utf8');
const bin = new Uint8Array(fs.readFileSync(path.join(baked, 'room.ff')));
const room = decodeRoom(json, bin);
const lum = (E) => xyzOf(E, CMF, LUMENS)[1];

// The room at night, both candles long lit: each patch's settled light less what comes
// straight from the flames (as light.js keeps it: the direct light is drawn per pixel).
function night() {
  handle({ type: 'room', json, bin });
  const out = handle({
    type: 'settle',
    id: 1,
    candles: [
      { litMs: 600000, which: 0 },
      { litMs: 600000, which: 1 },
    ],
    direct: true,
    present: true,
  });
  assert.ok(!out.error, out.error);
  const ambient = new Float64Array(out.day.length);
  out.flames.forEach((part, k) => {
    for (let i = 0; i < ambient.length; i++) ambient[i] += Math.max(0, out.scales[k] * (part[i] - out.flameDirect[k][i]));
  });
  return ambient;
}

test("a thing takes the room's light where it is: the patches nearest it that face it", () => {
  // one patch lit, the rest dark: a point just in front of it takes its light, a point far off nearly none
  const ambient = new Float64Array(room.patches.length * N);
  const k = room.patches.findIndex((p) => room.surfaces[p.surface].id === 'wall-left');
  for (let b = 0; b < N; b++) ambient[k * N + b] = 1;
  const p = room.patches[k];
  const front = p.center.map((v, i) => v + p.normal[i] * 0.05);
  const behind = p.center.map((v, i) => v - p.normal[i] * 0.05); // (outside the room: the wall does not see it)
  const far = [room.size[0] - 0.3, room.size[1] - 0.3, 0.3];
  // (its neighbours share a little, so the light runs on smoothly as a thing is carried across patches)
  assert.ok(lightAt(room, ambient, front)[8] > 0.35, 'in front of the lit patch');
  assert.ok(
    lightAt(room, ambient, front)[8] >
      lightAt(
        room,
        ambient,
        p.center.map((v, i) => v + p.normal[i] * 0.3),
      )[8],
    'less, farther off',
  );
  assert.ok(lightAt(room, ambient, far)[8] < 0.01, 'across the room');
  assert.equal(lightAt(room, ambient, behind)[8], 0, 'not from behind a surface');
  // an even room is even everywhere
  ambient.fill(0.3);
  for (const q of [front, far, [1.5, 1.6, 1.2]]) assert.ok(Math.abs(lightAt(room, ambient, q)[3] - 0.3) < 1e-12);
});

// (and the flame's own light on it, per pixel, on top: nodes.js spectral)
test('at night, a holder by a flame is lit more than one across the room (not the one mean light for both)', () => {
  const ambient = night();
  const byFlame = [room.candles[0][0], room.candles[0][1], room.candles[0][2] + 0.008];
  const across = [0.25, room.size[1] - 0.25, 0.008]; // on the floor, in the far corner
  const near = lum(lightAt(room, ambient, byFlame)),
    off = lum(lightAt(room, ambient, across));
  assert.ok(near > 1.25 * off, `by the flame ${near.toFixed(3)}, across the room ${off.toFixed(3)}`);
  // as it was: both the room's mean, the same
  const W = new Float64Array(3 * N);
  for (let b = 0; b < N; b++) [CMF.x, CMF.y, CMF.z].forEach((c, i) => (W[i * N + b] = c[b]));
  const mean = meanLight(ambient, room.patches.length, W, 'brass');
  const there = colorsOf(lightAt(room, ambient, byFlame), W, 'brass');
  assert.ok(there.A[1] > mean.A[1], 'more than the mean, by the flame');
});
