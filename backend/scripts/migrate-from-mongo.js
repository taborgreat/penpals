// One-time move from the old MongoDB storage to files (books.md).
//
//   node scripts/migrate-from-mongo.js            (MONGODB_URI, default mongodb://127.0.0.1:27017/penpals)
//
// Reads users, friendships, sessions and letters from Mongo and writes:
//   data/users/<id>/account.json         login, friends, requests, blocks, letters sent
//   data/users/<id>/book/                a book holding the old signature as ink
//   data/sessions/<hash>.json            so people stay logged in
//   data/letters/<id>/                   letter.json + ink.png + ink.strokes
// The old flat ink files (data/letters/<id>.png, .strokes) are moved into their
// letter's folder. Mongo itself is only read, never changed. Refuses to run if
// data/users already exists, so it can't run twice over live data.

import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import { config } from '../src/config.js';
import { writeJson } from '../src/files.js';
import { blankSkeleton, writeBook } from '../src/store/books.js';
import { loadAccounts, usersDir } from '../src/store/accounts.js';
import { tokenHash } from '../src/store/sessions.js';

const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/penpals';
const lettersDir = path.join(config.dataDir, 'letters');
const iso = (d) => (d ? new Date(d).toISOString() : null);
const str = (id) => (id == null ? null : String(id));

if (fss.existsSync(usersDir)) {
  console.error(`${usersDir} already exists: this data has been migrated. Nothing done.`);
  process.exit(1);
}

const { MongoClient } = await import('mongodb');
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });
await client.connect();
const db = client.db();
const [users, friendships, sessions, letters] = await Promise.all(
  ['users', 'friendships', 'sessions', 'letters'].map((c) => db.collection(c).find().toArray()),
);
console.log(`read ${users.length} users, ${friendships.length} friendships, ${sessions.length} sessions, ${letters.length} letters`);

// An old signature (the label format: per stroke, deltas in half px / ms / tenth px)
// as a stroke collection for the ink chain.
function signatureInk(sig, made) {
  const strokes = sig.s.map(([angle, ...n]) => {
    const pts = [];
    let x = 0;
    let y = 0;
    let t = 0;
    let w = 0;
    for (let i = 0; i + 3 < n.length; i += 4) {
      x += n[i];
      y += n[i + 1];
      t += n[i + 2];
      w += n[i + 3];
      pts.push([x / 2, y / 2, w / 10, t]);
    }
    return angle == null ? { pts } : { pts, a: angle };
  });
  return { id: 'k_000001', made: iso(made) ?? new Date().toISOString(), strokes, bounds: [sig.w, sig.h] };
}

const sentBy = new Map();
for (const l of letters) if (l.sentAt) sentBy.set(str(l.senderId), (sentBy.get(str(l.senderId)) ?? 0) + 1);

for (const u of users) {
  const id = str(u._id);
  const mine = friendships.filter((f) => f.users.some((x) => str(x) === id));
  const otherOf = (f) => str(f.users.find((x) => str(x) !== id));
  await writeJson(path.join(usersDir, id, 'account.json'), {
    id,
    username: u.username,
    usernameLower: u.usernameLower ?? u.username.toLowerCase(),
    passwordHash: u.passwordHash,
    createdAt: iso(u.createdAt) ?? new Date().toISOString(),
    private: !!u.private,
    friends: mine.filter((f) => f.status === 'accepted').map(otherOf),
    incoming: mine.filter((f) => f.status === 'pending' && str(f.requester) !== id).map(otherOf),
    outgoing: mine.filter((f) => f.status === 'pending' && str(f.requester) === id).map(otherOf),
    blocked: (u.blocked ?? []).map(str),
    lettersSent: sentBy.get(id) ?? 0,
    settings: {},
  });
  const skeleton = blankSkeleton();
  const records = [];
  if (u.signature?.s) {
    records.push(signatureInk(u.signature, u.signedAt));
    skeleton.signature = 'k_000001';
    if (config.signatureColors.includes(u.signature.color)) skeleton.signatureColor = u.signature.color;
    skeleton.version = 1;
  }
  await writeBook(id, skeleton, records);
  console.log(`  @${u.username}: account + book${records.length ? ' (with signature)' : ''}`);
}

for (const s of sessions) {
  if (Date.now() - new Date(s.createdAt).getTime() > config.sessionTtlMs) continue;
  await writeJson(path.join(config.dataDir, 'sessions', `${tokenHash(s._id)}.json`), { userId: str(s.userId), createdAt: iso(s.createdAt) });
}

let moved = 0;
for (const l of letters) {
  if (l.inkDeleted) continue;
  const id = str(l._id);
  const dir = path.join(lettersDir, id);
  await fs.mkdir(dir, { recursive: true });
  for (const [from, to] of [[`${id}.png`, 'ink.png'], [`${id}.strokes`, 'ink.strokes']]) {
    try {
      await fs.rename(path.join(lettersDir, from), path.join(dir, to));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
  await writeJson(path.join(dir, 'letter.json'), {
    id,
    senderId: str(l.senderId),
    from: l.from,
    width: l.width,
    height: l.height,
    bytes: l.bytes,
    hasStrokes: !!l.hasStrokes,
    strokeCount: l.strokeCount ?? 0,
    strokesBytes: l.strokesBytes ?? 0,
    display: l.display ?? 'mask',
    playable: l.playable ?? !!l.hasStrokes,
    inkColor: l.inkColor,
    paper: l.paper,
    source: l.source,
    createdAt: iso(l.createdAt),
    savedBy: (l.savedBy ?? []).map((s) => ({ userId: str(s.userId), at: iso(s.at) })),
    upvotes: (l.upvotes ?? []).map(str),
    openedAt: iso(l.openedAt),
    recipientId: str(l.recipientId),
    to: l.to ?? null,
    sentAt: iso(l.sentAt),
    expiresAt: iso(l.expiresAt),
  });
  moved++;
}

await client.close();
await loadAccounts(); // writes data/index/names.json
console.log(`done: ${users.length} accounts, ${moved} letters, into ${config.dataDir}`);
