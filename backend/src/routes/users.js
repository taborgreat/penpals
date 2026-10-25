import { Router } from 'express';
import { allAccounts, findByName } from '../store/accounts.js';
import { allLetters, at } from '../store/letters.js';
import { letterJson } from './letters.js';
import { canSeeProfile } from '../social.js';
import { keys as K, fromB64url } from 'penpals-law';

const keyOf = (a) => ({ publicKey: a.publicKey, fingerprint: K.fingerprint(fromB64url(a.publicKey, 32)) });

export const usersRouter = Router();

const keptBy = (id) => allLetters().filter((l) => l.savedBy.some((s) => s.userId === id));

// Homepage: every public scripter, newest first.
usersRouter.get('/', (req, res) => {
  const list = allAccounts()
    .filter((a) => !a.private)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  res.json({
    users: list.map((a) => ({
      username: a.username,
      createdAt: a.createdAt,
      lettersSent: a.lettersSent ?? 0,
      savedCount: keptBy(a.id).length,
    })),
  });
});

// Profile: who they are plus the letters they keep. A private profile shows only its name to
// anyone but its owner.
usersRouter.get('/:username', (req, res) => {
  const user = findByName(req.params.username);
  if (!user) return res.status(404).json({ error: 'No such scripter.' });
  const me = req.user?.id ?? null;
  const rel = me === user.id ? 'self' : 'none';
  if (!canSeeProfile(me, user)) {
    return res.json({ user: { username: user.username, private: true, hidden: true, ...keyOf(user) }, relation: rel, saved: [] });
  }
  const savedAt = (l) => at(l.savedBy.find((s) => s.userId === user.id)?.at ?? l.createdAt);
  const saved = keptBy(user.id).sort((a, b) => savedAt(b) - savedAt(a));
  res.json({
    user: { username: user.username, createdAt: user.createdAt, lettersSent: user.lettersSent ?? 0, private: !!user.private, ...keyOf(user) },
    relation: rel,
    saved: saved.map((l) => letterJson(l, req.user)),
  });
});
