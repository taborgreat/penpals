// Joined rooms (rooms.md §7; law/join.js). Each pair of owners who have joined
// (or asked to) has one chain of join acts, each sealed by its owner, given its
// place here (data/joins/<a>.<b>.chain). A room is joined with one other room at
// a time. Every act is told to both rooms' streams as the pair's view.

import path from 'node:path';
import fs from 'node:fs/promises';
import { appendLine, readLines, serial, httpError } from '../files.js';
import { config } from '../config.js';
import { getAccount, findByKey } from './accounts.js';
import { join as J } from 'penpals-law';
import { tellRoom } from './rooms.js';

const dir = () => path.join(config.dataDir, 'joins');
const fileOf = (pair) => path.join(dir(), `${pair}.chain`);
const pairs = new Map(); // pair → { a, b, lines, state }

export async function loadJoins() {
  pairs.clear();
  let names = [];
  try {
    names = (await fs.readdir(dir())).filter((f) => f.endsWith('.chain'));
  } catch {
    return 0; // none yet
  }
  for (const f of names) {
    const [a, b] = f.slice(0, -'.chain'.length).split('.');
    const lines = (await readLines(fileOf(`${a}.${b}`))).map((l) => JSON.parse(l));
    const { state } = J.replayJoin(a, b, lines);
    pairs.set(J.pairOf(a, b), { a, b, lines, state });
  }
  return pairs.size;
}

const pairsWith = (key) => [...pairs.values()].filter((p) => p.a === key || p.b === key);
// The room this one is joined with now, if any.
const joinedOf = (key) => pairsWith(key).find((p) => p.state.joined) ?? null;

// A room's join, as its owner (key) and its visitors see it: who it is joined with
// (or who asks), on which side of this room, through what; and where tables stand.
export function joinViewOf(key) {
  const p = joinedOf(key) ?? pairsWith(key).find((x) => x.state.sides[x.a === key ? x.b : x.a] && !x.state.sides[key]) ?? null;
  if (!p) return { joined: false };
  const other = p.a === key ? p.b : p.a;
  const s = p.state;
  return {
    joined: s.joined,
    with: findByKey(other)?.username ?? null,
    withKey: other,
    side: s.sides[key], // which wall of this room
    asks: !s.joined && !!s.sides[other] && !s.sides[key] ? s.sides[other] : null, // the other asks to join along their wall
    opening: J.openingOf(s),
    openings: { mine: s.openings[key], theirs: s.openings[other] },
    tables: { mine: s.tables[key], theirs: s.tables[other] },
    n: p.lines.length,
  };
}

// An act from one of the owners (the user): checked, placed, kept, told. → the stamped line.
export async function stampJoin(userId, { act, seal }) {
  const account = getAccount(userId);
  try {
    J.checkJoinAct(act);
  } catch (err) {
    throw httpError(400, 'bad_join', err.message);
  }
  if (act.by !== account.publicKey) throw httpError(400, 'key_mismatch', 'A join act is sealed by its owner.');
  if (!J.verifyJoinSeal(act, seal)) throw httpError(401, 'bad_seal', 'That act is not sealed by your key.');
  if (!findByKey(act.with)) throw httpError(404, 'no_room', 'No such room.');
  const key = J.pairOf(act.by, act.with);
  return serial(`join:${key}`, async () => {
    let p = pairs.get(key);
    if (!p) {
      const [a, b] = key.split('.');
      p = { a, b, lines: [], state: J.startJoin(a, b) };
    }
    // one join at a time for a room
    if (act.act === 'join') {
      for (const k of [act.by, act.with]) {
        const j = joinedOf(k);
        if (j && j !== p) throw httpError(409, 'joined_elsewhere', 'That room is already joined with another.');
      }
    }
    const why = J.joinRefusal(p.state, act);
    if (why) throw httpError(403, 'not_yours', why);
    const line = { n: p.lines.length + 1, at: new Date().toISOString(), act, seal };
    await fs.mkdir(dir(), { recursive: true });
    await appendLine(fileOf(key), JSON.stringify(line));
    p.lines.push(line);
    p.state = J.applyJoin(p.state, line);
    pairs.set(key, p);
    for (const k of [p.a, p.b]) {
      const owner = findByKey(k);
      if (owner) tellRoom(owner.id, 'join', joinViewOf(k));
    }
    return line;
  });
}

// The pair's chain (anyone may check it: every seal, every place).
export const joinLines = (a, b) => pairs.get(J.pairOf(a, b))?.lines ?? [];
