// Who may come into a house, see its book and the letters it keeps (rooms.md §4). There are no
// friends and no blocks (one-world.md): its owner always; anyone else, unless it is private.
export function canSeeProfile(viewerId, target) {
  if (viewerId && viewerId === target.id) return true;
  return !target.private;
}
