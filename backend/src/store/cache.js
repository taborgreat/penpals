import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { writeAtomic } from '../files.js';

// The look cache: rendered PNGs, disposable (every one can be grown again from
// the chain and the seeds). File names say exactly what they are, so a name
// never holds anything else:  looks/<userId>/<inkId>@<scale>.L<law>[-a<ageH>-e<views>]-r<rev>.png
// (law 2 looks age and fade: one file per age bucket in hours and views bucket).
// Least-recently-used files go first when the cache passes cacheMaxBytes.

export const cacheDir = path.join(config.dataDir, 'cache', 'looks');
const entries = new Map(); // path → { size, used }
let total = 0;

export const lookName = (inkId, scale, law, view = { ageH: 0, views: 0 }) => `${inkId}@${scale}.L${law}${law >= 2 ? `-a${view.ageH}-e${view.views}` : ''}-r${config.render.rev}`;
export const lookPath = (userId, inkId, scale, law, view, lod = 0) => path.join(cacheDir, userId, `${lookName(inkId, scale, law, view)}${lod ? `-l${lod}` : ''}.png`);
// A sheet's whole scene field (deflated PNKS), that every window is cut from (sight.js).

export async function loadCache() {
  entries.clear();
  total = 0;
  let users;
  try {
    users = await fs.readdir(cacheDir);
  } catch {
    return 0;
  }
  for (const u of users) {
    let files;
    try {
      files = await fs.readdir(path.join(cacheDir, u));
    } catch {
      continue;
    }
    for (const f of files) {
      const p = path.join(cacheDir, u, f);
      if (!f.endsWith('.png') || !f.includes(`-r${config.render.rev}.`)) {
        await fs.rm(p, { force: true }); // an older law or render revision
        continue;
      }
      const st = await fs.stat(p);
      entries.set(p, { size: st.size, used: st.mtimeMs });
      total += st.size;
    }
  }
  return entries.size;
}

export async function readCached(p) {
  const e = entries.get(p);
  if (!e) return null;
  try {
    const buf = await fs.readFile(p);
    e.used = Date.now();
    return buf;
  } catch {
    entries.delete(p);
    total -= e.size;
    return null;
  }
}

export async function writeCached(p, buf) {
  await writeAtomic(p, buf);
  const old = entries.get(p);
  if (old) total -= old.size;
  entries.set(p, { size: buf.length, used: Date.now() });
  total += buf.length;
  if (total > config.render.cacheMaxBytes) await evict();
}

async function evict() {
  const list = [...entries].sort((a, b) => a[1].used - b[1].used);
  for (const [p, e] of list) {
    if (total <= config.render.cacheMaxBytes * 0.9) break;
    await fs.rm(p, { force: true });
    entries.delete(p);
    total -= e.size;
  }
}

export const cacheStats = () => ({ files: entries.size, bytes: total });
