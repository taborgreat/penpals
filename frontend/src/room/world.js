// Your house in the world (one-world.md): the acts that place and move it,
// made and sealed here with your key, as the world's chain takes them. What
// lands and where every house stands is the law's (law/world.js), the same
// here, on the stamper and in a verifier.
import { world as W } from 'penpals-law';
import { api } from '../api.js';

export const sealWorld = (key, act) => W.sealWorldAct(key.sk, act);
export const houseAct = (key) => W.houseAct(key.publicKey);
export const moveAct = (key, house, plot) => W.moveAct(key.publicKey, house, plot);

// The houses as they stand: { plotM, start, houses: [{ key, name, plot, at, k, n }] }.
export const worldNow = () => api.get('/api/world');

// When you register, one act drops your house (and if it never landed, the next time you are in).
export async function placeHouse(key) {
  const { houses } = await worldNow();
  const mine = houses.find((h) => h.key === key.publicKey);
  if (mine) return mine;
  await api.post('/api/world/acts', sealWorld(key, houseAct(key)));
  return (await worldNow()).houses.find((h) => h.key === key.publicKey) ?? null;
}

// Your house onto another free plot, with one act.
export async function moveHouse(key, plot) {
  const { houses } = await worldNow();
  const mine = houses.find((h) => h.key === key.publicKey);
  if (!mine) throw new Error('You have no house to move yet.');
  return api.post('/api/world/acts', sealWorld(key, moveAct(key, mine, plot)));
}
