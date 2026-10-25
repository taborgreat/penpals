// Shared sheets and the stamper (rooms.md §5, §6; law/shared.js). One story,
// one stamper: an act arrives sealed by its writer; the permission facts on
// the sheet's chain are checked (is it on this writer's table?); it is given
// the next place and its moment, appended to the owner's ink.chain, and sent
// to everyone in the rooms it lies in. Permission is facts landing: a move
// lands and the next act is checked against it; a seal pressed into warm wax
// that took admits its key (the sheet grown to the press decides), a break
// takes it back. A press must carry the named person's own seal: their face,
// made from their public signature (sealFaceOf, law/seal.js). The wax a seal is
// pressed into is no one's act: the drips the law regrows from the rooms the sheet
// lay in (store/wax.js), grown with it to see whether the press took. Where a sheet
// lies is written on that room's chain as it comes and goes (store/rooms.js lay).
//
// In the owner's ink.chain (store/books.js):
//   { id, made, share: { birth, seal, open } }        a shared sheet, born open
//   { id, made, shared: <sheet>, n, at, act, seal }    a stamped act
// The index here (which table each sheet lies on, every sheet's lines and the
// replayed state) is rebuilt from the chains at start; nothing else is kept.

import { httpError } from '../files.js';
import { getAccount, findByName, findByKey, usersDir } from './accounts.js';
import { chainLines, appendLines, getSkeleton, inkLine, openSeed } from './books.js';
import { listDirs } from '../files.js';
import { shared as SH, seal as SEAL, fromB64url, b64url, keys as K } from 'penpals-law';
import { lawOf } from 'penpals-law/laws';
import { lay } from './rooms.js';
import { dripsOnSheet } from './wax.js';

const sheets = new Map(); // sheet → { sheet, ownerId, owner (key), birth, seal, open, born (ms), lines, state }
const tables = new Map(); // key (b64url) → Set(sheet): the shared sheets lying on that person's table
const listeners = new Set(); // (event) => void: { kind: 'shared', sheet, line, table } | { kind: 'table', key, sheet, on }

const lieOn = (key, sheet, on) => {
  let set = tables.get(key);
  if (!set) tables.set(key, (set = new Set()));
  if (on) set.add(sheet);
  else set.delete(sheet);
};
const tell = (e) => {
  for (const fn of listeners) fn(e);
};
export const onShared = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

function remember(ownerId, line) {
  if (line.share) {
    const { birth, seal, open } = line.share;
    const ctx = { seed: fromB64url(open.seed, 64), family: birth.paper }; // (presses are grown to see if they took)
    const s = { sheet: birth.sheet, ownerId, owner: birth.key, birth, seal, open, born: Date.parse(line.made), lines: [], state: SH.startState(birth.key, ctx) };
    sheets.set(birth.sheet, s);
    lieOn(birth.key, birth.sheet, true);
  } else if (typeof line.shared === 'string') {
    const s = sheets.get(line.shared);
    if (!s) return;
    const stamped = { n: line.n, at: line.at, act: line.act, seal: line.seal };
    const before = s.state.table;
    s.state = SH.apply(s.state, stamped);
    s.lines.push(stamped);
    if (s.state.table !== before) {
      lieOn(before, s.sheet, false);
      lieOn(s.state.table, s.sheet, true);
    }
  }
}

// Every shared sheet in every book (at start). Each sheet a seal was pressed into has
// its wax regrown first, so its seals take as they did.
export async function loadShared() {
  sheets.clear();
  tables.clear();
  const acts = []; // [ownerId, line]: the stamped acts, once every sheet is known
  for (const id of await listDirs(usersDir)) {
    if (!getAccount(id)) continue;
    for (const line of await chainLines(id)) {
      if (line.share) remember(id, line);
      else if (typeof line.shared === 'string') acts.push([id, line]);
    }
  }
  const pressed = new Set(acts.filter(([, l]) => l.act?.act === 'press').map(([, l]) => l.shared));
  for (const sheet of pressed) {
    const s = sheets.get(sheet);
    if (s) s.state.ctx.drips = await dripsOnSheet({ ...s, lines: acts.filter(([, l]) => l.shared === sheet).map(([, l]) => ({ act: l.act })) });
  }
  for (const [id, line] of acts) remember(id, line);
  return sheets.size;
}

export const sheetOf = (sheet) => sheets.get(sheet) ?? null;
export const onTable = (key) => [...(tables.get(key) ?? [])].map((s) => sheets.get(s)).filter(Boolean);
export const ownedBy = (userId) => [...sheets.values()].filter((s) => s.ownerId === userId);
// A sheet as anyone in its room sees it (`on`: whose table it lies on, by name).
export const viewOf = (s) => ({
  sheet: s.sheet,
  owner: getAccount(s.ownerId)?.username ?? null,
  birth: s.birth,
  born: s.born, // (ms: its clock's zero, where the room's drips land on it: law/wax.js dripsOn)
  seal: s.seal,
  open: s.open,
  lines: s.lines,
  table: s.state.table,
  on: findByKey(s.state.table)?.username ?? null,
  names: namesIn(s), // who the keys in it are: its writers, and whom its seals are for
});
const namesIn = (s) =>
  Object.fromEntries([...new Set([s.owner, s.state.table, ...s.lines.flatMap((l) => [l.act.by, l.act.press?.for].filter(Boolean))])].map((k) => [k, findByKey(k)?.username ?? null]));

// A new shared sheet, on its owner's table: { birth, seal, open }.
export async function createShared(userId, { birth, seal, open }) {
  const account = getAccount(userId);
  if (!birth || birth.key !== account.publicKey) throw httpError(400, 'bad_shared', 'A shared sheet is your own.');
  try {
    SH.checkBirth(birth, { seal, open });
  } catch (err) {
    throw httpError(err.status ?? 400, 'bad_shared', err.message);
  }
  if (sheets.has(birth.sheet)) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
  const [line] = await appendLines(userId, [{ share: { birth, seal, open } }]);
  remember(userId, line);
  await lay(userId, birth.sheet, true);
  tell({ kind: 'table', key: birth.key, sheet: birth.sheet, on: true });
  return viewOf(sheets.get(birth.sheet));
}

// One act, from its writer (the user): checked, stamped, appended, told. → the stamped line.
export async function stamp(userId, { act, seal }) {
  const account = getAccount(userId);
  try {
    SH.checkSharedAct(act);
  } catch (err) {
    throw httpError(400, 'bad_shared', err.message);
  }
  if (act.by !== account.publicKey) throw httpError(400, 'key_mismatch', 'An act is sealed by its writer.');
  if (!SH.verifyActSeal(act, seal)) throw httpError(401, 'bad_seal', 'That act is not sealed by your key.');
  const s = sheets.get(act.sheet);
  if (!s) throw httpError(404, 'no_sheet', 'No such sheet.');
  if (act.act === 'press') {
    // the stamper set to someone: their own seal, made from their signature
    const them = findByKey(act.press.for);
    const face = them ? await sealFaceOf(them) : null;
    if (!face || face.w !== act.press.w || face.h !== act.press.h || face.face !== act.press.face)
      throw httpError(400, 'not_their_seal', "That is not their seal: a stamper set to someone takes their signature's face.");
  }
  // one at a time per sheet: its order is the order acts pass here
  return serialSheet(s.sheet, async () => {
    const why = SH.refusal(s.state, act);
    if (why) throw httpError(403, 'not_yours', why === 'the sheet is not on your table' ? 'That sheet is not on your table.' : why);
    // a press: did it take? the sheet grown with the wax that had landed on it by now
    if (act.act === 'press') s.state.ctx.drips = await dripsOnSheet(s);
    const line = { n: s.lines.length + 1, at: Math.max(0, Date.now() - s.born), act, seal };
    if (act.act === 'stroke' || act.act === 'press') {
      try {
        growable([...s.lines, line], s.state.ctx.drips);
      } catch (err) {
        throw httpError(400, 'too_much', err.message);
      }
    }
    const before = s.state.table;
    const [stored] = await appendLines(s.ownerId, [{ shared: s.sheet, n: line.n, at: line.at, act, seal }]);
    remember(s.ownerId, stored);
    tell({ kind: 'shared', sheet: s.sheet, line, table: s.state.table });
    if (s.state.table !== before) {
      for (const [key, on] of [
        [before, false],
        [s.state.table, true],
      ]) {
        const holder = findByKey(key);
        if (holder) await lay(holder.id, s.sheet, on);
        tell({ kind: 'table', key, sheet: s.sheet, on });
      }
    }
    return line;
  });
}

// The whole sheet must stay a record the law can grow (its caps: writing time, work).
function growable(lines, drips = []) {
  const L = lawOf(SH.SHARED_LAW);
  L.precheck(L.decodeCanonical(L.encodeActs(SH.compose(lines, drips))));
}

const queues = new Map();
function serialSheet(sheet, work) {
  const prev = queues.get(sheet) ?? Promise.resolve();
  const next = prev.then(work, work);
  queues.set(
    sheet,
    next.catch(() => {}),
  );
  return next;
}

// A person's seal (rooms.md §3b): the face a stamper set to them takes, from their
// public signature (open from birth). → { w, h, face: b64url } | null (not signed yet)
const faces = new Map(); // userId → { sig (their signature's ink), face }
export async function sealFaceOf(account) {
  const id = (await getSkeleton(account.id))?.signature;
  if (!id) return null;
  const was = faces.get(account.id);
  if (was?.sig === id) return was.face;
  const line = await inkLine(account.id, id);
  const seed = line && (await openSeed(account.id, line.ink.sheet));
  let face = null;
  if (seed) {
    const L = lawOf(line.ink.law ?? 1);
    const res = L.grow(L.decodeCanonical(fromB64url(line.ink.acts)), { paperKey: K.paperKeyOf(fromB64url(seed, 64)), family: line.ink.paper, scale: 64 });
    const cells = L.settledCells(res.tiles);
    const f = SEAL.faceOf(cells, L.boxOf(cells));
    face = f && { w: f.w, h: f.h, face: b64url(f.face) };
  }
  faces.set(account.id, { sig: id, face });
  return face;
}

// The wax on each of a person's shared sheets, for their .book: the drips the law
// regrew from the rooms each lay in (no one's act: the stamper's, as its moments are;
// anyone with those rooms' chains regrows the same). → { [sheet]: drips }
export async function waxOfBook(userId) {
  const out = {};
  for (const s of ownedBy(userId)) {
    const drips = await dripsOnSheet(s);
    if (drips.length) out[s.sheet] = drips;
  }
  return out;
}

// Who a table belongs to, by name → key.
export const keyOfName = (name) => findByName(name)?.publicKey ?? null;
export const isKey = (k) => {
  try {
    return K.isGoodPublicKey(fromB64url(k, 32));
  } catch {
    return false;
  }
};
