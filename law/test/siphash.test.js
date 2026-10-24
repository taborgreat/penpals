import test from 'node:test';
import assert from 'node:assert/strict';
import { sipHash24, paperHasher } from '../v1/siphash.js';

// Independent reference: SipHash-2-4 with BigInt, straight from the paper.
const M64 = (1n << 64n) - 1n;
const rotl = (x, b) => ((x << BigInt(b)) | (x >> BigInt(64 - b))) & M64;
function refSip(key, msg) {
  const k0 = leBig(key, 0, 8),
    k1 = leBig(key, 8, 8);
  let v0 = k0 ^ 0x736f6d6570736575n,
    v1 = k1 ^ 0x646f72616e646f6dn;
  let v2 = k0 ^ 0x6c7967656e657261n,
    v3 = k1 ^ 0x7465646279746573n;
  const round = () => {
    v0 = (v0 + v1) & M64;
    v1 = rotl(v1, 13);
    v1 ^= v0;
    v0 = rotl(v0, 32);
    v2 = (v2 + v3) & M64;
    v3 = rotl(v3, 16);
    v3 ^= v2;
    v0 = (v0 + v3) & M64;
    v3 = rotl(v3, 21);
    v3 ^= v0;
    v2 = (v2 + v1) & M64;
    v1 = rotl(v1, 17);
    v1 ^= v2;
    v2 = rotl(v2, 32);
  };
  const n = msg.length;
  const full = n - (n % 8);
  for (let o = 0; o < full; o += 8) {
    const m = leBig(msg, o, 8);
    v3 ^= m;
    round();
    round();
    v0 ^= m;
  }
  let b = BigInt(n & 0xff) << 56n;
  for (let i = 0; i < n % 8; i++) b |= BigInt(msg[full + i]) << BigInt(8 * i);
  v3 ^= b;
  round();
  round();
  v0 ^= b;
  v2 ^= 0xffn;
  round();
  round();
  round();
  round();
  return (v0 ^ v1 ^ v2 ^ v3) & M64;
}
function leBig(bytes, o, n) {
  let x = 0n;
  for (let i = n - 1; i >= 0; i--) x = (x << 8n) | BigInt(bytes[o + i]);
  return x;
}
const asBig = ([hi, lo]) => (BigInt(hi) << 32n) | BigInt(lo);
const seq = (n) => Uint8Array.from({ length: n }, (_, i) => i);

// A tiny deterministic generator for test inputs (not part of the law).
function xorshift(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s;
  };
}

test('published SipHash-2-4 vectors (key 00..0f)', () => {
  assert.equal(asBig(sipHash24(seq(16), new Uint8Array(0))), 0x726fdb47dd0e0e31n);
  assert.equal(asBig(sipHash24(seq(16), seq(15))), 0xa129ca6149be45e5n);
  assert.equal(refSip(seq(16), new Uint8Array(0)), 0x726fdb47dd0e0e31n);
  assert.equal(refSip(seq(16), seq(15)), 0xa129ca6149be45e5n);
});

test('32-bit limb SipHash equals the BigInt reference for every length 0..64', () => {
  const r = xorshift(7);
  for (let trial = 0; trial < 20; trial++) {
    const key = Uint8Array.from({ length: 16 }, () => r() & 0xff);
    for (let n = 0; n <= 64; n++) {
      const msg = Uint8Array.from({ length: n }, () => r() & 0xff);
      assert.equal(asBig(sipHash24(key, msg)), refSip(key, msg), `len ${n}`);
    }
  }
});

test('paperHasher(tag, a, b) is SipHash of u64le(tag<<56 | a<<28 | b)', () => {
  const r = xorshift(99);
  const key = Uint8Array.from({ length: 16 }, () => r() & 0xff);
  const H = paperHasher(key);
  const out = [0, 0];
  const cases = [
    [0, 0, 0],
    [1, 1, 1],
    [255, 0x0fffffff, 0x0fffffff],
    [3, 12345, 678910],
  ];
  for (let i = 0; i < 200; i++) cases.push([r() & 0xff, r() & 0x0fffffff, r() & 0x0fffffff]);
  for (const [tag, a, b] of cases) {
    const v = (BigInt(tag) << 56n) | (BigInt(a) << 28n) | BigInt(b);
    const msg = new Uint8Array(8);
    for (let i = 0; i < 8; i++) msg[i] = Number((v >> BigInt(8 * i)) & 0xffn);
    assert.equal(asBig(H(tag, a, b, out)), refSip(key, msg), `${tag},${a},${b}`);
  }
  assert.throws(() => H(0, -1, 0, out));
  assert.throws(() => H(0, 0x10000000, 0, out));
  assert.throws(() => H(256, 0, 0, out));
});
