import test from 'node:test';
import assert from 'node:assert/strict';
import { ristretto255_oprf } from '@noble/curves/ed25519.js';
import { code, commit, recover, rBits, packBits, unpackBits } from '../fuzzy.js';
import * as U from '../unlock.js';
import * as H from '../handkey.js';
import { newK } from '../keys.js';
import { hex, fromHex } from '../tags.js';
import * as S from '../lab/synth.js';

test('RFC 9497 A.1.1 (ristretto255-SHA512, OPRF mode): key and outputs', () => {
  const o = ristretto255_oprf.oprf;
  const kp = o.deriveKeyPair(fromHex('a3'.repeat(32)), new TextEncoder().encode('test key'));
  assert.equal(hex(kp.secretKey), '5ebcea5ee37023ccb9fc2d2019f9d7737be85591ae8652ffa9ef0f4d37063b0e');
  assert.equal(hex(o.evaluate(kp.secretKey, fromHex('00'))), '527759c3d9366f277d8c6020418d96bb393ba2afb20ff90df23fb7708264e2f3ab9135e3bd69955851de4b1f9fe8a0973396719b7912ba9ee8aa7d0b5e24bcf6');
  assert.equal(
    hex(o.evaluate(kp.secretKey, fromHex('5a'.repeat(17)))),
    'f4a74c9c592497375e796aa837e907b1a045d34306a749db9f34221f7e750cb4f2a6413a6bf6fa5e19ba6348eb673934a722a7ede2e7621306d18951e7cf2c73',
  );
  // and the blinded round trip gives the same as evaluating directly
  const input = U.unlockInput('ana', new Uint8Array(rBits()).fill(1), 'correct horse');
  const { blind, blinded } = U.blindInput(input);
  const y = U.finalizeOutput(input, blind, U.evaluateBlinded(kp.secretKey, blinded));
  assert.equal(hex(y), hex(o.evaluate(kp.secretKey, input)));
});

test('BCH codes correct exactly up to their radius', () => {
  for (const kind of ['phrase', 'page']) {
    const c = code(kind);
    assert.ok(c.k >= rBits());
    let seed = 99;
    const rnd = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let trial = 0; trial < 12; trial++) {
      const r = Uint8Array.from({ length: rBits() }, () => (rnd() < 0.5 ? 1 : 0));
      const w = Uint8Array.from({ length: c.n }, () => (rnd() < 0.5 ? 1 : 0));
      const helper = commit(kind, r, w);
      const flip = (n) => {
        const w2 = w.slice();
        const pos = new Set();
        while (pos.size < n) pos.add(Math.floor(rnd() * c.n));
        for (const p of pos) w2[p] ^= 1;
        return w2;
      };
      assert.deepEqual([...recover(kind, helper, flip(c.t))], [...r], `${kind}: t errors corrected`);
      const beyond = recover(kind, helper, flip(c.t + 3 + trial));
      assert.ok(!beyond || beyond.join('') !== r.join(''), `${kind}: beyond t is not r`);
    }
  }
  assert.deepEqual([...unpackBits(packBits(Uint8Array.of(1, 0, 1, 1, 0, 0, 0, 1, 1)), 9)], [1, 0, 1, 1, 0, 0, 0, 1, 1]);
});

test('the hand opens the key: same hand → r → OPRF → argon2id → K; wrong hand or password → nothing', () => {
  const w = S.makeWriter(5);
  const phrase = 'amber river quiet lamp';
  const readings = [1, 2, 3].map((s) => H.readingOf('phrase', S.write(w, phrase, s)));
  const enrolled = H.enroll('phrase', readings);
  assert.ok(enrolled.spread <= enrolled.radius, `enrolment spread ${enrolled.spread}`);
  const r = H.newR();
  const sketch = H.checkSketch(H.makeSketch('phrase', r, readings));

  // server side: an OPRF key; client side: K in a keyring
  const serverKey = U.newServerKey();
  const K = newK();
  const kdf = U.newKdf();
  const open = (rBitsIn, password) => {
    const input = U.unlockInput('ana', rBitsIn, password);
    const { blind, blinded } = U.blindInput(input);
    return U.unlockKey(U.finalizeOutput(input, blind, U.evaluateBlinded(serverKey, blinded)), kdf);
  };
  const keyring = U.checkKeyring(U.newKeyring('ana', K, open(r, 'pass word 1'), kdf));

  // a later session of the same hand
  const later = H.readingOf('phrase', S.write(w, phrase, 7));
  const cands = H.candidates([sketch], { phrase: later });
  assert.equal(cands.length, 1);
  assert.equal(hex(U.openKeyring(keyring, 'ana', open(cands[0].r, 'pass word 1'))), hex(K));
  // password alone (r unknown): nothing
  assert.equal(U.openKeyring(keyring, 'ana', open(H.newR(), 'pass word 1')), null);
  // hand alone (wrong password): nothing
  assert.equal(U.openKeyring(keyring, 'ana', open(cands[0].r, 'pass word 2')), null);
  // Someone else writing the phrase may land inside the (loose, unfrozen) radius:
  // that is the hand's false-accept rate, which the Phase 0 report measures. What
  // the design guarantees is that whatever their reading recovers, the keyring
  // stays shut without the password.
  for (const seed of [77, 78, 79]) {
    const theirs = H.candidates([sketch], { phrase: H.readingOf('phrase', S.write(S.makeWriter(seed), phrase, 1)) });
    for (const c of theirs) assert.equal(U.openKeyring(keyring, 'ana', open(c.r, 'a guessed password')), null);
  }
  // re-sketching from today's reading keeps r
  const refreshed = H.refreshSketch(sketch, cands[0].r, later);
  assert.equal(refreshed.id, sketch.id);
  assert.equal(H.recoverR(refreshed, later).join(''), r.join(''));
});

test('a keyring may open without a password: the flag travels with it, older keyrings ask for one', async () => {
  const U = await import('../unlock.js');
  const K = new Uint8Array(32).fill(3);
  const r = new Uint8Array(48).map((_, i) => i & 1);
  const kdf = { ...U.newKdf(), m: 64, t: 1 }; // small, for the test only
  const open = (password) => {
    const input = U.unlockInput('ana', r, password);
    const { blind, blinded } = U.blindInput(input);
    return U.unlockKey(U.finalizeOutput(input, blind, U.evaluateBlinded(server, blinded)), kdf);
  };
  const server = U.newServerKey();
  const free = U.newKeyring('ana', K, open(''), kdf, { password: false });
  assert.equal(U.usesPassword(free), false);
  assert.deepEqual(U.openKeyring(free, 'ana', open('')), K);
  assert.equal(U.openKeyring(free, 'ana', open('guess')), null, 'a password typed anyway does not open it');
  const locked = U.newKeyring('ana', K, open('pw'), kdf);
  assert.equal(U.usesPassword(locked), true);
  assert.equal(U.openKeyring(locked, 'ana', open('')), null, 'with the backup on, the hand alone opens nothing');
  // the flag survives the server's shape check; a keyring from before it counts as passworded
  const legacy = { ...locked, openers: locked.openers.map(({ password: _password, ...o }) => o) };
  assert.equal(U.usesPassword(legacy), true);
  assert.equal(U.checkKeyring(U.newKeyring('ana', K, new Uint8Array(32), U.newKdf(), { password: false })).openers[0].password, false);
});
