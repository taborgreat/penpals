// A book's ink (keys.md; Tabor, 2026-10-25): the signature (open from birth, signed again whenever its writer
// likes) and every paper they made (law/paper.js: open from birth too). Forgeries are refused; the .book is
// its owner's and checks offline with the law's own verifier; and no secret is ever in a response, a request
// or a file.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startApp, client } from './helpers.js';
import { person, register, FAMILY, K, R, S, b64url } from './device.js';
import { paper as P } from 'penpals-law';

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

// A signature of p's on a fresh sheet, open from birth.
const signatureOf = (p, { name = p.username, family = FAMILY, acts = S.write(p.writer, name, 3), sheet = K.newSheetId(), use = 'signature' } = {}) => {
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet, use, family, acts, name });
  return { ...made, line: { ...made.line, open: R.makeOpen(p.sk, made.D, sheet, made.seed) } };
};

test('signing again: it becomes the signature; forgeries are refused: seal, open, commit, facts, sheet reuse, use, key, name', async () => {
  const put = (line, c = A()) => c.put('/api/books/me/signature', { line });
  const good = signatureOf(ana);
  // a seal that is not by this key
  const other = K.skFromK(new Uint8Array(32).fill(7));
  assert.equal((await put({ ...good.line, seal: b64url(K.sealOf(other, good.D)) })).status, 401);
  // a body changed after sealing
  assert.equal((await put({ ...good.line, ink: { ...good.line.ink, box: [0, 0, 1, 1] } })).status, 401);
  // opened by another key, or with another sheet's seed
  const elsewhere = signatureOf(ana);
  assert.notEqual((await put({ ...good.line, open: elsewhere.line.open })).status, 201);
  // facts that are not what the law grows: sealed honestly, but the server regrows and disagrees
  const lie = { ...good.line.ink, facts: b64url(new Uint8Array(32).fill(2)) };
  const lieD = K.recordDigest(lie);
  const mismatch = await put({ ink: lie, seal: b64url(K.sealOf(ana.sk, lieD)), open: R.makeOpen(ana.sk, lieD, lie.sheet, good.seed) });
  assert.equal(mismatch.status, 422);
  assert.equal(mismatch.data.code, 'facts_mismatch');
  // not a signature, not their name, not their key
  assert.equal((await put(signatureOf(ana, { use: 'book' }).line)).status, 400);
  assert.equal((await put(signatureOf(ana, { name: 'bo' }).line)).data.code, 'bad_signature');
  assert.equal((await put(good.line, app.bo)).data.code, 'key_mismatch');
  assert.equal((await put(good.line, client(app.base))).status, 401, 'signed out');
  // it lands, and is theirs now; again, the same: once
  const landed = await put(good.line);
  assert.equal(landed.status, 201, JSON.stringify(landed.data));
  assert.equal((await A().get('/api/books/ana')).data.signature, landed.data.ink);
  assert.equal((await put(good.line)).status, 200, 'the same again: a retry');
  // the same sheet with other writing
  const reused = await put(signatureOf(ana, { sheet: good.line.ink.sheet, acts: S.write(ana.writer, 'ana', 5) }).line);
  assert.equal(reused.status, 409);
  assert.equal(reused.data.code, 'sheet_used');
});

test("the .book is its owner's, verifies offline with the law's verifier, and fails on a one-point tamper", async () => {
  const paper = K.newSheetId();
  assert.equal((await A().post('/api/papers', P.makePaper({ sk: ana.sk, pk: ana.pk, paper, family: FAMILY, at: [1.5, 2.9, 0.74] }))).status, 201);
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
  assert.ok(
    report.results.every((r) => r.sealed),
    JSON.stringify(report.results),
  );
  assert.ok(report.results.some((r) => r.kind === 'paper'));
  // move one act by one tenth inside the signature's acts
  const lines = dl.data.toString('utf8').trim().split('\n');
  const sig = JSON.parse(lines[1]);
  const acts = Buffer.from(sig.ink.acts, 'base64url');
  acts[acts.length - 1] ^= 1;
  sig.ink.acts = acts.toString('base64url');
  lines[1] = JSON.stringify(sig);
  const bent = path.join(app.dir, 'bent.book');
  fs.writeFileSync(bent, `${lines.join('\n')}\n`);
  assert.equal(run(bent).status, 1);
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
  const scan = (where, text) => {
    for (const [what, s] of secrets) assert.ok(!text.includes(s), `${what} found in ${where}`);
  };
  // every request body sent by the test clients
  for (const c of [app.ana, app.bo, app.cy]) for (const b of c.sent) scan('a request body', b);
  // every GET a visitor can make
  const viewers = { owner: app.ana, other: app.bo, stranger: app.cy, anonymous: client(app.base) };
  const gets = ['/api/auth/me', '/api/users/ana', '/api/books/ana', '/api/books/ana/ink', '/api/signatures?names=ana,bo,cy', '/api/law', `/api/papers/in/${b64url(ana.pk)}`, '/api/world'];
  for (const [who, c] of Object.entries(viewers)) {
    for (const g of [...gets, ...(who === 'owner' ? ['/api/books/ana/download', '/api/social', '/api/papers/held', '/api/papers/book'] : [])]) {
      const r = await c.get(g);
      scan(`${who} GET ${g}`, Buffer.isBuffer(r.data) ? r.data.toString('latin1') : JSON.stringify(r.data));
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
