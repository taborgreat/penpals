import express, { Router } from 'express';
import path from 'node:path';
import { config } from '../config.js';
import { appendLine, httpError, newId, serial, crashpoint } from '../files.js';
import { findByName, nameTaken, keyTaken, commitAccount, userDir } from '../store/accounts.js';
import { createBook } from '../store/books.js';
import { issueNonce, peekNonce, takeNonce } from '../store/nonces.js';
import { holdName, takeHeld, isHeld, evaluate, getUnlock, publicUnlock, writeUnlock, applySketchOps, touchSketch, replaceKeyring } from '../store/unlock.js';
import { writeCached, lookPath } from '../store/cache.js';
import { createSession, deleteSession, deleteUserSessions, setSessionCookie, clearSessionCookie, requireAuth, originOk } from '../auth.js';
import { take, ipKey } from '../limits.js';
import { confirmFacts } from '../services.js';
import { keys as K, record as R, unlock as U, handkey as H, fromB64url, hex } from 'penpals-law';

// Accounts open with the hand + password (design B): the device recovers the
// random key K and proves it holds it by signing a fresh challenge. The server
// never sees K, the password, or the hand bits; it holds the public key, an
// OPRF key it uses to answer (and count) every guess, the encrypted keyring,
// and the sketches.

export const authRouter = Router();
const json = express.json({ limit: '1mb' });

const publicUser = (a) => ({ id: a.id, username: a.username, publicKey: a.publicKey, fingerprint: K.fingerprint(fromB64url(a.publicKey, 32)) });

const bytes = (v, n, what) => {
  try {
    return fromB64url(v, n);
  } catch {
    throw httpError(400, `bad_${what}`, `Bad ${what}.`);
  }
};

function checkName(username) {
  if (typeof username !== 'string' || !config.auth.username.test(username)) throw httpError(400, 'bad_name', 'A name is 2-20 letters, numbers or underscores.');
  if (config.auth.reserved.includes(username.toLowerCase())) throw httpError(400, 'reserved_name', 'That name is reserved.');
}

// The origin the device signed must be the one the browser says it is on.
function checkOrigin(req, origin) {
  if (!originOk(req) || origin !== req.get('origin')) throw httpError(403, 'bad_origin', 'This request did not come from this site.');
}

authRouter.get('/me', async (req, res) => {
  const a = req.user ? findByName(req.user.username) : null;
  if (!a) return res.json({ user: null });
  const u = await getUnlock(a.id);
  res.json({ user: { ...publicUser(a), passwordBackup: !!u && U.usesPassword(u.keyring) } }); // yours only: whether a password backs your hand
});

authRouter.get('/name/:name', (req, res) => {
  take('nameIp', ipKey(req));
  const name = req.params.name;
  let valid = true;
  try {
    checkName(name);
  } catch {
    valid = false;
  }
  res.json({ valid, free: valid && !nameTaken(name) && !isHeld(name) });
});

// A challenge for things a signed-in device does with its key (sketches, the keyring, sign out everywhere).
authRouter.post('/challenge', json, requireAuth, (req, res) => {
  take('challenge', ipKey(req));
  const purpose = req.body?.purpose;
  if (!['sketch', 'keyring', 'logout-all'].includes(purpose)) throw httpError(400, 'bad_purpose', 'Unknown purpose.');
  res.json(issueNonce(purpose, req.user.id));
});

// --- registration ---

// Hold the name, make its OPRF key, and answer the device's first blinded guess
// (the one its keyring will be made from).
authRouter.post('/register/begin', json, (req, res) => {
  take('registerIp', ipKey(req));
  const { username, blinded } = req.body ?? {};
  checkName(username);
  if (nameTaken(username)) throw httpError(409, 'name_taken', 'That name is taken.');
  if (typeof blinded !== 'string') throw httpError(400, 'bad_blinded', 'Bad blinded element.');
  const { nonce, expiresAt } = issueNonce('register', username.toLowerCase());
  const oprfKey = holdName(username, nonce);
  const [evaluated] = evaluate(K.keyText(oprfKey), [blinded]);
  res.json({ nonce, expiresAt, evaluated });
});

authRouter.post('/register/finish', json, async (req, res) => {
  const { username, nonce, origin, publicKey, proof, keyring, sketches, line } = req.body ?? {};
  checkName(username);
  takeNonce(nonce, 'register', username.toLowerCase());
  const held = takeHeld(username, nonce);
  checkOrigin(req, origin);
  const pk = bytes(publicKey, 32, 'key');
  if (!K.isGoodPublicKey(pk)) throw httpError(400, 'bad_key', 'That is not a usable public key.');
  if (!K.verifyAuth(pk, { purpose: 'register', origin, nonce: bytes(nonce, 32, 'nonce'), username }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'The registration was not signed by this key.');
  }
  let ring;
  let sk;
  try {
    ring = U.checkKeyring(keyring);
    if (!Array.isArray(sketches)) throw new Error();
    sk = sketches.map(H.checkSketch);
  } catch {
    throw httpError(400, 'bad_unlock', 'The keyring or the sketches are malformed.');
  }
  const phrases = sk.filter((s) => s.kind === 'phrase').length;
  const pages = sk.filter((s) => s.kind === 'page').length;
  if (phrases < 1 || pages < 1 || phrases > config.unlock.phraseCap || pages > config.unlock.pageCap) {
    throw httpError(400, 'bad_unlock', 'Registration needs your phrase and the calibration page.');
  }
  // The signature: sheet 0, sealed, open from birth, and named for this account.
  const body = line?.ink;
  R.checkInkBody(body, { maxActsBytes: config.book.maxSignatureActsBytes });
  if (body.use !== 'signature' || body.sheet !== K.SHEET_ZERO || body.name !== username || body.key !== publicKey) {
    throw httpError(400, 'bad_signature', 'The registration signature must be your name, on sheet 0, sealed by this key.');
  }
  const D = R.verifySealed(line, pk);
  const seed = R.verifyOpenFor(body, D, line.open);
  const settled = await confirmFacts(body, seed, { ua: req.get('user-agent') ?? '' });

  const account = await serial('names', async () => {
    if (nameTaken(username)) throw httpError(409, 'name_taken', 'That name is taken.');
    if (keyTaken(publicKey)) throw httpError(409, 'key_taken', 'That key already has an account.');
    const id = newId();
    const record = await createBook(id, { line: { ink: body, seal: line.seal, open: line.open }, paperFamily: body.paper });
    const now = new Date().toISOString();
    await writeUnlock(id, { oprfKey: K.keyText(held.oprfKey), keyring: ring, sketches: sk.map((s) => ({ ...s, created: now, lastUsed: null })) });
    crashpoint('register:before-account');
    const a = await commitAccount({ id, username, publicKey, createdAt: now });
    await writeCached(lookPath(id, record.id, 64, body.law, { ageH: 0, views: 0 }), Buffer.from(settled.png)).catch(() => {});
    return a;
  });
  setSessionCookie(res, await createSession(account.id));
  res.status(201).json({ user: publicUser(account) });
});

// --- signing in ---

authRouter.post('/begin', json, async (req, res) => {
  const account = typeof req.body?.username === 'string' ? findByName(req.body.username) : null;
  if (!account) throw httpError(404, 'no_such_name', 'There is no one by that name.');
  take('beginIp', ipKey(req));
  take('beginAccount', account.id);
  const u = await getUnlock(account.id);
  if (!u) throw httpError(409, 'no_unlock', 'This account cannot be opened here.');
  res.json({ ...issueNonce('login', account.id), username: account.username, publicKey: account.publicKey, ...publicUnlock(u) });
});

// One attempt: up to one guess per sketch, all answered at once and counted once.
authRouter.post('/unlock', json, async (req, res) => {
  const account = typeof req.body?.username === 'string' ? findByName(req.body.username) : null;
  if (!account) throw httpError(404, 'no_such_name', 'There is no one by that name.');
  const { nonce, blinded } = req.body;
  if (!peekNonce(nonce, 'login', account.id)) throw httpError(400, 'bad_nonce', 'That challenge is not valid; start again.');
  const u = await getUnlock(account.id);
  const most = config.unlock.phraseCap + config.unlock.pageCap;
  if (!Array.isArray(blinded) || blinded.length < 1 || blinded.length > most) throw httpError(400, 'bad_blinded', `Send 1 to ${most} blinded guesses.`);
  take('unlockIp', ipKey(req));
  take('unlockAccount', account.id);
  res.json({ evaluated: evaluate(u.oprfKey, blinded) });
});

authRouter.post('/login', json, async (req, res) => {
  const { username, nonce, origin, proof, login } = req.body ?? {};
  const account = typeof username === 'string' ? findByName(username) : null;
  if (!account) throw httpError(404, 'no_such_name', 'There is no one by that name.');
  takeNonce(nonce, 'login', account.id);
  checkOrigin(req, origin);
  const pk = fromB64url(account.publicKey, 32);
  if (!K.verifyAuth(pk, { purpose: 'login', origin, nonce: bytes(nonce, 32, 'nonce'), username: '' }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'That did not open the key.');
  }
  // The login sheet: sealed by the key, naming this challenge and the sketch that opened it.
  R.checkLoginBody(login?.body);
  if (login.body.key !== account.publicKey || login.body.nonce !== nonce) throw httpError(400, 'bad_login', 'The login sheet is not for this challenge.');
  const D = K.recordDigest(login.body);
  if (!K.verifySeal(pk, D, bytes(login.seal, 64, 'seal'))) throw httpError(401, 'bad_seal', 'The login sheet is not sealed by the key.');
  const u = await getUnlock(account.id);
  if (!u.sketches.some((s) => s.id === login.body.sketch)) throw httpError(400, 'bad_login', 'Unknown sketch.');
  await serial(`logins:${account.id}`, () => appendLine(path.join(userDir(account.id), 'logins.chain'), JSON.stringify({ at: new Date().toISOString(), D: hex(D), sketch: login.body.sketch })));
  await touchSketch(account.id, login.body.sketch);
  setSessionCookie(res, await createSession(account.id));
  res.json({ user: publicUser(account) });
});

// Re-sketch after a login (the hand as it is now), or add a rhythm.
authRouter.put('/sketches', json, requireAuth, async (req, res) => {
  const { nonce, origin, proof, ops } = req.body ?? {};
  takeNonce(nonce, 'sketch', req.user.id);
  checkOrigin(req, origin);
  if (!K.verifyAuth(fromB64url(req.user.publicKey, 32), { purpose: 'sketch', origin, nonce: bytes(nonce, 32, 'nonce'), username: '' }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'Not signed by the key.');
  }
  if (!Array.isArray(ops) || !ops.length || ops.length > 4) throw httpError(400, 'bad_op', 'Send 1 to 4 sketch operations.');
  res.json({ sketches: await applySketchOps(req.user.id, ops) });
});

// The keyring locked again, with or without a password backup (the writer's
// choice, made on their device after writing their phrase to recover the hand
// bits). The server only checks its shape and that the key signed the change.
authRouter.put('/keyring', json, requireAuth, async (req, res) => {
  const { nonce, origin, proof, keyring } = req.body ?? {};
  takeNonce(nonce, 'keyring', req.user.id);
  checkOrigin(req, origin);
  if (!K.verifyAuth(fromB64url(req.user.publicKey, 32), { purpose: 'keyring', origin, nonce: bytes(nonce, 32, 'nonce'), username: '' }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'Not signed by the key.');
  }
  let ring;
  try {
    ring = U.checkKeyring(keyring);
  } catch {
    throw httpError(400, 'bad_unlock', 'The keyring is malformed.');
  }
  await replaceKeyring(req.user.id, ring);
  res.json({ password: U.usesPassword(ring) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.sessionToken) await deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.post('/logout-all', json, requireAuth, async (req, res) => {
  const { nonce, origin, proof } = req.body ?? {};
  takeNonce(nonce, 'logout-all', req.user.id);
  checkOrigin(req, origin);
  if (!K.verifyAuth(fromB64url(req.user.publicKey, 32), { purpose: 'logout-all', origin, nonce: bytes(nonce, 32, 'nonce'), username: '' }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'Not signed by the key.');
  }
  const ended = await deleteUserSessions(req.user.id);
  clearSessionCookie(res);
  res.json({ ended });
});

