import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startApp, client } from './helpers.js';
import { person, register, signIn, setPassword, K, U, S, b64url, fromB64url } from './device.js';

let app;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});
beforeEach(() => app.resetLimits());

const unlockFile = (username) => {
  const users = path.join(app.dir, 'users');
  for (const id of fs.readdirSync(users)) {
    const a = JSON.parse(fs.readFileSync(path.join(users, id, 'account.json'), 'utf8'));
    if (a.username === username) {
      const f = path.join(users, id, 'unlock.json');
      return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
    }
  }
  throw new Error(`no ${username}`);
};

test('register with three signatures: a session, the key on file; the key, the words and the password never sent', async () => {
  const c = client(app.base);
  const ana = person(1, 'ana');
  const res = await register(c, ana);
  assert.equal(res.status, 201, JSON.stringify(res.data));
  assert.equal(res.data.user.username, 'ana');
  assert.equal(res.data.user.publicKey, b64url(ana.pk));
  assert.match(res.data.user.fingerprint, /^[a-z]+ [a-z]+ [a-z]+ [a-z]+$/);
  assert.ok(c.signedIn());
  const me = await c.get('/api/auth/me');
  assert.equal(me.data.user.username, 'ana');
  assert.equal(me.data.user.passwordBackup, true);
  for (const secret of [ana.password, ana.words, ana.privateKey, b64url(ana.K), Buffer.from(ana.K).toString('hex'), b64url(ana.secret.r32)]) {
    assert.ok(!c.sent.some((b) => b.includes(secret)), 'never sent');
  }
  assert.equal(ana.words.split(' ').length, 24);
});

test('names: taken, reserved, malformed', async () => {
  const c = client(app.base);
  assert.equal((await register(c, person(2, 'ana'))).status, 409);
  assert.equal((await register(c, person(2, 'admin'))).status, 400);
  assert.equal((await register(c, person(2, 'x'))).status, 400);
  assert.deepEqual((await c.get('/api/auth/name/ana')).data, { valid: true, free: false });
});

test('sign in with the password, the 24 words and the private key: the same public key every time; a wrong one opens nothing', async () => {
  const bo = person(3, 'bo');
  assert.equal((await register(client(app.base), bo)).status, 201);
  const pk = b64url(bo.pk);
  for (const by of ['password', 'words', 'key']) {
    const c = client(app.base);
    const res = await signIn(c, bo, { by });
    assert.equal(res.status, 200, `${by}: ${JSON.stringify(res)}`);
    assert.equal(res.publicKey, pk, by);
    assert.equal(res.data.user.publicKey, pk, by);
    assert.ok(c.signedIn());
  }
  // a wrong password: the keyring stays shut (one counted guess)
  assert.equal((await signIn(client(app.base), bo, { password: 'not it' })).step, 'keyring');
  // someone else's words or key: not this account's; the device signs nothing
  const other = person(30, 'other');
  const theirs = K.wordsOf(K.newK());
  assert.equal((await signIn(client(app.base), bo, { by: 'words', words: theirs })).step, 'key');
  assert.equal((await signIn(client(app.base), { ...other, username: 'bo' }, { by: 'key', privateKey: K.privateKeyText(K.newK()) })).step, 'key');
  // and a proof by another key is refused by the server too
  const c = client(app.base);
  const begin = await c.post('/api/auth/begin', { username: 'bo' });
  const proof = K.authProof(K.skFromK(K.newK()), { purpose: 'login', origin: c.origin, nonce: fromB64url(begin.data.nonce, 32), username: '' });
  assert.equal((await c.post('/api/auth/login', { username: 'bo', nonce: begin.data.nonce, origin: c.origin, proof: b64url(proof) })).status, 401);
});

test('no password: the words or the key sign in; the server holds no keyring', async () => {
  const gil = person(9, 'gil', { password: '' });
  assert.equal((await register(client(app.base), gil)).status, 201);
  assert.equal(unlockFile('gil'), null, 'nothing but the public key');
  const c = client(app.base);
  const begin = await c.post('/api/auth/begin', { username: 'gil' });
  assert.equal(begin.data.keyring, null);
  assert.equal((await c.post('/api/auth/unlock', { username: 'gil', nonce: begin.data.nonce, blinded: b64url(new Uint8Array(32)) })).data.code, 'no_password');
  assert.equal((await signIn(client(app.base), gil, { by: 'words' })).status, 200);
  assert.equal((await signIn(client(app.base), gil, { by: 'key' })).status, 200);
  assert.equal((await c.get('/api/auth/me')).data.user, null);
  const me = client(app.base);
  await signIn(me, gil, { by: 'words' });
  assert.equal((await me.get('/api/auth/me')).data.user.passwordBackup, false);
});

test('the password backup can be turned on later, changed and turned off, only by the key', async () => {
  const hal = person(10, 'hal', { password: '' });
  const c = client(app.base);
  assert.equal((await register(c, hal)).status, 201);
  // another key cannot lock it; a challenge for another purpose does not do
  const ev = await c.post('/api/auth/keyring/oprf', { blinded: b64url(U.blindInput(U.unlockInput('hal', 'x y z w')).blinded) });
  assert.equal(ev.status, 200);
  const stranger = { ...hal, sk: K.skFromK(K.newK()) };
  assert.equal((await setPassword(c, stranger, 'a first backup')).status, 401, 'another key cannot lock it');
  const ch = await c.post('/api/auth/challenge', { purpose: 'logout-all' });
  const wrongPurpose = await c.put('/api/auth/keyring', {
    nonce: ch.data.nonce,
    origin: c.origin,
    keyring: null,
    proof: b64url(K.authProof(hal.sk, { purpose: 'keyring', origin: c.origin, nonce: fromB64url(ch.data.nonce, 32), username: '' })),
  });
  assert.equal(wrongPurpose.data.code, 'bad_nonce');
  // on
  const on = await setPassword(c, hal, 'a first backup');
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.equal(on.data.password, true);
  assert.equal((await signIn(client(app.base), hal, { by: 'password' })).status, 200);
  // changed (the guesses so far have used up the hour's five)
  app.resetLimits();
  assert.equal((await setPassword(c, hal, 'a second backup')).status, 200);
  assert.equal((await signIn(client(app.base), hal, { password: 'a first backup' })).step, 'keyring');
  assert.equal((await signIn(client(app.base), hal, { password: 'a second backup' })).status, 200);
  // off: the server keeps no keyring; the words still open it
  app.resetLimits();
  assert.equal((await setPassword(c, hal, '')).data.password, false);
  assert.equal(unlockFile('hal').keyring, null);
  assert.equal((await signIn(client(app.base), hal, { by: 'password', password: 'a second backup' })).code, 'no_password');
  assert.equal((await signIn(client(app.base), hal, { by: 'words' })).status, 200);
  // signed out, none of it
  assert.equal((await client(app.base).post('/api/auth/keyring/oprf', { blinded: b64url(new Uint8Array(32)) })).status, 401);
});

test('no auth route takes or asks for writing to sign in', async () => {
  const ivy = person(11, 'ivy');
  assert.equal((await register(client(app.base), ivy)).status, 201);
  const c = client(app.base);
  const begin = await c.post('/api/auth/begin', { username: 'ivy' });
  assert.deepEqual(Object.keys(begin.data).sort(), ['expiresAt', 'keyring', 'nonce', 'publicKey', 'username']);
  // a login carrying writing (the old login sheet, or strokes) is refused as it stands
  const proof = K.authProof(ivy.sk, { purpose: 'login', origin: c.origin, nonce: fromB64url(begin.data.nonce, 32), username: '' });
  const withWriting = await c.post('/api/auth/login', { username: 'ivy', nonce: begin.data.nonce, origin: c.origin, proof: b64url(proof), login: { body: {}, seal: '' } });
  assert.equal(withWriting.status, 400);
  assert.equal(withWriting.data.code, 'bad_login');
  const acts = await c.post('/api/auth/login', { username: 'ivy', nonce: begin.data.nonce, origin: c.origin, proof: b64url(proof), acts: b64url(S.write(ivy.writer, 'ivy', 1)) });
  assert.equal(acts.data.code, 'bad_login');
  // the hand's routes are gone, and the law says nothing of a hand
  assert.equal((await c.put('/api/auth/sketches', { ops: [] })).status, 404);
  assert.equal((await c.post('/api/auth/challenge', { purpose: 'sketch' })).status, 401);
  assert.equal((await c.get('/api/law')).data.hand, undefined);
  // the password backup holds no hand: one password opener
  assert.deepEqual(
    unlockFile('ivy').keyring.openers.map((o) => o.kind),
    ['password'],
  );
});

test('replays and forgeries are refused: nonce, origin, other key', async () => {
  const cy = person(4, 'cy');
  const c = client(app.base);
  assert.equal((await register(c, cy)).status, 201);
  const begin = await c.post('/api/auth/begin', { username: 'cy' });
  assert.equal(begin.status, 200);
  const nonce = fromB64url(begin.data.nonce, 32);
  const proof = K.authProof(cy.sk, { purpose: 'login', origin: c.origin, nonce, username: '' });
  // a proof for another origin
  const evil = await c.post('/api/auth/login', { username: 'cy', nonce: begin.data.nonce, origin: 'https://evil.example', proof: b64url(proof) });
  assert.equal(evil.status, 403);
  // that nonce was used up by the refused attempt: replaying the right proof now fails too
  const again = await c.post('/api/auth/login', { username: 'cy', nonce: begin.data.nonce, origin: c.origin, proof: b64url(proof) });
  assert.equal(again.status, 400);
  assert.equal(again.data.code, 'bad_nonce');
  // a proof for the register purpose does not sign in
  const b3 = await c.post('/api/auth/begin', { username: 'cy' });
  const asRegister = K.authProof(cy.sk, { purpose: 'register', origin: c.origin, nonce: fromB64url(b3.data.nonce, 32), username: '' });
  assert.equal((await c.post('/api/auth/login', { username: 'cy', nonce: b3.data.nonce, origin: c.origin, proof: b64url(asRegister) })).status, 401);
  // no Origin header at all
  const noOrigin = client(app.base, { origin: null });
  assert.equal((await noOrigin.post('/api/auth/begin', { username: 'cy' })).status, 403);
});

test('a registration signature must be the name, on sheet 0, sealed by the registering key', async () => {
  const c = client(app.base);
  const dee = person(5, 'dee', { password: '' });
  const { R } = await import('./device.js');
  const sigs = [1, 2, 3].map((s) => S.write(dee.writer, 'dee', s));
  const { K: key } = R.accountKey(K.newR32(), sigs);
  const sk = K.skFromK(key);
  const pk = K.publicKeyOf(sk);
  const begin = await c.post('/api/auth/register/begin', { username: 'dee' });
  const made = R.makeInk({ sk, pk, sheet: K.SHEET_ZERO, use: 'signature', family: { grain: 8, weight: 8, tooth: 0 }, acts: S.write(dee.writer, 'eve', 1), name: 'eve' });
  const line = { ...made.line, open: R.makeOpen(sk, made.D, K.SHEET_ZERO, made.seed) };
  const proof = K.authProof(sk, { purpose: 'register', origin: c.origin, nonce: fromB64url(begin.data.nonce, 32), username: 'dee' });
  const res = await c.post('/api/auth/register/finish', { username: 'dee', nonce: begin.data.nonce, origin: c.origin, publicKey: b64url(pk), proof: b64url(proof), line });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'bad_signature');
  // a keyring without a password begun: refused
  const b2 = await c.post('/api/auth/register/begin', { username: 'dee2' });
  const kdf = U.newKdf();
  const ring = U.newKeyring('dee2', key, new Uint8Array(32), kdf);
  const made2 = R.makeInk({ sk, pk, sheet: K.SHEET_ZERO, use: 'signature', family: { grain: 8, weight: 8, tooth: 0 }, acts: sigs[2], name: 'dee2' });
  const proof2 = K.authProof(sk, { purpose: 'register', origin: c.origin, nonce: fromB64url(b2.data.nonce, 32), username: 'dee2' });
  const res2 = await c.post('/api/auth/register/finish', {
    username: 'dee2',
    nonce: b2.data.nonce,
    origin: c.origin,
    publicKey: b64url(pk),
    proof: b64url(proof2),
    keyring: ring,
    line: { ...made2.line, open: R.makeOpen(sk, made2.D, K.SHEET_ZERO, made2.seed) },
  });
  assert.equal(res2.data.code, 'bad_unlock');
});

test('guesses at a password are counted: the sixth in an hour is refused', async () => {
  const ed = person(6, 'ed');
  assert.equal((await register(client(app.base), ed)).status, 201);
  const c = client(app.base, { origin: app.base });
  let last;
  for (let i = 0; i < 6; i++) {
    const begin = await c.post('/api/auth/begin', { username: 'ed' });
    last = await c.post('/api/auth/unlock', { username: 'ed', nonce: begin.data.nonce, blinded: b64url(U.blindInput(U.unlockInput('ed', `guess ${i}`)).blinded) });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});

test('sign out everywhere needs the key', async () => {
  const fi = person(7, 'fi');
  const c1 = client(app.base);
  assert.equal((await register(c1, fi)).status, 201);
  const c2 = client(app.base);
  assert.equal((await signIn(c2, fi, { by: 'words' })).status, 200);
  const ch = await c1.post('/api/auth/challenge', { purpose: 'logout-all' });
  const proof = K.authProof(fi.sk, { purpose: 'logout-all', origin: c1.origin, nonce: fromB64url(ch.data.nonce, 32), username: '' });
  const out = await c1.post('/api/auth/logout-all', { nonce: ch.data.nonce, origin: c1.origin, proof: b64url(proof) });
  assert.equal(out.status, 200);
  assert.equal(out.data.ended, 2);
  assert.equal((await c2.get('/api/auth/me')).data.user, null);
});

test('a held name and a challenge both expire', async () => {
  const { holdName, takeHeld, isHeld, sweepHeld } = await import('../src/store/unlock.js');
  const { issueNonce, takeNonce } = await import('../src/store/nonces.js');
  const { config } = await import('../src/config.js');
  const c = client(app.base);
  const begin = await c.post('/api/auth/register/begin', { username: 'gus' });
  assert.equal(begin.status, 200);
  // while held, nobody else can start on that name
  assert.equal((await client(app.base).post('/api/auth/register/begin', { username: 'GUS' })).data.code, 'name_pending');
  assert.equal((await c.get('/api/auth/name/gus')).data.free, false);
  const later = Date.now() + config.auth.pendingTtlMs + 1;
  assert.equal(isHeld('gus', later), false);
  assert.throws(
    () => takeHeld('gus', begin.data.nonce, later),
    (e) => e.code === 'not_held',
  );
  sweepHeld(later);
  assert.equal(isHeld('gus'), false, 'swept');
  holdName('gus', 'x'); // and it can be held again
  // a challenge past its time is refused, and used up
  const { nonce } = issueNonce('login', 'someone');
  assert.throws(
    () => takeNonce(nonce, 'login', 'someone', Date.now() + config.auth.nonceTtlMs + 1),
    (e) => e.code === 'bad_nonce',
  );
  assert.throws(
    () => takeNonce(nonce, 'login', 'someone'),
    (e) => e.code === 'bad_nonce',
  );
});
