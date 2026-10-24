// Law v2 on the server: looks age (oak gall darkens) and fade (exposure) at
// view time only, a view counts once per viewer per day, nothing runs or is
// written for a sheet nobody looks at, side and relief views are the writer's
// (or anyone's once the sheet is open), and law 1 ink still lands and looks
// exactly as before.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, client } from './helpers.js';
import { person, register, writeInk } from './device.js';
import { fixtureV2Bytes } from 'penpals-law/tools/fixtures-v2';
import zlib from 'node:zlib';

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

test('oak gall darkens with age at view time; the record and its facts never change', async () => {
  app.setClockOffset(0);
  const res = await writeInk(app.ana, ana, { acts: fixtureV2Bytes('gallLine').bytes });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.ink.line.ink.law, 2, 'new writing is law 2');
  const id = res.data.ink;
  const chainBefore = (await app.ana.get('/api/books/ana/ink')).data.toString('utf8');

  // nobody looks for a month: nothing is written, nothing runs
  const dir = userDirOf('ana');
  const quiet = filesUnder(dir);
  assert.ok(!fs.existsSync(path.join(dir, 'exposure.json')), 'no view yet, no count');
  app.setClockOffset(30 * DAY);
  assert.deepEqual(filesUnder(dir), quiet, 'time passing writes nothing');

  const at = async (days) => {
    app.setClockOffset(days * DAY);
    const r = await app.ana.get(`/api/books/ana/look/${id}`);
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

test('ink without gall does not age; views count once per viewer per day and fade it in steps', async () => {
  app.setClockOffset(0);
  const res = await writeInk(app.ana, ana);
  const id = res.data.ink;
  const look = async (c) => (await c.get(`/api/books/ana/look/${id}`)).headers.get('etag');
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

test('the scene and the side view: heights and colours, never the seed or the paper; not for law 1 ink', async () => {
  app.setClockOffset(0);
  const res = await writeInk(app.ana, ana, { acts: fixtureV2Bytes('gallHairPool').bytes });
  const id = res.data.ink;
  const [x0, y0, w, h] = res.ink.line.ink.box;
  const cut = `${x0},${y0 + (h >> 1)},${x0 + w - 1},${y0 + (h >> 1)}`;
  const side = await app.ana.get(`/api/books/ana/look/${id}?mode=side&cut=${cut}`);
  assert.equal(side.status, 200);
  assert.equal(side.headers.get('content-type'), 'image/png');
  assert.equal((await app.ana.get(`/api/books/ana/look/${id}?mode=side&cut=1,2,3`)).status, 400);
  assert.equal((await app.ana.get(`/api/books/ana/look/${id}?mode=side&cut=0,0,5000,0`)).status, 400);
  assert.equal((await app.ana.get(`/api/books/ana/look/${id}?mode=wobble`)).status, 400);
  // a visitor's scene of a closed sheet: the field the facts make, nothing of the paper, no seed
  const scene = await app.anon.get(`/api/books/ana/look/${id}?mode=scene`);
  assert.equal(scene.status, 200);
  const raw = Buffer.from(scene.data);
  const field = zlib.inflateRawSync(raw);
  const n = res.ink.line.ink.box[2] * res.ink.line.ink.box[3];
  assert.equal(field[4], 2, 'PNKS 2');
  assert.ok(field.length < 21 + n * 10, 'only the cells that hold anything (it decodes to exactly the field of the facts, below)');
  assert.equal(field.subarray(0, 4).toString('latin1'), 'PNKS');
  const seed = Buffer.from(res.ink.seedText, 'base64url');
  for (const b of [raw, field]) {
    assert.equal(b.indexOf(seed.subarray(0, 16)), -1, 'no seed in the scene');
    assert.ok(!b.toString('latin1').includes(res.ink.seedText), 'nor its text');
  }
  // the writer's own device grows the same field from the facts (and only it adds the paper's fibers)
  const { decodeScene, sceneField } = await import('penpals-law/v2/scene');
  const { settle } = await import('penpals-law/record');
  const grownHere = settle(fixtureV2Bytes('gallHairPool').bytes, Buffer.from(res.ink.seedText, 'base64url'), res.ink.line.ink.paper, 64, 2);
  const mine = sceneField(grownHere.cells, grownHere.box, { ageH: 0, views: 0 });
  const served = decodeScene(new Uint8Array(field));
  for (const k of ['surface', 'above', 'depth', 'flags']) assert.deepEqual(served[k], mine[k], k);

  // a pen that throws ink: its acts carry the spatter (PNKA format 2); the server grows the same drops
  const splashy = await writeInk(app.ana, ana, { acts: fixtureV2Bytes('flicks').bytes });
  assert.equal(splashy.status, 201, JSON.stringify(splashy.data));
  assert.equal((await app.ana.get(`/api/books/ana/look/${splashy.data.ink}`)).status, 200);
  await assert.rejects(writeInk(app.ana, ana, { acts: fixtureV2Bytes('flicks').bytes, law: 1 }), /PNKA format/, 'law 1 has no spatter: the device cannot even grow it');

  // law 1 ink still lands, looks as it always did, and has no depth
  const old = await writeInk(app.ana, ana, { law: 1 });
  assert.equal(old.status, 201, JSON.stringify(old.data));
  assert.equal(old.ink.line.ink.law, 1);
  const oldLook = await app.ana.get(`/api/books/ana/look/${old.data.ink}`);
  assert.equal(oldLook.status, 200);
  assert.match(oldLook.headers.get('etag'), /\.L1-r/);
  app.setClockOffset(300 * DAY);
  assert.equal((await app.ana.get(`/api/books/ana/look/${old.data.ink}`)).headers.get('etag'), oldLook.headers.get('etag'), 'law 1 never ages');
  assert.equal((await app.ana.get(`/api/books/ana/look/${old.data.ink}?mode=scene`)).status, 400);
});

test('load by the senses: the scene by window and level of detail, the look by level; who may see is the same', async () => {
  app.setClockOffset(0);
  const res = await writeInk(app.ana, ana, { acts: fixtureV2Bytes('gallHairPool').bytes, place: { page: 'home', x: 40, y: 40, scale: 96 } });
  assert.equal(res.status, 201);
  const id = res.data.ink;
  const [x0, y0, w, h] = res.ink.line.ink.box;
  const { decodeScene, sceneWindow } = await import('penpals-law/v2/scene');
  const sceneOf = async (c, q = '') => {
    const r = await c.get(`/api/books/ana/look/${id}?mode=scene${q}`);
    return { status: r.status, etag: r.headers.get('etag'), field: r.status === 200 ? decodeScene(new Uint8Array(zlib.inflateRawSync(Buffer.from(r.data)))) : null };
  };
  // shown at 96, its scene (grown at the record's own scale, laid over the item) is anyone's who sees the page
  const whole = await sceneOf(app.anon);
  assert.equal(whole.status, 200, 'the scene of writing shown at another size');
  assert.equal((await app.anon.get(`/api/books/ana/look/${id}?s=64`)).status, 404, 'its look only at the size it is shown');
  // a window: those cells, and only those
  const at = [x0 + 5, y0 + 2, 40, 20];
  const part = await sceneOf(app.anon, `&at=${at.join(',')}`);
  assert.equal(part.status, 200);
  const want = sceneWindow(whole.field, at);
  assert.deepEqual(part.field.box, want.box);
  for (const k of ['surface', 'above', 'depth', 'rgba', 'flags']) assert.deepEqual(part.field[k], want[k], k);
  assert.notEqual(part.etag, whole.etag);
  // a level of detail, and both
  const far = await sceneOf(app.anon, '&lod=2');
  assert.equal(far.field.lod, 2);
  assert.deepEqual(far.field.box.slice(2), [Math.ceil((x0 + w) / 4) - Math.floor(x0 / 4), Math.ceil((y0 + h) / 4) - Math.floor(y0 / 4)]);
  const both = await sceneOf(app.anon, `&at=${at.join(',')}&lod=1`);
  for (const k of ['surface', 'above', 'depth', 'rgba', 'flags']) assert.deepEqual(both.field[k], sceneWindow(whole.field, at, 1)[k], k);
  for (const q of ['&at=1,2,3', '&at=0,0,0,5', '&at=a,b,c,d', '&lod=4', '&lod=-1', '&lod=x']) assert.equal((await sceneOf(app.anon, q)).status, 400, q);
  // the flat look at a level of detail: a quarter of the pixels; no windows
  const size = (png) => [png.readUInt32BE(16), png.readUInt32BE(20)];
  const flat = await app.anon.get(`/api/books/ana/look/${id}?s=96`);
  const half = await app.anon.get(`/api/books/ana/look/${id}?s=96&lod=1`);
  assert.equal(half.status, 200);
  const [fw, fh] = size(Buffer.from(flat.data));
  assert.deepEqual(size(Buffer.from(half.data)), [Math.ceil(fw / 2), Math.ceil(fh / 2)]);
  assert.notEqual(half.headers.get('etag'), flat.headers.get('etag'));
  assert.equal((await app.anon.get(`/api/books/ana/look/${id}?s=96&at=0,0,9,9`)).status, 400);
  assert.equal((await app.anon.get(`/api/books/ana/look/${id}?s=96&lod=9`)).status, 400);
  // the same rules: a private book's windows are as closed as the whole
  assert.equal((await app.ana.post('/api/social/private', { private: true })).status, 200);
  assert.equal((await sceneOf(app.anon, `&at=${at.join(',')}`)).status, 403);
  assert.equal((await app.anon.get(`/api/books/ana/look/${id}?s=96&lod=1`)).status, 403);
  assert.equal((await sceneOf(app.ana, `&at=${at.join(',')}`)).status, 200, 'the writer still sees it');
  await app.ana.post('/api/social/private', { private: false });
});
