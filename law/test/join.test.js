// Joining spaces (rooms.md §7): both owners sign, on facing walls; the wall comes
// down only if both choose it; tables move across only while joined; unjoin puts
// every table home by itself, even one its owner never moved back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { keys as K, b64url } from '../index.js';
import { makeJoinAct, replayJoin, openingOf, sideOf, pairOf, joinRefusal, startJoin, applyJoin } from '../join.js';

const keyOf = (n) => {
  const sk = K.skFromK(new Uint8Array(32).fill(n));
  const pk = K.publicKeyOf(sk);
  return { sk, pk, id: b64url(pk) };
};
const ana = keyOf(81),
  bo = keyOf(82),
  cy = keyOf(83);
// a stamper for one pair: acts in, each checked, placed
function pair(x, y) {
  let s = startJoin(...[x.id, y.id].sort());
  const lines = [];
  const ks = {};
  return {
    lines,
    get state() {
      return s;
    },
    act(who, act, extra = {}) {
      ks[who.id] = (ks[who.id] ?? 0) + 1;
      const other = who.id === x.id ? y.id : x.id;
      const made = makeJoinAct({ sk: who.sk, pk: who.pk, with: other, k: ks[who.id], act, ...extra });
      const why = joinRefusal(s, made.act);
      if (why) {
        ks[who.id]--;
        return why;
      }
      const line = { n: lines.length + 1, at: lines.length * 100, ...made };
      s = applyJoin(s, line);
      lines.push(line);
      return null;
    },
  };
}

test('two owners each sign a join on facing walls: then, and only then, the rooms are joined', () => {
  const p = pair(ana, bo);
  assert.equal(p.act(ana, 'join', { side: 'right' }), null);
  assert.equal(p.state.joined, false, 'one signature is not a join');
  assert.equal(p.act(bo, 'join', { side: 'right' }), null);
  assert.equal(p.state.joined, false, 'right to right: the walls do not face');
  assert.equal(p.act(bo, 'join', { side: 'left' }), null);
  assert.equal(p.state.joined, true);
  assert.equal(sideOf(p.state, ana.id), 'right');
  assert.equal(sideOf(p.state, bo.id), 'left');
  assert.match(p.act(ana, 'join', { side: 'right' }), /joined already/);
  // a stranger has no say
  const made = makeJoinAct({ sk: cy.sk, pk: cy.pk, with: ana.id, k: 1, act: 'unjoin' });
  assert.match(joinRefusal(p.state, made.act), /not one of this pair/);
  assert.equal(pairOf(ana.id, bo.id), pairOf(bo.id, ana.id));
});

test('the opening: a door unless both owners take their side of the wall down; each can change it', () => {
  const p = pair(ana, bo);
  p.act(ana, 'join', { side: 'right' });
  p.act(bo, 'join', { side: 'left' });
  assert.equal(openingOf(p.state), 'door', 'a door by default: decorated walls stay');
  p.act(ana, 'opening', { opening: 'wall' });
  assert.equal(openingOf(p.state), 'door', 'one side down is still a door');
  p.act(bo, 'opening', { opening: 'wall' });
  assert.equal(openingOf(p.state), 'wall');
  p.act(bo, 'opening', { opening: 'door' });
  assert.equal(openingOf(p.state), 'door', 'and back');
});

test('furniture across; unjoin returns every table home, including one its owner never moved back', () => {
  const p = pair(ana, bo);
  assert.match(p.act(ana, 'table', { at: [4200, 1500] }), /only while/, 'not joined yet');
  p.act(ana, 'join', { side: 'right' });
  p.act(bo, 'join', { side: 'left' });
  assert.equal(p.act(ana, 'table', { at: [4200, 1500] }), null);
  assert.equal(p.act(bo, 'table', { at: [1000, 1000] }), null);
  assert.equal(p.act(bo, 'table', { at: null }), null, 'bo takes his home');
  assert.deepEqual(p.state.tables[ana.id], [4200, 1500]);
  assert.equal(p.act(bo, 'unjoin'), null, 'either owner separates the rooms');
  assert.equal(p.state.joined, false);
  assert.deepEqual(Object.values(p.state.tables), [null, null], "ana's table is home though she never moved it back");
  // the chain says the same to anyone
  const { state, problems } = replayJoin(ana.id, bo.id, p.lines);
  assert.deepEqual(problems, []);
  assert.deepEqual(state, p.state);
  // a forged seal, a line out of place
  const forged = p.lines.map((l, i) => (i === 1 ? { ...l, seal: p.lines[0].seal } : l));
  assert.ok(replayJoin(ana.id, bo.id, forged).problems.some((x) => /seal/.test(x)));
  assert.ok(replayJoin(ana.id, bo.id, p.lines.slice(1)).problems.some((x) => /place/.test(x)));
});
