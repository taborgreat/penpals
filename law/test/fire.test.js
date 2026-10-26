// The house fire in the world (matter.md; law/fire.js): a lit candle lying where it fell is the heat rule's; what it
// burns away of a paper is on that paper's record, as its drips are, grown by everyone the same.
import test from 'node:test';
import assert from 'node:assert/strict';
import { kindle, burntOn, DT } from '../fire.js';
import * as Cn from '../candle.js';
import { MATTER } from '../matter.js';
import { TORN } from '../v2/constants.js';
import { lawOf } from '../laws.js';
import { keys as K } from '../index.js';
import { compose } from '../paper.js';

const U = 1400 / 0.2159;
const top = 0.74;
const ctx = { top, under: 'wood', within: [0.824, 2.583, 2.224, 3.333], holder: { radius: 0.045, height: 0.015 }, units: U };
const page = { paper: 'p', at: [1524, 2823, 740], size: [1000, 1400] };
function lit() {
  const cd = Cn.newCandle();
  for (let s = 0; s < 1800; s++) Cn.stepCandle(cd, { lit: true });
  return cd;
}

test('a lit candle lying toward the page: it burns on the table, and the paper catches as the heat rule has it', { timeout: 600000 }, () => {
  const fire = kindle({ at: [1.33, 2.86], way: [1, 0], cd: lit(), lying: [page], ctx });
  const made = fire.heat.total();
  fire.step(Math.round(1 / DT));
  assert.ok(fire.burning().length > 0, 'its flame alight on the table');
  while (!fire.done && fire.t < 120) fire.step(Math.round(1 / DT));
  const now = fire.heat.total();
  assert.ok(fire.done, `over at ${fire.t.toFixed(0)} s: nothing in it can catch again`);
  const burnt = fire.burnt('p');
  assert.ok(burnt.length > 0, `the paper caught: ${burnt.length} cm² burnt away`);
  assert.ok(
    burnt.every((b, k) => k === 0 || b.t >= burnt[k - 1].t),
    'each when it went',
  );
  // nothing made or lost: what was there is there, gone up as smoke, or risen away
  assert.ok(Math.abs(now.matter + now.smoke + fire.heat.vented.smoke - made.matter) <= made.matter * 1e-9);
  // the same kindling, the same fire (everyone grows it)
  const again = kindle({ at: [1.33, 2.86], way: [1, 0], cd: lit(), lying: [page], ctx });
  while (!again.done && again.t < 120) again.step(Math.round(1 / DT));
  assert.deepEqual(again.burnt('p'), burnt);
  // the paper's own marks: on its clock, in tenths
  const marks = burntOn(burnt, 10000, 4000);
  assert.equal(marks[0].t, Math.round(10000 + burnt[0].t * 1000 - 4000));
  assert.equal(marks[0].w, burnt[0].w * 10);
});

test('a paper grown with its burns: those cells gone, all they held with them, its ash lying where they were', () => {
  const L = lawOf(5);
  const lines = [];
  const rec = compose(lines, [], [{ t: 1000, x: 2000, y: 2000, w: 650, h: 650 }]);
  const res = L.grow(L.decodeCanonical(L.encodeActs(rec)), { paperKey: K.paperKeyOf(new Uint8Array(64).fill(3)), family: { grain: 8, weight: 8, tooth: 0 } });
  const cells = L.settledCells(res.tiles);
  const holes = cells.filter((c) => c[11] & TORN);
  assert.ok(holes.length > 100, `${holes.length} cells burnt away`);
  assert.ok(
    holes.every((c) => c[19] > 0),
    'each with its ash on it',
  );
  assert.ok(MATTER.paper.heat.leaves > 0);
  // its box holds them (law 5: what is gone shows), so they are drawn; law 4's held only its ink
  const [, , w, h] = L.boxOf(cells);
  assert.ok(w * h >= holes.length, 'the holes inside its box');
  assert.deepEqual(lawOf(4).boxOf(cells), [0, 0, 0, 0]);
});

test('the wax law gives a lit candle that comes to lie to the fire: a kindling, and it burns there no more', async () => {
  const { createRoomWax } = await import('../wax.js');
  const start = { 'candle-0': [1.34, 2.9, top], 'candle-1': [1.7, 2.9, top] };
  const shape = { r: 0.045, h: 0.015 + Cn.CANDLE.length, matter: 'metal' };
  const bodies = { room: { table: { x0: 0.824, x1: 2.224, y0: 2.583, y1: 3.333, top, matter: 'wood' }, floor: 'wood' }, shapes: { 'candle-0': shape, 'candle-1': shape }, start };
  const wax = createRoomWax({ landing: () => ({ on: 'table', at: [0, 0] }), bodies });
  const t0 = Date.UTC(2026, 9, 26, 20);
  let k = 0;
  const line = (a) => ({ at: new Date(t0 + ++k * 1000).toISOString(), act: { kind: 'room', by: 'ash', ...a } });
  const mm = (p) => p.map((v) => Math.round(v * 1000));
  const lines = [
    { at: new Date(t0).toISOString(), kind: 'enter', by: 'ash' },
    line({ act: 'light', thing: 'candle-0' }),
    line({ act: 'place', thing: 'candle-1', to: null }),
    ...[
      [1.7, 3.05],
      [1.2, 3.05],
      [1.2, 2.9],
      [1.39, 2.9],
    ].map(([x, y]) => line({ act: 'tilt', thing: 'candle-1', pos: mm([x, y, top + 0.01]), deg: 0 })),
  ];
  wax.advance(lines, t0 + 60000);
  const fires = wax.fires();
  assert.equal(fires.length, 1, 'one kindling');
  assert.equal(fires[0].which, 0);
  assert.equal(wax.candle(0).lit, false, 'its flame is the fire’s now');
});
