// Fuzzy commitment (the hand → the same exact bits, when the reading is close
// enough): a binary BCH code corrects up to t bit errors; the helper is a
// codeword carrying the secret r, XORed with the enrolment reading w. A later
// reading w' gives back r exactly if it differs from w in at most t bits, and
// nothing otherwise (decoding fails, or lands on a codeword whose padding is not
// zero). No check value for r is stored: the only test of a candidate r is an
// OPRF evaluation the server counts.
//
//   helper = encode(r ‖ 0…) ⊕ w        r = recover(helper ⊕ w') when |w ⊕ w'| ≤ t
//
// Codes are shortened BCH over GF(2^m): length n' = the measure's length, the
// generator g = lcm of the minimal polynomials of α^1..α^2t, k' = n' − deg g.

import { PHRASE_RADIUS, PAGE_RADIUS } from './v1/hand.js';

// GF(2^m) with a primitive polynomial (bit i = coefficient of x^i).
const PRIMITIVE = { 9: 0x211, 10: 0x409, 11: 0x805 }; // x^9+x^4+1, x^10+x^3+1, x^11+x^2+1

function field(m) {
  const N = (1 << m) - 1;
  const exp = new Int32Array(2 * N);
  const log = new Int32Array(N + 1).fill(-1);
  let x = 1;
  for (let i = 0; i < N; i++) {
    if (log[x] !== -1) throw new Error(`x^${m} polynomial is not primitive`);
    exp[i] = x;
    log[x] = i;
    x <<= 1;
    if (x & (1 << m)) x ^= PRIMITIVE[m];
  }
  for (let i = N; i < 2 * N; i++) exp[i] = exp[i - N];
  const mul = (a, b) => (a && b ? exp[log[a] + log[b]] : 0);
  const div = (a, b) => (a ? exp[log[a] - log[b] + N] : 0);
  return { m, N, exp, log, mul, div };
}

// GF(2) polynomial product (Uint8Array of coefficients, index = degree).
function polyMul2(a, b) {
  const out = new Uint8Array(a.length + b.length - 1);
  for (let i = 0; i < a.length; i++) if (a[i]) for (let j = 0; j < b.length; j++) out[i + j] ^= b[j];
  return out;
}

// The minimal polynomial of α^i: ∏ over its conjugates α^(i·2^j) of (x − α^c).
function minimalPoly(F, i) {
  const conj = [];
  let c = i % F.N;
  while (!conj.includes(c)) {
    conj.push(c);
    c = (c * 2) % F.N;
  }
  let poly = [1]; // coefficients in GF(2^m)
  for (const e of conj) {
    const root = F.exp[e];
    const next = new Array(poly.length + 1).fill(0);
    for (let k = 0; k < poly.length; k++) {
      next[k + 1] ^= poly[k]; // x · p
      next[k] ^= F.mul(poly[k], root); // root · p
    }
    poly = next;
  }
  if (poly.some((v) => v > 1)) throw new Error('minimal polynomial not over GF(2)');
  return { conj, poly: Uint8Array.from(poly) };
}

export function makeCode(m, t, n) {
  const F = field(m);
  if (n > F.N) throw new Error('code too long for the field');
  let g = Uint8Array.of(1);
  const covered = new Set();
  for (let i = 1; i <= 2 * t; i++) {
    if (covered.has(i % F.N)) continue;
    const { conj, poly } = minimalPoly(F, i);
    for (const c of conj) covered.add(c);
    g = polyMul2(g, poly);
  }
  const r = g.length - 1; // parity bits
  const k = n - r;
  if (k <= 0) throw new Error('no room for a message');
  const id = `bch${m}-${t}-${n}`;

  // Systematic: c = [parity (r) | message (k)], c(x) = msg(x)·x^r + (msg(x)·x^r mod g).
  function encode(msg) {
    if (msg.length !== k) throw new Error(`message is ${k} bits`);
    const rem = new Uint8Array(r);
    for (let i = k - 1; i >= 0; i--) {
      const fb = msg[i] ^ rem[r - 1];
      for (let j = r - 1; j > 0; j--) rem[j] = rem[j - 1] ^ (fb & g[j]);
      rem[0] = fb & g[0];
    }
    const c = new Uint8Array(n);
    c.set(rem, 0);
    c.set(msg, r);
    return c;
  }

  // Bounded-distance decoding: the message if at most t bits are wrong, else null.
  function decode(y) {
    if (y.length !== n) throw new Error(`a word is ${n} bits`);
    const S = new Int32Array(2 * t);
    let any = false;
    for (let j = 1; j <= 2 * t; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) if (y[i]) s ^= F.exp[(i * j) % F.N];
      S[j - 1] = s;
      if (s) any = true;
    }
    const fixed = Uint8Array.from(y);
    if (any) {
      // Berlekamp–Massey: the error locator Λ.
      let C = [1],
        B = [1],
        L = 0,
        shift = 1,
        b = 1;
      for (let i = 0; i < 2 * t; i++) {
        let d = S[i];
        for (let j = 1; j <= L; j++) d ^= F.mul(C[j] ?? 0, S[i - j]);
        if (d === 0) {
          shift++;
          continue;
        }
        const coef = F.div(d, b);
        const next = C.slice();
        for (let j = 0; j < B.length; j++) next[j + shift] = (next[j + shift] ?? 0) ^ F.mul(coef, B[j]);
        if (2 * L <= i) {
          B = C;
          L = i + 1 - L;
          b = d;
          shift = 1;
        } else shift++;
        C = next;
      }
      while (C.length > 1 && !C[C.length - 1]) C.pop();
      if (L > t || C.length - 1 !== L) return null;
      // Chien search over the positions this (shortened) code uses.
      let found = 0;
      for (let i = 0; i < n; i++) {
        let v = 0;
        const inv = (F.N - (i % F.N)) % F.N; // α^(-i)
        for (let j = 0; j < C.length; j++) if (C[j]) v ^= F.exp[(F.log[C[j]] + inv * j) % F.N];
        if (v === 0) {
          fixed[i] ^= 1;
          found++;
        }
      }
      if (found !== L) return null;
    }
    return fixed.subarray(r, r + k);
  }

  return { id, m, t, n, k, r, encode, decode };
}

// --- the two codes of the hand key ---

const codes = new Map();
export function code(kind) {
  let c = codes.get(kind);
  if (!c) {
    c = kind === 'phrase' ? makeCode(9, PHRASE_RADIUS, 300) : kind === 'page' ? makeCode(11, PAGE_RADIUS, 1092) : null;
    if (!c) throw new Error(`no code "${kind}"`);
    codes.set(kind, c);
  }
  return c;
}
// r fits both codes: the shorter message length.
export const rBits = () => Math.min(code('phrase').k, code('page').k);

// helper = encode(r ‖ 0…) ⊕ w
export function commit(kind, r, w) {
  const c = code(kind);
  if (r.length !== rBits() || w.length !== c.n) throw new Error('bad commitment input');
  const msg = new Uint8Array(c.k);
  msg.set(r, 0);
  const cw = c.encode(msg);
  return cw.map((v, i) => v ^ w[i]);
}

// r from helper ⊕ w', or null when the reading is too far (or lands on a codeword
// whose padding is not all zero).
export function recover(kind, helper, w) {
  const c = code(kind);
  if (helper.length !== c.n || w.length !== c.n) return null;
  const msg = c.decode(helper.map((v, i) => v ^ w[i]));
  if (!msg) return null;
  const n = rBits();
  for (let i = n; i < msg.length; i++) if (msg[i]) return null;
  return msg.slice(0, n);
}

// Bits ↔ bytes (big-endian within a byte), for storage.
export function packBits(bits) {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((b, i) => {
    if (b) out[i >> 3] |= 0x80 >> (i & 7);
  });
  return out;
}
export function unpackBits(bytes, n) {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  return out;
}
