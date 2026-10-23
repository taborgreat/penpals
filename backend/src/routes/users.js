import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { allAccounts, findByName, getAccount, updateTwo, without, withId } from '../store/accounts.js';
import { allLetters, at } from '../store/letters.js';
import { letterJson } from './letters.js';
import { blockedEitherWay, blockedIds, canSeeProfile, hasBlocked, relation } from '../social.js';

export const usersRouter = Router();

const keptBy = (id) => allLetters().filter((l) => l.savedBy.some((s) => s.userId === id));

// Homepage: every public scripter (minus anyone blocked either way), newest first.
usersRouter.get('/', (req, res) => {
  const hidden = new Set(req.user ? blockedIds(req.user.id) : []);
  const list = allAccounts()
    .filter((a) => !a.private && !hidden.has(a.id))
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

// Profile: who they are plus the letters they keep. A private profile shows
// only its name unless you are a friend. Someone who blocked you does not exist.
usersRouter.get('/:username', (req, res) => {
  const user = findByName(req.params.username);
  if (!user) return res.status(404).json({ error: 'No such scripter.' });
  const me = req.user?.id ?? null;
  if (me && me !== user.id) {
    if (hasBlocked(getAccount(me), user.id)) {
      return res.json({ user: { username: user.username, hidden: true, blockedByMe: true }, relation: 'none', saved: [] });
    }
    if (hasBlocked(user, me)) return res.status(404).json({ error: 'No such scripter.' });
  }
  const rel = relation(me, user.id);
  if (!canSeeProfile(me, user)) {
    return res.json({ user: { username: user.username, private: true, hidden: true }, relation: rel, saved: [] });
  }
  const savedAt = (l) => at(l.savedBy.find((s) => s.userId === user.id)?.at ?? l.createdAt);
  const saved = keptBy(user.id).sort((a, b) => savedAt(b) - savedAt(a));
  res.json({
    user: { username: user.username, createdAt: user.createdAt, lettersSent: user.lettersSent ?? 0, private: !!user.private },
    relation: rel,
    saved: saved.map((l) => letterJson(l, req.user)),
  });
});

const other = (req, res) => {
  const them = findByName(req.params.username);
  if (!them) res.status(404).json({ error: 'No such scripter.' });
  return them;
};

// Send a friend request, or accept the one they sent you.
usersRouter.post('/:username/friend', requireAuth, async (req, res) => {
  const them = other(req, res);
  if (!them) return;
  const me = req.user.id;
  if (them.id === me) return res.status(400).json({ error: 'That is you.' });
  if (blockedEitherWay(me, them.id)) return res.status(404).json({ error: 'No such scripter.' });
  const result = await updateTwo(me, them.id, (A, B) => {
    if (A.friends.includes(B.id)) return 'friends';
    if (A.outgoing.includes(B.id)) return 'outgoing';
    if (A.incoming.includes(B.id)) {
      A.incoming = without(A.incoming, B.id);
      B.outgoing = without(B.outgoing, A.id);
      A.friends = withId(A.friends, B.id);
      B.friends = withId(B.friends, A.id);
      return 'friends';
    }
    A.outgoing = withId(A.outgoing, B.id);
    B.incoming = withId(B.incoming, A.id);
    return 'outgoing';
  });
  res.json({ relation: result });
});

const unfriend = (A, B) => {
  for (const [x, y] of [[A, B], [B, A]]) {
    x.friends = without(x.friends, y.id);
    x.incoming = without(x.incoming, y.id);
    x.outgoing = without(x.outgoing, y.id);
  }
};

// Cancel a request, decline one, or unfriend.
usersRouter.delete('/:username/friend', requireAuth, async (req, res) => {
  const them = other(req, res);
  if (!them) return;
  if (them.id !== req.user.id) await updateTwo(req.user.id, them.id, unfriend);
  res.json({ relation: 'none' });
});

// Block: they vanish for you and you for them; any friendship ends.
usersRouter.post('/:username/block', requireAuth, async (req, res) => {
  const them = other(req, res);
  if (!them) return;
  if (them.id === req.user.id) return res.status(400).json({ error: 'That is you.' });
  await updateTwo(req.user.id, them.id, (A, B) => {
    unfriend(A, B);
    A.blocked = withId(A.blocked, B.id);
  });
  res.json({ ok: true });
});

usersRouter.delete('/:username/block', requireAuth, async (req, res) => {
  const them = other(req, res);
  if (!them) return;
  if (them.id !== req.user.id) await updateTwo(req.user.id, them.id, (A) => { A.blocked = without(A.blocked, them.id); });
  res.json({ ok: true });
});
