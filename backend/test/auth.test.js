import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, client } from './helpers.js';
import { person, register, signIn, K, U, H, b64url, fromB64url } from './device.js';

let app;
before(async () => {
  app = await startApp();
});
after(async () => {
  await app.close();
});
beforeEach(() => app.resetLimits());

test('register by writing your name: one request pair, a session, a key on file, no password anywhere', async () => {
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
  // the password never left the device
  assert.ok(!c.sent.some((b) => b.includes(ana.password)));
});

test('names: taken, reserved, malformed', async () => {
  const c = client(app.base);
  assert.equal((await register(c, person(2, 'ana'))).status, 409);
  assert.equal((await register(c, person(2, 'admin'))).status, 400);
  assert.equal((await register(c, person(2, 'x'))).status, 400);
  assert.deepEqual((await c.get('/api/auth/name/ana')).data, { valid: true, free: false });
});

test('sign in: write the phrase, type the password; a wrong password or hand opens nothing', async () => {
  const bo = person(3, 'bo');
  assert.equal((await register(client(app.base), bo)).status, 201);
  const c = client(app.base);
  const ok = await signIn(c, bo, { session: 6 });
  assert.equal(ok.status, 200, JSON.stringify(ok));
  assert.ok(c.signedIn());
  // hand only: the hand opened r, but r with the wrong password does not open the keyring
  const handOnly = await signIn(client(app.base), bo, { session: 7, password: 'not it' });
  assert.equal(handOnly.step, 'keyring');
  // password only: no reading of the hand, so every r is a guess, and each guess is a counted round trip
  const c3 = client(app.base);
  const begin = await c3.post('/api/auth/begin', { username: 'bo' });
  const guess = U.unlockInput('bo', new Uint8Array(6), bo.password);
  const { blind, blinded } = U.blindInput(guess);
  const un = await c3.post('/api/auth/unlock', { username: 'bo', nonce: begin.data.nonce, blinded: [b64url(blinded)] });
  assert.equal(un.status, 200);
  const key = U.unlockKey(U.finalizeOutput(guess, blind, fromB64url(un.data.evaluated[0], 32)), begin.data.keyring.kdf);
  assert.equal(U.openKeyring(begin.data.keyring, 'bo', key), null);
  // the wrong phrase in the right hand reads too far from every sketch
  const wrongPhrase = await signIn(client(app.base), { ...bo, phrase: 'lantern copper meadow seven' }, { session: 6 });
  assert.notEqual(wrongPhrase.status, 200);
  // the server learned nothing it could check a guess against offline: no check value for r
  assert.deepEqual(Object.keys(begin.data.sketches[0]).sort(), ['code', 'hand', 'helper', 'id', 'kind', 'offsets']);
});

test('replays and forgeries are refused: nonce, origin, other key', async () => {
  const cy = person(4, 'cy');
  const c = client(app.base);
  assert.equal((await register(c, cy)).status, 201);
  // a used register nonce cannot be used again
  const begin = await c.post('/api/auth/begin', { username: 'cy' });
  assert.equal(begin.status, 200);
  const nonce = fromB64url(begin.data.nonce, 32);
  const proof = K.authProof(cy.sk, { purpose: 'login', origin: c.origin, nonce, username: '' });
  // a proof for another origin
  const evil = await c.post('/api/auth/login', { username: 'cy', nonce: begin.data.nonce, origin: 'https://evil.example', proof: b64url(proof), login: {} });
  assert.equal(evil.status, 403);
  // that nonce was used up by the refused attempt: replaying the right proof now fails too
  const again = await c.post('/api/auth/login', { username: 'cy', nonce: begin.data.nonce, origin: c.origin, proof: b64url(proof), login: {} });
  assert.equal(again.status, 400);
  assert.equal(again.data.code, 'bad_nonce');
  // a proof by another key, with a fresh nonce
  const b2 = await c.post('/api/auth/begin', { username: 'cy' });
  const other = K.skFromK(new Uint8Array(32).fill(9));
  const bad = await c.post('/api/auth/login', {
    username: 'cy',
    nonce: b2.data.nonce,
    origin: c.origin,
    proof: b64url(K.authProof(other, { purpose: 'login', origin: c.origin, nonce: fromB64url(b2.data.nonce, 32), username: '' })),
    login: {},
  });
  assert.equal(bad.status, 401);
  // no Origin header at all
  const noOrigin = client(app.base, { origin: null });
  assert.equal((await noOrigin.post('/api/auth/begin', { username: 'cy' })).status, 403);
});

test('a registration signature must be the name, on sheet 0, sealed by the registering key', async () => {
  const c = client(app.base);
  const dee = person(5, 'dee');
  const { R, H, U, S } = await import('./device.js');
  // build a registration by hand with a signature naming someone else
  dee.K = K.newK();
  dee.sk = K.skFromK(dee.K);
  dee.pk = K.publicKeyOf(dee.sk);
  const r = H.newR();
  const sketches = [
    H.makeSketch(
      'phrase',
      r,
      [1, 2, 3].map((s) => H.readingOf('phrase', S.write(dee.writer, dee.phrase, s))),
    ),
    H.makeSketch('page', r, [H.readingOf('page', S.write(dee.writer, 'the quick brown fox', 1))]),
  ];
  const input = U.unlockInput('dee', r, dee.password);
  const { blind, blinded } = U.blindInput(input);
  const begin = await c.post('/api/auth/register/begin', { username: 'dee', blinded: b64url(blinded) });
  const kdf = U.newKdf();
  const keyring = U.newKeyring('dee', dee.K, U.unlockKey(U.finalizeOutput(input, blind, fromB64url(begin.data.evaluated, 32)), kdf), kdf);
  const made = R.makeInk({ sk: dee.sk, pk: dee.pk, sheet: K.SHEET_ZERO, use: 'signature', family: { grain: 8, weight: 8, tooth: 0 }, acts: S.write(dee.writer, 'eve', 1), name: 'eve' });
  const line = { ...made.line, open: R.makeOpen(dee.sk, made.D, K.SHEET_ZERO, made.seed) };
  const proof = K.authProof(dee.sk, { purpose: 'register', origin: c.origin, nonce: fromB64url(begin.data.nonce, 32), username: 'dee' });
  const res = await c.post('/api/auth/register/finish', { username: 'dee', nonce: begin.data.nonce, origin: c.origin, publicKey: b64url(dee.pk), proof: b64url(proof), keyring, sketches, line });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'bad_signature');
});

test('unlock attempts are counted: the sixth in an hour is refused', async () => {
  const ed = person(6, 'ed');
  assert.equal((await register(client(app.base), ed)).status, 201);
  const c = client(app.base, { origin: app.base });
  let last;
  for (let i = 0; i < 6; i++) {
    const begin = await c.post('/api/auth/begin', { username: 'ed' });
    last = await c.post('/api/auth/unlock', { username: 'ed', nonce: begin.data.nonce, blinded: [b64url(fromB64url(begin.data.sketches[0].helper).subarray(0, 32))] });
  }
  assert.equal(last.status, 429);
  assert.ok(Number(last.headers.get('retry-after')) > 0);
});

test('sign out everywhere needs the key', async () => {
  const fi = person(7, 'fi');
  const c1 = client(app.base);
  assert.equal((await register(c1, fi)).status, 201);
  const c2 = client(app.base);
  assert.equal((await signIn(c2, fi, { session: 4 })).status, 200);
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
  const gus = person(8, 'gus');
  const { blinded } = U.blindInput(U.unlockInput('gus', H.newR(), gus.password));
  const begin = await c.post('/api/auth/register/begin', { username: 'gus', blinded: b64url(blinded) });
  assert.equal(begin.status, 200);
  // while held, nobody else can start on that name
  assert.equal((await client(app.base).post('/api/auth/register/begin', { username: 'GUS', blinded: b64url(blinded) })).data.code, 'name_pending');
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

test('no password: name, phrase and hand open it; turning a password backup on makes it needed', async () => {
  const gil = person(9, 'gil', { password: '' });
  assert.equal((await register(client(app.base), gil)).status, 201);
  const c = client(app.base);
  const begin = await c.post('/api/auth/begin', { username: 'gil' });
  assert.equal(U.usesPassword(begin.data.keyring), false);
  const ok = await signIn(c, gil, { session: 5 });
  assert.equal(ok.status, 200, JSON.stringify(ok));

  // The backup on: the device recovers r by writing the phrase (done above), asks the
  // server's OPRF for (name, r, new password), and locks the key again.
  const b2 = await c.post('/api/auth/begin', { username: 'gil' });
  const input = U.unlockInput('gil', ok.r, 'a new backup');
  const { blind, blinded } = U.blindInput(input);
  const ev = await c.post('/api/auth/unlock', { username: 'gil', nonce: b2.data.nonce, blinded: [b64url(blinded)] });
  const kdf = U.newKdf();
  const keyring = U.newKeyring('gil', gil.K, U.unlockKey(U.finalizeOutput(input, blind, fromB64url(ev.data.evaluated[0], 32)), kdf), kdf, { password: true });
  const put = async (signer, purpose = 'keyring') => {
    const ch = await c.post('/api/auth/challenge', { purpose });
    return c.put('/api/auth/keyring', {
      nonce: ch.data.nonce,
      origin: c.origin,
      keyring,
      proof: b64url(K.authProof(signer, { purpose: 'keyring', origin: c.origin, nonce: fromB64url(ch.data.nonce, 32), username: '' })),
    });
  };
  assert.equal((await put(K.skFromK(new Uint8Array(32).fill(4)))).status, 401, 'another key cannot re-lock it');
  assert.equal((await put(gil.sk, 'sketch')).data.code, 'bad_nonce', 'a challenge for another purpose does not do');
  const done = await put(gil.sk);
  assert.equal(done.status, 200, JSON.stringify(done.data));
  assert.equal(done.data.password, true);

  // now the hand alone opens nothing; with the password it does
  assert.equal((await signIn(client(app.base), gil, { session: 6, password: '' })).step, 'keyring');
  assert.equal((await signIn(client(app.base), gil, { session: 6, password: 'a new backup' })).status, 200);
});
