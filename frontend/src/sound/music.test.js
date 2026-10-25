// The music of matter (world.md Phase 3c): matter's sounds placed on the pulse and tuned to the space's
// key; beings' acts as they happened.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BAR, grouping, place, rootOf, pitchOf, RATIOS } from './music.js';
import { strokeSounds } from './pen.js';
import { crackles } from './candle.js';
import { candleState, NEW_CANDLE, WICK_TRIM } from '../scene/light/candle.js';
import { BANDS } from './bands.js';

const T0 = 1.75e9; // the world's clock, s (a bar's start: 1.75e9 is a whole number of bars)
const rain = (k, rate, extra = {}) => ({
  kind: 'rain',
  matter: true,
  world: T0 + k / rate + 0.013 * ((k * 7) % 5),
  t: 100 + k / rate,
  rate,
  pos: [1, 4, 2],
  bands: BANDS.map((f) => (f > 1000 ? 1 : 0.2)),
  dur: 0.01,
  attack: 0.001,
  seed: k + 1,
  ...extra,
});
const onLeaf = (e) => {
  const { n } = grouping(e.rate);
  const x = ((e.world % BAR) / BAR) * n;
  return Math.abs(x - Math.round(x)) < 1e-6;
};

test("a being's pen is never moved or retuned", () => {
  for (const e of strokeSounds(
    [
      { x: 0, y: 0, t: 0, p: 0.5 },
      { x: 3, y: 0, t: 8, p: 0.5 },
    ],
    { t0: 7 },
  ))
    assert.deepEqual(place({ ...e, world: T0 + 0.37 }, 'ana'), { ...e, world: T0 + 0.37 });
});

test("rain and crackle land on their groupings, in the space's key; heavier rain a denser grouping", () => {
  assert.ok(grouping(40).n > grouping(5).n && grouping(5).n > grouping(0.3).n, 'heavier rain, a denser grouping');
  assert.deepEqual(
    grouping(3).tree.reduce((a, f) => a * f, 1),
    grouping(3).n,
    'the bar split into groups, each into its own count',
  );
  assert.ok(grouping(3).tree.every((f) => f <= 6));
  for (let k = 0; k < 30; k++) {
    const e = rain(k, 6);
    const p = place(e, 'ana');
    assert.ok(onLeaf(p), `on a leaf: ${p.world % BAR}`);
    assert.ok(Math.abs(p.world - e.world) <= BAR / grouping(6).n / 2 + 1e-9, 'moved at most half a leaf');
    assert.ok(Math.abs(p.t - p.world - (e.t - e.world)) < 1e-9, 'the ear hears it as moved');
  }
  const flame = { ...candleState(NEW_CANDLE, 0, { lit: true }), wick: WICK_TRIM, which: 0, pos: [1, 2.9, 0.9], lit: true };
  for (const c of crackles(flame, T0, T0 + 60)) assert.ok(onLeaf(place({ ...c, world: c.t }, 'ana')));
  // in the space's key: its pitch a ratio of the root
  const p = place(rain(3, 6), 'ana');
  const f = pitchOf(rain(3, 6)) * p.tune;
  const x = Math.log2(f / rootOf('ana'));
  const frac = x - Math.floor(x);
  assert.ok(
    [...RATIOS.map(([r]) => Math.log2(r)), 1].some((l) => Math.abs(frac - l) < 1e-9),
    'a ratio above the root',
  );
});

test('two spaces with different keys play the same rain in different keys; the same space, the same for everyone', () => {
  const a = place(rain(4, 10), 'ana'),
    b = place(rain(4, 10), 'bo');
  assert.notEqual(rootOf('ana'), rootOf('bo'));
  assert.notEqual(a.tune, b.tune);
  assert.equal(a.world, b.world, 'one pulse for everyone');
  assert.deepEqual(place(rain(4, 10), 'ana'), a);
  // a glass's ring is pulled to the key, not just its noise
  const glass = rain(1, 2, { ring: { f: 2200, q: 1000, share: 0.4 } });
  const g = place(glass, 'ana');
  const fx = Math.log2((2200 * g.tune) / rootOf('ana'));
  assert.ok([...RATIOS.map(([r]) => Math.log2(r)), 1].some((l) => Math.abs(fx - Math.floor(fx) - l) < 1e-9));
});

test("the ear places matter's sounds in its space, and plays them tuned; a pen as it is", async () => {
  const { createEar } = await import('./ear.js');
  const played = [];
  const ear = createEar({ out: { voice: (g, at, pos, h, o) => played.push({ at, tune: o?.tune }) } });
  ear.head({ pos: [1, 3, 2], yaw: 0, pitch: 0 });
  ear.space('ana');
  const r = rain(2, 6);
  ear.hear(r);
  const [pen] = strokeSounds([{ x: 0, y: 0, t: 0, p: 0.5 }], { t0: 100 });
  ear.hear({ ...pen, pos: [1, 3.5, 2] });
  ear.frame(99, 10);
  const placed = place(r, 'ana');
  assert.ok(played.some((p) => p.tune === placed.tune && Math.abs(p.at - placed.t) < 0.01));
  assert.ok(
    played.some((p) => p.tune === undefined),
    'the pen untuned',
  );
});
