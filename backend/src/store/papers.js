// Papers (law/paper.js; Tabor, 2026-10-25): thin rectangles of paper matter, each its owner's, its whole
// life on its own chain. One story, one stamper: an act arrives sealed by its being; the paper's chain says
// whether it may land (law/paper.js refusal), and what only the stamper can know across papers: which
// letter in a mailbox is the oldest. It is given the next place and its moment, appended to the chain of
// whoever made the paper, and told to everyone watching where it lies. A house's surfaces (its walls, floor,
// ceiling, table top) are matter the same way, once their owner writes on them: each its chain, where it is
// for good, told with the papers lying in that house.
//
// In its maker's chain (store/books.js):
//   { id, made, paper: { birth, seal, open } }         a paper born (on its owner's table)
//   { id, made, on: <paper>, n, at, act, seal }       a stamped act on it
// Where papers lie in a house is written on that house's room chain too, as they come to rest there and
// as they leave it ({ kind: 'lay', paper, rest: [x, y, z] mm | null }: store/rooms.js lay), so the wax law
// regrows what drips onto them from the room's chain alone (law/wax.js; store/wax.js).
// The index here (where each paper is: lying in a space, in a hand, in a mailbox in the order they came, in a
// book; every paper's lines and its replayed state) is rebuilt from the chains at start; nothing else is kept.

import { httpError, listDirs } from '../files.js';
import { getAccount, findByKey, usersDir } from './accounts.js';
import { chainLines, appendLines } from './books.js';
import { paper as P, fromB64url, keys as K } from 'penpals-law';
import { lawOf } from 'penpals-law/laws';
import { lay } from './rooms.js';

const papers = new Map(); // paper → { paper, makerId, birth, seal, open, born (ms), lines, state }
const lying = new Map(); // space (a house's key, or 'outside') → Set(paper)
const held = new Map(); // key → Set(paper)
const boxes = new Map(); // key → [paper]: the letters in that mailbox, in the order they came
const books = new Map(); // key → Set(paper): the papers in that being's book
const surfaces = new Map(); // `${house key}|${surface}` → paper: a house's walls, floor, ceiling, table top, once written on
const listeners = new Set(); // (event) => void: { kind: 'paper', paper, line, from, to } (from, to: the spaces it left, came to)

const add = (m, k, v) => (m.has(k) ? m : m.set(k, new Set())).get(k).add(v);
const drop = (m, k, v) => m.get(k)?.delete(v);
// keep the indexes as a paper moves from where it was to where it is
function index(p, was, now) {
  if (was) {
    if (was.space) drop(lying, was.space, p.paper);
    if (was.hand) drop(held, was.hand, p.paper);
    if (was.box)
      boxes.set(
        was.box,
        (boxes.get(was.box) ?? []).filter((x) => x !== p.paper),
      );
    if (was.book) drop(books, p.prevOwner ?? p.state.owner, p.paper);
  }
  if (now.space) add(lying, now.space, p.paper);
  if (now.hand) add(held, now.hand, p.paper);
  if (now.box) boxes.set(now.box, [...(boxes.get(now.box) ?? []), p.paper]);
  if (now.book) add(books, p.state.owner, p.paper);
}
const tell = (e) => {
  for (const fn of listeners) fn(e);
};
export const onPapers = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function bear(makerId, line) {
  const { birth, seal, open } = line.paper;
  const p = { paper: birth.paper, makerId, birth, seal, open, born: Date.parse(line.made), lines: [], state: P.startState(birth) };
  papers.set(p.paper, p);
  if (birth.kind === 'surface') surfaces.set(`${birth.key}|${birth.surface}`, p.paper);
  index(p, null, p.state.where);
  return p;
}
function step(p, stamped) {
  const was = p.state.where;
  p.prevOwner = p.state.owner;
  p.state = P.apply(p.state, stamped);
  p.lines.push(stamped);
  index(p, was, p.state.where);
  delete p.prevOwner;
  return was;
}

// Every paper in every chain (at start).
export async function loadPapers() {
  for (const m of [papers, lying, held, boxes, books, surfaces]) m.clear();
  const acts = [];
  for (const id of await listDirs(usersDir)) {
    if (!getAccount(id)) continue;
    for (const line of await chainLines(id)) {
      if (line.paper) bear(id, line);
      else if (typeof line.on === 'string') acts.push(line);
    }
  }
  for (const line of acts) {
    const p = papers.get(line.on);
    if (p) step(p, { n: line.n, at: line.at, act: line.act, seal: line.seal });
  }
  return papers.size;
}

export const paperOf = (paper) => papers.get(paper) ?? null;
const nameOf = (key) => findByKey(key)?.username ?? null;
// A paper as anyone who sees it sees it: whose it is, where it is, its chain.
export const viewOf = (p) => ({
  paper: p.paper,
  owner: nameOf(p.state.owner),
  ownerKey: p.state.owner,
  birth: p.birth,
  born: p.born, // (ms: its clock's zero, where the drips land on it: law/wax.js dripsOn)
  seal: p.seal,
  open: p.open,
  lines: p.lines,
  where: p.state.where,
  names: Object.fromEntries([...new Set([p.state.owner, p.birth.key, ...p.lines.flatMap((l) => [l.act.by, l.act.press?.for, l.act.to].filter(Boolean))])].map((k) => [k, nameOf(k)])),
});
export const lyingIn = (space) => [...(lying.get(space) ?? [])].map((x) => papers.get(x));
export const heldBy = (key) => [...(held.get(key) ?? [])].map((x) => papers.get(x));
export const mailboxOf = (key) => (boxes.get(key) ?? []).map((x) => papers.get(x));
export const bookOf = (key) => [...(books.get(key) ?? [])].map((x) => papers.get(x));
export const madeBy = (userId) => [...papers.values()].filter((p) => p.makerId === userId);

// A house's surface (its owner's), by name: its paper, if anything was ever written on it.
export const surfaceOf = (key, surface) => papers.get(surfaces.get(`${key}|${surface}`)) ?? null;
// A new paper, its owner's, on their own table, or one of their house's surfaces: { birth, seal, open }.
export async function bornPaper(userId, { birth, seal, open } = {}) {
  const account = getAccount(userId);
  if (!birth || birth.key !== account.publicKey) throw httpError(400, 'bad_paper', 'A paper is born its maker’s own.');
  try {
    P.checkBirth(birth, { seal, open });
  } catch (err) {
    throw httpError(err.status ?? 400, 'bad_paper', err.message);
  }
  if (papers.has(birth.paper)) throw httpError(409, 'paper_used', 'That paper already holds other writing.');
  if (birth.kind === 'surface' && surfaces.has(`${birth.key}|${birth.surface}`)) throw httpError(409, 'surface_born', 'That surface is already matter with writing of its own.');
  const [line] = await appendLines(userId, [{ paper: { birth, seal, open } }]);
  const p = bear(userId, line);
  if (p.state.where.at) await lay(userId, p.paper, p.state.where.at, birth.size); // (a surface is no paper lying: it is the house)
  tell({ kind: 'paper', paper: p.paper, line: null, from: null, to: account.publicKey });
  return viewOf(p);
}

// One act, from its being (the user): checked, stamped, appended, told. → the stamped line.
export async function stampPaper(userId, { act, seal } = {}) {
  const account = getAccount(userId);
  try {
    P.checkPaperAct(act);
  } catch (err) {
    throw httpError(400, 'bad_paper', err.message);
  }
  if (act.by !== account.publicKey) throw httpError(400, 'key_mismatch', 'An act is sealed by its being.');
  if (!P.verifyActSeal(act, seal)) throw httpError(401, 'bad_seal', 'That act is not sealed by your key.');
  const p = papers.get(act.paper);
  if (!p) throw httpError(404, 'no_paper', 'No such paper.');
  // one at a time per paper: its order is the order acts pass here
  return serialPaper(p.paper, async () => {
    const why = P.refusal(p.state, act);
    if (why) throw httpError(403, 'not_yours', why);
    if (act.act === 'take' && p.state.where.box && mailboxOf(act.by)[0]?.paper !== p.paper) throw httpError(409, 'not_oldest', 'The oldest letter comes out first.');
    if (act.act === 'post' && !findByKey(act.to)) throw httpError(404, 'no_mailbox', 'No one has that mailbox.');
    if (act.act === 'put' && act.space !== 'outside' && !findByKey(act.space)) throw httpError(404, 'no_house', 'No one lives there.');
    const line = { n: p.lines.length + 1, at: Math.max(0, Date.now() - p.born), act, seal };
    if (act.act === 'stroke' || act.act === 'press') {
      try {
        growable([...p.lines, line], P.lawFor(p.birth));
      } catch (err) {
        throw httpError(400, 'too_much', err.message);
      }
    }
    await appendLines(p.makerId, [{ on: p.paper, n: line.n, at: line.at, act, seal }]);
    const was = step(p, line);
    const now = p.state.where;
    // where it rests in a house, or that it left one: on that house's room chain too
    if (was.space && was.space !== 'outside' && was.space !== now.space) await layIn(was.space, p.paper, null);
    if (now.space && now.space !== 'outside' && (was.space !== now.space || act.act === 'put')) await layIn(now.space, p.paper, now.at, p.birth.size);
    tell({ kind: 'paper', paper: p.paper, line, from: was.space ?? null, to: now.space ?? null });
    return line;
  });
}
const layIn = (houseKey, paper, at, size = null) => {
  const holder = findByKey(houseKey);
  return holder ? lay(holder.id, paper, at, size) : null;
};

// The whole paper must stay a record the law can grow (its caps: writing time, work).
function growable(lines, law) {
  const L = lawOf(law);
  L.precheck(L.decodeCanonical(L.encodeActs(P.compose(lines))));
}

const queues = new Map();
function serialPaper(paper, work) {
  const prev = queues.get(paper) ?? Promise.resolve();
  const next = prev.then(work, work);
  queues.set(
    paper,
    next.catch(() => {}),
  );
  return next;
}

export const isKey = (k) => {
  try {
    return K.isGoodPublicKey(fromB64url(k, 32));
  } catch {
    return false;
  }
};
