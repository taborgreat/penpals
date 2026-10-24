// Together (rooms.md Phase 3): shared sheets lie on the table beside the page,
// your own ink shows over the stamped sheet at once, an act unstamped in time is
// withdrawn, and the others glide between their coarse motion acts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGeometry, ROOM, PX_PER_M } from '../scene/light/room.js';
import { originOf } from '../scene/light.js';
import { slotOf, guessOver, withinStamp, sceneSheetOf, SHARED_PAGE, STAMP_MS } from './shared.js';
import { poseNow, GLIDE_MS, seatAt, seatOf, seatedHead } from './presence.js';
import { TILE } from 'penpals-law/v1/constants';
import { CELLS } from '../ink/live.js';

const geom = roomGeometry(ROOM);
const PAGE = [1000, 1400];

test('shared sheets lie on the table beyond the page: never on it, under a candle, on each other, or off the table', () => {
  const o = originOf(...PAGE, geom);
  const t = geom.table;
  const rects = [...Array(8).keys()].map((i) => {
    const [x, y] = slotOf(i, PAGE[0]);
    return [x, y, x + SHARED_PAGE.width, y + SHARED_PAGE.height];
  });
  const overlap = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  for (const [i, r] of rects.entries()) {
    assert.ok(!overlap(r, [0, 0, ...PAGE]), `sheet ${i} is off the page`);
    for (const c of geom.candles) {
      // the candle's holder, its dish and all (a generous 5 cm about it)
      const [cx, cy] = [(c[0] - o[0]) * PX_PER_M, (o[1] - c[1]) * PX_PER_M];
      const d = 0.05 * PX_PER_M;
      assert.ok(!overlap(r, [cx - d, cy - d, cx + d, cy + d]), `sheet ${i} clear of the candle`);
    }
    for (const [j, q] of rects.entries()) if (j > i) assert.ok(!overlap(r, q), `sheets ${i} and ${j} apart`);
    // its corners on the table top (room m)
    for (const [px, py] of [
      [r[0], r[1]],
      [r[2], r[3]],
    ]) {
      const x = o[0] + px / PX_PER_M,
        y = o[1] - py / PX_PER_M;
      assert.ok(x > t.x0 && x < t.x1 && y > t.y0 && y < t.y1, `sheet ${i} lies on the table`);
    }
  }
  const s = sceneSheetOf('abc', slotOf(0));
  assert.deepEqual(s.box, [0, 0, SHARED_PAGE.width * CELLS, SHARED_PAGE.height * CELLS]);
  assert.equal(s.cellPx, 1 / CELLS);
});

test('your guess: your live ink over the stamped sheet where it has ink, the stamped sheet everywhere else', () => {
  // a stamped field over cells 0..31 × 0..15 (two tiles), red ink everywhere in it
  const box = [0, 0, 32, 16];
  const n = 32 * 16;
  const field = { box, rgba: new Uint8Array(n * 4), surface: new Int16Array(n).fill(3), above: new Uint16Array(n).fill(2), depth: new Uint16Array(n), flags: new Uint8Array(n) };
  for (let k = 0; k < n; k++) field.rgba.set([200, 0, 0, 255], 4 * k);
  // your live tile 0 has blue in its first cell only; tile 2 lies outside the field
  const tile = (tx, blue) => {
    const rgba = new Uint8ClampedArray(TILE * TILE * 4);
    if (blue) rgba.set([0, 0, 200, 255], 0);
    return { tx, ty: 0, rgba, hf: new Uint16Array(TILE * TILE * 4) };
  };
  const listeners = [];
  const live = { tiles: () => [tile(0, true), tile(2, false)], onTiles: (fn) => listeners.push(fn) };
  const g = guessOver(live, field);
  const [t0, t2] = g.tiles();
  assert.deepEqual([...t0.rgba.subarray(0, 4)], [0, 0, 200, 255], 'your stroke, at once');
  assert.deepEqual([...t0.rgba.subarray(4, 8)], [200, 0, 0, 255], 'the stamped ink beside it');
  assert.notEqual(t0.hf[4], 0, 'the stamped heights too');
  assert.ok(
    t2.rgba.every((v) => v === 0),
    'no ink where neither has any',
  );
  // your guess cleared (the live sheet reset: empty tiles): the stamped sheet shows, whole
  let got = null;
  g.onTiles((tiles) => (got = tiles));
  listeners[0]([tile(0, false)]);
  assert.deepEqual([...got[0].rgba.subarray(0, 4)], [200, 0, 0, 255]);
  // with nothing stamped yet, the guess is your ink alone
  assert.equal(guessOver(live, null).tiles()[0].rgba[2], 200);
});

test('timeout: an act unstamped after 8 seconds is withdrawn (and its writer told)', async (t) => {
  assert.equal(STAMP_MS, 8000);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const never = new Promise(() => {});
  const late = withinStamp(never).then(
    () => 'stamped',
    (err) => (err.timeout ? 'withdrawn' : err.message),
  );
  t.mock.timers.tick(STAMP_MS - 1);
  t.mock.timers.tick(1);
  assert.equal(await late, 'withdrawn');
  assert.equal(await withinStamp(Promise.resolve({ line: { n: 1 } })).then((r) => r.line.n), 1, 'in time: stamped');
});

test('the others glide between their acts, and rest where the last one put them', () => {
  const from = { pos: [1, 1, 1.2], yaw: 170, pitch: 0, body: 170, size: 1 };
  const to = { pos: [1.1, 1, 1.2], yaw: -170, pitch: 10, body: -170, size: 1 };
  const half = poseNow({ from, to, t0: 0 }, GLIDE_MS / 2);
  assert.ok(half.moving);
  assert.ok(Math.abs(half.pose.pos[0] - 1.05) < 1e-9);
  assert.ok(Math.abs(Math.abs(half.pose.yaw) - 180) < 1e-9, 'the short way round');
  const done = poseNow({ from, to, t0: 0 }, GLIDE_MS * 2);
  assert.equal(done.moving, false);
  assert.deepEqual(done.pose, to);
  assert.equal(poseNow({ to: null, t0: 0 }, 0).pose, null, 'not yet seen moving');
});

test('writing happens from the seat: the owner in the middle, visitors beside, each turned to what they look at', () => {
  const t = geom.table;
  const seats = [0, 1, 2, 3, 4].map((i) => seatAt(i, geom));
  for (const [i, s] of seats.entries()) {
    assert.ok(s[1] < t.y0 && s[1] > t.y0 - 0.5, `seat ${i} in front of the table`);
    assert.ok(s[0] > 0.2 && s[0] < geom.size[0] - 0.2, `seat ${i} in the room`);
    for (const q of seats.slice(i + 1)) assert.ok(Math.hypot(s[0] - q[0], s[1] - q[1]) >= 0.4, 'room for each');
  }
  for (const name of ['bo', 'ana', 'cy', 'tabor']) assert.ok(seatOf(name) >= 1 && seatOf(name) <= 4, "a visitor never takes the owner's seat");
  // seated at the middle seat, looking at the middle of the page: straight ahead, down
  const r = geom.pageRect;
  const head = seatedHead(0, [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, geom.pageOrigin[2]], geom);
  assert.ok(Math.abs(head.yaw) < 1e-6);
  assert.ok(head.pitch < -30 && head.pitch > -80);
  // from a seat at the side, turned toward the same point
  assert.ok(seatedHead(1, [(r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, geom.pageOrigin[2]], geom).yaw > 20);
});
