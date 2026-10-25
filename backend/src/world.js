// The houses in the world (one-world.md, "Spawned matter"): pure, so anyone
// can regrow them from the world's chain and get the same places. (It belongs
// in the law next to being.js and shared.js, with every other message the key
// signs; it is here until that move.)
//
// The outside is one shared space; plot [0, 0] is the starting area, and the
// plots around it are handed out ring by ring, each ring counterclockwise from
// due +x. Each house stands on one plot, PLOT_M apart (world metres).
//
// Acts, each signed by its owner's key, k its count of acts (0, 1, ...: an old
// act cannot be played again):
//   { v: 1, kind: 'house', key, k: 0 }               a house with a table, on the next free plot
//   { v: 1, kind: 'move', key, k, plot: [i, j] }     the owner's house onto another free plot
// D = SHA-256(T("world") ‖ JCS(act)), sealed as any record is: sign(sk, T("seal") ‖ D).
// A stamped line: { n, at, act, seal } (n its place in the chain, from 1).

import { keys as K, T, jcs, concat, fromB64url } from 'penpals-law';

export const V = 1;
export const PLOT_M = 12; // metres between plots (Tabor's to set)
export const MAX_RING = 1000; // the farthest ring a house may stand on
export const START = Object.freeze([0, 0]);

const enc = new TextEncoder();
export async function worldDigest(act) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', concat(T('world'), enc.encode(jcs(act)))));
}

// --- the plots ---
export const ringOf = ([i, j]) => Math.max(Math.abs(i), Math.abs(j));
const turn = ([i, j]) => (Math.atan2(j, i) + 2 * Math.PI) % (2 * Math.PI);
const ringPlots = new Map();
// The plots of ring r, in the order they are handed out.
export function ring(r) {
  let out = ringPlots.get(r);
  if (out) return out;
  out = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (ringOf([i, j]) === r) out.push([i, j]);
  out.sort((a, b) => turn(a) - turn(b));
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
const b64key = (s) => {
  try {
    return K.isGoodPublicKey(fromB64url(s, 32));
  } catch {
    return false;
  }
};
// Its shape, or why not.
export function shapeOf(act) {
  if (!act || typeof act !== 'object' || act.v !== V) return 'not a world act';
  if (!b64key(act.key)) return 'not a key';
  if (act.kind === 'house') return fields(act, 'k,key,kind,v') && act.k === 0 ? null : 'a malformed house act';
  if (act.kind === 'move') return fields(act, 'k,key,kind,plot,v') && Number.isInteger(act.k) && act.k >= 1 && isPlot(act.plot) ? null : 'a malformed move';
  return 'not a world act';
}
export async function sealed(act, seal) {
  try {
    return K.verifySeal(fromB64url(act.key, 32), await worldDigest(act), fromB64url(seal, 64));
  } catch {
    return false;
  }
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

// The houses of a chain: every line in order, as the stamper took them (a line
// that could not have landed is passed over, as the stamper would have).
export function grow(lines) {
  const s = start();
  for (const l of lines) if (!check(s, l.act)) apply(s, l.act, l.n);
  return s;
}
