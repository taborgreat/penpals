// Paper (law/paper.js): thin rectangles of paper matter, each its owner's, its whole life on its own chain.
// Who may mark it is read from its chain: its owner; anyone whose name is pressed into wax on it; the being
// whose house it lies in, while it rests on their table. Anyone takes it up where it lies; the hand holding it
// lets it go anywhere (it falls flat), posts it (it is theirs then) or saves it into its owner's book.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys as K, b64url } from '../index.js';
import { lawOf } from '../laws.js';
import { record, samplePath } from '../tools/fixtures.js';
import { makePaper, makePaperAct, makeSurface, checkBirth, replay, compose, growPaper, startState, refusal, apply, lawFor, LIFT_WINDOW, SURFACES, PAPER_LAW } from '../paper.js';
import { HOUSE } from '../room.js';
import { WATER, TORN } from '../v2/constants.js';
import { idOf } from '../matter.js';

const L = lawOf(2);
const keyOf = (n) => {
  const sk = K.skFromK(new Uint8Array(32).fill(n));
  return { sk, pk: K.publicKeyOf(sk), id: b64url(K.publicKeyOf(sk)) };
};
const ana = keyOf(61),
  bo = keyOf(62),
  cy = keyOf(63);
const FAMILY = { grain: 8, weight: 8, tooth: 0 };
const PAPER = 'sabcdefghijklmnopqrstuvwxyz';
const RED = { nib: 0, size: 60, flex: 0, flow: 10, rgb: [200, 30, 30], angle: 0 };
const BLUE = { nib: 0, size: 60, flex: 0, flow: 10, rgb: [30, 40, 200], angle: 0 };
// every house's table (m), and the ground outside
const ctx = { table: { x0: 1, x1: 2.4, y0: 2, y1: 2.75, top: 0.74 }, ground: (x) => 0.1 + x / 100 };
const ON_TABLE = [1.5, 2.4, 0.9],
  ON_FLOOR = [0.5, 0.5, 1];
const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
// One stroke as its writer's device encodes it (the paper's own frame: origin 0, 0).
const strokeBytes = (from, to, pen) => {
  const r = record([{ path: samplePath(line(...from, ...to), () => 40), pen, start: 0 }], [0, 0]);
  r.orgX = Math.min(from[0], to[0]);
  r.orgY = Math.min(from[1], to[1]);
  r.strokes[0].x = r.strokes[0].x.map((v) => v - 50);
  r.strokes[0].y = r.strokes[0].y.map((v) => v - 50);
  return L.encodeActs(r);
};
const born = makePaper({ sk: ana.sk, pk: ana.pk, paper: PAPER, family: FAMILY, at: ON_TABLE });
const { seed } = checkBirth(born.birth, born);
// The stamper: acts in, each checked against the chain so far, given its place and moment.
function stamper(birth = born.birth) {
  let state = startState(birth, ctx);
  const lines = [];
  const k = {};
  return {
    lines,
    state: () => state,
    act(who, act, at, extra = {}) {
      k[who.id] = (k[who.id] ?? 0) + 1;
      const made = makePaperAct({ sk: who.sk, pk: who.pk, paper: PAPER, k: k[who.id], act, ...extra });
      const why = refusal(state, made.act);
      if (why) {
        k[who.id]--;
        return why;
      }
      const stamped = { n: lines.length + 1, at, ...made };
      state = apply(state, stamped);
      lines.push(stamped);
      return null;
    },
  };
}
const facts = (lines, law = PAPER_LAW) => b64url(growPaper(lines, { seed, family: FAMILY, law }).facts);
const mark = (s, who, at, y = 20, pen = BLUE) => s.act(who, 'stroke', at, { stroke: strokeBytes([20, y], [60, y], pen) });
// carried by `who` and let go in a space at a place
const carry = (s, who, at, space, place) => s.act(who, 'take', at) ?? s.act(who, 'put', at + 1, { space, at: place });

test("a paper is its owner's, born on their table, open from birth: everyone writing on it grows the same paper", () => {
  assert.deepEqual(K.paperKeyOf(seed), K.paperKeyOf(K.sheetSeed(ana.sk, PAPER)));
  assert.throws(() => checkBirth(born.birth, { ...born, open: { ...born.open, seed: b64url(K.sheetSeed(bo.sk, PAPER)) } }), /paper/);
  assert.throws(() => checkBirth({ ...born.birth, key: bo.id }, born));
  assert.deepEqual(startState(born.birth, ctx).where, { space: ana.id, at: [1500, 2400, 740] }, 'lying on her table, where it fell');
});

test('who may mark it: its owner; the being whose table it rests on, while it does; no one while it is in a hand', () => {
  const s = stamper();
  assert.equal(mark(s, ana, 1000), null, 'the owner writes on her own');
  assert.match(mark(s, bo, 1100), /may not mark/);
  assert.equal(carry(s, ana, 1200, bo.id, ON_TABLE), null, "carried to bo's house, set on his table");
  assert.equal(mark(s, bo, 1300, 30), null, 'on his table: he writes');
  assert.match(mark(s, cy, 1400, 40), /may not mark/, "not cy's");
  assert.equal(mark(s, ana, 1500, 50, RED), null, 'its owner, wherever it lies');
  assert.equal(carry(s, bo, 1600, bo.id, ON_FLOOR), null, 'anyone takes up a paper where it lies; on his floor now');
  assert.deepEqual(s.state().where.at, [500, 500, 0], 'it fell to the floor');
  assert.match(mark(s, bo, 1700, 60), /may not mark/, 'off his table: no longer');
  assert.equal(s.act(cy, 'take', 1800), null);
  assert.match(mark(s, ana, 1900, 60), /not lying/, 'in a hand: no one marks it');
  assert.match(s.act(bo, 'put', 1950, { space: bo.id, at: ON_TABLE }), /not in your hand/, 'only the hand holding it lets it go');
  assert.equal(s.act(cy, 'put', 2000, { space: 'outside', at: [3, 4, 2] }), null, 'outside');
  assert.deepEqual(s.state().where.at, [3000, 4000, 130], 'on the ground there');
  assert.match(mark(s, cy, 2100, 70), /may not mark/, 'no table outside');
  assert.deepEqual(replay(born.birth, s.lines, { ctx }).problems, []);
  const forged = [...s.lines, { n: s.lines.length + 1, at: 6000, ...makePaperAct({ sk: bo.sk, pk: bo.pk, paper: PAPER, k: 9, act: 'stroke', stroke: strokeBytes([0, 0], [9, 9], BLUE) }) }];
  assert.ok(replay(born.birth, forged, { ctx }).problems.some((p) => /may not mark/.test(p)));
  const stolen = s.lines.map((l, i) => (i === 0 ? { ...l, seal: s.lines[1].seal } : l));
  assert.ok(replay(born.birth, stolen, { ctx }).problems.some((p) => /seal/.test(p)));
});

// A seal's face (a ring and a cross).
const FACE = new Uint8Array(32 * 32).map((_, i) => {
  const u = i % 32,
    v = Math.floor(i / 32);
  const r = Math.hypot(u - 15.5, v - 15.5);
  return (r > 11 && r < 14) || Math.abs(u - 15.5) < 2 || Math.abs(v - 15.5) < 2 ? 255 : 0;
});
const pressFor = (who) => ({ x: 2000, y: 2000, depth: 220, angle: 0, tiltX: 0, tiltY: 0, cell: 2, w: 32, h: 32, face: FACE, for: who.id });

test('a seal: its owner presses someone’s name into it (however it came out: into cold wax too), and they may mark it wherever it lies; broken, they may not', () => {
  const s = stamper();
  assert.match(s.act(bo, 'press', 1000, { press: pressFor(bo) }), /only its owner/);
  assert.equal(s.act(ana, 'press', 1100, { press: pressFor(bo) }), null, 'no wax under it: still his name pressed');
  const pressed = s.lines.length;
  assert.equal(mark(s, bo, 1200), null, 'on her table, by his seal');
  assert.equal(carry(s, ana, 1300, 'outside', [1, 1, 1]), null);
  assert.equal(mark(s, bo, 1400, 30), null, 'outside too');
  assert.match(mark(s, cy, 1500, 40), /may not mark/, 'no seal of hers');
  assert.equal(s.act(ana, 'break', 2000, { broke: { seal: pressed, from: [1850, 1900], to: [2150, 2100] } }), null);
  assert.match(mark(s, bo, 2100, 50), /may not mark/, 'broken: no longer');
  assert.match(s.act(ana, 'break', 2200, { broke: { seal: pressed, from: [1850, 1900], to: [2150, 2100] } }), /no such seal/);
  assert.deepEqual(replay(born.birth, s.lines, { ctx }).problems, []);
  assert.throws(() => makePaperAct({ sk: ana.sk, pk: ana.pk, paper: PAPER, k: 99, act: 'drip', drip: {} }), /not an act on a paper/, 'no one writes a drip');
  assert.throws(() => makePaperAct({ sk: ana.sk, pk: ana.pk, paper: PAPER, k: 99, act: 'press', press: { ...pressFor(bo), w: 31 } }), /size/);
});

test("a letter: posted from the hand into someone's mailbox it is theirs; only they take it out; there no one marks it", () => {
  const s = stamper();
  assert.equal(mark(s, ana, 1000), null);
  assert.match(s.act(ana, 'post', 1100, { to: bo.id }), /not in your hand/, 'posted from the hand');
  assert.equal(s.act(ana, 'take', 1200), null);
  assert.equal(s.act(ana, 'post', 1300, { to: bo.id }), null, "into bo's mailbox");
  assert.deepEqual([s.state().owner, s.state().where], [bo.id, { box: bo.id }], 'his now');
  assert.match(mark(s, ana, 1400, 30), /not lying/);
  assert.match(s.act(cy, 'take', 1500), /not in your mailbox/);
  assert.match(s.act(ana, 'take', 1550), /not in your mailbox/, 'not even who sent it');
  assert.equal(s.act(bo, 'take', 1600), null, 'he takes it out');
  assert.equal(s.act(bo, 'put', 1700, { space: bo.id, at: ON_TABLE }), null);
  assert.equal(mark(s, bo, 1800, 40), null, 'his to write on');
  assert.equal(carry(s, bo, 1900, ana.id, ON_TABLE), null);
  assert.equal(mark(s, ana, 2000, 50), null, 'his paper, resting on her table: she may write on it while it does');
  assert.equal(carry(s, bo, 2100, bo.id, ON_FLOOR), null);
  assert.match(mark(s, ana, 2200, 60), /may not mark/, 'she gave it away: off her table, not hers');
  assert.deepEqual(replay(born.birth, s.lines, { ctx }).problems, []);
});

test('a book: its owner saves a paper from the hand into their book, at a path; only they take it out; no one marks it there', () => {
  const s = stamper();
  assert.equal(s.act(ana, 'take', 1000), null);
  assert.match(s.act(bo, 'shelve', 1050, { book: ['letters'] }), /not in your hand/);
  assert.equal(s.act(ana, 'shelve', 1100, { book: ['journal', 'october'] }), null);
  assert.deepEqual(s.state().where, { book: ['journal', 'october'] });
  assert.match(mark(s, ana, 1200), /not lying/);
  assert.match(s.act(bo, 'take', 1300), /owner’s book/);
  assert.equal(s.act(ana, 'take', 1400), null, 'out of her book, into her hand');
  assert.equal(carry(s, bo, 1500, bo.id, ON_TABLE) ?? null, 'it is in a hand already', 'in her hand, no one else takes it');
  assert.throws(() => makePaperAct({ sk: ana.sk, pk: ana.pk, paper: PAPER, k: 9, act: 'shelve', book: [] }), /path/);
});

test("order: every screen ends byte-identical to the stamper's order, whatever it guessed", () => {
  const red = strokeBytes([20, 20], [60, 30], RED),
    blue = strokeBytes([20, 30], [60, 20], BLUE);
  const s1 = stamper();
  carry(s1, ana, 10, bo.id, ON_TABLE);
  s1.act(ana, 'stroke', 1000, { stroke: red });
  s1.act(bo, 'stroke', 1010, { stroke: blue });
  const s2 = stamper();
  carry(s2, ana, 10, bo.id, ON_TABLE);
  s2.act(bo, 'stroke', 1000, { stroke: blue });
  s2.act(ana, 'stroke', 1010, { stroke: red });
  const stamped = facts(s1.lines);
  assert.equal(facts(JSON.parse(JSON.stringify(s1.lines))), stamped);
  assert.notEqual(facts(s2.lines), stamped, 'the order is part of the ink: mixing depends on it');
  const rec = compose(s1.lines);
  assert.ok(rec.strokes[1].t[0] >= rec.strokes[0].t.at(-1));
});

test('lift: red over blue lifted leaves the blue as pushed, the same soak and dents, no red anywhere', () => {
  const s = stamper();
  carry(s, ana, 10, bo.id, ON_TABLE);
  s.act(bo, 'stroke', 1000, { stroke: strokeBytes([20, 25], [70, 25], BLUE) });
  s.act(ana, 'stroke', 1100, { stroke: strokeBytes([20, 25], [70, 25], RED) });
  const before = growPaper(s.lines, { seed, family: FAMILY, law: PAPER_LAW });
  const redN = s.lines.at(-1).n;
  assert.match(s.act(bo, 'lift', 5000, { lift: redN }), /only its writer/);
  assert.equal(s.act(ana, 'lift', 5000, { lift: redN }), null);
  const after = growPaper(s.lines, { seed, family: FAMILY, law: PAPER_LAW });
  const byCell = (st) => new Map(st.cells.map((c) => [`${c[0]},${c[1]}`, c]));
  const b = byCell(before),
    a = byCell(after);
  assert.equal(a.size, b.size);
  for (const [k, c] of b) for (const f of [6, 7, 9, 10, 11, 12]) assert.equal(a.get(k)[f], c[f], `cell ${k} field ${f}`);
  const ra = compose(s.lines);
  assert.deepEqual(ra.strokes[1].pens[0].rgb, [...WATER]);
});

test("the undo window: a stroke older than the writer's last few cannot be lifted", () => {
  const s = stamper();
  for (let i = 0; i < LIFT_WINDOW + 1; i++) s.act(ana, 'stroke', 1000 + i * 500, { stroke: strokeBytes([10, 10 + i * 4], [40, 10 + i * 4], BLUE) });
  assert.match(s.act(ana, 'lift', 9000, { lift: 1 }), /too old/);
  assert.equal(s.act(ana, 'lift', 9100, { lift: 2 }), null);
  assert.match(s.act(ana, 'lift', 9200, { lift: 2 }), /already/);
});

test('goldens: the fixture paper, and the same with a lift, grow to the facts they always have (the same ink law)', () => {
  const s = stamper();
  carry(s, ana, 5, bo.id, ON_TABLE);
  s.act(bo, 'stroke', 1000, { stroke: strokeBytes([20, 25], [70, 25], BLUE) });
  s.act(ana, 'stroke', 1100, { stroke: strokeBytes([20, 22], [70, 30], RED) });
  s.act(bo, 'stroke', 2600, { stroke: strokeBytes([30, 10], [30, 45], BLUE) });
  const whole = facts(s.lines, 4);
  s.act(ana, 'lift', 4000, { lift: 4 });
  const lifted = facts(s.lines, 4);
  assert.notEqual(whole, lifted);
  assert.deepEqual({ whole, lifted }, GOLDEN);
  // law 5 grows ink with no oak gall in it exactly as law 4 did: the same cells, only the law it names
  const cells = (law) => JSON.stringify(growPaper(s.lines, { seed, family: FAMILY, law }).cells);
  assert.equal(cells(5), cells(4));
});
const GOLDEN = { whole: 'AWfeGnVf4AtRh1JJoFN00aJeo0w-EaoqilZ6udwU4vU', lifted: '5cNK_AmGcw9EfnYkgbn2X0i0lo1F4cQapkezrhPMbUM' }; // a change to them is a change of the law (law 4: 2026-10-25)

test("a hard dry scrape wears a paper through, its fibres shed as fluff; on the table's wood the same scrape cuts it, its shavings loose (law 4: matter worn away)", () => {
  // back and forth over one place, forty times, pressed hard, the nib dry (a dry pen: no ink)
  const r = record(
    [
      {
        path: samplePath(
          (u) => [20 + 30 * Math.abs(((u * 40) % 2) - 1), 20],
          () => 30,
          { pressure: () => 1 },
        ),
        pen: { ...BLUE, flow: 0 },
        start: 0,
        hasP: true,
      },
    ],
    [0, 0],
  );
  r.orgX = 20;
  r.orgY = 20;
  r.strokes[0].x = r.strokes[0].x.map((v) => v - 50);
  r.strokes[0].y = r.strokes[0].y.map((v) => v - 50);
  const scrape = L.encodeActs(r);
  const s = stamper();
  assert.equal(s.act(ana, 'stroke', 1000, { stroke: scrape }), null);
  const g = growPaper(s.lines, { seed, family: FAMILY, law: PAPER_LAW });
  assert.ok(g.cells.filter((c) => c[11] & TORN).length > 0, 'worn through');
  assert.ok(g.cuts.byMatter[idOf('paper')] > 0, 'its fibres shed');
  assert.equal(g.cuts.removed, g.cuts.loose, 'nothing deleted: all of it lies loose');
  const table = makeSurface({ sk: ana.sk, pk: ana.pk, paper: PAPER, surface: 'table' });
  const t = stamper(table.birth);
  assert.equal(t.act(ana, 'stroke', 1000, { stroke: scrape }), null);
  const tg = growPaper(t.lines, { seed: checkBirth(table.birth, table).seed, family: table.birth.family, law: lawFor(table.birth) });
  assert.ok(tg.cuts.byMatter[idOf('wood')] > 0, 'shavings of its wood');
  assert.equal(tg.cuts.byMatter[idOf('paper')] ?? 0, 0, 'and no paper of it');
  assert.equal(tg.cells.filter((c) => c[11] & TORN).length, 0, 'wood is cut into, not torn');
});

test("a house's wall is matter too: its owner's, where it is for good; its owner marks it, no one else; nothing takes it up; its ink grows on plaster (law 4)", () => {
  const wall = makeSurface({ sk: ana.sk, pk: ana.pk, paper: PAPER, surface: 'wall-left' });
  assert.equal(checkBirth(wall.birth, wall).owner, ana.id);
  assert.deepEqual(wall.birth.family, { grain: 0, weight: 15, tooth: 0, matter: 'plaster' });
  assert.deepEqual(wall.birth.size, SURFACES['wall-left'].size);
  assert.equal(lawFor(wall.birth), PAPER_LAW, 'born under the law of now, and grown under it for good');
  assert.throws(() => checkBirth({ ...wall.birth, law: 3 }, wall), /not a law a paper is born under/);
  assert.throws(() => checkBirth({ ...wall.birth, size: [10, 10] }, wall), /as houses are made/, 'a wall is the size walls are');
  assert.throws(() => makeSurface({ sk: ana.sk, pk: ana.pk, paper: PAPER, surface: 'roof' }), /not a surface/);
  const pen = makeSurface({ sk: ana.sk, pk: ana.pk, paper: PAPER, surface: 'pen' }); // (its body's top face: rooms.md §3c)
  assert.equal(pen.birth.family.matter, 'wood');
  assert.deepEqual(pen.birth.size, [Math.round((HOUSE.pen.length * 1400) / 0.2159), Math.round((HOUSE.pen.thick * 1400) / 0.2159)]);
  const s = stamper(wall.birth);
  assert.deepEqual(s.state().where, { space: ana.id, surface: 'wall-left' });
  assert.equal(s.act(bo, 'take', 100), 'it is part of its house');
  assert.equal(s.act(ana, 'take', 110), 'it is part of its house');
  assert.equal(mark(s, ana, 200), null, 'its owner writes on it');
  assert.match(mark(s, bo, 300), /may not mark/, 'not a visitor');
  const grown = growPaper(s.lines, { seed: checkBirth(wall.birth, wall).seed, family: wall.birth.family, law: lawFor(wall.birth) });
  assert.ok(grown.cells.length > 0, 'ink on the plaster');
  const asPaper = growPaper(s.lines, { seed: checkBirth(wall.birth, wall).seed, family: FAMILY, law: lawFor(wall.birth) });
  assert.notEqual(b64url(grown.facts), b64url(asPaper.facts), 'on plaster it is not as on paper');
});

test('a breath across a paper blows what lies loose on it along it, as far as the jet carries it; nothing is lost (law 5)', () => {
  // the same hard dry scrape: its fibres lie loose where it wore
  const r = record(
    [
      {
        path: samplePath(
          (u) => [20 + 30 * Math.abs(((u * 40) % 2) - 1), 20],
          () => 30,
          { pressure: () => 1 },
        ),
        pen: { ...BLUE, flow: 0 },
        start: 0,
        hasP: true,
      },
    ],
    [0, 0],
  );
  const s = stamper();
  assert.equal(s.act(ana, 'stroke', 1000, { stroke: L.encodeActs(r) }), null);
  const before = growPaper(s.lines, { seed, family: FAMILY, law: PAPER_LAW });
  const loose = (g) => g.cells.filter((c) => c[19] > 0);
  const sum = (cells) => cells.reduce((n, c) => n + c[19], 0);
  const meanX = (cells) => cells.reduce((n, c) => n + c[1] * c[19], 0) / sum(cells);
  assert.ok(sum(loose(before)) > 0, 'fluff lies loose');
  // blown along it, toward +x, from its left edge, the mouth 20 cm off
  assert.equal(s.act(ana, 'blow', 9000, { blow: { x: 0, y: 200, dir: 0, dist: 200 } }), null);
  const after = growPaper(s.lines, { seed, family: FAMILY, law: PAPER_LAW });
  assert.equal(sum(loose(after)), sum(loose(before)), 'every ng of it still lies somewhere');
  assert.ok(meanX(loose(after)) > meanX(loose(before)) + 20, `carried downwind: from x ${meanX(loose(before)).toFixed(0)} to ${meanX(loose(after)).toFixed(0)} (cells)`);
  assert.ok(after.cuts.blown > 0);
  // the other way, off its edge: nothing moves (the jet does not reach back)
  const t = stamper();
  t.act(ana, 'stroke', 1000, { stroke: L.encodeActs(r) });
  t.act(ana, 'blow', 9000, { blow: { x: 0, y: 200, dir: 180, dist: 200 } });
  const up = loose(growPaper(t.lines, { seed, family: FAMILY, law: PAPER_LAW }));
  assert.equal(sum(up), sum(loose(before)));
  assert.deepEqual(
    up.map((c) => c[19]),
    loose(before).map((c) => c[19]),
    'the same fluff where it was',
  );
});
