import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, FAMILY, K, R, S } from './device.js';

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
