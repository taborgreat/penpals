// The room in the book (rooms.md §1, §2): every wall, the floor, the ceiling
// and the table top is a page of the book with its own matter; ink placed on
// one is written on that matter's paper family, and a stroke on a wall is a
// sheet like any other: sealed, regrown from its seed, verified in the .book.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, writeInk, bookInk, FAMILY, R, S } from './device.js';
import { verifyBook, parseBook } from 'penpals-law/verify';

let app;
const ana = person(41, 'ana');
const bo = person(42, 'bo');
let PLASTER, WOOD;

before(async () => {
  app = await startApp(); // first: the config reads DATA_DIR when it is imported
  ({ plaster: PLASTER, wood: WOOD } = (await import('../src/config.js')).config.book.families);
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

test("a new book has the room's surfaces: each with its matter, family and size, empty", async () => {
  const { data } = await app.ana.get('/api/books/me');
  const s = data.skeleton.surfaces;
  assert.deepEqual(Object.keys(s).sort(), ['ceiling', 'floor', 'pen', 'table', 'wall-far', 'wall-left', 'wall-near', 'wall-right']);
  assert.equal(s['wall-far'].matter, 'plaster');
  assert.deepEqual(s['wall-far'].family, PLASTER);
  assert.deepEqual(s.floor.family, WOOD);
  assert.ok(s['wall-left'].size[0] > s.table.size[0] && s.table.items.length === 0);
  assert.notDeepEqual(PLASTER, FAMILY, 'not the paper');
});

test('surface = sheet: a stroke on a wall lands on it, regrows byte-identically, verifies like paper', async () => {
  const acts = S.write(ana.writer, 'on the wall', 2);
  const res = await writeInk(app.ana, ana, { family: PLASTER, acts, place: { surface: 'wall-far', x: 9000, y: 6000, scale: 64 } });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const { data } = await app.ana.get('/api/books/me');
  const items = data.skeleton.surfaces['wall-far'].items;
  assert.equal(items.length, 1);
  assert.deepEqual([items[0].x, items[0].y], [9000, 6000]);
  // regrown from its acts and its seed: the same facts
  assert.equal(R.regrow(res.ink.line.ink, res.ink.seed).ok, true);
  // in the .book, checked as a whole
  const dl = await app.ana.get('/api/books/ana/download');
  assert.equal(dl.status, 200);
  const text = Buffer.from(dl.data).toString('utf8');
  const book = parseBook(text);
  const v = verifyBook(text, { regrowOpen: false });
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.ok(book.head.surfaces['wall-far'].items.some((it) => it.ink === res.data.ink));
  // a visitor sees it as they see the journal's ink
  assert.equal((await app.bo.get(`/api/books/ana/look/${res.data.ink}?s=64`)).status, 200);
});

test("ink on a surface is written on that surface's matter; unknown surfaces are refused", async () => {
  const onPaper = await writeInk(app.ana, ana, { family: FAMILY, place: { surface: 'floor', x: 100, y: 100, scale: 64 } });
  assert.equal(onPaper.status, 400);
  assert.equal(onPaper.data.code, 'wrong_paper');
  const nowhere = await writeInk(app.ana, ana, { family: WOOD, place: { surface: 'roof', x: 0, y: 0, scale: 64 } });
  assert.equal(nowhere.status, 400);
  const onFloor = await writeInk(app.ana, ana, { family: WOOD, place: { surface: 'floor', x: 20000, y: 21000, scale: 64 } });
  assert.equal(onFloor.status, 201, 'the floor is large: far corners are on it');
  // the journal's page still takes the book's own paper only
  assert.equal((await writeInk(app.ana, ana, { family: PLASTER })).status, 400);
});

test('law 4 (one-matter.md): ink on a wall grows on the plaster itself and says so; claiming another matter, refused', async () => {
  const acts = S.write(ana.writer, 'on plaster', 2);
  const res = await writeInk(app.ana, ana, { family: { ...PLASTER, matter: 'plaster' }, acts, law: 4, place: { surface: 'wall-left', x: 9000, y: 6000, scale: 64 } });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.ink.line.ink.law, 4);
  assert.equal(res.ink.line.ink.matter, 'plaster');
  assert.equal(R.regrow(res.ink.line.ink, res.ink.seed).ok, true, 'regrown on plaster');
  // the same writing grown as the plaster's old paper family settles otherwise
  const asPaper = R.makeInk({ sk: ana.sk, pk: ana.pk, sheet: res.ink.line.ink.sheet, use: 'book', family: PLASTER, acts, law: 4 });
  assert.notEqual(asPaper.line.ink.facts, res.ink.line.ink.facts);
  const wrong = await writeInk(app.ana, ana, { family: { ...PLASTER, matter: 'wood' }, acts, law: 4, place: { surface: 'wall-left', x: 1000, y: 1000, scale: 64 } });
  assert.equal(wrong.status, 400);
  assert.equal(wrong.data.code, 'wrong_paper');
  const v = verifyBook(Buffer.from((await app.ana.get('/api/books/ana/download')).data).toString('utf8'), { regrowOpen: false });
  assert.equal(v.ok, true, JSON.stringify(v.problems));
});

test("writing on the pen's body leaves ink like any sheet (rooms.md §3c): wood, its own small page", async () => {
  const acts = S.write(ana.writer, 'on the pen', 3);
  const res = await writeInk(app.ana, ana, { family: WOOD, acts, place: { surface: 'pen', x: 40, y: 10, scale: 16 } });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const { data } = await app.ana.get('/api/books/me');
  assert.equal(data.skeleton.surfaces.pen.matter, 'wood');
  assert.ok(data.skeleton.surfaces.pen.items.some((it) => it.ink === res.data.ink));
  assert.equal(R.regrow(res.ink.line.ink, res.ink.seed).ok, true);
  assert.equal(verifyBook(Buffer.from((await app.ana.get('/api/books/ana/download')).data).toString('utf8'), { regrowOpen: false }).ok, true);
});

test('the edit ops move, resize, link and take away ink on a surface', async () => {
  const res = await writeInk(app.ana, ana, { family: PLASTER, place: { surface: 'wall-left', x: 500, y: 500, scale: 64 } });
  assert.equal(res.status, 201);
  const item = res.data.item;
  const edit = (op) => app.ana.post('/api/books/me/edit', op);
  assert.equal((await edit({ op: 'move', surface: 'wall-left', item, x: 15000, y: 9000 })).status, 200);
  assert.equal((await edit({ op: 'move', surface: 'wall-left', item, x: 99999, y: 0 })).status, 400, 'off the wall');
  assert.equal((await edit({ op: 'resize', surface: 'wall-left', item, scale: 128 })).status, 200);
  assert.equal((await edit({ op: 'link', surface: 'wall-left', item, target_page: 'home' })).status, 200);
  let s = (await app.ana.get('/api/books/me')).data.skeleton;
  const it = s.surfaces['wall-left'].items.find((x) => x.id === item);
  assert.deepEqual([it.x, it.y, it.scale, it.link], [15000, 9000, 128, { page: 'home' }]);
  assert.equal((await edit({ op: 'remove', surface: 'wall-left', item })).status, 200);
  s = (await app.ana.get('/api/books/me')).data.skeleton;
  assert.equal(
    s.surfaces['wall-left'].items.some((x) => x.id === item),
    false,
  );
  assert.equal((await edit({ op: 'move', surface: 'nowhere', item, x: 0, y: 0 })).status, 400);
});

test('the verifier catches a surface item that is not written on its matter', () => {
  const ink = bookInk(ana, { family: FAMILY });
  const head = {
    book: 2,
    name: 'ana',
    key: ink.line.ink.key,
    surfaces: { 'wall-far': { matter: 'plaster', family: PLASTER, size: [10, 10], items: [{ id: 'i1', ink: 'k_000001', x: 0, y: 0, scale: 64 }] } },
    pages: {},
  };
  const line = { id: 'k_000001', made: '2026-01-01T00:00:00.000Z', ink: ink.line.ink, seal: ink.line.seal };
  const v = verifyBook(
    `${JSON.stringify(head)}
${JSON.stringify(line)}
`,
    { regrowOpen: false },
  );
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => p.includes("not written on that surface's matter")));
});

test('one world, one clock (rooms.md §1b): no room keeps a zone of its own', async () => {
  const u = (await app.bo.get('/api/users/ana')).data.user;
  assert.equal('timeZone' in u, false, 'no zone shown with a room');
  assert.equal((await app.ana.post('/api/social/time', { timeZone: 'Asia/Tokyo' })).status, 404, 'none to change');
});

test("doors: writing leads to a page, a surface of the room, or into someone else's room", async () => {
  const res = await writeInk(app.ana, ana, { family: PLASTER, place: { surface: 'wall-near', x: 3000, y: 3000, scale: 64 } });
  assert.equal(res.status, 201);
  const item = res.data.item;
  const edit = (op) => app.ana.post('/api/books/me/edit', op);
  const linkOf = async () => (await app.ana.get('/api/books/me')).data.skeleton.surfaces['wall-near'].items.find((x) => x.id === item).link;
  assert.equal((await edit({ op: 'link', surface: 'wall-near', item, target_surface: 'ceiling' })).status, 200);
  assert.deepEqual(await linkOf(), { surface: 'ceiling' });
  assert.equal((await edit({ op: 'link', surface: 'wall-near', item, target_room: 'Bo' })).status, 200);
  assert.deepEqual(await linkOf(), { room: 'bo' }, 'into their room, by name');
  assert.equal((await edit({ op: 'link', surface: 'wall-near', item, target_room: 'nobody_here' })).status, 400, 'no such room');
  assert.equal((await edit({ op: 'link', surface: 'wall-near', item, target_surface: 'roof' })).status, 400);
  assert.equal((await edit({ op: 'link', surface: 'wall-near', item, target_page: 'home' })).status, 200);
  assert.deepEqual(await linkOf(), { page: 'home' });
});

test("visiting: others read the walls (the scene of a closed sheet), as the profile's privacy allows", async () => {
  const res = await writeInk(app.ana, ana, { family: PLASTER, place: { surface: 'wall-right', x: 8000, y: 7000, scale: 64 } });
  assert.equal(res.status, 201);
  const ink = res.data.ink;
  assert.equal((await app.bo.get(`/api/books/ana/look/${ink}?mode=scene&s=64`)).status, 200, 'a visitor reads the wall');
  assert.equal((await app.bo.get(`/api/books/ana/look/${ink}?s=64`)).status, 200);
  // a private room: only its owner comes in (there are no friends: one-world.md)
  assert.equal((await app.ana.post('/api/social/private', { private: true })).status, 200);
  const stranger = client(app.base);
  assert.notEqual((await stranger.get(`/api/books/ana/look/${ink}?s=64`)).status, 200, 'a stranger cannot read the walls of a private room');
  assert.notEqual((await app.bo.get(`/api/books/ana/look/${ink}?s=64`)).status, 200, 'nor anyone else');
  assert.equal((await app.ana.post('/api/social/private', { private: false })).status, 200);
  assert.equal((await stranger.get(`/api/books/ana/look/${ink}?s=64`)).status, 200);
});
