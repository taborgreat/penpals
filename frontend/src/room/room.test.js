// Your room (rooms.md Phase 1): the room's surfaces are pages of the book in
// their own frames, grown from their owner's key; ink on a surface is drawn
// in that surface's own cells; a stroke on a wall costs what it costs on
// paper; the eye closes and opens; the room keeps its own clock.
import test from 'node:test';
import assert from 'node:assert/strict';
import { roomGeometry, hit, ROOM } from '../scene/light/room.js';
import { CELL_M } from '../scene/light/surface.js';
import { N } from '../scene/light/axis.js';
import { SURFACE_IDS, THING_SURFACE_IDS, ROOM_SURFACE, PEN_FACE, setPenPlace, surfaceFrame, toRoom, fromRoom, onSurface, surfaceOfHit } from '../scene/surfaces.js';
import { pieceCorners } from '../scene/marks.js';
import { roomMeshes, spectrumAt } from '../scene/roomDraw.js';
import { roomSeedsOf, lobbySeeds, SEED_NAMES } from './seeds.js';
import { worldClock, createLight } from '../scene/light.js';
import { createCapture, strokesToActs } from '../ink/capture.js';
import { lawOf } from 'penpals-law/laws';
import { keys as K, b64url } from 'penpals-law';
import { paper as P } from 'penpals-law';

const geom = roomGeometry(ROOM);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a, b, e = 1e-9) => a.every((v, i) => Math.abs(v - b[i]) < e);

test("each surface is matter of the house in its own frame (law/paper.js SURFACES): on its room surface, read the right way round, its size the law's", () => {
  assert.deepEqual([...SURFACE_IDS, ...THING_SURFACE_IDS].sort(), Object.keys(P.SURFACES).sort(), 'the law has every surface the room and its things have');
  for (const id of SURFACE_IDS) {
    const f = surfaceFrame(geom, id);
    assert.deepEqual(f.units, P.SURFACES[id].size, `${id}: the law's size`);
    // right × down faces the one looking at it: the page is not mirrored
    assert.ok(
      near(
        cross(f.right, f.down),
        f.normal.map((v) => -v),
      ),
      `${id}: not mirrored`,
    );
    // its corners lie on the room surface it belongs to
    const s = geom.surfaces.find((x) => x.id === ROOM_SURFACE[id]);
    for (const c of [
      [0, 0],
      [f.units[0], 0],
      [0, f.units[1]],
      [f.units[0], f.units[1]],
    ]) {
      const p = toRoom(f, c);
      const d = p.map((v, k) => v - s.origin[k]);
      const u = d[0] * s.u[0] + d[1] * s.u[1] + d[2] * s.u[2],
        v = d[0] * s.v[0] + d[1] * s.v[1] + d[2] * s.v[2];
      const off = d[0] * s.normal[0] + d[1] * s.normal[1] + d[2] * s.normal[2];
      assert.ok(u > -1e-3 && v > -1e-3 && u < s.size[0] + 1e-3 && v < s.size[1] + 1e-3 && Math.abs(off) < 1e-9, `${id} corner ${c}`);
    }
    // and a point there and back
    const q = fromRoom(f, toRoom(f, [1234.5, 678.25], 0.01));
    assert.ok(Math.abs(q.x - 1234.5) < 1e-6 && Math.abs(q.y - 678.25) < 1e-6 && Math.abs(q.off - 0.01) < 1e-12);
    assert.ok(onSurface(f, q) && !onSurface(f, { x: -1, y: 0 }));
  }
});

test("the pen's top face is a frame of its own, wherever the pen lies (rooms.md §3c)", () => {
  setPenPlace(null);
  assert.equal(surfaceFrame(geom, 'pen'), null, 'nowhere until it lies somewhere');
  const at = [1.2, 1.4, geom.table.top];
  setPenPlace(at);
  const f = surfaceFrame(geom, 'pen');
  assert.deepEqual(f.units, [Math.round((0.12 * 1400) / 0.2159), Math.round((0.009 * 1400) / 0.2159)], 'the size of its face (scene/surfaces.js PEN_FACE)');
  assert.ok(
    near(
      cross(f.right, f.down),
      f.normal.map((v) => -v),
    ),
    'not mirrored',
  );
  // its middle is over where it lies, its thickness up
  const mid = toRoom(f, [f.units[0] / 2, f.units[1] / 2]);
  assert.ok(near(mid, [at[0], at[1], at[2] + PEN_FACE.thick], 2e-3), mid.join());
  setPenPlace(null);
});

test('the pen pointed into the room finds the surface it meets', () => {
  const mid = [geom.size[0] / 2, geom.size[1] / 2 - 0.4, 1.6];
  for (const [dir, id] of [
    [[0, 1, 0.2], 'wall-far'],
    [[0, -1, 0], 'wall-near'],
    [[-1, 0, 0], 'wall-left'],
    [[1, 0, 0], 'wall-right'],
    [[0, 0, 1], 'ceiling'],
    [[0.1, -0.1, -1], 'floor'],
  ]) {
    const d = dir.map((v) => v / Math.hypot(...dir));
    const h = hit(geom, mid, d);
    assert.equal(surfaceOfHit(geom, h.surface), id, id);
  }
  const fromAbove = hit(geom, [geom.table.x0 + 0.05, geom.table.y0 + 0.05, 1.5], [0, 0, -1]);
  assert.equal(surfaceOfHit(geom, fromAbove.surface), 'table', 'the table top');
});

test('ink on a surface is drawn in its own cells and lit as the surface is (where it holds no ink, it is the surface)', () => {
  const meshes = roomMeshes(geom);
  const id = 'wall-left';
  const f = surfaceFrame(geom, id);
  const si = geom.surfaces.findIndex((s) => s.id === ROOM_SURFACE[id]);
  const s = geom.surfaces[si];
  // a mark set exactly at one of the wall's grid vertices: its corner has that vertex's cells
  const [gu, gv] = [s.grid.u[2], s.grid.v[1]];
  const at = fromRoom(
    f,
    [0, 1, 2].map((k) => s.origin[k] + s.u[k] * gu + s.v[k] * gv),
  );
  const mk = { origin: [at.x, at.y], cellUnits: 0.5, box: [0, 0, 512, 256], frame: f, si };
  const [c0] = pieceCorners(geom, mk, 0, 0, 256, 256);
  const nu = s.grid.u.length;
  const k = 1 * nu + 2;
  assert.ok(Math.abs(c0.cell[0] - meshes[si].cellPos[2 * k]) < 1e-3 && Math.abs(c0.cell[1] - meshes[si].cellPos[2 * k + 1]) < 1e-3, 'the same cells as the wall');
  assert.ok(Math.abs(c0.cell[0] - gu / CELL_M) < 1e-3);
  // its light there: the vertex's, the mean of the patches it touches
  const ambient = Float64Array.from({ length: geom.patches.length * N }, (_, i) => (i % N) + Math.floor(i / N) * 0.01);
  const E = spectrumAt(geom, meshes, si, gu, gv, ambient);
  const touch = meshes[si].touches[k];
  for (let b = 0; b < N; b++) assert.ok(Math.abs(E[b] - touch.reduce((t, p) => t + ambient[p * N + b], 0) / touch.length) < 1e-9);
});

test("a room is grown from its owner's key: the same for every visitor, no two alike; the lobby its own", () => {
  const a = b64url(K.publicKeyOf(K.skFromK(new Uint8Array(32).fill(7))));
  const b = b64url(K.publicKeyOf(K.skFromK(new Uint8Array(32).fill(8))));
  const ra = roomSeedsOf(a);
  assert.deepEqual(Object.keys(ra), SEED_NAMES);
  assert.deepEqual(roomSeedsOf(a), ra, 'everyone grows the same room');
  assert.notDeepEqual(roomSeedsOf(b).floor, ra.floor, 'no two rooms alike');
  assert.notDeepEqual(ra.floor, ra.ceiling, 'each surface its own');
  assert.ok(Object.values(ra).every(([s0, s1]) => Number.isInteger(s0) && Number.isInteger(s1) && s0 >= 0 && s1 >= 0 && s0 < 2 ** 32));
  assert.notDeepEqual(lobbySeeds().floor, ra.floor);
  assert.deepEqual(lobbySeeds(), lobbySeeds());
});

test('cost: a stroke on a large wall costs the same per tick as on paper (only wet ink computes)', () => {
  const law = lawOf(2);
  const ev = (timeStamp) => ({ timeStamp, pressure: 0.5, pointerType: 'mouse' });
  const pen = { nib: 0, size: 40, flex: 0, flow: 7, rgb: [43, 81, 163], angle: 0, spatter: 1 };
  const strokeAt = (x0, y0) => {
    const c = createCapture({ now: () => 0 });
    const pts = Array.from({ length: 50 }, (_, i) => ({ x: x0 + i * 2.1 + 0.03, y: y0 + 15 * Math.sin(i / 6) + 0.02, t: 1000 + i * 9 }));
    c.down(pts[0], ev(pts[0].t));
    pts.slice(1, -1).forEach((p) => c.move(p, ev(p.t)));
    c.up(pts.at(-1), ev(pts.at(-1).t));
    return strokesToActs(c.strokes, pen);
  };
  const perTick = (acts, family) => {
    const ticks = [];
    law.grow(law.decodeCanonical(acts), {
      paperKey: K.paperKeyOf(new Uint8Array(64).fill(3)),
      family,
      instrument: { tile() {}, wet() {}, deposit() {}, fiber() {}, strokeStart() {}, finish() {}, step: (k, wet) => ticks.push([...wet].reduce((t, tile) => t + tile.wet, 0)) },
    });
    return ticks;
  };
  const plaster = P.FAMILIES.plaster;
  const total = (t) => t.reduce((a, b) => a + b, 0);
  const peak = (t) => Math.max(...t);
  const within = (a, b, k) => Math.abs(a - b) <= k * Math.max(a, b);
  // the same stroke near a page's corner and far across a wall (the grain differs a
  // little from place to place): the same ticks, the same work in them
  const onPage = perTick(strokeAt(100, 100), plaster);
  for (const at of [
    [17000, 14000],
    [9000, 3000],
  ]) {
    const far = perTick(strokeAt(...at), plaster);
    assert.equal(far.length, onPage.length, 'as long');
    assert.ok(within(total(far), total(onPage), 0.02) && within(peak(far), peak(onPage), 0.05), `at ${at}: ${total(far)} vs ${total(onPage)} wet cell-ticks`);
  }
  // and on the wall's matter as on paper: the same work, wet cells a tick
  const paper = perTick(strokeAt(100, 100), { grain: 8, weight: 8, tooth: 0 });
  assert.ok(within(total(paper), total(onPage), 0.1), `plaster ${total(onPage)}, paper ${total(paper)}`);
});

test('the eye closes and opens: lids down, the view dark; opening onto the room, colour comes in', () => {
  const light = createLight({ settle: null });
  // no room light yet (no worker here): the eye at an indoor level, its weights as the lids say
  const shut = light.at({ now: 0, date: new Date(2026, 5, 21, 12), eye: { lids: 0, color: 0 } });
  assert.ok(
    shut.W.every((v) => v === 0),
    'closed: dark',
  );
  const grey = light.at({ now: 10, date: new Date(2026, 5, 21, 12), eye: { lids: 1, color: 0 } });
  const W = grey.W;
  for (let b = 0; b < N; b++) assert.ok(Math.abs(W[b] - W[N + b]) < 1e-9 && Math.abs(W[N + b] - W[2 * N + b]) < 1e-9, 'black and white: r = g = b');
});

test("one world, one sun, one clock (rooms.md §1b): every room is lit by Pacific time, whatever the viewer's", () => {
  const noon = worldClock(new Date('2026-06-21T19:00:00Z')),
    night = worldClock(new Date('2026-06-22T07:00:00Z'));
  assert.equal(noon.getHours(), 12);
  assert.equal(night.getHours(), 0);
  assert.equal(noon.getTime(), Date.parse('2026-06-21T19:00:00Z'), 'the same instant');
  const light = createLight({ settle: null });
  assert.ok(light.at({ now: 0, date: noon }).sun.el > 60 && light.at({ now: 0, date: night }).sun.el < 0, 'noon, then night, in every room at once');
});

test('a dip pen (rooms.md §3c): only a dip puts its well in the record; between dips its nib draws on what is left', async () => {
  const { lawPen } = await import('../ink/pens.js');
  const L3 = lawOf(3);
  const cap = createCapture({ pen: lawPen({ nib: 'pen', size: 10 }, '#203040', 9, undefined, { well: 2, n: 0 }) });
  const line = (y, t0) => {
    cap.down({ x: 10, y }, { timeStamp: t0, pressure: 0.5 }, 'mouse');
    for (let i = 1; i <= 20; i++) cap.move({ x: 10 + i * 4, y }, { timeStamp: t0 + i * 10, pressure: 0.5 });
    cap.up({ x: 90, y }, { timeStamp: t0 + 220, pressure: 0.5 });
  };
  line(10, 1000);
  line(30, 2000); // not dipped
  cap.setPen(lawPen({ nib: 'pen', size: 10 }, '#203040', 9, undefined, { well: 2, n: 1 })); // dipped again
  line(50, 3000);
  const rec = L3.decodeCanonical(strokesToActs(cap.strokes, null));
  const wells = rec.strokes.map((s) => s.pens.map((p) => p.well ?? null));
  assert.deepEqual(wells, [[2], [], [2]], 'the first stroke and the one after the dip carry it');
  assert.equal(rec.format, 3);
});
