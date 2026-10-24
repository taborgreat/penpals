import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { listDirs, readJson, serial, writeAtomic, writeJson, crashpoint } from '../files.js';

// Letters are not part of anyone's book. Each is one folder, deleted whole when
// the letter goes (24 h after opening, 90 days unopened, unless someone keeps it):
//   pad letter    letter.json · ink.line.json (the sealed record) · sheet.seed (PRIVATE) · look/ (cache)
//   photo letter  letter.json · ink.line.json (sealed hashes of the scan) · ink.png · ink.strokes
// letter.json is written last (a letter exists once it does) and removed first
// (so a half-deleted letter is never mistaken for one with its seed gone).

const lettersDir = path.join(config.dataDir, 'letters');
export const dirOf = (id) => path.join(lettersDir, id);
export const metaPath = (id) => path.join(dirOf(id), 'letter.json');
export const linePath = (id) => path.join(dirOf(id), 'ink.line.json');
export const seedPath = (id) => path.join(dirOf(id), 'sheet.seed');
export const inkPath = (id) => path.join(dirOf(id), 'ink.png');
export const strokesPath = (id) => path.join(dirOf(id), 'ink.strokes');
export const lookDir = (id) => path.join(dirOf(id), 'look');

const index = new Map(); // id → letter.json contents
const sheets = new Map(); // senderId → Set(sheet)

export async function loadLetters() {
  index.clear();
  sheets.clear();
  let swept = 0;
  for (const id of await listDirs(lettersDir)) {
    const meta = await readJson(metaPath(id), null);
    if (!meta) {
      await fs.rm(dirOf(id), { recursive: true, force: true }); // never finished, or half deleted
      swept++;
      continue;
    }
    remember(meta);
  }
  if (swept) console.warn(`[letters] swept ${swept} unfinished letter folder(s)`);
  return index.size;
}

function remember(meta) {
  index.set(meta.id, meta);
  if (meta.sheet) {
    if (!sheets.has(meta.senderId)) sheets.set(meta.senderId, new Set());
    sheets.get(meta.senderId).add(meta.sheet);
  }
}

export const getLetter = (id) => index.get(String(id)) ?? null;
export const allLetters = () => [...index.values()];
export const sheetUsedInLetters = (userId, sheet) => !!sheets.get(userId)?.has(sheet);

// files: { line: object, seed?: b64url, png?: Buffer, strokes?: Buffer }
export async function createLetter(meta, files) {
  await fs.mkdir(dirOf(meta.id), { recursive: true });
  if (files.seed) await writeAtomic(seedPath(meta.id), files.seed);
  if (files.png) await writeAtomic(inkPath(meta.id), files.png);
  if (files.strokes) await writeAtomic(strokesPath(meta.id), files.strokes);
  await writeJson(linePath(meta.id), files.line);
  crashpoint('letter:before-meta');
  await writeJson(metaPath(meta.id), meta); // last: a letter exists once its metadata does
  remember(meta);
  return meta;
}

export async function readLine(id) {
  return readJson(linePath(id), null);
}
export async function readSeed(id) {
  try {
    return (await fs.readFile(seedPath(id), 'utf8')).trim();
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
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
    const meta = index.get(id);
    index.delete(id);
    if (meta?.sheet) sheets.get(meta.senderId)?.delete(meta.sheet);
    await fs.rm(metaPath(id), { force: true }); // first: from here on it is not a letter
    await fs.rm(dirOf(id), { recursive: true, force: true });
  });
}

export const exists = (id) => index.has(id);

// Dates are stored as ISO strings.
export const at = (iso) => (iso ? Date.parse(iso) : null);
export const inMail = (l, now = Date.now()) => !!l.recipientId && at(l.expiresAt) > now;
export const savedCount = (userId) => allLetters().filter((l) => l.savedBy.some((s) => s.userId === userId)).length;
