// Splatter (law 2): ink the pen throws. A fine spray when the nib snags the
// paper on a fast upstroke, drops flung on a fast sharp turn, a few around a
// hard fast landing, a fat drop from a nib dwelling at high flow. There is no
// randomness in the law, so the chance comes from the paper: the odds come
// from the moment, and the sheet's hash decides whether this act throws ink,
// how many drops, how big (mostly specks, rarely a big one) and where they land
// (along the motion, farther the faster; around the point for a landing).
// Pure integers, the same function for the fast sim and the reference: a drop
// is then an ordinary deposit of water and the pen's ink, and the existing
// rules bead, ring, sink, feather and dry it. Same strokes on the same paper,
// the same splatter; on another sheet's paper, different.

import { SPLAT_K, SPLAT_CAP, SPLAT_MIN_SEG, MAX_DROPS, DROP_R, DROP_W, DROP_REACH, SCALE_ONE } from './constants.js';
import { COSSIN_Q14 } from '../v1/tables.js';
import { floorDiv, clamp, isqrt } from '../v1/int.js';

export const TAG_SPLAT = 17; // does act (stroke, act) throw ink?
export const TAG_DROP = 18; // drop k of it: size, direction, distance
const NONE = Object.freeze([]);
const V_MAX = 65535; // speeds past this (25 cells a millisecond) count as this

const lengthOf = (dx, dy) => {
  const d2 = dx * dx + dy * dy;
  return d2 < 2 ** 36 ? isqrt(d2 * 65536) : isqrt(d2) * 256;
};

// cos, sin (Q14) of a whole number of degrees, any sign.
function cs(deg) {
  let d = ((deg % 360) + 360) % 360;
  let sign = 1;
  if (d >= 180) {
    d -= 180;
    sign = -1;
  }
  return [sign * COSSIN_Q14[2 * d], sign * COSSIN_Q14[2 * d + 1]];
}

// How likely act i of stroke si is to throw ink (out of 65536), and what drives it.
//   (x0, y0) → (x1, y1)  the act's move, half-tenths (scaled, sheet frame); (pdx, pdy) the move before it
//   dt ms, p pressure (1..255), flow 0..15, spatter 0..15, tooth: the paper's height at the nib (0..120)
export function splatOdds({ x0, y0, x1, y1, pdx, pdy, dt, p, flow, spatter, tooth, i }) {
  if (!spatter || !flow) return { P: 0, score: 0 };
  const dx = x1 - x0,
    dy = y1 - y0;
  const L = lengthOf(dx, dy);
  const V = Math.min(V_MAX, floorDiv(L, dt));
  let sharp = 0; // 0 straight on .. 512 turned right back
  if (L >= SPLAT_MIN_SEG) {
    const Lp = lengthOf(pdx, pdy);
    if (Lp >= SPLAT_MIN_SEG) {
      const mag = Math.max(1, floorDiv(L, 256) * floorDiv(Lp, 256));
      sharp = 256 - clamp(floorDiv(256 * (dx * pdx + dy * pdy), mag), -256, 256);
    }
  }
  const snag = dy < 0 ? floorDiv(floorDiv(V * V, 1024) * tooth, 64) : 0; // a fast upstroke catching the paper's tooth
  const flick = floorDiv(V * sharp, 128); // a fast sharp turn
  const impact = i === 1 ? floorDiv(V * flow * (64 + p), 2048) : 0; // a fast, loaded landing
  const overload = L < SPLAT_MIN_SEG ? floorDiv(flow * flow * Math.min(dt, 1000), 16) : 0; // dwelling with a full nib
  const score = snag + flick + impact + overload;
  const P = Math.min(SPLAT_CAP, floorDiv(score * spatter * SPLAT_K, 256));
  const top = Math.max(snag, flick, impact, overload);
  const mode = overload === top ? 'fat' : impact === top || L < SPLAT_MIN_SEG ? 'around' : 'along';
  return { P, score, V, L, dx, dy, mode };
}

// The drops act i of stroke si throws, if the paper says it does: [[x, y, r, amt]]
// (half-tenths; r and the water already scaled). H is the sheet's paper hash, h a [0, 0] scratch.
export function splatter(H, h, a) {
  const o = splatOdds(a);
  if (!o.P) return NONE;
  H(TAG_SPLAT, a.si, a.i, h);
  if ((h[0] >>> 0) % 65536 >= o.P) return NONE;
  const extra = Math.min(MAX_DROPS - 1, floorDiv(o.score, 640));
  const n = 1 + (Math.floor((h[0] >>> 0) / 65536) % (extra + 1));
  const ux = o.L ? floorDiv(o.dx * 4194304, o.L) : 0; // the motion's direction, Q14
  const uy = o.L ? floorDiv(o.dy * 4194304, o.L) : 0;
  const drops = [];
  for (let k = 0; k < n; k++) {
    H(TAG_DROP, a.si * 131072 + a.i, k, h);
    const u = h[0] >>> 0;
    const v = h[1] >>> 0;
    let cls = 0;
    while (cls < 4 && Math.floor(u / 2 ** cls) % 2 === 1) cls++; // 1/2 specks, 1/4, 1/8, 1/16, 1/16 big
    if (o.mode === 'fat') cls = Math.max(cls, 3);
    let ox, oy, d;
    if (o.mode === 'along') {
      const [c, s] = cs((Math.floor(u / 256) % 81) - 40);
      ox = floorDiv(ux * c - uy * s, 16384);
      oy = floorDiv(ux * s + uy * c, 16384);
      d = Math.min(DROP_REACH, 10 + floorDiv(o.V * (16 + (v % 64)), 512));
    } else {
      [ox, oy] = cs(Math.floor(u / 256) % 360);
      d = o.mode === 'fat' ? v % 8 : Math.min(DROP_REACH, 6 + (v % 32) + floorDiv(o.V * (Math.floor(v / 32) % 16), 1024));
    }
    d = floorDiv(d * a.scale, SCALE_ONE);
    drops.push([
      a.x1 + floorDiv(ox * d, 16384),
      a.y1 + floorDiv(oy * d, 16384),
      Math.max(1, floorDiv(DROP_R[cls] * a.scale, SCALE_ONE)),
      floorDiv(DROP_W[cls] * a.scale * a.scale, SCALE_ONE * SCALE_ONE),
    ]);
  }
  return drops;
}
