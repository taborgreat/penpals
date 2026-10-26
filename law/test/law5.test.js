// Law 5 (one-matter.md Phase 3: no substance is told by its colour; v2/sim.js 16): an ink is what it holds,
// its pigment by its colour and its oak gall by its pen act's gall (PNKA format 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lawOf } from '../laws.js';
import { record, samplePath, testPaperKey, PENS } from '../tools/fixtures.js';
import { OAK_GALL, WATER } from '../v2/constants.js';

const family = { grain: 8, weight: 8, tooth: 0 };
const paperKey = testPaperKey('law5');
const line = (pen) =>
  record([
    {
      path: samplePath(
        (u) => [20 + 40 * u, 20],
        () => 30,
      ),
      pen,
      start: 0,
    },
  ]);
// grown under `law`: per cell [f0, f1, f2, fg] (pigment, oak gall)
function grown(law, pen) {
  const L = lawOf(law);
  const rec = L.decodeCanonical(L.encodeActs(line(pen)));
  const cells = L.settledCells(L.grow(rec, { paperKey, family }).tiles);
  return { rec, ink: new Map(cells.map((c) => [`${c[0]},${c[1]}`, [c[2], c[3], c[4], c[5]]])) };
}

test('an oak gall ink is what it holds: law 4 told it by its colour, law 5 by its gall, and both lay the same gall', () => {
  const byColour = grown(4, { ...PENS.medium, rgb: [...OAK_GALL] });
  const byGall = grown(5, { ...PENS.medium, rgb: [...WATER], gall: 255 });
  assert.ok(byGall.ink.size > 100);
  assert.deepEqual([...byGall.ink], [...byColour.ink], 'the same pigment (none) and the same gall, cell for cell');
  // law 5 does not read colours: oak gall's colour with no gall in it is a brownish pigment, and no gall
  const colourOnly = grown(5, { ...PENS.medium, rgb: [...OAK_GALL] });
  assert.ok([...colourOnly.ink.values()].every((c) => c[3] === 0) && [...colourOnly.ink.values()].some((c) => c[0] > 0), 'its colour is only pigment');
  // and its look ages only where its ink held gall
  assert.equal(lawOf(5).ages(byGall.rec), true);
  assert.equal(lawOf(5).ages(colourOnly.rec), false);
});

test('an ink holding pigment and gall lays both, the gall as much as it holds', () => {
  const both = grown(5, { ...PENS.medium, gall: 128 });
  const pigment = grown(5, { ...PENS.medium });
  const full = grown(5, { ...PENS.medium, rgb: [...WATER], gall: 255 });
  let n = 0;
  for (const [k, c] of both.ink) {
    const p = pigment.ink.get(k),
      g = full.ink.get(k);
    if (!p || !g || !g[3]) continue;
    n++;
    assert.ok(c[0] > 0 && c[3] > 0, 'both in one cell');
    assert.ok(c[3] < g[3], 'half the gall of an all-gall ink');
  }
  assert.ok(n > 50, `${n} cells compared`);
  // the field: a gall of 0 is no field at all (absent is none), and law 4 refuses it
  assert.throws(() => lawOf(4).decodeCanonical(lawOf(5).encodeActs(line({ ...PENS.medium, gall: 10 }))), /unknown PNKA format/);
});
