// Opening the key: what you write (the secret phrase), how you write it (the
// hand bits r recovered by the fuzzy commitment), and what you type (the
// password). The device blinds H(username ‖ r ‖ password) and the server
// evaluates an OPRF (RFC 9497, ristretto255) with a key only it holds, counting
// every evaluation; argon2id then stretches the output into the key that opens
// the keyring holding K. The server never sees the password, r, or K; someone
// holding the keyring and the helpers still needs the server for every guess.
//
// keyring = { v: 1, kdf: { alg: "argon2id", t, m, p, salt }, openers: [{ kind: "hand", nonce, ct }] }
// openers is a typed list: a recovery opener can be added later without a format change.

import { ristretto255_oprf } from '@noble/curves/ed25519.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { T, ascii, utf8, concat, u8, u16be, b64url, fromB64url } from './tags.js';
import { packBits } from './fuzzy.js';

const oprf = ristretto255_oprf.oprf;
export const KDF = Object.freeze({ alg: 'argon2id', t: 2, m: 19456, p: 1 }); // 19 MiB, 2 passes (OWASP minimum)
const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// The OPRF input binds who, which hand bits, and the password, each length-prefixed.
// An empty password is no password (the writer chose none): the prefix keeps it apart from any real one.
export function unlockInput(username, rBits, password = '') {
  const pw = utf8(String(password ?? ''));
  if (pw.length > 1024) throw new Error('password length');
  const r = packBits(rBits);
  return concat(T('unlock'), u8(username.length), ascii(username), u8(r.length), r, u16be(pw.length), pw);
}

// --- client ---
export function blindInput(input) {
  const { blind, blinded } = oprf.blind(input);
  return { blind, blinded };
}
export const finalizeOutput = (input, blind, evaluated) => oprf.finalize(input, blind, evaluated);

export function unlockKey(y, kdf) {
  if (kdf.alg !== 'argon2id') throw new Error('unknown kdf');
  return argon2id(y, fromB64url(kdf.salt), { t: kdf.t, m: kdf.m, p: kdf.p, dkLen: 32 });
}

const aad = (username) => concat(T('keyring'), ascii(username));

// `password`: whether this opener also needs a password (a backup the writer
// chooses). Without one the unlock input carries an empty password: the name,
// the phrase and the hand open the key, every guess still counted by the server.
export function newKeyring(username, K, key, kdf, { password = true } = {}) {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce, aad(username)).encrypt(K);
  return { v: 1, kdf, openers: [{ kind: 'hand', password: !!password, nonce: b64url(nonce), ct: b64url(ct) }] };
}
// Does opening this keyring ask for a password? (Older keyrings always did.)
export const usesPassword = (keyring) => (keyring?.openers ?? []).some((o) => o.kind === 'hand' && o.password !== false);
export const newKdf = () => ({ ...KDF, salt: b64url(randomBytes(16)) });

// K, or null if this key does not open any hand opener (wrong hand or wrong password).
export function openKeyring(keyring, username, key) {
  for (const o of keyring.openers ?? []) {
    if (o.kind !== 'hand') continue;
    try {
      return xchacha20poly1305(key, fromB64url(o.nonce, 24), aad(username)).decrypt(fromB64url(o.ct));
    } catch { /* not this one */ }
  }
  return null;
}

// --- server ---
export const newServerKey = () => oprf.generateKeyPair().secretKey;
export const evaluateBlinded = (serverKey, blinded) => oprf.blindEvaluate(serverKey, blinded);

// Shape checks the server applies before storing a keyring (it cannot read it).
export function checkKeyring(k) {
  const ok = k && k.v === 1 && k.kdf && k.kdf.alg === KDF.alg && k.kdf.t === KDF.t && k.kdf.m === KDF.m && k.kdf.p === KDF.p
    && typeof k.kdf.salt === 'string' && fromB64url(k.kdf.salt).length === 16
    && Array.isArray(k.openers) && k.openers.length >= 1 && k.openers.length <= 4
    && k.openers.every((o) => o && o.kind === 'hand' && (o.password === undefined || typeof o.password === 'boolean')
      && fromB64url(o.nonce).length === 24 && fromB64url(o.ct).length === 48);
  if (!ok) throw new Error('bad keyring');
  return { v: 1, kdf: { ...k.kdf }, openers: k.openers.map((o) => ({ kind: o.kind, password: o.password !== false, nonce: o.nonce, ct: o.ct })) };
}
