import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { startApp, client } from './helpers.js';
import { person, register, bookInk, FAMILY, K, R, S, b64url } from './device.js';
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
  // its scene by window and level of detail, its look by level (cleanup-and-speed.md §5b)
  const box = made.line.ink.box;
  assert.equal((await app.bo.get(`/api/letters/${id}/look?mode=scene&at=${box[0]},${box[1]},16,16&lod=1`)).status, 200);
  assert.equal((await app.bo.get(`/api/letters/${id}/look?lod=2`)).status, 200);
  assert.equal((await app.bo.get(`/api/letters/${id}/look?mode=scene&lod=7`)).status, 400);
  // kept on the sender's public profile, anyone who can see that profile reads it
  assert.equal((await app.cy.get(`/api/letters/${id}/line`)).status, 200);
  // once the sender stops keeping it, only its recipient can; the seed is never served
  assert.equal((await app.ana.del(`/api/letters/${id}/save`)).status, 200);
  assert.equal((await app.bo.get(`/api/letters/${id}/line`)).status, 200);
  assert.equal((await app.cy.get(`/api/letters/${id}/line`)).status, 403);
  assert.equal((await client(app.base).get(`/api/letters/${id}/look`)).status, 403);
  assert.equal((await client(app.base).get(`/api/letters/${id}/look?mode=scene&at=0,0,16,16`)).status, 403);
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
