// PNKA for law 2: law 1's format (v1/acts.js) and one more pen field, the
// pen's spatter (how readily it throws ink: splatter, sim.js). Format byte 1 is
// exactly law 1's PNKA; format 2 is used only when some pen act sets spatter,
// so writing without it encodes byte for byte as before. These bytes are what
// gets sealed, so there is exactly one encoding of any record: minimal LEB128
// varints, zigzag deltas, fixed field order, the lowest format that holds it.
// A record is valid only if decoding and re-encoding it gives back the same bytes.
//
//   'PNKA' | u8 1|2 | varint orgX | varint orgY | varint nStrokes
//   per stroke: varint gap | u8 flags | varint nActs | varint nPen
//     nPen × pen act: varint atAct | u8 mask | fields in bit order
//        b0 nib u8 | b1 size varint | b2 flex varint | b3 flow u8 | b4 r,g,b u8×3 | b5 angle u8
//        b6 spatter u8 (format 2 only; 0..SPATTER_MAX, absent = 0)
//     act 0: varint x | varint y | [u8 p]
//     act i: zz dx | zz dy | varint dt | [zz dp]
//
// Format 3 (law 3 only: rooms.md §3b, §3c): one more pen field and the marks.
//        b7 well u8 (1..WELL_MAX): the pen was dipped here, its reservoir full
//   after the strokes: varint nMarks, per mark (in time order, on the record's clock):
//     u8 kind | varint dt (ms after the mark before; the first from 0) | varint x | varint y
//     1 drip:  varint amt | u8 heat                         wax landing, liquid as heat
//     2 press: u8 depth | u8 angle | u8 zz tiltX | u8 zz tiltY | u8 cell | u8 w | u8 h | w×h u8 relief
//     3 break: varint x1 | varint y1                        a crack from (x, y) to (x1, y1)
//   A format-3 record may have no strokes (wax alone), but then has marks; its first
//   stroke's gap is when it starts on the record's clock (wax may land before it).
//
// Format 4 (law 4 only: one-matter.md Phase 6): format 3 and one more mark.
//     4 pour:  varint amt                                   water landing (drops), poured from a vessel
//
// flags: bit0 hasP (a real pressure reading per act), bits1-2 kind (0 mouse,
// 1 touch, 2 pen, 3 other), bit3 synthetic p (computed by the nib model).
// x, y in tenths of an ink unit relative to (orgX, orgY) whole units; t in ms.
// A pen act at atAct = i sets the pen from act i on (for the segment i → i+1).
// The first stroke's first act carries a full pen act (mask 0x3f, or 0x7f with spatter).

import { MAX_STROKES, MAX_ACTS, MAX_DURATION, MAX_GAP, MAX_DT, MAX_ORG, MAX_COORD, MAX_SIZE, MIN_SIZE, MAX_FLEX, MAX_PATH_WORK, STEP_HT, BROAD_T_HT, NIB_BROAD, SCALE_ONE } from '../v1/constants.js';
import { LawError, ceilDiv } from '../v1/int.js';
import { MAX_DROPS, DROP_R_MAX, WELL_MAX, MAX_MARKS, WAX_DRIP_MAX, FACE_MAX, FACE_CELL_MAX } from './constants.js';

const MAGIC = [0x50, 0x4e, 0x4b, 0x41]; // 'PNKA'
export const PEN_FULL = 0x3f;
export const PEN_KEYS = ['nib', 'size', 'flex', 'flow', 'rgb', 'angle', 'spatter', 'well'];
export const SPATTER_MAX = 15;
const SPATTER = 0x40;
const WELL = 0x80;
export const MARK_KINDS = ['drip', 'press', 'break', 'pour'];
export const POUR_MAX = 1 << 20; // drops a pour mark lands at most (more is several marks)
const bad = (msg) => new LawError('acts', msg);

const zz = (n) => (n >= 0 ? 2 * n : -2 * n - 1);
const unzz = (v) => (v % 2 === 0 ? v / 2 : -(v + 1) / 2);

class Writer {
  constructor() {
    this.buf = new Uint8Array(1024);
    this.n = 0;
  }
  byte(b) {
    if (this.n === this.buf.length) {
      const next = new Uint8Array(this.buf.length * 2);
      next.set(this.buf);
      this.buf = next;
    }
    this.buf[this.n++] = b;
  }
  varint(v) {
    if (!Number.isSafeInteger(v) || v < 0) throw bad(`not a varint: ${v}`);
    while (v >= 128) {
      this.byte((v % 128) + 128);
      v = Math.floor(v / 128);
    }
    this.byte(v);
  }
  bytes() {
    return this.buf.slice(0, this.n);
  }
}

class Reader {
  constructor(bytes) {
    this.b = bytes;
    this.o = 0;
  }
  byte() {
    if (this.o >= this.b.length) throw bad('truncated');
    return this.b[this.o++];
  }
  varint() {
    let v = 0;
    let mul = 1;
    for (let i = 0; i < 8; i++) {
      const b = this.byte();
      v += (b & 127) * mul;
      if (b < 128) return v;
      mul *= 128;
    }
    throw bad('varint too long');
  }
}

// --- encode ---

// rec: { orgX, orgY, strokes: [{ gap, hasP, kind, synthP, x[], y[], t[] (ms, absolute), p[] | null, pens: [pen] }] }
// pen: { at, mask?, nib, size, flex, flow, rgb: [r,g,b], angle }  (mask defaults to the fields present)
export function encodeActs(rec) {
  const w = new Writer();
  for (const b of MAGIC) w.byte(b);
  const masks = rec.strokes.flatMap((s) => s.pens.map((pen) => pen.mask ?? penMask(pen)));
  const format = rec.marks?.some((m) => m.kind === 'pour') ? 4 : rec.marks?.length || !rec.strokes.length || masks.some((m) => m & WELL) ? 3 : masks.some((m) => m & SPATTER) ? 2 : 1;
  w.byte(format);
  w.varint(rec.orgX);
  w.varint(rec.orgY);
  w.varint(rec.strokes.length);
  let prevEnd = 0;
  rec.strokes.forEach((s, si) => {
    const n = s.x.length;
    const gap = si === 0 ? (format === 3 ? s.t[0] : 0) : s.t[0] - prevEnd; // (format 3: wax may come first)
    w.varint(gap);
    w.byte((s.hasP ? 1 : 0) | ((s.kind & 3) << 1) | (s.synthP ? 8 : 0));
    w.varint(n);
    w.varint(s.pens.length);
    for (const pen of s.pens) {
      const mask = pen.mask ?? penMask(pen);
      w.varint(pen.at);
      w.byte(mask);
      if (mask & 1) w.byte(pen.nib);
      if (mask & 2) w.varint(pen.size);
      if (mask & 4) w.varint(pen.flex);
      if (mask & 8) w.byte(pen.flow);
      if (mask & 16) for (const c of pen.rgb) w.byte(c);
      if (mask & 32) w.byte(pen.angle);
      if (mask & SPATTER) w.byte(pen.spatter);
      if (mask & WELL) w.byte(pen.well);
    }
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        w.varint(s.x[0]);
        w.varint(s.y[0]);
        if (s.hasP) w.byte(s.p[0]);
      } else {
        w.varint(zz(s.x[i] - s.x[i - 1]));
        w.varint(zz(s.y[i] - s.y[i - 1]));
        w.varint(s.t[i] - s.t[i - 1]);
        if (s.hasP) w.varint(zz(s.p[i] - s.p[i - 1]));
      }
    }
    prevEnd = s.t[n - 1];
  });
  if (format >= 3) {
    const marks = rec.marks ?? [];
    w.varint(marks.length);
    let prevT = 0;
    for (const m of marks) {
      w.byte(MARK_KINDS.indexOf(m.kind) + 1);
      w.varint(m.t - prevT);
      prevT = m.t;
      w.varint(m.x);
      w.varint(m.y);
      if (m.kind === 'drip') {
        w.varint(m.amt);
        w.byte(m.heat);
      } else if (m.kind === 'press') {
        for (const v of [m.depth, m.angle, zz(m.tiltX), zz(m.tiltY), m.cell, m.w, m.h]) w.byte(v);
        for (const v of m.face) w.byte(v);
      } else if (m.kind === 'pour') {
        w.varint(m.amt);
      } else {
        w.varint(m.x1);
        w.varint(m.y1);
      }
    }
  }
  const bytes = w.bytes();
  decodeActs(bytes, { maxFormat: format }); // never hand out bytes that do not decode
  return bytes;
}

function penMask(pen) {
  return (
    (pen.nib !== undefined ? 1 : 0) |
    (pen.size !== undefined ? 2 : 0) |
    (pen.flex !== undefined ? 4 : 0) |
    (pen.flow !== undefined ? 8 : 0) |
    (pen.rgb !== undefined ? 16 : 0) |
    (pen.angle !== undefined ? 32 : 0) |
    (pen.spatter !== undefined ? SPATTER : 0) |
    (pen.well !== undefined ? WELL : 0)
  );
}

// --- decode (validates every canonical rule) ---

// maxFormat: the highest format the reader's law takes (2 for law 2, 3 for law 3, 4 for law 4).
export function decodeActs(bytes, { maxFormat = 2 } = {}) {
  if (!(bytes instanceof Uint8Array)) throw bad('acts are bytes');
  const r = new Reader(bytes);
  for (const b of MAGIC) if (r.byte() !== b) throw bad('not PNKA');
  const format = r.byte();
  if (format < 1 || format > Math.min(4, maxFormat)) throw bad('unknown PNKA format');
  const reserved = format === 1 ? 0xc0 : format === 2 ? 0x80 : 0;
  const orgX = r.varint();
  const orgY = r.varint();
  if (orgX > MAX_ORG || orgY > MAX_ORG) throw bad('origin out of range');
  const nStrokes = r.varint();
  if (nStrokes < (format >= 3 ? 0 : 1) || nStrokes > MAX_STROKES) throw bad('stroke count out of range');
  const strokes = [];
  let total = 0;
  let clock = 0;
  for (let si = 0; si < nStrokes; si++) {
    const gap = r.varint();
    // (format 3: wax lands between strokes, each pause between acts at most MAX_GAP, so strokes may be further apart)
    if (si === 0 ? gap !== 0 && (format < 3 || gap > MAX_DURATION) : gap > (format === 3 ? MAX_DURATION : MAX_GAP)) throw bad('gap out of range');
    const flags = r.byte();
    if (flags & 0xf0) throw bad('reserved flag bits set');
    const hasP = (flags & 1) === 1;
    const n = r.varint();
    total += n;
    if (n < 1 || total > MAX_ACTS) throw bad('act count out of range');
    const nPen = r.varint();
    if (nPen > n) throw bad('more pen acts than acts');
    const pens = [];
    let lastAt = -1;
    for (let k = 0; k < nPen; k++) {
      const at = r.varint();
      if (at <= lastAt || at >= n) throw bad('pen acts out of order');
      lastAt = at;
      const mask = r.byte();
      if (mask === 0 || mask & reserved) throw bad('bad pen mask');
      const pen = { at, mask };
      if (mask & 1) {
        pen.nib = r.byte();
        if (pen.nib > 2) throw bad('unknown nib');
      }
      if (mask & 2) {
        pen.size = r.varint();
        if (pen.size < MIN_SIZE || pen.size > MAX_SIZE) throw bad('nib size out of range');
      }
      if (mask & 4) {
        pen.flex = r.varint();
        if (pen.flex > MAX_FLEX) throw bad('flex out of range');
      }
      if (mask & 8) {
        pen.flow = r.byte();
        if (pen.flow > 15) throw bad('flow out of range');
      }
      if (mask & 16) pen.rgb = [r.byte(), r.byte(), r.byte()];
      if (mask & 32) {
        pen.angle = r.byte();
        if (pen.angle > 179) throw bad('angle out of range');
      }
      if (mask & SPATTER) {
        pen.spatter = r.byte();
        if (pen.spatter > SPATTER_MAX) throw bad('spatter out of range');
      }
      if (mask & WELL) {
        pen.well = r.byte();
        if (pen.well < 1 || pen.well > WELL_MAX) throw bad('well out of range');
      }
      pens.push(pen);
    }
    if (si === 0 && (!pens.length || pens[0].at !== 0 || (pens[0].mask & PEN_FULL) !== PEN_FULL)) {
      throw bad('the first act needs a full pen');
    }
    const x = new Int32Array(n);
    const y = new Int32Array(n);
    const t = new Float64Array(n);
    const p = hasP ? new Uint8Array(n) : null;
    clock += gap;
    for (let i = 0; i < n; i++) {
      let xi, yi, pi;
      if (i === 0) {
        xi = r.varint();
        yi = r.varint();
        if (hasP) pi = r.byte();
      } else {
        xi = x[i - 1] + unzz(r.varint());
        yi = y[i - 1] + unzz(r.varint());
        const dt = r.varint();
        if (dt < 1 || dt > MAX_DT) throw bad('dt out of range');
        clock += dt;
        if (hasP) pi = p[i - 1] + unzz(r.varint());
      }
      if (xi < 0 || yi < 0 || xi > MAX_COORD || yi > MAX_COORD) throw bad('point out of range');
      if (hasP && (pi < 1 || pi > 255)) throw bad('pressure out of range');
      x[i] = xi;
      y[i] = yi;
      t[i] = clock;
      if (hasP) p[i] = pi;
    }
    if (clock > MAX_DURATION) throw bad('too long');
    strokes.push({ gap, hasP, kind: (flags >>> 1) & 3, synthP: (flags & 8) === 8, x, y, t, p, pens });
  }
  const marks = format >= 3 ? readMarks(r, format) : undefined;
  if (format === 3 && !nStrokes && !marks.length) throw bad('nothing in it');
  if (r.o !== bytes.length) throw bad('trailing bytes');
  return { orgX, orgY, strokes, acts: total, duration: clock, format, ...(marks ? { marks } : {}) };
}

function readMarks(r, format) {
  const n = r.varint();
  if (n > MAX_MARKS) throw bad('too many marks');
  const marks = [];
  let t = 0;
  const coord = () => {
    const v = r.varint();
    if (v > MAX_COORD) throw bad('point out of range');
    return v;
  };
  for (let k = 0; k < n; k++) {
    const kind = MARK_KINDS[r.byte() - 1];
    if (!kind || (kind === 'pour' && format < 4)) throw bad('unknown mark');
    t += r.varint();
    if (t > MAX_DURATION) throw bad('too long');
    const m = { kind, t, x: coord(), y: coord() };
    if (kind === 'drip') {
      m.amt = r.varint();
      m.heat = r.byte();
      if (m.amt < 1 || m.amt > WAX_DRIP_MAX) throw bad('drip out of range');
    } else if (kind === 'pour') {
      m.amt = r.varint();
      if (m.amt < 1 || m.amt > POUR_MAX) throw bad('pour out of range');
    } else if (kind === 'press') {
      m.depth = r.byte();
      m.angle = r.byte();
      m.tiltX = unzz(r.byte());
      m.tiltY = unzz(r.byte());
      m.cell = r.byte();
      m.w = r.byte();
      m.h = r.byte();
      if (m.depth < 1 || m.angle > 179 || Math.abs(m.tiltX) > 127 || Math.abs(m.tiltY) > 127) throw bad('press out of range');
      if (m.cell < 1 || m.cell > FACE_CELL_MAX || m.w < 1 || m.h < 1 || m.w > FACE_MAX || m.h > FACE_MAX) throw bad('face out of range');
      m.face = new Uint8Array(m.w * m.h);
      for (let i = 0; i < m.face.length; i++) m.face[i] = r.byte();
    } else {
      m.x1 = coord();
      m.y1 = coord();
    }
    marks.push(m);
  }
  return marks;
}

// Decode and insist the bytes are the canonical encoding of what they hold.
export function decodeCanonical(bytes, opts) {
  const rec = decodeActs(bytes, opts);
  const again = encodeActs(rec);
  if (again.length !== bytes.length || again.some((b, i) => b !== bytes[i])) throw bad('not canonical');
  return rec;
}

// The pen state in force for each stroke's segments: walks the pen acts in
// order. Returns per stroke an array of [atAct, pen] snapshots.
export function penTimeline(rec) {
  let pen = null;
  return rec.strokes.map((s) => {
    const before = pen; // the pen carried over from the previous stroke
    const out = [];
    for (const a of s.pens) {
      pen = { ...(pen ?? {}) };
      for (const k of PEN_KEYS) if (a[k] !== undefined) pen[k] = a[k];
      out.push([a.at, pen]);
    }
    if (!out.length || out[0][0] !== 0) out.unshift([0, before]);
    return out;
  });
}

// A cheap upper bound on the deposit work, checked before simulating:
// Σ over segments of (stamps × footprint cells). Exceeding it is INVALID.
export function precheck(rec, scale = SCALE_ONE) {
  const timeline = penTimeline(rec);
  let work = 0;
  const drop = (2 * ceilDiv(ceilDiv(DROP_R_MAX * scale, SCALE_ONE) + 10, 10) + 2) ** 2; // cells of the largest drop
  rec.strokes.forEach((s, si) => {
    const pens = timeline[si];
    let k = 0;
    for (let i = 1; i < s.x.length; i++) {
      while (k + 1 < pens.length && pens[k + 1][0] <= i - 1) k++;
      const pen = pens[k][1];
      const widest = pen.size + (pen.nib === 1 ? pen.flex : 0);
      const r = ceilDiv(Math.max(widest, pen.nib === NIB_BROAD ? BROAD_T_HT / 2 : 0) * scale, SCALE_ONE) + 10; // ht, generous
      const cells = (2 * ceilDiv(r, 10) + 2) ** 2;
      const len = ((Math.abs(s.x[i] - s.x[i - 1]) + Math.abs(s.y[i] - s.y[i - 1])) * 2 * scale) / SCALE_ONE;
      const stamps = ceilDiv(len, STEP_HT) + ceilDiv(s.t[i] - s.t[i - 1], 10) + 1;
      work += stamps * cells + (pen.spatter ? MAX_DROPS * drop : 0);
    }
  });
  if (work > MAX_PATH_WORK) throw new LawError('cost', 'this writing is too heavy to simulate');
  return work;
}
