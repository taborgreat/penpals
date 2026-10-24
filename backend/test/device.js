// A writer's device, for tests: everything the frontend does with the law.
import { keys as K, record as R, unlock as U, b64url, fromB64url } from 'penpals-law';
import * as S from 'penpals-law/lab/synth';

export const FAMILY = Object.freeze({ grain: 8, weight: 8, tooth: 0 });

// `password: ''`: no password backup (the 24 words or the private key open it).
export function person(seed, username, { password = `pass-${seed}` } = {}) {
  return { seed, username, password, writer: S.makeWriter(seed), K: null, sk: null, pk: null, words: null, privateKey: null };
}

const nameText = (p) => p.username.replace(/[^a-z]/gi, 'a');

// Register (accounts-change.md): sign the name three times on the provisional
// paper of fresh randomness r32; the key is made from them; the last signature,
// settled again on the key's own paper, is sheet 0. With a password, the key is
// also locked on the server under it.
export async function register(c, p, { family = FAMILY, r32 = K.newR32(), signatures = null } = {}) {
  const sigs = signatures ?? [1, 2, 3].map((s) => S.write(p.writer, nameText(p), s));
  const { K: key } = R.accountKey(r32, sigs);
  setKey(p, key);
  // what never leaves the device, kept here so the privacy canary can look for it
  // (the third signature's strokes are sheet 0's, public; the first two never leave)
  p.secret = { r32, acts: sigs.slice(0, 2) };
  let input = null;
  let blind = null;
  let begin;
  if (p.password) {
    input = U.unlockInput(p.username, p.password);
    const b = U.blindInput(input);
    blind = b.blind;
    begin = await c.post('/api/auth/register/begin', { username: p.username, blinded: b64url(b.blinded) });
  } else begin = await c.post('/api/auth/register/begin', { username: p.username });
  if (begin.status !== 200) return begin;
  let keyring;
  if (p.password) {
    const kdf = U.newKdf();
    keyring = U.newKeyring(p.username, key, U.unlockKey(U.finalizeOutput(input, blind, fromB64url(begin.data.evaluated, 32)), kdf), kdf);
  }
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet: K.SHEET_ZERO, use: 'signature', family, acts: sigs[2], name: p.username });
  const line = { ...made.line, open: R.makeOpen(p.sk, made.D, K.SHEET_ZERO, made.seed) };
  const nonce = begin.data.nonce;
  const proof = K.authProof(p.sk, { purpose: 'register', origin: c.origin, nonce: fromB64url(nonce, 32), username: p.username });
  return c.post('/api/auth/register/finish', { username: p.username, nonce, origin: c.origin, publicKey: b64url(p.pk), proof: b64url(proof), keyring, line });
}

function setKey(p, key) {
  p.K = key;
  p.sk = K.skFromK(key);
  p.pk = K.publicKeyOf(p.sk);
  p.words = K.wordsOf(key);
  p.privateKey = K.privateKeyText(key);
}

// Sign in with the name and one of: the password (`by: 'password'`), the 24
// words, or the private key. The device opens or rebuilds the key, checks it is
// this account's, and signs the challenge. → { step, status, data, publicKey }
export async function signIn(c, p, { by = 'password', password = p.password, words = p.words, privateKey = p.privateKey } = {}) {
  const begin = await c.post('/api/auth/begin', { username: p.username });
  if (begin.status !== 200) return { step: 'begin', ...begin };
  let key = null;
  if (by === 'password') {
    if (!begin.data.keyring) return { step: 'keyring', status: 0, code: 'no_password' };
    const input = U.unlockInput(p.username, password);
    const { blind, blinded } = U.blindInput(input);
    const un = await c.post('/api/auth/unlock', { username: p.username, nonce: begin.data.nonce, blinded: b64url(blinded) });
    if (un.status !== 200) return { step: 'unlock', ...un };
    key = U.openKeyring(begin.data.keyring, p.username, U.unlockKey(U.finalizeOutput(input, blind, fromB64url(un.data.evaluated, 32)), begin.data.keyring.kdf));
    if (!key) return { step: 'keyring', status: 0 };
  } else key = by === 'words' ? K.keyFromWords(words) : K.keyFromPrivate(privateKey);
  const sk = K.skFromK(key);
  const pk = K.publicKeyOf(sk);
  if (b64url(pk) !== begin.data.publicKey) return { step: 'key', status: 0 }; // not this account's key: nothing is signed
  const nonce = fromB64url(begin.data.nonce, 32);
  const proof = K.authProof(sk, { purpose: 'login', origin: c.origin, nonce, username: '' });
  const res = await c.post('/api/auth/login', { username: p.username, nonce: begin.data.nonce, origin: c.origin, proof: b64url(proof) });
  if (res.status === 200) setKey(p, key);
  return { step: 'login', ...res, publicKey: b64url(pk) };
}

// The password backup set (or changed) from a signed-in device holding the key; '' turns it off.
export async function setPassword(c, p, password) {
  let keyring = null;
  if (password) {
    const input = U.unlockInput(p.username, password);
    const { blind, blinded } = U.blindInput(input);
    const ev = await c.post('/api/auth/keyring/oprf', { blinded: b64url(blinded) });
    if (ev.status !== 200) return ev;
    const kdf = U.newKdf();
    keyring = U.newKeyring(p.username, p.K, U.unlockKey(U.finalizeOutput(input, blind, fromB64url(ev.data.evaluated, 32)), kdf), kdf);
  }
  const ch = await c.post('/api/auth/challenge', { purpose: 'keyring' });
  const proof = K.authProof(p.sk, { purpose: 'keyring', origin: c.origin, nonce: fromB64url(ch.data.nonce, 32), username: '' });
  const res = await c.put('/api/auth/keyring', { nonce: ch.data.nonce, origin: c.origin, proof: b64url(proof), keyring });
  if (res.status === 200) p.password = password;
  return res;
}

// A piece of book ink: sealed on a fresh sheet, sent with its seed.
export function bookInk(p, { family = FAMILY, acts = S.write(p.writer, 'hello there', 2), use = 'book', sheet = K.newSheetId(), law } = {}) {
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet, use, family, acts, law });
  return { ...made, seedText: b64url(made.seed) };
}

export async function writeInk(c, p, opts = {}) {
  const ink = bookInk(p, opts);
  const res = await c.post('/api/books/me/ink', { line: ink.line, seed: ink.seedText, place: opts.place ?? { page: 'home', x: 100, y: 100, scale: 64 } });
  return { ...res, ink };
}

export { K, R, U, S, b64url, fromB64url };
