// Law v2: the fast tiled sim equals the dense reference, cell for cell and fact
// for fact (ink, gall, dent, depth, peak, soak, wear, tears, cockle).
import test from 'node:test';
import assert from 'node:assert/strict';
import { grow } from '../v2/sim.js';
import { growReference } from '../v2/reference.js';
import { settledCells } from '../v2/look.js';
import { OAK_GALL, WATER } from '../v2/constants.js';
import { encodeActs, decodeActs } from '../v2/acts.js';
import { fixtureBytes, testPaperKey } from '../tools/fixtures.js';
import { fixtureV2Bytes } from '../tools/fixtures-v2.js';

const family = { grain: 8, weight: 8, tooth: 0 };

function xorshift(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// A random small record: walks, dwells, scrubbing back and forth, every nib,
// pressure or not, pen changes, pauses; ink, oak gall and the water brush.
function randomRecord(seed) {
  const r = xorshift(seed);
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const rgb = () => {
    const k = r();
    return k < 0.25 ? [...OAK_GALL] : k < 0.5 ? [...WATER] : [int(0, 255), int(0, 255), int(0, 255)];
  };
  const pen = () => ({ nib: int(0, 2), size: int(8, 70), flex: int(0, 150), flow: int(0, 15), rgb: rgb(), angle: int(0, 179), spatter: r() < 0.5 ? int(1, 15) : 0 });
  const strokes = [];
  let clock = 0;
  const nStrokes = int(1, 4);
  for (let k = 0; k < nStrokes; k++) {
    const hasP = r() < 0.5;
    const n = int(2, 60);
    const scrub = r() < 0.25;
    const fast = r() < 0.4;
    let x = int(100, 500), y = int(100, 500);
    const x0 = x, y0 = y;
    const xs = [], ys = [], ts = [], ps = [];
    clock += k === 0 ? 0 : int(0, 1500);
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        clock += r() < 0.15 ? int(20, 120) : int(1, 16);
        if (fast) clock -= Math.min(clock - ts[ts.length - 1] - 1, 6); // fast strokes: long moves in a few ms (splatter)
        if (scrub) {
          x = x0 + (i % 2 ? 40 : 0);
          y = y0 + int(-3, 3);
        } else if (r() > 0.2) {
          const reach = fast ? 90 : 25;
          x = Math.max(0, Math.min(700, x + int(-reach, reach)));
          y = Math.max(0, Math.min(700, y + int(-reach, reach)));
        }
      }
      xs.push(x);
      ys.push(y);
      ts.push(clock);
      ps.push(int(1, 255));
    }
    const pens = k === 0 ? [{ at: 0, ...pen() }] : r() < 0.6 ? [{ at: int(0, n - 1), flow: int(0, 15), rgb: rgb(), ...(r() < 0.5 ? { spatter: int(0, 15) } : {}) }] : [];
    strokes.push({ hasP, kind: hasP ? 2 : 0, synthP: false, x: xs, y: ys, t: ts, p: hasP ? ps : null, pens });
  }
  return decodeActs(encodeActs({ orgX: int(0, 40), orgY: int(0, 40), strokes }));
}

function same(name, rec, opts) {
  const fastRes = grow(rec, opts);
  const fast = settledCells(fastRes.tiles);
  const ref = growReference(rec, opts);
  assert.equal(fast.length, ref.cells.length, `${name}: cell count`);
  for (let i = 0; i < ref.cells.length; i++) {
    if (fast[i].join() !== ref.cells[i].join()) assert.fail(`${name}: first difference at cell ${ref.cells[i].slice(0, 2)}: fast ${fast[i]} vs reference ${ref.cells[i]}`);
  }
  assert.deepEqual(fastRes.lost, ref.lost, `${name}: what tears took`);
  assert.deepEqual(fastRes.splat, ref.splat, `${name}: what the pen threw`);
  return fastRes;
}

test('v2: the fast simulation equals the reference on random writing (ink, gall, water, pressure, scrubbing, splatter)', () => {
  let thrown = 0;
  for (let seed = 1; seed <= 20; seed++) {
    thrown += same(`seed ${seed}`, randomRecord(seed), { paperKey: testPaperKey(`oracle2-${seed}`), family: { grain: seed % 16, weight: (seed * 7) % 16, tooth: 0 } }).splat.drops;
  }
  assert.ok(thrown > 0, 'the runs never exercised splatter');
});

test('v2: and on older gall (the resistance to water), at other scales, and on the v1 fixtures', () => {
  for (const ageH of [720]) same(`waterOverGall at ${ageH} h`, fixtureV2Bytes('waterOverGall').rec, { paperKey: testPaperKey('oracle'), family, gallAgeH: ageH });
  for (const name of ['gallHairPool', 'scrub', 'groove', 'tearThenInk']) same(name, fixtureV2Bytes(name).rec, { paperKey: testPaperKey('oracle'), family });
  same('gallOverBlue at 1.5×', fixtureV2Bytes('gallOverBlue').rec, { paperKey: testPaperKey('oracle'), family, scale: 96 });
  for (const name of ['hairline', 'dwell', 'mixWet', 'flexPressure']) same(`v1 ${name}`, fixtureBytes(name).rec, { paperKey: testPaperKey('oracle'), family });
});
