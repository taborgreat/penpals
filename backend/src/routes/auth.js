import express, { Router } from 'express';
import { config } from '../config.js';
import { httpError, newId, serial, crashpoint } from '../files.js';
import { findByName, nameTaken, keyTaken, commitAccount } from '../store/accounts.js';
import { createBook } from '../store/books.js';
import { issueNonce, peekNonce, takeNonce } from '../store/nonces.js';
import { holdName, takeHeld, isHeld, evaluate, getUnlock, writeUnlock, oprfKeyOf, replaceKeyring } from '../store/unlock.js';
import { writeCached, lookPath } from '../store/cache.js';
import { createSession, deleteSession, deleteUserSessions, setSessionCookie, clearSessionCookie, requireAuth, originOk } from '../auth.js';
import { take, ipKey } from '../limits.js';
import { confirmFacts } from '../services.js';
import { keys as K, record as R, unlock as U, fromB64url, b64url } from 'penpals-law';

// Accounts (accounts-change.md): the device makes the key K from fresh
// randomness and three signatures, settled by the law on a provisional paper;
// the person keeps it as 24 words or a private key, and may also lock it on the
// server under a password. Signing in is the username and one of those: the
// device opens or rebuilds K and proves it by signing a fresh challenge. No
// route asks for or takes writing to sign in. The server never sees K, the
// words, the password or the randomness; it holds the public key and, for a
// password backup, an OPRF key it answers (and counts) every guess with and the
// locked keyring.

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
  res.json({ user: { ...publicUser(a), passwordBackup: !!u?.keyring } }); // yours only: whether a password locks your key here
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

// A challenge for things a signed-in device does with its key (the keyring, sign out everywhere).
authRouter.post('/challenge', json, requireAuth, (req, res) => {
  take('challenge', ipKey(req));
  const purpose = req.body?.purpose;
  if (!['keyring', 'logout-all'].includes(purpose)) throw httpError(400, 'bad_purpose', 'Unknown purpose.');
  res.json(issueNonce(purpose, req.user.id));
});

// --- registration ---

// Hold the name. With a password backup, make its OPRF key and answer the
// device's blinded password (the keyring will be locked with what it makes).
authRouter.post('/register/begin', json, (req, res) => {
  take('registerIp', ipKey(req));
  const { username, blinded } = req.body ?? {};
  checkName(username);
  if (nameTaken(username)) throw httpError(409, 'name_taken', 'That name is taken.');
  if (blinded !== undefined && typeof blinded !== 'string') throw httpError(400, 'bad_blinded', 'Bad blinded element.');
  const { nonce, expiresAt } = issueNonce('register', username.toLowerCase());
  const oprfKey = holdName(username, nonce, { password: blinded !== undefined });
  res.json({ nonce, expiresAt, ...(oprfKey ? { evaluated: evaluate(b64url(oprfKey), blinded) } : {}) });
});

authRouter.post('/register/finish', json, async (req, res) => {
  const { username, nonce, origin, publicKey, proof, keyring, line } = req.body ?? {};
  checkName(username);
  takeNonce(nonce, 'register', username.toLowerCase());
  const held = takeHeld(username, nonce);
  checkOrigin(req, origin);
  const pk = bytes(publicKey, 32, 'key');
  if (!K.isGoodPublicKey(pk)) throw httpError(400, 'bad_key', 'That is not a usable public key.');
  if (!K.verifyAuth(pk, { purpose: 'register', origin, nonce: bytes(nonce, 32, 'nonce'), username }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'The registration was not signed by this key.');
  }
  // the password backup: a keyring exactly when the registration began with a password
  let ring = null;
  if (held.oprfKey) {
    try {
      ring = U.checkKeyring(keyring);
    } catch {
      throw httpError(400, 'bad_unlock', 'The keyring is malformed.');
    }
  } else if (keyring !== undefined && keyring !== null) throw httpError(400, 'bad_unlock', 'A keyring needs a password begun with the registration.');
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
    const record = await createBook(id, { line: { ink: body, seal: line.seal, open: line.open } });
    const now = new Date().toISOString();
    if (ring) await writeUnlock(id, { oprfKey: b64url(held.oprfKey), keyring: ring });
    crashpoint('register:before-account');
    const a = await commitAccount({ id, username, publicKey, createdAt: now });
    await writeCached(lookPath(id, record.id, 64, body.law, { ageH: 0, views: 0 }), Buffer.from(settled.png)).catch(() => {});
    return a;
  });
  setSessionCookie(res, await createSession(account.id));
  res.status(201).json({ user: publicUser(account) });
});

// --- signing in ---

// A challenge to sign, the public key to check against, and the locked keyring
// if the account has a password backup (null otherwise: the words or the key).
authRouter.post('/begin', json, async (req, res) => {
  const account = typeof req.body?.username === 'string' ? findByName(req.body.username) : null;
  if (!account) throw httpError(404, 'no_such_name', 'There is no one by that name.');
  take('beginIp', ipKey(req));
  take('beginAccount', account.id);
  const u = await getUnlock(account.id);
  res.json({ ...issueNonce('login', account.id), username: account.username, publicKey: account.publicKey, keyring: u?.keyring ?? null });
});

// One guess at the password: answered by the OPRF and counted.
authRouter.post('/unlock', json, async (req, res) => {
  const account = typeof req.body?.username === 'string' ? findByName(req.body.username) : null;
  if (!account) throw httpError(404, 'no_such_name', 'There is no one by that name.');
  const { nonce, blinded } = req.body;
  if (!peekNonce(nonce, 'login', account.id)) throw httpError(400, 'bad_nonce', 'That challenge is not valid; start again.');
  const u = await getUnlock(account.id);
  if (!u?.keyring) throw httpError(409, 'no_password', 'This account has no password backup: sign in with your 24 words or your private key.');
  if (typeof blinded !== 'string') throw httpError(400, 'bad_blinded', 'Send one blinded guess.');
  take('unlockIp', ipKey(req));
  take('unlockAccount', account.id);
  res.json({ evaluated: evaluate(u.oprfKey, blinded) });
});

// The key proves itself: a signature over this challenge, this site and the
// purpose. Nothing else is taken (no writing, no sheet).
const LOGIN_FIELDS = ['username', 'nonce', 'origin', 'proof'];
authRouter.post('/login', json, async (req, res) => {
  const body = req.body ?? {};
  if (Object.keys(body).some((k) => !LOGIN_FIELDS.includes(k))) throw httpError(400, 'bad_login', 'Signing in takes the name, the challenge and its signature, nothing else.');
  const { username, nonce, origin, proof } = body;
  const account = typeof username === 'string' ? findByName(username) : null;
  if (!account) throw httpError(404, 'no_such_name', 'There is no one by that name.');
  takeNonce(nonce, 'login', account.id);
  checkOrigin(req, origin);
  if (!K.verifyAuth(fromB64url(account.publicKey, 32), { purpose: 'login', origin, nonce: bytes(nonce, 32, 'nonce'), username: '' }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'That did not open the key.');
  }
  setSessionCookie(res, await createSession(account.id));
  res.json({ user: publicUser(account) });
});

// --- the password backup, from a signed-in device that holds the key ---

// The server's answer to the new password (its OPRF key is made the first time).
authRouter.post('/keyring/oprf', json, requireAuth, async (req, res) => {
  const { blinded } = req.body ?? {};
  if (typeof blinded !== 'string') throw httpError(400, 'bad_blinded', 'Send one blinded guess.');
  take('unlockIp', ipKey(req));
  take('unlockAccount', req.user.id);
  res.json({ evaluated: evaluate(await oprfKeyOf(req.user.id), blinded) });
});

// The key locked under a new password, or the backup turned off (keyring null).
// The server only checks its shape and that the key signed the change.
authRouter.put('/keyring', json, requireAuth, async (req, res) => {
  const { nonce, origin, proof, keyring } = req.body ?? {};
  takeNonce(nonce, 'keyring', req.user.id);
  checkOrigin(req, origin);
  if (!K.verifyAuth(fromB64url(req.user.publicKey, 32), { purpose: 'keyring', origin, nonce: bytes(nonce, 32, 'nonce'), username: '' }, bytes(proof, 64, 'proof'))) {
    throw httpError(401, 'bad_proof', 'Not signed by the key.');
  }
  let ring = null;
  if (keyring !== null) {
    try {
      ring = U.checkKeyring(keyring);
    } catch {
      throw httpError(400, 'bad_unlock', 'The keyring is malformed.');
    }
  }
  await replaceKeyring(req.user.id, ring);
  res.json({ password: !!ring });
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
