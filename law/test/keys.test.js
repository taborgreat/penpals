import test from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import * as K from '../keys.js';
import { T, hex, fromHex, utf8, concat } from '../tags.js';

const Kfix = fromHex('000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f');
const sk = K.skFromK(Kfix);
const pk = K.publicKeyOf(sk);

test('tags are prefix-free and versioned', () => {
  assert.equal(hex(T('paper')), hex(concat(utf8('penpals/paper/v1'), Uint8Array.of(0))));
  const tags = ['paper', 'seal', 'open', 'auth', 'ink', 'commit', 'paperkey', 'facts', 'look', 'proof', 'fingerprint', 'unlock', 'keyring', 'calibration', 'key', 'provisional'];
  for (const a of tags)
    for (const b of tags) {
      if (a === b) continue;
      const ta = T(a),
        tb = T(b);
      const prefix = ta.length <= tb.length && ta.every((v, i) => v === tb[i]);
      assert.ok(!prefix, `${a} is a prefix of ${b}`);
    }
  assert.throws(() => T('pa/per'));
});

test('K → sk → pk is fixed (pinned vector) and sk never equals K', () => {
  // Pinned: if any of these change, every account's key changes.
  assert.equal(hex(sk), '5b86e9dcefc603be939ebb1f56b133d30d29b5dfeb13e5d1acfbef152cec1602');
  assert.equal(hex(pk), '6dfd9327bd79c93fcf3bd1533ca14b6881b344ffd7d5f946d5beb9d7df6e25a5');
  assert.equal(K.fingerprint(pk), 'extend very health medal');
  assert.notEqual(hex(sk), hex(Kfix));
});

test('one sheet, one seed: deterministic, verifiable, committed', () => {
  const sheet = K.newSheetId();
  assert.match(sheet, /^s[a-z2-7]{26}$/);
  const s1 = K.sheetSeed(sk, sheet);
  const s2 = K.sheetSeed(sk, sheet);
  assert.equal(hex(s1), hex(s2));
  assert.ok(K.verifySeed(pk, sheet, s1));
  assert.ok(!K.verifySeed(pk, K.newSheetId(), s1), 'a seed is for one sheet');
  assert.notEqual(hex(K.sheetSeed(sk, K.SHEET_ZERO)), hex(s1));
  assert.equal(K.commitOf(s1).length, 32);
  assert.notEqual(hex(K.commitOf(s1)), hex(K.paperKeyOf(s1)), 'commit and paper key come from different tags');
  assert.throws(() => K.sheetSeed(sk, 'k_000001'));
});

test('a seed signs nothing else: seals, opens and auth proofs never verify as seeds', () => {
  const sheet = K.newSheetId();
  const D = new Uint8Array(32).fill(9);
  const seal = K.sealOf(sk, D);
  assert.ok(K.verifySeal(pk, D, seal));
  assert.ok(!K.verifySeed(pk, sheet, seal));
  const by = K.openBy(sk, D, sheet);
  assert.ok(K.verifyOpen(pk, D, sheet, by));
  assert.ok(!K.verifySeal(pk, D, by));
  assert.ok(!K.verifyOpen(pk, D, K.newSheetId(), by), 'an open names its sheet');
});

test('auth proofs bind purpose, origin, nonce and name', () => {
  const nonce = new Uint8Array(32).fill(3);
  const args = { purpose: 'login', origin: 'http://localhost:5173', nonce, username: '' };
  const proof = K.authProof(sk, args);
  assert.ok(K.verifyAuth(pk, args, proof));
  assert.ok(!K.verifyAuth(pk, { ...args, purpose: 'register' }, proof));
  assert.ok(!K.verifyAuth(pk, { ...args, origin: 'https://evil.example' }, proof));
  assert.ok(!K.verifyAuth(pk, { ...args, nonce: new Uint8Array(32).fill(4) }, proof));
  assert.ok(!K.verifyAuth(pk, { ...args, username: 'ana' }, proof));
  assert.ok(!K.verifyAuth(pk, { ...args, purpose: 'nonsense' }, proof));
});

test('strict verification: S + L, small-order and non-canonical keys are refused', () => {
  const msg = utf8('m');
  const sig = ed25519.sign(msg, sk);
  assert.ok(K.verify(sig, msg, pk));
  // S + L: the same signature in a non-canonical encoding
  const L = (1n << 252n) + 27742317777372353535851937790883648493n;
  let S = 0n;
  for (let i = 63; i >= 32; i--) S = (S << 8n) | BigInt(sig[i]);
  const S2 = S + L;
  const malleated = sig.slice();
  let v = S2;
  for (let i = 32; i < 64; i++) {
    malleated[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  assert.ok(!K.verify(malleated, msg, pk), 'S + L must not verify');
  // the identity point (small order) as a public key
  const identity = new Uint8Array(32);
  identity[0] = 1;
  assert.ok(!K.isGoodPublicKey(identity));
  assert.ok(K.isGoodPublicKey(pk));
  // a non-canonical encoding of y (y ≥ p)
  const nonCanon = new Uint8Array(32).fill(0xff);
  nonCanon[31] = 0x7f;
  assert.ok(!K.isGoodPublicKey(nonCanon));
});

test('a live proof is fixed by the challenge and the key', () => {
  const challenge = new Uint8Array(32).fill(7);
  const a = K.proofOf(challenge, pk);
  assert.deepEqual(a, K.proofOf(challenge, pk));
  assert.match(a.sheet, /^p[a-z2-7]{26}$/);
  assert.match(a.phrase, /^[a-z]+ [a-z]+ [a-z]+ [a-z]+$/);
  assert.notDeepEqual(a, K.proofOf(new Uint8Array(32).fill(8), pk));
});
