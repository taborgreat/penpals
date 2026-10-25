// A string (outside.md §1.1, §1.2): matter with little stiffness and great
// strength along its length, a chain of short pieces, each falling and each held
// by its neighbours at a fixed reach. Nothing here knows "pendulum": a weight on a
// string falls, the string will not let it fall straight, so it falls sideways,
// overshoots and falls back, the motion bleeding off into the air as heat, until
// it rests at the bottom. Pulled harder than its strength, it snaps, and the
// weight falls free.
//
// Integer and deterministic: positions in µm, a step of STEP_MS, the same on every
// machine. What lasts is a fact (where the weight comes to rest, whether the
// string snapped, and when); the swing in between is scene (others see it glide
// between coarse acts, as the head: rooms.md §4).

import { isqrt, floorDiv, ceilDiv } from './v1/int.js';
import { matterOf } from './matter.js';

export const STEP_MS = 4;
export const FALL = 157; // µm a step² falls: 9.81 m/s² × (4 ms)²
export const AIR = 24; // /65536 of its speed a piece gives the air each step (Tabor's to set: a 30 cm swing dies down in about 20 s)
export const HOLD = 12; // times a step the pieces are held to their reach
export const AREA = 1; // mm²: the string's cross-section (Tabor's to set: a thread)
// what the air takes of a speed: its share rounded up, the same both ways (rounded down, a slow
// sway would keep the share at nothing and never die down); never more than the speed itself
const cut = (v, q) => (v >= 0 ? ceilDiv(v * q, 65536) : -ceilDiv(-v * q, 65536));
// a / b toward zero: the same either way (rounding down would pull one side harder than its mirror)
const div = (a, b) => (a >= 0 ? floorDiv(a, b) : -floorDiv(-a, b));

// A weight hung on a string from `anchor` (held fast) and let go at `start` (µm,
// z up). pieces: how many; matter: the string's; weight: grams; steps: how long it
// runs (it stops early once it has come to rest). every: one scene sample in so many steps.
// → { rest: [x, y, z] (µm), snapped: bool, snappedAt: step | null, steps, path: [[x, y, z], ...] }
export function hang({ anchor, start, pieces = 12, matter = 'fiber', weight = 200, steps = 30000, every = 25 }) {
  const strengthMn = matterOf(matter).strength * AREA * 1000; // mN the string bears
  const n = pieces;
  const along = start.map((v, k) => v - anchor[k]);
  const len = isqrt(along.reduce((s, v) => s + v * v, 0));
  const reach = floorDiv(len, n);
  // the pieces' masses (mg): the string's own (its matter's density, its section, its length), the weight at the end
  const pieceMg = Math.max(1, floorDiv(matterOf(matter).density * AREA * reach, 1e6)); // kg/m³ · mm² · µm → mg
  const mass = [0, ...Array.from({ length: n }, (_, i) => (i === n - 1 ? weight * 1000 : pieceMg))]; // (0: the anchor, held)
  const p = Array.from({ length: n + 1 }, (_, i) => anchor.map((v, k) => v + div(along[k] * i, n)));
  const prev = p.map((q) => [...q]);
  const path = [];
  let snapped = false,
    snappedAt = null,
    still = 0,
    s = 0;
  for (; s < steps; s++) {
    // each piece goes on as it was going, less what the air takes, and falls
    for (let i = 1; i <= n; i++) {
      const q = p[i],
        o = prev[i];
      for (let k = 0; k < 3; k++) {
        const v = q[k] - o[k];
        o[k] = q[k];
        q[k] += v - cut(v, AIR) - (k === 2 ? FALL : 0);
      }
    }
    // held: no piece farther from its neighbour than the reach (a string pulls, it does not push)
    let pull = 0;
    for (let h = 0; h < HOLD; h++) {
      for (let i = 0; i < (snapped ? n - 1 : n); i++) {
        const a = p[i],
          b = p[i + 1];
        const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const l = isqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
        if (l <= reach || l === 0) continue;
        const over = l - reach;
        const ma = mass[i],
          mb = mass[i + 1];
        // each gives way as the other outweighs it (the anchor never does)
        const sa = ma === 0 ? 0 : floorDiv(over * mb, ma + mb),
          sb = ma === 0 ? over : over - sa;
        for (let k = 0; k < 3; k++) {
          a[k] += div(d[k] * sa, l);
          b[k] -= div(d[k] * sb, l);
        }
      }
      // and no piece farther from the anchor than its length of string (held there straight
      // from the anchor: a light piece cannot hold a heavy weight up by itself)
      for (let i = 1; i <= (snapped ? n - 1 : n); i++) {
        const q = p[i];
        const d = [q[0] - anchor[0], q[1] - anchor[1], q[2] - anchor[2]];
        const l = isqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
        const most = i * reach;
        if (l <= most) continue;
        for (let k = 0; k < 3; k++) q[k] -= div(d[k] * (l - most), l);
        if (i === n) pull += l - most;
      }
    }
    // the pull on the weight, as force: what holding it back took, over the step
    const pullMn = floorDiv(mass[n] * pull, 1000 * STEP_MS * STEP_MS);
    if (!snapped && pullMn > strengthMn) {
      snapped = true;
      snappedAt = s;
    }
    if (s % every === 0) path.push([...p[n]]);
    // come to rest: the weight has hardly moved for a while
    const moved = Math.abs(p[n][0] - prev[n][0]) + Math.abs(p[n][1] - prev[n][1]) + Math.abs(p[n][2] - prev[n][2]);
    still = moved <= 2 && !snapped ? still + 1 : 0;
    if (still >= 250) break;
  }
  return { rest: [...p[n]], snapped, snappedAt, steps: s, reach, path };
}
