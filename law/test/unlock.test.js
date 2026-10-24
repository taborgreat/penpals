import test from 'node:test';
import assert from 'node:assert/strict';
import { ristretto255_oprf } from '@noble/curves/ed25519.js';
import { code, commit, recover, rBits, packBits, unpackBits } from '../fuzzy.js';
import * as U from '../unlock.js';
import { newK } from '../keys.js';
import { hex, fromHex } from '../tags.js';

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
  const input = U.unlockInput('ana', 'correct horse');
  const { blind, blinded } = U.blindInput(input);
  const y = U.finalizeOutput(input, blind, U.evaluateBlinded(kp.secretKey, blinded));
  assert.equal(hex(y), hex(o.evaluate(kp.secretKey, input)));
});

// (the hand is no longer a key opener; its fuzzy commitments stay for the lab: /hand-lab, law/lab)
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

test('the password backup: the name and the password open the keyring through the OPRF; nothing else does', () => {
  const server = U.newServerKey();
  const K = newK();
  const kdf = { ...U.newKdf(), m: 64, t: 1 }; // small, for the test only
  const open = (username, password) => {
    const input = U.unlockInput(username, password);
    const { blind, blinded } = U.blindInput(input);
    return U.unlockKey(U.finalizeOutput(input, blind, U.evaluateBlinded(server, blinded)), kdf);
  };
  const keyring = U.newKeyring('ana', K, open('ana', 'pass word 1'), kdf);
  assert.deepEqual(U.openKeyring(keyring, 'ana', open('ana', 'pass word 1')), K);
  assert.equal(U.openKeyring(keyring, 'ana', open('ana', 'pass word 2')), null, 'a wrong password');
  assert.equal(U.openKeyring(keyring, 'bo', open('bo', 'pass word 1')), null, 'another name');
  // another server's OPRF key: the same password opens nothing
  const elsewhere = U.newServerKey();
  const input = U.unlockInput('ana', 'pass word 1');
  const { blind, blinded } = U.blindInput(input);
  assert.equal(U.openKeyring(keyring, 'ana', U.unlockKey(U.finalizeOutput(input, blind, U.evaluateBlinded(elsewhere, blinded)), kdf)), null);
  // the server's shape check: only password openers; no empty password
  assert.deepEqual(
    U.checkKeyring(U.newKeyring('ana', K, new Uint8Array(32), U.newKdf())).openers.map((o) => o.kind),
    ['password'],
  );
  assert.throws(
    () => U.checkKeyring({ ...U.newKeyring('ana', K, new Uint8Array(32), U.newKdf()), openers: [{ kind: 'hand', nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ct: 'A'.repeat(64) }] }),
    /bad keyring/,
  );
  assert.throws(() => U.unlockInput('ana', ''), /password/);
});
