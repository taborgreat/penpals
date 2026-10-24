// The password backup (accounts-change.md): if the writer sets a password, the
// account key K is kept on the server locked under it. The device blinds
// H(username ‖ password) and the server evaluates an OPRF (RFC 9497,
// ristretto255) with a key only it holds, counting every evaluation; argon2id
// then stretches the output into the key that opens the keyring holding K. The
// server never sees the password or K; someone holding the keyring still needs
// the server for every guess. Without a password the server holds no keyring:
// the 24 words or the private key open the account.
//
// keyring = { v: 1, kdf: { alg: "argon2id", t, m, p, salt }, openers: [{ kind: "password", nonce, ct }] }
// openers is a typed list: another opener (a recovery sheet, say) can be added later without a format change.

import { ristretto255_oprf } from '@noble/curves/ed25519.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { T, ascii, utf8, concat, u8, u16be, b64url, fromB64url } from './tags.js';

const oprf = ristretto255_oprf.oprf;
export const KDF = Object.freeze({ alg: 'argon2id', t: 2, m: 19456, p: 1 }); // 19 MiB, 2 passes (OWASP minimum)
export const OPENERS = Object.freeze(['password']);
const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

// The OPRF input binds who and the password, each length-prefixed.
export function unlockInput(username, password) {
  const pw = utf8(String(password ?? ''));
  if (!pw.length || pw.length > 1024) throw new Error('password length');
  return concat(T('unlock'), u8(username.length), ascii(username), u16be(pw.length), pw);
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

export function newKeyring(username, K, key, kdf) {
  const nonce = randomBytes(24);
  const ct = xchacha20poly1305(key, nonce, aad(username)).encrypt(K);
  return { v: 1, kdf, openers: [{ kind: 'password', nonce: b64url(nonce), ct: b64url(ct) }] };
}
export const newKdf = () => ({ ...KDF, salt: b64url(randomBytes(16)) });

// K, or null if this key opens none of the openers (a wrong password).
export function openKeyring(keyring, username, key) {
  for (const o of keyring?.openers ?? []) {
    if (!OPENERS.includes(o.kind)) continue;
    try {
      return xchacha20poly1305(key, fromB64url(o.nonce, 24), aad(username)).decrypt(fromB64url(o.ct));
    } catch {
      /* not this one */
    }
  }
  return null;
}

// --- server ---
export const newServerKey = () => oprf.generateKeyPair().secretKey;
export const evaluateBlinded = (serverKey, blinded) => oprf.blindEvaluate(serverKey, blinded);

// Shape checks the server applies before storing a keyring (it cannot read it).
export function checkKeyring(k) {
  const ok =
    k &&
    k.v === 1 &&
    k.kdf &&
    k.kdf.alg === KDF.alg &&
    k.kdf.t === KDF.t &&
    k.kdf.m === KDF.m &&
    k.kdf.p === KDF.p &&
    typeof k.kdf.salt === 'string' &&
    fromB64url(k.kdf.salt).length === 16 &&
    Array.isArray(k.openers) &&
    k.openers.length >= 1 &&
    k.openers.length <= 4 &&
    k.openers.every((o) => o && OPENERS.includes(o.kind) && fromB64url(o.nonce).length === 24 && fromB64url(o.ct).length === 48);
  if (!ok) throw new Error('bad keyring');
  return { v: 1, kdf: { ...k.kdf }, openers: k.openers.map((o) => ({ kind: o.kind, nonce: o.nonce, ct: o.ct })) };
}
