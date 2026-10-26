// Law v2 on the server: a signature's look ages (oak gall darkens, by the light its house has had: rooms.md
// §1b, lit only while a being is in it) and fades (exposure) at view time only, a view counts once per viewer
// per day, and nothing runs or is written for a signature nobody looks at.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, client } from './helpers.js';
import { person, register, FAMILY, K, R, S } from './device.js';
import { fixtureV2Bytes } from 'penpals-law/tools/fixtures-v2';

const DAY = 24 * 60 * 60 * 1000;
let app;
const ana = person(41, 'ana');
const bo = person(42, 'bo');

before(async () => {
  app = await startApp();
  app.ana = client(app.base);
  app.bo = client(app.base);
  app.anon = client(app.base);
  for (const [c, p] of [
    [app.ana, ana],
    [app.bo, bo],
  ]) {
    app.resetLimits();
    assert.equal((await register(c, p)).status, 201);
  }
});
after(async () => {
  await app.close();
});
beforeEach(() => app.resetLimits());

const filesUnder = (dir) =>
  fs
    .readdirSync(dir, { recursive: true })
    .map((f) => path.join(dir, String(f)))
    .filter((f) => fs.statSync(f).isFile())
    .map((f) => `${f}:${fs.statSync(f).mtimeMs}`)
    .sort();
const userDirOf = (name) => {
  const users = path.join(app.dir, 'users');
  return path.join(
    users,
    fs.readdirSync(users).find((id) => JSON.parse(fs.readFileSync(path.join(users, id, 'account.json'), 'utf8')).username === name),
  );
};

// Someone came into a house (or left it) at `ms`: a line of its room's chain, as the stamper writes it.
let roomN = 0;
const goes = (name, by, kind, ms) => fs.appendFileSync(path.join(userDirOf(name), 'room.chain'), `${JSON.stringify({ n: ++roomN, at: new Date(ms).toISOString(), by, kind })}\n`);
// p signs their name again (routes/books.js), in these acts: → the response, its ink the signature's id
async function sign(c, p, acts = S.write(p.writer, p.username, 3)) {
  const sheet = K.newSheetId();
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet, use: 'signature', family: FAMILY, acts, name: p.username });
  const res = await c.put('/api/books/me/signature', { line: { ...made.line, open: R.makeOpen(p.sk, made.D, sheet, made.seed) } });
  return { ...res, line: made.line };
}
const lookOf = (c, name) => c.get(`/api/signatures/${name}/look`);

test('oak gall darkens with the light its house has had, at view time; the record and its facts never change', async () => {
  app.setClockOffset(0);
  goes('ana', 'ana', 'enter', Date.now() - 60000); // ana is home (and stays): her house is lit all along
  const res = await sign(app.ana, ana, fixtureV2Bytes('gallLine').bytes);
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.line.ink.law, 2, 'new writing is law 2');
  const chainBefore = (await app.ana.get('/api/books/ana/ink')).data.toString('utf8');

  // nobody looks for a month: nothing is written, nothing runs
  const dir = userDirOf('ana');
  const quiet = filesUnder(dir);
  assert.ok(!fs.existsSync(path.join(dir, 'exposure.json')), 'no view yet, no count');
  app.setClockOffset(30 * DAY);
  assert.deepEqual(filesUnder(dir), quiet, 'time passing writes nothing');

  const at = async (days) => {
    app.setClockOffset(days * DAY);
    const r = await lookOf(app.ana, 'ana');
    assert.equal(r.status, 200);
    return { etag: r.headers.get('etag'), png: Buffer.from(r.data).toString('base64') };
  };
  const fresh = await at(0);
  const day = await at(1);
  const week = await at(7);
  const month = await at(30);
  const later = await at(400);
  assert.match(fresh.etag, /\.L2-a0-e0-/);
  assert.match(day.etag, /\.L2-a24-e0-/);
  assert.notEqual(fresh.png, day.png, 'a day darkens it');
  assert.notEqual(day.png, week.png);
  assert.notEqual(week.png, month.png);
  assert.equal(later.etag.replace(/-e\d+/, ''), month.etag.replace(/-e\d+/, ''), 'past the cap the age bucket stays');
  assert.equal(later.png, month.png, 'and the look with it');
  const chainAfter = (await app.ana.get('/api/books/ana/ink')).data.toString('utf8');
  assert.equal(chainAfter, chainBefore, 'the chain (and its facts) is the same at every age');
});

test('light is the clock: in a house nobody is in, oak gall rests; it darkens only while someone is there', async () => {
  app.setClockOffset(0);
  assert.equal((await sign(app.bo, bo, fixtureV2Bytes('gallLine').bytes)).status, 201);
  // bo comes home on day 31, for a day, and leaves again
  goes('bo', 'bo', 'enter', Date.now() + 31 * DAY);
  goes('bo', 'bo', 'leave', Date.now() + 32 * DAY);
  const look = async (days) => {
    app.setClockOffset(days * DAY);
    return (await lookOf(app.bo, 'bo')).headers.get('etag');
  };
  assert.match(await look(30), /.L2-a0-/, 'a month in an empty house: a tomb, unchanged');
  assert.match(await look(40), /.L2-a24-/, 'one day lit: one day of darkening');
});

test('ink without gall does not age; views count once per viewer per day and fade it in steps', async () => {
  app.setClockOffset(0);
  const id = (await sign(app.ana, ana)).data.ink;
  const look = async (c) => (await lookOf(c, 'ana')).headers.get('etag');
  const views = () => JSON.parse(fs.readFileSync(path.join(userDirOf('ana'), 'exposure.json'), 'utf8'))[id];
  const first = await look(app.ana);
  for (let i = 0; i < 10; i++) await look(app.ana);
  assert.equal(views(), 1, 'ten refreshes by one viewer in a day are one view');
  app.setClockOffset(10 * DAY);
  assert.equal((await look(app.ana)).replace(/-e\d+/, ''), first.replace(/-e\d+/, ''), 'no gall: the age does not enter the look');
  assert.equal(views(), 2, 'a new day, a new view');
  await look(app.bo);
  await look(app.bo);
  assert.equal(views(), 3, 'another viewer');
  // many days of views reach the next exposure bucket: the look fades a step
  for (let d = 11; d < 17; d++) {
    app.setClockOffset(d * DAY);
    await look(app.ana);
  }
  const faded = await look(app.bo);
  assert.equal(views(), 10, 'six more days of ana, and bo on the last');
  assert.match(faded, /-e8-/, 'views are drawn in steps of 8');
});
