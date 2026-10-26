// Together in a house (rooms.md Phase 3; law/paper.js): papers lie where they rest, drawn there; your own ink
// shows over the stamped paper at once, an act unstamped in time is withdrawn, who may mark a paper is read
// from its chain, and the others glide between their coarse motion acts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGeometry, ROOM, PX_PER_M, PAPER_PX } from '../scene/light/room.js';
import { originOf } from '../scene/light.js';
import { guessOver, withinStamp, sceneSheetOf, sealsOf, mayMark, STAMP_MS } from './papers.js';
import { newPaperAt } from './together.js';
import { poseNow, GLIDE_MS, seatAt, seatOf, seatedHead } from './presence.js';
import { paper as P } from 'penpals-law';
import { TILE } from 'penpals-law/v1/constants';
import { toHalf } from '../scene/half.js';
import { CELLS } from '../ink/live.js';

const geom = roomGeometry(ROOM);
const PAGE = [1000, 1400];
const view = (size = P.SIZES.half) => ({ paper: 'p1', birth: { size }, lines: [] });

test('a paper is drawn where it rests: on the table, on the page’s plane; on the floor, below it; its face its whole size', () => {
  const o = originOf(...PAGE, geom);
  const t = geom.table;
  const mid = [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2];
  const on = sceneSheetOf(view(), [...mid, t.top], o);
  assert.deepEqual(on.box, [0, 0, 1000 * CELLS, 700 * CELLS]);
  assert.equal(on.cellPx, 1 / CELLS);
  assert.ok(Math.abs(on.lift) < 1e-9, 'on the table: as a sheet on the page lies');
  // its middle where it rests
  const cx = o[0] + (on.origin[0] + 500) / PX_PER_M,
    cy = o[1] - (on.origin[1] + 350) / PX_PER_M;
  assert.ok(Math.abs(cx - mid[0]) < 1e-3 && Math.abs(cy - mid[1]) < 1e-3);
  const floor = sceneSheetOf(view(), [0.5, 0.5, 0], o);
  assert.ok(Math.abs(floor.lift - -t.top * PX_PER_M) < 1, 'on the floor: the table’s height below');
  assert.equal(PAPER_PX > 0, true);
});

test('a new paper lies wholly on its owner’s table: the first in front of the chair, any more somewhere on it', () => {
  const t = geom.table;
  const [w, h] = P.SIZES.half.map((v) => v / PX_PER_M);
  for (const r of [0, 0.5, 0.999]) {
    const [x, y, z] = newPaperAt(geom, P.SIZES.half, false, () => r);
    assert.ok(x - w / 2 >= t.x0 - 1e-9 && x + w / 2 <= t.x1 + 1e-9 && y - h / 2 >= t.y0 - 1e-9 && y + h / 2 <= t.y1 + 1e-9, `on it (${r})`);
    assert.equal(z, t.top);
  }
  const first = newPaperAt(geom, P.SIZES.half, true);
  assert.ok(Math.abs(first[0] - (geom.pageRect.x0 + geom.pageRect.x1) / 2) < 1e-9);
});

test('your guess: your live ink over the stamped sheet where it has ink, the stamped sheet everywhere else', () => {
  // a stamped field over cells 0..31 × 0..15 (two tiles), red ink everywhere in it (its absorbances: green and blue drunk)
  const box = [0, 0, 32, 16];
  const n = 32 * 16;
  const RED = [0, 2, 2, 0],
    BLUE = [2, 2, 0, 0];
  const field = { box, abs: new Float32Array(n * 4), surface: new Int16Array(n).fill(3), above: new Uint16Array(n).fill(2), depth: new Uint16Array(n), flags: new Uint8Array(n) };
  for (let k = 0; k < n; k++) field.abs.set(RED, 4 * k);
  // your live tile 0 has blue in its first cell only; tile 2 lies outside the field (as the worker sends them: half floats)
  const tile = (tx, blue) => {
    const abs = new Uint16Array(TILE * TILE * 4);
    if (blue) abs.set(BLUE.map(toHalf), 0);
    return { tx, ty: 0, abs, hf: new Uint16Array(TILE * TILE * 4) };
  };
  const halved = (a) => a.map(toHalf);
  const listeners = [];
  const live = { tiles: () => [tile(0, true), tile(2, false)], onTiles: (fn) => listeners.push(fn) };
  const g = guessOver(live, field);
  const [t0, t2] = g.tiles();
  assert.deepEqual([...t0.abs.subarray(0, 4)], halved(BLUE), 'your stroke, at once');
  assert.deepEqual([...t0.abs.subarray(4, 8)], halved(RED), 'the stamped ink beside it');
  assert.notEqual(t0.hf[4], 0, 'the stamped heights too');
  assert.ok(
    t2.abs.every((v) => v === 0),
    'no ink where neither has any',
  );
  // your guess cleared (the live sheet reset: empty tiles): the stamped sheet shows, whole
  let got = null;
  g.onTiles((tiles) => (got = tiles));
  listeners[0]([tile(0, false)]);
  assert.deepEqual([...got[0].abs.subarray(0, 4)], halved(RED));
  // with nothing stamped yet, the guess is your ink alone
  assert.equal(guessOver(live, null).tiles()[0].abs[0], toHalf(2));
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

test('seals read from a paper: whom each is for, whether it took (as grown), broken; and who may mark it (law/paper.js)', () => {
  const owner = 'O'.repeat(43),
    bo = 'B'.repeat(43),
    cy = 'C'.repeat(43);
  const line = (n, act) => ({ n, at: n * 100, act: { by: owner, ...act } });
  const top = Math.round(P.CTX.table.top * 1000);
  const v = {
    paper: 'p1',
    ownerKey: owner,
    birth: { key: owner },
    where: { space: owner, at: [1000, 1000, top] },
    names: { [bo]: 'bo', [cy]: 'cy' },
    lines: [line(1, { act: 'press', press: { for: bo, x: 20000, y: 1500 } }), line(2, { act: 'press', press: { for: cy, x: 100, y: 100 } }), line(3, { act: 'break', break: { seal: 2 } })],
  };
  const seals = sealsOf(v, [false, true]);
  assert.deepEqual(
    seals.map((x) => [x.n, x.name, x.took, x.broken]),
    [
      [1, 'bo', false, false],
      [2, 'cy', true, true],
    ],
  );
  assert.deepEqual(seals[0].at, { x: 2000, y: 150 });
  assert.equal(mayMark(v, bo), true, 'his name pressed into it: however the impression came out');
  assert.equal(mayMark(v, cy), false, 'hers is broken');
  assert.equal(mayMark(v, owner), true);
  assert.equal(mayMark({ ...v, lines: [] }, cy), false);
  assert.equal(mayMark({ ...v, lines: [], where: { space: cy, at: [1000, 1000, top] } }, cy), true, 'on her table, she marks it');
  assert.equal(mayMark({ ...v, lines: [], where: { space: cy, at: [1000, 1000, 0] } }, cy), false, 'on her floor, not');
  assert.equal(mayMark({ ...v, where: { hand: owner } }, owner), false, 'in a hand: no one');
});

test('papers let go onto each other: the last on top, a paper’s thickness higher for each under it; apart, each on the table', async () => {
  const { stacked, restedAt } = await import('./papers.js');
  const sheet = (x) => ({ origin: [x, 0], size: [1000, 700], lift: 0 });
  const out = stacked([
    { id: 'c', rested: 3, sheet: sheet(500) },
    { id: 'a', rested: 1, sheet: sheet(0) },
    { id: 'b', rested: 2, sheet: sheet(0) },
    { id: 'far', rested: 4, sheet: sheet(5000) },
  ]);
  assert.deepEqual(
    out.map((p) => [p.id, p.sheet.lift / PAPER_PX]),
    [
      ['a', 0],
      ['b', 1],
      ['c', 2],
      ['far', 0],
    ],
  );
  const view = {
    born: 1000,
    lines: [
      { at: 5, act: { act: 'take' } },
      { at: 9, act: { act: 'put' } },
    ],
  };
  assert.equal(restedAt(view), 1009, 'where the last hand let it go');
  assert.equal(restedAt({ born: 1000, lines: [] }), 1000, 'where it was born');
});
