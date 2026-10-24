// SipHash-2-4 on 32-bit halves (no BigInt on the hot path). The paper is a
// function of (paperKey, tag, a, b) through this one keyed PRF; nothing else
// in the law is random.

const IV0H = 0x736f6d65, IV0L = 0x70736575;
const IV1H = 0x646f7261, IV1L = 0x6e646f6d;
const IV2H = 0x6c796765, IV2L = 0x6e657261;
const IV3H = 0x74656462, IV3L = 0x79746573;

const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

// General SipHash-2-4 of any message; returns [hi, lo] (uint32 each). Used by
// tests and anything off the hot path.
export function sipHash24(key, msg) {
  if (key.length !== 16) throw new Error('SipHash key is 16 bytes');
  const k0h = le32(key, 4), k0l = le32(key, 0), k1h = le32(key, 12), k1l = le32(key, 8);
  const s = new Uint32Array([
    (k0h ^ IV0H) >>> 0, (k0l ^ IV0L) >>> 0, (k1h ^ IV1H) >>> 0, (k1l ^ IV1L) >>> 0,
    (k0h ^ IV2H) >>> 0, (k0l ^ IV2L) >>> 0, (k1h ^ IV3H) >>> 0, (k1l ^ IV3L) >>> 0,
  ]);
  const n = msg.length;
  const full = n - (n % 8);
  for (let o = 0; o < full; o += 8) compress(s, le32(msg, o + 4), le32(msg, o));
  const tail = new Uint8Array(8);
  tail.set(msg.subarray(full));
  tail[7] = n & 0xff;
  compress(s, le32(tail, 4), le32(tail, 0));
  return finish(s);
}

function compress(s, mh, ml) {
  s[6] ^= mh; s[7] ^= ml;
  round(s); round(s);
  s[0] ^= mh; s[1] ^= ml;
}

function finish(s) {
  s[5] ^= 0xff;
  round(s); round(s); round(s); round(s);
  return [(s[0] ^ s[2] ^ s[4] ^ s[6]) >>> 0, (s[1] ^ s[3] ^ s[5] ^ s[7]) >>> 0];
}

// One SipRound on state [v0h,v0l,v1h,v1l,v2h,v2l,v3h,v3l].
function round(s) {
  let v0h = s[0], v0l = s[1], v1h = s[2], v1l = s[3], v2h = s[4], v2l = s[5], v3h = s[6], v3l = s[7];
  let l, t;
  // v0 += v1; v1 = rotl(v1,13) ^ v0; v0 = rotl(v0,32)
  l = (v0l + v1l) >>> 0; v0h = (v0h + v1h + (l < v0l ? 1 : 0)) >>> 0; v0l = l;
  t = ((v1h << 13) | (v1l >>> 19)) >>> 0; v1l = ((v1l << 13) | (v1h >>> 19)) >>> 0; v1h = t;
  v1h = (v1h ^ v0h) >>> 0; v1l = (v1l ^ v0l) >>> 0;
  t = v0h; v0h = v0l; v0l = t;
  // v2 += v3; v3 = rotl(v3,16) ^ v2
  l = (v2l + v3l) >>> 0; v2h = (v2h + v3h + (l < v2l ? 1 : 0)) >>> 0; v2l = l;
  t = ((v3h << 16) | (v3l >>> 16)) >>> 0; v3l = ((v3l << 16) | (v3h >>> 16)) >>> 0; v3h = t;
  v3h = (v3h ^ v2h) >>> 0; v3l = (v3l ^ v2l) >>> 0;
  // v0 += v3; v3 = rotl(v3,21) ^ v0
  l = (v0l + v3l) >>> 0; v0h = (v0h + v3h + (l < v0l ? 1 : 0)) >>> 0; v0l = l;
  t = ((v3h << 21) | (v3l >>> 11)) >>> 0; v3l = ((v3l << 21) | (v3h >>> 11)) >>> 0; v3h = t;
  v3h = (v3h ^ v0h) >>> 0; v3l = (v3l ^ v0l) >>> 0;
  // v2 += v1; v1 = rotl(v1,17) ^ v2; v2 = rotl(v2,32)
  l = (v2l + v1l) >>> 0; v2h = (v2h + v1h + (l < v2l ? 1 : 0)) >>> 0; v2l = l;
  t = ((v1h << 17) | (v1l >>> 15)) >>> 0; v1l = ((v1l << 17) | (v1h >>> 15)) >>> 0; v1h = t;
  v1h = (v1h ^ v2h) >>> 0; v1l = (v1l ^ v2l) >>> 0;
  t = v2h; v2h = v2l; v2l = t;
  s[0] = v0h; s[1] = v0l; s[2] = v1h; s[3] = v1l; s[4] = v2h; s[5] = v2l; s[6] = v3h; s[7] = v3l;
}

// The paper's hash: H(tag, a, b) = SipHash24(key, u64le(tag·2^56 + a·2^28 + b)),
// tag < 256, 0 ≤ a, b < 2^28. Returns the 64-bit result through `out` [hi, lo].
export function paperHasher(key) {
  if (key.length !== 16) throw new Error('SipHash key is 16 bytes');
  const k0h = le32(key, 4), k0l = le32(key, 0), k1h = le32(key, 12), k1l = le32(key, 8);
  const s = new Uint32Array(8);
  return function H(tag, a, b, out) {
    if (!(a >= 0 && a < 0x10000000 && b >= 0 && b < 0x10000000 && tag >= 0 && tag < 256)) {
      throw new Error('paper hash input out of range');
    }
    s[0] = k0h ^ IV0H; s[1] = k0l ^ IV0L; s[2] = k1h ^ IV1H; s[3] = k1l ^ IV1L;
    s[4] = k0h ^ IV2H; s[5] = k0l ^ IV2L; s[6] = k1h ^ IV3H; s[7] = k1l ^ IV3L;
    const ml = (b + (a % 16) * 0x10000000) >>> 0; // low 32 bits: b | (a & 0xf) << 28
    const mh = ((tag * 0x1000000) + Math.floor(a / 16)) >>> 0; // high 32 bits: tag << 24 | a >> 4
    compress(s, mh, ml);
    compress(s, 0x08000000, 0); // final block: length 8 in the top byte, no tail bytes
    const r = finish(s);
    out[0] = r[0];
    out[1] = r[1];
    return out;
  };
}
