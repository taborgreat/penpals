// Load by the senses (cleanup-and-speed.md §5b): what the eye sees decides what
// a page asks for, at what detail, and what it lets go.
import test from 'node:test';
import assert from 'node:assert/strict';
import { camera3d, camera2d, zoomBy } from './camera.js';
import { sightOf, pxAt, wantOf, toAsk, holds, stale, cropCells, FAR, DROP_MS } from './sight.js';

const PAGE = [1000, 1400];
const W = 1280,
  H = 900; // device px
const piece = (key, x, y, w, h, cellPx = 0.5) => ({ key, rect: [x, y, x + w, y + h], cellPx, box: [10, 20, Math.round(w / cellPx), Math.round(h / cellPx)] });

test('sight: the view covers the page it looks at, finer where it is nearer', () => {
  const s = sightOf(camera3d(...PAGE), W, H);
  const [x0, y0, x1, y1] = s.rect;
  assert.ok(x0 < 500 && x1 > 500 && y0 < 700 && y1 > 700, 'the page centre is in sight');
  assert.ok(x1 - x0 < 20000 && y1 - y0 < 20000, 'and the paper reaches no further than it can');
  // nearer the eye, more pixels a page px
  const near = pxAt(s, [0, 1300, 10, 1310]);
  const far = pxAt(s, [0, 0, 10, 10]);
  assert.ok(near !== far && Math.max(near, far) > 0);
  // from straight above (2D) the scale is the same everywhere
  const flat = sightOf(camera2d(...PAGE), W, H);
  assert.equal(pxAt(flat, [0, 0, 1, 1]), pxAt(flat, [900, 1300, 901, 1301]));
});

test('sight: an item out of view is not asked for and is not drawn; nothing at all while the view is hidden', () => {
  const cam = zoomBy({ ...camera3d(...PAGE), el: 90, target: [200, 200] }, 0.1); // close over the top left
  const s = sightOf(cam, W, H);
  const inView = piece('a', 150, 150, 100, 40);
  const away = piece('b', 700, 1200, 200, 80);
  assert.ok(wantOf(s, inView));
  assert.equal(wantOf(s, away), null, 'out of view: nothing asked for');
  const seen = new Map();
  const ask = toAsk([inView, away], s, new Map(), seen, 1000);
  assert.deepEqual(
    ask.map((a) => a.p.key),
    ['a'],
  );
  assert.ok(!seen.has('b'), 'never seen, so never held: nothing of it is drawn');
  // the view scrolled out of the page: no sight, nothing asked for
  assert.deepEqual(toAsk([inView, away], null, new Map(), new Map(), 1000), []);
  // what is held as wanted is not asked for again
  const held = new Map([['a', { want: ask[0].want }]]);
  assert.deepEqual(toAsk([inView], s, held, new Map(), 2000), []);
});

test('sight: far or small is the flat look at a level of detail; near is the scene of the chunks in view', () => {
  // the whole page from far off: a small item is a few pixels
  const far = sightOf({ ...camera3d(...PAGE), dist: 60000 }, W, H, 200000);
  const tiny = wantOf(far, piece('t', 400, 600, 40, 10));
  assert.ok(tiny.look, 'far: the flat look');
  assert.ok(tiny.lod >= 1 && tiny.lod <= 3);
  // the usual view: a line of writing is its scene, every cell or a little coarser
  const s = sightOf(camera3d(...PAGE), W, H);
  const line = wantOf(s, piece('l', 300, 600, 400, 60));
  assert.ok(!line.look && line.lod <= 1);
  assert.equal(line.at, null, 'all of it in view: all of it');
  // close over one corner of a big sheet: only its chunks in view, every cell
  const close = sightOf(zoomBy({ ...camera3d(...PAGE), el: 90, target: [120, 120] }, 0.02), W, H);
  const big = piece('big', 0, 0, 900, 1300);
  const w = wantOf(close, big, { chunk: 128 });
  assert.equal(w.lod, 0, 'close: every cell');
  assert.ok(w.at, 'a window, not the whole sheet');
  const [ax, ay, aw, ah] = w.at;
  assert.ok(ax % 128 === 0 || ax === big.box[0], 'whole chunks');
  assert.ok(aw * ah < big.box[2] * big.box[3] * 0.25, `a small part: ${aw}×${ah} of ${big.box[2]}×${big.box[3]}`);
  // the cells under the eye are in it
  const cx = big.box[0] + 120 / big.cellPx,
    cy = big.box[1] + 120 / big.cellPx;
  assert.ok(cx >= ax && cx < ax + aw && cy >= ay && cy < ay + ah);
  assert.ok(FAR < 1);
});

test('sight: what is held covers a window inside it, at the same level; what was out of sight a while is let go', () => {
  assert.ok(holds({ lod: 0, at: null }, { lod: 0, at: [0, 0, 10, 10] }));
  assert.ok(holds({ lod: 0, at: [0, 0, 256, 256] }, { lod: 0, at: [128, 0, 128, 128] }));
  assert.ok(!holds({ lod: 0, at: [0, 0, 128, 128] }, { lod: 0, at: [128, 0, 128, 128] }));
  assert.ok(!holds({ lod: 1, at: null }, { lod: 0, at: null }), 'a finer level is asked for');
  assert.ok(!holds({ look: true, lod: 2 }, { lod: 2, at: null }), 'the look is not the scene');
  const seenAt = new Map([
    ['a', 0],
    ['b', 15000],
  ]);
  assert.deepEqual(stale(seenAt, DROP_MS + 1), ['a']);
  assert.deepEqual(stale(seenAt, 1000), []);
});

test('sight: the paper detail of a window is its cells', () => {
  const box = [10, 20, 4, 3];
  const data = Uint8Array.from({ length: 12 }, (_, i) => i);
  const { data: d, box: b } = cropCells(data, box, [11, 21, 10, 10]);
  assert.deepEqual(b, [11, 21, 3, 2]);
  assert.deepEqual([...d], [5, 6, 7, 9, 10, 11]);
});
