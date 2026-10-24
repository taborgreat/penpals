// The small things every message and digest is built from: domain tags,
// strict base64url, canonical JSON, and byte helpers. Pure JS, no Buffer,
// so the same bytes come out in Node, a browser, or a worker.

const enc = new TextEncoder();

// T(p) = ASCII("penpals/" ‖ p ‖ "/v1") ‖ 0x00. Purposes contain neither "/" nor
// NUL, so no tag is a prefix of another (keys.md, "Rulings taken in this build").
export function T(purpose) {
  if (!/^[a-z0-9-]+$/.test(purpose)) throw new Error(`bad tag purpose "${purpose}"`);
  return concat(ascii(`penpals/${purpose}/v1`), Uint8Array.of(0));
}

export function ascii(s) {
  if (typeof s !== 'string' || !/^[\x20-\x7e]*$/.test(s)) throw new Error('not printable ASCII');
  return enc.encode(s);
}

export const utf8 = (s) => enc.encode(s);

export function concat(...parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export const u8 = (n) => Uint8Array.of(n & 0xff);
export const u16be = (n) => Uint8Array.of((n >>> 8) & 0xff, n & 0xff);
export const u32be = (n) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

export function hex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function fromHex(s) {
  if (typeof s !== 'string' || s.length % 2 || !/^[0-9a-f]*$/.test(s)) throw new Error('bad hex');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(2 * i, 2 * i + 2), 16);
  return out;
}

// --- base64url, RFC 4648 §5, no padding, strict (canonical trailing bits) ---

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64_INDEX[B64.charCodeAt(i)] = i;

export function b64url(bytes) {
  let s = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    s += B64[n >>> 18] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63] + B64[n & 63];
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i] << 16;
    s += B64[n >>> 18] + B64[(n >>> 12) & 63];
  } else if (rest === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    s += B64[n >>> 18] + B64[(n >>> 12) & 63] + B64[(n >>> 6) & 63];
  }
  return s;
}

// Decode, rejecting anything that would not re-encode to the same string
// (padding, stray characters, non-zero trailing bits, impossible lengths).
export function fromB64url(s, expectLength = null) {
  if (typeof s !== 'string' || s.length % 4 === 1) throw new Error('bad base64url');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const v = c < 128 ? B64_INDEX[c] : -1;
    if (v < 0) throw new Error('bad base64url');
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
  }
  if (bits && (acc & ((1 << bits) - 1)) !== 0) throw new Error('bad base64url');
  if (expectLength !== null && out.length !== expectLength) throw new Error(`expected ${expectLength} bytes`);
  return out;
}

// --- canonical JSON (JCS over a restricted domain) ---
// Only objects, arrays, safe integers, printable-ASCII strings, true/false/null.
// Keys sorted by code unit; no floats, no -0, no undefined. Over this domain
// JCS is exactly JSON.stringify with sorted keys, so any language reproduces it.

export function jcs(value) {
  return canon(value);
}

function canon(v) {
  if (v === null || v === true || v === false) return String(v);
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v) || Object.is(v, -0)) throw new Error('JCS: only safe integers');
    return String(v);
  }
  if (typeof v === 'string') {
    if (!/^[\x20-\x7e]*$/.test(v)) throw new Error('JCS: only printable ASCII strings');
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (typeof v === 'object') {
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) throw new Error('JCS: plain objects only');
    const keys = Object.keys(v).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => {
      if (v[k] === undefined) throw new Error('JCS: undefined value');
      return `${canon(k)}:${canon(v[k])}`;
    }).join(',')}}`;
  }
  throw new Error(`JCS: unsupported ${typeof v}`);
}
