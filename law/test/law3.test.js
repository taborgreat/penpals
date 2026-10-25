// Law 3 (rooms.md §3b, §3c, §5): the nib's reservoir and wax on sheets. Law-2
// records are untouched by it; a dipped pen's line fades as it empties and comes
// back with a dip; ink beads off wax and does not soak in under it; a seal pressed
// into warm wax takes, into cold wax it does not; a break cracks it. Goldens pin
// what a fixture grows to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lawOf } from '../laws.js';
import { b64url } from '../index.js';
import { record, samplePath, PENS, testPaperKey } from '../tools/fixtures.js';
import { WAX_SEAL, WAX_CRACK } from '../v2/constants.js';

const L2 = lawOf(2);
const L3 = lawOf(3);
const paperKey = testPaperKey('law3');
const FAMILY = { grain: 8, weight: 8, tooth: 0 };
const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
function grow(rec, L = L3) {
  const acts = L.encodeActs(rec);
  const res = L.grow(L.decodeCanonical(acts), { paperKey, family: FAMILY });
  const cells = L.settledCells(res.tiles);
  return { ...res, acts, cells, box: L.boxOf(cells) };
}
const ink = (c) => c[2] + c[3] + c[4];
// A seal's face: a ring and a cross, raised (32 × 32)
const FACE = new Uint8Array(32 * 32);
for (let v = 0; v < 32; v++)
  for (let u = 0; u < 32; u++) {
    const r = Math.hypot(u - 15.5, v - 15.5);
    FACE[v * 32 + u] = (r > 11 && r < 14) || Math.abs(u - 15.5) < 2 || Math.abs(v - 15.5) < 2 ? 255 : 0;
  }
// a pool of wax: drips about a point (tenths), hot
const pool = (x, y, t = 0) =>
  [
    [0, 0],
    [120, 0],
    [-120, 0],
    [0, 120],
    [0, -120],
    [90, 90],
    [-90, -90],
    [90, -90],
    [-90, 90],
  ].map(([dx, dy], k) => ({ kind: 'drip', t: t + 150 * k, x: x + dx, y: y + dy, amt: 400000, heat: 220 }));
const press = (x, y, t, more = {}) => ({ kind: 'press', t, x, y, depth: 220, angle: 0, tiltX: 0, tiltY: 0, cell: 2, w: 32, h: 32, face: FACE, ...more });

test('format 3 is law 3 alone; law-2 writing grows the same under law 3', () => {
  const rec = record([{ path: samplePath(line(0, 0, 80, 10), () => 40), pen: PENS.medium, start: 0 }], [10, 10]);
  const marked = { ...rec, marks: [{ kind: 'drip', t: 0, x: 300, y: 60, amt: 60000, heat: 200 }] };
  const bytes = L3.encodeActs(marked);
  assert.equal(bytes[4], 3);
  assert.throws(() => L2.decodeCanonical(bytes), /format/, 'law 2 refuses wax');
  assert.deepEqual(L3.decodeCanonical(bytes).marks, marked.marks);
  assert.throws(() => L3.decodeCanonical(Uint8Array.from([...bytes, 0])), /trailing/);
  // wax alone, no strokes: a record too
  const waxOnly = { orgX: 0, orgY: 0, strokes: [], marks: pool(2000, 2000) };
  assert.deepEqual(L3.decodeCanonical(L3.encodeActs(waxOnly)).marks.length, 9);
  // the same law-2 writing: the same cells, its facts digested as law 3
  const a = grow(rec, L2);
  const b = grow(rec, L3);
  assert.deepEqual(
    b.cells.map((c) => c.slice(0, 14)),
    a.cells,
  );
  assert.ok(b.cells.every((c) => c[15] === 0));
});

test("a dip pen's line fades as its reservoir empties and comes back with a dip; a fountain pen never runs dry", () => {
  const thirds = (cells) => {
    const xs = cells.filter((c) => ink(c)).map((c) => c[1]);
    const x0 = Math.min(...xs),
      x1 = Math.max(...xs);
    return [0, 1, 2].map((k) => cells.filter((c) => c[1] >= x0 + ((x1 - x0) * k) / 3 && c[1] < x0 + ((x1 - x0) * (k + 1)) / 3).reduce((a, c) => a + ink(c), 0));
  };
  const long = (pen) => record([{ path: samplePath(line(0, 0, 300, 0), () => 60), pen, start: 0 }], [10, 10]);
  const fountain = thirds(grow(long(PENS.heavy)).cells);
  assert.ok(fountain[2] > fountain[0] * 0.85, `the fountain pen's line holds: ${fountain}`);
  const dipped = thirds(grow(long({ ...PENS.heavy, well: 2 })).cells);
  assert.ok(dipped[0] > dipped[1] && dipped[1] > dipped[2], `it fades: ${dipped}`);
  assert.ok(dipped[2] < dipped[0] * 0.4);
  // two strokes, the second dipped again: it starts dark; without the dip it starts faint
  const pen = { ...PENS.heavy, well: 1 };
  const twice = (again) =>
    record(
      [
        { path: samplePath(line(0, 0, 200, 0), () => 60), pen, start: 0 },
        { path: samplePath(line(0, 40, 60, 40), () => 60), pen: again ? { ...pen } : pen, start: 300 },
      ],
      [10, 10],
    );
  const second = (rec) => {
    const { cells } = grow(rec);
    const top = Math.min(...cells.map((d) => d[0]));
    return cells.filter((c) => c[0] > top + 40).reduce((a, c) => a + ink(c), 0);
  };
  const redipped = second(twice(true));
  const dry = second(twice(false));
  assert.ok(redipped > dry * 3, `a dip fills it again: ${redipped} vs ${dry}`);
});

test('wax: ink written over it beads off and does not soak in; the paper beside takes it', () => {
  const marks = [{ kind: 'drip', t: 0, x: 1500, y: 50, amt: 900000, heat: 230 }]; // (tenths from the origin: cell row 110, where the stroke runs)
  const rec = { ...record([{ path: samplePath(line(0, 0, 300, 0), () => 60), pen: PENS.heavy, start: 400 }], [100, 50]), marks };
  // (the stroke crosses the drip: record() puts its first point at +5 units from the origin)
  const g = grow(rec);
  const waxed = g.cells.filter((c) => c[15] >= WAX_SEAL && c[0] >= 108 && c[0] <= 118);
  const bare = g.cells.filter((c) => !c[15] && c[0] >= 108 && c[0] <= 118 && ink(c) > 0);
  assert.ok(waxed.length > 20 && bare.length > 20, `${waxed.length} waxed, ${bare.length} bare`);
  const mean = (cs, f) => cs.reduce((a, c) => a + f(c), 0) / cs.length;
  assert.ok(mean(waxed, ink) < mean(bare, ink) * 0.5, `beads off: ${mean(waxed, ink)} vs ${mean(bare, ink)}`);
  assert.equal(Math.max(...waxed.map((c) => c[9])), 0, 'no soak under wax');
  assert.ok(mean(bare, (c) => c[9]) > 0, 'the paper beside soaked');
  assert.ok(g.box[2] > 0);
});

test('a seal pressed into warm wax takes; into cold wax, or onto bare paper, it does not; tilted, one side is deeper; a break cracks it', () => {
  const warm = grow({ orgX: 0, orgY: 0, strokes: [], marks: [...pool(2000, 2000), press(2000, 2000, 2500)] });
  assert.equal(warm.seals.length, 1);
  assert.equal(warm.seals[0].took, true, JSON.stringify(warm.seals));
  const cold = grow({ orgX: 0, orgY: 0, strokes: [], marks: [...pool(2000, 2000), press(2000, 2000, 60000)] });
  assert.equal(cold.seals[0].took, false, 'the wax had cooled');
  assert.ok(
    cold.cells.every((c) => !c[16]),
    'cold wax takes no impression',
  );
  const bare = grow({ orgX: 0, orgY: 0, strokes: [], marks: [{ kind: 'drip', t: 0, x: 9000, y: 9000, amt: 1000, heat: 0 }, press(2000, 2000, 500)] });
  assert.equal(bare.seals[0].took, false, 'no wax, no seal');
  // tilted: the right side of the face presses deeper
  const tilted = grow({ orgX: 0, orgY: 0, strokes: [], marks: [...pool(2000, 2000), press(2000, 2000, 2500, { tiltX: 120 })] });
  const cx = 400;
  const side = (f) => tilted.cells.filter((c) => c[16] && f(c[1])).reduce((a, c, _, all) => a + c[16] / all.length, 0);
  assert.ok(side((x) => x > cx + 8) > side((x) => x < cx - 8), 'deeper on the side it leans to');
  // broken: a crack across the impression
  const broken = grow({ orgX: 0, orgY: 0, strokes: [], marks: [...pool(2000, 2000), press(2000, 2000, 2500), { kind: 'break', t: 9000, x: 1850, y: 1900, x1: 2150, y1: 2100 }] });
  assert.ok(broken.cells.filter((c) => c[17] & WAX_CRACK).length > 30);
  assert.equal(broken.seals[0].took, true, 'the press took (the break is a later act)');
});

test('goldens: wax, a seal, a break and writing over it; and a dip pen', () => {
  // the wax first, a seal pressed into it and broken, then a line written across it all
  const written = record([{ path: samplePath(line(0, 0, 300, 40), () => 60), pen: PENS.heavy, start: 0 }], [100, 150]);
  written.strokes[0].t = written.strokes[0].t.map((v) => v + 4000);
  const sealed = {
    ...written,
    marks: [...pool(2000, 250), press(2000, 250, 2500, { angle: 30, tiltY: -40 }), { kind: 'break', t: 3500, x: 1850, y: 150, x1: 2150, y1: 350 }],
  };
  const g = grow(sealed);
  assert.equal(L3.decodeCanonical(g.acts).strokes[0].t[0], 4000, 'the writing came after the wax');
  assert.ok(
    g.cells.some((c) => c[15] && ink(c)),
    'the line crossed the wax',
  );
  const dip = record(
    [
      { path: samplePath(line(0, 0, 200, 0), () => 60), pen: { ...PENS.heavy, well: 1 }, start: 0 },
      { path: samplePath(line(0, 40, 200, 40), () => 60), pen: { ...PENS.heavy, well: 1 }, start: 300 },
    ],
    [10, 10],
  );
  const digest = (rec) => {
    const g = grow(rec);
    return b64url(L3.factsDigest({ cells: g.cells, box: g.box, actsBytes: g.acts, family: FAMILY }));
  };
  assert.deepEqual({ sealed: digest(sealed), dip: digest(dip) }, GOLDEN);
});

const GOLDEN = { sealed: 'Ng8bLQCw8ZCq26OqQUsEdR8zyZ9KC8hjGiyS_fz5eIg', dip: '8qIKKZPl3l-khZshjhsF3cdPMYgj99JTSZ5VAkVPg5U' };

test("a stamper's face is a signature in relief, mirrored: its impression reads the right way round", async () => {
  const { faceOf } = await import('../seal.js');
  // an 'L': a long stroke down the left, a short one along the bottom
  const rec = record(
    [
      { path: samplePath(line(0, 0, 0, 120), () => 60), pen: PENS.heavy, start: 0 },
      { path: samplePath(line(0, 120, 60, 120), () => 60), pen: PENS.heavy, start: 200 },
    ],
    [10, 10],
  );
  const g = grow(rec, L2);
  const f = faceOf(g.cells, g.box);
  assert.equal(f.h, 32, 'taller than wide: its height is the face');
  assert.ok(f.w < 32 && f.w >= 8);
  const col = (u) => [...Array(f.h).keys()].reduce((a, v) => a + f.face[v * f.w + u], 0);
  // mirrored: the long stroke (the L's left) is on the face's right
  assert.ok(col(f.w - 1) + col(f.w - 2) > col(0) + col(1), 'mirrored');
  assert.equal(faceOf([], [0, 0, 0, 0]), null);
  assert.deepEqual(faceOf(g.cells, g.box), f, 'anyone makes the same face');
});

test('format 3: strokes may lie further apart than MAX_GAP when wax lands between them (each pause between acts still at most MAX_GAP)', () => {
  const rec = record(
    [
      { path: samplePath(line(0, 0, 60, 0), () => 60), pen: PENS.medium, start: 0 },
      { path: samplePath(line(0, 30, 60, 30), () => 60), pen: PENS.medium, start: 100 },
    ],
    [10, 10],
  );
  const end = rec.strokes[0].t.at(-1);
  rec.strokes[1].t = rec.strokes[1].t.map((v) => v + 90000); // 90 s later: past MAX_GAP
  assert.throws(() => L2.encodeActs(rec), /gap/, 'law 2 keeps its pauses short');
  const marks = [50000, 100000].map((dt) => ({ kind: 'drip', t: end + dt - 10000, x: 300, y: 600, amt: 60000, heat: 100 }));
  const back = L3.decodeCanonical(L3.encodeActs({ ...rec, marks }));
  assert.equal(back.strokes[1].t[0] - back.strokes[0].t.at(-1), rec.strokes[1].t[0] - end);
});
