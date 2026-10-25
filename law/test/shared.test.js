// Writing together (rooms.md §5, §6): a shared sheet's acts, its possession,
// its order, and lift. Goldens pin what a fixture sheet grows to.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys as K, b64url } from '../index.js';
import { lawOf } from '../laws.js';
import { record, samplePath } from '../tools/fixtures.js';
import { makeSharedSheet, makeSharedAct, checkBirth, replay, compose, growShared, startState, refusal, apply, LIFT_WINDOW } from '../shared.js';
import { WATER } from '../v2/constants.js';

const L = lawOf(2);
const keyOf = (n) => {
  const sk = K.skFromK(new Uint8Array(32).fill(n));
  return { sk, pk: K.publicKeyOf(sk), id: b64url(K.publicKeyOf(K.skFromK(new Uint8Array(32).fill(n)))) };
};
const ana = keyOf(61),
  bo = keyOf(62),
  cy = keyOf(63);
const FAMILY = { grain: 8, weight: 8, tooth: 0 };
const SHEET = 'sabcdefghijklmnopqrstuvwxyz';
const RED = { nib: 0, size: 60, flex: 0, flow: 10, rgb: [200, 30, 30], angle: 0 };
const BLUE = { nib: 0, size: 60, flex: 0, flow: 10, rgb: [30, 40, 200], angle: 0 };
const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
// One stroke as its writer's device encodes it (the sheet's own frame: origin 0, 0).
const strokeBytes = (from, to, pen) => {
  const r = record([{ path: samplePath(line(...from, ...to), () => 40), pen, start: 0 }], [0, 0]);
  // record() sets its own corner; put the stroke back where it was drawn on the sheet
  r.orgX = Math.min(from[0], to[0]);
  r.orgY = Math.min(from[1], to[1]);
  r.strokes[0].x = r.strokes[0].x.map((v) => v - 50);
  r.strokes[0].y = r.strokes[0].y.map((v) => v - 50);
  return L.encodeActs(r);
};
const birth = makeSharedSheet({ sk: ana.sk, pk: ana.pk, sheet: SHEET, family: FAMILY });
const { seed } = checkBirth(birth.birth, birth);
// The stamper: acts in, each checked against the chain so far, given its place and moment.
function stamper(owner, ctx = null) {
  let state = startState(owner, ctx);
  const lines = [];
  let k = {};
  return {
    lines,
    act(who, act, at, extra = {}) {
      k[who.id] = (k[who.id] ?? 0) + 1;
      const made = makeSharedAct({ sk: who.sk, pk: who.pk, sheet: SHEET, k: k[who.id], act, ...extra });
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
const facts = (lines) => b64url(growShared(lines, { seed, family: FAMILY }).facts);

test("a shared sheet is its owner's, open from birth: everyone writing on it grows the same paper", () => {
  assert.deepEqual(K.paperKeyOf(seed), K.paperKeyOf(K.sheetSeed(ana.sk, SHEET)));
  assert.throws(() => checkBirth(birth.birth, { ...birth, open: { ...birth.open, seed: b64url(K.sheetSeed(bo.sk, SHEET)) } }), /paper/);
  assert.throws(() => checkBirth({ ...birth.birth, key: bo.id }, birth));
});

test('possession: only on your table may you write; the owner picks it up and you stop', () => {
  const s = stamper(ana.id);
  assert.equal(s.act(ana, 'stroke', 1000, { stroke: strokeBytes([20, 20], [60, 20], RED) }), null, 'the owner writes on their own');
  assert.match(s.act(bo, 'stroke', 2000, { stroke: strokeBytes([20, 30], [60, 30], BLUE) }), /not on your table/);
  assert.match(s.act(bo, 'move', 2100, { to: bo.id }), /only the owner/);
  assert.equal(s.act(ana, 'move', 2200, { to: bo.id }), null, "laid on bo's table");
  assert.equal(s.act(bo, 'stroke', 3000, { stroke: strokeBytes([20, 30], [60, 30], BLUE) }), null);
  assert.match(s.act(cy, 'stroke', 3100, { stroke: strokeBytes([20, 40], [60, 40], BLUE) }), /not on your table/, "not cy's");
  assert.equal(s.act(ana, 'stroke', 3200, { stroke: strokeBytes([20, 50], [60, 50], RED) }), null, 'the owner may still write on it');
  assert.equal(s.act(ana, 'move', 4000, { to: ana.id }), null, 'picked up again');
  assert.match(s.act(bo, 'stroke', 5000, { stroke: strokeBytes([20, 60], [60, 60], BLUE) }), /not on your table/, "the visitor's next act is refused");
  assert.match(s.act(bo, 'lift', 5100, { lift: 3 }), /not on your table/, 'a lift is a writing act too: possession first');
  // a verifier replays the very same rule from the chain
  const v = replay(ana.id, s.lines);
  assert.deepEqual(v.problems, []);
  assert.equal(v.state.table, ana.id);
  // and catches a stroke stamped where it was not allowed, or not sealed by its writer
  const forged = [...s.lines, { n: s.lines.length + 1, at: 6000, ...makeSharedAct({ sk: bo.sk, pk: bo.pk, sheet: SHEET, k: 9, act: 'stroke', stroke: strokeBytes([0, 0], [9, 9], BLUE) }) }];
  assert.ok(replay(ana.id, forged).problems.some((p) => /not on your table/.test(p)));
  const stolen = s.lines.map((l, i) => (i === 0 ? { ...l, seal: s.lines[1].seal } : l));
  assert.ok(replay(ana.id, stolen).problems.some((p) => /seal/.test(p)));
});

test("order: every screen ends byte-identical to the stamper's order, whatever it guessed", () => {
  // two writers into the same wet spot within the same moment
  const red = strokeBytes([20, 20], [60, 30], RED),
    blue = strokeBytes([20, 30], [60, 20], BLUE);
  const s1 = stamper(ana.id);
  s1.act(ana, 'move', 10, { to: bo.id });
  s1.act(ana, 'stroke', 1000, { stroke: red });
  s1.act(bo, 'stroke', 1010, { stroke: blue });
  const s2 = stamper(ana.id);
  s2.act(ana, 'move', 10, { to: bo.id });
  s2.act(bo, 'stroke', 1000, { stroke: blue });
  s2.act(ana, 'stroke', 1010, { stroke: red });
  const stamped = facts(s1.lines);
  // a screen that guessed the other order regrows from the stamper's: the same
  assert.equal(facts(JSON.parse(JSON.stringify(s1.lines))), stamped);
  assert.notEqual(facts(s2.lines), stamped, 'the order is part of the ink: mixing depends on it');
  // overlapping strokes are one after the other on the sheet
  const rec = compose(s1.lines);
  assert.ok(rec.strokes[1].t[0] >= rec.strokes[0].t.at(-1));
});

test('lift: red and blue mixed to purple; red lifted leaves blue as pushed, with the same soak and dents, and no red anywhere', () => {
  const s = stamper(ana.id);
  s.act(ana, 'move', 10, { to: bo.id });
  s.act(bo, 'stroke', 1000, { stroke: strokeBytes([20, 25], [70, 25], BLUE) });
  s.act(ana, 'stroke', 1100, { stroke: strokeBytes([20, 25], [70, 25], RED) }); // over the wet blue: purple
  const before = growShared(s.lines, { seed, family: FAMILY });
  const redN = s.lines.at(-1).n;
  assert.match(s.act(bo, 'lift', 5000, { lift: redN }), /only its writer/, "nobody lifts another's stroke");
  assert.equal(s.act(ana, 'lift', 5000, { lift: redN }), null);
  const after = growShared(s.lines, { seed, family: FAMILY });
  // the water it brought and what it did stay: the same dents, soak, depth, wear, cockle, cell for cell
  const byCell = (st) => new Map(st.cells.map((c) => [`${c[0]},${c[1]}`, c]));
  const b = byCell(before),
    a = byCell(after);
  assert.equal(a.size, b.size);
  for (const [k, c] of b) {
    const d = a.get(k);
    assert.ok(d, `cell ${k}`);
    for (const f of [6, 7, 9, 10, 11, 12]) assert.equal(d[f], c[f], `cell ${k} field ${f}`);
  }
  // no red anywhere: what is left drinks as blue does (much red, little blue light), unlike the purple
  const ratio = (st) =>
    st.cells.reduce((t, c) => t + c[4], 0) /
    Math.max(
      1,
      st.cells.reduce((t, c) => t + c[2], 0),
    );
  const blueRatio = Math.log(255 / 200) / Math.log(255 / 30);
  assert.ok(ratio(before) > 3 * blueRatio, `purple drinks blue light: ${ratio(before).toFixed(2)}`);
  assert.ok(Math.abs(ratio(after) - blueRatio) < 0.05, `after the lift, blue's own: ${ratio(after).toFixed(3)} (blue ${blueRatio.toFixed(3)})`);
  // the lifted stroke is the same stroke as water: the other writer's strokes unchanged in time
  const rb = compose(s.lines.slice(0, 3)),
    ra = compose(s.lines);
  assert.deepEqual(ra.strokes[0].t, rb.strokes[0].t);
  assert.deepEqual(ra.strokes[1].t, rb.strokes[1].t);
  assert.deepEqual(ra.strokes[1].pens[0].rgb, [...WATER]);
});

test("the undo window: a stroke older than the writer's last few cannot be lifted (its pigment has merged)", () => {
  const s = stamper(ana.id);
  for (let i = 0; i < LIFT_WINDOW + 1; i++) s.act(ana, 'stroke', 1000 + i * 500, { stroke: strokeBytes([10, 10 + i * 4], [40, 10 + i * 4], BLUE) });
  assert.match(s.act(ana, 'lift', 9000, { lift: 1 }), /too old/);
  assert.equal(s.act(ana, 'lift', 9100, { lift: 2 }), null, 'the oldest still in the window');
  assert.match(s.act(ana, 'lift', 9200, { lift: 2 }), /already/);
});

test('goldens: the fixture sheet, and the same with a lift, grow to these facts', () => {
  const s = stamper(ana.id);
  s.act(ana, 'move', 10, { to: bo.id });
  s.act(bo, 'stroke', 1000, { stroke: strokeBytes([20, 25], [70, 25], BLUE) });
  s.act(ana, 'stroke', 1100, { stroke: strokeBytes([20, 22], [70, 30], RED) });
  s.act(bo, 'stroke', 2600, { stroke: strokeBytes([30, 10], [30, 45], BLUE) });
  const whole = facts(s.lines);
  s.act(ana, 'lift', 4000, { lift: 3 });
  const lifted = facts(s.lines);
  assert.notEqual(whole, lifted);
  assert.deepEqual({ whole, lifted }, GOLDEN);
});
const GOLDEN = { whole: 'UHOb0Jfup4cU9H2DopjM0wLDIKIHTn32z8Vk3EEqKXk', lifted: 'emWeKGwJ3bU-TOkWquGwMzhQY1wzIR096ZlqfjTkSlo' }; // recorded with this layer: a change to them is a change of the law

// A seal's face (a ring and a cross) and a pool of hot wax about a point (tenths of the sheet's units).
const FACE = new Uint8Array(32 * 32).map((_, i) => {
  const u = i % 32,
    v = Math.floor(i / 32);
  const r = Math.hypot(u - 15.5, v - 15.5);
  return (r > 11 && r < 14) || Math.abs(u - 15.5) < 2 || Math.abs(v - 15.5) < 2 ? 255 : 0;
});
const POOL = [
  [0, 0],
  [120, 0],
  [-120, 0],
  [0, 120],
  [0, -120],
  [90, 90],
  [-90, -90],
  [90, -90],
  [-90, 90],
];
const pressFor = (who, more = {}) => ({ x: 2000, y: 2000, depth: 220, angle: 0, tiltX: 0, tiltY: 0, cell: 2, w: 32, h: 32, face: FACE, for: who.id, ...more });
function waxed(s, t0) {
  POOL.forEach(([dx, dy], k) => assert.equal(s.act(ana, 'drip', t0 + 150 * k, { drip: { x: 2000 + dx, y: 2000 + dy, amt: 400000, heat: 220 } }), null));
}

test("seals: pressed into warm wax, a seal admits its key while the sheet lies on the owner's table; cold wax admits no one; broken, it is refused", () => {
  const ctx = { seed, family: FAMILY };
  const s = stamper(ana.id, ctx);
  assert.match(s.act(bo, 'stroke', 500, { stroke: strokeBytes([20, 20], [60, 20], BLUE) }), /not on your table/);
  waxed(s, 1000);
  assert.match(s.act(bo, 'press', 2400, { press: pressFor(bo) }), /only the owner/);
  assert.equal(s.act(ana, 'press', 2500, { press: pressFor(bo) }), null);
  const pressed = s.lines.length;
  assert.equal(s.act(bo, 'stroke', 3000, { stroke: strokeBytes([20, 20], [60, 20], BLUE) }), null, 'his seal took: he writes');
  assert.match(s.act(cy, 'stroke', 3100, { stroke: strokeBytes([20, 30], [60, 30], BLUE) }), /not on your table/, 'no seal of hers');
  // the seal counts only while the sheet lies on its owner's table
  assert.equal(s.act(ana, 'move', 3500, { to: cy.id }), null);
  assert.match(s.act(bo, 'stroke', 3600, { stroke: strokeBytes([20, 40], [60, 40], BLUE) }), /not on your table/);
  assert.equal(s.act(ana, 'move', 3700, { to: ana.id }), null);
  assert.equal(s.act(bo, 'stroke', 3800, { stroke: strokeBytes([20, 40], [60, 40], BLUE) }), null);
  // broken: the wax cracks across the impression, and he is refused
  assert.equal(s.act(ana, 'break', 5000, { broke: { seal: pressed, from: [1850, 1900], to: [2150, 2100] } }), null);
  assert.match(s.act(bo, 'stroke', 5200, { stroke: strokeBytes([20, 50], [60, 50], BLUE) }), /not on your table/);
  assert.match(s.act(ana, 'break', 5300, { broke: { seal: pressed, from: [1850, 1900], to: [2150, 2100] } }), /no such seal/, 'broken once');
  // a verifier replays the same rule from the chain (with the paper: whether a press took is the law's)
  assert.deepEqual(replay(ana.id, s.lines, { ctx }).problems, []);
  assert.ok(
    replay(ana.id, s.lines).problems.some((p) => /not on your table/.test(p)),
    'without the paper no seal can be known to take',
  );
  // the impression and the crack are on the paper
  const grown = growShared(s.lines, ctx);
  assert.equal(grown.seals[0].took, true);
  assert.ok(grown.cells.some((c) => c[16] >= 24));
  assert.ok(grown.cells.some((c) => c[17] & 1));
  // into cold wax: nothing took, and no one is admitted
  const cold = stamper(ana.id, ctx);
  waxed(cold, 1000);
  assert.equal(cold.act(ana, 'press', 70000, { press: pressFor(bo) }), null);
  assert.match(cold.act(bo, 'stroke', 71000, { stroke: strokeBytes([20, 20], [60, 20], BLUE) }), /not on your table/);
  // a press with no face of its size is refused before anything
  assert.throws(() => makeSharedAct({ sk: ana.sk, pk: ana.pk, sheet: SHEET, k: 99, act: 'press', press: { ...pressFor(bo), w: 31 } }), /size/);
});
