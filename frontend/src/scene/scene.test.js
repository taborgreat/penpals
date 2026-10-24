// The scene's pure parts: writing through any camera gives the same acts; the
// minimum angle; the chase in 3D; the light is a beauty layer only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { camera2d, camera3d, pageAt, project, canWrite, elevationOf, orbit, zoomBy, flyTo, fly, lerpCam, chaseFollow, MIN_WRITE_EL, MIN_DIST } from './camera.js';
import { sunAt, lightAt, candleMix, returnTo, kelvin } from './light.js';
import { createCameraStack } from './stack.js';
import { watchBattery, isLowPower, LOW_BATTERY } from './support.js';
import { createCapture, strokesToActs } from '../ink/capture.js';
import { settle } from 'penpals-law/record';
import { sceneField } from 'penpals-law/v2/scene';
import { factsDigest } from 'penpals-law/v2/look';
import { b64url } from 'penpals-law/tags';
import { CHASE, chase } from '../components/chase.js';

const PEN = { nib: 0, size: 40, flex: 0, flow: 7, rgb: [20, 20, 20], angle: 0, spatter: 1 };
const SEED = new Uint8Array(64).map((_, i) => (i * 29 + 3) & 255);
const FAMILY = { grain: 8, weight: 8, tooth: 0 };
const ev = (timeStamp) => ({ timeStamp, pressure: 0.5, pointerType: 'mouse' });
const PAGE = [1000, 1400];

// A pointer path in page coordinates (away from the quantizer's rounding edges).
const path = Array.from({ length: 90 }, (_, i) => ({ x: 300 + i * 2.13 + 0.031, y: 400 + 25 * Math.sin(i / 9) + 0.017, t: 1000 + i * 8 }));

// Each page point → the screen through `cam` → back onto the paper by the ray → capture.
function writeThrough(cam, aspect) {
  const cap = createCapture({ now: () => 0 });
  const onPage = (p) => {
    const ndc = project(cam, [p.x, p.y, 0], aspect);
    const [x, y] = pageAt(cam, ndc[0], ndc[1], aspect);
    return { x, y };
  };
  cap.down(onPage(path[0]), ev(path[0].t));
  for (const p of path.slice(1, -1)) cap.move(onPage(p), ev(p.t));
  cap.up(onPage(path.at(-1)), ev(path.at(-1).t));
  return strokesToActs(cap.strokes, PEN);
}

test('the same pointer path, captured top-down and through an oblique 3D camera, gives byte-identical acts and facts', () => {
  const flat = writeThrough(camera2d(...PAGE), 1.4);
  const oblique = { ...camera3d(...PAGE), az: 31, el: 38, dist: 900, target: [420, 380] };
  const tilted = writeThrough(oblique, 1.78);
  assert.ok(elevationOf(oblique) > MIN_WRITE_EL);
  assert.deepEqual([...tilted], [...flat], 'the acts are page coordinates: the camera leaves no trace');
  const a = settle(flat, SEED, FAMILY);
  const b = settle(tilted, SEED, FAMILY);
  assert.equal(b64url(b.facts), b64url(a.facts));
});

test('switching 2D/3D mid-draft changes nothing in the draft', () => {
  // half the stroke through the flat camera, the rest after switching to 3D
  const cap = createCapture({ now: () => 0 });
  const flat = camera2d(...PAGE);
  const tilted = lerpCam(flat, { ...camera3d(...PAGE), el: 50, az: 20 }, 1);
  const through = (cam, aspect) => (p) => {
    const ndc = project(cam, [p.x, p.y, 0], aspect);
    const [x, y] = pageAt(cam, ndc[0], ndc[1], aspect);
    return { x, y };
  };
  const f = through(flat, 1.4), t = through(tilted, 1.6);
  cap.down(f(path[0]), ev(path[0].t));
  path.slice(1, 45).forEach((p) => cap.move(f(p), ev(p.t)));
  path.slice(45, -1).forEach((p) => cap.move(t(p), ev(p.t)));
  cap.up(t(path.at(-1)), ev(path.at(-1).t));
  assert.deepEqual([...strokesToActs(cap.strokes, PEN)], [...writeThrough(flat, 1.4)]);
});

test('below the minimum angle writing pauses; above it, it resumes', () => {
  const cam = camera3d(...PAGE);
  assert.ok(canWrite(cam));
  const low = orbit(cam, 0, -(cam.el - 20));
  assert.equal(canWrite(low), false, `at ${elevationOf(low).toFixed(0)}° a pixel covers too much page`);
  assert.ok(canWrite(orbit(low, 0, 10)));
  assert.ok(canWrite(camera2d(...PAGE)), 'straight down always writes');
});

test('undo after a camera move restores the camera from before the stroke, with the ink', () => {
  const stack = createCameraStack();
  const before = { ...camera3d(...PAGE), az: 12 };
  stack.penDown(before);
  const moved = orbit(before, 40, -10);
  stack.penDown(moved);
  assert.deepEqual(stack.undo(), moved);
  assert.deepEqual(stack.undo(), before);
  assert.equal(stack.undo(), null);
});

test('the chase in 3D: the camera target advances only on rightward motion inside the zone, as the flat offset does', () => {
  const cam = { cam: 0, camY: 0, zoom: 2, prevX: 0, trail: [] };
  const base = [200, 300];
  let view = { ...camera3d(...PAGE), target: [...base] };
  const start = 400; // the zone starts here (screen px)
  const step = (x, y) => {
    const before = cam.cam;
    chase(cam, x, y, start, 1e9);
    cam.prevX = x;
    cam.trail.push({ x, y });
    view = chaseFollow(view, base, [cam.cam, 0]);
    return cam.cam - before;
  };
  for (let x = 0; x <= 380; x += 20) step(x, 100); // outside the zone
  assert.equal(view.target[0], base[0], 'outside the zone: still');
  let moved = 0;
  for (let x = 400; x <= 600; x += 10) moved += step(x, 100);
  assert.ok(moved > 0 && view.target[0] === base[0] + cam.cam, 'rightward in the zone: the target slides by the chase offset');
  const at = view.target[0];
  for (let x = 600; x >= 450; x -= 10) step(x, 100);
  assert.equal(view.target[0], at, 'leftward: it never comes back');
  assert.ok(CHASE.RATE > 0);
});

test('the light is a beauty layer: by the clock, candles at night, dragged and returned; facts and digests never change', () => {
  const at = (h) => new Date(2026, 9, 23, h, 0, 0);
  const morning = sunAt(at(8)), noon = sunAt(at(12)), evening = sunAt(at(17)), night = sunAt(at(23));
  assert.ok(morning.el > 0 && morning.el < noon.el && evening.el < noon.el, 'low, high, low');
  assert.ok(morning.dir[0] < 0 && evening.dir[0] > 0, 'from the left in the morning, the right in the evening');
  assert.ok(noon.color[2] > morning.color[2], 'white at noon, warm when low');
  assert.ok(night.el < 0 && candleMix(night.el) > 0.99 && candleMix(noon.el) < 0.01, 'candles at night, none by day');
  const n = lightAt(at(23), 1.5, ...PAGE);
  assert.equal(n.candles.length, 2);
  assert.ok(n.candles[0].pos[0] < 0 && n.candles[1].pos[0] > PAGE[0], 'one each side of the page');
  assert.ok(n.candles[0].intensity !== lightAt(at(23), 1.6, ...PAGE).candles[0].intensity, 'they flicker');
  assert.ok(kelvin(1800)[0] > kelvin(1800)[2] * 2, 'candlelight is warm');
  const dragged = lightAt(at(12), 0, ...PAGE, { az: 80, el: 8 });
  assert.ok(dragged.sun.el === 8 && dragged.night === 0, 'dragged anywhere');
  const back = returnTo({ az: 80, el: 8 }, noon, 1);
  assert.ok(Math.abs(back.el - noon.el) < 1e-9, 'released: back to the clock');
  // the facts under any light: the same
  const settled = settle(writeThrough(camera2d(...PAGE), 1.4), SEED, FAMILY);
  const digest = () => b64url(factsDigest({ cells: settled.cells, box: settled.box, actsBytes: writeThrough(camera2d(...PAGE), 1.4), family: FAMILY }));
  const d0 = digest();
  for (const h of [0, 6, 12, 18, 23]) {
    lightAt(at(h), h, ...PAGE);
    sceneField(settled.cells, settled.box, { ageH: 0, views: 0 });
  }
  assert.equal(digest(), d0);
  assert.equal(b64url(settled.facts), d0);
});

test('low power: on battery and nearly out, the scene stands down; charging brings it back', async () => {
  const battery = new EventTarget();
  battery.charging = false;
  battery.level = 0.6;
  assert.equal(await watchBattery({ getBattery: async () => battery }), true);
  assert.equal(isLowPower(), false);
  battery.level = LOW_BATTERY - 0.05;
  battery.dispatchEvent(new Event('levelchange'));
  assert.equal(isLowPower(), true);
  battery.charging = true;
  battery.dispatchEvent(new Event('chargingchange'));
  assert.equal(isLowPower(), false);
  assert.equal(await watchBattery({}), false); // no Battery Status API: the scene as chosen
});

test('the camera: looking goes from dead sideways to straight down; coming closer slides toward the cursor; it flies down to the beads', () => {
  const c = camera3d(1000, 600);
  assert.equal(orbit(c, 0, -200).el, 0, 'down to 0°, edge on');
  assert.equal(orbit(c, 0, 200).el, 90, 'up to straight down');
  assert.ok(!canWrite(orbit(c, 0, -200)) && canWrite(c), 'writing still needs ' + MIN_WRITE_EL + '°');
  const p = [900, 100];
  const closer = zoomBy(c, 0.5, p);
  assert.equal(closer.dist, c.dist * 0.5);
  assert.deepEqual(closer.target, [c.target[0] + (p[0] - c.target[0]) * 0.5, c.target[1] + (p[1] - c.target[1]) * 0.5], 'halfway closer, halfway to the cursor');
  assert.deepEqual(zoomBy(c, 2, p).target, c.target, 'going back does not slide');
  let near = c;
  for (let i = 0; i < 200; i++) near = zoomBy(near, 0.5, p);
  assert.equal(near.dist, MIN_DIST, 'as close as ' + MIN_DIST + ' px');
  assert.equal(flyTo(near, p).dist, MIN_DIST);
  assert.ok(fly(near, 0, 0, 0.5).dist >= MIN_DIST);
});
