import { config } from './config.js';
import { getAccount } from './store/accounts.js';
import { sessionUserId } from './store/sessions.js';
import { httpError } from './files.js';

export { createSession, deleteSession, deleteUserSessions } from './store/sessions.js';

// Sessions are a 30-day httpOnly cookie for browsing and layout; every mark
// (ink, letters, opens) also needs the key (a seal), which no cookie carries.
export const COOKIE = 'penpals_session';

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: config.auth.cookieSecure, maxAge: config.sessionTtlMs, path: '/' });
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, { path: '/', secure: config.auth.cookieSecure, sameSite: 'lax' });
}

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Attaches req.user = { id, username, publicKey } (or null) to every request.
export async function sessionMiddleware(req, res, next) {
  req.user = null;
  const token = readCookie(req, COOKIE);
  if (token) {
    const account = getAccount(await sessionUserId(token));
    if (account) {
      req.user = { id: account.id, username: account.username, publicKey: account.publicKey };
      req.sessionToken = token;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return next(httpError(401, 'signed_out', 'Please sign in.'));
  next();
}

// The page's origin, as the browser stated it. Writes must come from this site
// (CSRF), and signed auth messages name it, so a signature made for one site
// is no use to another.
export function originOk(req) {
  const origin = req.get('origin');
  if (!origin) return false;
  if (config.auth.origins) return config.auth.origins.includes(origin);
  try {
    return new URL(origin).host === req.get('host');
  } catch {
    return false;
  }
}

export function requireOrigin(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (!originOk(req)) return next(httpError(403, 'bad_origin', 'This request did not come from this site.'));
  next();
}
