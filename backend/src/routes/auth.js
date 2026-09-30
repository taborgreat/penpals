import { Router } from 'express';
import { users } from '../db.js';
import {
  hashPassword, verifyPassword, createSession, deleteSession,
  setSessionCookie, clearSessionCookie,
} from '../auth.js';

export const authRouter = Router();
const USERNAME = /^[a-z0-9_]{2,20}$/i;

const publicUser = (user) => ({ id: user._id, username: user.username });

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME.test(username)) {
    return res.status(400).json({ error: 'Username: 2-20 letters, numbers or underscores.' });
  }
  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const doc = {
    username,
    usernameLower: username.toLowerCase(),
    passwordHash: hashPassword(password),
    createdAt: new Date(),
  };
  try {
    const { insertedId } = await users.insertOne(doc);
    doc._id = insertedId;
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'That name is taken.' });
    throw err;
  }
  setSessionCookie(res, await createSession(doc._id));
  res.status(201).json({ user: publicUser(doc) });
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  const user = typeof username === 'string'
    ? await users.findOne({ usernameLower: username.toLowerCase() })
    : null;
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Wrong username or password.' });
  }
  setSessionCookie(res, await createSession(user._id));
  res.json({ user: publicUser(user) });
});

authRouter.post('/logout', async (req, res) => {
  if (req.sessionToken) await deleteSession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user });
});
