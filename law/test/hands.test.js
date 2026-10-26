// The hands (outside.md Phase 5): a branch broken, a stick carved, a stone moved: facts regrown from acts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys as K, b64url } from '../index.js';
import * as H from '../hands.js';
import { near, treeNow } from '../outside.js';

const today = Math.floor(Date.UTC(2026, 9, 25) / 86400000) + 719528;
const sk = K.skFromK(new Uint8Array(32).fill(9));
const by = b64url(K.publicKeyOf(sk));
let k = 0;
const act = (a) => H.sealHandsAct(sk, { v: 1, kind: 'outside', by, k: ++k, ...a });
const line = (m, n) => ({ n, at: '2026-10-25T00:00:00Z', ...m });

// a tree near the start, a branch of it that breaks and one that holds
const tree = near(0, -20, 30).trees.find((t) => treeNow(t, today).branches.length > 20);
const T = treeNow(tree, today);
const thin = T.branches.slice(1).find((b) => H.breaks(H.branchOf(tree, b.id, today)) && b.parent === 0);
const thick = T.branches.slice(1).find((b) => !H.breaks(H.branchOf(tree, b.id, today)));
const stone = near(0, -20, 30).stones.find((s) => s.matter === 'stone');
const chalk = near(-40, -40, 60).stones.find((s) => s.matter === 'chalk');

test('a branch pulled breaks where its wood gives; a thick limb and the trunk hold', () => {
  assert.ok(thin && thick, 'both kinds on the tree');
  assert.equal(H.breaks(H.branchOf(tree, 0, today)), false, 'the trunk');
  const br = H.branchOf(tree, thin.id, today);
  assert.ok(H.BEING.pull * br.reach >= (90e6 * Math.PI * br.r ** 3) / 4);
});

test('a broken branch stays broken for everyone and after return; the stick it was is in the hand', () => {
  k = 0;
  const lines = [act({ act: 'break', tree: tree.id, branch: thin.id, day: today }), act({ act: 'break', tree: tree.id, branch: thick.id, day: today })].map(line);
  const a = H.grow(lines, { seals: true }),
    b = H.grow(
      lines.map((l) => JSON.parse(JSON.stringify(l))),
      { seals: true },
    );
  assert.deepEqual(a.broken.get(tree.id), [{ branch: thin.id, day: today }], 'the thin one broke; the thick held');
  assert.deepEqual([...a.broken], [...b.broken], 'the same everywhere');
  const stick = H.stickId(tree.id, thin.id);
  assert.deepEqual(a.things.get(stick), { at: null, by });
  // set down, taken up again by its id: it is a thing now
  lines.push(line(act({ act: 'put', thing: stick, to: [1000, -5000, 0] }), 3));
  assert.deepEqual(H.grow(lines).things.get(stick).at, [1000, -5000, 0]);
  assert.equal(H.check(H.grow(lines), { v: 1, kind: 'outside', by, k: 4, act: 'break', tree: tree.id, branch: thin.id, day: today }), 'it is broken off already');
});

test('carving with a soft stone on hard wood takes nothing; a hard one takes as much as the law says; the same acts, the same stick everywhere', () => {
  k = 0;
  const stick = H.stickId(tree.id, thin.id);
  const lines = [
    act({ act: 'break', tree: tree.id, branch: thin.id, day: today }),
    act({ act: 'put', thing: stick, to: [0, -19000, 0] }),
    act({ act: 'take', thing: chalk.id }),
    act({ act: 'carve', thing: stick, tool: chalk.id, from: 0, to: 120, strokes: 40 }),
    act({ act: 'put', thing: chalk.id, to: [0, -19500, 0] }),
    act({ act: 'take', thing: stone.id }),
    act({ act: 'carve', thing: stick, tool: stone.id, from: 50, to: 120, strokes: 10 }),
  ].map(line);
  const a = H.grow(lines, { seals: true });
  assert.deepEqual(a.cuts.get(stick), [{ from: 50, to: 120, depth: 10 * H.cutOf('stone', 'wood') }], 'the chalk took nothing; the stone took its share');
  assert.equal(H.thinnedAt(a, stick, 10), 0);
  assert.equal(H.thinnedAt(a, stick, 100), 600);
  assert.deepEqual(
    H.grow(
      lines.map((l) => JSON.parse(JSON.stringify(l))),
      { seals: true },
    ).cuts,
    a.cuts,
  );
  // into a tree: the stone in hand marks its bark
  const mark = line(act({ act: 'carve', tree: tree.id, tool: stone.id, from: 1200, to: 1300, az: 90, strokes: 5 }), 8);
  assert.deepEqual(H.grow([...lines, mark]).marks.get(tree.id), [{ from: 1200, to: 1300, az: 90, depth: 5 * H.cutOf('stone', 'bark') }]);
  // a tool not in the hand cuts nothing at all: the act does not land
  assert.equal(H.check(a, { v: 1, kind: 'outside', by, k: 8, act: 'carve', thing: stick, tool: chalk.id, from: 0, to: 10, strokes: 1 }), 'the tool is not in that hand');
  // and a forged seal is passed over by a verifier
  const forged = { ...lines[6], seal: lines[5].seal };
  assert.equal(H.grow([...lines.slice(0, 6), forged], { seals: true }).cuts.get(stick), undefined);
});

test('a hand lifts only what it can hold up: a stone heavier than a being pulls stays where it lies', () => {
  const stones = near(0, -20, 60).stones;
  const big = stones.find((s) => H.stoneMass(s) * 9.81 > H.BEING.pull);
  const small = stones.find((s) => H.stoneMass(s) * 9.81 <= H.BEING.pull);
  assert.ok(big && small, `stones of both: ${H.stoneMass(big).toFixed(0)} kg, ${H.stoneMass(small).toFixed(1)} kg`);
  const state = H.start();
  assert.equal(H.check(state, { v: 1, kind: 'outside', by, k: 1, act: 'take', thing: big.id }), 'too heavy for a hand to lift');
  assert.equal(H.check(state, { v: 1, kind: 'outside', by, k: 1, act: 'take', thing: small.id }), null);
});
