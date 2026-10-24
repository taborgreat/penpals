import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startApp, client } from './helpers.js';
import { person, register, FAMILY, K, R, S, b64url, fromB64url } from './device.js';

const VERIFY = fileURLToPath(new URL('../../law/bin/verify.js', import.meta.url));
let app;
const ana = person(41, 'ana');
const bo = person(42, 'bo');

before(async () => {
  app = await startApp();
  app.ana = client(app.base);
  app.bo = client(app.base);
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

// What bo's device does with an ask: derive the sheet and phrase, write it, seal, open.
function answerOf(p, challenge, { sheet, phrase } = K.proofOf(fromB64url(challenge, 32), p.pk)) {
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet, use: 'proof', family: FAMILY, acts: S.write(p.writer, phrase, 3), proof: { challenge, phrase } });
  return { ...made.line, open: R.makeOpen(p.sk, made.D, sheet, made.seed) };
}

test('a live proof: asked, answered on the sheet the ask names, checked offline', async () => {
  const ask = await app.ana.post('/api/proofs', { to: 'bo' });
  assert.equal(ask.status, 201, JSON.stringify(ask.data));
  const { id, challenge } = ask.data.proof;
  const pending = await app.bo.get('/api/proofs/pending');
  assert.ok(pending.data.proofs.some((p) => p.id === id));
  // nobody else sees it
  assert.equal((await client(app.base).get(`/api/proofs/${id}`)).status, 401);

  const answer = await app.bo.post(`/api/proofs/${id}/answer`, { line: answerOf(bo, challenge) });
  assert.equal(answer.status, 200, JSON.stringify(answer.data));
  assert.equal((await app.bo.post(`/api/proofs/${id}/answer`, { line: answerOf(bo, challenge) })).status, 409);

  const bundle = await app.ana.get(`/api/proofs/${id}`);
  assert.equal(bundle.status, 200);
  assert.equal(bundle.data.of.key, b64url(bo.pk));
  assert.equal((await app.ana.get(`/api/proofs/${id}/look`)).status, 200);
  const file = path.join(app.dir, 'proof.json');
  fs.writeFileSync(file, JSON.stringify(bundle.data));
  const v = spawnSync(process.execPath, [VERIFY, file, '--json'], { encoding: 'utf8' });
  assert.equal(v.status, 0, v.stdout);
  assert.equal(JSON.parse(v.stdout).regrown, true);
  // a bundle with another key named is refused offline
  fs.writeFileSync(file, JSON.stringify({ ...bundle.data, of: { ...bundle.data.of, key: b64url(ana.pk) } }));
  assert.equal(spawnSync(process.execPath, [VERIFY, file], { encoding: 'utf8' }).status, 1);
});

test('wrong answers are refused: another sheet, another phrase, another key, not open', async () => {
  const { id, challenge } = (await app.ana.post('/api/proofs', { to: 'bo' })).data.proof;
  const right = K.proofOf(fromB64url(challenge, 32), bo.pk);
  const elsewhere = answerOf(bo, challenge, { sheet: `p${'a'.repeat(26)}`, phrase: right.phrase });
  assert.equal((await app.bo.post(`/api/proofs/${id}/answer`, { line: elsewhere })).data.code, 'wrong_proof');
  const otherWords = answerOf(bo, challenge, { sheet: right.sheet, phrase: 'able baker cable dog' });
  assert.equal((await app.bo.post(`/api/proofs/${id}/answer`, { line: otherWords })).data.code, 'wrong_proof');
  const closed = answerOf(bo, challenge);
  delete closed.open;
  assert.equal((await app.bo.post(`/api/proofs/${id}/answer`, { line: closed })).status, 401);
  // ana cannot answer an ask made of bo
  assert.equal((await app.ana.post(`/api/proofs/${id}/answer`, { line: answerOf(ana, challenge) })).status, 404);
  // asking yourself, or no one
  assert.equal((await app.ana.post('/api/proofs', { to: 'ana' })).status, 400);
  assert.equal((await app.ana.post('/api/proofs', { to: 'nobody' })).status, 404);
});
