// Writing together (rooms.md §4, §5, §6): beings in a room, possession by move
// acts, the stamper for shared sheets, and a room asleep when no one is in it.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, FAMILY, K, b64url } from './device.js';
import { shared as SH } from 'penpals-law';
import { lawOf } from 'penpals-law/laws';
import { record, samplePath } from 'penpals-law/tools/fixtures';
import { verifyBook } from 'penpals-law/verify';

let app;
const ana = person(71, 'ana');
const bo = person(72, 'bo');
const cy = person(73, 'cy');
let rooms;

before(async () => {
  app = await startApp();
  for (const p of [ana, bo, cy]) {
    p.c = client(app.base);
    app.resetLimits();
    assert.equal((await register(p.c, p)).status, 201);
  }
  rooms = await import('../src/store/rooms.js');
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
const counter = new Map();
const act = (p, sheet, kind, extra) => {
  const k = (counter.get(p) ?? 0) + 1;
  counter.set(p, k);
  return SH.makeSharedAct({ sk: p.sk, pk: p.pk, sheet, k, act: kind, ...extra });
};
const post = (p, sheet, made) => p.c.post(`/api/shared/${sheet}/acts`, made);

// A room's stream, read as it comes: events gathered; `until(kind, test)` waits for one.
async function stream(p, room) {
  const ctrl = new AbortController();
  const res = await fetch(`${app.base}/api/rooms/${room}/stream`, { headers: p ? { cookie: p.c.cookieHeader() } : {}, signal: ctrl.signal });
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

test('possession: an act on a sheet not on your table is rejected; laid on it, you write; picked up, you are rejected again', async () => {
  const sheet = K.newSheetId();
  const made = SH.makeSharedSheet({ sk: ana.sk, pk: ana.pk, sheet, family: FAMILY });
  assert.equal((await bo.c.post('/api/shared', made)).status, 400, "a shared sheet is its owner's");
  assert.equal((await ana.c.post('/api/shared', made)).status, 201);
  assert.ok(
    (await ana.c.get('/api/shared/mine')).data.sheets.some((s) => s.sheet === sheet && s.on === 'ana'),
    "on its owner's table",
  );
  assert.equal((await post(bo, sheet, act(bo, sheet, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }))).status, 403, "not on bo's table");
  assert.equal((await post(bo, sheet, act(ana, sheet, 'move', { to: b64url(bo.pk) }))).status, 400, 'an act is sealed by its writer');
  const moved = await post(ana, sheet, act(ana, sheet, 'move', { to: b64url(bo.pk) }));
  assert.equal(moved.status, 201);
  assert.equal((await ana.c.get('/api/shared/mine')).data.sheets.find((s) => s.sheet === sheet).on, 'bo', 'its owner sees where it lies');
  const wrote = await post(bo, sheet, act(bo, sheet, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }));
  assert.equal(wrote.status, 201, JSON.stringify(wrote.data));
  assert.equal(wrote.data.line.n, 2);
  assert.equal((await post(cy, sheet, act(cy, sheet, 'stroke', { stroke: strokeAt(30, [30, 40, 200]) }))).status, 403, "not cy's table");
  assert.equal((await post(ana, sheet, act(ana, sheet, 'stroke', { stroke: strokeAt(30, [200, 30, 30]) }))).status, 201, 'the owner still writes on it');
  assert.equal((await post(ana, sheet, act(ana, sheet, 'move', { to: b64url(ana.pk) }))).status, 201, 'picked up');
  assert.equal((await post(bo, sheet, act(bo, sheet, 'stroke', { stroke: strokeAt(40, [30, 40, 200]) }))).status, 403, "the visitor's next act is rejected");
  // a forged seal
  const forged = act(bo, sheet, 'stroke', { stroke: strokeAt(50, [30, 40, 200]) });
  assert.equal((await post(bo, sheet, { ...forged, seal: b64url(new Uint8Array(64)) })).status, 401);
  // the whole of it, as anyone may check it: the chain replays clean and the sheet grows
  const view = (await ana.c.get(`/api/shared/${sheet}`)).data;
  const born = SH.checkBirth(view.birth, view);
  assert.deepEqual(SH.replay(view.birth.key, view.lines).problems, []);
  assert.ok(SH.growShared(view.lines, { seed: born.seed, family: born.family }).facts.length === 32);
  // and in the owner's .book, offline
  const dl = await ana.c.get('/api/books/ana/download');
  const v = verifyBook(Buffer.from(dl.data).toString('utf8'));
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.ok(v.results.some((r) => r.kind === 'shared-sheet' && r.regrown === true));
});

test('writing together: a sheet laid on your table arrives in your room; each act reaches everyone there as stamped', async () => {
  const sheet = K.newSheetId();
  assert.equal((await ana.c.post('/api/shared', SH.makeSharedSheet({ sk: ana.sk, pk: ana.pk, sheet, family: FAMILY }))).status, 201);
  const inBos = await stream(bo, 'bo');
  const anaThere = await stream(ana, 'bo'); // ana visits bo's room to write with them
  await inBos.until('here');
  assert.equal((await post(ana, sheet, act(ana, sheet, 'move', { to: b64url(bo.pk) }))).status, 201);
  const arrived = await inBos.until('table', (d) => d.arrived?.sheet === sheet);
  assert.equal(arrived.data.arrived.owner, 'ana');
  // two writers, one stamper: both screens hear both acts, in one order
  await post(bo, sheet, act(bo, sheet, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }));
  await post(ana, sheet, act(ana, sheet, 'stroke', { stroke: strokeAt(22, [200, 30, 30]) }));
  for (const s of [inBos, anaThere]) {
    const seen = [];
    for (const n of [2, 3]) seen.push((await s.until('shared', (d) => d.sheet === sheet && d.line.n === n)).data.line.n);
    assert.deepEqual(seen, [2, 3]);
  }
  inBos.close();
  anaThere.close();
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
  assert.equal((await bo.c.post('/api/rooms/cy/motion', { pose: { pos: [99, 2, 1], yaw: 0, pitch: 0 } })).status, 400);
  guest.close();
  assert.equal((await host.until('being', (d) => d.kind === 'leave')).data.name, 'bo');
  host.close();
  await settle(200);
  // asleep: nothing is held for an empty room
  const { findByName } = await import('../src/store/accounts.js');
  assert.equal(rooms.awake(findByName('cy').id), false);
  // what the room's chain holds: comings, goings and coarse motion; no eye
  const lines = await rooms.roomLines(findByName('cy').id);
  assert.deepEqual(
    lines.map((l) => [l.by, l.kind]),
    [['cy', 'enter'], ['bo', 'enter'], ...Array(moves).fill(['bo', 'move']), ['bo', 'leave'], ['cy', 'leave']],
  );
  assert.ok(!JSON.stringify(lines).includes('pupil') && !JSON.stringify(lines).includes('adaptation'));
});

test("seals: the owner presses bo's seal (his signature's face) into warm wax and bo writes while it lies on her table; another face is refused; broken, he is refused", async () => {
  const sheet = K.newSheetId();
  assert.equal((await ana.c.post('/api/shared', SH.makeSharedSheet({ sk: ana.sk, pk: ana.pk, sheet, family: FAMILY }))).status, 201);
  const sealed = await ana.c.get('/api/signatures/bo/seal');
  assert.equal(sealed.status, 200, JSON.stringify(sealed.data));
  assert.equal(sealed.data.key, b64url(bo.pk));
  assert.ok(sealed.data.w <= 32 && sealed.data.h <= 32);
  assert.equal((await post(bo, sheet, act(bo, sheet, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }))).status, 403);
  // a pool of hot wax, then the stamper set to bo, pressed while it is warm
  for (const [dx, dy] of [
    [0, 0],
    [120, 0],
    [-120, 0],
    [0, 120],
    [0, -120],
    [90, 90],
    [-90, -90],
    [90, -90],
    [-90, 90],
  ])
    assert.equal((await post(ana, sheet, act(ana, sheet, 'drip', { drip: { x: 2000 + dx, y: 2000 + dy, amt: 400000, heat: 220 } }))).status, 201);
  const press = { x: 2000, y: 2000, depth: 220, angle: 0, tiltX: 0, tiltY: 0, cell: 2, w: sealed.data.w, h: sealed.data.h, face: sealed.data.face, for: b64url(bo.pk) };
  const wrong = await post(ana, sheet, act(ana, sheet, 'press', { press: { ...press, face: b64url(new Uint8Array(sealed.data.w * sealed.data.h).fill(255)) } }));
  assert.equal(wrong.status, 400, 'a face that is not his');
  assert.match(JSON.stringify(wrong.data), /not their seal/);
  const pressed = await post(ana, sheet, act(ana, sheet, 'press', { press }));
  assert.equal(pressed.status, 201, JSON.stringify(pressed.data));
  const wrote = await post(bo, sheet, act(bo, sheet, 'stroke', { stroke: strokeAt(20, [30, 40, 200]) }));
  assert.equal(wrote.status, 201, 'his seal took: he writes on her sheet on her table');
  assert.equal((await post(cy, sheet, act(cy, sheet, 'stroke', { stroke: strokeAt(30, [30, 40, 200]) }))).status, 403, 'no seal of hers');
  const broke = await post(ana, sheet, act(ana, sheet, 'break', { broke: { seal: pressed.data.line.n, from: [1850, 1900], to: [2150, 2100] } }));
  assert.equal(broke.status, 201);
  assert.equal((await post(bo, sheet, act(bo, sheet, 'stroke', { stroke: strokeAt(40, [30, 40, 200]) }))).status, 403, 'broken: refused');
  // the whole of it in her .book verifies offline: the press took, the break, the refusals
  const v = verifyBook(Buffer.from((await ana.c.get('/api/books/ana/download')).data).toString('utf8'));
  assert.equal(v.ok, true, JSON.stringify(v.problems));
});

test('things: a candle picked up is held (no one else takes it), set down it rests where it was put, and the room remembers it after it sleeps', async () => {
  const host = await stream(ana, 'ana');
  await host.until('here');
  const guest = await stream(bo, 'ana');
  await guest.until('here');
  const placeIt = (p, body) => p.c.post('/api/rooms/ana/place', body);
  assert.equal((await placeIt(ana, { thing: 'candle-0', at: null })).status, 200, 'ana picks it up');
  const held = await guest.until('thing', (d) => d.thing === 'candle-0' && d.at === null);
  assert.equal(held.data.by, 'ana');
  assert.equal((await placeIt(bo, { thing: 'candle-0', at: [1, 1, 0.74] })).status, 409, 'held by ana: bo cannot take it');
  assert.equal((await placeIt(ana, { thing: 'candle-0', at: [1.2345678, 2.5, 0.74] })).status, 200, 'set down');
  assert.equal((await placeIt(ana, { thing: 'a-chair', at: [1, 1, 0] })).status, 400, 'not a thing here');
  assert.equal((await placeIt(ana, { thing: 'pen', at: [1, 1] })).status, 400, 'not a place');
  assert.equal((await cy.c.post('/api/rooms/ana/place', { thing: 'pen', at: [1, 1, 0.74] })).status, 409, 'cy is not in the room');
  host.close();
  guest.close();
  await settle(200);
  // asleep, then woken: the candle is where it was set down
  const back = await stream(bo, 'ana');
  const here = await back.until('here');
  assert.deepEqual(here.data.things['candle-0'], { at: [1.235, 2.5, 0.74], by: 'ana' });
  back.close();
});
