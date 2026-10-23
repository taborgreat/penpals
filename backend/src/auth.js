import crypto from 'node:crypto';
import { config } from './config.js';
import { getAccount } from './store/accounts.js';
import { sessionUserId } from './store/sessions.js';

export { createSession, deleteSession } from './store/sessions.js';

const SCRYPT = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
export const COOKIE = 'penpals_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(actual, expected);
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', maxAge: config.sessionTtlMs, path: '/' });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

// Attaches req.user = { id, username } (or null) to every request.
export async function sessionMiddleware(req, res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const account = getAccount(await sessionUserId(token));
    if (account) {
      req.user = { id: account.id, username: account.username };
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}
