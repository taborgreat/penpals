import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// The few file operations everything is built on (books.md, A5-A6).

const POSIX = process.platform !== 'win32';

// Make a directory's entries durable (a rename or a new file in it). Windows
// has no directory fsync; NTFS journals the metadata itself.
async function syncDir(dir) {
  if (!POSIX) return;
  const h = await fs.open(dir, 'r');
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}

// For the crash tests: PENPALS_CRASH=<name> makes the process die right here.
export function crashpoint(name) {
  if (process.env.PENPALS_CRASH === name) {
    process.stderr.write(`crashpoint ${name}\n`);
    process.exit(137);
  }
}

// Write a whole file so it is never seen half-written: write a temp file,
// fsync it, then rename it over the real one. Survives a crash or power loss.
export async function writeAtomic(file, data) {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
  await syncDir(dir);
}

export const writeJson = (file, value) => writeAtomic(file, `${JSON.stringify(value, null, 1)}\n`);

export async function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw err;
  }
}

// Cut a file back to its last newline: bytes after it were never a line
// (a crash mid-append), so this is recovery, not rewriting. Returns bytes cut.
export async function truncateTornTail(file) {
  let h;
  try {
    h = await fs.open(file, 'r+');
  } catch (err) {
    if (err.code === 'ENOENT') return 0;
    throw err;
  }
  try {
    const { size } = await h.stat();
    if (size === 0) return 0;
    // Read backwards in chunks until a newline (or the start) is found.
    const chunk = 64 * 1024;
    let end = size;
    while (end > 0) {
      const start = Math.max(0, end - chunk);
      const buf = Buffer.alloc(end - start);
      await h.read(buf, 0, buf.length, start);
      const nl = buf.lastIndexOf(0x0a);
      if (nl >= 0) {
        const keep = start + nl + 1;
        if (keep === size) return 0;
        await h.truncate(keep);
        await h.sync();
        return size - keep;
      }
      end = start;
    }
    await h.truncate(0);
    await h.sync();
    return size;
  } finally {
    await h.close();
  }
}

// Append one line (plus its newline) in a single write, then fsync. A line only
// exists once its newline lands; readers ignore an unfinished last line. A torn
// tail from an earlier crash is cut first, so the new line never glues onto it.
export async function appendLine(file, line) {
  if (line.includes('\n')) throw new Error('a line cannot contain a newline');
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const existed = fss.existsSync(file);
  const cut = await truncateTornTail(file);
  if (cut) console.warn(`[files] cut ${cut} torn bytes from ${file}`);
  const handle = await fs.open(file, 'a');
  try {
    await handle.writeFile(`${line}\n`); // writeFile loops until every byte is written
    await handle.sync();
  } finally {
    await handle.close();
  }
  if (!existed) await syncDir(dir);
}

// The complete lines of a file (an unfinished last line, from a crash mid-write, is left out).
export async function readLines(file) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const end = text.lastIndexOf('\n');
  if (end < 0) return [];
  return text.slice(0, end).split('\n').filter((l) => l.length);
}

// The bytes of a file up to and including its last newline: what can be handed
// out while another write may be landing at the end.
export async function completeBytes(file) {
  let buf;
  try {
    buf = await fs.readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT') return Buffer.alloc(0);
    throw err;
  }
  const end = buf.lastIndexOf(0x0a);
  return end < 0 ? Buffer.alloc(0) : buf.subarray(0, end + 1);
}

// One writer at a time per key: work for the same key runs in order, never at once.
const queues = new Map();
export function serial(key, work) {
  const prev = queues.get(key) ?? Promise.resolve();
  const run = prev.then(work, work);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

// Several keys at once, always taken in the same order so two callers can't deadlock.
export function serialAll(keys, work) {
  const sorted = [...new Set(keys)].sort();
  const step = (i) => (i === sorted.length ? work() : serial(sorted[i], () => step(i + 1)));
  return step(0);
}

export const newId = (bytes = 12) => crypto.randomBytes(bytes).toString('hex');

export async function listDirs(dir) {
  try {
    return (await fs.readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

// Remove leftover temp files (a crash between writing a temp file and renaming it).
export async function sweepTemps(dir) {
  let n = 0;
  const walk = async (d) => {
    let entries;
    try {
      entries = await fs.readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else if (e.name.endsWith('.tmp')) {
        await fs.rm(p, { force: true });
        n++;
      }
    }
  };
  await walk(dir);
  return n;
}

// A typed HTTP error: `code` is the machine-readable reason clients can act on.
export const httpError = (status, code, message) => Object.assign(new Error(message), { status, code });
