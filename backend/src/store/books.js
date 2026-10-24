import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { appendLine, completeBytes, readJson, readLines, serial, writeJson, crashpoint, httpError } from '../files.js';
import { userDir, findByName } from './accounts.js';
import { addSeed } from './seeds.js';
import { applyOp, allItems, blankSurfaces } from './ops.js';
import { keys as K, fromB64url } from 'penpals-law';

// A person's book is two files in data/users/<id>/book/ (books.md Part A, keys.md):
//   skeleton.json  { version, signature, paperFamily, home, nextItem, pages, surfaces }:
//                  layout only, rewritten whole (atomically) per edit; surfaces
//                  are the room's walls, floor, ceiling and table top (rooms.md §1)
//   ink.chain      append-only lines, public:
//                  { id, made, ink: <sealed body>, seal, open? }   a sheet of writing
//                  { id, made, open: <sheet>, ref, seed, by }      a sheet opened later
// The seeds of closed sheets are not here (store/seeds.js, private).
// One writer per person at a time; ink is appended before anything points at
// it, and a closed sheet's seed is written before its record.

const bookDir = (id) => path.join(userDir(id), 'book');
export const skeletonFile = (id) => path.join(bookDir(id), 'skeleton.json');
export const chainFile = (id) => path.join(bookDir(id), 'ink.chain');
const lock = (id) => `book:${id}`;

export const blankSkeleton = (paperFamily) => ({
  version: 0,
  signature: null,
  paperFamily,
  home: 'home',
  nextItem: 1,
  pages: { home: { background: config.book.defaultBackground, items: [] } },
  surfaces: blankSurfaces(),
});

const skeletons = new Map(); // userId → skeleton
const chains = new Map(); // userId → { list, byId, bySheet: Map(sheet → line), opens: Map(sheet → seed), bytes }

export async function getSkeleton(userId) {
  let s = skeletons.get(userId);
  if (!s) {
    s = await readJson(skeletonFile(userId), null);
    if (s) skeletons.set(userId, s);
  }
  return s;
}

async function getChain(userId) {
  let c = chains.get(userId);
  if (!c) {
    c = { list: [], byId: new Map(), bySheet: new Map(), opens: new Map(), digests: new Map(), bytes: 0 };
    for (const line of await readLines(chainFile(userId))) {
      c.bytes += Buffer.byteLength(line) + 1;
      try {
        index(c, JSON.parse(line));
      } catch {
        /* a damaged line: skipped, the rest stands */
      }
    }
    chains.set(userId, c);
  }
  return c;
}

function index(c, line) {
  c.list.push(line);
  c.byId.set(line.id, line);
  if (line.ink) {
    c.bySheet.set(line.ink.sheet, line);
    if (line.open) c.opens.set(line.ink.sheet, line.open.seed);
  } else if (typeof line.open === 'string') c.opens.set(line.open, line.seed);
}

export const inkLine = async (userId, id) => {
  const line = (await getChain(userId)).byId.get(id);
  return line?.ink ? line : null;
};
export const sheetLine = async (userId, sheet) => (await getChain(userId)).bySheet.get(sheet) ?? null;
export const openSeed = async (userId, sheet) => (await getChain(userId)).opens.get(sheet) ?? null;
export const chainLines = async (userId) => (await getChain(userId)).list;

export async function digestOf(userId, line) {
  const c = await getChain(userId);
  let D = c.digests.get(line.id);
  if (!D) {
    D = K.recordDigest(line.ink);
    c.digests.set(line.id, D);
  }
  return D;
}

// The next id is the id on the last complete line + 1 (never a line count).
const nextInkId = (c) => {
  const last = c.list[c.list.length - 1];
  const n = last ? Number(String(last.id).slice(2)) + 1 : 1;
  return `k_${String(n).padStart(6, '0')}`;
};

async function appendChain(userId, c, fields) {
  const line = { id: nextInkId(c), made: new Date().toISOString(), ...fields };
  const text = JSON.stringify(line);
  const size = Buffer.byteLength(text) + 1;
  if (c.bytes + size > config.book.maxChainBytes) throw httpError(413, 'book_full', 'This book is full.');
  await appendLine(chainFile(userId), text);
  c.bytes += size;
  index(c, line);
  return line;
}

const stale = (version) => Object.assign(httpError(409, 'stale', 'Someone changed this book first; reload it.'), { stale: true, version });

// Context the edit ops need: is this ink placeable here, and how big is it.
const opContext = (userId) => ({
  inkBody: async (id) => (await inkLine(userId, id))?.ink ?? null,
  roomOf: async (name) => !!findByName(name), // a door into someone's room: someone there
});

// Apply one edit (books.md A5): check the version the client had, apply the op
// to a copy, bump the version, write the skeleton atomically.
async function landEdit(userId, op, base) {
  const current = await getSkeleton(userId);
  if (!current) throw httpError(404, 'no_book', 'No such book.');
  if (base != null && base !== current.version) throw stale(current.version);
  const next = structuredClone(current);
  const result = (await applyOp(next, op, opContext(userId))) ?? {};
  next.version = current.version + 1;
  await writeJson(skeletonFile(userId), next);
  skeletons.set(userId, next);
  return { version: next.version, ...result };
}

export const edit = (userId, op, base) => serial(lock(userId), () => landEdit(userId, op, base));

// Would this edit land? (run before the expensive render, without writing).
// `pending` is the body of ink not in the chain yet, referred to as NEW_INK.
export const NEW_INK = 'k_new';
export async function dryRunEdit(userId, op, pending = null) {
  const copy = structuredClone(await getSkeleton(userId));
  await applyOp(copy, op, { inkBody: async (id) => (id === NEW_INK ? pending : ((await inkLine(userId, id))?.ink ?? null)) });
}

// A verified sheet of writing lands: seed (closed sheets) → line → layout.
// Called after every check and the render have passed. Under the book lock it
// re-checks what may have changed meanwhile. If the same sheet is already here
// with the same digest, this is a retry: the existing line is returned (and
// placed if it isn't on a page yet). The same sheet with other writing: 409.
//   line: { ink, seal, open? }   seed: b64url of a closed sheet's seed (or null when open)
//   then: { op } edit to land after it (add / signature), or null
export function landInk(userId, { line, D, seed, then, base }) {
  return serial(lock(userId), async () => {
    const c = await getChain(userId);
    const skeleton = await getSkeleton(userId);
    const existing = c.bySheet.get(line.ink.sheet);
    if (existing) {
      const same = Buffer.from(await digestOf(userId, existing)).equals(Buffer.from(D));
      if (!same) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
      const placed = then?.op === 'add' && [...allItems(skeleton)].some((it) => it.ink === existing.id);
      if (!then || placed || then.op !== 'add') return { ink: existing.id, version: skeleton.version, replay: true };
      const out = await landEdit(userId, { ...then, ink: existing.id }, null);
      return { ink: existing.id, ...out, replay: true };
    }
    if (base != null && base !== skeleton.version) throw stale(skeleton.version);
    if (seed && !line.open) {
      await addSeed(userId, line.ink.sheet, seed);
      crashpoint('ink:after-seed');
    }
    const record = await appendChain(userId, c, { ink: line.ink, seal: line.seal, ...(line.open ? { open: line.open } : {}) });
    c.digests.set(record.id, D);
    crashpoint('ink:after-line');
    if (!then) return { ink: record.id, version: skeleton.version };
    const out = await landEdit(userId, { ...then, ink: record.id }, null);
    return { ink: record.id, ...out };
  });
}

// Lines of other kinds (a shared sheet's birth and its stamped acts, store/shared.js),
// appended under the book's lock. → the lines as written (with their ids).
export function appendLines(userId, list) {
  return serial(lock(userId), async () => {
    const c = await getChain(userId);
    const out = [];
    for (const fields of list) out.push(await appendChain(userId, c, fields));
    return out;
  });
}

// Publishing a sheet's seed later: an open line, signed open by the key.
export function landOpen(userId, { sheet, seed, by }) {
  return serial(lock(userId), async () => {
    const c = await getChain(userId);
    const target = c.bySheet.get(sheet);
    if (!target) throw httpError(404, 'no_sheet', 'That sheet is not in this book.');
    if (c.opens.has(sheet)) return { id: null, already: true };
    const line = await appendChain(userId, c, { open: sheet, ref: target.id, seed, by });
    return { id: line.id };
  });
}

// A new book at registration: the signature on sheet 0 (open), then the skeleton.
export async function createBook(userId, { line, paperFamily }) {
  await fs.mkdir(bookDir(userId), { recursive: true });
  const c = { list: [], byId: new Map(), bySheet: new Map(), opens: new Map(), digests: new Map(), bytes: 0 };
  const record = await appendChain(userId, c, { ink: line.ink, seal: line.seal, open: line.open });
  crashpoint('register:after-chain');
  const skeleton = { ...blankSkeleton(paperFamily), signature: record.id };
  await writeJson(skeletonFile(userId), skeleton);
  chains.set(userId, c);
  skeletons.set(userId, skeleton);
  return record;
}

// The whole .book: line 1 is the skeleton with what a verifier needs added (the
// key it checks every seal against), then the chain as-is (complete lines only).
export async function bookBytes(userId, account) {
  const skeleton = await getSkeleton(userId);
  const head = { book: 2, name: account.username, key: account.publicKey, fingerprint: K.fingerprint(fromB64url(account.publicKey, 32)), law: config.law.current, ...skeleton };
  return Buffer.concat([Buffer.from(`${JSON.stringify(head)}\n`), await completeBytes(chainFile(userId))]);
}

export const chainBytes = (userId) => completeBytes(chainFile(userId));

export const sheetUsedInBook = async (userId, sheet) => (await getChain(userId)).bySheet.has(sheet);

// For tests and recovery: drop the in-memory copy so the files are read again.
export function forgetBook(userId) {
  skeletons.delete(userId);
  chains.delete(userId);
}
