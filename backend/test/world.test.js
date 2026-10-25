// The houses in the one world (one-world.md, "Spawned matter"): registering
// drops a house with a table on the next free plot around the start, by an act
// signed with the new key; the places come from the house acts in chain order,
// the same for every viewer; a house moves to another free plot with one act.
// The acts are made as every device makes them (law/world.js).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, b64url } from './device.js';
import { world as W } from 'penpals-law';

let app;
const ana = person(61, 'ana');
const bo = person(62, 'bo');
const cy = person(63, 'cy');
const dee = person(64, 'dee');
const keyOf = (p) => ({ sk: p.sk, publicKey: b64url(p.pk) });
const sealWorld = (key, act) => W.sealWorldAct(key.sk, act);
const houseAct = (key) => W.houseAct(key.publicKey);
const moveAct = (key, house, plot) => W.moveAct(key.publicKey, house, plot);
const world = (c) => c.get('/api/world').then((r) => r.data);
const placeOf = (w, p) => w.houses.find((h) => h.key === b64url(p.pk))?.plot ?? null;

async function join(p) {
  app[p.username] = client(app.base);
  app.resetLimits();
  const r = await register(app[p.username], p);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const placed = await app[p.username].post('/api/world/acts', sealWorld(keyOf(p), houseAct(keyOf(p))));
  assert.equal(placed.status, 201, JSON.stringify(placed.data));
  return placed.data.line;
}

before(async () => {
  app = await startApp();
  app.anon = client(app.base);
});
after(async () => {
  await app.close();
});
beforeEach(() => app.resetLimits());

test('the plots: ring by ring around the start, each counterclockwise from +x; the start is no one’s', () => {
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
  assert.equal(W.ring(2).length, 16);
  assert.deepEqual(W.nextFree(W.start()), [1, 0]);
  assert.deepEqual(W.centreOf([-1, 1]), [-W.PLOT_M, W.PLOT_M]);
});

test('register three: each gets a house on the next free plot, in the order the house acts landed, the same for every viewer', async () => {
  const lines = [await join(ana), await join(bo), await join(cy)];
  assert.deepEqual(
    lines.map((l) => l.n),
    [1, 2, 3],
  );
  const seen = [await world(app.anon), await world(app.bo), await world(app.cy)];
  for (const w of seen) {
    assert.deepEqual(
      w.houses.map((h) => [h.name, h.plot, h.n]),
      [
        ['ana', [1, 0], 1],
        ['bo', [1, 1], 2],
        ['cy', [0, 1], 3],
      ],
    );
    assert.equal(w.plotM, W.PLOT_M);
  }
  // the chain alone regrows them: everyone gets the same places from the same acts
  const { lines: chain } = (await app.anon.get('/api/world/chain')).data;
  const grown = W.grow(chain);
  assert.deepEqual(
    [...grown.houses].map(([key, h]) => [key, h.plot]),
    seen[0].houses.map((h) => [h.key, h.plot]),
  );
});

test('only your own house, once, sealed by your key', async () => {
  const again = await app.ana.post('/api/world/acts', await sealWorld(keyOf(ana), houseAct(keyOf(ana))));
  assert.equal(again.status, 409); // a key has one house
  const theirs = await app.ana.post('/api/world/acts', await sealWorld(keyOf(bo), moveAct(keyOf(bo), { k: 0 }, [2, 0])));
  assert.equal(theirs.status, 403); // bo's act, sent by ana
  const forged = { ...(await sealWorld(keyOf(bo), moveAct(keyOf(ana), { k: 0 }, [2, 0]))) };
  assert.equal((await app.ana.post('/api/world/acts', forged)).status, 401); // ana's act, sealed by bo's key
  assert.equal((await app.anon.post('/api/world/acts', await sealWorld(keyOf(ana), moveAct(keyOf(ana), { k: 0 }, [2, 0])))).status, 401); // signed out
  const before = await world(app.anon);
  assert.deepEqual(placeOf(before, ana), [1, 0]); // nothing moved
});

test('a house moves next to another with one act; its old plot is the next new house’s; an old act cannot be played again', async () => {
  // ana moves next to cy (cy stands on [0, 1]; [-1, 1] is free)
  const move = await sealWorld(keyOf(ana), moveAct(keyOf(ana), { k: 0 }, [-1, 1]));
  const moved = await app.ana.post('/api/world/acts', move);
  assert.equal(moved.status, 201, JSON.stringify(moved.data));
  for (const c of [app.anon, app.bo]) assert.deepEqual(placeOf(await world(c), ana), [-1, 1]);
  // played again (by anyone), it is out of order
  assert.equal((await app.ana.post('/api/world/acts', move)).status, 409);
  // onto a taken plot, or the start: refused
  assert.equal((await app.ana.post('/api/world/acts', await sealWorld(keyOf(ana), moveAct(keyOf(ana), { k: 1 }, [1, 1])))).status, 409);
  assert.equal((await app.ana.post('/api/world/acts', await sealWorld(keyOf(ana), moveAct(keyOf(ana), { k: 1 }, [0, 0])))).status, 409);
  // the next to register takes the first free plot in order: the one ana left
  await join(dee);
  assert.deepEqual(placeOf(await world(app.anon), dee), [1, 0]);
});

test('after a reload the houses stand where the chain puts them', async () => {
  const was = (await world(app.anon)).houses;
  const store = await import('../src/store/world.js');
  assert.equal(await store.loadWorld(), 4); // read again from data/world.chain
  assert.deepEqual((await world(app.anon)).houses, was);
});

test('a private house still stands on its plot for everyone; only its name is hidden', async () => {
  assert.equal((await app.cy.post('/api/social/private', { private: true })).status, 200);
  const anon = await world(app.anon);
  const own = await world(app.cy);
  assert.deepEqual(
    anon.houses.map((h) => h.plot),
    own.houses.map((h) => h.plot),
  );
  assert.equal(anon.houses.find((h) => h.key === b64url(cy.pk)).name, null);
  assert.equal(own.houses.find((h) => h.key === b64url(cy.pk)).name, 'cy');
  await app.cy.post('/api/social/private', { private: false });
});
