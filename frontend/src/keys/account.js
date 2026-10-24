// Making and opening an account (accounts-change.md), on the device. The key is
// made once, at registration, from fresh randomness and three signatures
// settled by the law on a provisional paper; the person keeps it as 24 words or
// a private key, and may lock it on the server under a password. Signing in is
// the username and one of the three: the device opens (password) or rebuilds
// (words, private key) the key, checks it is the account's, and signs a fresh
// challenge. The server only ever sees the public key, a blinded password
// (OPRF), the locked keyring and signatures; never the key, the words, the
// password or the randomness.
import { api } from '../api.js';
import { keys as K, record as R, unlock as U, b64url, fromB64url } from 'penpals-law';
import { holdKey, keyFromK, authProof } from './session.js';

let worker = null;
const waiting = new Map();
let nextId = 1;
function call(msg) {
  if (!worker) {
    worker = new Worker(new URL('./keyWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) p?.reject(new Error(data.error));
      else p?.resolve(data);
    };
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}

// The key from the randomness and the three signatures' acts (grown by the law, in the worker).
export const makeKey = (r32, signatures) => call({ type: 'key', r32, signatures }).then((d) => d.K);
// Acts settled on the paper of `seed` (the signature on sheet 0, on the key's own paper).
export const settleOn = (acts, seed, family) => call({ type: 'settle', acts, seed, family }).then((d) => d.settled);
const stretch = (y, kdf) => call({ type: 'stretch', y, kdf }).then((d) => d.key);

export const WRONG_PASSWORD = 'That password does not open this account.';
export const NOT_THIS_KEY = "Those are not this account's key.";

// What the server answers to a password, stretched: the key that locks or opens the keyring.
async function lockKeyFor(username, password, answer, kdf) {
  const input = U.unlockInput(username, password);
  const { blind, blinded } = U.blindInput(input);
  const evaluated = await answer(b64url(blinded));
  return stretch(U.finalizeOutput(input, blind, fromB64url(evaluated, 32)), kdf);
}

// Registration. `key` from keyFromK(username, K) (makeKey above); `signature`:
// { family, seed, settled } of sheet 0, the last signature settled again on the
// key's own paper; `password`: '' for none.
// This machine's time zone (IANA), or nothing where the browser does not say.
const localZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

export async function register({ key, username, password, signature }) {
  let started = null;
  let keyring;
  if (password) {
    const kdf = U.newKdf();
    const lock = await lockKeyFor(
      username,
      password,
      async (blinded) => {
        started = await api.post('/api/auth/register/begin', { username, blinded });
        return started.evaluated;
      },
      kdf,
    );
    keyring = U.newKeyring(username, key.K, lock, kdf);
  } else started = await api.post('/api/auth/register/begin', { username });
  const { line, D } = R.sealSettled({
    sk: key.sk,
    pk: key.pk,
    sheet: K.SHEET_ZERO,
    use: 'signature',
    family: signature.family,
    acts: signature.settled.acts,
    seed: signature.seed,
    box: signature.settled.box,
    facts: signature.settled.facts,
    name: username,
    law: signature.settled.law,
  });
  const open = R.makeOpen(key.sk, D, K.SHEET_ZERO, signature.seed);
  const res = await api.post('/api/auth/register/finish', {
    username,
    nonce: started.nonce,
    origin: location.origin,
    publicKey: key.publicKey,
    proof: authProof(key, 'register', started.nonce, username),
    keyring,
    timeZone: localZone(), // the room's clock (rooms.md §1b): this machine's, when the room is made
    line: { ...line, open },
  });
  holdKey(res.user.username, key.K);
  return res.user;
}

// Sign in (or unlock a signed-in tab) with the username and one of:
// { password } | { words } | { privateKey }.
export async function signIn({ username, password = null, words = null, privateKey = null }) {
  const begin = await api.post('/api/auth/begin', { username });
  let Kbytes;
  if (password !== null) {
    if (!begin.keyring) throw Object.assign(new Error('This account has no password backup: sign in with your 24 words or your private key.'), { code: 'no_password' });
    const lock = await lockKeyFor(begin.username, password, async (blinded) => (await api.post('/api/auth/unlock', { username, nonce: begin.nonce, blinded })).evaluated, begin.keyring.kdf);
    Kbytes = U.openKeyring(begin.keyring, begin.username, lock);
    if (!Kbytes) throw Object.assign(new Error(WRONG_PASSWORD), { code: 'not_opened' });
  } else Kbytes = words !== null ? K.keyFromWords(words) : K.keyFromPrivate(privateKey);
  const key = keyFromK(begin.username, Kbytes);
  if (key.publicKey !== begin.publicKey) throw Object.assign(new Error(NOT_THIS_KEY), { code: 'not_this_key' });
  const res = await api.post('/api/auth/login', { username, nonce: begin.nonce, origin: location.origin, proof: authProof(key, 'login', begin.nonce) });
  holdKey(res.user.username, Kbytes);
  return res.user;
}

// The password backup set, changed, or turned off (''), from a tab holding the key.
export async function setPassword(key, next) {
  let keyring = null;
  if (next) {
    const kdf = U.newKdf();
    const lock = await lockKeyFor(key.username, next, async (blinded) => (await api.post('/api/auth/keyring/oprf', { blinded })).evaluated, kdf);
    keyring = U.newKeyring(key.username, key.K, lock, kdf);
  }
  const ch = await api.post('/api/auth/challenge', { purpose: 'keyring' });
  return api.put('/api/auth/keyring', { nonce: ch.nonce, origin: location.origin, proof: authProof(key, 'keyring', ch.nonce), keyring });
}

export async function signOutEverywhere(key) {
  const ch = await api.post('/api/auth/challenge', { purpose: 'logout-all' });
  return api.post('/api/auth/logout-all', { nonce: ch.nonce, origin: location.origin, proof: authProof(key, 'logout-all', ch.nonce) });
}
