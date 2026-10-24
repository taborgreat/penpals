// The scene's pure parts: writing through any camera gives the same acts; the
// minimum angle; the chase in 3D; the light is a beauty layer only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { camera2d, camera3d, pageAt, project, canWrite, elevationOf, orbit, zoomBy, flyTo, fly, lerpCam, chaseFollow, MIN_WRITE_EL, MIN_DIST } from './camera.js';
import fs from 'node:fs';
import { sunAt, returnTo, createLight, originOf, worldOf, seenRgb } from './light.js';
import { decodeRoom, curves } from './light/index.js';
import { DRUNK } from 'penpals-law/v2/constants';
import { handle } from './light/lightWorker.js';
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
  const f = through(flat, 1.4),
    t = through(tilted, 1.6);
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

// The room's light settled as the worker settles it (light/lightWorker.js handle), here.
const ROOM_JSON = new URL('../../public/room/room.json', import.meta.url);
function roomLight() {
  const json = fs.readFileSync(ROOM_JSON, 'utf8');
  const bin = fs.readFileSync(new URL('../../public/room/room.ff', import.meta.url));
  handle({ type: 'room', json, bin });
  const light = createLight({ settle: async (m) => handle({ type: 'settle', ...m, id: 1 }) });
  light.setRoom(decodeRoom(json, bin));
  return light;
}
const settled = async (light, date, opts = {}) => {
  light.at({ now: 0, date, ...opts });
  await new Promise((r) => setTimeout(r, 20));
  return light.at({ now: 1000, date, ...opts });
};
// What the eye makes of the page: its radiance (settled light × the paper / π) through the eye's weights.
const pageSeen = (l, paper = 0.85) =>
  seenRgb(
    l.W,
    Array.from(l.indirect, (v, b) => ((v + l.sun.E[b] * l.sun.dir[2] * 0.5) * paper) / Math.PI),
  );

test('the light is a beauty layer: the sun by the clock through the window, candles burning at night, the eye; facts and digests never change', async () => {
  const at = (h) => new Date(2026, 9, 23, h, 0, 0);
  const morning = sunAt(at(8)),
    noon = sunAt(at(12)),
    evening = sunAt(at(17)),
    night = sunAt(at(23));
  assert.ok(morning.el > 0 && morning.el < noon.el && evening.el < noon.el && night.el < 0, 'low, high, low; below at night');
  assert.ok(morning.az < 0 && evening.az > 0, 'from the left in the morning, the right in the evening');
  const light = roomLight();
  const day = await settled(light, at(12));
  assert.ok(day.sun.E[8] > 5 && day.indirect[8] > 0.1, "the sun, and the room's own light at the page");
  assert.ok(
    day.flames.every((f) => !f.lit),
    'no candles by day',
  );
  const dark = await settled(light, at(23));
  assert.ok(
    dark.sun.E.every((v) => v === 0),
    'no sun at night',
  );
  assert.ok(
    dark.flames.every((f) => f.lit && f.I[10] > 0),
    'the candles burn',
  );
  assert.ok(dark.flames[0].I[14] > dark.flames[0].I[2] * 4, 'and their light is warm (long waves)');
  // the eye: the noon page reads white, the candlelit page warm (adapted only partly)
  const [r, g, b] = pageSeen(day);
  assert.ok(r > 0.7 && g > 0.7 && b > 0.7, `noon reads white: ${[r, g, b].map((v) => v.toFixed(2))}`);
  const [nr, , nb] = pageSeen(dark);
  assert.ok(nr > nb * 1.2, 'candlelight stays warm');
  // the candles burn down only while lit and someone is there
  const h0 = dark.flames[0].height;
  const later = light.at({ now: 60000, date: at(23) });
  assert.ok(later.flames[0].height <= h0);
  const gone = createLight();
  gone.at({ now: 0, date: at(23), present: false });
  assert.ok(
    gone.at({ now: 5000, date: at(23), present: false }).flames.every((f) => !f.lit),
    'no one there: not lit',
  );
  // fading by absorbed light: the law's look fades each channel by what its curve drinks (one table, the same)
  assert.deepEqual([...curves.DRUNK], [...DRUNK]);
  // the sun dragged anywhere, then back to the clock
  const dragged = light.at({ now: 2000, date: at(12), override: { az: 20, el: 30 } });
  assert.ok(Math.abs(dragged.sun.el - 30) < 1e-9 && dragged.night === 0);
  const back = returnTo({ az: 80, el: 8 }, noon, 1);
  assert.ok(Math.abs(back.el - noon.el) < 1e-9, 'released: back to the clock');
  // a view's page lies centred on the room's page, its candles either side
  const o = originOf(...PAGE);
  const left = worldOf(dark.flames[0].foot, o),
    right = worldOf(dark.flames[1].foot, o);
  assert.ok(left[0] < 0 && right[0] > PAGE[0] && Math.abs(left[2] + 3) < 0.5, 'one each side of the page, standing on the table');
  // the facts under any light: the same
  const settled1 = settle(writeThrough(camera2d(...PAGE), 1.4), SEED, FAMILY);
  const digest = () => b64url(factsDigest({ cells: settled1.cells, box: settled1.box, actsBytes: writeThrough(camera2d(...PAGE), 1.4), family: FAMILY }));
  const d0 = digest();
  for (const h of [0, 6, 12, 18, 23]) {
    light.at({ now: h * 1000, date: at(h) });
    sceneField(settled1.cells, settled1.box, { ageH: 0, views: 0 });
  }
  assert.equal(digest(), d0);
  assert.equal(b64url(settled1.facts), d0);
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

test('the room drawn: its meshes cover every patch, each vertex lit by the patches around it; the camera stays in the room', async () => {
  const { roomMeshes, vertexLight } = await import('./roomDraw.js');
  const { withinRoom, GEOM } = await import('./light.js');
  const { frame } = await import('./camera.js');
  const meshes = roomMeshes(GEOM);
  const quads = meshes.reduce((t, m) => t + m.index.length / 6, 0);
  assert.equal(quads, GEOM.patches.length, 'one quad a patch; the window is a hole');
  assert.ok(
    meshes.every((m) => m.index.every((v) => m.touches[v].length > 0)),
    'every vertex drawn takes its light from a patch',
  );
  // brighter light at the patches, brighter vertices; the dark curve takes away
  const n = GEOM.patches.length;
  const W = new Float32Array(51).fill(0.02);
  const dim = vertexLight(meshes, new Float64Array(n * 17).fill(1), W).map((o) => ({ A: o.A.slice(), B: o.B.slice() }));
  const lit = vertexLight(meshes, new Float64Array(n * 17).fill(4), W);
  assert.ok(lit[0].A[0] > dim[0].A[0] * 3.9 && lit[0].B[0] < 0);
  // a camera flown out through a wall comes back in; one inside is left as it is
  const inside = { mode: '3d', target: [500, 700], dist: 1500, az: 0, el: 55, fov: 40, view: 1000 };
  assert.equal(withinRoom(inside, ...PAGE), inside);
  const out = withinRoom({ ...inside, dist: 80000, el: 10 }, ...PAGE);
  assert.ok(out.dist < 80000);
  const eye = frame(out).eye;
  assert.ok(eye[2] > 0 && Math.abs(eye[0]) < 40000 && Math.abs(eye[1]) < 40000, 'in the room');
});
