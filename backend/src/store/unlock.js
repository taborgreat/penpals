import path from 'node:path';
import { config } from '../config.js';
import { readJson, writeJson, serial, httpError } from '../files.js';
import { userDir } from './accounts.js';
import { unlock as U, handkey as H, fromB64url, b64url } from 'penpals-law';

// What opens an account's key, kept beside it (data/users/<id>/unlock.json, private):
//   { oprfKey, keyring, sketches: [{ id, kind, code, hand, offsets, helper, created, lastUsed }] }
// oprfKey never leaves the server: it is the "server's half" of every guess.
// The keyring holds K encrypted under a key only the writer's device can derive
// (OPRF output + argon2id); the sketches turn their hand into the bits r.
// The server cannot read either; it can only count how often it is asked.

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

// Public parts, for a device that is signing in.
export const publicUnlock = (u) => ({
  keyring: u.keyring,
  sketches: u.sketches.map(({ id, kind, code, hand, offsets, helper }) => ({ id, kind, code, hand, offsets, helper })),
});

export async function writeUnlock(userId, value) {
  await writeJson(file(userId), value);
  cache.set(userId, value);
}

// --- registration: a name held for a while, with its OPRF key made up front ---

const pending = new Map(); // lowercased name → { username, oprfKey, nonce, expiresAt }

export function holdName(username, nonce, now = Date.now()) {
  const lower = username.toLowerCase();
  const held = pending.get(lower);
  if (held && held.expiresAt > now) throw httpError(409, 'name_pending', 'Someone is registering that name right now.');
  const oprfKey = U.newServerKey();
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

export function evaluate(oprfKey, blindedList) {
  const key = fromB64url(oprfKey, 32);
  return blindedList.map((b) => {
    let point;
    try {
      point = fromB64url(b, 32);
    } catch {
      throw httpError(400, 'bad_blinded', 'Bad blinded element.');
    }
    try {
      return b64url(U.evaluateBlinded(key, point));
    } catch {
      throw httpError(400, 'bad_blinded', 'Bad blinded element.');
    }
  });
}

// --- sketches (rhythms) ---

const capOf = (kind) => (kind === 'phrase' ? config.unlock.phraseCap : config.unlock.pageCap);

// ops: [{ op: 'refresh', sketch } | { op: 'add', sketch }]. A refresh replaces the
// sketch with the same id; an add beyond the cap replaces that kind's oldest-used one.
export function applySketchOps(userId, ops, now = new Date().toISOString()) {
  return serial(lock(userId), async () => {
    const u = await getUnlock(userId);
    if (!u) throw httpError(404, 'no_account', 'No such account.');
    const next = structuredClone(u);
    for (const o of ops) {
      let s;
      try {
        s = H.checkSketch(o?.sketch);
      } catch {
        throw httpError(400, 'bad_sketch', 'That sketch is malformed.');
      }
      if (o.op === 'refresh') {
        const i = next.sketches.findIndex((x) => x.id === s.id && x.kind === s.kind);
        if (i < 0) throw httpError(404, 'no_sketch', 'No such sketch.');
        next.sketches[i] = { ...s, created: next.sketches[i].created, lastUsed: now };
      } else if (o.op === 'add') {
        if (next.sketches.some((x) => x.id === s.id)) throw httpError(409, 'sketch_exists', 'That sketch is already there.');
        const same = next.sketches.filter((x) => x.kind === s.kind);
        if (same.length >= capOf(s.kind)) {
          // Full: the oldest sketch that has never opened the account goes first;
          // if every one has, the one used least recently. A sketch that works is
          // never pushed out by one that has not been tried.
          const rank = (x) => (x.lastUsed ? `1${x.lastUsed}` : `0${x.created}`);
          const out = same.sort((a, b) => rank(a).localeCompare(rank(b)))[0];
          next.sketches = next.sketches.filter((x) => x.id !== out.id);
        }
        next.sketches.push({ ...s, created: now, lastUsed: null });
      } else throw httpError(400, 'bad_op', 'Unknown sketch operation.');
    }
    await writeUnlock(userId, next);
    return next.sketches.map((x) => ({ id: x.id, kind: x.kind }));
  });
}

export function replaceKeyring(userId, keyring) {
  return serial(lock(userId), async () => {
    const u = await getUnlock(userId);
    if (!u) throw httpError(404, 'no_account', 'No such account.');
    await writeUnlock(userId, { ...structuredClone(u), keyring });
  });
}

export function touchSketch(userId, sketchId, now = new Date().toISOString()) {
  return serial(lock(userId), async () => {
    const u = await getUnlock(userId);
    const s = u?.sketches.find((x) => x.id === sketchId);
    if (!s) return;
    const next = structuredClone(u);
    next.sketches.find((x) => x.id === sketchId).lastUsed = now;
    await writeUnlock(userId, next);
  });
}

export const forgetUnlock = (userId) => cache.delete(userId);
