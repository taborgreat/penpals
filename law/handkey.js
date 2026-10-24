// The hand as a key opener: readings (v1/hand.js) → bits → fuzzy commitments
// (fuzzy.js) holding r. Runs on the writer's device; the server only ever
// stores sketches: { id, kind, code, hand, offsets, helper }.
//
//   kind     "phrase" (the secret login phrase, tight) or "page" (the calibration page, wide)
//   offsets  per feature, shift that puts the enrolled reading in the middle of
//            its bins (so small wobble stays in the same bin)
//   helper   encode(r ‖ 0…) ⊕ w, w the enrolled bits

import { readHand, handBits, log2x8, ZONE_SPEC, GLOBAL_SPEC, ZONE_FEATURES, GLOBAL_FEATURES, PHRASE_LAYOUT, PAGE_LAYOUT, HAND_VERSION } from './v1/hand.js';
import { commit, recover, code, rBits, packBits, unpackBits } from './fuzzy.js';
import { floorDiv } from './v1/int.js';
import { b64url, fromB64url } from './tags.js';

export const KINDS = ['phrase', 'page'];
export const layoutOf = (kind) => (kind === 'phrase' ? PHRASE_LAYOUT : PAGE_LAYOUT);
export const readingOf = (kind, actsBytes) => readHand(actsBytes, layoutOf(kind));

function specsFor(kind) {
  const { bands, zones } = layoutOf(kind);
  const z = ZONE_FEATURES.map((f) => ZONE_SPEC[f]);
  const out = [];
  for (let i = 0; i < bands * zones; i++) out.push(...z);
  out.push(...GLOBAL_FEATURES.map((f) => GLOBAL_SPEC[f]));
  return out;
}
const valuesOf = (reading) => [...reading.zone, ...reading.global];
const mapped = (v, [kind]) => (kind === 'log' ? log2x8(Math.max(0, v)) : v);

// Shift each feature so the mean of these readings sits mid-bin.
export function centreOffsets(kind, readings) {
  const specs = specsFor(kind);
  const vals = readings.map(valuesOf);
  return specs.map((spec, i) => {
    const m = floorDiv(
      vals.reduce((s, v) => s + mapped(v[i], spec), 0),
      vals.length,
    );
    const step = spec[2];
    return floorDiv(step, 2) - ((((m - spec[1]) % step) + step) % step);
  });
}

export const bitsOf = (reading, offsets) => handBits(reading, { offsets });

const distance = (a, b) => a.reduce((d, v, i) => d + (v !== b[i] ? 1 : 0), 0);

// Enrol from one or more readings: centre on them, then take each bit's majority.
export function enroll(kind, readings) {
  const offsets = centreOffsets(kind, readings);
  const bitsList = readings.map((r) => bitsOf(r, offsets));
  const n = bitsList[0].length;
  const w = new Uint8Array(n);
  for (let i = 0; i < n; i++) w[i] = bitsList.reduce((s, b) => s + b[i], 0) * 2 > bitsList.length ? 1 : 0;
  let spread = 0;
  for (const b of bitsList) spread = Math.max(spread, distance(b, w));
  return { w, offsets, spread, radius: code(kind).t };
}

export const newR = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(Math.ceil(rBits() / 8)));
  return unpackBits(bytes, rBits());
};
const newId = () => b64url(globalThis.crypto.getRandomValues(new Uint8Array(9)));

export function makeSketch(kind, r, readings) {
  const { w, offsets } = enroll(kind, readings);
  return { id: newId(), kind, code: code(kind).id, hand: HAND_VERSION, offsets, helper: b64url(packBits(commit(kind, r, w))) };
}

// r from a sketch and a fresh reading of the same kind, or null.
export function recoverR(sketch, reading) {
  if (sketch.hand !== HAND_VERSION || sketch.code !== code(sketch.kind).id) return null; // made under another setting
  const c = code(sketch.kind);
  const helper = unpackBits(fromB64url(sketch.helper), c.n);
  return recover(sketch.kind, helper, bitsOf(reading, sketch.offsets));
}

// Every distinct r the sketches give for this reading (usually one or none).
export function candidates(sketches, readings) {
  const out = [];
  const seen = new Set();
  for (const s of sketches) {
    const reading = readings[s.kind];
    if (!reading) continue;
    const r = recoverR(s, reading);
    if (!r) continue;
    const key = r.join('');
    if (seen.has(key)) {
      out.find((c) => c.key === key).sketches.push(s.id);
      continue;
    }
    seen.add(key);
    out.push({ key, r, sketches: [s.id] });
  }
  return out;
}

// After a successful unlock: the same sketch, re-made from this reading
// (continuity: the hand that opens the account is the hand as it is now).
export const refreshSketch = (sketch, r, reading) => ({ ...makeSketch(sketch.kind, r, [reading]), id: sketch.id });

export function checkSketch(s) {
  const ok =
    s &&
    typeof s.id === 'string' &&
    /^[A-Za-z0-9_-]{12}$/.test(s.id) &&
    KINDS.includes(s.kind) &&
    s.code === code(s.kind).id &&
    Number.isInteger(s.hand) &&
    Array.isArray(s.offsets) &&
    s.offsets.length === specsFor(s.kind).length &&
    s.offsets.every((o) => Number.isInteger(o) && Math.abs(o) <= 4096) &&
    typeof s.helper === 'string' &&
    fromB64url(s.helper).length === Math.ceil(code(s.kind).n / 8);
  if (!ok) throw new Error('bad sketch');
  return { id: s.id, kind: s.kind, code: s.code, hand: s.hand, offsets: s.offsets.slice(), helper: s.helper };
}
