// Drips come from the candle (matter-fixes.md §2): no one writes a drip. Tilting is
// the being's act on the room's chain; the candle's pool is heat-rule state from its
// lit time; the law regrows every drip from the chain, the same everywhere. A candle
// just lit drips nothing at any tilt; a long-lit one does, more the further tilted,
// as hot as its pool; what lands on a sheet is wax on its paper.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../wax.js';
import { lawOf } from '../laws.js';
import { testPaperKey } from '../tools/fixtures.js';
import { WAX_MELT } from '../v2/constants.js';

const NIGHT = Date.parse('2026-10-24T20:00:00Z'); // (UTC: the room's clock with no zone)
const DAY = Date.parse('2026-10-24T12:00:00Z');
const night = W.nightIn(null);
// the helpers' contract (frontend room/drops.js): the wick of a candle at `foot`, `h`
// tall, tilted `deg` toward +x; what is under a point: a sheet lying in slot 0 covers
// x 1..1.4, y 0.5..0.8 (room m; its units 1000 a metre), else the table
const wickOf = (foot, h, deg) => [foot[0] + Math.sin((deg * Math.PI) / 180) * h, foot[1], foot[2] + Math.cos((deg * Math.PI) / 180) * h];
function landing([x, y], lying) {
  const s = lying.find((o) => o.slot === 0);
  if (s && x >= 1 && x <= 1.4 && y >= 0.5 && y <= 0.8) return { on: 'sheet', sheet: s.sheet, q: { x: (x - 1) * 1000, y: (0.8 - y) * 1000 } };
  return { on: 'table', at: [x, y] };
}
// a room's chain: ana comes in at t0 (ms), picks up candle 0, tilts it over the sheet
function room(t0, tilts, { sheet = true, by = 'ana', pickAt = 0 } = {}) {
  let n = 0;
  const line = (ms, o) => ({ n: ++n, at: new Date(t0 + ms).toISOString(), ...o });
  const lines = [line(0, { by: 'ana', kind: 'enter' })];
  if (sheet) lines.push(line(0, { kind: 'lay', sheet: 'sA', slot: 0 }));
  lines.push(line(pickAt, { by: 'ana', kind: 'place', thing: 'candle-0', to: null }));
  for (const [ms, deg] of tilts) lines.push(line(ms, { by, kind: 'tilt', thing: 'candle-0', pos: [1.0, 0.65, 0.92], deg }));
  return lines;
}
const regrow = (lines, t0, untilMs) => W.dripsOf(lines, { night, wickOf, landing, until: t0 + untilMs });
const sum = (ds) => ds.reduce((a, d) => a + d.amt, 0);

test('a candle just lit drips nothing at any tilt: nothing falls while its pool has nothing liquid', () => {
  // how long a lit candle takes to melt its first wax (the heat rule)
  const p = W.newPool();
  let melt = 0;
  while (W.poolNow(p).liquid === 0) {
    W.stepPool(p, true, 0);
    melt += W.STEP_MS;
  }
  for (let deg = 0; deg <= 90; deg += 10) assert.deepEqual(regrow(room(NIGHT, [[0, deg]]), NIGHT, melt - W.STEP_MS), [], `at ${deg}°`);
  assert.ok(regrow(room(NIGHT, [[0, 90]]), NIGHT, melt + 20 * W.STEP_MS).length > 0, 'and once wax has melted, tipped over, it falls');
  // by day the candles do not burn: held tipped over for minutes, nothing
  assert.deepEqual(regrow(room(DAY, [[0, 90]]), DAY, 5 * 60000), []);
});

test('a long-lit candle drips, more the further it is tilted, as hot as its pool; upright, nothing', () => {
  const lit = 10 * 60000; // ten minutes lit before it is picked up
  const tilted = (deg) => regrow(room(NIGHT, [[lit + 100, deg]], { pickAt: lit }), NIGHT, lit + 10000);
  assert.deepEqual(tilted(0), [], 'upright');
  assert.deepEqual(tilted(W.LIP_DEG), [], 'at the lip');
  const a = tilted(30),
    b = tilted(60);
  assert.ok(a.length > 0 && sum(b) > sum(a), `tilted further, more: ${sum(a)} at 30°, ${sum(b)} at 60°`);
  // a drip's heat is the pool's, above the wax's melting heat
  const p = W.newPool();
  for (let s = 0; s < lit / W.STEP_MS; s++) W.stepPool(p, true, 0);
  const fell = W.stepPool(p, true, 60);
  assert.ok(fell.length > 0);
  for (const d of fell) assert.equal(d.heat, W.poolNow(p).level);
  assert.ok(fell[0].heat >= WAX_MELT);
  for (const d of a) assert.ok(d.heat >= WAX_MELT && d.heat <= 255);
});

test('replaying the tilt acts alone, with no drip acts, gives the same drips everywhere and whenever: on the sheet under the wick, then the table', () => {
  const lit = 5 * 60000;
  const lines = room(NIGHT, [
    [lit + 100, 40],
    [lit + 3000, 70],
    [lit + 6000, 0],
  ]);
  lines.push({ n: lines.length + 1, at: new Date(NIGHT + lit + 2000).toISOString(), kind: 'lay', sheet: 'sA', slot: null }); // the sheet taken off the table
  lines.sort((x, y) => Date.parse(x.at) - Date.parse(y.at) || x.n - y.n);
  assert.ok(lines.every((l) => l.kind !== 'drip'));
  const once = regrow(lines, NIGHT, lit + 8000);
  assert.ok(once.length > 0);
  assert.deepEqual(regrow(JSON.parse(JSON.stringify(lines)), NIGHT, lit + 8000), once, 'the same chain, as it arrives over the wire');
  assert.deepEqual(
    regrow(lines, NIGHT, lit + 2500),
    once.filter((d) => d.t <= NIGHT + lit + 2500),
    'regrown sooner: the same drips so far',
  );
  // under the wick: the sheet while it lay there, then the table; nothing once upright again
  const onSheet = once.filter((d) => d.on.on === 'sheet');
  assert.ok(onSheet.length > 0 && onSheet.every((d) => d.t < NIGHT + lit + 2000));
  assert.ok(once.some((d) => d.on.on === 'table' && d.t >= NIGHT + lit + 2000));
  assert.ok(once.every((d) => d.t < NIGHT + lit + 6000 + W.STEP_MS));
  // only the one holding a candle tilts it
  assert.deepEqual(regrow(room(NIGHT, [[lit + 100, 60]], { by: 'bo' }), NIGHT, lit + 5000), []);
});

test('a drip that landed on a sheet is wax on its paper, at its moment', () => {
  const lit = 5 * 60000;
  const drips = regrow(room(NIGHT, [[lit + 100, 60]]), NIGHT, lit + 3000);
  const marks = W.dripsOn(drips, 'sA', NIGHT + lit).map((d) => ({ kind: 'drip', ...d }));
  assert.ok(marks.length > 0 && marks.every((m) => m.t >= 0));
  const L = lawOf(3);
  const res = L.grow(L.decodeCanonical(L.encodeActs({ orgX: 0, orgY: 0, strokes: [], marks })), { paperKey: testPaperKey('wax'), family: { grain: 8, weight: 8, tooth: 0 } });
  assert.ok(L.settledCells(res.tiles).filter((c) => c[15] > 0).length > 100, 'wax on the paper');
  assert.deepEqual(W.dripsOn(drips, 'sB', NIGHT + lit), [], 'and none on a sheet it did not fall on');
});

test('a tilt act: a candle, in the room, a whole degree; sent only past a step, a turn or the lip', () => {
  const act = W.quantizeTilt({ thing: 'candle-1', pos: [1.23456, 0.5, 0.9], deg: 33.4 });
  assert.deepEqual(act, { thing: 'candle-1', pos: [1.235, 0.5, 0.9], deg: 33 });
  assert.ok(W.checkTilt(act));
  assert.ok(!W.checkTilt({ ...act, thing: 'pen' }) && !W.checkTilt({ ...act, deg: 91 }) && !W.checkTilt({ ...act, pos: [9, 0, 0] }));
  const last = { pos: [1, 0.5, 0.9], deg: 10 };
  assert.ok(!W.isTiltAct(last, 0, { pos: [1, 0.5, 0.9], deg: 12 }, 1000), 'a small turn');
  assert.ok(W.isTiltAct(last, 0, { pos: [1, 0.5, 0.9], deg: 15 }, 1000), 'a turn');
  assert.ok(W.isTiltAct({ ...last, deg: 19 }, 0, { pos: [1, 0.5, 0.9], deg: 21 }, 1000), 'across the lip');
  assert.ok(!W.isTiltAct(last, 0, { pos: [1, 0.5, 0.9], deg: 40 }, 100), 'too soon');
});
