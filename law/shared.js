// Writing together (rooms.md §5, §6): one sheet, one story, one stamper. A
// shared sheet is its owner's (its paper grows from their key, open from birth
// so everyone writing on it grows the same paper), and its writing is a chain
// of acts, each sealed by its writer and given its place by the stamper:
//
//   birth  { v: 2, kind: 'shared-sheet', sheet, key, paper, commit }   sealed by the owner, open: { seed, by }
//   act    { v: 2, kind: 'shared', sheet, by, k, act, ... }            sealed by `by`
//            act 'stroke'  stroke: b64url(PNKA of one stroke, in the sheet's own frame)
//            act 'lift'    lift: n   (lift my stroke: rooms.md §6, undo on a shared sheet)
//            act 'move'    to: b64url(pk)   (the owner lays the sheet on someone's table: §5)
//   stamped line  { n, at, act, seal }   n the act's place (1, 2, ...), at its moment
//                                        (ms from the sheet's birth): the stamper's, not signed
//
// k is the writer's own count on this sheet: no act is stamped twice. Who may
// write is read from the chain (permission is possession): the owner always;
// anyone else only while the sheet lies on their table (the last move before
// their act put it there). Seals pressed in wax (§5) come with layer 3's wax.
//
// The law of a shared sheet: its strokes, in the stamper's order, are one
// record grown by law 2, so inks mix across writers where both are wet. Each
// stroke begins at its stamp, or as the one before it ends if they overlap
// (one sheet, one order); a pause longer than MAX_GAP is a pause of MAX_GAP
// (the ink is long dry either way). A lift is a forward act: the lifted stroke
// is grown as water instead of ink (WATER: the same nib, the same path, the
// same moments, no pigment). So its pigment is gone from everywhere it went,
// and what it did with its water stays: the soak, the swelling, the dents and
// wear of its nib, how it pushed the other writer's ink; nobody's time
// replays. A writer may lift only their own strokes, and only their last
// LIFT_WINDOW: older pigment has merged.

import { sha256 } from '@noble/hashes/sha2.js';
import { T, jcs, b64url, fromB64url, utf8, concat, equalBytes } from './tags.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { verify, isSheetId, isGoodPublicKey, sheetSeed, verifySeed, commitOf, paperKeyOf } from './keys.js';
import { checkFamily } from './v1/paper.js';
import { MAX_GAP } from './v1/constants.js';
import { WATER } from './v2/constants.js';
import { lawOf } from './laws.js';

export const SHARED_LAW = 2; // the law a shared sheet's record grows under
export const LIFT_WINDOW = 8; // a writer's last strokes that can still be lifted (Tabor's to set)
export const ACTS = ['stroke', 'lift', 'move'];

const sign = (sk, msg) => ed25519.sign(msg, sk);
const bad = (msg) => Object.assign(new Error(msg), { code: 'bad_shared', status: 400 });
export const sharedDigest = (body) => sha256(concat(T('shared'), utf8(jcs(body))));
const sealMsg = (D) => concat(T('seal'), D);
const openMsg = (D, sheet) => concat(T('open'), D, utf8(sheet));

// --- making (a device) ---

export function makeSharedSheet({ sk, pk, sheet, family }) {
  checkFamily(family);
  const seed = sheetSeed(sk, sheet);
  const birth = { v: 2, kind: 'shared-sheet', sheet, key: b64url(pk), paper: { ...family }, commit: b64url(commitOf(seed)) };
  const D = sharedDigest(birth);
  return { birth, seal: b64url(sign(sk, sealMsg(D))), open: { seed: b64url(seed), by: b64url(sign(sk, openMsg(D, sheet))) } };
}

export function makeSharedAct({ sk, pk, sheet, k, act, stroke = null, lift = null, to = null }) {
  const body = { v: 2, kind: 'shared', sheet, by: b64url(pk), k, act };
  if (act === 'stroke') body.stroke = b64url(stroke);
  if (act === 'lift') body.lift = lift;
  if (act === 'move') body.to = to;
  checkSharedAct(body);
  return { act: body, seal: b64url(sign(sk, sealMsg(sharedDigest(body)))) };
}

// --- checking (anyone) ---

const isKey = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
export function checkSharedAct(body) {
  if (!body || typeof body !== 'object') throw bad('no act');
  const keys = Object.keys(body).sort().join();
  const want = { stroke: 'act,by,k,kind,sheet,stroke,v', lift: 'act,by,k,kind,lift,sheet,v', move: 'act,by,k,kind,sheet,to,v' }[body.act];
  if (!want || keys !== want) throw bad('not a shared act');
  if (body.v !== 2 || body.kind !== 'shared' || !isSheetId(body.sheet) || !isKey(body.by) || !Number.isInteger(body.k) || body.k < 1) throw bad('a malformed act');
  if (body.act === 'stroke') {
    const rec = lawOf(SHARED_LAW).decodeCanonical(fromB64url(body.stroke));
    if (rec.strokes.length !== 1) throw bad('one stroke an act');
  }
  if (body.act === 'lift' && (!Number.isInteger(body.lift) || body.lift < 1)) throw bad('a lift names a stroke by its place');
  if (body.act === 'move' && !isKey(body.to)) throw bad('a move names a table by its key');
  return body;
}

export function checkBirth(birth, { seal, open }) {
  if (!birth || birth.v !== 2 || birth.kind !== 'shared-sheet' || !isSheetId(birth.sheet) || !isKey(birth.key)) throw bad('not a shared sheet');
  checkFamily(birth.paper);
  const pk = fromB64url(birth.key, 32);
  if (!isGoodPublicKey(pk)) throw bad('not a usable key');
  const D = sharedDigest(birth);
  if (!verify(fromB64url(seal, 64), sealMsg(D), pk)) throw Object.assign(bad('the sheet is not sealed by its owner'), { status: 401 });
  const seed = fromB64url(open?.seed, 64);
  if (!verifySeed(pk, birth.sheet, seed) || !equalBytes(commitOf(seed), fromB64url(birth.commit, 32))) throw bad("the paper is not the owner's");
  if (!verify(fromB64url(open.by, 64), openMsg(D, birth.sheet), pk)) throw Object.assign(bad('the sheet is not opened by its owner'), { status: 401 });
  return { owner: birth.key, seed, family: birth.paper };
}

export const verifyActSeal = (act, seal) => verify(fromB64url(seal, 64), sealMsg(sharedDigest(act)), fromB64url(act.by, 32));

// Who may do what, read from the chain: a state the stamper keeps and a
// verifier replays. state: { owner, table, strokes: [{ n, by, lifted }], k: { [by]: last k } }.
export const startState = (owner) => ({ owner, table: owner, strokes: [], k: {} });

// Would this act be allowed as the next one? → null, or why not.
export function refusal(state, act) {
  if ((state.k[act.by] ?? 0) >= act.k) return 'that act was stamped already';
  if (act.act === 'move') return act.by === state.owner ? null : 'only the owner moves the sheet';
  if (act.act === 'stroke') return act.by === state.owner || act.by === state.table ? null : 'the sheet is not on your table';
  if (act.act === 'lift') {
    if (act.by !== state.owner && act.by !== state.table) return 'the sheet is not on your table';
    const s = state.strokes.find((x) => x.n === act.lift);
    if (!s) return 'there is no such stroke';
    if (s.by !== act.by) return 'only its writer lifts a stroke';
    if (s.lifted) return 'it is lifted already';
    const mine = state.strokes.filter((x) => x.by === act.by);
    if (mine.indexOf(s) < mine.length - LIFT_WINDOW) return 'too old to lift: its pigment has merged';
    return null;
  }
  return 'an unknown act';
}

// The state after a stamped act (allowed).
export function apply(state, { n, act }) {
  const next = { ...state, strokes: state.strokes, k: { ...state.k, [act.by]: act.k } };
  if (act.act === 'move') next.table = act.to;
  if (act.act === 'stroke') next.strokes = [...state.strokes, { n, by: act.by, lifted: false }];
  if (act.act === 'lift') next.strokes = state.strokes.map((s) => (s.n === act.lift ? { ...s, lifted: true } : s));
  return next;
}

// Replay a whole chain of stamped lines: every place in order, every seal, every permission.
// → { state, problems }
export function replay(owner, lines, { seals = true } = {}) {
  let state = startState(owner);
  const problems = [];
  lines.forEach((line, i) => {
    try {
      if (line.n !== i + 1) throw bad(`place ${line.n} where ${i + 1} belongs`);
      checkSharedAct(line.act);
      if (seals && !verifyActSeal(line.act, line.seal)) throw bad("the seal is not its writer's");
      const why = refusal(state, line.act);
      if (why) throw bad(why);
      state = apply(state, line);
    } catch (err) {
      problems.push(`act ${line.n}: ${err.message}`);
    }
  });
  return { state, problems };
}

// --- the law: the record a shared sheet's acts make ---

// (decoded strokes hold typed arrays: plain ones here, to gather and shift)
const shift = (s, dx, dy, dt) => ({
  ...s,
  x: Array.from(s.x, (v) => v + dx),
  y: Array.from(s.y, (v) => v + dy),
  t: Array.from(s.t, (v) => v + dt),
  p: s.p ? Array.from(s.p) : s.p,
  pens: s.pens.map((p) => ({ ...p })),
});
const asWater = (s) => ({ ...s, pens: s.pens.map((p, i) => (i === 0 || p.rgb ? { ...p, rgb: [...WATER], mask: undefined } : p)) });

// lines: stamped, allowed (replay first). → the PNKA record (law 2) of all its strokes.
export function compose(lines) {
  const L = lawOf(SHARED_LAW);
  const lifted = new Set(lines.filter((l) => l.act.act === 'lift').map((l) => l.act.lift));
  const out = { orgX: 0, orgY: 0, strokes: [] };
  let end = null; // where the last stroke ended (ms on the record's clock)
  let offset = null; // the sheet's clock less the record's
  for (const line of lines) {
    if (line.act.act !== 'stroke') continue;
    const rec = L.decodeCanonical(fromB64url(line.act.stroke));
    const s0 = rec.strokes[0];
    // stamped as the pen lifted: it ends at its stamp
    const begins = line.at - (s0.t[s0.t.length - 1] - s0.t[0]);
    if (offset === null) offset = begins;
    let start = begins - offset;
    if (end !== null) {
      if (start < end)
        start = end; // overlapping: after the one before it (one sheet, one order)
      else if (start - end > MAX_GAP) {
        offset += start - end - MAX_GAP; // a long pause is MAX_GAP: the ink is dry either way
        start = end + MAX_GAP;
      }
    }
    // in the sheet's own frame (tenths of a unit from its origin), at its moment
    const s = shift(s0, rec.orgX * 10, rec.orgY * 10, start - s0.t[0]);
    out.strokes.push(lifted.has(line.n) ? asWater(s) : s);
    end = s.t[s.t.length - 1];
  }
  // the record's own origin: whole units at the writing's least corner (x, y kept non-negative)
  if (out.strokes.length) {
    const minX = Math.min(...out.strokes.flatMap((s) => s.x)),
      minY = Math.min(...out.strokes.flatMap((s) => s.y));
    const ox = Math.floor(minX / 10),
      oy = Math.floor(minY / 10);
    out.orgX = ox;
    out.orgY = oy;
    out.strokes = out.strokes.map((s) => ({ ...s, x: s.x.map((v) => v - ox * 10), y: s.y.map((v) => v - oy * 10) }));
  }
  return out;
}

// The sheet as its acts have made it: facts on its owner's paper. → settled ({ facts, cells, box, ... }) | null
export function growShared(lines, { seed, family, scale = 64 }) {
  const L = lawOf(SHARED_LAW);
  const rec = compose(lines);
  if (!rec.strokes.length) return null;
  const acts = L.encodeActs(rec);
  const res = L.grow(L.decodeCanonical(acts), { paperKey: paperKeyOf(seed), family, scale });
  const cells = L.settledCells(res.tiles);
  const box = L.boxOf(cells);
  return { acts, cells, box, facts: L.factsDigest({ cells, box, actsBytes: acts, family, scale, law: SHARED_LAW }) };
}
