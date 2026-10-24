import crypto from 'node:crypto';
import { config } from '../config.js';
import { httpError } from '../files.js';

// Challenges: 32 random bytes, for one purpose and one subject (a name or an
// account), good for config.auth.nonceTTL, used once. Kept in memory: a
// restart only means asking again. The oldest go first when there are too many.

const nonces = new Map(); // b64url → { purpose, subject, expiresAt }

export function issueNonce(purpose, subject, now = Date.now()) {
  const nonce = crypto.randomBytes(32).toString('base64url');
  nonces.set(nonce, { purpose, subject, expiresAt: now + config.auth.nonceTtlMs });
  while (nonces.size > config.auth.maxNonces) nonces.delete(nonces.keys().next().value);
  return { nonce, expiresAt: new Date(now + config.auth.nonceTtlMs).toISOString() };
}

// Is this nonce live for this purpose and subject? (does not use it up)
export function peekNonce(nonce, purpose, subject, now = Date.now()) {
  const n = nonces.get(nonce);
  return !!n && n.purpose === purpose && n.subject === subject && n.expiresAt > now;
}

// Use a nonce up: it must be live, for this purpose and subject. Throws otherwise.
export function takeNonce(nonce, purpose, subject, now = Date.now()) {
  const n = typeof nonce === 'string' ? nonces.get(nonce) : null;
  if (!n || n.purpose !== purpose || n.subject !== subject) throw httpError(400, 'bad_nonce', 'That challenge is not valid; start again.');
  nonces.delete(nonce);
  if (n.expiresAt <= now) throw httpError(400, 'bad_nonce', 'That challenge expired; start again.');
}

export function sweepNonces(now = Date.now()) {
  for (const [k, n] of nonces) if (n.expiresAt <= now) nonces.delete(k);
}
