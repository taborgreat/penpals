// The outside's chain (outside.md Phase 5): a being's hands on the outside, sealed by its key, stamped
// in one order, regrown the same by everyone and after a restart.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, b64url } from './device.js';
import { hands as H, outside as O } from 'penpals-law';

let app;
const ana = person(71, 'ana');
const bo = person(72, 'bo');
const today = Math.floor(Date.UTC(2026, 9, 25) / 86400000) + 719528;
const tree = O.near(0, -20, 30).trees.find((t) => O.treeNow(t, today).branches.length > 20);
const thin = O.treeNow(tree, today)
  .branches.slice(1)
  .find((b) => b.parent === 0 && H.breaks(H.branchOf(tree, b.id, today)));
const counts = {};
const act = (p, a) => H.sealHandsAct(p.sk, { v: 1, kind: 'outside', by: b64url(p.pk), k: (counts[p.username] = (counts[p.username] ?? 0) + 1), ...a });

before(async () => {
  app = await startApp();
  app.anon = client(app.base);
  for (const p of [ana, bo]) {
    app[p.username] = client(app.base);
    app.resetLimits();
    assert.equal((await register(app[p.username], p)).status, 201);
  }
});
after(() => app?.close());

test("a branch broken off by ana's hand stays broken for bo, and after the stamper restarts; only one's own hands", async () => {
  const r = await app.ana.post('/api/outside/acts', act(ana, { act: 'break', tree: tree.id, branch: thin.id, day: today }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const seen = (await app.bo.get('/api/outside')).data;
  assert.deepEqual(seen.broken, [{ tree: tree.id, list: [{ branch: thin.id, day: today }] }]);
  assert.deepEqual(seen.things, [{ id: H.stickId(tree.id, thin.id), at: null, by: b64url(ana.pk) }], 'in her hand');
  const twice = await app.bo.post('/api/outside/acts', act(bo, { act: 'break', tree: tree.id, branch: thin.id, day: today }));
  assert.equal(twice.status, 409);
  const forged = await app.bo.post('/api/outside/acts', act(ana, { act: 'put', thing: H.stickId(tree.id, thin.id), to: [0, 0, 0] }));
  assert.equal(forged.status, 403, 'not her hands');
  const store = await import('../src/store/outside.js');
  await store.loadOutside(); // read again from data/outside.chain
  assert.deepEqual((await app.anon.get('/api/outside')).data.broken, seen.broken);
  const { lines } = (await app.anon.get('/api/outside/chain')).data;
  assert.deepEqual([...H.grow(lines, { seals: true }).broken], [[tree.id, [{ branch: thin.id, day: today }]]], 'and anyone regrows it from the chain');
});
