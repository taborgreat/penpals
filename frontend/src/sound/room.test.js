// The room's acoustics (world.md Phase 3): the tail, the first reflections and the window, from the
// room's size and what its faces are made of.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGeometry, ROOM } from '../scene/light/room.js';
import { BANDS } from './bands.js';
import { acoustics, reflections, through, roomIR, inside } from './room.js';
import { strokeSounds } from './pen.js';

const geom = roomGeometry(ROOM);
const k1 = BANDS.indexOf(1000);

test('the same pen stroke sounds drier in a small room than a large one', () => {
  const small = acoustics(roomGeometry({ ...ROOM, size: [2, 2.2, 2.2] }));
  const large = acoustics(roomGeometry({ ...ROOM, size: [6, 7, 3.2] }));
  const here = acoustics(geom);
  for (let b = 0; b < BANDS.length; b++) assert.ok(small.rt60[b] < here.rt60[b] && here.rt60[b] < large.rt60[b], `band ${BANDS[b]}`);
  assert.ok(here.rt60[k1] > 0.3 && here.rt60[k1] < 3, `plaster and boards: ${here.rt60[k1].toFixed(2)} s at 1 kHz`);
  assert.ok(here.rt60[9] < here.rt60[k1], 'the air drinks the highest band: its tail is shorter');
  assert.ok(small.delay < large.delay, 'the tail begins sooner in a small room');
  // an open window lets sound out: a shorter tail
  assert.ok(acoustics(geom, { open: true }).rt60[k1] < here.rt60[k1]);
});

test('the tail holds, band by band, the reverberant energy the room keeps (16π / R at a metre)', () => {
  const ac = acoustics(roomGeometry({ ...ROOM, size: [2, 2.2, 2.2] }));
  const rate = 16000;
  const [l, r] = roomIR(ac, rate, 3);
  const e = (x) => x.reduce((a, v) => a + v * v, 0);
  const want = ac.send.filter((_, b) => BANDS[b] < rate * 0.45).reduce((a, x) => a + x, 0);
  assert.ok(Math.abs(e(l) / want - 1) < 0.15, `${e(l).toFixed(2)} of ${want.toFixed(2)}`);
  assert.notDeepEqual([...l.slice(5000, 5100)], [...r.slice(5000, 5100)], 'two ears, two draws');
  assert.equal(l[Math.floor(ac.delay * rate) - 2], 0, 'nothing before the mean free path is crossed');
});

test('the first reflections: six images, each keeping what its face does not drink; none back from an open window', () => {
  const ac = acoustics(geom);
  const pen = [geom.size[0] / 2, geom.size[1] - 0.6, geom.table.top];
  const head = [geom.size[0] / 2, geom.size[1] - 1.1, 1.2];
  const shut = reflections(pen, head, ac);
  assert.equal(shut.length, 6);
  const floor = shut.find((r) => Math.abs(r.pos[2] + pen[2]) < 1e-9);
  assert.ok(floor, 'mirrored in the floor');
  assert.ok(shut.every((r) => r.keep.every((k) => k > 0 && k <= 1)));
  // a source in front of the window, heard from its middle: the far reflection meets the glass
  const atWindow = [geom.size[0] / 2, geom.size[1] - 0.5, (geom.window.z0 + geom.window.z1) / 2];
  const ear = [geom.size[0] / 2, geom.size[1] - 1, atWindow[2]];
  assert.equal(reflections(atWindow, ear, ac).length, 6);
  assert.equal(reflections(atWindow, ear, acoustics(geom, { open: true })).length, 5, 'out through the open window');
});

test('a source outside is muffled until the window opens', () => {
  const head = { pos: [geom.size[0] / 2, geom.size[1] / 2, 1.2], yaw: 0, pitch: 0 };
  const out = { t: 0, pos: [geom.size[0] / 2, geom.size[1] + 5, 1.5], bands: BANDS.map(() => 1), dur: 0.02, attack: 0.001, seed: 1, kind: 'test' };
  assert.ok(!inside(out.pos, geom) && inside(head.pos, geom));
  const shut = through(out, head, acoustics(geom));
  const open = through(out, head, acoustics(geom, { open: true }));
  assert.ok(shut.pos[1] === geom.size[1], 'heard from the window');
  assert.ok(open.bands[8] > 100 * shut.bands[8], 'the highs come in crisp only when it is open');
  assert.ok(open.bands[1] / shut.bands[1] < open.bands[8] / shut.bands[8], 'the glass drinks the highs most');
  assert.ok(shut.t > out.t, 'later by its way to the window');
  // and the pen inside is heard as it is
  const [e] = strokeSounds([{ x: 0, y: 0, t: 0, p: 0.5 }]);
  assert.equal(through({ ...e, pos: [1, 1, 1] }, head, acoustics(geom)).pos[0], 1);
});

test('the door, open, is a way out and in too: the room rings shorter, a sound beyond it heard through it, none back from it', () => {
  const shut = acoustics(geom);
  const open = acoustics(geom, { door: true });
  assert.ok(open.rt60.every((t, b) => t < shut.rt60[b]), 'its sound leaves by the open door');
  const head = { pos: [geom.size[0] / 2, 1, 1.2], yaw: 0, pitch: 0 };
  const out = { t: 0, pos: [(geom.door.x0 + geom.door.x1) / 2, -4, 1.2], bands: BANDS.map(() => 1), dur: 0.02, attack: 0.001, seed: 1, kind: 'test' };
  const heard = through(out, head, open);
  assert.equal(heard.pos[1], 0, 'heard from the doorway');
  assert.ok(heard.bands[8] > 100 * through(out, head, shut).bands[8], 'crisp only while it is open');
  // a source before the door, heard from inside: the near wall's reflection is the door's, gone when it is open
  const atDoor = [(geom.door.x0 + geom.door.x1) / 2, 0.5, 1];
  const ear = [atDoor[0], 1, 1];
  assert.equal(reflections(atDoor, ear, shut).length, 6);
  assert.equal(reflections(atDoor, ear, open).length, 5, 'out through the open door');
});
