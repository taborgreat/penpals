// A tree grows (one-matter.md Phase 7): from a seed, under the sun, by the table's kind and the
// rules; its rings, knots and shape come out of that, nobody draws them.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTree, factsOf, cutTrunk, shapeOf } from '../tree.js';
import { dayOf, sunToward, WORLD } from '../sun.js';
import { sin, cos, exp, log } from '../dmath.js';

const Y = WORLD.year;
const DRY = new Set([30, 45, 60, 75]);
// water reaching its ground: 6 kg a m² every third day, none at all in a dry year
const rain = (years, dry = DRY) => {
  const w = [];
  for (let d = 0; d < (years + 1) * Y; d += 3) if (!dry.has(Math.floor(d / Y))) w.push({ day: d, kg: 6 });
  return w;
};
const grown = (years) => createTree({ day: 60 }).grow(Math.floor(years * Y) - 1, rain(years));

test('arithmetic every machine does alike: sin, cos, exp and log from + − × ÷', () => {
  for (const x of [-7.3, -1, -0.2, 0, 0.5, 1, 2.5, 9.9]) {
    assert.ok(Math.abs(sin(x) - Math.sin(x)) < 1e-12 && Math.abs(cos(x) - Math.cos(x)) < 1e-12, `sin/cos ${x}`);
    assert.ok(Math.abs(exp(x) / Math.exp(x) - 1) < 1e-13, `exp ${x}`);
  }
  for (const x of [1e-9, 0.3, 1, 2, 777, 1e12]) assert.ok(Math.abs(log(x) - Math.log(x)) < 1e-12, `log ${x}`);
  const src = fs.readFileSync(new URL('../tree.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../sun.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.(sin|cos|tan|exp|log|pow|atan|acos|asin|cbrt|hypot)\b|\*\*/.test(src.replace(/\/\/.*$/gm, '')), 'the law takes them from dmath alone');
});

test('the sun: days lengthen to the summer and shorten to the winter; the summer noon sun stands at 68°', () => {
  const deg = (s) => (Math.asin(s) * 180) / Math.PI;
  const summer = dayOf(172),
    winter = dayOf(355),
    spring = dayOf(79);
  assert.ok(Math.abs(deg(summer.noon) - 68) < 0.2, `summer noon ${deg(summer.noon)}`);
  assert.ok(summer.minutes > 15 * 60 && winter.minutes < 9 * 60, `${summer.minutes} / ${winter.minutes} minutes`);
  assert.ok(Math.abs(spring.minutes - 12 * 60) < 15, 'about 12 h at the equinox');
  assert.ok(summer.light > 4 * winter.light, "the winter sun gives a level face a quarter of the summer's");
  assert.ok(summer.warmth > spring.warmth && spring.warmth > winter.warmth);
  assert.equal(dayOf(100).lengthening, true);
  assert.equal(dayOf(200).lengthening, false);
  // at noon it stands due south (−north), straight up its height
  const v = sunToward(172, 12);
  assert.ok(Math.abs(v[0]) < 1e-9 && v[1] < 0 && Math.abs(v[2] - summer.noon) < 0.01);
});

test('a seed sleeps until its dirt holds water and the day is warm', () => {
  const dryT = createTree({ day: 0 }).grow(400, []);
  assert.equal(dryT.sprouted, null, 'no water: it sleeps');
  const cold = createTree({ day: 330 }).grow(360, [{ day: 330, kg: 200 }]);
  assert.equal(cold.sprouted, null, 'wet but winter: it sleeps');
  const wet = createTree({ day: 0 }).grow(200, rain(1));
  assert.ok(wet.sprouted !== null && dayOf(wet.sprouted).warmth >= 15, `sprouted on day ${wet.sprouted}`);
});

test('a hundred years: a ring a year, thin in the dry ones; knots where branches grew; the same tree everywhere', () => {
  const t0 = Date.now();
  const T = grown(100);
  const ms = Date.now() - t0;
  const F = factsOf(T);
  assert.equal(F.died, null, 'it lived');
  // the trunk cut low down: a ring for every year since it stood that tall
  const cut = cutTrunk(F, 1.5);
  const from = F.shells.find((s) => s.top >= 1.5e6).year;
  assert.equal(cut.rings.length, 100 - from, `${cut.rings.length} rings`);
  assert.deepEqual(
    cut.rings.map((r) => r.year),
    Array.from({ length: 100 - from }, (_, i) => from + i),
  );
  // each ring's late band is wood laid after the longest day
  assert.ok(cut.rings.every((r) => r.early > 0 && r.late > 0));
  // a dry year's ring is thinner than the years either side of it
  const w = new Map(cut.rings.map((r) => [r.year, r.width]));
  for (const y of DRY) assert.ok(w.get(y) < w.get(y - 1) && w.get(y) < w.get(y + 1), `year ${y}: ${w.get(y - 1)} ${w.get(y)} ${w.get(y + 1)}`);
  // a branch that died low on the trunk is a knot, buried by the rings after it
  const dead = F.branches.find((b) => b.parent === 0 && b.died !== null);
  assert.ok(dead, 'a low branch died');
  const at = cutTrunk(F, dead.at[2] / 1e6);
  const knot = at.knots.find((k) => k.year === dead.year);
  const bark = 5000 + at.rings.reduce((n, r) => n + r.width, 0);
  assert.ok(knot && knot.dead && knot.to > knot.from && knot.to < bark, `knot ${JSON.stringify(knot)} under bark at ${bark}`);
  // cheap: a hundred years in a moment; its facts are its shells and branch starts
  assert.equal(F.shells.length, 100);
  assert.ok(ms < 5000, `${ms} ms`);
  // the same seed, place and water: the same tree
  assert.equal(JSON.stringify(factsOf(grown(100))), JSON.stringify(F));
});

test('young and old trees differ in shape with no shape code: the leader dominates, then the crown spreads', () => {
  const T = createTree({ day: 60 });
  const water = rain(100);
  const young = shapeOf(T.grow(Math.floor(10 * Y) - 1, water));
  const old = shapeOf(T.grow(Math.floor(100 * Y) - 1, water));
  assert.ok(young.width / young.height < 0.4, `young: ${young.width.toFixed(1)} m wide, ${young.height.toFixed(1)} m tall`);
  assert.ok(old.width / old.height > 0.8, `old: ${old.width.toFixed(1)} m wide, ${old.height.toFixed(1)} m tall`);
  // grown in steps or at once, the same tree (unwatched, it replays in one step)
  const once = shapeOf(createTree({ day: 60 }).grow(Math.floor(100 * Y) - 1, water));
  assert.deepEqual(once, old);
});

test('autumn: the leaves fall under the tree and break down into dirt', () => {
  const T = grown(20);
  assert.ok(T.litter.size > 0 && T.dirt > 0);
  let lying = 0;
  for (const g of T.litter.values()) lying += g;
  assert.ok(T.dirt > lying, 'most of twenty years of leaves is dirt now');
});
