import { users, friendships } from './db.js';

// Friendships are stored once per pair under a sorted key.
export const pairKey = (a, b) => [String(a), String(b)].sort().join(':');

export const hasBlocked = (doc, targetId) => (doc?.blocked ?? []).some((id) => id.equals(targetId));

export async function blockedEitherWay(a, b) {
  return (await users.countDocuments({ $or: [{ _id: a, blocked: b }, { _id: b, blocked: a }] })) > 0;
}

// Everyone `me` has blocked plus everyone who has blocked `me`.
export async function blockedIds(me) {
  const [meDoc, blockers] = await Promise.all([
    users.findOne({ _id: me }, { projection: { blocked: 1 } }),
    users.find({ blocked: me }, { projection: { _id: 1 } }).toArray(),
  ]);
  return [...(meDoc?.blocked ?? []), ...blockers.map((u) => u._id)];
}

// 'self' | 'friends' | 'incoming' | 'outgoing' | 'none', from `me`'s point of view.
export async function relation(me, other) {
  if (!me) return 'none';
  if (me.equals(other)) return 'self';
  const f = await friendships.findOne({ key: pairKey(me, other) });
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester.equals(me) ? 'outgoing' : 'incoming';
}

// May `viewerId` (null when anonymous) see `target`'s profile and kept letters?
// Private profiles are for friends only; blocks hide people both ways.
export async function canSeeProfile(viewerId, target) {
  if (viewerId?.equals(target._id)) return true;
  if (viewerId && (await blockedEitherWay(viewerId, target._id))) return false;
  if (!target.private) return true;
  if (!viewerId) return false;
  return (await relation(viewerId, target._id)) === 'friends';
}
