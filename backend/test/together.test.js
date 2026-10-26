// Together in a house (rooms.md §4; law/paper.js): beings in a room, papers lying in it, carried between
// houses, written on by whoever may mark them, posted and saved into books; and a room asleep when no one
// is in it.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, FAMILY, K, b64url } from './device.js';
import { paper as P, room as R, world as WORLD, outside as O } from 'penpals-law';
import { lawOf } from 'penpals-law/laws';
import { record, samplePath } from 'penpals-law/tools/fixtures';
import { verifyBook } from 'penpals-law/verify';

let app;
const ana = person(71, 'ana');
const bo = person(72, 'bo');
const cy = person(73, 'cy');
let rooms, accounts; // (the backend's own modules: after startApp has set its data dir)

before(async () => {
  app = await startApp();
  for (const p of [ana, bo, cy]) {
    p.c = client(app.base);
    app.resetLimits();
    assert.equal((await register(p.c, p)).status, 201);
  }
  rooms = await import('../src/store/rooms.js');
  accounts = await import('../src/store/accounts.js');
});
after(async () => {
  await app.close();
});
beforeEach(() => app.resetLimits());

const L = lawOf(2);
const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
const strokeAt = (y, rgb) => {
  const r = record([{ path: samplePath(line(20, y, 60, y), () => 40), pen: { nib: 0, size: 50, flex: 0, flow: 9, rgb, angle: 0 }, start: 0 }], [0, 0]);
  return L.encodeActs(r);
};
// A being's act on a paper, sealed by its key, counted on per paper.
const counter = new Map();
const act = (p, paper, kind, extra = {}) => {
  const id = `${p.username}>${paper}`;
  counter.set(id, (counter.get(id) ?? 0) + 1);
  return P.makePaperAct({ sk: p.sk, pk: p.pk, paper, k: counter.get(id), act: kind, ...extra });
};
const post = (p, paper, made) => p.c.post(`/api/papers/${paper}/acts`, made);
// where on a house's table (room m), and where on its floor
const TABLE = R.tableOf();
const onTable = (dx = 0) => [(TABLE.x0 + TABLE.x1) / 2 + dx, (TABLE.y0 + TABLE.y1) / 2, TABLE.top + 0.1];
const onFloor = [0.5, 0.5, 1];
// A new paper of p's, on their own table: → its id
async function newPaper(p, at = onTable()) {
  const paper = K.newSheetId();
  const r = await p.c.post('/api/papers', P.makePaper({ sk: p.sk, pk: p.pk, paper, family: FAMILY, at }));
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return paper;
}
// carried by p from where it lies and let go in a space, at a place
async function carry(p, paper, space, at) {
  assert.equal((await post(p, paper, act(p, paper, 'take'))).status, 201);
  const put = await post(p, paper, act(p, paper, 'put', { space, at }));
  assert.equal(put.status, 201, JSON.stringify(put.data));
}
// A being's act on a room's things, sealed by its key (law/room.js), counted on per room.
const roomK = new Map();
const roomAct = (p, owner, a) => {
  const id = `${p.username}>${owner.username}`;
  roomK.set(id, (roomK.get(id) ?? 0) + 1);
  return R.makeRoomAct({ sk: p.sk, pk: p.pk, room: b64url(owner.pk), k: roomK.get(id), ...a });
};
const doIn = (p, owner, made) => p.c.post(`/api/rooms/${owner.username}/act`, made);

// A room's stream, read as it comes: events gathered; `until(kind, test)` waits for one.
async function stream(p, room, url = `/api/rooms/${room}/stream`) {
  const ctrl = new AbortController();
  const res = await fetch(`${app.base}${url}`, { headers: p ? { cookie: p.c.cookieHeader() } : {}, signal: ctrl.signal });
  assert.equal(res.status, 200);
  const events = [];
  const waiting = [];
  (async () => {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.*)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (!ev) continue;
          const e = { kind: ev, data: JSON.parse(data) };
          events.push(e);
          for (const w of [...waiting]) if (w.test(e)) w.resolve(e);
        }
      }
    } catch {
      /* closed */
    }
  })();
  return {
    events,
    until: (kind, test = () => true, ms = 5000) =>
      new Promise((resolve, reject) => {
        const have = events.find((e) => e.kind === kind && test(e.data));
        if (have) return resolve(have);
        const w = { test: (e) => e.kind === kind && test(e.data), resolve };
        waiting.push(w);
        setTimeout(() => reject(new Error(`no ${kind} event`)), ms);
      }),
    close: () => ctrl.abort(),
  };
}
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

test("a paper: born on its maker's table; anyone takes it up; carried to bo's table he writes on it, off it he does not; its houses' chains say where it lies", async () => {
  const paper = await newPaper(ana);
  const keyOf = (p) => b64url(p.pk);
  assert.ok(
    (await bo.c.get(`/api/papers/in/${keyOf(ana)}`)).data.papers.some((v) => v.paper === paper && v.owner === 'ana'),
    'lying in her house',
  );
  assert.equal((await post(bo, paper, act(bo, paper, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }))).status, 403, 'not his');
  await carry(ana, paper, keyOf(bo), onTable());
  const v = (await cy.c.get(`/api/papers/${paper}`)).data;
  assert.deepEqual([v.where.space, v.where.at[2]], [keyOf(bo), Math.round(TABLE.top * 1000)], "on bo's table");
  const wrote = await post(bo, paper, act(bo, paper, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }));
  assert.equal(wrote.status, 201, JSON.stringify(wrote.data));
  assert.equal((await post(cy, paper, act(cy, paper, 'stroke', { stroke: strokeAt(30, [30, 40, 200]) }))).status, 403, "not cy's table");
  assert.equal((await post(ana, paper, act(ana, paper, 'stroke', { stroke: strokeAt(40, [200, 30, 30]) }))).status, 201, 'its owner, wherever it lies');
  // the room chains: it left hers, came to rest in his
  const lays = async (p) => (await rooms.roomLines(accounts.findByName(p.username).id)).filter((l) => l.kind === 'lay' && l.paper === paper);
  assert.deepEqual(
    (await lays(ana)).map((l) => l.rest === null),
    [false, true],
    'born in hers, then gone from it',
  );
  assert.equal((await lays(bo)).at(-1).rest[2], Math.round(TABLE.top * 1000), 'resting in his');
  await carry(bo, paper, keyOf(bo), onFloor);
  assert.equal((await post(bo, paper, act(bo, paper, 'stroke', { stroke: strokeAt(50, [30, 40, 200]) }))).status, 403, 'on his floor: no longer');
  // and in its maker's .book, offline: it replays, it grows
  const dl = await ana.c.get('/api/books/ana/download');
  const book = verifyBook(Buffer.from(dl.data).toString('utf8'));
  assert.equal(book.ok, true, JSON.stringify(book.problems));
  assert.ok(book.results.some((r) => r.kind === 'paper' && r.regrown === true));
});

test('writing together: every act on a paper lying in a house reaches everyone there as stamped', async () => {
  const paper = await newPaper(ana);
  await carry(ana, paper, b64url(bo.pk), onTable());
  const s = await stream(cy, 'bo');
  await s.until('papers', (d) => d.papers.some((v) => v.paper === paper));
  const made = act(bo, paper, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) });
  assert.equal((await post(bo, paper, made)).status, 201);
  const told = await s.until('paper', (d) => d.paper.paper === paper && d.line?.act.act === 'stroke');
  assert.deepEqual(told.data.line.act, made.act, 'as stamped');
  s.close();
});

test("the mail: posted from the hand into bo's mailbox, it is his; its flag is up; only he takes letters out, the oldest first, into his hand", async () => {
  const first = await newPaper(ana, onTable(-0.2));
  const second = await newPaper(ana, onTable(0.2));
  const flag = async () => (await cy.c.get(`/api/papers/mailbox/${b64url(bo.pk)}`)).data.letters;
  const was = await flag();
  assert.equal((await post(ana, first, act(ana, first, 'post', { to: b64url(bo.pk) }))).status, 403, 'posted from the hand');
  for (const paper of [first, second]) {
    assert.equal((await post(ana, paper, act(ana, paper, 'take'))).status, 201);
    assert.equal((await post(ana, paper, act(ana, paper, 'post', { to: b64url(bo.pk) }))).status, 201);
  }
  assert.equal(await flag(), was + 2, 'two more letters wait: its flag up');
  const box = (await bo.c.get('/api/papers/mailbox')).data.papers;
  assert.deepEqual(
    box.slice(-2).map((v) => [v.paper, v.owner]),
    [
      [first, 'bo'],
      [second, 'bo'],
    ],
    'his now, in the order they came',
  );
  assert.equal((await post(cy, first, act(cy, first, 'take'))).status, 403, "not cy's mailbox");
  for (const v of box.slice(0, -2)) await post(bo, v.paper, act(bo, v.paper, 'take')); // (older letters out first)
  assert.equal((await post(bo, second, act(bo, second, 'take'))).status, 409, 'the oldest comes out first');
  assert.equal((await post(bo, first, act(bo, first, 'take'))).status, 201);
  assert.ok(
    (await bo.c.get('/api/papers/held')).data.papers.some((v) => v.paper === first),
    'in his hand',
  );
  assert.equal((await post(bo, first, act(bo, first, 'put', { space: b64url(bo.pk), at: onTable() }))).status, 201);
  assert.equal((await post(bo, first, act(bo, first, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }))).status, 201, 'his to write on');
});

test("a seal: ana presses bo's name into it (no wax needed: the press is enough), and he may write on it wherever it lies; broken, he may not", async () => {
  const paper = await newPaper(ana);
  const face = new Uint8Array(4 * 4).fill(255);
  const press = { x: 2000, y: 2000, depth: 200, angle: 0, tiltX: 0, tiltY: 0, cell: 2, w: 4, h: 4, face, for: b64url(bo.pk) };
  assert.equal((await post(bo, paper, act(bo, paper, 'press', { press }))).status, 403, 'only its owner presses');
  assert.equal((await post(ana, paper, act(ana, paper, 'press', { press }))).status, 201);
  const n = (await ana.c.get(`/api/papers/${paper}`)).data.lines.at(-1).n;
  assert.equal((await post(bo, paper, act(bo, paper, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }))).status, 201, 'by his seal, on her table');
  await carry(ana, paper, 'outside', [3, 4, 2]);
  assert.equal((await post(bo, paper, act(bo, paper, 'stroke', { stroke: strokeAt(30, [30, 40, 200]) }))).status, 201, 'outside too');
  assert.equal((await post(ana, paper, act(ana, paper, 'break', { broke: { seal: n, from: [1900, 1900], to: [2100, 2100] } }))).status, 201);
  assert.equal((await post(bo, paper, act(bo, paper, 'stroke', { stroke: strokeAt(40, [30, 40, 200]) }))).status, 403, 'broken: no longer');
  assert.ok(
    (await cy.c.get('/api/papers/in/outside')).data.papers.some((v) => v.paper === paper),
    'lying outside, for anyone to see',
  );
});

test('a book: ana saves a paper from her hand into her book, at a path; it is there and nowhere else; only she takes it out', async () => {
  const paper = await newPaper(ana);
  assert.equal((await post(ana, paper, act(ana, paper, 'take'))).status, 201);
  assert.equal((await post(bo, paper, act(bo, paper, 'shelve', { book: ['letters'] }))).status, 403);
  assert.equal((await post(ana, paper, act(ana, paper, 'shelve', { book: ['journal', 'october'] }))).status, 201);
  const mine = (await ana.c.get('/api/papers/book')).data.papers.find((v) => v.paper === paper);
  assert.deepEqual(mine.where, { book: ['journal', 'october'] });
  assert.ok(!(await bo.c.get(`/api/papers/in/${b64url(ana.pk)}`)).data.papers.some((v) => v.paper === paper), 'not lying in her house');
  assert.equal((await post(bo, paper, act(bo, paper, 'take'))).status, 403, 'in her book');
  assert.equal((await post(ana, paper, act(ana, paper, 'take'))).status, 201);
});

test('one world: each being where it is, in world m, whichever house it came by; out of doors too; a door opened from outside', async () => {
  // their houses in the world (as registering places them: law/world.js)
  const plotOf = async (p) => {
    const key = b64url(p.pk);
    let h = (await ana.c.get('/api/world')).data.houses.find((x) => x.key === key);
    if (!h) {
      const r = await p.c.post('/api/world/acts', WORLD.sealWorldAct(p.sk, WORLD.houseAct(key)));
      assert.equal(r.status, 201, JSON.stringify(r.data));
      h = (await ana.c.get('/api/world')).data.houses.find((x) => x.key === key);
    }
    return h.plot;
  };
  const [anaPlot, boPlot] = [await plotOf(ana), await plotOf(bo)];
  const w = await stream(null, null, '/api/world/beings');
  await w.until('beings');
  const inAna = await stream(ana, 'ana');
  const inBo = await stream(bo, 'bo');
  await w.until('being', (d) => d.kind === 'enter' && d.name === 'bo');
  const near = (a, b) => a.every((v, k) => Math.abs(v - b[k]) < 2e-3);
  // ana at her table; bo out of his door, three metres out
  assert.equal((await ana.c.post('/api/rooms/ana/motion', { pose: { pos: [1.5, 1.0, 1.6], yaw: 0, pitch: 0 } })).status, 200);
  assert.equal((await bo.c.post('/api/rooms/bo/motion', { pose: { pos: [1.5, -3, 1.6], yaw: 180, pitch: 0 } })).status, 200, 'out of doors: still a place in the world');
  const seenAna = await w.until('being', (d) => d.kind === 'move' && d.name === 'ana');
  const seenBo = await w.until('being', (d) => d.kind === 'move' && d.name === 'bo');
  assert.ok(near(seenAna.data.pose.pos, O.frameOf(anaPlot).toWorld([1.5, 1.0, 1.6])), 'ana, where her house stands');
  assert.ok(near(seenBo.data.pose.pos, O.frameOf(boPlot).toWorld([1.5, -3, 1.6])), 'bo, out in front of his');
  assert.equal(seenBo.data.house, b64url(bo.pk));
  // bo, out in the world, opens ana's door: it is reached from outside; everyone watching the world sees it open
  const open = R.makeRoomAct({ sk: bo.sk, pk: bo.pk, room: b64url(ana.pk), k: 900, act: 'open', thing: 'door' });
  assert.equal((await bo.c.post('/api/rooms/ana/act', open)).status, 200);
  assert.equal((await w.until('opens', (d) => d.house === b64url(ana.pk))).data.opens.door, true);
  const shut = R.makeRoomAct({ sk: bo.sk, pk: bo.pk, room: b64url(ana.pk), k: 901, act: 'shut', thing: 'door' }); // (and shut behind him)
  assert.equal((await bo.c.post('/api/rooms/ana/act', shut)).status, 200);
  inAna.close();
  inBo.close();
  w.close();
});

test('beings: entering, moving coarsely (the neck law applied), leaving; an empty room sleeps; the eye is never recorded', async () => {
  const host = await stream(cy, 'cy');
  await host.until('here');
  const guest = await stream(bo, 'cy');
  const here = await guest.until('here');
  assert.deepEqual(
    here.data.beings.map((b) => b.name),
    ['cy'],
  );
  assert.equal((await host.until('being', (d) => d.kind === 'enter')).data.name, 'bo');
  // a turn of the head past the neck's reach: the body comes with it
  const r = await bo.c.post('/api/rooms/cy/motion', { pose: { pos: [1.5, 2.0, 1.2], yaw: 120, pitch: 5, body: 0, pupil: 7, adaptation: 0.4 } });
  assert.equal(r.status, 200);
  assert.equal(r.data.stamped, true);
  const moved = await host.until('being', (d) => d.kind === 'move');
  assert.deepEqual(moved.data.pose, { pos: [1.5, 2, 1.2], yaw: 120, pitch: 5, body: 50, size: 1 });
  // two at once: not faster than five a second (the one before may be long past on a busy machine)
  const quick = await Promise.all([1.6, 1.7].map((x) => bo.c.post('/api/rooms/cy/motion', { pose: { pos: [x, 2.0, 1.2], yaw: 120, pitch: 5, body: 50 } })));
  assert.ok(
    quick.some((r) => r.data.stamped === false),
    'not faster than five a second',
  );
  const moves = 1 + quick.filter((r) => r.data.stamped).length;
  assert.equal((await bo.c.post('/api/rooms/cy/motion', { pose: { pos: [1e9, 2, 1], yaw: 0, pitch: 0 } })).status, 400);
  guest.close();
  assert.equal((await host.until('being', (d) => d.kind === 'leave', rooms.LINGER_MS + 5000)).data.name, 'bo');
  host.close();
  // asleep: nothing is held for an empty room (once the last one's linger is over and its leave is stamped)
  const { findByName } = await import('../src/store/accounts.js');
  const asleepBy = Date.now() + rooms.LINGER_MS + 5000;
  await settle(rooms.LINGER_MS);
  while (rooms.awake(findByName('cy').id) && Date.now() < asleepBy) await settle(50);
  assert.equal(rooms.awake(findByName('cy').id), false);
  // what the room's chain holds: comings, goings and coarse motion; no eye
  const lines = await rooms.roomLines(findByName('cy').id);
  assert.deepEqual(
    lines.map((l) => [l.by, l.kind]),
    [['cy', 'enter'], ['bo', 'enter'], ...Array(moves).fill(['bo', 'move']), ['bo', 'leave'], ['cy', 'leave']],
  );
  assert.ok(!JSON.stringify(lines).includes('pupil') && !JSON.stringify(lines).includes('adaptation'));
});

test('things: acts sealed by their being; a candle picked up is held (no one else takes it or tilts it), set down it rests where it was put, and the room remembers it after it sleeps', async () => {
  const host = await stream(ana, 'ana');
  await host.until('here');
  const guest = await stream(bo, 'ana');
  await guest.until('here');
  const place = (p, thing, to) => doIn(p, ana, roomAct(p, ana, { act: 'place', thing, to }));
  const up = roomAct(ana, ana, { act: 'place', thing: 'candle-0', to: null });
  assert.equal((await doIn(ana, ana, up)).status, 200, 'ana picks it up');
  assert.equal((await doIn(ana, ana, up)).status, 409, 'the same act again: stamped already');
  const held = await guest.until('thing', (d) => d.thing === 'candle-0' && d.at === null);
  assert.equal(held.data.by, 'ana');
  assert.equal((await place(bo, 'candle-0', [1, 1, 0.74])).status, 409, 'held by ana: bo cannot take it');
  assert.equal((await doIn(bo, ana, roomAct(bo, ana, { act: 'tilt', thing: 'candle-0', pos: [1, 1, 0.9], deg: 30 }))).status, 409, 'nor tilt it');
  assert.equal((await doIn(bo, ana, roomAct(ana, ana, { act: 'out', thing: 'candle-1' }))).status, 400, "bo sends ana's act: not his");
  const forged = roomAct(bo, ana, { act: 'place', thing: 'pen', to: null });
  assert.equal((await doIn(bo, ana, { act: { ...forged.act, k: forged.act.k + 50 }, seal: forged.seal })).status, 401, 'not sealed as sent');
  assert.equal((await place(ana, 'candle-0', [1.2345678, 2.5, 0.74])).status, 200, 'set down');
  const body = { v: 2, kind: 'room', room: b64url(ana.pk), by: b64url(ana.pk), k: 900, act: 'place' };
  assert.equal((await doIn(ana, ana, { act: { ...body, thing: 'a-chair', to: [1000, 1000, 0] }, seal: forged.seal })).status, 400, 'not a thing here');
  assert.equal((await doIn(ana, ana, { act: { ...body, thing: 'pen', to: [1000, 1000] }, seal: forged.seal })).status, 400, 'not a place');
  assert.equal((await doIn(cy, ana, roomAct(cy, ana, { act: 'place', thing: 'pen', to: [1, 1, 0.74] }))).status, 409, 'cy is not in the room');
  host.close();
  guest.close();
  await settle(rooms.LINGER_MS + 200);
  // asleep, then woken: the candle is where it was set down
  const back = await stream(bo, 'ana');
  const here = await back.until('here');
  assert.deepEqual(here.data.things['candle-0'], { at: [1.235, 2.5, 0.74], by: 'ana' });
  back.close();
});

test("pens: a pen's settings are its facts: set only by the hand holding it, told to everyone in the room, kept when the room sleeps", async () => {
  const host = await stream(ana, 'ana');
  await host.until('here');
  const guest = await stream(bo, 'ana');
  await guest.until('here');
  const FLEX = { hairline: 14, maxWidth: 14, swell: 25, slant: 55, flow: 9, spatter: 3, color: '#22336a', dip: true };
  const set = (p, thing, s) => doIn(p, ana, roomAct(p, ana, { act: 'set', thing, set: s }));
  assert.equal((await set(ana, 'pen-flex', FLEX)).status, 409, 'lying on the table: pick it up first');
  assert.equal((await doIn(ana, ana, roomAct(ana, ana, { act: 'place', thing: 'pen-flex', to: null }))).status, 200, 'ana picks up the flex nib');
  assert.equal((await set(bo, 'pen-flex', FLEX)).status, 409, 'bo is not holding it');
  assert.equal((await set(ana, 'pen-flex', FLEX)).status, 200);
  const told = await guest.until('thing', (d) => d.thing === 'pen-flex' && d.set);
  assert.deepEqual(told.data.set, FLEX, 'bo sees what she set it to');
  assert.equal((await doIn(ana, ana, roomAct(ana, ana, { act: 'place', thing: 'pen-flex', to: [1.7, 2.8, 0.74] }))).status, 200, 'and sets it down');
  host.close();
  guest.close();
  await settle(rooms.LINGER_MS + 200);
  const back = await stream(bo, 'ana');
  const here = await back.until('here');
  assert.deepEqual(here.data.things['pen-flex'], { at: [1.7, 2.8, 0.74], by: 'ana', set: FLEX }, 'where it lies, as it is set');
  back.close();
});

test('the window: opened and shut by acts (anyone in the room), told to everyone, kept when the room sleeps', async () => {
  const host = await stream(ana, 'ana');
  await host.until('here');
  const guest = await stream(bo, 'ana');
  await guest.until('here');
  const win = (p, act) => doIn(p, ana, roomAct(p, ana, { act, thing: 'window' }));
  assert.equal((await win(ana, 'shut')).status, 409, 'it is shut already');
  assert.equal((await win(bo, 'open')).status, 200, 'bo opens it');
  assert.equal((await host.until('thing', (d) => d.thing === 'window')).data.open, true, 'ana is told');
  assert.equal((await win(ana, 'open')).status, 409, 'open already');
  assert.throws(() => roomAct(ana, ana, { act: 'open', thing: 'candle-0' }), /only a window/, 'a candle is not opened');
  host.close();
  guest.close();
  await settle(rooms.LINGER_MS + 200);
  const back = await stream(bo, 'ana');
  assert.equal((await back.until('here')).data.things.window.open, true, 'still open');
  back.close();
});

test('the shutters stand open and the door shut until someone does otherwise; each by an act', async () => {
  const host = await stream(ana, 'ana');
  await host.until('here');
  const act = (a, thing) => doIn(ana, ana, roomAct(ana, ana, { act: a, thing }));
  assert.equal((await act('open', 'shutters')).status, 409, 'open already');
  assert.equal((await act('shut', 'door')).status, 409, 'shut already');
  assert.equal((await act('shut', 'shutters')).status, 200);
  assert.equal((await act('open', 'door')).status, 200);
  assert.equal((await host.until('thing', (d) => d.thing === 'door')).data.open, true);
  host.close();
});

test("a house's wall: its owner writes on it as on paper (each stroke an act, stamped); it is that house's, told with what lies there; one of each, and no one takes it up", async () => {
  const paper = K.newSheetId();
  const born = P.makeSurface({ sk: ana.sk, pk: ana.pk, paper, surface: 'wall-left' });
  assert.equal((await ana.c.post('/api/papers', born)).status, 201);
  const again = P.makeSurface({ sk: ana.sk, pk: ana.pk, paper: K.newSheetId(), surface: 'wall-left' });
  assert.equal((await ana.c.post('/api/papers', again)).status, 409, 'one left wall to a house');
  assert.equal((await post(ana, paper, act(ana, paper, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }))).status, 201);
  assert.equal((await post(bo, paper, act(bo, paper, 'stroke', { stroke: strokeAt(30, [30, 40, 200]) }))).status, 403, 'not his wall');
  assert.equal((await post(bo, paper, act(bo, paper, 'take'))).status, 403, 'part of her house');
  const there = (await cy.c.get(`/api/papers/in/${b64url(ana.pk)}`)).data.papers.find((v) => v.paper === paper);
  assert.deepEqual(there.where, { space: b64url(ana.pk), surface: 'wall-left' });
  assert.equal(there.lines.length, 1);
});
