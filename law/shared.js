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
//            act 'press'   press: { x, y, depth, angle, tiltX, tiltY, cell, w, h, face, for }   the owner
//                          presses the stamper, set to someone's seal (face: b64url relief, for: their key)
//            act 'break'   break: { seal: n, from: [x, y], to: [x, y] }   the owner breaks the seal pressed at n
//   stamped line  { n, at, act, seal }   n the act's place (1, 2, ...), at its moment
//                                        (ms from the sheet's birth): the stamper's, not signed
//
// k is the writer's own count on this sheet: no act is stamped twice. Who may
// write is read from the chain (permission is possession): the owner always;
// anyone else only while the sheet lies on their table (the last move before
// their act put it there), or while it lies on the owner's table and their seal
// is pressed into wax on it, took, and is unbroken (§5). Whether a press took is
// the law's: the sheet grown to that act (law 3: soft enough, deep enough).
//
// The law of a shared sheet: its strokes and its wax, in the stamper's order, are
// one record grown by law 3, so inks mix across writers where both are wet. Each
// stroke begins at its stamp, or as the one before it ends if they overlap
// (one sheet, one order); a pause longer than MAX_GAP is a pause of MAX_GAP
// (the ink is long dry either way). A lift is a forward act: the lifted stroke
// is grown as water instead of ink (WATER: the same nib, the same path, the
// same moments, no pigment). So its pigment is gone from everywhere it went,
// and what it did with its water stays: the soak, the swelling, the dents and
// wear of its nib, how it pushed the other writer's ink; nobody's time
// replays. A writer may lift only their own strokes, and only their last
// LIFT_WINDOW: older pigment has merged. A press and a break land at their stamp
// (no duration), in the same one order, as marks of the record. Drips are no one's
// act: the law regrows them from the room's chain (law/wax.js: a held candle tilted
// past its pool's lip), and those that landed on this sheet are marks of its record
// at their moments (drips: [{ t (ms from the sheet's birth), x, y, amt, heat }], wax.js dripsOn).

import { sha256 } from '@noble/hashes/sha2.js';
import { T, jcs, b64url, fromB64url, utf8, concat, equalBytes } from './tags.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { verify, isSheetId, isGoodPublicKey, sheetSeed, verifySeed, commitOf, paperKeyOf } from './keys.js';
import { checkFamily } from './v1/paper.js';
import { MAX_GAP, MAX_COORD } from './v1/constants.js';
import { WATER, FACE_MAX, FACE_CELL_MAX } from './v2/constants.js';
import { lawOf } from './laws.js';

export const SHARED_LAW = 3; // the law a shared sheet's record grows under (wax: rooms.md §3b)
export const LIFT_WINDOW = 8; // a writer's last strokes that can still be lifted (Tabor's to set)
export const ACTS = ['stroke', 'lift', 'move', 'press', 'break'];

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

export function makeSharedAct({ sk, pk, sheet, k, act, stroke = null, lift = null, to = null, press = null, broke = null }) {
  const body = { v: 2, kind: 'shared', sheet, by: b64url(pk), k, act };
  if (act === 'stroke') body.stroke = b64url(stroke);
  if (act === 'lift') body.lift = lift;
  if (act === 'move') body.to = to;
  if (act === 'press') body.press = { ...press, face: typeof press.face === 'string' ? press.face : b64url(press.face) };
  if (act === 'break') body.break = { seal: broke.seal, from: [...broke.from], to: [...broke.to] };
  checkSharedAct(body);
  return { act: body, seal: b64url(sign(sk, sealMsg(sharedDigest(body)))) };
}

// --- checking (anyone) ---

const isKey = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
export function checkSharedAct(body) {
  if (!body || typeof body !== 'object') throw bad('no act');
  const keys = Object.keys(body).sort().join();
  const want = {
    stroke: 'act,by,k,kind,sheet,stroke,v',
    lift: 'act,by,k,kind,lift,sheet,v',
    move: 'act,by,k,kind,sheet,to,v',
    press: 'act,by,k,kind,press,sheet,v',
    break: 'act,break,by,k,kind,sheet,v',
  }[body.act];
  if (!want || keys !== want) throw bad('not a shared act');
  if (body.v !== 2 || body.kind !== 'shared' || !isSheetId(body.sheet) || !isKey(body.by) || !Number.isInteger(body.k) || body.k < 1) throw bad('a malformed act');
  if (body.act === 'stroke') {
    const rec = lawOf(SHARED_LAW).decodeCanonical(fromB64url(body.stroke));
    if (rec.strokes.length !== 1) throw bad('one stroke an act');
  }
  if (body.act === 'lift' && (!Number.isInteger(body.lift) || body.lift < 1)) throw bad('a lift names a stroke by its place');
  if (body.act === 'move' && !isKey(body.to)) throw bad('a move names a table by its key');
  if (body.act === 'press' || body.act === 'break') checkWax(body);
  return body;
}

// The wax acts' fields, as the law's marks take them (v2/acts.js format 3).
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const point = (q) => Array.isArray(q) && q.length === 2 && q.every((v) => int(v, 0, MAX_COORD));
function checkWax(body) {
  const fields = (o, names) => o && typeof o === 'object' && Object.keys(o).sort().join() === names;
  if (body.act === 'press') {
    const q = body.press;
    if (!fields(q, 'angle,cell,depth,face,for,h,tiltX,tiltY,w,x,y')) throw bad('a malformed press');
    if (!int(q.x, 0, MAX_COORD) || !int(q.y, 0, MAX_COORD) || !int(q.depth, 1, 255) || !int(q.angle, 0, 179) || !int(q.tiltX, -127, 127) || !int(q.tiltY, -127, 127)) throw bad('a malformed press');
    if (!int(q.cell, 1, FACE_CELL_MAX) || !int(q.w, 1, FACE_MAX) || !int(q.h, 1, FACE_MAX) || !isKey(q.for)) throw bad('a malformed press');
    if (typeof q.face !== 'string' || fromB64url(q.face).length !== q.w * q.h) throw bad("the stamper's face is not its size");
  } else {
    const b = body.break;
    if (!fields(b, 'from,seal,to') || !int(b.seal, 1, 1e9) || !point(b.from) || !point(b.to)) throw bad('a malformed break');
  }
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
// verifier replays. state: { owner, table, strokes: [{ n, by, lifted }], k: { [by]: last k },
// seals: [{ n, for, took, broken }], lines (so far: a press is grown to see if it took) }.
// ctx: { seed, family } (checkBirth), and drips (the drips that landed on it: wax.js
// dripsOn; null: not known here, so whether a press took is not known either): without
// ctx no press can take.
export const startState = (owner, ctx = null) => ({ owner, table: owner, strokes: [], k: {}, seals: [], lines: [], ctx });

// May `by` write here now: the owner; the one whose table it lies on; anyone whose
// seal took and is unbroken, while it lies on the owner's table.
export const mayWrite = (state, by) => by === state.owner || by === state.table || (state.table === state.owner && state.seals.some((x) => x.for === by && x.took !== false && !x.broken));
// (allowed only by a seal whose wax is not known here: unverified)
const bySealUnknown = (state, by) => by !== state.owner && by !== state.table && !state.seals.some((x) => x.for === by && x.took === true && !x.broken);

// Would this act be allowed as the next one? → null, or why not.
export function refusal(state, act) {
  if ((state.k[act.by] ?? 0) >= act.k) return 'that act was stamped already';
  if (act.act === 'move') return act.by === state.owner ? null : 'only the owner moves the sheet';
  if (act.act === 'press' || act.act === 'break') {
    if (act.by !== state.owner) return 'only the owner presses or breaks a seal';
    if (act.act === 'break' && !state.seals.some((x) => x.n === act.break.seal && !x.broken)) return 'there is no such seal to break';
    return null;
  }
  if (!mayWrite(state, act.by)) return 'the sheet is not on your table';
  if (act.act === 'stroke') return null;
  if (act.act === 'lift') {
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
export function apply(state, line) {
  const { n, act } = line;
  const next = { ...state, strokes: state.strokes, k: { ...state.k, [act.by]: act.k }, lines: [...state.lines, line] };
  if (act.act === 'move') next.table = act.to;
  if (act.act === 'stroke') next.strokes = [...state.strokes, { n, by: act.by, lifted: false }];
  if (act.act === 'lift') next.strokes = state.strokes.map((s) => (s.n === act.lift ? { ...s, lifted: true } : s));
  if (act.act === 'press') {
    // did it take? the sheet grown to this press says (with the wax that had landed on it by then;
    // where that is not known, nor is whether it took)
    let took = false;
    if (state.ctx?.drips === null) took = null;
    else if (state.ctx) took = !!growShared(next.lines, { ...state.ctx, drips: (state.ctx.drips ?? []).filter((d) => d.t <= line.at) })?.seals.at(-1)?.took;
    next.seals = [...state.seals, { n, for: act.press.for, took, broken: false }];
  }
  if (act.act === 'break') next.seals = state.seals.map((x) => (x.n === act.break.seal ? { ...x, broken: true } : x));
  return next;
}

// Replay a whole chain of stamped lines: every place in order, every seal, every permission.
// → { state, problems, unverified (acts allowed only by a seal whose wax is not known here) }
export function replay(owner, lines, { seals = true, ctx = null } = {}) {
  let state = startState(owner, ctx);
  const problems = [];
  const unverified = [];
  lines.forEach((line, i) => {
    try {
      if (line.n !== i + 1) throw bad(`place ${line.n} where ${i + 1} belongs`);
      checkSharedAct(line.act);
      if (seals && !verifyActSeal(line.act, line.seal)) throw bad("the seal is not its writer's");
      const why = refusal(state, line.act);
      if (why) throw bad(why);
      if ((line.act.act === 'stroke' || line.act.act === 'lift') && bySealUnknown(state, line.act.by)) unverified.push(`act ${line.n}: by a seal pressed into wax regrown from a room's acts (not here)`);
      state = apply(state, line);
    } catch (err) {
      problems.push(`act ${line.n}: ${err.message}`);
    }
  });
  return { state, problems, unverified };
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

// lines: stamped, allowed (replay first); drips: those that landed on it (wax.js dripsOn).
// → the PNKA record (law 3) of all its strokes and its wax.
const MARKED = new Set(['stroke', 'drip', 'press', 'break']);
export function compose(lines, drips = []) {
  const L = lawOf(SHARED_LAW);
  const lifted = new Set(lines.filter((l) => l.act.act === 'lift').map((l) => l.act.lift));
  const out = { orgX: 0, orgY: 0, strokes: [], marks: [] };
  let end = null; // where the last stroke ended, or the last mark landed (ms on the record's clock)
  let offset = null; // the sheet's clock less the record's
  // each drip among the lines at its moment (after a line stamped at the same moment)
  const all = [...lines];
  for (const d of [...drips].sort((x, y) => x.t - y.t)) {
    let i = all.length;
    while (i > 0 && all[i - 1].at > d.t) i--;
    all.splice(i, 0, { at: d.t, act: { act: 'drip', drip: d } });
  }
  for (const line of all) {
    const a = line.act;
    if (!MARKED.has(a.act)) continue;
    const rec = a.act === 'stroke' ? L.decodeCanonical(fromB64url(a.stroke)) : null;
    const s0 = rec?.strokes[0];
    // a stroke is stamped as the pen lifted: it ends at its stamp; wax lands at its stamp
    const begins = line.at - (s0 ? s0.t[s0.t.length - 1] - s0.t[0] : 0);
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
    if (!s0) {
      out.marks.push(markOf(a, start));
      end = start;
      continue;
    }
    // in the sheet's own frame (tenths of a unit from its origin), at its moment
    const s = shift(s0, rec.orgX * 10, rec.orgY * 10, start - s0.t[0]);
    out.strokes.push(lifted.has(line.n) ? asWater(s) : s);
    end = s.t[s.t.length - 1];
  }
  // the record's own origin: whole units at the least corner of its writing and wax (kept non-negative)
  const xs = [...out.strokes.flatMap((s) => s.x), ...out.marks.flatMap((m) => (m.kind === 'break' ? [m.x, m.x1] : [m.x]))];
  const ys = [...out.strokes.flatMap((s) => s.y), ...out.marks.flatMap((m) => (m.kind === 'break' ? [m.y, m.y1] : [m.y]))];
  if (xs.length) {
    const ox = Math.floor(Math.min(...xs) / 10),
      oy = Math.floor(Math.min(...ys) / 10);
    out.orgX = ox;
    out.orgY = oy;
    out.strokes = out.strokes.map((s) => ({ ...s, x: s.x.map((v) => v - ox * 10), y: s.y.map((v) => v - oy * 10) }));
    out.marks = out.marks.map((m) => ({ ...m, x: m.x - ox * 10, y: m.y - oy * 10, ...(m.kind === 'break' ? { x1: m.x1 - ox * 10, y1: m.y1 - oy * 10 } : {}) }));
  }
  if (!out.marks.length) delete out.marks;
  return out;
}

// A wax act (or a drip that landed) as the law's mark, at its moment on the record's clock.
function markOf(a, t) {
  if (a.act === 'drip') return { kind: 'drip', t, x: a.drip.x, y: a.drip.y, amt: a.drip.amt, heat: a.drip.heat };
  if (a.act === 'press') {
    const q = a.press;
    return { kind: 'press', t, x: q.x, y: q.y, depth: q.depth, angle: q.angle, tiltX: q.tiltX, tiltY: q.tiltY, cell: q.cell, w: q.w, h: q.h, face: fromB64url(q.face) };
  }
  return { kind: 'break', t, x: a.break.from[0], y: a.break.from[1], x1: a.break.to[0], y1: a.break.to[1] };
}

// The sheet as its acts and the drips that landed on it have made it: facts on its
// owner's paper, and each press's seal (took or not). → settled ({ facts, cells, box, seals, ... }) | null
export function growShared(lines, { seed, family, scale = 64, drips = [] }) {
  const L = lawOf(SHARED_LAW);
  const rec = compose(lines, drips);
  if (!rec.strokes.length && !rec.marks) return null;
  const acts = L.encodeActs(rec);
  const res = L.grow(L.decodeCanonical(acts), { paperKey: paperKeyOf(seed), family, scale });
  const cells = L.settledCells(res.tiles);
  const box = L.boxOf(cells);
  return { acts, cells, box, seals: res.seals, facts: L.factsDigest({ cells, box, actsBytes: acts, family, scale, law: SHARED_LAW }) };
}
