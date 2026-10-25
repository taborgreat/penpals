// The string (outside.md §1.1–§1.3): a weight on a string, let go, falls sideways,
// swings and settles at the bottom, and its swing never grows: energy only leaves.
// Pulled past its strength it snaps. The same acts give the same swing everywhere.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256 } from '@noble/hashes/sha2.js';
import { hang, STEP_MS } from '../string.js';
import { givesWay } from '../matter.js';
import { b64url, utf8 } from '../tags.js';

const ANCHOR = [1000000, 1000000, 2000000]; // µm: a branch 2 m up
const LEVEL = [1300000, 1000000, 2000000]; // let go level with it, 30 cm out

test('a weight on a string swings and settles at the bottom, and its swing never grows', () => {
  const r = hang({ anchor: ANCHOR, start: LEVEL, weight: 200 });
  assert.equal(r.snapped, false);
  assert.ok(r.steps * STEP_MS < 90000, `at rest within 90 s (${((r.steps * STEP_MS) / 1000).toFixed(1)} s)`);
  const off = r.rest.map((v, k) => v - ANCHOR[k]);
  assert.ok(Math.abs(off[0]) < 2000 && Math.abs(off[1]) < 2000, `straight below the branch: ${off}`);
  assert.ok(Math.abs(off[2] + 300000) < 2000, `as far down as the string is long: ${off[2]}`);
  // energy only leaves: at each turn the weight stops for a moment, all its energy height;
  // each half-swing tops out no higher than the one before, and never above where it was let go
  const r1 = hang({ anchor: ANCHOR, start: LEVEL, weight: 200, every: 1 });
  const xs = r1.path.map((q) => q[0] - ANCHOR[0]);
  const tops = [];
  let top = -Infinity;
  for (let i = 1; i < xs.length; i++) {
    top = Math.max(top, r1.path[i][2]);
    if (Math.sign(xs[i]) !== Math.sign(xs[i - 1]) && xs[i - 1] !== 0) {
      tops.push(top);
      top = -Infinity;
    }
  }
  assert.ok(tops.length >= 6, `it swings (${tops.length} half-swings)`);
  assert.ok(tops[0] <= LEVEL[2], 'never above where it was let go');
  for (let i = 1; i < tops.length; i++) assert.ok(tops[i] <= tops[i - 1] + 200, `half-swing ${i} rose: ${tops[i - 1]} → ${tops[i]}`);
  const turns = { '-1': [], 1: [] };
  for (let i = 1; i < xs.length - 1; i++) if (Math.abs(xs[i]) >= Math.abs(xs[i - 1]) && Math.abs(xs[i]) > Math.abs(xs[i + 1]) && Math.abs(xs[i]) > 20000) turns[Math.sign(xs[i])].push(Math.abs(xs[i]));
  for (const side of Object.values(turns)) for (let i = 1; i < side.length; i++) assert.ok(side[i] <= side[i - 1] + 200, `a turn wider than the last: ${side.slice(0, i + 1)}`);
  assert.ok(turns[1].length >= 3 && turns[-1].length >= 3, 'it swings');
});

test('pulled past its strength the string snaps and the weight falls free; within it, it holds', () => {
  const light = hang({ anchor: ANCHOR, start: LEVEL, weight: 200, steps: 2000 });
  assert.equal(light.snapped, false);
  const heavy = hang({ anchor: ANCHOR, start: LEVEL, weight: 200000, steps: 2000 }); // 200 kg on a thread
  assert.equal(heavy.snapped, true);
  assert.ok(heavy.rest[2] < ANCHOR[2] - 300000, 'and fell past where the string would have held it');
});

test('the same acts swing the same everywhere (a golden), and the harder matter takes the softer', () => {
  const r = hang({ anchor: ANCHOR, start: [1150000, 1200000, 1900000], pieces: 8, weight: 120, steps: 4000 });
  const digest = b64url(sha256(utf8(JSON.stringify([r.rest, r.snapped, r.path]))));
  assert.deepEqual(hang({ anchor: ANCHOR, start: [1150000, 1200000, 1900000], pieces: 8, weight: 120, steps: 4000 }), r);
  assert.equal(digest, GOLDEN);
  assert.equal(givesWay('stone', 'wood'), 'wood', 'a hard stone carves the wood');
  assert.equal(givesWay('chalk', 'wood'), 'chalk', 'a soft one wears away instead');
  assert.equal(givesWay('wood', 'wood'), null);
});
const GOLDEN = 'Qo4sgyX8lDJ6djZfP8tID4afIdoipnWxPrI2TPKJ-iA'; // recorded with this layer: a change to it is a change of the law
