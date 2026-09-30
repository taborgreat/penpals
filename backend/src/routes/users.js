import { Router } from 'express';
import { users, letters, friendships } from '../db.js';
import { requireAuth } from '../auth.js';
import { letterJson } from './letters.js';
import { blockedEitherWay, blockedIds, canSeeProfile, hasBlocked, pairKey, relation } from '../social.js';

export const usersRouter = Router();

const findUser = (name) =>
  users.findOne(
    { usernameLower: String(name).toLowerCase() },
    { projection: { username: 1, createdAt: 1, private: 1, blocked: 1 } },
  );

// Homepage: every public scripter (minus anyone blocked either way), newest first.
usersRouter.get('/', async (req, res) => {
  const filter = { private: { $ne: true } };
  if (req.user) {
    const hidden = await blockedIds(req.user.id);
    if (hidden.length) filter._id = { $nin: hidden };
  }
  const [list, sent, kept] = await Promise.all([
    users.find(filter, { projection: { username: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray(),
    letters.aggregate([
      { $match: { sentAt: { $ne: null } } },
      { $group: { _id: '$senderId', n: { $sum: 1 } } },
    ]).toArray(),
    letters.aggregate([
      { $match: { inkDeleted: false } },
      { $unwind: '$savedBy' },
      { $group: { _id: '$savedBy.userId', n: { $sum: 1 } } },
    ]).toArray(),
  ]);
  const sentBy = new Map(sent.map((r) => [String(r._id), r.n]));
  const keptBy = new Map(kept.map((r) => [String(r._id), r.n]));
  res.json({
    users: list.map((u) => ({
      username: u.username,
      createdAt: u.createdAt,
      lettersSent: sentBy.get(String(u._id)) ?? 0,
      savedCount: keptBy.get(String(u._id)) ?? 0,
    })),
  });
});

// Profile: who they are plus the letters they keep. A private profile shows
// only its name unless you are a friend. Someone who blocked you does not exist.
usersRouter.get('/:username', async (req, res) => {
  const user = await findUser(req.params.username);
  if (!user) return res.status(404).json({ error: 'No such scripter.' });
  const me = req.user?.id ?? null;
  if (me && !me.equals(user._id)) {
    const meDoc = await users.findOne({ _id: me }, { projection: { blocked: 1 } });
    if (hasBlocked(meDoc, user._id)) {
      return res.json({ user: { username: user.username, hidden: true, blockedByMe: true }, relation: 'none', saved: [] });
    }
    if (hasBlocked(user, me)) return res.status(404).json({ error: 'No such scripter.' });
  }
  const rel = await relation(me, user._id);
  if (!(await canSeeProfile(me, user))) {
    return res.json({ user: { username: user.username, private: true, hidden: true }, relation: rel, saved: [] });
  }

  const [lettersSent, saved] = await Promise.all([
    letters.countDocuments({ senderId: user._id, sentAt: { $ne: null } }),
    letters.find({ 'savedBy.userId': user._id, inkDeleted: false }).toArray(),
  ]);
  const savedAt = (l) => l.savedBy.find((s) => s.userId.equals(user._id))?.at ?? l.createdAt;
  saved.sort((a, b) => savedAt(b) - savedAt(a));

  res.json({
    user: { username: user.username, createdAt: user.createdAt, lettersSent, private: !!user.private },
    relation: rel,
    saved: saved.map((l) => letterJson(l, req.user)),
  });
});

// Send a friend request, or accept the one they sent you.
usersRouter.post('/:username/friend', requireAuth, async (req, res) => {
  const other = await findUser(req.params.username);
  if (!other) return res.status(404).json({ error: 'No such scripter.' });
  const me = req.user.id;
  if (other._id.equals(me)) return res.status(400).json({ error: 'That is you.' });
  if (await blockedEitherWay(me, other._id)) return res.status(404).json({ error: 'No such scripter.' });

  const key = pairKey(me, other._id);
  const existing = await friendships.findOne({ key });
  if (existing?.status === 'accepted') return res.json({ relation: 'friends' });
  if (existing?.requester.equals(me)) return res.json({ relation: 'outgoing' });
  if (existing) {
    await friendships.updateOne({ _id: existing._id }, { $set: { status: 'accepted', acceptedAt: new Date() } });
    return res.json({ relation: 'friends' });
  }
  try {
    await friendships.insertOne({ key, users: [me, other._id], requester: me, status: 'pending', createdAt: new Date() });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  res.json({ relation: 'outgoing' });
});

// Cancel a request, decline one, or unfriend.
usersRouter.delete('/:username/friend', requireAuth, async (req, res) => {
  const other = await findUser(req.params.username);
  if (!other) return res.status(404).json({ error: 'No such scripter.' });
  await friendships.deleteOne({ key: pairKey(req.user.id, other._id) });
  res.json({ relation: 'none' });
});

// Block: they vanish for you and you for them; any friendship ends.
usersRouter.post('/:username/block', requireAuth, async (req, res) => {
  const other = await findUser(req.params.username);
  if (!other) return res.status(404).json({ error: 'No such scripter.' });
  if (other._id.equals(req.user.id)) return res.status(400).json({ error: 'That is you.' });
  await users.updateOne({ _id: req.user.id }, { $addToSet: { blocked: other._id } });
  await friendships.deleteOne({ key: pairKey(req.user.id, other._id) });
  res.json({ ok: true });
});

usersRouter.delete('/:username/block', requireAuth, async (req, res) => {
  const other = await findUser(req.params.username);
  if (!other) return res.status(404).json({ error: 'No such scripter.' });
  await users.updateOne({ _id: req.user.id }, { $pull: { blocked: other._id } });
  res.json({ ok: true });
});
