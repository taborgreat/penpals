// Shared sheets and the stamper (rooms.md §5, §6; law/shared.js). One story,
// one stamper: an act arrives sealed by its writer; the permission facts on
// the sheet's chain are checked (is it on this writer's table?); it is given
// the next place and its moment, appended to the owner's ink.chain, and sent
// to everyone in the rooms it lies in. Permission is facts landing: a move
// lands and the next act is checked against it.
//
// In the owner's ink.chain (store/books.js):
//   { id, made, share: { birth, seal, open } }        a shared sheet, born open
//   { id, made, shared: <sheet>, n, at, act, seal }    a stamped act
// The index here (which table each sheet lies on, every sheet's lines and the
// replayed state) is rebuilt from the chains at start; nothing else is kept.

import { httpError } from '../files.js';
import { getAccount, findByName, findByKey, usersDir } from './accounts.js';
import { chainLines, appendLines } from './books.js';
import { listDirs } from '../files.js';
import { shared as SH, fromB64url, keys as K } from 'penpals-law';
import { lawOf } from 'penpals-law/laws';

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
    const s = { sheet: birth.sheet, ownerId, owner: birth.key, birth, seal, open, born: Date.parse(line.made), lines: [], state: SH.startState(birth.key) };
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

// Every shared sheet in every book (at start).
export async function loadShared() {
  sheets.clear();
  tables.clear();
  for (const id of await listDirs(usersDir)) {
    if (!getAccount(id)) continue;
    for (const line of await chainLines(id)) remember(id, line);
  }
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
  seal: s.seal,
  open: s.open,
  lines: s.lines,
  table: s.state.table,
  on: findByKey(s.state.table)?.username ?? null,
});

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
  // one at a time per sheet: its order is the order acts pass here
  return serialSheet(s.sheet, async () => {
    const why = SH.refusal(s.state, act);
    if (why) throw httpError(403, 'not_yours', why === 'the sheet is not on your table' ? 'That sheet is not on your table.' : why);
    const line = { n: s.lines.length + 1, at: Math.max(0, Date.now() - s.born), act, seal };
    if (act.act === 'stroke') {
      try {
        growable([...s.lines, line]);
      } catch (err) {
        throw httpError(400, 'too_much', err.message);
      }
    }
    const before = s.state.table;
    const [stored] = await appendLines(s.ownerId, [{ shared: s.sheet, n: line.n, at: line.at, act, seal }]);
    remember(s.ownerId, stored);
    tell({ kind: 'shared', sheet: s.sheet, line, table: s.state.table });
    if (s.state.table !== before) {
      tell({ kind: 'table', key: before, sheet: s.sheet, on: false });
      tell({ kind: 'table', key: s.state.table, sheet: s.sheet, on: true });
    }
    return line;
  });
}

// The whole sheet must stay a record the law can grow (its caps: writing time, work).
function growable(lines) {
  const L = lawOf(SH.SHARED_LAW);
  L.precheck(L.decodeCanonical(L.encodeActs(SH.compose(lines))));
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

// Who a table belongs to, by name → key.
export const keyOfName = (name) => findByName(name)?.publicKey ?? null;
export const isKey = (k) => {
  try {
    return K.isGoodPublicKey(fromB64url(k, 32));
  } catch {
    return false;
  }
};
