// A person's room grown from their own key (rooms.md §1: every room has the same
// shape, each person's surfaces are grown from their key, so no two rooms look
// alike). Public: from the owner's public key (law/keys.js roomSeed), so every
// visitor grows the very same walls; the scene only. The lobby's is a fixed
// public seed (rooms.md §1a).

import { keys as K, fromB64url } from 'penpals-law';

// The names light/surface.js grows by (the engine's seed names, scene/surfaces.js SEED_NAME).
export const SEED_NAMES = ['floor', 'ceiling', 'wall-near', 'wall-far', 'wall-left', 'wall-right', 'table'];

const cache = new Map();
const grownFrom = (pk) => Object.fromEntries(SEED_NAMES.map((n) => [n, K.roomSeed(pk, n)]));
// → { [name]: [s0, s1] } for the owner whose public key this is (b64url).
export function roomSeedsOf(publicKey) {
  if (!publicKey) return null;
  if (!cache.has(publicKey)) cache.set(publicKey, grownFrom(fromB64url(publicKey, 32)));
  return cache.get(publicKey);
}

// The lobby: the same shape, its surfaces from one fixed public seed (32 bytes
// that are nobody's key: "the lobby" and zeros).
const LOBBY = new Uint8Array(32);
LOBBY.set(new TextEncoder().encode('the lobby'));
let lobby = null;
export const lobbySeeds = () => (lobby ??= grownFrom(LOBBY));
