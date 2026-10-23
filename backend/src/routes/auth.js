import { Router } from 'express';
import { createAccount, findByName } from '../store/accounts.js';
import {
  hashPassword, verifyPassword, createSession, deleteSession,
  setSessionCookie, clearSessionCookie,
} from '../auth.js';

export const authRouter = Router();
const USERNAME = /^[a-z0-9_]{2,20}$/i;

const publicUser = (account) => ({ id: account.id, username: account.username });

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME.test(username)) {
    return res.status(400).json({ error: 'Username: 2-20 letters, numbers or underscores.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const account = await createAccount({ username, passwordHash: hashPassword(password) });
  setSessionCookie(res, await createSession(account.id));
  res.status(201).json({ user: publicUser(account) });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const account = typeof username === 'string' ? findByName(username) : null;
  if (!account || typeof password !== 'string' || !verifyPassword(password, account.passwordHash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  setSessionCookie(res, await createSession(account.id));
  res.json({ user: publicUser(account) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.sessionToken) await deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user });
});
