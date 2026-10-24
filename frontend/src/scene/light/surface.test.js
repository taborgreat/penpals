// The room's surfaces (light-waves §4; Tests, "Room cells"): the same surface
// seed draws identical cells on every device; close up, plaster and wood
// cells are the paper's size; far away there is no shimmer. (The GPU's cells
// against these: e2e/grower.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CELLS_PER_UNIT } from 'penpals-law/v1/constants';
import { PX_PER_MM } from '../../ink/nibs.js';
import {
  CELL_PX, CELL_M, PX_PER_M, PLASTER, PLANKS, BOARD, KINDS, CURVES_OF, DEFAULT_SEEDS, defaultSeed, seedMix,
  growCell, cellFace, growMean, cellOf, SURFACE_GLSL, SURFACE_WGSL,
} from './surface.js';

const SEED = [0x12345678, 0x9abcdef0];
const ALL = [PLASTER, PLANKS, BOARD];
const digest = (kind, seed, x0, y0, n = 64) => {
  const b = new Int32Array(n * n * 3);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const c = growCell(kind, seed, x0 + x, y0 + y);
      b.set([c.height, c.tone, c.grain], (y * n + x) * 3);
    }
  }
  return createHash('sha256').update(new Uint8Array(b.buffer)).digest('hex').slice(0, 32);
};
// Blocks with something in them: plaster at its corner, the floor across a
// seam between rows of boards, the table across the glue line between boards.
const BLOCKS = { [PLASTER]: [0, 0], [PLANKS]: [100, 1500], [BOARD]: [0, 3180] };
// Pinned: a change here is a change to every room (the cells are grown, never stored).
const GOLDEN = {
  [PLASTER]: 'f047de85f69d935c93df6aa5c9b79d4f',
  [PLANKS]: 'ae3e95de8e372b5934ab813995e427f6',
  [BOARD]: 'af2146b99333d37916ae43ee45648794',
};

test('the same surface seed draws identical cells; another seed, other cells', () => {
  for (const kind of ALL) {
    const [x0, y0] = BLOCKS[kind];
    assert.equal(digest(kind, SEED, x0, y0), GOLDEN[kind], `kind ${kind}`);
    assert.equal(digest(kind, seedMix(SEED), x0, y0), GOLDEN[kind], 'the seed or its mix');
    assert.notEqual(digest(kind, [SEED[0] ^ 1, SEED[1]], x0, y0), GOLDEN[kind]);
  }
  for (const [name, seed] of Object.entries(DEFAULT_SEEDS)) {
    assert.deepEqual(seed, defaultSeed(name));
    assert.ok(seed.every((s) => Number.isInteger(s) && s >= 0 && s < 2 ** 32));
  }
  assert.equal(new Set(Object.values(DEFAULT_SEEDS).map((s) => s.join())).size, Object.keys(DEFAULT_SEEDS).length, 'each surface its own seed');
  assert.deepEqual(KINDS, { plaster: PLASTER, planks: PLANKS, board: BOARD });
  assert.deepEqual(CURVES_OF, ['plaster', 'floor', 'table']);
});

test('close up, plaster and wood cells are the paper\'s size, each its own', () => {
  assert.equal(CELL_PX, 1 / CELLS_PER_UNIT);
  assert.ok(Math.abs(PX_PER_M / (PX_PER_MM * 1000) - 1) < 1e-12, 'the page\'s own scale');
  assert.ok(Math.abs(CELL_M - 77.1e-6) < 0.1e-6, 'about 77 µm');
  // every point within a cell is that cell; the next cell over is the next one
  for (const k of [0, 1, 517, 43210]) {
    for (const f of [0.001, 0.25, 0.5, 0.75, 0.999]) {
      assert.deepEqual(cellOf((k + f) * CELL_M, (k + 0.5) * CELL_M), [k, k]);
      assert.deepEqual(cellOf((k + 1 + f) * CELL_M, (k + 0.5) * CELL_M), [k + 1, k]);
    }
  }
  // neighbouring cells differ (each cell has its own height and tone)
  for (const kind of ALL) {
    let differ = 0;
    const n = 2000;
    for (let i = 0; i < n; i++) {
      const x = 5000 + i * 7, y = 2000 + (i % 50) * 13;
      const a = growCell(kind, SEED, x, y), b = growCell(kind, SEED, x + 1, y);
      if (a.height !== b.height || a.tone !== b.tone) differ++;
    }
    assert.ok(differ / n > 0.9, `kind ${kind}: ${differ / n} of neighbours differ`);
  }
  // each cell's own face to the light: its rise to its neighbours
  for (const kind of ALL) {
    for (const [x, y] of [[10, 10], [300, 1535], [9001, 4000]]) {
      const h = growCell(kind, SEED, x, y).height;
      assert.deepEqual(cellFace(kind, SEED, x, y), [growCell(kind, SEED, x + 1, y).height - h, growCell(kind, SEED, x, y + 1).height - h]);
    }
  }
  // drawn crisp: at a footprint of a cell or less, the averaged look is the cell itself
  for (const kind of ALL) {
    for (let i = 0; i < 200; i++) {
      const x = 1000 + i * 37.31, y = 1400 + i * 11.77;
      const c = growCell(kind, SEED, Math.floor(x), Math.floor(y));
      for (const foot of [0.25, 1]) assert.deepEqual(growMean(kind, SEED, x, y, foot), { height: c.height, tone: c.tone });
    }
  }
});

test('far away there is no shimmer: the averaged character barely moves under sub-pixel motion, and is the cells\' own average', () => {
  const foot = 256; // cells in one pixel
  // pixels whose footprint (and its shifts) lies inside one board: only fine
  // structure there (rings, streaks, pores), which is what shimmers
  const rows = { [PLASTER]: [1000.5, 20000.5], [PLANKS]: [2 * 1536 + 768.5, 9 * 1536 + 700.5], [BOARD]: [1600.5, 3200 + 1500.5] };
  const inOneBoard = (kind, x, y) => kind !== PLANKS
    || [...Array(Math.ceil((2 * foot) / 4))].every((_, k) => growCell(kind, SEED, Math.floor(x - foot / 2 + k * 4), Math.floor(y)).height >= 0);
  for (const kind of ALL) {
    let mean = 0, worst = 0, point = 0, n = 0;
    for (const y of rows[kind]) {
      for (let i = 0; i < 48; i++) {
        const x = 3000 + (i + 0.5) * foot;
        if (!inOneBoard(kind, x, y)) continue;
        const a = growMean(kind, SEED, x, y, foot).tone;
        for (const d of [0.25, 0.5]) {
          const moved = Math.abs(growMean(kind, SEED, x + d * foot, y + d * foot, foot).tone - a);
          mean += moved;
          worst = Math.max(worst, moved);
          point += Math.abs(growCell(kind, SEED, Math.floor(x + d * foot), Math.floor(y + d * foot)).tone - growCell(kind, SEED, Math.floor(x), Math.floor(y)).tone);
          n++;
        }
      }
    }
    assert.ok(n > 40, `kind ${kind}: enough pixels (${n})`);
    mean /= n;
    point /= n;
    assert.ok(mean < 1.5, `kind ${kind}: the averaged tone moves ${mean.toFixed(2)} on average`);
    assert.ok(worst < 4, `kind ${kind}: at most ${worst.toFixed(2)}`);
    assert.ok(point > 8 * mean, `kind ${kind}: point-sampled cells jump ${point.toFixed(1)} (averaged ${mean.toFixed(2)})`);
  }
  // the averaged character is the cells' own: each pixel against the true
  // average of the 256 × 256 cells it covers, board edges and seams included
  for (const kind of ALL) {
    for (const [x, y] of [[4100.5, 1000.5], [9000.25, 1536 * 3 + 10.5], [15000.75, 3200 - 40.5], [27000.5, 777.25]]) {
      let tone = 0, height = 0, c = 0;
      for (let yy = Math.round(y - foot / 2); yy < y + foot / 2; yy++) {
        for (let xx = Math.round(x - foot / 2); xx < x + foot / 2; xx++) {
          const g = growCell(kind, SEED, xx, yy);
          tone += g.tone;
          height += g.height;
          c++;
        }
      }
      const m = growMean(kind, SEED, x, y, foot);
      assert.ok(Math.abs(m.tone - tone / c) < 4, `kind ${kind} at ${x},${y}: tone ${m.tone.toFixed(2)} vs ${(tone / c).toFixed(2)}`);
      assert.ok(Math.abs(m.height - height / c) < 12, `kind ${kind} at ${x},${y}: height ${m.height.toFixed(2)} vs ${(height / c).toFixed(2)}`);
    }
  }
});

test('the floor is boards: seams between rows and at staggered ends, rings across each board; plaster has no grain', () => {
  const W = 1536;
  // the seam between rows sits lower and darker than the wood beside it
  for (const r of [1, 2, 7]) {
    for (let x = 1000; x < 1100; x++) {
      const seam = growCell(PLANKS, SEED, x, r * W + 5), wood = growCell(PLANKS, SEED, x, r * W + 40);
      assert.ok(seam.height < 0 && wood.height > 0, 'lower');
      assert.ok(seam.tone >= 224, 'darker');
    }
  }
  // along a row, boards end in 12-cell seams, 0.6..1.3 m apart
  const ends = [];
  for (let x = 0; x < 40000; x++) {
    if (growCell(PLANKS, SEED, x, 2 * W + 700).height < 0 && growCell(PLANKS, SEED, x - 1, 2 * W + 700).height >= 0) ends.push(x);
  }
  assert.ok(ends.length >= 2, `${ends.length} board ends`);
  for (let i = 1; i < ends.length; i++) assert.ok(ends[i] - ends[i - 1] >= 8192 && ends[i] - ends[i - 1] < 16384, `a board ${ends[i] - ends[i - 1]} cells long`);
  for (const e of ends) for (let k = 0; k < 12; k++) assert.ok(growCell(PLANKS, SEED, e + k, 2 * W + 700).height < 0);
  // growth rings: tone across a board repeats at the board's ring spacing (24..55 cells)
  const corr = (s, lag) => {
    const n = s.length - lag, mu = s.reduce((a, b) => a + b, 0) / s.length;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) num += (s[i] - mu) * (s[i + lag] - mu);
    for (const v of s) den += (v - mu) ** 2;
    return (num / n) / (den / s.length);
  };
  for (const [kind, y0, x] of [[PLANKS, W + 100, 2000], [PLANKS, 5 * W + 100, 30000], [BOARD, 100, 5000], [BOARD, 3300, 12000]]) {
    const s = Array.from({ length: 1000 }, (_, i) => growCell(kind, SEED, x, y0 + i).tone);
    const r = Array.from({ length: 56 }, (_, lag) => (lag < 24 ? -Infinity : corr(s, lag)));
    const best = r.indexOf(Math.max(...r));
    assert.ok(corr(s, best) > 0.5, `kind ${kind}: rings every ${best} cells (r ${corr(s, best).toFixed(2)})`);
    assert.ok(corr(s, Math.round(best / 2)) < corr(s, best) - 0.3, 'not at half the spacing');
  }
  // grain: plaster none; wood along the board, turned a step where the rings wobble
  const grains = { [PLASTER]: new Set(), [PLANKS]: new Set(), [BOARD]: new Set() };
  for (let i = 0; i < 20000; i++) for (const kind of ALL) grains[kind].add(growCell(kind, SEED, (i * 977) % 40000, 700 + ((i * 131) % 700)).grain);
  assert.deepEqual([...grains[PLASTER]], [0]);
  for (const kind of [PLANKS, BOARD]) assert.deepEqual([...grains[kind]].sort((a, b) => a - b), [0, 1, 15]);
});

test('the shaders are this grower: the same constants in GLSL and WGSL', () => {
  const literals = (s) => new Set(s.match(/\b(0x[0-9a-f]+u|\d+u)\b/g));
  assert.deepEqual(literals(SURFACE_GLSL), literals(SURFACE_WGSL));
  for (const s of [SURFACE_GLSL, SURFACE_WGSL]) {
    for (const c of ['0x7feb352du', '0x846ca68bu', `${0x9e3779b9}u`, '1536u', '3200u', '8192u', '8191u']) assert.ok(s.includes(c), c);
    for (const f of ['growCell', 'cellFace', 'growMean']) assert.ok(s.includes(f), f);
    assert.ok(!/\$\{|undefined|NaN/.test(s), 'fully interpolated');
  }
});
