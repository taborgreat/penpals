import path from 'node:path';
import { appendLine, readLines } from '../files.js';
import { userDir } from './accounts.js';

// The seeds of a writer's closed sheets: data/users/<id>/seeds.chain, private,
// append-only, one { sheet, seed, at } per line. Never served, never in the
// .book; the server needs a seed only to grow that sheet's paper for a look.
// It sits outside book/ on purpose. A seed is written before the record that
// commits to it, so the chain never holds a closed record without its seed.

const file = (id) => path.join(userDir(id), 'seeds.chain');
const cache = new Map(); // userId → Map(sheet → seed b64url)

async function load(userId) {
  let m = cache.get(userId);
  if (!m) {
    m = new Map();
    for (const line of await readLines(file(userId))) {
      try {
        const { sheet, seed } = JSON.parse(line);
        if (!m.has(sheet)) m.set(sheet, seed);
      } catch { /* a damaged line: skipped */ }
    }
    cache.set(userId, m);
  }
  return m;
}

export const seedOf = async (userId, sheet) => (await load(userId)).get(sheet) ?? null;

// Callers hold the writer's book lock.
export async function addSeed(userId, sheet, seed) {
  const m = await load(userId);
  if (m.has(sheet)) return; // already there (a retried upload)
  await appendLine(file(userId), JSON.stringify({ sheet, seed, at: new Date().toISOString() }));
  m.set(sheet, seed);
}

export const forgetSeeds = (userId) => cache.delete(userId);
