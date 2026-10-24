// The account key K in this tab (keys.md, design B): opened by writing the
// login phrase and typing the password, kept in memory and in this tab's
// sessionStorage, gone when the tab closes or you sign out. It never leaves
// the device: no request carries it, nor anything that would let the server
// compute it. Everything the account signs is signed here.
import { useSyncExternalStore } from 'react';
import { keys as K, record as R, b64url, fromB64url } from 'penpals-law';

const STORE = 'penpals.key.v1';
let current = null; // { username, K, sk, pk, publicKey, fingerprint }
const listeners = new Set();
const emit = () => { for (const fn of listeners) fn(); };

// A key object for K (not held: registration makes one before the account exists).
export function keyFromK(username, Kbytes) {
  const sk = K.skFromK(Kbytes);
  const pk = K.publicKeyOf(sk);
  return { username: username.toLowerCase(), K: Kbytes, sk, pk, publicKey: b64url(pk), fingerprint: K.fingerprint(pk) };
}

try {
  const saved = JSON.parse(sessionStorage.getItem(STORE) ?? 'null');
  if (saved?.username && saved?.K) current = keyFromK(saved.username, fromB64url(saved.K, 32));
} catch { /* no storage, or nothing usable in it: sign in again */ }

export function holdKey(username, Kbytes) {
  current = keyFromK(username, Kbytes);
  try {
    sessionStorage.setItem(STORE, JSON.stringify({ username: current.username, K: b64url(Kbytes) }));
  } catch { /* memory only */ }
  emit();
  return current;
}

export function forgetKey() {
  current = null;
  try {
    sessionStorage.removeItem(STORE);
  } catch { /* nothing kept */ }
  emit();
}

// The key for this signed-in account, or null (signed in elsewhere, a new tab,
// or a different account): writing then asks to unlock first.
export function keyFor(user) {
  return user && current && current.publicKey === user.publicKey ? current : null;
}

export function useKey(user) {
  useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, () => current);
  return keyFor(user);
}

// --- writing with the key ---

// A fresh sheet: its id (random), its seed (only this key can make it), and
// the paper key the live sheet grows on.
export function newSheet(key, sheet = K.newSheetId()) {
  const seed = K.sheetSeed(key.sk, sheet);
  return { sheet, seed, paperKey: K.paperKeyOf(seed) };
}

// Seal what was written on `sheet` (settled: { acts, facts, box } from the ink worker).
export function sealInk(key, { sheet, seed, use, family, settled, name, proof }) {
  return R.sealSettled({ sk: key.sk, pk: key.pk, sheet, use, family, acts: settled.acts, seed, box: settled.box, facts: settled.facts, name, proof, law: settled.law });
}

export const openBy = (key, D, sheet, seed) => R.makeOpen(key.sk, D, sheet, seed);
export const recordDigest = (body) => K.recordDigest(body);

// Proof of the key for an action bound to this site and a fresh challenge.
export const authProof = (key, purpose, nonce, username = '') => b64url(K.authProof(key.sk, { purpose, origin: location.origin, nonce: fromB64url(nonce, 32), username }));
