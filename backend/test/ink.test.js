import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startApp, client } from './helpers.js';
import { person, register, bookInk, writeInk, FAMILY, K, R, S, b64url } from './device.js';

const VERIFY = fileURLToPath(new URL('../../law/bin/verify.js', import.meta.url));

let app;
const ana = person(11, 'ana');
const bo = person(12, 'bo');
const cy = person(13, 'cy');
const A = () => app.ana;

before(async () => {
  app = await startApp();
  app.ana = client(app.base);
  app.bo = client(app.base);
  app.cy = client(app.base);
  for (const [c, p] of [
    [app.ana, ana],
    [app.bo, bo],
    [app.cy, cy],
  ]) {
    app.resetLimits();
    assert.equal((await register(c, p)).status, 201);
  }
});
after(async () => {
  await app.close();
});
beforeEach(() => app.resetLimits());

test('book ink lands: sealed, seed kept privately, placed, and the look is served to the owner', async () => {
  const res = await writeInk(A(), ana);
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.match(res.data.ink, /^k_\d{6}$/);
  const chain = (await A().get('/api/books/ana/ink')).data
    .toString('utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const line = chain.find((l) => l.id === res.data.ink);
  assert.equal(line.ink.sheet, res.ink.line.ink.sheet);
  assert.equal(line.open, undefined, 'a book sheet is closed');
  assert.ok(!JSON.stringify(chain).includes(res.ink.seedText), 'the seed of a closed sheet is not in the chain');
  const look = await A().get(`/api/books/ana/look/${res.data.ink}`);
  assert.equal(look.status, 200);
  assert.equal(look.headers.get('content-type'), 'image/png');
  assert.equal(look.headers.get('vary'), 'Cookie');
  // the same ink sent again (a retry) is the same ink, not a second one
  const again = await A().post('/api/books/me/ink', { line: res.ink.line, seed: res.ink.seedText });
  assert.equal(again.status, 200);
  assert.equal(again.data.ink, res.data.ink);
  assert.ok(again.data.replay);
});

test('forgeries are refused: seal, seed, commit, facts, sheet reuse, use, key', async () => {
  const good = bookInk(ana);
  const post = (line, seed = good.seedText, c = A()) => c.post('/api/books/me/ink', { line, seed });

  // a seal that is not by this key
  const other = K.skFromK(new Uint8Array(32).fill(7));
  const forged = { ...good.line, seal: b64url(K.sealOf(other, good.D)) };
  assert.equal((await post(forged)).status, 401);
  // a body changed after sealing
  const changed = { ...good.line, ink: { ...good.line.ink, box: [0, 0, 1, 1] } };
  assert.equal((await post(changed)).status, 401);
  // the seed of another sheet
  const elsewhere = bookInk(ana);
  const wrongSeed = await post(good.line, elsewhere.seedText);
  assert.equal(wrongSeed.status, 400);
  assert.equal(wrongSeed.data.code, 'bad_seed');
  // a commit to some other seed, honestly sealed: the seed still has to match it
  const made = R.makeInk({ sk: ana.sk, pk: ana.pk, sheet: K.newSheetId(), use: 'book', family: FAMILY, acts: S.write(ana.writer, 'odd', 3) });
  const badCommit = { ...made.line.ink, commit: b64url(new Uint8Array(32).fill(1)) };
  const resealed = { ink: badCommit, seal: b64url(K.sealOf(ana.sk, K.recordDigest(badCommit))) };
  assert.equal((await post(resealed, b64url(made.seed))).status, 400);
  // facts that are not what the law grows: sealed honestly, but the server regrows and disagrees
  const lie = { ...made.line.ink, facts: b64url(new Uint8Array(32).fill(2)) };
  const lieLine = { ink: lie, seal: b64url(K.sealOf(ana.sk, K.recordDigest(lie))) };
  const mismatch = await post(lieLine, b64url(made.seed));
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.data.code, 'facts_mismatch');
  // the same sheet with other writing
  assert.equal((await post(good.line)).status, 201);
  const reuse = R.makeInk({ sk: ana.sk, pk: ana.pk, sheet: good.line.ink.sheet, use: 'book', family: FAMILY, acts: S.write(ana.writer, 'again', 4) });
  const reused = await post(reuse.line, b64url(reuse.seed));
  assert.equal(reused.status, 409);
  assert.equal(reused.data.code, 'sheet_used');
  // a letter's record sent as book ink
  const letter = bookInk(ana, { use: 'letter' });
  assert.equal((await post(letter.line, letter.seedText)).status, 400);
  // my sealed line sent with someone else's cookie
  const mine = bookInk(ana);
  const stolen = await post(mine.line, mine.seedText, app.bo);
  assert.equal(stolen.status, 403);
  assert.equal(stolen.data.code, 'key_mismatch');
  // another paper family than the book's
  const family = bookInk(ana, { family: { grain: 3, weight: 9, tooth: 0 } });
  assert.equal((await post(family.line, family.seedText)).data.code, 'wrong_paper');
  // signed out
  const anon = client(app.base);
  assert.equal((await post(good.line, good.seedText, anon)).status, 401);
});

test('looks: integer sizes only; visitors see only what is on a page; private, friends, blocks', async () => {
  const placed = await writeInk(A(), ana, { place: { page: 'home', x: 50, y: 60, scale: 80 } });
  assert.equal(placed.status, 201);
  const unplaced = await A().post('/api/books/me/ink', { line: bookInk(ana).line, seed: undefined });
  assert.equal(unplaced.status, 400, 'a closed sheet needs its seed');
  const loose = bookInk(ana);
  const kept = await A().post('/api/books/me/ink', { line: loose.line, seed: loose.seedText });
  assert.equal(kept.status, 201);

  const anon = client(app.base);
  const look = (c, id, s) => c.get(`/api/books/ana/look/${id}${s === undefined ? '' : `?s=${s}`}`);
  assert.equal((await look(anon, placed.data.ink, 80)).status, 200, 'on a page at 80');
  assert.equal((await look(anon, placed.data.ink, 64)).status, 404, 'not shown at 64');
  assert.equal((await look(anon, kept.data.ink, 64)).status, 404, 'not on any page');
  assert.equal((await look(A(), kept.data.ink, 64)).status, 200, 'the owner sees all of their ink');
  for (const s of ['1.5', '0x40', '-64', '3', '641', 'abc']) assert.equal((await look(A(), placed.data.ink, s)).status, 400, `s=${s}`);
  assert.equal((await A().get('/api/books/ana/look/k_999999')).status, 404);

  // private: strangers and anonymous are refused even when the owner has warmed the cache
  assert.equal((await A().get(`/api/books/ana/look/${placed.data.ink}?s=80`)).status, 200);
  assert.equal((await A().post('/api/social/private', { private: true })).status, 200);
  assert.equal((await look(anon, placed.data.ink, 80)).status, 403);
  assert.equal((await look(app.cy, placed.data.ink, 80)).status, 403);
  assert.equal((await anon.get('/api/books/ana')).status, 403);
  // friends see it
  await app.bo.post('/api/users/ana/friend');
  await A().post('/api/users/bo/friend');
  assert.equal((await look(app.bo, placed.data.ink, 80)).status, 200);
  // the signed name is still shown on a private profile
  assert.equal((await anon.get('/api/signatures/ana/look')).status, 200);
  // blocks hide both ways
  await A().post('/api/users/cy/block');
  assert.equal((await app.cy.get('/api/books/ana')).status, 404);
  assert.equal((await app.cy.get('/api/signatures/ana/look')).status, 404);
  assert.equal((await A().get('/api/signatures/cy/look')).status, 404);
  const sigs = await app.cy.get('/api/signatures?names=ana,bo');
  assert.equal(sigs.data.signatures.ana, null);
  assert.ok(sigs.data.signatures.bo.line.open, 'a signature is open from birth');
  await A().del('/api/users/cy/block');
  await A().post('/api/social/private', { private: false });
});

test('open a sheet: the seed is published, signed open, and anyone can then regrow it', async () => {
  const w = await writeInk(A(), ana);
  const sheet = w.ink.line.ink.sheet;
  const bad = await A().post('/api/books/me/open', { sheet, by: b64url(new Uint8Array(64)) });
  assert.equal(bad.status, 401);
  const by = R.makeOpen(ana.sk, w.ink.D, sheet, w.ink.seed).by;
  const ok = await A().post('/api/books/me/open', { sheet, by });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  const chain = (await client(app.base).get('/api/books/ana/ink')).data.toString('utf8');
  assert.ok(chain.includes(w.ink.seedText), 'the opened seed is in the public chain');
  assert.equal((await A().post('/api/books/me/open', { sheet, by })).data.already, true);
});

test("the .book is the owner's, verifies offline, and fails on a one-point tamper", async () => {
  assert.equal((await client(app.base).get('/api/books/ana/download')).status, 403);
  const dl = await A().get('/api/books/ana/download');
  assert.equal(dl.status, 200);
  const file = path.join(app.dir, 'ana.book');
  fs.writeFileSync(file, dl.data);
  const run = (f) => spawnSync(process.execPath, [VERIFY, f, '--json'], { encoding: 'utf8' });
  const ok = run(file);
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const report = JSON.parse(ok.stdout);
  assert.equal(report.ok, true, JSON.stringify(report.problems));
  assert.ok(report.results.length >= 3);
  assert.ok(report.results.filter((r) => r.regrown === true).length >= 2, 'the signature and the opened sheet regrow');
  assert.ok(
    report.results.every((r) => r.sealed || r.kind === 'open'),
    JSON.stringify(report.results),
  );

  // move one act by one tenth inside the signature's acts
  const lines = dl.data.toString('utf8').trim().split('\n');
  const sig = JSON.parse(lines[1]);
  const acts = Buffer.from(sig.ink.acts, 'base64url');
  acts[acts.length - 1] ^= 1;
  sig.ink.acts = acts.toString('base64url');
  lines[1] = JSON.stringify(sig);
  const bent = path.join(app.dir, 'bent.book');
  fs.writeFileSync(bent, `${lines.join('\n')}\n`);
  const fail = run(bent);
  assert.equal(fail.status, 1, fail.stdout);
});

test('the privacy canary: no secret is in any response, request or file', async () => {
  const secrets = [];
  for (const p of [ana, bo, cy]) {
    // the key (it is the master the signatures made), its words and private key, the password, the randomness
    secrets.push(['the key', Buffer.from(p.K).toString('hex')], ['the key', b64url(p.K)], ['the words', p.words], ['the private key', p.privateKey], ['the password', p.password]);
    secrets.push(['r32', b64url(p.secret.r32)], ['r32', Buffer.from(p.secret.r32).toString('hex')]);
    // the first two signatures never leave the device (the third is sheet 0, public)
    for (const a of p.secret.acts) secrets.push(['private strokes', b64url(a)], ['private strokes', Buffer.from(a).toString('latin1')]);
  }
  // closed seeds: every sheet's seed the device made, minus the ones it opened
  const closed = [];
  const w = await writeInk(A(), ana);
  closed.push(w.ink.seedText);
  const closedBytes = closed.map((t) => Buffer.from(t, 'base64url').subarray(0, 24));
  const scan = (where, text) => {
    for (const [what, s] of secrets) assert.ok(!text.includes(s), `${what} found in ${where}`);
  };
  // every request body sent by the test clients
  for (const c of [app.ana, app.bo, app.cy]) for (const b of c.sent) scan('a request body', b.replaceAll(w.ink.seedText, ''));
  // every GET a visitor can make
  const viewers = { owner: app.ana, friend: app.bo, stranger: app.cy, anonymous: client(app.base) };
  const gets = ['/api/auth/me', '/api/users', '/api/users/ana', '/api/books/ana', '/api/books/ana/ink', '/api/signatures?names=ana,bo,cy', '/api/letters/top', '/api/law'];
  // and every ink's scene (heights and colours of the sheet: never its seed or paper), inflated before scanning
  const chainNow = (await app.ana.get('/api/books/ana/ink')).data
    .toString('utf8')
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const scenes = chainNow.filter((l) => l.ink?.kind === 'ink' && l.ink.law >= 2).map((l) => `/api/books/ana/look/${l.id}?mode=scene`);
  assert.ok(scenes.length > 0);
  for (const [who, c] of Object.entries(viewers)) {
    for (const g of [...gets, ...scenes, ...(who === 'owner' ? ['/api/books/ana/download', '/api/social'] : [])]) {
      const r = await c.get(g);
      const inflated = g.includes('mode=scene') && r.status === 200 ? zlib.inflateRawSync(Buffer.from(r.data)) : null;
      for (const body of inflated ? [Buffer.from(r.data), inflated] : [r.data]) {
        const text = Buffer.isBuffer(body) ? body.toString('latin1') : JSON.stringify(body);
        scan(`${who} GET ${g}`, text);
        for (const s of closed) assert.ok(!text.includes(s), `a closed seed was served to ${who} by ${g}`);
        if (Buffer.isBuffer(body)) for (const s of closedBytes) assert.equal(body.indexOf(s), -1, `a closed seed's bytes were served to ${who} by ${g}`);
      }
    }
  }
  // the begin answer (public to anyone who knows a name) carries no secret either
  const begin = await client(app.base).post('/api/auth/begin', { username: 'ana' });
  scan('auth/begin', JSON.stringify(begin.data));
  assert.ok(!JSON.stringify(begin.data).includes('oprfKey'));
  // and every file under data/ (the server's own private files hold no key, words or password)
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(app.dir)) {
    if (f.endsWith('.book')) continue;
    scan(path.relative(app.dir, f), fs.readFileSync(f, 'latin1'));
  }
});

test('films: the sheet being written, for whoever may see its look', async () => {
  const { readFilm } = await import('penpals-law/v1/film');
  const zlib = await import('node:zlib');
  const w = await writeInk(A(), ana, { place: { page: 'home', x: 10, y: 10, scale: 64 } });
  assert.equal(w.status, 201);
  const anon = client(app.base);
  const film = await anon.get(`/api/books/ana/film/${w.data.ink}`);
  assert.equal(film.status, 200);
  const f = readFilm(new Uint8Array(zlib.inflateRawSync(film.data)));
  assert.deepEqual(f.box, w.ink.line.ink.box);
  assert.ok(f.frames.length > 5);
  // ink that is not on a page has no film for visitors
  const loose = bookInk(ana);
  const kept = await A().post('/api/books/me/ink', { line: loose.line, seed: loose.seedText });
  assert.equal((await anon.get(`/api/books/ana/film/${kept.data.ink}`)).status, 404);
  assert.equal((await A().get(`/api/books/ana/film/${kept.data.ink}`)).status, 200);
});
