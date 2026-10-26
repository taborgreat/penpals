#!/usr/bin/env node
// Check the data directory without changing it (books.md, keys.md):
//   node backend/scripts/fsck.js [--json] [--regrow]
// Every book (its chain: Tabor, 2026-10-25) is checked the way any reader checks a .book (law/verify.js:
// seals, ids, one record per sheet, every paper replayed). Then what only the server holds: unlock.json is
// well formed; no chain has a torn tail. --regrow also grows every signature and paper again. Exit 0 when
// nothing is wrong. Notes are things recovery will tidy at the next start.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { verify as V, keys as K, unlock as U, fromB64url } from 'penpals-law';

const args = process.argv.slice(2);
const deep = args.includes('--regrow');
const root = config.dataDir;
const problems = [];
const notes = [];
const counts = { accounts: 0, lines: 0 };

const readText = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null);
const readJson = (f) => {
  const t = readText(f);
  if (t === null) return null;
  try {
    return JSON.parse(t);
  } catch {
    problems.push(`${rel(f)} is not valid JSON`);
    return null;
  }
};
const rel = (f) => path.relative(root, f).replaceAll('\\', '/');
const dirs = (d) =>
  fs.existsSync(d)
    ? fs
        .readdirSync(d, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
    : [];

// Lines of an append-only file; a torn tail is a problem until recovery cuts it.
function chainLines(f) {
  const t = readText(f);
  if (t === null || t === '') return [];
  if (!t.endsWith('\n')) notes.push(`${rel(f)} has a torn last line (cut at the next start)`);
  const end = t.lastIndexOf('\n');
  const out = [];
  if (end < 0) return out;
  t.slice(0, end)
    .split('\n')
    .forEach((l, i) => {
      try {
        out.push(JSON.parse(l));
      } catch {
        problems.push(`${rel(f)} line ${i + 1} is damaged`);
      }
    });
  return out;
}

const format = readJson(path.join(root, 'FORMAT'));
if (!format) problems.push('no FORMAT file: this is not a Living Ink data directory');
else if (format.penpals !== config.format) problems.push(`FORMAT says ${format.penpals}; this server reads ${config.format}`);

const accounts = new Map(); // id → account
const names = new Map();
const keysSeen = new Map();

for (const id of dirs(path.join(root, 'users'))) {
  const dir = path.join(root, 'users', id);
  const a = readJson(path.join(dir, 'account.json'));
  if (!a) {
    notes.push(`users/${id} has no account.json: an unfinished registration (removed at the next start)`);
    continue;
  }
  counts.accounts++;
  if (a.id !== id) problems.push(`users/${id}/account.json names id ${a.id}`);
  const lower = String(a.username).toLowerCase();
  if (names.has(lower)) problems.push(`the name ${a.username} belongs to two accounts`);
  names.set(lower, id);
  if (keysSeen.has(a.publicKey)) problems.push(`the key of ${a.username} belongs to two accounts`);
  keysSeen.set(a.publicKey, id);
  accounts.set(id, a);
  let pk = null;
  try {
    pk = fromB64url(a.publicKey, 32);
    if (!K.isGoodPublicKey(pk)) throw new Error();
  } catch {
    problems.push(`${a.username}: the account key is not a usable public key`);
  }

  // The book, checked as any reader would check the downloaded .book.
  const chain = chainLines(path.join(dir, 'book', 'ink.chain'));
  counts.lines += chain.length;
  const head = { book: 3, name: a.username, key: a.publicKey, law: config.law.current };
  const text = `${JSON.stringify(head)}\n${chain.map((l) => JSON.stringify(l)).join('\n')}${chain.length ? '\n' : ''}`;
  const report = V.verifyBook(text, { regrowOpen: deep });
  for (const p of report.problems) problems.push(`${a.username}: ${p}`);
  for (const r of report.results) {
    if (r.error) problems.push(`${a.username} ${r.id}: ${r.error}`);
    if (r.regrown === false) problems.push(`${a.username} ${r.id}: it does not regrow to its record`);
  }
  if (!chain.some((l) => l.ink?.use === 'signature')) problems.push(`${a.username}: no signature in the book`);

  // The password backup, if there is one: an OPRF key, and a keyring or null (turned off).
  const u = readJson(path.join(dir, 'unlock.json'));
  if (u) {
    try {
      if (fromB64url(u.oprfKey).length !== 32) throw new Error('bad OPRF key');
      if (u.keyring !== null) U.checkKeyring(u.keyring);
      if (Object.keys(u).some((k) => k !== 'oprfKey' && k !== 'keyring')) throw new Error('unexpected fields');
    } catch (err) {
      problems.push(`${a.username}: unlock.json: ${err.message}`);
    }
  }

  // Exposure (law 2 fading): view counts of ink in this book, nothing else.
  if (fs.existsSync(path.join(dir, 'exposure.json'))) {
    const ex = readJson(path.join(dir, 'exposure.json'));
    const bad =
      !ex || typeof ex !== 'object' || Array.isArray(ex) || Object.entries(ex).some(([k, v]) => !/^k_\d{6}$/.test(k) || !Number.isSafeInteger(v) || v < 0 || !chain.some((l) => l.id === k && l.ink));
    if (bad) problems.push(`${a.username}: exposure.json holds something other than view counts of this book's ink`);
  }
}

const ok = problems.length === 0;
if (args.includes('--json')) console.log(JSON.stringify({ ok, counts, problems, notes }, null, 1));
else {
  console.log(`${root}: ${counts.accounts} accounts, ${counts.lines} chain lines`);
  for (const n of notes) console.log(`  note: ${n}`);
  for (const p of problems) console.log(`  PROBLEM: ${p}`);
  console.log(ok ? 'the data checks' : 'THE DATA DOES NOT CHECK');
}
process.exit(ok ? 0 : 1);
