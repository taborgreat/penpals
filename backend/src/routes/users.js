import { Router } from 'express';
import { findByName } from '../store/accounts.js';
import { canSeeProfile } from '../social.js';
import { keys as K, fromB64url } from 'penpals-law';

const keyOf = (a) => ({ publicKey: a.publicKey, fingerprint: K.fingerprint(fromB64url(a.publicKey, 32)) });

export const usersRouter = Router();

// Who someone is (their house in the world is theirs: one-world.md): their name, their key. A private
// one shows only its name to anyone but its owner.
usersRouter.get('/:username', (req, res) => {
  const user = findByName(req.params.username);
  if (!user) return res.status(404).json({ error: 'No such scripter.' });
  const me = req.user?.id ?? null;
  const rel = me === user.id ? 'self' : 'none';
  if (!canSeeProfile(me, user)) {
    return res.json({ user: { username: user.username, private: true, hidden: true, ...keyOf(user) }, relation: rel });
  }
  res.json({ user: { username: user.username, createdAt: user.createdAt, private: !!user.private, ...keyOf(user) }, relation: rel });
});
