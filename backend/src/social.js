import { allAccounts, getAccount } from './store/accounts.js';

// Who is whose friend, who blocked whom: all read from the account files.

export const hasBlocked = (account, targetId) => !!account?.blocked.includes(targetId);

export const blockedEitherWay = (a, b) => hasBlocked(getAccount(a), b) || hasBlocked(getAccount(b), a);

// Everyone `me` has blocked plus everyone who has blocked `me`.
export function blockedIds(me) {
  const mine = getAccount(me)?.blocked ?? [];
  const theirs = allAccounts()
    .filter((a) => a.blocked.includes(me))
    .map((a) => a.id);
  return [...new Set([...mine, ...theirs])];
}

// 'self' | 'friends' | 'incoming' | 'outgoing' | 'none', from `me`'s point of view.
export function relation(me, other) {
  if (!me) return 'none';
  if (me === other) return 'self';
  const a = getAccount(me);
  if (!a) return 'none';
  if (a.friends.includes(other)) return 'friends';
  if (a.outgoing.includes(other)) return 'outgoing';
  if (a.incoming.includes(other)) return 'incoming';
  return 'none';
}

// May `viewerId` (null when anonymous) see `target`'s profile, book and kept letters?
// Private profiles are for friends only; blocks hide people both ways.
export function canSeeProfile(viewerId, target) {
  if (viewerId && viewerId === target.id) return true;
  if (viewerId && blockedEitherWay(viewerId, target.id)) return false;
  if (!target.private) return true;
  if (!viewerId) return false;
  return relation(viewerId, target.id) === 'friends';
}
