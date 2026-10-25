// Your house in the world (one-world.md, "Spawned matter"): the acts that
// place and move it, made and sealed here with your key, as the world's chain
// takes them (backend/src/world.js says what lands, and regrows the houses):
//   { v: 1, kind: 'house', key, k: 0 }             a house with a table, on the next free plot
//   { v: 1, kind: 'move', key, k, plot: [i, j] }   onto another free plot (k: your acts so far)
// D = SHA-256(T("world") ‖ JCS(act)), sealed as any record is.
import { keys as K, T, jcs, concat, b64url } from 'penpals-law';
import { api } from '../api.js';

const enc = new TextEncoder();
export async function worldDigest(act) {
  return new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', concat(T('world'), enc.encode(jcs(act)))));
}
export async function sealWorld(key, act) {
  return { act, seal: b64url(K.sealOf(key.sk, await worldDigest(act))) };
}
export const houseAct = (key) => ({ v: 1, kind: 'house', key: key.publicKey, k: 0 });
export const moveAct = (key, house, plot) => ({ v: 1, kind: 'move', key: key.publicKey, k: house.k + 1, plot });

// The houses as they stand: { plotM, start, houses: [{ key, name, plot, at, k, n }] }.
export const worldNow = () => api.get('/api/world');

// When you register, one act drops your house (and if it never landed, the next time you are in).
export async function placeHouse(key) {
  const { houses } = await worldNow();
  const mine = houses.find((h) => h.key === key.publicKey);
  if (mine) return mine;
  await api.post('/api/world/acts', await sealWorld(key, houseAct(key)));
  return (await worldNow()).houses.find((h) => h.key === key.publicKey) ?? null;
}

// Your house onto another free plot, with one act.
export async function moveHouse(key, plot) {
  const { houses } = await worldNow();
  const mine = houses.find((h) => h.key === key.publicKey);
  if (!mine) throw new Error('You have no house to move yet.');
  return api.post('/api/world/acts', await sealWorld(key, moveAct(key, mine, plot)));
}
