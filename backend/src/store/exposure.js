import crypto from 'node:crypto';
import path from 'node:path';
import { readJson, writeJson, serial } from '../files.js';
import { userDir } from './accounts.js';
import { dirOf } from './letters.js';
import { now as clock } from '../clock.js';

// Exposure (law v2: fading): how often each record has been seen, counted at
// most once per viewer per day (refreshes do not count), the owner included.
// Nothing runs for a sheet nobody looks at: a count changes, and a file is
// written, only when someone views a look.
//
//   data/users/<id>/exposure.json     { <inkId>: views }
//   data/letters/<id>/exposure.json   { ink: views }
//
// Who has already been counted today is kept in memory only, as hashes of
// (day, viewer, record): nothing about viewers is written to disk. After a
// restart a viewer may be counted once more that day; nothing else changes.

const DAY_MS = 24 * 60 * 60 * 1000;
const files = { user: (id) => path.join(userDir(id), 'exposure.json'), letter: (id) => path.join(dirOf(id), 'exposure.json') };
const counts = new Map(); // file → { inkId: views } (read once, then kept)
let today = -1;
let seenToday = new Set();

async function load(file) {
  if (!counts.has(file)) counts.set(file, (await readJson(file, {})) ?? {});
  return counts.get(file);
}

// The views of one record so far.
export async function viewsOf(scope, id, ink = 'ink') {
  return (await load(files[scope](id)))[ink] ?? 0;
}

// Count this view (if this viewer has not been counted for this record today)
// and return the record's views. `viewer` is the account id or the IP key.
// `keep` says whether the record still exists (a deleted letter is not recreated).
export async function countView(scope, id, ink, viewer, { now = clock(), keep = () => true } = {}) {
  const day = Math.floor(now / DAY_MS);
  if (day !== today) {
    today = day;
    seenToday = new Set();
  }
  const mark = crypto.createHash('sha256').update(`${day}\0${viewer}\0${scope}\0${id}\0${ink}`).digest('base64url');
  const file = files[scope](id);
  if (seenToday.has(mark)) return viewsOf(scope, id, ink);
  seenToday.add(mark);
  return serial(`exposure:${file}`, async () => {
    const c = await load(file);
    c[ink] = (c[ink] ?? 0) + 1;
    if (keep()) await writeJson(file, c);
    return c[ink];
  });
}

// For tests: forget who was counted today and what was read.
export function resetExposure() {
  today = -1;
  seenToday = new Set();
  counts.clear();
}
