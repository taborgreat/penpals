// Paper (Tabor, 2026-10-25): thin rectangles of paper matter. A paper is its owner's, and its whole life
// is on its own chain: born (on its owner's table); every mark on it (a stroke, a stroke lifted, a seal
// pressed into wax, a seal broken) and every move of it (taken up into a hand, let go anywhere, posted
// into a mailbox, saved into a book) an act sealed by its being and given its place by the stamper.
// There is one kind of paper: what may be done to it is read from its chain at each act.
// A house's surfaces are matter the same way (Tabor, 2026-10-25: ink is matter deposited on any matter,
// never a sheet): its walls, floor, ceiling and table top, each its own chain once anything is written on it,
// born its house's owner's, where it is for good (it is never taken up), its matter the surface's (plaster,
// wood: law 4 grows ink on that matter's own cells). Its owner marks it; nothing moves it.
//   birth  { v: 3, kind: 'surface', paper, key, surface (its name: SURFACES), family (with its matter), size,
//          commit }
//
//   birth  { v: 3, kind: 'paper', paper, key, family, size: [w, h] (its units), at: [x, y, z] (mm: on its
//          owner's table, where it lies), commit }   sealed by its owner; open: { seed, by } (anyone may grow it)
//   act    { v: 3, kind: 'paper', paper, by, k, act, ... }   sealed by `by`
//     marks  'stroke' stroke: b64url(PNKA of one stroke, in the paper's own frame)   'lift' lift: n (my stroke)
//            'press' press: { x, y, depth, angle, tiltX, tiltY, cell, w, h, face, for }   'break' break: { seal, from, to }
//     moves  'take'                into by's hand, from where it lies (out of a mailbox or a book: its owner's)
//            'put'   space, at     out of by's hand, let go in a space (a house, by its owner's key; or
//                                  'outside') at [x, y, z] (mm: room or world): it falls flat until it rests
//            'post'  to            out of by's hand into to's mailbox: it is to's now
//            'shelve' book         out of its owner's hand into their book, at a path (book names, from its top)
//   stamped line  { n, at, act, seal }   n the act's place (1, 2, ...), at its moment (ms from its birth)
//
// Who may mark it: its owner; anyone whose name is pressed into wax on it (a press naming them, not broken:
// however the impression came out); the being whose house it lies in, while it rests on their table. Who
// may move it: anyone, where it lies (it is matter: take); only the hand holding it lets it go, posts it or
// saves it (its owner's own book only); out of a mailbox only its owner (which comes out first, the oldest
// delivered, is the stamper's: it knows every letter in a mailbox); out of a book only its owner. It is
// marked only where it lies (not in a hand, a mailbox or a book).
// ctx: { table: { x0, x1, y0, y1, top } (m: a house's table, the same in every house: law/room.js), ground:
// (x, y) → z (m: the outside's, law/outside.js) }: where a paper let go comes to rest, and whether it rests
// on a table. CTX: this world's.
//
// The law of a paper: its strokes and its wax, in the stamper's order, are one record grown by law 4 (the
// paper's matter worn by the nib, dry or wet, shed as fluff, worn through: one-matter.md Phase 4), so
// inks mix across writers where both are wet. Each stroke begins at its stamp, or as the one before it
// ends if they overlap (one paper, one order); a pause longer than MAX_GAP is a pause of MAX_GAP. A lift
// is a forward act: the lifted stroke is grown as water instead of ink (WATER), so its pigment is gone and
// what its water did stays. A writer lifts only their own strokes, and only their last LIFT_WINDOW. A
// press and a break land at their stamp. Drips are no one's act: the law regrows them from the rooms the
// paper lay in (law/wax.js), and those that landed on it are marks of its record at their moments.

import { sha256 } from '@noble/hashes/sha2.js';
import { T, jcs, b64url, fromB64url, utf8, concat, equalBytes } from './tags.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { verify, isSheetId, isGoodPublicKey, sheetSeed, verifySeed, commitOf, paperKeyOf } from './keys.js';
import { checkFamily } from './v1/paper.js';
import { MAX_GAP, MAX_COORD } from './v1/constants.js';
import { WATER, FACE_MAX, FACE_CELL_MAX } from './v2/constants.js';
import { lawOf } from './laws.js';
import { tableOf, HOUSE } from './room.js';
import { groundAt } from './outside.js';

export const PAPER_LAW = 4; // the law a paper's record grows under (wax: rooms.md §3b; matter worn away: law 4)
export const SURFACE_LAW = 4; // and a surface's: ink on the surface's own matter (law 4)
// A house's surfaces, each its matter and its size (its units: the page's px, 1400 to 0.2159 m), and the
// families their matter's cells are grown from (as the house was always made: the backend's config had them).
const PX_PER_M = 1400 / 0.2159;
const px = (m) => Math.round(m * PX_PER_M);
const [HW, HD, HH] = HOUSE.size;
export const FAMILIES = Object.freeze({ plaster: Object.freeze({ grain: 0, weight: 15, tooth: 0 }), wood: Object.freeze({ grain: 15, weight: 4, tooth: 0 }) });
export const SURFACES = Object.freeze({
  table: Object.freeze({ matter: 'wood', size: [px(HOUSE.table.width), px(HOUSE.table.depth)] }),
  'wall-far': Object.freeze({ matter: 'plaster', size: [px(HW), px(HH)] }),
  'wall-near': Object.freeze({ matter: 'plaster', size: [px(HW), px(HH)] }),
  'wall-left': Object.freeze({ matter: 'plaster', size: [px(HD), px(HH)] }),
  'wall-right': Object.freeze({ matter: 'plaster', size: [px(HD), px(HH)] }),
  floor: Object.freeze({ matter: 'wood', size: [px(HW), px(HD)] }),
  ceiling: Object.freeze({ matter: 'plaster', size: [px(HW), px(HD)] }),
  pen: Object.freeze({ matter: 'wood', size: [px(HOUSE.pen.length), px(HOUSE.pen.thick)] }), // the pen's top face, wherever it lies
});
// The ink law a paper or a surface grows under, by its birth.
export const lawFor = (birth) => (birth?.kind === 'surface' ? SURFACE_LAW : PAPER_LAW);
export const LIFT_WINDOW = 8; // a writer's last strokes that can still be lifted (Tabor's to set)
export const SIZES = Object.freeze({ half: [1000, 700], full: [1000, 1400] }); // its units (the page's px: law/matter.js CELL_M)
export const MARKS = ['stroke', 'lift', 'press', 'break'];
export const MOVES = ['take', 'put', 'post', 'shelve'];
export const ACTS = [...MARKS, ...MOVES];
export const CTX = Object.freeze({ table: Object.freeze(tableOf()), ground: groundAt });
const REACH_MM = 1e9; // (a place in the world: the outside has no edge)

const sign = (sk, msg) => ed25519.sign(msg, sk);
const bad = (msg) => Object.assign(new Error(msg), { code: 'bad_paper', status: 400 });
export const paperDigest = (body) => sha256(concat(T('paper'), utf8(jcs(body))));
const sealMsg = (D) => concat(T('seal'), D);
const openMsg = (D, paper) => concat(T('open'), D, utf8(paper));
const mmOf = (p) => p.map((v) => Math.round(v * 1000));

// --- making (a device) ---

// A new paper, its owner's, lying on their table at `at` (room m).
export function makePaper({ sk, pk, paper, family, size = SIZES.half, at }) {
  checkFamily(family);
  const seed = sheetSeed(sk, paper);
  const birth = { v: 3, kind: 'paper', paper, key: b64url(pk), family: { ...family }, size: [...size], at: mmOf(at), commit: b64url(commitOf(seed)) };
  const D = paperDigest(birth);
  return { birth, seal: b64url(sign(sk, sealMsg(D))), open: { seed: b64url(seed), by: b64url(sign(sk, openMsg(D, paper))) } };
}

// A house's surface, its owner's, where it is: `surface` one of SURFACES.
export function makeSurface({ sk, pk, paper, surface }) {
  const S = SURFACES[surface];
  if (!S) throw bad('not a surface of a house');
  const seed = sheetSeed(sk, paper);
  const birth = { v: 3, kind: 'surface', paper, key: b64url(pk), surface, family: { ...FAMILIES[S.matter], matter: S.matter }, size: [...S.size], commit: b64url(commitOf(seed)) };
  const D = paperDigest(birth);
  return { birth, seal: b64url(sign(sk, sealMsg(D))), open: { seed: b64url(seed), by: b64url(sign(sk, openMsg(D, paper))) } };
}

// An act on a paper (places in m: made whole millimetres here).
export function makePaperAct({ sk, pk, paper, k, act, stroke = null, lift = null, press = null, broke = null, space = null, at = null, to = null, book = null }) {
  const body = { v: 3, kind: 'paper', paper, by: b64url(pk), k, act };
  if (act === 'stroke') body.stroke = b64url(stroke);
  if (act === 'lift') body.lift = lift;
  if (act === 'press') body.press = { ...press, face: typeof press.face === 'string' ? press.face : b64url(press.face) };
  if (act === 'break') body.break = { seal: broke.seal, from: [...broke.from], to: [...broke.to] };
  if (act === 'put') Object.assign(body, { space, at: mmOf(at) });
  if (act === 'post') body.to = to;
  if (act === 'shelve') body.book = [...book];
  checkPaperAct(body);
  return { act: body, seal: b64url(sign(sk, sealMsg(paperDigest(body)))) };
}

// --- checking (anyone) ---

const isKey = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isPlace = (p) => Array.isArray(p) && p.length === 3 && p.every((v) => int(v, -REACH_MM, REACH_MM));
const isBook = (b) => Array.isArray(b) && b.length >= 1 && b.length <= 8 && b.every((n) => typeof n === 'string' && n.trim() === n && n.length >= 1 && n.length <= 40);
export function checkPaperAct(body) {
  if (!body || typeof body !== 'object') throw bad('no act');
  const want = {
    stroke: 'act,by,k,kind,paper,stroke,v',
    lift: 'act,by,k,kind,lift,paper,v',
    press: 'act,by,k,kind,paper,press,v',
    break: 'act,break,by,k,kind,paper,v',
    take: 'act,by,k,kind,paper,v',
    put: 'act,at,by,k,kind,paper,space,v',
    post: 'act,by,k,kind,paper,to,v',
    shelve: 'act,book,by,k,kind,paper,v',
  }[body.act];
  if (!want || Object.keys(body).sort().join() !== want) throw bad('not an act on a paper');
  if (body.v !== 3 || body.kind !== 'paper' || !isSheetId(body.paper) || !isKey(body.by) || !Number.isInteger(body.k) || body.k < 1) throw bad('a malformed act');
  if (body.act === 'stroke') {
    const rec = lawOf(SURFACE_LAW).decodeCanonical(fromB64url(body.stroke));
    if (rec.strokes.length !== 1) throw bad('one stroke an act');
  }
  if (body.act === 'lift' && !int(body.lift, 1, 1e9)) throw bad('a lift names a stroke by its place');
  if (body.act === 'put' && ((body.space !== 'outside' && !isKey(body.space)) || !isPlace(body.at))) throw bad('a paper is let go in a space, at a place');
  if (body.act === 'post' && !isKey(body.to)) throw bad('a letter names its mailbox by its key');
  if (body.act === 'shelve' && !isBook(body.book)) throw bad('a book is named by its path');
  if (body.act === 'press' || body.act === 'break') checkWax(body);
  return body;
}

// The wax acts' fields, as the law's marks take them (v2/acts.js format 3).
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
  if (!birth || birth.v !== 3 || (birth.kind !== 'paper' && birth.kind !== 'surface') || !isSheetId(birth.paper) || !isKey(birth.key)) throw bad('not a paper');
  if (birth.kind === 'surface') {
    const S = SURFACES[birth.surface];
    const want = S && {
      v: 3,
      kind: 'surface',
      paper: birth.paper,
      key: birth.key,
      surface: birth.surface,
      family: { ...FAMILIES[S.matter], matter: S.matter },
      size: [...S.size],
      commit: birth.commit,
    };
    if (!S || jcs(want) !== jcs(birth)) throw bad('not a surface of a house as houses are made');
  } else {
    checkFamily(birth.family);
    if (!Array.isArray(birth.size) || birth.size.length !== 2 || !birth.size.every((v) => int(v, 1, MAX_COORD / 10))) throw bad('a paper is a rectangle');
    if (!isPlace(birth.at)) throw bad('a paper is born where it lies');
  }
  const pk = fromB64url(birth.key, 32);
  if (!isGoodPublicKey(pk)) throw bad('not a usable key');
  const D = paperDigest(birth);
  if (!verify(fromB64url(seal, 64), sealMsg(D), pk)) throw Object.assign(bad('the paper is not sealed by its owner'), { status: 401 });
  const seed = fromB64url(open?.seed, 64);
  if (!verifySeed(pk, birth.paper, seed) || !equalBytes(commitOf(seed), fromB64url(birth.commit, 32))) throw bad("the paper is not the owner's");
  if (!verify(fromB64url(open.by, 64), openMsg(D, birth.paper), pk)) throw Object.assign(bad('the paper is not opened by its owner'), { status: 401 });
  return { owner: birth.key, seed, family: birth.family, size: birth.size };
}

export const verifyActSeal = (act, seal) => verify(fromB64url(seal, 64), sealMsg(paperDigest(act)), fromB64url(act.by, 32));

// --- where it is, and who may do what: read from the chain ---

// Where a paper let go at `at` (mm) in `space` comes to rest: lying flat on the table under it (a
// house's), else on the floor; outside, on the ground. → [x, y, z] mm
export function restOf(space, at, { table, ground } = CTX) {
  const [x, y, z] = at.map((v) => v / 1000);
  if (space === 'outside') return [at[0], at[1], Math.round(ground(x, y) * 1000)];
  const over = x >= table.x0 && x <= table.x1 && y >= table.y0 && y <= table.y1 && z >= table.top - 1e-6;
  return [at[0], at[1], over ? Math.round(table.top * 1000) : 0];
}
// Whether a paper lying `where` rests on its house's table.
export const onTable = (where, { table } = CTX) => !!where?.space && !where.surface && where.space !== 'outside' && where.at[2] === Math.round(table.top * 1000);

// state: { owner, where: { space, at (mm, where it rests) } | { hand: key } | { box: key } | { book: [path] },
//   strokes: [{ n, by, lifted }], k: { [by]: last k }, seals: [{ n, for, broken }], lines, ctx }
export const startState = (birth, ctx = CTX) => ({
  owner: birth.key,
  where: birth.kind === 'surface' ? { space: birth.key, surface: birth.surface } : { space: birth.key, at: restOf(birth.key, birth.at, ctx) },
  strokes: [],
  k: {},
  seals: [],
  lines: [],
  ctx,
});

// May `by` mark it now: its owner; anyone a press names (not broken); the being whose house it lies in,
// while it rests on their table. Only where it lies.
export const mayMark = (state, by) =>
  !!state.where.space && (by === state.owner || state.seals.some((x) => x.for === by && !x.broken) || (state.where.space === by && onTable(state.where, state.ctx)));

// Would this act be allowed as the next one? → null, or why not.
export function refusal(state, act) {
  if ((state.k[act.by] ?? 0) >= act.k) return 'that act was stamped already';
  const w = state.where;
  if (w.surface && MOVES.includes(act.act)) return 'it is part of its house';
  if (act.act === 'take') {
    if (w.hand) return 'it is in a hand already';
    if (w.box && w.box !== act.by) return 'it is not in your mailbox';
    if (w.book && state.owner !== act.by) return 'it is in its owner’s book';
    return null;
  }
  if (act.act === 'put' || act.act === 'post') return w.hand === act.by ? null : 'it is not in your hand';
  if (act.act === 'shelve') return w.hand !== act.by ? 'it is not in your hand' : state.owner !== act.by ? 'only its owner saves it into their book' : null;
  if (act.act === 'press' || act.act === 'break') {
    if (act.by !== state.owner) return 'only its owner presses or breaks a seal';
    if (!w.space) return 'it is not lying anywhere';
    if (act.act === 'break' && !state.seals.some((x) => x.n === act.break.seal && !x.broken)) return 'there is no such seal to break';
    return null;
  }
  if (!mayMark(state, act.by)) return w.space ? 'you may not mark this paper' : 'it is not lying anywhere';
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
  if (act.act === 'take') next.where = { hand: act.by };
  if (act.act === 'put') next.where = { space: act.space, at: restOf(act.space, act.at, state.ctx) };
  if (act.act === 'post') [next.owner, next.where] = [act.to, { box: act.to }];
  if (act.act === 'shelve') next.where = { book: [...act.book] };
  if (act.act === 'stroke') next.strokes = [...state.strokes, { n, by: act.by, lifted: false }];
  if (act.act === 'lift') next.strokes = state.strokes.map((s) => (s.n === act.lift ? { ...s, lifted: true } : s));
  if (act.act === 'press') next.seals = [...state.seals, { n, for: act.press.for, broken: false }];
  if (act.act === 'break') next.seals = state.seals.map((x) => (x.n === act.break.seal ? { ...x, broken: true } : x));
  return next;
}

// Replay a whole chain of stamped lines: every place in order, every seal its writer's, every permission.
// → { state, problems }
export function replay(birth, lines, { seals = true, ctx = CTX } = {}) {
  let state = startState(birth, ctx);
  const problems = [];
  lines.forEach((line, i) => {
    try {
      if (line.n !== i + 1) throw bad(`place ${line.n} where ${i + 1} belongs`);
      checkPaperAct(line.act);
      if (line.act.paper !== birth.paper) throw bad('an act on another paper');
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

// --- the law: the record a paper's acts make ---

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
// → the PNKA record (law 3's format) of all its strokes and its wax.
const MARKED = new Set(['stroke', 'drip', 'press', 'break']);
export function compose(lines, drips = []) {
  const L = lawOf(SURFACE_LAW); // (reads every stroke a paper's or a surface's law takes)
  const lifted = new Set(lines.filter((l) => l.act.act === 'lift').map((l) => l.act.lift));
  const out = { orgX: 0, orgY: 0, strokes: [], marks: [] };
  let end = null; // where the last stroke ended, or the last mark landed (ms on the record's clock)
  let offset = null; // the paper's clock less the record's
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
        start = end; // overlapping: after the one before it (one paper, one order)
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
    // in the paper's own frame (tenths of a unit from its origin), at its moment
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

// The paper as its acts and the drips that landed on it have made it: facts on its owner's paper, and
// each press's impression (as it came out). → settled ({ facts, cells, box, seals, ... }) | null
export function growPaper(lines, { seed, family, scale = 64, drips = [], law = family?.matter ? SURFACE_LAW : PAPER_LAW }) {
  const L = lawOf(law);
  const rec = compose(lines, drips);
  if (!rec.strokes.length && !rec.marks) return null;
  const acts = L.encodeActs(rec);
  const res = L.grow(L.decodeCanonical(acts), { paperKey: paperKeyOf(seed), family, scale });
  const cells = L.settledCells(res.tiles);
  const box = L.boxOf(cells);
  return { acts, cells, box, seals: res.seals, cuts: res.cuts ?? null, facts: L.factsDigest({ cells, box, actsBytes: acts, family, scale, law }) };
}
