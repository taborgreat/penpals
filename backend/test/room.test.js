// A book is its chain (Tabor, 2026-10-25; books.md, rooms.md §1, §2): its owner's signature and everything they
// made of matter, each paper and each surface of their house with its own chain (law/paper.js), all of it in
// the .book and verified there alone. A house's head says whose it is and the paper their name was signed on.
// One world, one clock; a private house only its owner sees into.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, FAMILY, K, b64url } from './device.js';
import { paper as P, room as R } from 'penpals-law';
import { verifyBook, parseBook } from 'penpals-law/verify';
import { record, samplePath } from 'penpals-law/tools/fixtures';
import { lawOf } from 'penpals-law/laws';

let app;
const ana = person(41, 'ana');
const bo = person(42, 'bo');

before(async () => {
  app = await startApp(); // first: the config reads DATA_DIR when it is imported
  app.ana = client(app.base);
  app.bo = client(app.base);
  for (const [c, p] of [
    [app.ana, ana],
    [app.bo, bo],
  ]) {
    app.resetLimits();
    const r = await register(c, p);
    assert.equal(r.status, 201, JSON.stringify(r.data));
  }
});
after(async () => {
  await app.close();
});
beforeEach(() => app.resetLimits());

const strokeAt = (t0) =>
  lawOf(3).encodeActs(
    record(
      [
        {
          path: samplePath(
            (u) => [100 + 400 * u, 200],
            () => 40,
          ),
          pen: { nib: 0, size: 60, flex: 0, flow: 10, rgb: [30, 40, 200], angle: 0 },
          start: t0,
        },
      ],
      [0, 0],
    ),
  );
const k = new Map();
const act = (p, paper, kind, extra = {}) => {
  k.set(paper, (k.get(paper) ?? 0) + 1);
  return P.makePaperAct({ sk: p.sk, pk: p.pk, paper, k: k.get(paper), act: kind, ...extra });
};

test("a house's head: whose it is, and the paper their name was signed on; no layout", async () => {
  const { data } = await app.bo.get('/api/books/ana');
  assert.equal(data.name, 'ana');
  assert.equal(data.key, b64url(ana.pk));
  assert.deepEqual(data.family, FAMILY, 'the paper their signature is on');
  assert.match(data.signature, /^k_\d{6}$/);
  assert.equal('skeleton' in data, false);
  for (const gone of ['/api/books/me/edit', '/api/books/me/ink', '/api/books/me/open']) assert.equal((await app.ana.post(gone, {})).status, 404, gone);
});

test('the .book is the chain: the signature, a paper and its acts, a wall written on; it verifies alone', async () => {
  const paper = K.newSheetId();
  assert.equal((await app.ana.post('/api/papers', P.makePaper({ sk: ana.sk, pk: ana.pk, paper, family: FAMILY, at: [1.5, 2.9, 0.74] }))).status, 201);
  assert.equal((await app.ana.post(`/api/papers/${paper}/acts`, act(ana, paper, 'stroke', { stroke: strokeAt(0) }))).status, 201);
  const wall = K.newSheetId();
  assert.equal((await app.ana.post('/api/papers', P.makeSurface({ sk: ana.sk, pk: ana.pk, paper: wall, surface: 'wall-far' }))).status, 201);
  assert.equal((await app.ana.post(`/api/papers/${wall}/acts`, act(ana, wall, 'stroke', { stroke: strokeAt(0) }))).status, 201);
  const dl = await app.ana.get('/api/books/ana/download');
  assert.equal(dl.status, 200);
  const text = Buffer.from(dl.data).toString('utf8');
  const { head, lines } = parseBook(text);
  assert.deepEqual(Object.keys(head).sort(), ['book', 'fingerprint', 'key', 'law', 'name']);
  assert.equal(head.book, 3);
  assert.equal(lines.filter((l) => l.paper).length >= 2, true);
  const book = verifyBook(text);
  assert.equal(book.ok, true, JSON.stringify(book.problems.concat(book.results.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`))));
  assert.deepEqual(
    book.results.filter((r) => r.kind === 'paper').map((r) => r.regrown),
    [true, true],
  );
  assert.equal((await app.bo.get('/api/books/ana/download')).status, 403, 'only its owner downloads it');
});

test('one world, one clock (rooms.md §1b): no house keeps a zone of its own', async () => {
  const u = (await app.bo.get('/api/users/ana')).data.user;
  assert.equal('timeZone' in u, false, 'no zone shown with a house');
  assert.equal((await app.ana.post('/api/social/time', { timeZone: 'Asia/Tokyo' })).status, 404, 'none to change');
});

test("visiting: others see what lies in a house and on its walls, as the profile's privacy allows", async () => {
  const stranger = client(app.base);
  const inAna = `/api/papers/in/${b64url(ana.pk)}`;
  assert.equal((await stranger.get(inAna)).status, 200);
  assert.ok(
    (await app.bo.get(inAna)).data.papers.some((v) => v.where.surface === 'wall-far'),
    'her wall, written on',
  );
  // a private house: only its owner sees into it (there are no friends: one-world.md)
  assert.equal((await app.ana.post('/api/social/private', { private: true })).status, 200);
  assert.equal((await stranger.get(inAna)).status, 403);
  assert.equal((await app.bo.get(inAna)).status, 403);
  assert.equal((await app.bo.get('/api/books/ana')).status, 403);
  assert.equal((await app.ana.get(inAna)).status, 200, 'its owner');
  assert.equal((await app.ana.post('/api/social/private', { private: false })).status, 200);
  assert.equal((await stranger.get(inAna)).status, 200);
});

test("a house's things are those every house has (law/room.js): a pendulum among them, a bare hand reaching", () => {
  assert.ok(R.THINGS.includes('pendulum'));
  assert.ok(R.ACTS.includes('reach'));
});
