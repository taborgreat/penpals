// The houses in the world (one-world.md, "Spawned matter"). Pure, so anyone can
// regrow them from the world's chain and get the same places: the stamper
// (backend store/world.js), every client, and a verifier.
//
// The outside is one shared space; plot [0, 0] is the starting area, no one's.
// The plots around it are handed out ring by ring, each ring counterclockwise
// from due +x. Each house stands on one plot, PLOT_M apart (world metres).
//
// Acts, each sealed by its owner's key, k its count of acts (0, 1, ...: an old
// act cannot be played again):
//   { v: 1, kind: 'house', key, k: 0 }               a house with a table, on the next free plot
//   { v: 1, kind: 'move', key, k, plot: [i, j] }     the owner's house onto another free plot
// D = sha256(T("world") ‖ JCS(act)), sealed as any record is: sign(sk, T("seal") ‖ D).
// A stamped line: { n, at, act, seal } (n its place in the chain, from 1).

import { sha256 } from '@noble/hashes/sha2.js';
import { T, jcs, utf8, concat, b64url, fromB64url } from './tags.js';
import { sealOf, verifySeal, isGoodPublicKey } from './keys.js';

export const V = 1;
export const PLOT_M = 12; // metres between plots (one-world.md: how far apart, NEEDS RULING)
export const MAX_RING = 1000; // the farthest ring a house may stand on
export const START = Object.freeze([0, 0]);

export const worldDigest = (act) => sha256(concat(T('world'), utf8(jcs(act))));

// --- the plots ---
export const ringOf = ([i, j]) => Math.max(Math.abs(i), Math.abs(j));
// Counterclockwise from due +x, exactly (integers: the half the point is in, then which side of the other it lies).
const upper = ([i, j]) => j > 0 || (j === 0 && i > 0);
const before = (a, b) => (upper(a) !== upper(b) ? (upper(a) ? -1 : 1) : -Math.sign(a[0] * b[1] - a[1] * b[0]));
const ringPlots = new Map();
// The plots of ring r, in the order they are handed out.
export function ring(r) {
  let out = ringPlots.get(r);
  if (out) return out;
  out = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (ringOf([i, j]) === r) out.push([i, j]);
  out.sort(before);
  if (r <= 64) ringPlots.set(r, out);
  return out;
}
export const plotKey = ([i, j]) => `${i},${j}`;
export const centreOf = ([i, j]) => [i * PLOT_M, j * PLOT_M];
const isPlot = (p) => Array.isArray(p) && p.length === 2 && p.every((v) => Number.isInteger(v)) && ringOf(p) <= MAX_RING;

// The first plot in order that no house stands on.
export function nextFree(state) {
  for (let r = 1; r <= MAX_RING; r++) for (const p of ring(r)) if (!state.taken.has(plotKey(p))) return p;
  return null;
}

// --- the acts ---
const fields = (o, list) => Object.keys(o).sort().join() === list;
const goodKey = (s) => {
  try {
    return isGoodPublicKey(fromB64url(s, 32));
  } catch {
    return false;
  }
};
// Its shape, or why not.
export function shapeOf(act) {
  if (!act || typeof act !== 'object' || act.v !== V) return 'not a world act';
  if (!goodKey(act.key)) return 'not a key';
  if (act.kind === 'house') return fields(act, 'k,key,kind,v') && act.k === 0 ? null : 'a malformed house act';
  if (act.kind === 'move') return fields(act, 'k,key,kind,plot,v') && Number.isInteger(act.k) && act.k >= 1 && isPlot(act.plot) ? null : 'a malformed move';
  return 'not a world act';
}
export function sealed(act, seal) {
  try {
    return verifySeal(fromB64url(act.key, 32), worldDigest(act), fromB64url(seal, 64));
  } catch {
    return false;
  }
}

// Made and sealed on the device (key: the public key, b64url, as everything carries it).
export const houseAct = (key) => ({ v: V, kind: 'house', key, k: 0 });
export const moveAct = (key, house, plot) => ({ v: V, kind: 'move', key, k: house.k + 1, plot: [...plot] });
export function sealWorldAct(sk, act) {
  const bad = shapeOf(act);
  if (bad) throw new Error(`that is ${bad}`);
  return { act, seal: b64url(sealOf(sk, worldDigest(act))) };
}

// --- the houses, grown from the acts in order ---
// state: { houses: Map(key → { plot, k, n }), taken: Map(plotKey → key) }
export const start = () => ({ houses: new Map(), taken: new Map() });

// Why this act cannot land now, or null.
export function check(state, act) {
  const bad = shapeOf(act);
  if (bad) return bad;
  const h = state.houses.get(act.key);
  if (act.kind === 'house') {
    if (h) return 'that key has a house already';
    return nextFree(state) ? null : 'there is no free plot';
  }
  if (!h) return 'that key has no house to move';
  if (act.k !== h.k + 1) return 'that act is out of order';
  if (ringOf(act.plot) === 0) return 'that is the starting area';
  if (state.taken.has(plotKey(act.plot))) return 'that plot is taken';
  return null;
}

// Lands a checked act (in place).
export function apply(state, act, n) {
  const h = state.houses.get(act.key);
  const plot = act.kind === 'house' ? nextFree(state) : act.plot;
  if (h) state.taken.delete(plotKey(h.plot));
  state.houses.set(act.key, { plot, k: act.k, n });
  state.taken.set(plotKey(plot), act.key);
  return state;
}

// The houses of a chain: every line in order, as the stamper took them. A line that could not have
// landed (its shape, its order, its plot) is passed over, as the stamper would have; with `seals`,
// one whose seal is not its key's is too (a verifier regrowing from someone else's copy).
export function grow(lines, { seals = false } = {}) {
  const s = start();
  for (const l of lines) if (!check(s, l.act) && (!seals || sealed(l.act, l.seal))) apply(s, l.act, l.n);
  return s;
}
