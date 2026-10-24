// A writer's device, for tests: everything the frontend will do with the law.
import { keys as K, record as R, unlock as U, handkey as H, fuzzy as F, b64url, fromB64url } from 'penpals-law';
import * as S from 'penpals-law/lab/synth';

export const FAMILY = Object.freeze({ grain: 8, weight: 8, tooth: 0 });
const PAGE_TEXT = 'the quick brown fox'; // the page reading only needs page-sized writing; short keeps tests quick

export function person(seed, username, { password = `pass-${seed}`, phrase = 'amber river quiet lamp' } = {}) {
  return { seed, username, password, phrase, writer: S.makeWriter(seed), K: null, sk: null, pk: null };
}

const phraseActs = (p, session) => S.write(p.writer, p.phrase, session);

// Register: name on sheet 0, the phrase three times, a page; key, sketches, keyring.
export async function register(c, p, { family = FAMILY } = {}) {
  p.K = K.newK();
  p.sk = K.skFromK(p.K);
  p.pk = K.publicKeyOf(p.sk);
  const r = H.newR();
  const phraseWritings = [1, 2, 3].map((s) => phraseActs(p, s));
  const pageWriting = S.write(p.writer, PAGE_TEXT, 1);
  const phraseReadings = phraseWritings.map((a) => H.readingOf('phrase', a));
  const sketches = [H.makeSketch('phrase', r, phraseReadings), H.makeSketch('page', r, [H.readingOf('page', pageWriting)])];
  // what never leaves the device, kept here so the privacy canary can look for it
  p.secret = {
    r: F.packBits(r),
    w: phraseReadings.map((rd) => F.packBits(H.bitsOf(rd, sketches[0].offsets))),
    acts: [...phraseWritings, pageWriting],
  };
  const input = U.unlockInput(p.username, r, p.password);
  const { blind, blinded } = U.blindInput(input);
  const begin = await c.post('/api/auth/register/begin', { username: p.username, blinded: b64url(blinded) });
  if (begin.status !== 200) return begin;
  const kdf = U.newKdf();
  const key = U.unlockKey(U.finalizeOutput(input, blind, fromB64url(begin.data.evaluated, 32)), kdf);
  const keyring = U.newKeyring(p.username, p.K, key, kdf, { password: !!p.password }); // no password: name, phrase and hand alone
  const nameActs = S.write(p.writer, p.username.replace(/[^a-z]/gi, 'a'), 9);
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet: K.SHEET_ZERO, use: 'signature', family, acts: nameActs, name: p.username });
  const line = { ...made.line, open: R.makeOpen(p.sk, made.D, K.SHEET_ZERO, made.seed) };
  const nonce = begin.data.nonce;
  const proof = K.authProof(p.sk, { purpose: 'register', origin: c.origin, nonce: fromB64url(nonce, 32), username: p.username });
  return c.post('/api/auth/register/finish', {
    username: p.username,
    nonce,
    origin: c.origin,
    publicKey: b64url(p.pk),
    proof: b64url(proof),
    keyring,
    sketches,
    line,
  });
}

// Sign in by writing the phrase (session n) and typing the password.
export async function signIn(c, p, { session = 5, password = p.password, actsOverride = null } = {}) {
  const begin = await c.post('/api/auth/begin', { username: p.username });
  if (begin.status !== 200) return { step: 'begin', ...begin };
  const acts = actsOverride ?? phraseActs(p, session);
  const reading = H.readingOf('phrase', acts);
  const cands = H.candidates(begin.data.sketches, { phrase: reading });
  if (!cands.length) return { step: 'hand', status: 0 };
  const tries = cands.map((cd) => {
    const input = U.unlockInput(p.username, cd.r, password);
    return { cd, input, ...U.blindInput(input) };
  });
  const un = await c.post('/api/auth/unlock', { username: p.username, nonce: begin.data.nonce, blinded: tries.map((t) => b64url(t.blinded)) });
  if (un.status !== 200) return { step: 'unlock', ...un };
  let Kopen = null;
  let used = null;
  tries.forEach((t, i) => {
    if (Kopen) return;
    const key = U.unlockKey(U.finalizeOutput(t.input, t.blind, fromB64url(un.data.evaluated[i], 32)), begin.data.keyring.kdf);
    Kopen = U.openKeyring(begin.data.keyring, p.username, key);
    if (Kopen) used = t.cd;
  });
  if (!Kopen) return { step: 'keyring', status: 0 };
  const sk = K.skFromK(Kopen);
  const pk = K.publicKeyOf(sk);
  const nonce = fromB64url(begin.data.nonce, 32);
  const login = R.makeLogin({ sk, pk, nonce, sketch: used.sketches[0], measure: 1, acts });
  const proof = K.authProof(sk, { purpose: 'login', origin: c.origin, nonce, username: '' });
  const res = await c.post('/api/auth/login', { username: p.username, nonce: begin.data.nonce, origin: c.origin, proof: b64url(proof), login: { body: login.body, seal: login.seal } });
  p.secret?.acts.push(acts);
  if (res.status === 200) {
    p.K = Kopen;
    p.sk = sk;
    p.pk = pk;
  }
  return { step: 'login', ...res, r: used.r, reading };
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

export { K, R, U, H, S, b64url, fromB64url };
