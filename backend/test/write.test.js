import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { startApp, client } from './helpers.js';
import { person, register, signIn, bookInk, writeInk, FAMILY, K, R, H, S, b64url, fromB64url } from './device.js';
import { encodePng } from 'penpals-law/tools/png';

let app;
const ana = person(21, 'ana');
const bo = person(22, 'bo');
const cy = person(23, 'cy');

before(async () => {
  app = await startApp();
  app.ana = client(app.base);
  app.bo = client(app.base);
  app.cy = client(app.base);
  for (const [c, p] of [[app.ana, ana], [app.bo, bo], [app.cy, cy]]) {
    app.resetLimits();
    assert.equal((await register(c, p)).status, 201);
  }
});
after(async () => { await app.close(); });
beforeEach(() => app.resetLimits());

const padLetter = (p, { sheet = K.newSheetId(), acts = S.write(p.writer, 'dear friend', 3) } = {}) => {
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet, use: 'letter', family: FAMILY, acts });
  return { made, body: { line: made.line, seed: b64url(made.seed), background: 'plain', page: { width: 800, height: 1100 } } };
};

test('a pad letter: sealed, grown from its own private seed, seen by its recipient only', async () => {
  const { made, body } = padLetter(ana);
  const sent = await app.ana.post('/api/letters', { ...body, to: 'bo' });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const id = sent.data.letter.id;
  assert.equal(sent.data.letter.kind, 'pad');
  // the recipient sees the record and the look
  const inbox = await app.bo.get('/api/letters/inbox');
  assert.ok(inbox.data.letters.some((l) => l.id === id));
  const line = await app.bo.get(`/api/letters/${id}/line`);
  assert.equal(line.status, 200);
  assert.deepEqual(line.data.line, made.line);
  assert.equal((await app.bo.get(`/api/letters/${id}/look`)).status, 200);
  // kept on the sender's public profile, anyone who can see that profile reads it
  assert.equal((await app.cy.get(`/api/letters/${id}/line`)).status, 200);
  // once the sender stops keeping it, only its recipient can; the seed is never served
  assert.equal((await app.ana.del(`/api/letters/${id}/save`)).status, 200);
  assert.equal((await app.bo.get(`/api/letters/${id}/line`)).status, 200);
  assert.equal((await app.cy.get(`/api/letters/${id}/line`)).status, 403);
  assert.equal((await client(app.base).get(`/api/letters/${id}/look`)).status, 403);
  assert.ok(!JSON.stringify(line.data).includes(body.seed));
  // its sheet cannot hold other writing, in a letter or in the book
  const again = padLetter(ana, { sheet: made.line.ink.sheet, acts: S.write(ana.writer, 'other', 4) });
  assert.equal((await app.ana.post('/api/letters', again.body)).status, 409);
  const asBook = bookInk(ana, { sheet: made.line.ink.sheet });
  assert.equal((await app.ana.post('/api/books/me/ink', { line: asBook.line, seed: asBook.seedText })).data.code, 'sheet_used');
  // a book record sent as a letter
  const book = bookInk(ana);
  assert.equal((await app.ana.post('/api/letters', { ...body, line: book.line, seed: book.seedText })).data.code, 'wrong_use');
  // sealed by someone else's key
  const theirs = padLetter(bo);
  assert.equal((await app.ana.post('/api/letters', theirs.body)).data.code, 'key_mismatch');
});

test('a photo letter: the seal names the exact scan and strokes', async () => {
  const png = Buffer.from(encodePng(4, 3, new Uint8Array(4 * 3 * 4).fill(200)));
  const raw = Buffer.alloc(13);
  raw.write('PNPS', 0, 'ascii');
  raw[4] = 2;
  raw.writeUInt16LE(4, 5);
  raw.writeUInt16LE(3, 7);
  raw.writeUInt32LE(0, 9);
  const strokes = zlib.deflateSync(raw);
  const send = (line, files = { png, strokes }) => {
    const form = new FormData();
    form.append('ink', new Blob([files.png], { type: 'image/png' }), 'ink.png');
    if (files.strokes) form.append('strokes', new Blob([files.strokes]), 'ink.strokes');
    form.append('line', JSON.stringify(line));
    return app.ana.upload('/api/letters/photo', form);
  };
  const made = R.makePhoto({ sk: ana.sk, pk: ana.pk, sheet: K.newSheetId(), size: [4, 3], png, strokes });
  const ok = await send(made.line);
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.letter.kind, 'photo');
  // another scan under that seal
  const other = Buffer.from(encodePng(4, 3, new Uint8Array(4 * 3 * 4).fill(10)));
  const swapped = R.makePhoto({ sk: ana.sk, pk: ana.pk, sheet: K.newSheetId(), size: [4, 3], png, strokes });
  assert.equal((await send(swapped.line, { png: other, strokes })).data.code, 'bad_hash');
  // the size it seals must be the scan's
  const sized = R.makePhoto({ sk: ana.sk, pk: ana.pk, sheet: K.newSheetId(), size: [5, 3], png, strokes });
  assert.equal((await send(sized.line)).data.code, 'bad_size');
  // a seal by another key
  const forged = { ...made.line, ink: { ...made.line.ink, sheet: K.newSheetId() } };
  assert.equal((await send(forged)).status, 401);
});

test('sign again: a new open signature on a fresh sheet becomes the profile signature', async () => {
  const before = (await client(app.base).get('/api/signatures?names=ana')).data.signatures.ana.ink;
  const sheet = K.newSheetId();
  const made = R.makeInk({ sk: ana.sk, pk: ana.pk, sheet, use: 'signature', family: FAMILY, acts: S.write(ana.writer, 'ana', 11), name: 'ana' });
  const line = { ...made.line, open: R.makeOpen(ana.sk, made.D, sheet, made.seed) };
  const res = await app.ana.put('/api/books/me/signature', { line });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  const after = (await client(app.base).get('/api/signatures?names=ana')).data.signatures.ana;
  assert.notEqual(after.ink, before);
  assert.equal(after.ink, res.data.ink);
  assert.equal((await client(app.base).get('/api/signatures/ana/look')).status, 200);
  // someone else's name
  const wrong = R.makeInk({ sk: ana.sk, pk: ana.pk, sheet: K.newSheetId(), use: 'signature', family: FAMILY, acts: S.write(ana.writer, 'bo', 11), name: 'bo' });
  const wline = { ...wrong.line, open: R.makeOpen(ana.sk, wrong.D, wrong.line.ink.sheet, wrong.seed) };
  assert.equal((await app.ana.put('/api/books/me/signature', { line: wline })).data.code, 'bad_signature');
  // a signature must be open: without its seed it is refused
  assert.equal((await app.ana.put('/api/books/me/signature', { line: made.line })).status, 401);
  // sheet 0 is the registration's alone
  const zero = R.makeInk({ sk: ana.sk, pk: ana.pk, sheet: K.SHEET_ZERO, use: 'signature', family: FAMILY, acts: S.write(ana.writer, 'ana', 12), name: 'ana' });
  assert.equal((await app.ana.put('/api/books/me/signature', { line: { ...zero.line, open: R.makeOpen(ana.sk, zero.D, K.SHEET_ZERO, zero.seed) } })).data.code, 'bad_sheet');
});

test('sketches: refresh after a login, add a rhythm, a sketch that has opened the account outlasts new ones', async () => {
  const c = client(app.base);
  const res = await signIn(c, bo, { session: 8 });
  assert.equal(res.status, 200);
  const begin = (await c.post('/api/auth/begin', { username: 'bo' })).data;
  const phrase = begin.sketches.find((s) => s.kind === 'phrase');
  const sketchOps = async (ops) => {
    const ch = await c.post('/api/auth/challenge', { purpose: 'sketch' });
    const proof = K.authProof(bo.sk, { purpose: 'sketch', origin: c.origin, nonce: fromB64url(ch.data.nonce, 32), username: '' });
    return c.put('/api/auth/sketches', { nonce: ch.data.nonce, origin: c.origin, proof: b64url(proof), ops });
  };
  // refresh the sketch that opened it, from this login's reading
  const fresh = H.refreshSketch(phrase, res.r, res.reading);
  const refreshed = await sketchOps([{ op: 'refresh', sketch: fresh }]);
  assert.equal(refreshed.status, 200, JSON.stringify(refreshed.data));
  const now = (await c.post('/api/auth/begin', { username: 'bo' })).data.sketches.find((s) => s.id === phrase.id);
  assert.equal(now.helper, fresh.helper);
  // the refreshed sketch still opens with the next writing
  assert.equal((await signIn(client(app.base), bo, { session: 9 })).status, 200);
  // a phone rhythm, then fill to the cap: the least recently used goes first, the one in use stays
  const phoneReadings = [1, 2, 3].map((s) => H.readingOf('phrase', S.write(bo.writer, bo.phrase, s, 'phone')));
  for (let i = 0; i < 5; i++) {
    const added = await sketchOps([{ op: 'add', sketch: H.makeSketch('phrase', res.r, phoneReadings) }]);
    assert.equal(added.status, 200, JSON.stringify(added.data));
  }
  const after = (await c.post('/api/auth/begin', { username: 'bo' })).data.sketches;
  assert.equal(after.filter((s) => s.kind === 'phrase').length, 5);
  assert.ok(after.some((s) => s.id === phrase.id), 'the sketch used most recently is kept');
  assert.equal(after.filter((s) => s.kind === 'page').length, 1);
  // malformed sketches and unsigned changes are refused
  assert.equal((await sketchOps([{ op: 'add', sketch: { id: 'x' } }])).status, 400);
  const ch = await c.post('/api/auth/challenge', { purpose: 'sketch' });
  const other = K.skFromK(new Uint8Array(32).fill(5));
  const unsigned = await c.put('/api/auth/sketches', { nonce: ch.data.nonce, origin: c.origin, proof: b64url(K.authProof(other, { purpose: 'sketch', origin: c.origin, nonce: fromB64url(ch.data.nonce, 32), username: '' })), ops: [{ op: 'refresh', sketch: fresh }] });
  assert.equal(unsigned.status, 401);
});

test('a login sheet cannot be replayed for another challenge', async () => {
  const c = client(app.base);
  const res = await signIn(c, cy, { session: 6 });
  assert.equal(res.status, 200);
  // capture what was sent and send its login sheet again with a fresh challenge
  const sent = JSON.parse(c.sent.at(-1));
  const begin = await c.post('/api/auth/begin', { username: 'cy' });
  const proof = K.authProof(cy.sk, { purpose: 'login', origin: c.origin, nonce: fromB64url(begin.data.nonce, 32), username: '' });
  const replay = await c.post('/api/auth/login', { ...sent, nonce: begin.data.nonce, proof: b64url(proof) });
  assert.equal(replay.status, 400);
  assert.equal(replay.data.code, 'bad_login');
  // the raw sheet sent twice with its own nonce: the nonce is gone
  const twice = await client(app.base).post('/api/auth/login', sent);
  assert.equal(twice.data.code, 'bad_nonce');
  void crypto;
});
