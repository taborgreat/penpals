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
// flags: bit0 hasP (a real pressure reading per act), bits1-2 kind (0 mouse,
// 1 touch, 2 pen, 3 other), bit3 synthetic p (computed by the nib model).
// x, y in tenths of an ink unit relative to (orgX, orgY) whole units; t in ms.
// A pen act at atAct = i sets the pen from act i on (for the segment i → i+1).
// The first stroke's first act carries a full pen act (mask 0x3f, or 0x7f with spatter).

import { MAX_STROKES, MAX_ACTS, MAX_DURATION, MAX_GAP, MAX_DT, MAX_ORG, MAX_COORD, MAX_SIZE, MIN_SIZE, MAX_FLEX, MAX_PATH_WORK, STEP_HT, BROAD_T_HT, NIB_BROAD, SCALE_ONE } from '../v1/constants.js';
import { LawError, ceilDiv } from '../v1/int.js';
import { MAX_DROPS, DROP_R_MAX } from './constants.js';

const MAGIC = [0x50, 0x4e, 0x4b, 0x41]; // 'PNKA'
export const PEN_FULL = 0x3f;
export const PEN_KEYS = ['nib', 'size', 'flex', 'flow', 'rgb', 'angle', 'spatter'];
export const SPATTER_MAX = 15;
const SPATTER = 0x40;
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
  w.byte(rec.strokes.some((s) => s.pens.some((pen) => (pen.mask ?? penMask(pen)) & SPATTER)) ? 2 : 1);
  w.varint(rec.orgX);
  w.varint(rec.orgY);
  w.varint(rec.strokes.length);
  let prevEnd = 0;
  rec.strokes.forEach((s, si) => {
    const n = s.x.length;
    const gap = si === 0 ? 0 : s.t[0] - prevEnd;
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
  const bytes = w.bytes();
  decodeActs(bytes); // never hand out bytes that do not decode
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
    (pen.spatter !== undefined ? SPATTER : 0)
  );
}

// --- decode (validates every canonical rule) ---

export function decodeActs(bytes) {
  if (!(bytes instanceof Uint8Array)) throw bad('acts are bytes');
  const r = new Reader(bytes);
  for (const b of MAGIC) if (r.byte() !== b) throw bad('not PNKA');
  const format = r.byte();
  if (format !== 1 && format !== 2) throw bad('unknown PNKA format');
  const reserved = format === 1 ? 0xc0 : 0x80;
  const orgX = r.varint();
  const orgY = r.varint();
  if (orgX > MAX_ORG || orgY > MAX_ORG) throw bad('origin out of range');
  const nStrokes = r.varint();
  if (nStrokes < 1 || nStrokes > MAX_STROKES) throw bad('stroke count out of range');
  const strokes = [];
  let total = 0;
  let clock = 0;
  for (let si = 0; si < nStrokes; si++) {
    const gap = r.varint();
    if (si === 0 ? gap !== 0 : gap > MAX_GAP) throw bad('gap out of range');
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
  if (r.o !== bytes.length) throw bad('trailing bytes');
  return { orgX, orgY, strokes, acts: total, duration: clock, format };
}

// Decode and insist the bytes are the canonical encoding of what they hold.
export function decodeCanonical(bytes) {
  const rec = decodeActs(bytes);
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
