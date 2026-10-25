// Rain on the window (world.md Phase 5): drops land, bead, join and run down; the glass is bounded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPane, HELD, roundOf } from './glass.js';

test('a bead stands while the glass holds its weight; heavier, it runs down', () => {
  assert.ok(roundOf(HELD) * 2 > 0.003 && roundOf(HELD) * 2 < 0.006, `the largest it holds: ${(roundOf(HELD) * 2000).toFixed(1)} mm across`);
  const p = createPane({ width: 1, height: 1.2 });
  p.add(0.2, 0.1, HELD * 0.5);
  p.add(0.6, 0.1, HELD * 3);
  p.step(0.05);
  const [small, big] = [p.beads.find((b) => b.x === 0.2), p.beads.find((b) => b.x === 0.6)];
  assert.ok(!small.moving && small.y === 0.1, 'held');
  assert.ok(big.moving && big.y > 0.1, 'running');
  // running, it takes in the beads below it, and grows
  p.add(0.6, 0.3, HELD * 0.4);
  for (let k = 0; k < 200; k++) p.step(0.01);
  assert.ok(!p.beads.some((b) => b.x === 0.6 && b.y < 0.29 + 1e-9 && b.v === HELD * 0.4), 'joined');
});

test('an upright pane takes rain only as the wind slants it; each drop lands as a tick, seeded', () => {
  const calm = createPane({ width: 1, height: 1.2, seed: 5 });
  assert.equal(calm.step(1, { rain: 10, wind: 0 }).length, 0);
  const a = createPane({ width: 1, height: 1.2, seed: 5 }),
    b = createPane({ width: 1, height: 1.2, seed: 5 });
  const ea = a.step(0.2, { rain: 4, wind: 3, t: 10 }),
    eb = b.step(0.2, { rain: 4, wind: 3, t: 10 });
  assert.ok(ea.length > 10);
  assert.deepEqual(ea, eb, 'the same drops, the same ticks');
  assert.ok(ea.every((e) => e.matter && e.kind === 'rain-glass' && e.t <= 10 && e.t > 9.8));
  assert.ok(createPane({ width: 1, height: 1.2 }).step(1, { rain: 4, wind: 8 }).length > createPane({ width: 1, height: 1.2 }).step(1, { rain: 4, wind: 2 }).length, 'more wind, more on the glass');
});

test('the glass is bounded: steady rain keeps about as many beads on it, each drop a fixed cost', () => {
  const p = createPane({ width: 1, height: 1.2, seed: 9 });
  let landed = 0;
  const count = [];
  const t0 = performance.now();
  for (let s = 1; s <= 900; s++) {
    landed += p.step(0.1, { rain: 6, wind: 4, t: s / 10 }).length;
    if (s % 300 === 0) count.push(p.beads.length);
  }
  const usPerDrop = ((performance.now() - t0) * 1000) / landed;
  assert.ok(count[2] < count[1] * 1.3, `beads on the glass: ${count.join(', ')} (joined, run off)`);
  assert.ok(usPerDrop < 60, `${usPerDrop.toFixed(1)} µs a drop`);
  const h = p.heights(64, 77);
  assert.ok(Math.max(...h) > 0 && Math.max(...h) < 0.004, 'water standing a few mm at most');
});
