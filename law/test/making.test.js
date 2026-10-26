// The creation tree (outside.md Phase 7): each making works or fails only by the matter's properties.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys as K, b64url } from '../index.js';
import * as H from '../hands.js';
import * as MK from '../making.js';
import { MATTER } from '../matter.js';
import { near, treeNow, matterAt } from '../outside.js';
import * as LIFE from '../life.js';

const today = Math.floor(Date.UTC(2026, 9, 25) / 86400000) + 719528;
const sk = K.skFromK(new Uint8Array(32).fill(11));
const by = b64url(K.publicKeyOf(sk));
// a being's acts, landing one by one (each checked as the stamper would)
function world() {
  const state = H.start();
  let k = 0;
  const act = (a) => {
    const made = H.sealHandsAct(sk, { v: 1, kind: 'outside', by, k: k + 1, ...a });
    const why = H.check(state, made.act);
    if (why) throw new Error(`${a.act}: ${why}`);
    k++;
    H.apply(state, made.act);
    return `made:${state.n}`;
  };
  return { state, act };
}
const find = (fn, r = 60) => {
  for (let x = -r; x < r; x++) for (let y = -r; y < r; y++) if (fn(x + 0.5, y + 0.5)) return [Math.round((x + 0.5) * 1000), Math.round((y + 0.5) * 1000)];
  return null;
};
const around = near(0, -30, 60);
const stone = around.stones.find((s) => s.matter === 'stone' && s.r > 0.03 && s.r < 0.08);
const stone2 = around.stones.filter((s) => s.matter === 'stone' && s !== stone && s.r >= stone.r).sort((p, q) => p.r - q.r)[0]; // (a striker at least as big)
const chalk = near(-40, -40, 80).stones.find((s) => s.matter === 'chalk');
const ore = near(0, 0, 80).stones.find((s) => s.matter === 'ore');
const oak = around.trees.find((t) => treeNow(t, today).branches.length > 40);
const thinOnes = treeNow(oak, today)
  .branches.slice(1)
  .filter((b) => b.parent === 0 && H.breaks(H.branchOf(oak, b.id, today)))
  .slice(0, 3);
const at = [0, -30000, 0];

// two sticks broken off the oak, one laid down, a fire rubbed up between them
function fireBetween(act) {
  act({ act: 'break', tree: oak.id, branch: thinOnes[0].id, day: today });
  act({ act: 'break', tree: oak.id, branch: thinOnes[1].id, day: today });
  const [a, b] = thinOnes.map((x) => H.stickId(oak.id, x.id));
  act({ act: 'put', thing: b, to: at });
  return { a, b, fire: () => act({ act: 'rub', tool: a, thing: b, strokes: 900, speed: 300, ms: 450000, at }) };
}

test('fire from rubbing: wood on wood catches, if rubbed long enough; a stone on wood never does', () => {
  const { act, state } = world();
  const { a, b } = fireBetween(act);
  act({ act: 'rub', tool: a, thing: b, strokes: 6, speed: 300, ms: 3000, at });
  assert.ok(![...state.made.values()].some((m) => m.kind === 'fire'), 'a few strokes: warm, no more');
  act({ act: 'rub', tool: a, thing: b, strokes: 900, speed: 0, ms: 450000, at });
  assert.ok(![...state.made.values()].some((m) => m.kind === 'fire'), 'as long, the hand still: nothing');
  const fire = act({ act: 'rub', tool: a, thing: b, strokes: 900, speed: 300, ms: 450000, at });
  assert.equal(state.made.get(fire)?.kind, 'fire', 'rubbed on: it catches');
  assert.ok(!state.things.has(b), 'the fire is that stick, burning');
  act({ act: 'put', thing: a, to: at });
  act({ act: 'take', thing: stone.id });
  act({ act: 'rub', tool: stone.id, thing: a, strokes: 900, speed: 300, ms: 450000, at });
  assert.equal([...state.made.values()].filter((m) => m.kind === 'fire').length, 1, 'a stone, as long: it carries the heat away');
  // it burns its wood down, as fast as its row burns over the faces it shows the air; then it is out, its ash left
  const f = { ...state.made.get(fire), lit: 0 };
  assert.ok(f.grams > 0 && f.area > 0);
  const lasts = f.grams / (MATTER.wood.heat.burnRate * f.area); // s
  assert.equal(H.fireNow(f, 1000).out, false, 'burning');
  const after = H.fireNow(f, Math.ceil(lasts * 1000) + 1000);
  assert.ok(after.out && after.left === 0, `out after ${lasts.toFixed(0)} s`);
  assert.ok(Math.abs(after.ash - (f.grams * MATTER.wood.heat.leaves) / 1000) < 1e-9, 'its ash, what its row leaves');
  assert.equal(H.check(state, { v: 1, kind: 'outside', by, k: 99, act: 'fire', thing: fire, fire }, null) === 'the fire is out', false);
  const rub = { strokes: 900, speed: 0.3, seconds: 450 };
  assert.ok(MK.rubbed('stone', 'wood', rub).dT < MK.rubbed('wood', 'wood', rub).dT / 5);
  assert.equal(MK.rubbed('wood', 'wood', { ...rub, speed: 1000 }).dT, MK.rubbed('wood', 'wood', { ...rub, speed: MK.BEING.swing }).dT, 'no faster than an arm goes');
});

test('clay gathered, formed into a cup and fired is pottery; grass and dirt are not formed', () => {
  const clay = find((x, y) => matterAt(x, y) === 'clay');
  const grass = find((x, y) => matterAt(x, y) === 'grass');
  assert.ok(clay && grass);
  const { act, state } = world();
  const { a, fire: rub } = fireBetween(act);
  const fire = rub();
  act({ act: 'put', thing: a, to: at });
  const lump = act({ act: 'gather', at: clay });
  assert.equal(state.made.get(lump).kind, 'lump');
  const cup = act({ act: 'form', thing: lump });
  assert.equal(state.made.get(cup).kind, 'cup');
  act({ act: 'put', thing: cup, to: at });
  act({ act: 'fire', thing: cup, fire });
  assert.equal(state.made.get(cup).matter, 'pottery', "past its hardening heat (the fire is the wood's)");
  const fibre = act({ act: 'gather', at: grass });
  assert.throws(() => act({ act: 'form', thing: fibre }), /not lump/, 'grass is not formed');
  assert.equal(MK.formable('dirt'), false, 'dirt keeps no shape');
  assert.ok(MK.fireHeat() > 1000, `a wood fire: ${MK.fireHeat().toFixed(0)} °C`);
});

test('string twisted of grass; a stone chipped by a harder one (chalk cannot); a loose binding comes apart on the first swing, a tight one holds', () => {
  const grass = find((x, y) => matterAt(x, y) === 'grass');
  const { act, state } = world();
  for (let n = 0; n < 2; n++) {
    const f1 = act({ act: 'gather', at: grass });
    const f2 = act({ act: 'gather', at: grass });
    const s = act({ act: 'twist', a: f1, b: f2 });
    act({ act: 'put', thing: s, to: at });
  }
  const strings = [...state.made].filter(([, m]) => m.kind === 'string').map(([id]) => id);
  assert.equal(strings.length, 2);
  act({ act: 'take', thing: strings[0] });
  act({ act: 'take', thing: strings[1] });
  const cord = act({ act: 'twist', a: strings[0], b: strings[1] });
  assert.ok(state.made.get(cord).length > MK.FIBRE_LENGTH, 'two strings end to end: longer');
  act({ act: 'put', thing: cord, to: at });
  // chip: a stone struck with a stone takes an edge; struck with chalk, not
  act({ act: 'take', thing: chalk.id });
  act({ act: 'strike', tool: chalk.id, thing: stone.id, speed: 10000 });
  assert.ok(!state.edges.has(stone.id), 'the chalk gives way');
  act({ act: 'put', thing: chalk.id, to: at });
  act({ act: 'take', thing: stone2.id });
  act({ act: 'strike', tool: stone2.id, thing: stone.id, speed: 100 });
  assert.ok(!state.edges.has(stone.id), 'tapped: no edge');
  act({ act: 'strike', tool: stone2.id, thing: stone.id, speed: 10000 });
  assert.ok(state.edges.has(stone.id), 'struck hard: chipped, an edge');
  assert.equal(MK.chips({ matter: 'stone', r: 0.01 }, { matter: 'stone', r: 0.2 }, MK.BEING.swing), false, 'a pebble does not crack a boulder');
  act({ act: 'put', thing: stone2.id, to: at });
  // the axe, bound loose: on the first swing it comes apart
  act({ act: 'break', tree: oak.id, branch: thinOnes[2].id, day: today });
  const stick = H.stickId(oak.id, thinOnes[2].id);
  act({ act: 'put', thing: stick, to: at });
  const loose = act({ act: 'bind', stick, stone: stone.id, string: cord, turns: 2, pull: 10 });
  act({ act: 'take', thing: loose });
  act({ act: 'swing', thing: loose, at: oak.id, to: at, speed: 10000 });
  assert.ok(!state.things.has(loose), 'it came apart');
  assert.deepEqual(state.things.get(stone.id).at, at, 'the stone fell where it was swung');
  // bound tight, with the string it was: it holds, and bites the oak
  const again = [...state.made].find(([id, m]) => m.kind === 'string' && state.things.has(id))[0];
  const tight = act({ act: 'bind', stick, stone: stone.id, string: again, turns: 3, pull: 300 });
  act({ act: 'take', thing: tight });
  const marks = (state.marks.get(oak.id) ?? []).length;
  act({ act: 'swing', thing: tight, at: oak.id, to: at, speed: 10000 });
  assert.ok(state.things.has(tight), 'it holds');
  assert.equal((state.marks.get(oak.id) ?? []).length, marks + 1, 'and its edge bites the bark');
});

test('a lever: a stick over a stone tips a load too heavy for a hand, if its arm is long enough and it bears it', () => {
  const { act, state } = world();
  // a stone too heavy to take up, with another beside it for the fulcrum
  const all = near(0, 0, 400).stones.filter((s) => s.matter === 'stone');
  const apart = (p, q) => Math.hypot(p.at[0] - q.at[0], p.at[1] - q.at[1]);
  let heavy = null,
    over = null;
  for (const h of all) {
    if (H.stoneMass(h) * 9.81 <= H.BEING.pull) continue;
    over = all.find((o) => o !== h && apart(o, h) < 0.6);
    if (over) {
      heavy = h;
      break;
    }
  }
  assert.ok(heavy && over, 'a heavy stone with another beside it');
  assert.throws(() => act({ act: 'take', thing: heavy.id }), /too heavy/);
  const weight = H.stoneMass(heavy) * 9.81;
  const arm = Math.max(apart(over, heavy), over.r + heavy.r);
  // a stick off the oak that will do: long enough past the fulcrum, thick enough to bear it
  const fits = treeNow(oak, today)
    .branches.slice(1)
    .filter((b) => H.breaks(H.branchOf(oak, b.id, today)))
    .find((b) => {
      const br = H.branchOf(oak, b.id, today);
      return MK.pries({ weight, load: arm, length: br.reach, r: br.r }).tips;
    });
  assert.ok(fits, 'a stick off the oak that tips it');
  act({ act: 'break', tree: oak.id, branch: fits.id, day: today });
  const stick = H.stickId(oak.id, fits.id);
  const to = [Math.round(heavy.at[0] * 1000 + arm * 500), Math.round(heavy.at[1] * 1000), Math.round(heavy.at[2] * 1000)];
  assert.throws(() => act({ act: 'pry', stick, over: over.id, thing: heavy.id, to: [to[0] + 2000, to[1], to[2]] }), /no farther than its arm/);
  act({ act: 'pry', stick, over: over.id, thing: heavy.id, to });
  assert.deepEqual(state.things.get(heavy.id).at, to, 'tipped over the fulcrum');
  console.log(`a lever: a ${weight.toFixed(0)} N stone on an arm of ${arm.toFixed(2)} m, a stick ${H.branchOf(oak, fits.id, today).reach.toFixed(2)} m: it tips`);
  // the balance itself: a long arm tips what a short one cannot; a twig breaks first
  const w = 3 * H.BEING.pull;
  assert.ok(MK.pries({ weight: w, load: 0.1, length: 1.2, r: 0.03 }).tips, 'a long arm: it tips');
  assert.equal(MK.pries({ weight: w, load: 0.6, length: 1.2, r: 0.03 }).tips, false, 'the fulcrum in the middle: it does not');
  assert.equal(MK.pries({ weight: w, load: 0.1, length: 1.2, r: 0.003 }).tips, false, 'a twig: it breaks first');
});

test('ink: galls and ore crushed into water; too much ore makes ink that eats its paper over the years', () => {
  const free = MK.inkOf({ gall: 10, metal: 2, water: 100 }).free;
  const much = MK.inkOf({ gall: 10, metal: 12, water: 100 });
  assert.equal(free, 0, 'as much metal as the galls bind: none left free');
  assert.ok(much.free > 0 && much.black === 1, 'black, and some metal free');
  assert.equal(MK.paperLeft(free, 50), 1, 'its paper, fifty years on, as it was');
  assert.ok(MK.paperLeft(much.free, 50) < 0.5, `too much ore: ${(100 * MK.paperLeft(much.free, 50)).toFixed(0)}% of the paper's strength left after fifty years`);
  assert.ok(MK.paperLeft(much.free, 5) > MK.paperLeft(much.free, 50), 'year by year');
  // made by hand: a gall picked and crushed, ore crushed, both into a fired cup of water (a gall bug's
  // gall: one grows only where one laid, law/life.js)
  const gallOak = around.trees.find((t) => LIFE.gallsOf(t, today).length > 0);
  assert.ok(gallOak, 'an oak bears galls');
  const gall = LIFE.gallsOf(gallOak, today)[0];
  const water = find((x, y) => matterAt(x, y) === 'water');
  const clay = find((x, y) => matterAt(x, y) === 'clay');
  const { act, state } = world();
  const { a, fire: rub } = fireBetween(act);
  const fire = rub();
  act({ act: 'put', thing: a, to: at });
  const cup = act({ act: 'form', thing: act({ act: 'gather', at: clay }) });
  act({ act: 'put', thing: cup, to: at });
  act({ act: 'fire', thing: cup, fire });
  assert.throws(() => act({ act: 'pick', tree: gallOak.id, tip: gall.tip, laid: gall.laid + 1, day: today }), /no gall grows there/, 'none where none was laid');
  const g = act({ act: 'pick', tree: gallOak.id, tip: gall.tip, laid: gall.laid, day: today });
  assert.ok(!LIFE.gallsOf(gallOak, today, state).some((x) => x.tip === gall.tip && x.laid === gall.laid), 'picked: gone from its oak');
  assert.throws(() => act({ act: 'pick', tree: gallOak.id, tip: gall.tip, laid: gall.laid, day: today }), /picked already/);
  act({ act: 'put', thing: g, to: at });
  act({ act: 'take', thing: stone.id });
  const gp = act({ act: 'crush', tool: stone.id, thing: g });
  const op = act({ act: 'crush', tool: stone.id, thing: ore.id });
  assert.deepEqual([state.made.get(gp).of, state.made.get(op).of], ['gall', 'ore']);
  act({ act: 'put', thing: stone.id, to: at });
  act({ act: 'take', thing: cup });
  act({ act: 'gather', at: water });
  assert.ok(state.made.get(cup).holding.water > 0, 'water in the fired cup');
  act({ act: 'mix', cup, thing: gp });
  act({ act: 'mix', cup, thing: op });
  const h = state.made.get(cup).holding;
  const ink = MK.inkOf({ gall: h.gall, metal: MK.metalOf(h.ore), water: h.water });
  assert.ok(ink.black > 0, 'black');
  assert.ok(ink.free > 0, `a whole ore stone in one gall: too much; ${(100 * MK.paperLeft(ink.free, 50)).toFixed(0)}% of its paper left after fifty years`);
});

test('metal: ore melted in a fired cup in a wood fire runs out of it; poured into a fired form, it sets', () => {
  const clay = find((x, y) => matterAt(x, y) === 'clay');
  const { act, state } = world();
  const { a, fire: rub } = fireBetween(act);
  const fire = rub();
  act({ act: 'put', thing: a, to: at });
  const cups = [0, 1].map(() => {
    const c = act({ act: 'form', thing: act({ act: 'gather', at: clay }) });
    act({ act: 'put', thing: c, to: at });
    act({ act: 'fire', thing: c, fire });
    return c;
  });
  act({ act: 'take', thing: stone.id });
  const op = act({ act: 'crush', tool: stone.id, thing: ore.id });
  act({ act: 'put', thing: stone.id, to: at });
  act({ act: 'take', thing: cups[0] });
  act({ act: 'mix', cup: cups[0], thing: op });
  act({ act: 'put', thing: cups[0], to: at });
  act({ act: 'melt', cup: cups[0], fire });
  assert.ok(state.made.get(cups[0]).holding.molten > 0, 'the metal runs out of the ore');
  act({ act: 'take', thing: cups[0] });
  const metal = act({ act: 'pour', cup: cups[0], into: cups[1] });
  assert.equal(state.made.get(metal).kind, 'metal', 'set in its form');
  assert.ok(Math.abs(state.made.get(metal).grams - MK.metalOf(state.made.get(op)?.grams ?? state.made.get(metal).grams / 0.3)) < 1e-6);
  assert.ok(MK.wicks('grass'), 'grass draws wax: a wick');
});

test("a candle: a handful of a hive's comb melted in a cup over a wood fire, and a grass string dipped in it", () => {
  const clay = find((x, y) => matterAt(x, y) === 'clay');
  const grass = find((x, y) => matterAt(x, y) === 'grass');
  const hiveOak = near(0, -30, 80).trees.find((t) => LIFE.lifeOf(t, today).hive?.wax > 0);
  assert.ok(hiveOak, 'a hive out there, with comb');
  const before = LIFE.lifeOf(hiveOak, today).hive.wax;
  const { act, state } = world();
  const { a, fire: rub } = fireBetween(act);
  const fire = rub();
  act({ act: 'put', thing: a, to: at });
  const cup = act({ act: 'form', thing: act({ act: 'gather', at: clay }) });
  const wax = act({ act: 'gather', tree: hiveOak.id, day: today });
  assert.deepEqual([state.made.get(wax).kind, state.made.get(wax).matter], ['wax', 'wax']);
  assert.ok(Math.abs(LIFE.lifeOf(hiveOak, today, state).hive.wax - (before - state.made.get(wax).grams)) < 1e-9, "the hive's comb less by as much");
  act({ act: 'mix', cup, thing: wax });
  act({ act: 'put', thing: cup, to: at });
  act({ act: 'melt', cup, fire });
  assert.ok(state.made.get(cup).holding.waxMolten, 'the wood fire past wax melting');
  const s = act({ act: 'twist', a: act({ act: 'gather', at: grass }), b: act({ act: 'gather', at: grass }) });
  const candle = act({ act: 'dip', string: s, cup });
  assert.deepEqual([state.made.get(candle).kind, state.made.get(candle).wick.matter], ['candle', 'grass']);
  assert.equal(state.made.get(cup).holding.wax, 0, 'the wax all on the wick');
});

test("a feather fallen under a bird's tree is taken up; one that never fell is not; a harder stone cuts its quill", () => {
  const birdOak = near(0, -30, 60).trees.find((t) => LIFE.lifeOf(t, today).feathers.length > 0);
  assert.ok(birdOak, 'feathers under an oak with birds in it');
  const f = LIFE.lifeOf(birdOak, today).feathers[0];
  const { act, state } = world();
  assert.throws(() => act({ act: 'take', thing: `feather:${birdOak.id}/${today + 5}/0`, day: today }), /no such thing/, 'not yet fallen');
  act({ act: 'take', thing: f.id, day: today });
  assert.equal(state.things.get(f.id).at, null, 'in the hand');
  act({ act: 'put', thing: f.id, to: at });
  act({ act: 'take', thing: stone.id });
  act({ act: 'carve', thing: f.id, tool: stone.id, from: 0, to: 20, strokes: 3 });
  assert.ok(H.thinnedAt(state, f.id, 10) > 0, 'its quill cut to a nib');
});
