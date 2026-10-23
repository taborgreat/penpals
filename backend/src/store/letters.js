import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { listDirs, readJson, serial, writeAtomic, writeJson } from '../files.js';

// Letters are not part of anyone's book. Each is one folder:
//   data/letters/<id>/letter.json   who, when, kept by, upvotes, delivery
//   data/letters/<id>/ink.png       the writing (alpha) for display
//   data/letters/<id>/ink.strokes   the timed strokes, when it has them
// The letter's ink lives inside the letter, so when the letter goes (24 h after
// opening, 90 days unopened, unless someone keeps it) its ink goes with it.
// The in-memory index is rebuilt from these folders on every start.

const lettersDir = path.join(config.dataDir, 'letters');
const dirOf = (id) => path.join(lettersDir, id);
export const metaPath = (id) => path.join(dirOf(id), 'letter.json');
export const inkPath = (id) => path.join(dirOf(id), 'ink.png');
export const strokesPath = (id) => path.join(dirOf(id), 'ink.strokes');

const index = new Map(); // id → letter.json contents

export async function loadLetters() {
  index.clear();
  for (const id of await listDirs(lettersDir)) {
    const meta = await readJson(metaPath(id), null);
    if (meta) index.set(meta.id, meta);
  }
  return index.size;
}

export const getLetter = (id) => index.get(String(id)) ?? null;
export const allLetters = () => [...index.values()];

export async function createLetter(meta, inkBuffer, strokesBuffer) {
  await fs.mkdir(dirOf(meta.id), { recursive: true });
  await writeAtomic(inkPath(meta.id), inkBuffer);
  if (strokesBuffer) await writeAtomic(strokesPath(meta.id), strokesBuffer);
  await writeJson(metaPath(meta.id), meta); // last: a letter exists once its metadata does
  index.set(meta.id, meta);
  return meta;
}

// Change one letter: `change(copy)` edits a copy, written whole. Returning
// false from `change` leaves the letter as it was.
export function updateLetter(id, change) {
  return serial(`letter:${id}`, async () => {
    const current = index.get(id);
    if (!current) return null;
    const next = structuredClone(current);
    if ((await change(next)) === false) return current;
    await writeJson(metaPath(id), next);
    index.set(id, next);
    return next;
  });
}

export function deleteLetter(id) {
  return serial(`letter:${id}`, async () => {
    index.delete(id);
    await fs.rm(dirOf(id), { recursive: true, force: true });
  });
}

// Dates are stored as ISO strings.
export const at = (iso) => (iso ? Date.parse(iso) : null);
export const inMail = (l, now = Date.now()) => !!l.recipientId && at(l.expiresAt) > now;
export const savedCount = (userId) => allLetters().filter((l) => l.savedBy.some((s) => s.userId === userId)).length;
