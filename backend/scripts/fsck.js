#!/usr/bin/env node
// Check the data directory without changing it (books.md, keys.md):
//   node backend/scripts/fsck.js [--json] [--regrow]
// The public part of every book is checked the way any reader checks a .book
// (law/verify.js: seals, ids, one record per sheet, opens, layout). Then what
// only the server holds: every closed sheet has its seed and the seed is the
// one its record committed to; unlock.json is well formed; letters are sealed
// by their sender and name their files; no chain has a torn tail. --regrow also
// grows every sheet again (closed ones from their private seeds) and compares
// the facts. Exit 0 when nothing is wrong. Notes are things recovery will tidy
// at the next start, or harmless leftovers of a crash (a seed whose record
// never landed).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../src/config.js';
import { verify as V, record as R, keys as K, unlock as U, fromB64url, b64url } from 'penpals-law';

const args = process.argv.slice(2);
const deep = args.includes('--regrow');
const root = config.dataDir;
const problems = [];
const notes = [];
const counts = { accounts: 0, lines: 0, seeds: 0, letters: 0 };

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
const sheetsOf = new Map(); // userId → Set(sheet) used in the book

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

  // The public book, checked as any reader would check the downloaded .book.
  const skeleton = readJson(path.join(dir, 'book', 'skeleton.json'));
  const chain = chainLines(path.join(dir, 'book', 'ink.chain'));
  counts.lines += chain.length;
  if (!skeleton) problems.push(`${a.username}: no book skeleton`);
  else {
    const head = { book: 2, name: a.username, key: a.publicKey, law: config.law.current, ...skeleton };
    const text = `${JSON.stringify(head)}\n${chain.map((l) => JSON.stringify(l)).join('\n')}${chain.length ? '\n' : ''}`;
    const report = V.verifyBook(text, { regrowOpen: deep });
    for (const p of report.problems) problems.push(`${a.username}: ${p}`);
    for (const r of report.results) {
      if (r.error) problems.push(`${a.username} ${r.id}: ${r.error}`);
      if (r.regrown === false) problems.push(`${a.username} ${r.id}: the open sheet does not regrow to its record`);
    }
  }

  // Closed sheets: the private seed is there and is the committed one.
  const seeds = new Map();
  for (const s of chainLines(path.join(dir, 'seeds.chain'))) {
    counts.seeds++;
    if (!seeds.has(s.sheet)) seeds.set(s.sheet, s.seed);
  }
  const opened = new Set(chain.filter((l) => typeof l.open === 'string').map((l) => l.open));
  const used = new Set();
  for (const line of chain) {
    if (!line.ink) continue;
    used.add(line.ink.sheet);
    if (line.ink.kind !== 'ink' || line.open || opened.has(line.ink.sheet)) continue;
    const seedText = seeds.get(line.ink.sheet);
    if (!seedText) {
      problems.push(`${a.username} ${line.id}: closed sheet ${line.ink.sheet} has no seed on the server`);
      continue;
    }
    try {
      const seed = fromB64url(seedText, 64);
      if (pk && !K.verifySeed(pk, line.ink.sheet, seed)) throw new Error("the seed is not this key's for this sheet");
      if (b64url(K.commitOf(seed)) !== line.ink.commit) throw new Error('the seed is not the one the record committed to');
      if (deep && !R.regrow(line.ink, seed).ok) throw new Error('does not regrow to its record');
    } catch (err) {
      problems.push(`${a.username} ${line.id}: ${err.message}`);
    }
  }
  for (const sheet of seeds.keys()) if (!used.has(sheet)) notes.push(`${a.username}: a seed for ${sheet} whose record never landed (harmless)`);
  sheetsOf.set(id, used);

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

// Letters: sealed by the sender, naming exactly their files; one use per sheet.
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const letterSheets = new Map();
for (const id of dirs(path.join(root, 'letters'))) {
  const dir = path.join(root, 'letters', id);
  const meta = readJson(path.join(dir, 'letter.json'));
  if (!meta) {
    notes.push(`letters/${id} has no letter.json: unfinished (swept at the next start)`);
    continue;
  }
  counts.letters++;
  const sender = accounts.get(meta.senderId);
  if (!sender) {
    problems.push(`letters/${id}: its sender is not an account`);
    continue;
  }
  const line = readJson(path.join(dir, 'ink.line.json'));
  try {
    if (!line) throw new Error('no sealed line');
    const pk = fromB64url(sender.publicKey, 32);
    if (line.ink.key !== sender.publicKey) throw new Error('sealed by another key');
    if (line.ink.kind === 'ink') R.checkInkBody(line.ink, { maxActsBytes: config.book.maxLetterActsBytes });
    else R.checkPhotoBody(line.ink);
    R.verifySealed(line, pk);
    if (line.ink.sheet !== meta.sheet) throw new Error('letter.json names another sheet');
    if (line.ink.kind === 'ink') {
      const seed = fromB64url(readText(path.join(dir, 'sheet.seed')) ?? '', 64);
      if (b64url(K.commitOf(seed)) !== line.ink.commit) throw new Error('its seed is not the committed one');
      if (deep && !R.regrow(line.ink, seed).ok) throw new Error('does not regrow to its record');
    } else {
      const png = path.join(dir, 'ink.png');
      if (!fs.existsSync(png) || sha(fs.readFileSync(png)) !== line.ink.png) throw new Error('the scan is not the sealed one');
      const strokes = path.join(dir, 'ink.strokes');
      const have = fs.existsSync(strokes) ? sha(fs.readFileSync(strokes)) : null;
      if (have !== line.ink.strokes) throw new Error('the strokes are not the sealed ones');
    }
    const key = `${meta.senderId}|${meta.sheet}`;
    if (letterSheets.has(key) || sheetsOf.get(meta.senderId)?.has(meta.sheet)) throw new Error(`sheet ${meta.sheet} is used twice`);
    letterSheets.set(key, id);
  } catch (err) {
    problems.push(`letters/${id}: ${err.message}`);
  }
}

const ok = problems.length === 0;
if (args.includes('--json')) console.log(JSON.stringify({ ok, counts, problems, notes }, null, 1));
else {
  console.log(`${root}: ${counts.accounts} accounts, ${counts.lines} chain lines, ${counts.seeds} seeds, ${counts.letters} letters`);
  for (const n of notes) console.log(`  note: ${n}`);
  for (const p of problems) console.log(`  PROBLEM: ${p}`);
  console.log(ok ? 'the data checks' : 'THE DATA DOES NOT CHECK');
}
process.exit(ok ? 0 : 1);
