// Life (outside.md Phase 8): a bird that stops flapping falls; a gall forms only where a gall bug laid;
// out of range their numbers replay the same on return.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../life.js';
import { near, groundAt, treeNow, EPOCH } from '../outside.js';
import { leafyOn } from '../tree.js';
import { dayOf } from '../sun.js';
import { BEINGS, MATTER } from '../matter.js';

const today = Math.floor(Date.UTC(2026, 9, 25) / 86400000) + 719528;
const trees = near(0, -30, 40).trees;
const lifeOf = (t, d = today) => L.lifeOf(t, d);

test('a bird holds itself up flapping; it stops, and falls until it rests on the ground', () => {
  const body = L.bodyOf('bird');
  assert.ok(body.lift > body.weight, 'its wings can hold it up');
  const ground = () => 0;
  const s = { p: [0, 0, 6], v: [0, 0, 0] };
  for (let n = 0; n < 2 / body.beat; n++) L.flyStep(body, s, body.beat, { flapping: true, ground });
  assert.ok(Math.abs(s.p[2] - 6) < 0.05, `flapping, it holds where it is: ${s.p[2].toFixed(3)} m`);
  const heights = [];
  for (let n = 0; n < 1000 && !s.rest; n++) heights.push(L.flyStep(body, s, body.beat, { flapping: false, ground }).p[2]);
  assert.ok(s.rest && s.p[2] === 0, 'still, it falls and rests on the ground');
  assert.ok(
    heights.every((h, i) => i === 0 || h <= heights[i - 1]),
    'all the way down',
  );
  // a bug's wings too: it holds, and falls if they stop
  const bug = L.bodyOf('gallbug');
  const b = { p: [0, 0, 2], v: [0, 0, 0] };
  for (let n = 0; n < 1 / bug.beat; n++) L.flyStep(bug, b, bug.beat, { flapping: true, ground });
  assert.ok(Math.abs(b.p[2] - 2) < 0.01);
  for (let n = 0; n < 1e5 && !b.rest; n++) L.flyStep(bug, b, bug.beat, { flapping: false, ground });
  assert.ok(b.rest, 'the bug falls too');
  // a flight lands where it was going, by the law's own speed
  const f = L.flight(body, [0, 0, groundAt(0, 0) + 5], [10, 0, groundAt(10, 0) + 5]);
  assert.ok(Math.hypot(...f.at.at(-1).map((c, k) => c - [10, 0, groundAt(10, 0) + 5][k])) < 1e-9);
  assert.ok(f.took > 10 / body.cruise && f.took < 4 * (10 / body.cruise), `ten metres in ${f.took.toFixed(1)} s at a cruise of ${body.cruise.toFixed(1)} m/s`);
});

test('a dead bird falls from its perch and lies on the ground under it until it rots', () => {
  // a bird that died out there this year, on the day it died
  let t = null,
    dead = null;
  for (const x of trees.filter((y) => lifeOf(y, EPOCH).birds))
    for (let d = EPOCH; d <= today && !dead; d++) {
      dead = L.lifeOf(x, d + 1).dead.find((z) => z.kind === 'bird' && z.day === d) ?? null;
      t = x;
    }
  assert.ok(dead, 'a bird has died out there this year');
  const ms = (dead.day - 719528) * 86400000;
  const falling = (dt) => L.beingsAt(t, lifeOf(t, dead.day + 1), ms + dt * 1000).find((b) => b.dead && b.kind === 'bird' && b.id.endsWith(dead.id));
  const lying = (dt) => L.lyingAt(t, lifeOf(t, dead.day + 1), ms + dt * 1000).find((b) => b.kind === 'bird' && b.id.endsWith(dead.id));
  const g = groundAt(dead.from[0], dead.from[1]);
  assert.ok(falling(0.05).at[2] > g + 0.1 && !lying(0.05), 'it falls from where it was');
  assert.ok(!falling(1800) && Math.abs(lying(1800).at[2] - g) < 1e-9, 'and rests on the ground under it');
  assert.ok(dead.gone > dead.day && dead.gone - dead.day < 40 * MATTER.skin.rots, 'until it rots');
});

test('a gall forms only where a gall bug laid: in its oak, on a leafy tip, warm enough to fly', () => {
  const none = trees.filter((t) => !lifeOf(t, EPOCH).galls.size);
  assert.ok(none.length > 0);
  for (const t of none) assert.equal(lifeOf(t).galls.size, 0, `${t.id}: no gall bugs, no galls`);
  // where there are, each gall laid since the start was laid on a day the oak had grown bugs, its leaves out
  const t = trees.find((x) => lifeOf(x).galls.size > 10);
  const laid = [...lifeOf(t).galls.values()].filter((g) => g.laid >= EPOCH);
  assert.ok(laid.length > 0);
  const days = [...new Set(laid.map((g) => g.laid))].sort((a, b) => a - b);
  for (const d of days) {
    assert.ok(leafyOn(t.kind, d) && dayOf(d).warmth >= BEINGS.gallbug.above, `day ${d}: leaves out, warm enough`);
    assert.ok(
      [...lifeOf(t, d + 1).bugs.values()].some((b) => b.born <= d),
      `day ${d}: grown gall bugs in the oak`,
    );
  }
  // one egg a tip: no two grubs in one tip at once
  const grubs = [...lifeOf(t).galls.values()].filter((g) => !g.empty).map((g) => g.tip);
  assert.equal(new Set(grubs).size, grubs.length);
  // every gall hangs on a tip of its own oak
  const tips = new Set(treeNow(t, today).tips.map((x) => x.id));
  for (const g of lifeOf(t).galls.values()) assert.ok(tips.has(g.tip) || g.laid < today, 'its tip');
});

test('out of range the numbers replay the same on return, watched or not', () => {
  const t = trees.find((x) => lifeOf(x).hive && lifeOf(x).galls.size) ?? trees.find((x) => lifeOf(x).hive);
  const numbers = (life) => JSON.stringify([[...life.galls], [...life.bugs], life.hive, life.birds, life.feathers, life.dead]);
  // watched: a day at a time from the start
  L.lifeOf(t, EPOCH);
  for (let d = EPOCH; d <= today; d += 1) L.lifeOf(t, d);
  const watched = numbers(L.lifeOf(t, today));
  // gone and come back: replayed in one go
  L.lifeOf(t, EPOCH);
  const returned = numbers(L.lifeOf(t, today));
  assert.equal(returned, watched);
  // and the near ones stand where they did
  const ms = Date.UTC(2026, 9, 25, 19, 30);
  assert.deepEqual(
    L.beingsAt(t, L.lifeOf(t, today), ms).map((b) => b.at),
    L.beingsAt(t, L.lifeOf(t, today), ms).map((b) => b.at),
  );
  const h = L.lifeOf(t, today).hive;
  assert.ok(h.wax > 0 && h.bugs.length > 0, `its hive lives: ${h.bugs.reduce((s, c) => s + c.n, 0)} bugs, ${h.wax.toFixed(0)} g of comb`);
});

test('the numbers follow food and warmth: a hive grows its comb in the warm, and keeps its store through the cold', () => {
  const t = trees.find((x) => lifeOf(x).hive);
  const start = L.lifeOf(t, EPOCH).hive.wax;
  const summer = L.lifeOf(t, Math.floor(Date.UTC(2026, 6, 1) / 86400000) + 719528).hive;
  assert.ok(summer.wax > start, `comb built: ${start} g → ${summer.wax.toFixed(0)} g`);
  assert.ok(summer.wax <= BEINGS.hivebug.nest.grams, 'no more than it builds');
  // a bird in the cold burns more than in the warm (its coat lets its warmth out)
  assert.ok(L.burnOf('bird', 5) > L.burnOf('bird', 25));
  // a bug, as warm as the air, burns less in the cold
  assert.ok(L.burnOf('hivebug', 5) < L.burnOf('hivebug', 25));
});

test('a bird shelters from rain: through hours of rain harder than it shelters from, none of them flies; on a fine day they do', async () => {
  const { weatherAt } = await import('../weather.js');
  const { SEED } = await import('../outside.js');
  const { sunAt } = await import('../sun.js');
  const t = trees.find((x) => lifeOf(x).birds?.adults.length);
  assert.ok(t, 'a tree with birds');
  const H = 3600000;
  const flyingAt = (ms) => L.beingsAt(t, L.lifeOf(t, Math.floor(ms / 86400000) + 719528), ms).filter((b) => b.kind === 'bird' && b.flying).length;
  // the third hour of a rainy spell by day, and a dry warm day's hours
  let wet = null;
  for (let ms = Date.UTC(2026, 3, 1); ms < Date.UTC(2026, 8, 1) && wet === null; ms += H)
    if ([0, 1, 2].every((h) => weatherAt(SEED, ms + h * H).rain > BEINGS.bird.song.shelter && sunAt(ms + h * H)[2] > 0.3)) wet = ms + 2 * H;
  assert.ok(wet !== null, 'some rain by day in a spring and summer');
  // (an instant it has rained harder than that for two bouts: a bout begun dry may still be flying home)
  const bout = (BEINGS.bird.rests + (2 * BEINGS.bird.reach) / L.bodyOf('bird').cruise) * 1000;
  const sheltering = (ms) => [0, 1, 2].every((n) => weatherAt(SEED, ms - n * bout).rain > BEINGS.bird.song.shelter);
  let checked = 0;
  for (let s = -7200; s < 1800; s += 60)
    if (sheltering(wet + s * 1000)) {
      assert.equal(flyingAt(wet + s * 1000), 0, `rain at ${new Date(wet + s * 1000).toISOString()}: none flies`);
      checked++;
    }
  assert.ok(checked > 30, `${checked} instants in the rain`);
  let dryFlying = 0;
  for (let ms = Date.UTC(2026, 5, 10, 18); ms < Date.UTC(2026, 5, 20, 18) && !dryFlying; ms += 86400000)
    if (weatherAt(SEED, ms).rain === 0) for (let s = 0; s < 3600 && !dryFlying; s += 20) dryFlying += flyingAt(ms + s * 1000);
  assert.ok(dryFlying > 0, 'and on a fine day they fly');
});
