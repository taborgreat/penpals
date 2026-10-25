// The room's shape (light-waves §4 and its tests, "Room build"): the same
// input bakes byte-identical geometry and form factors; each patch's form
// factors sum to at most 1; the page is one patch; the page frame and the
// room's agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM, PX_PER_M, roomGeometry, formFactors, encodeRoom, decodeRoom, splitFormFactors, hit, pageToRoom, roomToPage, pageDirToRoom, PAPER_PX } from './room.js';

const build = () => {
  const geom = roomGeometry(ROOM);
  return { geom, ...encodeRoom(geom, formFactors(geom)) };
};
const a = build();
const geom = a.geom;
const n = geom.patches.length, m = geom.openings.length;
const ff = new Float32Array(n * (n + m));
{
  const dv = new DataView(a.bin.buffer, a.bin.byteOffset);
  for (let k = 0; k < ff.length; k++) ff[k] = dv.getFloat32(16 + 4 * k, true);
}

test('room build: the same input gives byte-identical geometry and form factors', () => {
  const b = build();
  assert.equal(b.json, a.json);
  assert.equal(b.bin.length, a.bin.length);
  assert.ok(b.bin.every((v, i) => v === a.bin[i]));
});

test('room build: each patch\'s form factors sum to at most 1 (and, the room being closed, every ray meets something)', () => {
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < n + m; j++) {
      assert.ok(ff[i * (n + m) + j] >= 0);
      s += ff[i * (n + m) + j];
    }
    assert.ok(s <= 1, `patch ${i} sums to ${s}`);
    assert.ok(s > 0.999, `patch ${i} loses rays: ${s}`);
    assert.equal(ff[i * (n + m) + i], 0, 'a flat patch never sees itself');
  }
});

test('room build: what i sees of j and j of i agree by area (reciprocity), within the bake\'s noise', () => {
  let diff = 0, all = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = geom.patches[i].area * ff[i * (n + m) + j], y = geom.patches[j].area * ff[j * (n + m) + i];
      diff += Math.abs(x - y);
      all += x;
    }
  }
  assert.ok(diff / all < 0.05, `reciprocity off by ${diff / all}`);
});

test('the room is a few hundred patches; the page is exactly one; the window is 3 × 3 openings, the door 1 × 2', () => {
  assert.ok(n >= 150 && n <= 500, `${n} patches`);
  assert.equal(m, 11);
  assert.equal(geom.openings.filter((o) => o.kind === 'window').length, 9);
  assert.equal(geom.openings.filter((o) => o.kind === 'door').length, 2);
  const page = geom.patches.filter((p) => p.kind === 'page');
  assert.equal(page.length, 1);
  assert.equal(geom.patches[geom.page].kind, 'page');
  assert.equal(geom.patches[geom.page].matter, 'paper');
  assert.ok(Math.abs(geom.patches[geom.page].area - ROOM.page.size[0] * ROOM.page.size[1]) < 1e-12);
  assert.ok(geom.openings.every((o) => o.matter === (o.kind === 'door' ? 'wood' : 'glass')));
  // the patches cover each surface exactly (holes included)
  for (const [k, s] of geom.surfaces.entries()) {
    const covered = [...geom.patches, ...geom.openings].filter((p) => p.surface === k).reduce((t, p) => t + p.area, 0);
    assert.ok(Math.abs(covered - s.size[0] * s.size[1]) < 1e-9, s.id);
  }
});

test('the baked files decode back to the same room and form factors', () => {
  const room = decodeRoom(a.json, a.bin);
  assert.equal(room.patches.length, n);
  assert.equal(room.F.length, n * n);
  assert.equal(room.W.length, n * m);
  const { F, W } = splitFormFactors(ff, n, m);
  assert.deepEqual(room.F, F);
  assert.deepEqual(room.W, W);
  assert.throws(() => decodeRoom(a.json, a.bin.slice(0, 100)));
});

test('the page frame lies on the table: its corners are the page patch\'s, its directions flip y', () => {
  const pw = 1400, ph = (1400 * ROOM.page.size[1]) / ROOM.page.size[0];
  const r = geom.pageRect;
  const tl = pageToRoom([0, 0, 0]), br = pageToRoom([pw, ph, 0]);
  assert.ok(Math.abs(tl[0] - r.x0) < 1e-9 && Math.abs(tl[1] - r.y1) < 1e-9 && Math.abs(tl[2] - (geom.table.top + PAPER_PX / PX_PER_M)) < 1e-12, 'z = 0 is the top of the paper');
  assert.ok(Math.abs(pageToRoom([0, 0, -PAPER_PX])[2] - geom.table.top) < 1e-12, 'the table lies a paper thickness below (engine.js SLAB_PX)');
  assert.ok(Math.abs(br[0] - r.x1) < 1e-9 && Math.abs(br[1] - r.y0) < 1e-9);
  const p = [123.4, 567.8, 9.1];
  roomToPage(pageToRoom(p)).forEach((v, i) => assert.ok(Math.abs(v - p[i]) < 1e-9));
  assert.ok(Math.abs(PX_PER_M * ROOM.page.size[0] - 1400) < 1e-9);
  assert.deepEqual(pageDirToRoom([0.1, -0.3, 0.9]), [0.1, 0.3, 0.9]);
  // the candles stand on the table, one each side of the page
  const [left, right] = geom.candles;
  for (const c of geom.candles) {
    assert.ok(c[0] > geom.table.x0 && c[0] < geom.table.x1 && c[1] > geom.table.y0 && c[1] < geom.table.y1);
    assert.equal(c[2], geom.table.top);
  }
  assert.ok(left[0] < r.x0 && right[0] > r.x1);
});

test('rays: out through the window, down to the floor, down onto the page', () => {
  const [W, D] = geom.size;
  const out = hit(geom, [W / 2, 1, 1.5], [0, 1, 0]);
  assert.ok(out && out.opening !== undefined && Math.abs(out.t - (D - 1)) < 1e-9);
  const down = hit(geom, [0.3, 0.3, 1], [0, 0, -1]);
  assert.equal(geom.patches[down.patch].kind, 'floor');
  const onPage = hit(geom, [W / 2, (geom.pageRect.y0 + geom.pageRect.y1) / 2, 1.2], [0, 0, -1]);
  assert.equal(onPage.patch, geom.page);
  const under = hit(geom, [W / 2, (geom.table.y0 + geom.table.y1) / 2, 0.3], [0, 0, 1]);
  assert.equal(geom.surfaces[under.surface].id, 'table-bottom');
  assert.equal(hit(geom, [W / 2, 1, 1.5], [0, 1, 0], 0.5), null, 'nothing within maxT');
});
