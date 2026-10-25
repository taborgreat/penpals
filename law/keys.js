// The key and every message it signs (keys.md Factor two; plan Part 2).
//
//   K        the account key, made once on the device at registration (the master,
//            below): the account for life; the 24 words and the private key are it
//   sk       HKDF-SHA256(K, info "penpals/ed25519/v1")      pk = Ed25519 public key
//   seed     sign(sk, T("paper") ‖ sheet)                    one sheet's paper; commit = H(T("commit") ‖ seed)
//   D        sha256(T("ink") ‖ JCS(body))                    a record's digest
//   seal     sign(sk, T("seal") ‖ D)                         the record is the key holder's
//   by       sign(sk, T("open") ‖ D ‖ sheet)                 the key holder chose to publish this sheet's seed
//   auth     sign(sk, T("auth") ‖ purpose ‖ origin ‖ nonce ‖ username)
//   world    sign(sk, T("seal") ‖ sha256(T("world") ‖ JCS(act)))  a house placed or moved (world.js)
//
// Every message starts with its own tag T(p) = "penpals/<p>/v1\0", so no
// signature made for one purpose can ever be taken for another. Verification
// is strict RFC 8032 (no ZIP-215 leniency): one valid signature per message
// per key, so a sheet has exactly one seed.

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { entropyToMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { T, ascii, utf8, concat, u8, u16be, u32be, jcs, b64url, fromB64url } from './tags.js';

export const KEY_BYTES = 32;
export const SIG_BYTES = 64;

const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// --- the key ---

export const newK = () => randomBytes(KEY_BYTES);
export const skFromK = (K) => {
  if (!(K instanceof Uint8Array) || K.length !== KEY_BYTES) throw new Error('K is 32 bytes');
  return hkdf(sha256, K, new Uint8Array(0), utf8('penpals/ed25519/v1'), 32);
};
export const publicKeyOf = (sk) => ed25519.getPublicKey(sk);

// --- the account key (accounts-change.md): signatures make it ---
//
//   r32      fresh device randomness, made as the signing begins
//   paper₀   a provisional sheet grown from r32: paperKeyOf(sha256(T("provisional") ‖ r32))
//   facts_i  the law's settled facts of signature i on paper₀ (record.js accountKey)
//   master   sha256(T("key") ‖ r32 ‖ (u32be len ‖ PNKA_i) for each ‖ facts_i for each)
//   K        = master: sk = HKDF-SHA256(K, "penpals/ed25519/v1") as above
//   words    BIP39(master): 24 words, the key in a form a person can write down
//
// The key is what the randomness and the hand made together under the law: how
// the ink settled on a paper that existed only for that moment. Its strength is
// r32's (256 bits); the physics is a deterministic step, so it adds origin, not
// secrecy. The words back it up, so it never has to be made from writing again.
export const SIGNATURES = 3;
export const newR32 = () => randomBytes(KEY_BYTES);
export function provisionalPaperKey(r32) {
  if (!(r32 instanceof Uint8Array) || r32.length !== KEY_BYTES) throw new Error('r32 is 32 bytes');
  return paperKeyOf(sha256(concat(T('provisional'), r32)));
}
export function masterOf(r32, acts, facts) {
  if (!(r32 instanceof Uint8Array) || r32.length !== KEY_BYTES) throw new Error('r32 is 32 bytes');
  if (acts.length !== SIGNATURES || facts.length !== SIGNATURES) throw new Error(`the key takes ${SIGNATURES} signatures`);
  if (!facts.every((f) => f instanceof Uint8Array && f.length === 32)) throw new Error('facts are 32-byte digests');
  return sha256(concat(T('key'), r32, ...acts.flatMap((a) => [u32be(a.length), a]), ...facts));
}
// The key as 24 words (BIP39, English), and back. Spacing and case do not matter.
export const wordsOf = (K) => entropyToMnemonic(K, wordlist);
export function keyFromWords(text) {
  const words = String(text ?? '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(' ');
  if (words.split(' ').length !== 24 || !validateMnemonic(words, wordlist)) throw new Error('Those are not your 24 words.');
  return mnemonicToEntropy(words, wordlist);
}
// The key as one line of text (the private key, to copy or download), and back.
export const PRIVATE_KEY_PREFIX = 'penpals-key-1:';
export const privateKeyText = (K) => PRIVATE_KEY_PREFIX + b64url(K);
export function keyFromPrivate(text) {
  const t = String(text ?? '').trim();
  let K = null;
  try {
    if (t.startsWith(PRIVATE_KEY_PREFIX)) K = fromB64url(t.slice(PRIVATE_KEY_PREFIX.length));
  } catch {
    K = null;
  }
  if (!K || K.length !== KEY_BYTES) throw new Error('That is not a penpals private key.');
  return K;
}
const sign = (sk, msg) => ed25519.sign(msg, sk);

// Strict verification; any malformed input is simply "not valid".
export function verify(sig, msg, pk) {
  try {
    if (!(sig instanceof Uint8Array) || sig.length !== SIG_BYTES || !(pk instanceof Uint8Array) || pk.length !== KEY_BYTES) return false;
    return ed25519.verify(sig, msg, pk, { zip215: false });
  } catch {
    return false;
  }
}

// A public key we accept for an account: canonical encoding, on the curve, not of small order.
export function isGoodPublicKey(pk) {
  try {
    if (!(pk instanceof Uint8Array) || pk.length !== KEY_BYTES) return false;
    const P = ed25519.Point.fromBytes(pk, false);
    return !P.isSmallOrder() && ed25519.Point.fromBytes(P.toBytes(), false).equals(P) && b64url(P.toBytes()) === b64url(pk);
  } catch {
    return false;
  }
}

// --- sheets ---

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';
function base32(bytes, chars) {
  let out = '';
  let acc = 0;
  let bits = 0;
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5 && out.length < chars) {
      bits -= 5;
      out += BASE32[(acc >>> bits) & 31];
    }
  }
  if (out.length < chars) throw new Error('not enough bytes for the id');
  return out;
}

export const SHEET_ZERO = '0';
// "0" is the registration signature; "s…" sheets are made by the writer's device
// (book, signature, letter); "p…" sheets are derived from a proof challenge.
export const SHEET_RE = /^(0|[sp][a-z2-7]{26})$/;
export const isSheetId = (s) => typeof s === 'string' && SHEET_RE.test(s);
export const newSheetId = () => `s${base32(randomBytes(17), 26)}`;

export const seedMessage = (sheet) => {
  if (!isSheetId(sheet)) throw new Error('bad sheet id');
  return concat(T('paper'), ascii(sheet));
};
export const sheetSeed = (sk, sheet) => sign(sk, seedMessage(sheet));
export const verifySeed = (pk, sheet, seed) => isSheetId(sheet) && verify(seed, seedMessage(sheet), pk);
export const commitOf = (seed) => sha256(concat(T('commit'), seed));
export const paperKeyOf = (seed) => sha256(concat(T('paperkey'), seed));

// A room's grown surfaces (rooms.md §1: each person's walls, floor, ceiling and
// table are grown from their own key, so no two rooms look alike). Public: from
// the owner's public key and the surface's name, so every visitor grows the very
// same room; scene only, never a fact. → two u32 (light/surface.js's seed).
export function roomSeed(pk, surface) {
  const h = sha256(concat(T('room'), pk, ascii(surface)));
  const dv = new DataView(h.buffer, h.byteOffset, 8);
  return [dv.getUint32(0, false), dv.getUint32(4, false)];
}

// --- records ---

export const recordDigest = (body) => sha256(concat(T('ink'), utf8(jcs(body))));
export const sealOf = (sk, D) => sign(sk, concat(T('seal'), D));
export const verifySeal = (pk, D, seal) => verify(seal, concat(T('seal'), D), pk);
const openMessage = (D, sheet) => concat(T('open'), D, ascii(sheet));
export const openBy = (sk, D, sheet) => sign(sk, openMessage(D, sheet));
export const verifyOpen = (pk, D, sheet, by) => isSheetId(sheet) && verify(by, openMessage(D, sheet), pk);

// --- authentication ---

export const AUTH_PURPOSES = ['register', 'login', 'logout-all', 'keyring'];
export function authMessage({ purpose, origin, nonce, username = '' }) {
  if (!AUTH_PURPOSES.includes(purpose)) throw new Error('bad purpose');
  const o = utf8(String(origin));
  if (o.length > 512 || !(nonce instanceof Uint8Array) || nonce.length !== 32 || username.length > 40) throw new Error('bad auth message');
  return concat(T('auth'), u8(purpose.length), ascii(purpose), u16be(o.length), o, nonce, u8(username.length), ascii(username));
}
export const authProof = (sk, args) => sign(sk, authMessage(args));
export const verifyAuth = (pk, args, proof) => {
  try {
    return verify(proof, authMessage(args), pk);
  } catch {
    return false;
  }
};

// --- words from hashes (fingerprints, proof phrases) ---

function wordsFrom(bytes, count, offsetBits = 0) {
  const out = [];
  for (let w = 0; w < count; w++) {
    let v = 0;
    for (let b = 0; b < 11; b++) {
      const bit = offsetBits + w * 11 + b;
      v = (v << 1) | ((bytes[bit >> 3] >> (7 - (bit & 7))) & 1);
    }
    out.push(wordlist[v]);
  }
  return out;
}

// Four words standing for a public key, shown on profiles (44 bits).
export const fingerprint = (pk) => wordsFrom(sha256(concat(T('fingerprint'), pk)), 4).join(' ');

// A live proof: the requester's challenge and the writer's key fix the sheet and the phrase.
export function proofOf(challenge, pk) {
  if (!(challenge instanceof Uint8Array) || challenge.length !== 32) throw new Error('challenge is 32 bytes');
  const X = sha256(concat(T('proof'), challenge, pk));
  return { sheet: `p${base32(X.subarray(0, 17), 26)}`, phrase: wordsFrom(X, 4, 17 * 8).join(' ') };
}

// --- encodings ---

export const keyText = (bytes) => b64url(bytes);
export const keyFromText = (s, len) => fromB64url(s, len);
