// One matter (one-matter.md Phases 1-3): one table of what each substance is; every
// surface and thing grown as cells of its matter, a sheet lying on a body paper over its
// cells; ink on anything, settling by each matter's own row. Paper's goldens are untouched
// (goldens.test.js, goldens-v2.test.js, law3.test.js, paper.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { lawOf } from '../laws.js';
import { record, samplePath, PENS, testPaperKey } from '../tools/fixtures.js';
import { MATTER, ORDER, idOf, AIR } from '../matter.js';
import { makeGrower, paperGrower, stackGrower } from '../grow.js';
import * as V1 from '../v1/constants.js';
import * as V2 from '../v2/constants.js';
import { TILE } from '../v1/constants.js';

const L4 = lawOf(4);
const key = testPaperKey('one-matter');
const FAMILY = { grain: 8, weight: 8, tooth: 0 };
const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
// A record's writing grown under law 4 on `matter` (or on a grower), its settled cells.
function grow(rec, { matter = 'paper', paper = null } = {}) {
  const acts = L4.encodeActs(rec);
  const res = L4.grow(L4.decodeCanonical(acts), { paperKey: key, family: { ...FAMILY, matter }, paper });
  const cells = L4.settledCells(res.tiles);
  const box = L4.boxOf(cells);
  return { cells, box, facts: Buffer.from(L4.factsDigest({ cells, box, actsBytes: acts, family: { ...FAMILY, matter } })).toString('hex'), res };
}
const pigment = (c) => c[2] + c[3] + c[4];
const stroke = (x0, y0, x1, y1, ms = 900) => record([{ path: samplePath(line(x0, y0, x1, y1), () => 60, ms), pen: PENS.broad ?? PENS.medium, start: 0 }], [10, 10]);

test('Phase 1: one table, a row a substance; heat in the same rows; paper is today exactly', () => {
  for (const name of ['air', 'water', 'ink', 'paper', 'wood', 'wax', 'plaster', 'metal', 'stone', 'dirt', 'clay', 'grass', 'ash']) {
    assert.ok(MATTER[name], name);
    assert.ok(MATTER[name].heat && 'holds' in MATTER[name].heat, `${name} holds heat`);
    assert.equal(ORDER[idOf(name)], name);
  }
  // matter.md's thresholds
  assert.equal(MATTER.wax.heat.melts, 60);
  assert.equal(MATTER.paper.heat.burns, 233);
  assert.equal(MATTER.wood.heat.burns, 300);
  assert.equal(MATTER.metal.heat.melts, 900);
  assert.equal(MATTER.stone.heat.melts, 1200);
  assert.deepEqual([MATTER.water.heat.melts, MATTER.water.heat.boils], [0, 100]);
  for (const name of ['plaster', 'metal', 'stone']) assert.equal(MATTER[name].heat.burns, null, `${name} does not burn`);
  // paper's ink row is the law's own paper, number for number
  const p = MATTER.paper.ink;
  assert.deepEqual(
    [p.cap, p.capWeight, p.capStep, p.capMin, p.capMax, p.thirst, p.rough, p.thick, p.wear],
    [V1.CAP_BASE, V1.CAP_WEIGHT, V1.CAP_STEP, V1.CAP_MIN, V1.CAP_MAX, V1.SIZ_BASE, V1.Z_SCALE, V2.THICK, V2.STRENGTH_BASE],
  );
  // the wax rule's levels are wax's row (0.4 °C a level above the room's air)
  assert.equal(V2.WAX_MELT, (MATTER.wax.heat.melts - AIR.temp) / 0.4);
  assert.equal(V2.WAX_SOFTEN, Math.round((MATTER.wax.heat.softens - AIR.temp) / 0.4));
  // what a waxy face takes of a nib's ink is law 3's skin of it, exactly
  assert.equal(Math.floor((V1.W_SAT * MATTER.wax.ink.wets) / 1000), V1.W_SAT >> 3);
});

test('Phase 2: every body is cells of its matter; a sheet lying on the table is paper cells over its wood', () => {
  const wood = makeGrower('wood', key);
  const a = wood.tileFields(0, 0),
    b = makeGrower('wood', key).tileFields(0, 0);
  assert.deepEqual(a, b, 'the same key grows the same cells');
  assert.ok(a.mat.every((m) => m === idOf('wood')));
  assert.ok(a.cap.every((c) => c >= MATTER.wood.ink.capMin && c <= MATTER.wood.ink.capMax));
  assert.ok(
    a.link.some((l) => l > 0),
    'wood carries along its grain',
  );
  // its grain: some neighbours carry far more than others (one way, not every way)
  const ways = [0, 1, 2, 3].map((n) => a.link[n]);
  assert.ok(Math.max(...ways) > 3 * Math.min(...ways) || Math.min(...ways) === 0, `along vs across: ${ways}`);
  for (const m of ['plaster', 'wax', 'metal'])
    assert.ok(
      makeGrower(m, key)
        .tileFields(0, 0)
        .link.every((l) => l === 0),
      `${m} has no fibers`,
    );
  assert.ok(
    makeGrower('wax', key)
      .tileFields(0, 0)
      .cap.every((c) => c === 0),
    'wax holds nothing',
  );
  // a sheet lying on the table: paper where it lies, wood elsewhere, no fiber across the edge
  const sheet = { grower: paperGrower(testPaperKey('a sheet'), FAMILY), x0: 8, y0: 0, x1: 40, y1: 40 };
  const desk = stackGrower(wood, [sheet]);
  const f = desk.tileFields(0, 0);
  const at = (x, y) => y * TILE + x;
  assert.equal(f.mat[at(2, 5)], idOf('wood'));
  assert.equal(f.mat[at(10, 5)], idOf('paper'));
  assert.deepEqual(f.cap[at(10, 5)], sheet.grower.tileFields(0, 0).cap[at(2, 5)], "the paper's own cell, from its own corner");
  for (let n = 0; n < 8; n++) assert.equal(f.link[at(8, 5) * 8 + n] * (n >= 3 && n <= 5 ? 1 : 0), 0, 'nothing reaches back across the edge');
});

test("Phase 3: one stroke across the paper onto the table settles by each one's row on each side of the edge", () => {
  const wood = makeGrower('wood', key);
  const sheet = { grower: paperGrower(testPaperKey('a sheet'), FAMILY), x0: 0, y0: 0, x1: 400, y1: 400 };
  // from the sheet's middle, off its right edge (x 400 cells = 2000 tenths) onto the wood
  const rec = stroke(1200, 1000, 2800, 1000, 1600);
  const g = grow(rec, { paper: stackGrower(wood, [sheet]) });
  const onPaper = g.cells.filter((c) => c[18] === idOf('paper') && pigment(c) > 0);
  const onWood = g.cells.filter((c) => c[18] === idOf('wood') && pigment(c) > 0);
  assert.ok(onPaper.length > 20 && onWood.length > 20, `ink on both: paper ${onPaper.length}, wood ${onWood.length}`);
  // paper drinks deep and fast; wood drinks slowly: its front stays shallower
  const depth = (cs) => cs.reduce((n, c) => n + c[7], 0) / cs.length;
  assert.ok(depth(onPaper) > depth(onWood), `front: paper ${depth(onPaper).toFixed(1)}, wood ${depth(onWood).toFixed(1)}`);
  // the same on every machine (and run again)
  assert.equal(grow(rec, { paper: stackGrower(wood, [sheet]) }).facts, g.facts);
});

test('Phase 3: the same stroke on paper, wood, plaster, wax and metal settles five ways; ink beads off wax (no special case)', () => {
  const rec = stroke(400, 400, 1600, 700);
  const runs = Object.fromEntries(['paper', 'wood', 'plaster', 'wax', 'metal'].map((m) => [m, grow(rec, { matter: m })]));
  assert.equal(new Set(Object.values(runs).map((r) => r.facts)).size, 5, 'five matters, five ways');
  for (const [m, r] of Object.entries(runs)) assert.equal(grow(rec, { matter: m }).facts, r.facts, `${m}: the same again`);
  const total = (r) => r.cells.reduce((n, c) => n + pigment(c), 0);
  const deepest = (r) => Math.max(0, ...r.cells.map((c) => c[7]));
  // wax and metal drink nothing: nothing sinks; on wax most of the nib's ink beads off (it takes a skin of it)
  assert.equal(deepest(runs.wax), 0, 'nothing sinks into wax');
  assert.equal(deepest(runs.metal), 0, 'nothing sinks into metal: it dries on top');
  assert.ok(total(runs.wax) < 0.4 * total(runs.paper), `wax sheds it: ${total(runs.wax)} vs ${total(runs.paper)}`);
  assert.ok(total(runs.metal) > total(runs.wax), 'metal takes more of it than wax does');
  // plaster drinks fast (the front deep), wood slowly
  assert.ok(deepest(runs.plaster) >= deepest(runs.wood), `plaster ${deepest(runs.plaster)}, wood ${deepest(runs.wood)}`);
  // what is written on is the record's: its facts say it
  assert.ok(runs.wood.cells.every((c) => c[18] === idOf('wood')));
});

// A nib scrubbed back and forth over a short line, dry (no ink), pressing as hard as `press` (0..255).
const scrub = (press, passes, units = 30) =>
  record(
    [
      {
        path: samplePath(
          (u) => [units * Math.abs(((u * passes) % 2) - 1), 0],
          () => 200,
          { pressure: () => press },
        ),
        pen: { ...PENS.medium, flow: 0 },
        start: 0,
        hasP: true,
      },
    ],
    [10, 10],
  );
const onTable = () => stackGrower(makeGrower('wood', key), [{ grower: paperGrower(testPaperKey('a sheet'), FAMILY), x0: 0, y0: 0, x1: 400, y1: 400 }]);

test('Phase 4: a hard scrape wears through the paper, then cuts the table: fluff, then shavings; every ng accounted for', () => {
  const g = grow(scrub(255, 120), { paper: onTable() });
  const { cuts } = g.res;
  const looseOn = (id) => g.cells.filter((c) => c[20] === id).reduce((n, c) => n + c[19], 0);
  assert.ok(cuts.byMatter[idOf('paper')] > 0, 'paper fluff');
  assert.ok(
    g.cells.some((c) => c[18] === idOf('wood') && c[6] > 0),
    'worn through, the table beneath is dented',
  );
  assert.ok(cuts.byMatter[idOf('wood')] > 0, 'and its shavings');
  // matter is never deleted: what was taken off the cells lies loose, every ng of it
  assert.equal(cuts.removed, cuts.loose);
  assert.equal(
    g.cells.reduce((n, c) => n + c[19], 0),
    cuts.loose,
    'all of it lying on the cells',
  );
  assert.equal(looseOn(idOf('paper')) + looseOn(idOf('wood')), cuts.loose);
});

test('Phase 4: a light scrape leaves only paper fluff; the paper holds', () => {
  const g = grow(scrub(40, 6), { paper: onTable() });
  const { cuts } = g.res;
  assert.ok(cuts.byMatter[idOf('paper')] > 0, 'some fibers come off');
  assert.equal(cuts.byMatter[idOf('wood')] ?? 0, 0, 'nothing of the table');
  assert.ok(
    g.cells.every((c) => c[18] === idOf('paper')),
    'not worn through anywhere',
  );
  assert.equal(cuts.removed, cuts.loose);
});

test('Phase 4: a nib cuts only what is softer than it: metal and stone give the nib nothing', () => {
  for (const m of ['metal', 'stone', 'glass']) {
    const g = grow(scrub(255, 40), { matter: m });
    assert.equal(g.res.cuts.removed, 0, `${m}: nothing comes off`);
  }
  const wax = grow(scrub(255, 40), { matter: 'wax' });
  assert.ok(wax.res.cuts.byMatter[idOf('wax')] > 0, 'wax is cut');
});

test("Phase 4: a tool's own matter is its nib (format 5): a stone cuts wood more than metal does, a stick of wood cuts wood not at all and paper less than a metal nib", () => {
  // the same scrape with a nib of `matter` (law/matter.js ORDER), or the pen's metal
  const by = (tool) => {
    const r = scrub(255, 40);
    if (tool) r.strokes[0].pens[0].matter = idOf(tool);
    return r;
  };
  const on = (tool, matter) => grow(by(tool), { matter }).res.cuts;
  const metal = on(null, 'wood'),
    stone = on('stone', 'wood'),
    stick = on('wood', 'wood');
  assert.ok(stone.removed > metal.removed && metal.removed > 0, `the harder the tool, the more: stone ${stone.removed}, metal ${metal.removed}`);
  assert.equal(stick.removed, 0, 'wood takes nothing off wood');
  const paperByStick = on('wood', 'paper'),
    paperByMetal = on(null, 'paper');
  assert.ok(paperByStick.removed > 0 && paperByStick.removed < paperByMetal.removed, 'a stick wears paper, less than a metal nib');
  // the record: format 5 only when a nib says its matter; without, the bytes as they always were
  assert.equal(L4.encodeActs(by('stone'))[4], 5);
  assert.ok(L4.encodeActs(by(null))[4] < 5);
  assert.deepEqual(L4.decodeCanonical(L4.encodeActs(by('stone'))).strokes[0].pens[0].matter, idOf('stone'));
  assert.throws(() => lawOf(3).decodeCanonical(L4.encodeActs(by('stone'))), /format/, 'law 3 does not take it');
});

// Water poured from a vessel onto one spot: a pour mark every 50 ms for `ms`.
const pour = (ms, amt = 10000) => ({ orgX: 10, orgY: 10, strokes: [], marks: Array.from({ length: ms / 50 }, (_, k) => ({ kind: 'pour', t: k * 50, x: 400, y: 2000, amt })) });
// Dirt lying flat, or falling toward +x: 100 height units a cell (about 38°: at the law's grain, a
// cell is 77 µm, well under water's capillary length, so only a steep slope outweighs its surface)
const ground = (tilt) => makeGrower('dirt', key, { tilt: [tilt, 0], at: 60000 });

test('Phase 6: water poured on a slope of dirt cuts where it runs and lays a fan where it slows; every grain kept; the same everywhere', () => {
  const run = (tilt) => grow(pour(4000), { matter: 'dirt', paper: ground(tilt) });
  const bed = (c) => c[21];
  // how far downhill (+x, cells) the grains the water lifted went, on the whole: Σ x · rise over Σ rise
  const moved = (g) => g.cells.reduce((n, c) => n + c[1] * bed(c), 0) / g.cells.reduce((n, c) => n + Math.max(0, bed(c)), 0);
  const g = run(-100);
  const cut = g.cells.filter((c) => bed(c) < 0).length;
  const laid = g.cells.filter((c) => bed(c) > 0).length;
  assert.ok(cut > 10, `cut: ${cut} cells`);
  assert.ok(laid > 10, `laid down: ${laid} cells`);
  // on the slope what the water lifted where it ran is laid down downhill, where it slowed
  // on the slope what the water lifted where it ran is laid down downhill, where it slowed; the
  // steeper, the farther. On flat ground the same pour heaps it all round (a crater and its rim)
  const flat = moved(run(0)),
    steep = moved(run(-200));
  assert.ok(Math.abs(flat) < 0.15, `on flat ground the grains went ${flat.toFixed(2)} cells`);
  assert.ok(moved(g) > 0.25, `on the slope ${moved(g).toFixed(2)} cells downhill`);
  assert.ok(steep > moved(g), `steeper, farther: ${steep.toFixed(2)}`);
  // grains only move: what left the bed is what was laid down again
  assert.equal(
    g.cells.reduce((n, c) => n + bed(c), 0),
    0,
  );
  assert.equal(run(-100).facts, g.facts, 'the same pour, the same ground');
});
