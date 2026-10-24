import path from 'node:path';
import { config } from '../config.js';
import { readJson, writeJson, serial, httpError } from '../files.js';
import { userDir } from './accounts.js';
import { unlock as U, fromB64url, b64url } from 'penpals-law';

// The password backup, kept beside an account that has one (data/users/<id>/unlock.json, private):
//   { oprfKey, keyring | null }
// oprfKey never leaves the server: it is the "server's half" of every guess at
// the password. The keyring holds the account key K encrypted under a key only
// the writer's device can derive (OPRF output + argon2id); the server cannot
// read it, only count how often it is asked. An account without a password
// backup has no keyring here (its 24 words or private key open it).

const file = (id) => path.join(userDir(id), 'unlock.json');
const cache = new Map();
const lock = (id) => `unlock:${id}`;

export async function getUnlock(userId) {
  let u = cache.get(userId);
  if (!u) {
    u = await readJson(file(userId), null);
    if (u) cache.set(userId, u);
  }
  return u;
}

export async function writeUnlock(userId, value) {
  await writeJson(file(userId), value);
  cache.set(userId, value);
}

// --- registration: a name held for a while (with an OPRF key made up front when a password is chosen) ---

const pending = new Map(); // lowercased name → { username, oprfKey | null, nonce, expiresAt }

export function holdName(username, nonce, { password = false } = {}, now = Date.now()) {
  const lower = username.toLowerCase();
  const held = pending.get(lower);
  if (held && held.expiresAt > now) throw httpError(409, 'name_pending', 'Someone is registering that name right now.');
  const oprfKey = password ? U.newServerKey() : null;
  pending.set(lower, { username, oprfKey, nonce, expiresAt: now + config.auth.pendingTtlMs });
  return oprfKey;
}

export function takeHeld(username, nonce, now = Date.now()) {
  const lower = String(username).toLowerCase();
  const held = pending.get(lower);
  if (!held || held.nonce !== nonce || held.expiresAt <= now) throw httpError(400, 'not_held', 'Start the registration again.');
  pending.delete(lower);
  return held;
}
export const isHeld = (username, now = Date.now()) => (pending.get(username.toLowerCase())?.expiresAt ?? 0) > now;

export function sweepHeld(now = Date.now()) {
  for (const [k, h] of pending) if (h.expiresAt <= now) pending.delete(k);
}

// --- evaluating guesses ---

export function evaluate(oprfKey, blinded) {
  let point;
  try {
    point = fromB64url(blinded, 32);
  } catch {
    throw httpError(400, 'bad_blinded', 'Bad blinded element.');
  }
  try {
    return b64url(U.evaluateBlinded(fromB64url(oprfKey, 32), point));
  } catch {
    throw httpError(400, 'bad_blinded', 'Bad blinded element.');
  }
}

// The account's OPRF key, made the first time it sets a password backup.
export function oprfKeyOf(userId) {
  return serial(lock(userId), async () => {
    const u = await getUnlock(userId);
    if (u?.oprfKey) return u.oprfKey;
    const made = { oprfKey: b64url(U.newServerKey()), keyring: null };
    await writeUnlock(userId, made);
    return made.oprfKey;
  });
}

// The backup set, changed, or turned off (null).
export function replaceKeyring(userId, keyring) {
  return serial(lock(userId), async () => {
    const u = await getUnlock(userId);
    if (!u?.oprfKey) {
      if (keyring === null) return; // (no backup to turn off)
      throw httpError(409, 'no_oprf', 'Ask the server to answer your password first.');
    }
    await writeUnlock(userId, { ...structuredClone(u), keyring });
  });
}

export const forgetUnlock = (userId) => cache.delete(userId);
