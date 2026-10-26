import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { appendLine, completeBytes, readLines, serial, crashpoint, httpError } from '../files.js';
import { userDir } from './accounts.js';
import { keys as K, record as R, fromB64url } from 'penpals-law';

// A person's book (books.md Part A, keys.md; Tabor, 2026-10-25) is its chain: data/users/<id>/book/ink.chain,
// append-only lines, public:
//   { id, made, ink: <sealed body, use 'signature'>, seal, open }   their name signed (open from birth: anyone
//                                                                  checks it offline); the latest is theirs
//   { id, made, paper: { birth, seal, open } }                      a paper or a surface they made (store/papers.js)
//   { id, made, on: <paper>, n, at, act, seal }                     a stamped act on it
// There is no layout: a paper is matter, kept in a book at a path (its own chain says where it is), and ink on a
// house's walls is matter of the wall.

const bookDir = (id) => path.join(userDir(id), 'book');
export const chainFile = (id) => path.join(bookDir(id), 'ink.chain');
const lock = (id) => `book:${id}`;

const chains = new Map(); // userId → { list, byId, bySheet: Map(sheet → line), opens: Map(sheet → seed), digests, bytes, signature }

async function getChain(userId) {
  let c = chains.get(userId);
  if (!c) {
    c = { list: [], byId: new Map(), bySheet: new Map(), opens: new Map(), digests: new Map(), bytes: 0, signature: null };
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
    if (line.ink.use === 'signature') c.signature = line.id;
  }
}

export const inkLine = async (userId, id) => {
  const line = (await getChain(userId)).byId.get(id);
  return line?.ink ? line : null;
};
export const openSeed = async (userId, sheet) => (await getChain(userId)).opens.get(sheet) ?? null;
export const chainLines = async (userId) => (await getChain(userId)).list;
// Their signature: the latest they signed (its line), or null.
export async function signatureOf(userId) {
  const c = await getChain(userId);
  return c.signature ? c.byId.get(c.signature) : null;
}

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

// A signature lands (checked before: its record, its seal, its open seed). The same sheet with the same digest
// again is a retry: the existing line. The same sheet with other writing: 409.
//   line: { ink, seal, open }   → { ink: its id, replay? }
export function landSignature(userId, { line, D }) {
  return serial(lock(userId), async () => {
    const c = await getChain(userId);
    const existing = c.bySheet.get(line.ink.sheet);
    if (existing) {
      if (!Buffer.from(await digestOf(userId, existing)).equals(Buffer.from(D))) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
      return { ink: existing.id, replay: true };
    }
    const record = await appendChain(userId, c, { ink: line.ink, seal: line.seal, open: line.open });
    c.digests.set(record.id, D);
    crashpoint('ink:after-line');
    return { ink: record.id };
  });
}

// Lines of other kinds (a paper's birth and its stamped acts: store/papers.js), appended under the book's
// lock. → the lines as written (with their ids).
export function appendLines(userId, list) {
  return serial(lock(userId), async () => {
    const c = await getChain(userId);
    const out = [];
    for (const fields of list) out.push(await appendChain(userId, c, fields));
    return out;
  });
}

// A new book at registration: the signature on sheet 0 (open).
export async function createBook(userId, { line }) {
  await fs.mkdir(bookDir(userId), { recursive: true });
  const c = { list: [], byId: new Map(), bySheet: new Map(), opens: new Map(), digests: new Map(), bytes: 0, signature: null };
  const record = await appendChain(userId, c, { ink: line.ink, seal: line.seal, open: line.open });
  crashpoint('register:after-chain');
  chains.set(userId, c);
  return record;
}

// The paper new papers are grown on, unless chosen: the one their name was signed on.
export const familyOf = async (userId) => {
  const sig = await signatureOf(userId);
  return sig ? R.familyOf(sig.ink) : null;
};

// The whole .book: line 1 is what a verifier needs (the key it checks every seal against), then the chain as-is
// (complete lines only).
export async function bookBytes(userId, account) {
  const head = { book: 3, name: account.username, key: account.publicKey, fingerprint: K.fingerprint(fromB64url(account.publicKey, 32)), law: config.law.current };
  return Buffer.concat([Buffer.from(`${JSON.stringify(head)}\n`), await completeBytes(chainFile(userId))]);
}

export const chainBytes = (userId) => completeBytes(chainFile(userId));

// For tests and recovery: drop the in-memory copy so the file is read again.
export function forgetBook(userId) {
  chains.delete(userId);
}
