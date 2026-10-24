// The camera in the room (light-waves §9): seated, flying, walking; speed and
// the near plane follow the nearest surface; gravity holds a walker down; the
// eye pulls only what it sees.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGeometry, hit } from './room.js';
import { seat, canWrite, look, turn, fly, walk, glide, clearance, supportAt, speedAt, nearAt, roomView, pageView, inView, footprint, EYE, GAP } from './roomCamera.js';
import { CELL_M } from './surface.js';

const geom = roomGeometry();
const [W, D, H] = geom.size;
const paperTop = geom.pageOrigin[2];

test('seated: the writing view looks at the page; writing only from the seat', () => {
  const s = seat(geom);
  const h = hit(geom, s.pos, look(s).forward);
  assert.equal(h.patch, geom.page, 'the seat looks at the page');
  assert.ok(canWrite(s));
  assert.equal(canWrite(fly(geom, s, { forward: 1 }, 0.1)), false, 'flying is for looking');
  assert.equal(canWrite(walk(geom, { ...s, mode: 'walk' }, {}, 0.1)), false);
});

test('fly: speed and the near plane follow the distance to the nearest surface, so everything scales with you', () => {
  const mid = [W / 2, D / 2 - 0.5, 1.6];
  const close = [geom.pageOrigin[0] + 0.1, geom.pageOrigin[1] - 0.1, paperTop + 1e-4]; // a tenth of a millimetre over the page
  const cMid = clearance(geom, mid), cClose = clearance(geom, close);
  assert.ok(Math.abs(cClose - 1e-4) < 1e-9);
  assert.ok(speedAt(cMid) > 1000 * speedAt(cClose));
  assert.ok(nearAt(cClose) < cClose && nearAt(cMid) < cMid, 'the near plane is always short of the nearest surface');
  // diving at the page: the eye slows as it comes, down past a cell's size, and never touches
  let p = { ...seat(geom), mode: 'fly', pos: [geom.pageOrigin[0] + 0.1, geom.pageOrigin[1] - 0.1, paperTop + 0.2], pitch: -89.9 };
  for (let k = 0; k < 400; k++) p = fly(geom, p, { forward: 1 }, 0.05);
  const gap = p.pos[2] - paperTop;
  assert.ok(gap > 0 && gap < CELL_M, `down among the cells: ${gap.toExponential(2)} m above the paper`);
});

test('fly: anywhere in the room, never through anything', () => {
  let p = { ...seat(geom), mode: 'fly' };
  let s = 0x2545f491;
  const rnd = () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let k = 0; k < 3000; k++) {
    if (k % 40 === 0) p = turn(p, rnd() * 120 - 60, rnd() * 60 - 30);
    p = fly(geom, p, { forward: 1, right: rnd() - 0.5, up: rnd() - 0.5 }, 0.1);
    assert.ok(clearance(geom, p.pos) >= GAP, `inside something at step ${k}`);
    assert.ok(p.pos.every((v, i) => v > 0 && v < geom.size[i]));
  }
  // to the window, to look out
  let q = { mode: 'fly', pos: [W / 2, D / 2, 1.5], yaw: 0, pitch: 0, size: 1, vz: 0 };
  for (let k = 0; k < 200; k++) q = fly(geom, q, { forward: 1 }, 0.1);
  assert.ok(D - q.pos[1] < 0.01, 'up to the glass');
  assert.equal(hit(geom, q.pos, look(q).forward).opening !== undefined, true, 'looking out of the window');
});

test('walk: gravity holds the being to what it stands on; off an edge it falls until it rests', () => {
  // on the floor
  let p = { mode: 'walk', pos: [0.6, 0.6, EYE + 0.3], yaw: 90, pitch: 0, size: 1, vz: 0 };
  for (let k = 0; k < 100; k++) p = walk(geom, p, {}, 0.02);
  assert.ok(Math.abs(p.pos[2] - EYE) < 1e-9, 'dropped to the floor');
  for (let k = 0; k < 50; k++) p = walk(geom, p, { forward: 1 }, 0.05);
  assert.ok(Math.abs(p.pos[2] - EYE) < 1e-9 && p.pos[0] > 1, 'walks along it');
  // a small being on the table walks off its near edge: down to the floor
  const size = 0.01;
  const tb = geom.table;
  let b = { mode: 'walk', pos: [tb.x0 + 0.1, tb.y0 + 0.05, tb.top + EYE * size], yaw: 180, pitch: 0, size, vz: 0 };
  b = walk(geom, b, {}, 0.01);
  assert.ok(Math.abs(b.pos[2] - EYE * size - tb.top) < 1e-9, 'standing on the table');
  for (let k = 0; k < 400 && b.pos[2] > EYE * size + 1e-9; k++) b = walk(geom, b, { forward: 1 }, 0.05);
  assert.ok(Math.abs(b.pos[2] - EYE * size) < 1e-9, 'fell, and rests on the floor');
  assert.equal(b.vz, 0);
});

test('walk: at bead size the page is the ground: down into a dent, stopped by a ridge', () => {
  const size = 1e-4; // an eye 0.16 mm up
  const x0 = geom.pageOrigin[0] + 0.05, y = geom.pageOrigin[1] - 0.05;
  const cell = CELL_M;
  // a dent 10 cells wide and 0.02 mm deep, then a ridge far taller than a step
  const ground = (x) => {
    const c = (x - x0) / cell;
    if (c > 20 && c < 30) return -2e-5;
    if (c > 60 && c < 64) return 2e-4;
    return 0;
  };
  let b = { mode: 'walk', pos: [x0, y, paperTop + EYE * size], yaw: 90, pitch: 0, size, vz: 0 };
  let lowest = Infinity;
  for (let k = 0; k < 3000; k++) {
    b = walk(geom, b, { forward: 1 }, 0.01, { ground });
    const feet = b.pos[2] - EYE * size;
    lowest = Math.min(lowest, feet - paperTop);
    assert.ok(feet >= paperTop + ground(b.pos[0]) - 1e-12, 'never under the surface');
  }
  assert.ok(Math.abs(lowest + 2e-5) < 1e-9, 'it went down into the dent');
  assert.ok((b.pos[0] - x0) / cell < 60, 'the ridge is a wall');
  assert.ok(supportAt(geom, x0 + 25 * cell, y, paperTop, ground) < paperTop);
});

test('return to seat glides back', () => {
  const s = seat(geom);
  const far = { mode: 'fly', pos: [0.4, 0.5, 2.2], yaw: -150, pitch: 30, size: 1, vz: 0 };
  assert.deepEqual(glide(far, s, 1).pos, s.pos);
  assert.equal(glide(far, s, 1).mode, 'seated');
  const half = glide(far, s, 0.5);
  half.pos.forEach((v, k) => assert.ok(v >= Math.min(far.pos[k], s.pos[k]) - 1e-12 && v <= Math.max(far.pos[k], s.pos[k]) + 1e-12));
  assert.equal(half.mode, 'fly');
});

test('the eye sets what is seen: what is behind it is not drawn; nearer is finer', () => {
  const s = seat(geom);
  const view = roomView(geom, s);
  const page = [(geom.pageRect.x0 + geom.pageRect.x1) / 2, (geom.pageRect.y0 + geom.pageRect.y1) / 2, paperTop];
  assert.ok(inView(view, page, 0.01, 1.5), 'the page');
  assert.equal(inView(view, [s.pos[0], s.pos[1] - 1, s.pos[2]], 0.1, 1.5), false, 'behind the head');
  assert.ok(footprint(view, 0.3, 900, CELL_M) > footprint(view, 0.01, 900, CELL_M) * 10);
  assert.ok(footprint(view, 0.001, 900, CELL_M) < 1, 'close enough: each cell crisp');
  // the same view in the page's frame (page px) for the renderer
  const pv = pageView(geom, s);
  assert.ok(Math.abs(pv.eye[2] - (s.pos[2] - paperTop) * geom.pxPerM) < 1e-6 && pv.forward[1] < 0 === (look(s).forward[1] > 0));
});
