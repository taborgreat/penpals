// Joining spaces (rooms.md §7): two rooms pushed together like toy cube rooms.
// A join is a chain of acts between two owners, each sealed by the owner who
// makes it, given its place by the stamper (as a shared sheet's acts are):
//
//   act  { v: 2, kind: 'join', by, with, k, act, ... }   sealed by `by`; `with` the other owner
//          act 'join'     side: 'right' | 'left'   by's room joins with's along by's wall on that side
//          act 'opening'  opening: 'wall' | 'door' by's choice for their side (a door keeps the wall)
//          act 'table'    at: [x, y] | null        by moves their table into the joined space (mm, the
//                                                  joined room's frame), or home
//          act 'unjoin'                            either owner separates the rooms
//   stamped line  { n, at, act, seal }
//
// Joined: each owner has signed a join naming the other, on facing sides (one's
// right to the other's left), since the last unjoin. The opening is the wall down
// only if both chose it; otherwise a door (it protects decorated walls). Each owner
// chooses their side and can change it. Furniture moves only while joined. The
// unjoin act itself places every piece of matter back in its owner's space: no
// separate move, no one else's signature. After it, every table is home (and the
// sheets on them with them).

import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { T, jcs, b64url, fromB64url, utf8, concat } from './tags.js';
import { verify } from './keys.js';

export const ACTS = ['join', 'opening', 'table', 'unjoin'];
export const SIDES = ['right', 'left'];
export const OPENINGS = ['wall', 'door'];
const OPPOSITE = { right: 'left', left: 'right' };

const bad = (msg) => Object.assign(new Error(msg), { code: 'bad_join', status: 400 });
export const joinDigest = (body) => sha256(concat(T('join'), utf8(jcs(body))));
const sealMsg = (D) => concat(T('seal'), D);
const isKey = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
// The pair's id: its two keys in order (either owner names the same pair).
export const pairOf = (a, b) => (a < b ? `${a}.${b}` : `${b}.${a}`);

export function makeJoinAct({ sk, pk, with: other, k, act, side = null, opening = null, at = undefined }) {
  const body = { v: 2, kind: 'join', by: b64url(pk), with: other, k, act };
  if (act === 'join') body.side = side;
  if (act === 'opening') body.opening = opening;
  if (act === 'table') body.at = at ?? null;
  checkJoinAct(body);
  return { act: body, seal: b64url(ed25519.sign(sealMsg(joinDigest(body)), sk)) };
}

export function checkJoinAct(body) {
  if (!body || typeof body !== 'object') throw bad('no act');
  const want = { join: 'act,by,k,kind,side,v,with', opening: 'act,by,k,kind,opening,v,with', table: 'act,at,by,k,kind,v,with', unjoin: 'act,by,k,kind,v,with' }[body.act];
  if (!want || Object.keys(body).sort().join() !== want) throw bad('not a join act');
  if (body.v !== 2 || body.kind !== 'join' || !isKey(body.by) || !isKey(body.with) || body.by === body.with || !Number.isInteger(body.k) || body.k < 1) throw bad('a malformed join act');
  if (body.act === 'join' && !SIDES.includes(body.side)) throw bad('a join is along a side wall');
  if (body.act === 'opening' && !OPENINGS.includes(body.opening)) throw bad('the opening is the wall down or a door');
  if (body.act === 'table' && body.at !== null && !(Array.isArray(body.at) && body.at.length === 2 && body.at.every((v) => Number.isInteger(v) && v >= 0 && v <= 20000))) throw bad('a table stands somewhere in the room (mm)');
  return body;
}
export const verifyJoinSeal = (act, seal) => verify(fromB64url(seal, 64), sealMsg(joinDigest(act)), fromB64url(act.by, 32));

// The pair's state, read from its chain:
// { a, b, k: { [key]: last k }, sides: { [key]: side | null }, openings: { [key]: 'wall' | 'door' },
//   joined, tables: { [key]: [x, y] | null } }. Not joined: every table at home (null).
export const startJoin = (a, b) => ({ a, b, k: {}, sides: { [a]: null, [b]: null }, openings: { [a]: 'door', [b]: 'door' }, joined: false, tables: { [a]: null, [b]: null } });
const facing = (s) => !!s.sides[s.a] && s.sides[s.b] === OPPOSITE[s.sides[s.a]];
// The opening the pair has: the wall down only when both chose it.
export const openingOf = (s) => (s.openings[s.a] === 'wall' && s.openings[s.b] === 'wall' ? 'wall' : 'door');
// Which side of `me`'s room the other room is on (while joined).
export const sideOf = (s, me) => (s.joined ? s.sides[me] : null);

export function joinRefusal(s, act) {
  if (act.by !== s.a && act.by !== s.b) return 'not one of this pair';
  if (act.with !== (act.by === s.a ? s.b : s.a)) return 'not one of this pair';
  if ((s.k[act.by] ?? 0) >= act.k) return 'that act was stamped already';
  if (act.act === 'table' && !s.joined) return 'tables move across only while the rooms are joined';
  if (act.act === 'unjoin' && !s.joined && !s.sides[act.by]) return 'there is nothing to separate';
  if (act.act === 'join' && s.joined) return 'joined already';
  return null;
}

export function applyJoin(s, { act }) {
  const next = { ...s, k: { ...s.k, [act.by]: act.k }, sides: { ...s.sides }, openings: { ...s.openings }, tables: { ...s.tables } };
  if (act.act === 'join') next.sides[act.by] = act.side;
  if (act.act === 'opening') next.openings[act.by] = act.opening;
  if (act.act === 'table') next.tables[act.by] = act.at;
  if (act.act === 'unjoin') {
    // apart: both sides withdrawn, and every table home by this act alone
    next.sides = { [s.a]: null, [s.b]: null };
    next.tables = { [s.a]: null, [s.b]: null };
  }
  next.joined = facing(next);
  if (!next.joined) next.tables = { [s.a]: null, [s.b]: null };
  return next;
}

// Replay a pair's chain: every place in order, every seal its owner's, every act allowed.
export function replayJoin(a, b, lines, { seals = true } = {}) {
  let s = startJoin(...[a, b].sort());
  const problems = [];
  lines.forEach((line, i) => {
    try {
      if (line.n !== i + 1) throw bad(`place ${line.n} where ${i + 1} belongs`);
      checkJoinAct(line.act);
      if (seals && !verifyJoinSeal(line.act, line.seal)) throw bad("the seal is not its owner's");
      const why = joinRefusal(s, line.act);
      if (why) throw bad(why);
      s = applyJoin(s, line);
    } catch (err) {
      problems.push(`act ${line.n}: ${err.message}`);
    }
  });
  return { state: s, problems };
}
