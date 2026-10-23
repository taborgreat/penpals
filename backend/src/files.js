import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

// The few file operations everything is built on (books.md, A5-A6).

// Write a whole file so it is never seen half-written: write a temp file,
// fsync it, then rename it over the real one. Survives a crash or power loss.
export async function writeAtomic(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
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

// Append one line (plus its newline) in a single write, then fsync. A line only
// exists once its newline lands; readers ignore an unfinished last line.
export async function appendLine(file, line) {
  if (line.includes('\n')) throw new Error('a line cannot contain a newline');
  await fs.mkdir(path.dirname(file), { recursive: true });
  const handle = await fs.open(file, 'a');
  try {
    await handle.write(`${line}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
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
