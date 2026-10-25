// The outside (outside.md Phase 4): grown from the world's seed, the same for everyone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { near, groundAt, treeNow, stonesIn, treesIn, dailyRain, OUTSIDE } from '../outside.js';
import { shapeOf, limbsOf } from '../tree.js';
import { centreOf, PLOT_M } from '../world.js';

const today = Math.floor(Date.UTC(2026, 9, 25) / 86400000) + 719528;

test('the same seed grows the same ground, stones and trees for everyone, wherever they are asked from', () => {
  const a = near(30, -40, 25, { day: today }),
    b = near(30, -40, 25, { day: today });
  assert.deepEqual(a, b);
  assert.ok(a.stones.length > 10 && a.trees.length > 2, `${a.stones.length} stones, ${a.trees.length} trees`);
  // asked from elsewhere, what both reach is the same
  const c = near(40, -40, 25, { day: today });
  const shared = (list, other) => list.filter((p) => other.some((q) => q.id === p.id)).map((p) => JSON.stringify(p));
  assert.deepEqual(shared(a.trees, c.trees).sort(), shared(c.trees, a.trees).sort());
  assert.deepEqual(stonesIn(3, 4), stonesIn(3, 4));
  assert.equal(groundAt(12.5, -7.25), groundAt(12.5, -7.25));
  assert.ok(Math.abs(groundAt(0, 0) - groundAt(0.1, 0)) < 0.05, 'the dirt rolls, smoothly');
  // a tree grown twice is the same tree
  const t = a.trees[0];
  assert.deepEqual(limbsOf(treeNow(t, today)), limbsOf(treeNow({ ...t }, today)));
  assert.ok(shapeOf(treeNow(t, today)).height > 0);
  assert.ok(dailyRain() > 0, 'the place has rain to grow them');
});

test("no tree or stone where a house stands, nor in the start's clearing", () => {
  const houses = [{ plot: [1, 0] }, { plot: [0, 1] }];
  const yard = (p, c) => Math.max(Math.abs(p.at[0] - c[0]), Math.abs(p.at[1] - c[1])) <= PLOT_M / 2 - 1;
  const all = near(6, 6, 20, { houses, day: today });
  for (const p of [...all.stones, ...all.trees]) for (const c of [centreOf([0, 0]), ...houses.map((h) => centreOf(h.plot))]) assert.ok(!yard(p, c), `${p.id} in a yard`);
  // the same ground without the houses has things there
  const bare = near(6, 6, 20, { day: today });
  assert.ok(bare.stones.length + bare.trees.length > all.stones.length + all.trees.length);
  assert.ok(treesIn(0, 0, today).length <= 1 && OUTSIDE.trees.cell > 0);
});

test("the ground's matter: the same seed puts ore, clay and water in the same places; water pools where the ground is low", async () => {
  const { waterAt, matterAt, groundAt: g, stonesIn: s, WATER } = await import('../outside.js');
  const cells = [];
  for (let x = -64; x < 64; x++) for (let y = -64; y < 64; y++) cells.push([x + 0.5, y + 0.5]);
  const wet = cells.filter(([x, y]) => waterAt(x, y) > 0),
    dry = cells.filter(([x, y]) => !(waterAt(x, y) > 0));
  assert.ok(wet.length > 50 && dry.length > wet.length, `${wet.length} m² of water`);
  const mean = (list) => list.reduce((a, [x, y]) => a + g(x, y), 0) / list.length;
  assert.ok(mean(wet) < mean(dry) - 0.2, `the water lies low: ${mean(wet).toFixed(2)} m under ${mean(dry).toFixed(2)} m`);
  // each pond stands level: neighbouring wet cells (in one tile) have one surface
  for (const [x, y] of wet) {
    const [a, b] = [x + 1, y];
    if (Math.floor(a / WATER.tile) !== Math.floor(x / WATER.tile) || !(waterAt(a, b) > 0)) continue;
    assert.ok(Math.abs(g(x, y) + waterAt(x, y) - (g(a, b) + waterAt(a, b))) < 1e-9, 'a level surface');
  }
  // and nothing pools on a rise: a cell higher than all four neighbours is never wet
  for (const [x, y] of wet) assert.ok([g(x + 1, y), g(x - 1, y), g(x, y + 1), g(x, y - 1)].some((h) => h >= g(x, y) - 1e-9));
  // clay at its edges, grass elsewhere; ore among the stones; all the same asked again
  assert.ok(cells.some(([x, y]) => matterAt(x, y) === 'clay'));
  assert.deepEqual(
    cells.map(([x, y]) => matterAt(x, y)),
    cells.map(([x, y]) => matterAt(x, y)),
  );
  let ore = 0;
  for (let i = -20; i < 20; i++) for (let j = -20; j < 20; j++) if (s(i, j)[0]?.matter === 'ore') ore++;
  assert.ok(ore > 0, `${ore} ore stones about`);
});
