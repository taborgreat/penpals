import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { appendLine, completeBytes, readJson, readLines, serial, writeJson } from '../files.js';
import { userDir } from './accounts.js';
import { applyOp } from './ops.js';

// A person's book is two files in data/users/<id>/book/ (books.md, Part A):
//   skeleton.json  pages, where each piece of ink sits, its size, colour,
//                  links, backgrounds. Rewritten whole (atomically) per edit.
//   ink.chain      one stroke collection per line, appended, never rewritten:
//                  {"id":"k_000001","made":"...","strokes":[{"pts":[[x,y,w,t],...],"a":35}],"bounds":[w,h]}
//                  pts are in the ink's own units (top-left 0,0): x, y, the
//                  ink's width there (what pressure became), and t in ms.
//                  `a` is the nib angle, only for broad-nib strokes.
// One writer per person at a time; ink is appended before anything points at it.

const bookDir = (id) => path.join(userDir(id), 'book');
const skeletonFile = (id) => path.join(bookDir(id), 'skeleton.json');
const chainFile = (id) => path.join(bookDir(id), 'ink.chain');
const lock = (id) => `book:${id}`;

export const blankSkeleton = () => ({
  version: 0,
  signature: null,
  signatureColor: config.signatureColors[0],
  home: 'home',
  nextItem: 1,
  pages: { home: { background: config.book.defaultBackground, items: [] } },
});

const skeletons = new Map(); // id → skeleton (cache of the file)
const chains = new Map(); // id → { list: [record], byId: Map, bytes }

export async function getSkeleton(userId) {
  let s = skeletons.get(userId);
  if (!s) {
    s = await readJson(skeletonFile(userId), null) ?? blankSkeleton();
    skeletons.set(userId, s);
  }
  return s;
}

async function getChain(userId) {
  let c = chains.get(userId);
  if (!c) {
    const list = [];
    let bytes = 0;
    for (const line of await readLines(chainFile(userId))) {
      bytes += Buffer.byteLength(line) + 1;
      try {
        list.push(JSON.parse(line));
      } catch { /* a damaged line: skipped, the rest stands */ }
    }
    c = { list, byId: new Map(list.map((r) => [r.id, r])), bytes };
    chains.set(userId, c);
  }
  return c;
}

export const inkRecords = async (userId) => (await getChain(userId)).list;
export const inkById = async (userId, inkId) => (await getChain(userId)).byId.get(inkId) ?? null;
export const hasInk = async (userId, inkId) => (await getChain(userId)).byId.has(inkId);

// The next id is the id on the last complete line + 1 (never a line count).
const nextInkId = (c) => {
  const last = c.list[c.list.length - 1];
  const n = last ? Number(String(last.id).slice(2)) + 1 : 1;
  return `k_${String(n).padStart(6, '0')}`;
};

// A stroke collection as sent by a client, checked and tidied, or an error message.
export function cleanInk(ink) {
  if (!ink || typeof ink !== 'object' || !Array.isArray(ink.strokes)) return 'Ink needs strokes.';
  const { maxStrokes, maxPoints } = config.book;
  if (!ink.strokes.length || ink.strokes.length > maxStrokes) return 'Too many or too few strokes.';
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  let points = 0;
  const strokes = [];
  for (const s of ink.strokes) {
    if (!s || !Array.isArray(s.pts) || !s.pts.length) return 'A stroke needs points.';
    points += s.pts.length;
    if (points > maxPoints) return 'That is too much ink for one piece.';
    const pts = [];
    for (const p of s.pts) {
      if (!Array.isArray(p) || p.length !== 4 || !p.every(num)) return 'Each point is [x, y, width, t].';
      if (p[2] < 0 || p[2] > 200 || p[3] < 0 || p[3] > 3600000) return 'A point is out of range.';
      pts.push(p.map((v) => Math.round(v * 10) / 10));
    }
    const stroke = { pts };
    if (s.a != null) {
      if (!num(s.a)) return 'Bad nib angle.';
      stroke.a = Math.round(s.a);
    }
    strokes.push(stroke);
  }
  if (!Array.isArray(ink.bounds) || ink.bounds.length !== 2 || !ink.bounds.every((v) => num(v) && v > 0 && v <= 20000)) {
    return 'Ink needs bounds [w, h].';
  }
  return { strokes, bounds: ink.bounds.map((v) => Math.round(v * 10) / 10) };
}

// Append a stroke collection to the chain; returns its record.
// Callers hold the person's book lock (see `withBook`).
async function appendInk(userId, ink) {
  const c = await getChain(userId);
  const record = { id: nextInkId(c), made: new Date().toISOString(), strokes: ink.strokes, bounds: ink.bounds };
  const line = JSON.stringify(record);
  const size = Buffer.byteLength(line) + 1;
  if (size > config.book.maxInkLineBytes) throw Object.assign(new Error('That piece of ink is too big.'), { status: 413 });
  if (c.bytes + size > config.book.maxChainBytes) throw Object.assign(new Error('This book is full.'), { status: 413 });
  await appendLine(chainFile(userId), line);
  c.list.push(record);
  c.byId.set(record.id, record);
  c.bytes += size;
  return record;
}

const stale = (version) => Object.assign(new Error('Someone changed this book first; reload it.'), { status: 409, stale: true, version });

// Apply one edit (books.md A5): check the version the client had, apply the op
// to a copy, bump the version, write the skeleton atomically.
async function landEdit(userId, op, base) {
  const current = await getSkeleton(userId);
  if (base != null && base !== current.version) throw stale(current.version);
  const next = structuredClone(current);
  const result = await applyOp(next, op, { hasInk: (id) => hasInk(userId, id) }) ?? {};
  next.version = current.version + 1;
  await writeJson(skeletonFile(userId), next);
  skeletons.set(userId, next);
  return { version: next.version, ...result };
}

export const edit = (userId, op, base) => serial(lock(userId), () => landEdit(userId, op, base));

// New ink: append it to the chain, then place it with an edit, all under the
// one lock. The ink lands first, so the skeleton never points at missing ink.
export function addInk(userId, ink, place, base) {
  return serial(lock(userId), async () => {
    const current = await getSkeleton(userId);
    if (base != null && base !== current.version) throw stale(current.version);
    const record = await appendInk(userId, ink);
    if (!place) return { version: current.version, ink: record.id };
    const out = await landEdit(userId, { ...place, ink: record.id }, current.version);
    return { ...out, ink: record.id };
  });
}

// A whole .book: line 1 is the skeleton with "book" and "name" added, then the
// ink chain as-is (complete lines only). Skeleton read first, chain second: the
// chain always holds everything the skeleton points at.
export async function bookBytes(userId, name) {
  const skeleton = await getSkeleton(userId);
  const head = `${JSON.stringify({ book: 1, name, ...skeleton })}\n`;
  return Buffer.concat([Buffer.from(head), await completeBytes(chainFile(userId))]);
}

export const chainBytes = (userId) => completeBytes(chainFile(userId));

// For migrations: write a book directly (no other writer may be running).
export async function writeBook(userId, skeleton, records) {
  await fs.mkdir(bookDir(userId), { recursive: true });
  for (const r of records) await appendLine(chainFile(userId), JSON.stringify(r));
  await writeJson(skeletonFile(userId), skeleton);
  skeletons.delete(userId);
  chains.delete(userId);
}
