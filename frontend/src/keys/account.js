// Opening an account (keys.md, design B), on the device. What opens the random
// account key K: what you write (your secret login phrase) and how you write it
// (the hand, read on the public calibration paper), and, if you chose a
// password backup, what you type. Without the backup, the name, the phrase and
// the hand are enough; every guess is still one the server answers and counts. The server only ever sees blinded
// guesses (OPRF), which it answers and counts, the encrypted keyring, the
// sketches, and a login sheet sealed by K; never K, the password, the hand
// bits, or the strokes of the phrase.
import { api } from '../api.js';
import { keys as K, record as R, unlock as U, handkey as H, v1, b64url, fromB64url } from 'penpals-law';
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

// The hand: the writing grown on the calibration paper, measured.
export const readingOf = (kind, acts) => call({ type: 'reading', kind, acts }).then((d) => d.reading);
const stretch = (y, kdf) => call({ type: 'stretch', y, kdf }).then((d) => d.key);

export const NOT_OPENED = 'That did not open the account. Write your phrase as you always do (and check the password, if you set one).';
export const NEEDS_PASSWORD = 'This account also asks for its password.';

// Three writings of the phrase: close enough to each other to make a sketch?
export function enrolCheck(kind, readings) {
  const e = H.enroll(kind, readings);
  return { ok: e.spread <= e.radius, spread: e.spread, radius: e.radius };
}

// Registration. `key` from keyFromK(username, K) made at the start (the name is
// written on sheet 0 with it); `signature`: { family, seed, settled } of that sheet.
export async function register({ key, username, password, phraseReadings, pageReading, signature }) {
  const r = H.newR();
  const sketches = [H.makeSketch('phrase', r, phraseReadings), H.makeSketch('page', r, [pageReading])];
  const input = U.unlockInput(username, r, password);
  const { blind, blinded } = U.blindInput(input);
  const begin = await api.post('/api/auth/register/begin', { username, blinded: b64url(blinded) });
  const kdf = U.newKdf();
  const unlockKey = await stretch(U.finalizeOutput(input, blind, fromB64url(begin.evaluated, 32)), kdf);
  const keyring = U.newKeyring(username, key.K, unlockKey, kdf, { password: !!password });
  const { line, D } = R.sealSettled({
    sk: key.sk, pk: key.pk, sheet: K.SHEET_ZERO, use: 'signature', family: signature.family,
    acts: signature.settled.acts, seed: signature.seed, box: signature.settled.box, facts: signature.settled.facts, name: username, law: signature.settled.law,
  });
  const open = R.makeOpen(key.sk, D, K.SHEET_ZERO, signature.seed);
  const res = await api.post('/api/auth/register/finish', {
    username, nonce: begin.nonce, origin: location.origin, publicKey: key.publicKey,
    proof: authProof(key, 'register', begin.nonce, username), keyring, sketches, line: { ...line, open },
  });
  holdKey(res.user.username, key.K);
  return res.user;
}

// Sign in (or unlock a signed-in tab): the phrase or the calibration page, and
// the password. `failedPhrase`: acts of a phrase that did not open it in this
// same attempt; if the page then does, that writing becomes a new rhythm.
export async function signIn({ username, password, phraseActs = null, pageActs = null, failedPhrase = null }) {
  const begin = await api.post('/api/auth/begin', { username });
  const readings = {};
  if (phraseActs) readings.phrase = await readingOf('phrase', phraseActs);
  if (pageActs) readings.page = await readingOf('page', pageActs);
  // Said before any guess is spent: the keyring says whether it wants a password.
  if (U.usesPassword(begin.keyring) && !password) throw Object.assign(new Error(NEEDS_PASSWORD), { code: 'needs_password' });
  if (!U.usesPassword(begin.keyring)) password = '';
  const cands = H.candidates(begin.sketches, readings);
  if (!cands.length) throw Object.assign(new Error(NOT_OPENED), { code: 'not_opened' });
  const tries = cands.map((cd) => {
    const input = U.unlockInput(begin.username, cd.r, password);
    return { cd, input, ...U.blindInput(input) };
  });
  const un = await api.post('/api/auth/unlock', { username, nonce: begin.nonce, blinded: tries.map((t) => b64url(t.blinded)) });
  let opened = null;
  let used = null;
  for (let i = 0; i < tries.length && !opened; i++) {
    const t = tries[i];
    const key = await stretch(U.finalizeOutput(t.input, t.blind, fromB64url(un.evaluated[i], 32)), begin.keyring.kdf);
    opened = U.openKeyring(begin.keyring, begin.username, key);
    if (opened) used = t.cd;
  }
  if (!opened) throw Object.assign(new Error(NOT_OPENED), { code: 'not_opened' });
  const key = keyFromK(begin.username, opened);
  if (key.publicKey !== begin.publicKey) throw new Error('The key that opened is not this account\'s.');
  const nonce = fromB64url(begin.nonce, 32);
  const login = R.makeLogin({ sk: key.sk, pk: key.pk, nonce, sketch: used.sketches[0], measure: v1.HAND_VERSION, acts: phraseActs ?? pageActs });
  const res = await api.post('/api/auth/login', {
    username, nonce: begin.nonce, origin: location.origin, proof: authProof(key, 'login', begin.nonce), login: { body: login.body, seal: login.seal },
  });
  holdKey(res.user.username, opened);
  // Keep the hand current: the sketch that opened it follows this writing; a
  // phrase that failed just before the page opened it is a new rhythm (a new
  // device, or a hand that changed). Best effort: signing in already worked.
  try {
    const ops = [];
    const sketch = begin.sketches.find((s) => s.id === used.sketches[0]);
    if (sketch) ops.push({ op: 'refresh', sketch: H.refreshSketch(sketch, used.r, readings[sketch.kind]) });
    if (failedPhrase && pageActs && !phraseActs) ops.push({ op: 'add', sketch: H.makeSketch('phrase', used.r, [await readingOf('phrase', failedPhrase)]) });
    if (ops.length) await updateSketches(key, ops);
  } catch (err) {
    console.warn('[sketches]', err.message);
  }
  return res.user;
}

// The password backup on, off or changed: write the phrase (and type the
// current password, if there is one) so the device recovers r; one counted
// unlock answers both the check and the new lock; the key is locked again.
export async function setPassword(key, { phraseActs = null, pageActs = null, current = '', next = '' }) {
  const begin = await api.post('/api/auth/begin', { username: key.username });
  if (U.usesPassword(begin.keyring) && !current) throw Object.assign(new Error('Type your current password too.'), { code: 'needs_password' });
  const now = U.usesPassword(begin.keyring) ? current : '';
  const readings = {};
  if (phraseActs) readings.phrase = await readingOf('phrase', phraseActs);
  if (pageActs) readings.page = await readingOf('page', pageActs);
  const cands = H.candidates(begin.sketches, readings);
  if (!cands.length) throw Object.assign(new Error(NOT_OPENED), { code: 'not_opened' });
  const tries = cands.slice(0, 3).flatMap((cd) => [now, next].map((pw) => { // two guesses each, within one attempt's 7
    const input = U.unlockInput(begin.username, cd.r, pw);
    return { cd, input, ...U.blindInput(input) };
  }));
  const un = await api.post('/api/auth/unlock', { username: key.username, nonce: begin.nonce, blinded: tries.map((t) => b64url(t.blinded)) });
  for (let i = 0; i < tries.length; i += 2) {
    const opened = U.openKeyring(begin.keyring, begin.username, await stretch(U.finalizeOutput(tries[i].input, tries[i].blind, fromB64url(un.evaluated[i], 32)), begin.keyring.kdf));
    if (!opened) continue;
    if (b64url(opened) !== b64url(key.K)) throw new Error('That opened another key.');
    const kdf = U.newKdf();
    const t = tries[i + 1];
    const unlockKey = await stretch(U.finalizeOutput(t.input, t.blind, fromB64url(un.evaluated[i + 1], 32)), kdf);
    const keyring = U.newKeyring(begin.username, key.K, unlockKey, kdf, { password: !!next });
    const ch = await api.post('/api/auth/challenge', { purpose: 'keyring' });
    return api.put('/api/auth/keyring', { nonce: ch.nonce, origin: location.origin, proof: authProof(key, 'keyring', ch.nonce), keyring });
  }
  throw Object.assign(new Error(NOT_OPENED), { code: 'not_opened' });
}

export async function updateSketches(key, ops) {
  const ch = await api.post('/api/auth/challenge', { purpose: 'sketch' });
  return api.put('/api/auth/sketches', { nonce: ch.nonce, origin: location.origin, proof: authProof(key, 'sketch', ch.nonce), ops });
}

export async function signOutEverywhere(key) {
  const ch = await api.post('/api/auth/challenge', { purpose: 'logout-all' });
  return api.post('/api/auth/logout-all', { nonce: ch.nonce, origin: location.origin, proof: authProof(key, 'logout-all', ch.nonce) });
}
