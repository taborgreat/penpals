// The houses (one-world.md, "Spawned matter"): the plots in their order, the acts as
// every device seals them, and the houses regrown from a chain, the same for anyone.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as W from '../world.js';
import { skFromK, publicKeyOf } from '../keys.js';
import { b64url } from '../tags.js';

const person = (n) => {
  const sk = skFromK(new Uint8Array(32).fill(n));
  return { sk, key: b64url(publicKeyOf(sk)) };
};
const ana = person(1);
const bo = person(2);

test('the plots: ring by ring, each counterclockwise from due +x, in integers', () => {
  assert.deepEqual(W.ring(1), [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ]);
  const r3 = W.ring(3);
  assert.equal(r3.length, 24);
  // every next plot is further round (the angle grows), from +x
  const angle = ([i, j]) => (Math.atan2(j, i) + 2 * Math.PI) % (2 * Math.PI);
  for (let k = 1; k < r3.length; k++) assert.ok(angle(r3[k]) > angle(r3[k - 1]), `${r3[k - 1]} before ${r3[k]}`);
  assert.deepEqual(r3[0], [3, 0]);
});

test('sealed acts: only the key that names itself; the houses regrown from the chain; a forged line passed over when seals are checked', () => {
  const lines = [
    { n: 1, act: W.houseAct(ana.key) },
    { n: 2, act: W.houseAct(bo.key) },
    { n: 3, act: W.moveAct(ana.key, { k: 0 }, [-1, 1]) },
  ].map((l) => ({ ...l, seal: W.sealWorldAct(l.act.key === ana.key ? ana.sk : bo.sk, l.act).seal }));
  assert.ok(lines.every((l) => W.sealed(l.act, l.seal)));
  const s = W.grow(lines, { seals: true });
  assert.deepEqual(s.houses.get(ana.key).plot, [-1, 1]);
  assert.deepEqual(s.houses.get(bo.key).plot, [1, 1]);
  // bo seals a move of ana's house: the stamper would refuse it, a verifier passes it over
  const forged = { n: 4, act: W.moveAct(ana.key, { k: 1 }, [2, 0]), seal: W.sealWorldAct(bo.sk, W.moveAct(ana.key, { k: 1 }, [2, 0])).seal };
  assert.equal(W.sealed(forged.act, forged.seal), false);
  assert.deepEqual(W.grow([...lines, forged], { seals: true }).houses.get(ana.key).plot, [-1, 1]);
  // a move onto the start, or onto a taken plot, never lands
  assert.equal(W.check(s, W.moveAct(ana.key, { k: 1 }, [0, 0])), 'that is the starting area');
  assert.equal(W.check(s, W.moveAct(ana.key, { k: 1 }, [1, 1])), 'that plot is taken');
});
