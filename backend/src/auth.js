import crypto from 'node:crypto';
import { users, sessions } from './db.js';
import { config } from './config.js';

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

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await sessions.insertOne({ _id: token, userId, createdAt: new Date() });
  return token;
}

export const deleteSession = (token) => sessions.deleteOne({ _id: token });

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
    const session = await sessions.findOne({ _id: token });
    const user = session && (await users.findOne({ _id: session.userId }, { projection: { username: 1 } }));
    if (user) {
      req.user = { id: user._id, username: user.username };
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in.' });
  next();
}
