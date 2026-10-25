// The room's surfaces (light-waves §4; Tests, "Room cells"): the same surface
// seed draws identical cells on every device; close up, plaster and wood
// cells are the paper's size; far away there is no shimmer. And the things'
// matter (matter-fixes §3): each grown the same way, on its own surface.
// (The GPU's cells against these: e2e/grower.mjs.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { MATTER } from './curves.js';
import { N } from './axis.js';
import { CELLS_PER_UNIT } from 'penpals-law/v1/constants';
import { PX_PER_MM } from '../../ink/nibs.js';
import {
  CELL_PX, CELL_M, PX_PER_M, PLASTER, PLANKS, BOARD, BRASS, WAX, WICK, CLOTH, SKIN, KINDS, CURVES_OF, DEFAULT_SEEDS, defaultSeed, seedMix,
  growCell, cellFace, growMean, cellOf, objectCells, thingSeed, SURFACE_GLSL, SURFACE_WGSL,
} from './surface.js';

const SEED = [0x12345678, 0x9abcdef0];
const ALL = [PLASTER, PLANKS, BOARD];
const THINGS = [BRASS, WAX, WICK, CLOTH, SKIN];
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
const BLOCKS = { [PLASTER]: [0, 0], [PLANKS]: [100, 1500], [BOARD]: [0, 3180], ...Object.fromEntries(THINGS.map((k) => [k, [0, 0]])) };
// Pinned: a change here is a change to every room (the cells are grown, never stored).
const GOLDEN = {
  [PLASTER]: 'f047de85f69d935c93df6aa5c9b79d4f',
  [PLANKS]: 'ae3e95de8e372b5934ab813995e427f6',
  [BOARD]: 'af2146b99333d37916ae43ee45648794',
  [BRASS]: '11bf581fbaea0583d91b24d739eac61b',
  [WAX]: 'cdd5b69dff3e2cc65e9352d13d38d43f',
  [WICK]: '3477609ff4ab829998aca64036ff7e45',
  [CLOTH]: 'dc5a9e362785573300482be9ad7c9603',
  [SKIN]: '13de20cae5e7214551562c451ba22aa4',
};

test('the same surface seed draws identical cells; another seed, other cells', () => {
  for (const kind of [...ALL, ...THINGS]) {
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
  assert.deepEqual(KINDS, { plaster: PLASTER, planks: PLANKS, board: BOARD, brass: BRASS, wax: WAX, wick: WICK, cloth: CLOTH, skin: SKIN });
  assert.deepEqual(CURVES_OF, ['plaster', 'floor', 'table', 'brass', 'wax', 'wick', 'cloth', 'skin']);
  // each kind is a matter: a light and a dark curve, its cells between them (no RGB anywhere)
  for (const name of CURVES_OF) assert.ok(MATTER[name].light.length === N && MATTER[name].dark.length === N, name);
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

test("zoomed in, each thing shows its own cells as the wood does: brass scratched along its turning, wax and skin smooth (matter-fixes §3)", () => {
  const sd = (a) => {
    const m = a.reduce((x, y) => x + y, 0) / a.length;
    return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length);
  };
  const block = (kind, f) => Array.from({ length: 4096 }, (_, i) => f(growCell(kind, SEED, 300 + (i % 64), 200 + Math.floor(i / 64))));
  for (const kind of THINGS) {
    // each cell its own
    let differ = 0;
    for (let i = 0; i < 2000; i++) {
      const x = 5000 + i * 7, y = 2000 + (i % 50) * 13;
      const a = growCell(kind, SEED, x, y), b = growCell(kind, SEED, x + 1, y + 1);
      if (a.height !== b.height || a.tone !== b.tone) differ++;
    }
    assert.ok(differ / 2000 > 0.5, `kind ${kind}: ${differ / 2000} of neighbours differ`);
    // no grain (that is wood's), and its tone within its curves
    for (const c of block(kind, (c) => c)) assert.ok(c.grain === 0 && c.tone >= 0 && c.tone <= 255);
    // crisp up close; far away the cells' own average
    for (let i = 0; i < 100; i++) {
      const x = 1000 + i * 37.31, y = 1400 + i * 11.77;
      const c = growCell(kind, SEED, Math.floor(x), Math.floor(y));
      assert.deepEqual(growMean(kind, SEED, x, y, 1), { height: c.height, tone: c.tone });
    }
    for (const [x, y] of [[4100.5, 1000.5], [27000.5, 777.25]]) {
      let tone = 0, height = 0, n = 0;
      for (let yy = y - 128; yy < y + 128; yy++) for (let xx = x - 128; xx < x + 128; xx++) {
        const g = growCell(kind, SEED, Math.round(xx), Math.round(yy));
        tone += g.tone;
        height += g.height;
        n++;
      }
      const m = growMean(kind, SEED, x, y, 256);
      assert.ok(Math.abs(m.tone - tone / n) < 4 && Math.abs(m.height - height / n) < 12, `kind ${kind}: ${m.tone.toFixed(1)} vs ${(tone / n).toFixed(1)}, ${m.height.toFixed(1)} vs ${(height / n).toFixed(1)}`);
    }
  }
  // brass: its scratches run along x (around a holder, the lathe's): a cell is like the next along, not the next across
  let along = 0, across = 0;
  for (let i = 0; i < 4000; i++) {
    const x = 700 + (i % 200) * 3, y = 900 + Math.floor(i / 200) * 5;
    const h = growCell(BRASS, SEED, x, y).height;
    along += Math.abs(growCell(BRASS, SEED, x + 1, y).height - h);
    across += Math.abs(growCell(BRASS, SEED, x, y + 1).height - h);
  }
  assert.ok(along < 0.75 * across, `scratches along x: ${along} vs ${across}`);
  // polished and poured: brass, wax and skin are far smoother than plaster
  const plaster = sd(block(PLASTER, (c) => c.height));
  for (const kind of [BRASS, WAX, SKIN]) assert.ok(sd(block(kind, (c) => c.height)) < plaster / 2, `kind ${kind} smoother than plaster`);
});

test("a thing's cells are on its own surface: carried and tilted, its grain stays with it; each thing its own seed (matter-fixes §3)", () => {
  // a candle (a cylinder about its z axis, its foot at z 0), carried and tilted as the hand does
  const r = 0.011 * PX_PER_M, h = 0.18 * PX_PER_M;
  const geo = new THREE.CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const candle = new THREE.Mesh(geo);
  candle.scale.set(r, r, h);
  const local = new THREE.Vector3(Math.cos(1.1), Math.sin(1.1), 0.37); // a point on its side
  const normal = [Math.cos(1.1), Math.sin(1.1), 0];
  const seen = (pos, tilt) => {
    candle.position.set(...pos);
    candle.rotation.set(0, tilt, 0);
    candle.updateMatrixWorld(true);
    const world = local.clone().applyMatrix4(candle.matrixWorld);
    const scale = new THREE.Vector3().setFromMatrixScale(candle.matrixWorld); // (the shader's modelScale)
    const own = objectCells('round', local.toArray(), normal, scale.toArray()).map(Math.floor);
    const byWorld = [Math.floor(world.x / CELL_PX + 1e5), Math.floor(world.y / CELL_PX + 1e5)]; // (as it was: cells from where it stands)
    return { own, byWorld, cell: growCell(WAX, SEED, ...own) };
  };
  const a = seen([1000, 2000, 300], 0), b = seen([4000, -500, 300], (35 * Math.PI) / 180);
  assert.deepEqual(a.own, b.own, 'the same cell of it');
  assert.deepEqual(a.cell, b.cell, 'grown the same');
  assert.notDeepEqual(a.byWorld, b.byWorld, '(addressed by the world, its grain would have slid over it)');
  // its cells are the paper's: a page px along its surface is two cells; all of them ≥ 0
  const up = objectCells('round', [1, 0, 0.5 + 1 / h], [1, 0, 0], [r, r, h]),
    at = objectCells('round', [1, 0, 0.5], [1, 0, 0], [r, r, h]);
  assert.ok(Math.abs(up[1] - at[1] - 1 / CELL_PX) < 1e-6, 'a page px up it');
  const turn = objectCells('round', [-1, 1e-9, 0], [-1, 0, 0], [r, r, h])[0] - objectCells('round', [-1, -1e-9, 0], [-1, 0, 0], [r, r, h])[0]; // (its back: the seam)
  assert.ok(Math.abs(turn - (2 * Math.PI * r) / CELL_PX) < 1e-3, 'once around it: its circumference');
  // a box: each face from its own corner, as far as it is long
  const size = [0.12 * PX_PER_M, 0.009 * PX_PER_M, 0.009 * PX_PER_M];
  assert.deepEqual(objectCells('box', [-0.5, -0.5, 0.5], [0, 0, 1], size), [0, 0]);
  assert.deepEqual(objectCells('box', [0.5, 0.5, 0.5], [0, 0, 1], size).map((v) => Math.round(v)), [Math.round(size[0] / CELL_PX), Math.round(size[1] / CELL_PX)]);
  for (const n of [[1, 0, 0], [0, -1, 0], [0, 0, -1]]) for (const c of objectCells('box', [0.2, -0.3, 0.4], n, size)) assert.ok(c >= 0);
  for (const c of objectCells('ball', [0, -1, 0], [0, -1, 0], [50, 50, 50])) assert.ok(c >= 0);
  // each thing its own seed: from the room's and its name, the same for everyone
  const room = seedMix(DEFAULT_SEEDS.table);
  assert.equal(thingSeed(room, 'holder-0'), thingSeed(room, 'holder-0'));
  assert.notEqual(thingSeed(room, 'holder-0'), thingSeed(room, 'holder-1'));
  assert.notEqual(thingSeed(room, 'holder-0'), thingSeed(seedMix([1, 2]), 'holder-0'));
  assert.ok(Number.isInteger(thingSeed(room, 'pen')) && thingSeed(room, 'pen') >= 0 && thingSeed(room, 'pen') < 2 ** 32);
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
