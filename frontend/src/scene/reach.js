// What a hand reaches for outside (outside.md Phase 5): the nearest thing the pointer's ray meets, out
// of the outside as it is drawn (scene/outside.js outsideNear), within an arm's reach of the head (the
// eye's ray, scene/worldRay.js, the same tests with no arm's limit).
//   reachOutside(spec, origin, dir, ground, { reach }) → { kind: 'stone' | 'stick' | 'made' | 'gall' | 'hive' | 'feather' | 'mailbox' | 'door' |
//     'limb' | 'ground', id, tree?, branch?, tip?, laid?, at (room m: where the ray meets it), t (m along the ray), limb? } | null
import { MAILBOX } from './outside.js';
import { outside as O } from 'penpals-law';

export const ARM = 1.8; // m a hand reaches from the head: down to the ground at the feet, a being bending (Tabor's to set)
export const DOWN = 3; // m to the ground a thing is set down on (at the feet, or a step off)
export const STONE_SQUAT = O.OUTSIDE.stones.squat; // a stone as tall as this of its width (the law's: drawn so, engine.js; met so, here)

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];

// a ray against a ball (`squat`: as tall as this of its width): the nearer meeting, or null
function ball(o, d, c, r, squat = 1) {
  if (squat !== 1) {
    // (in the ball's own room, where it is round: the ray's t is the same there)
    o = [o[0], o[1], c[2] + (o[2] - c[2]) / squat];
    d = [d[0], d[1], d[2] / squat];
    const a = dot(d, d),
      m = sub(o, c);
    const b = dot(m, d),
      cc = dot(m, m) - r * r;
    const disc = b * b - a * cc;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / a;
    return t > 0 ? t : null;
  }
  const m = sub(o, c);
  const b = dot(m, d),
    cc = dot(m, m) - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : null;
}
// a ray against a rod (from a to b, r round): where the ray passes nearest it, if within r
function rod(o, d, a, b, r) {
  const u = sub(b, a);
  const L = Math.hypot(...u) || 1e-9;
  const e = u.map((v) => v / L);
  const w = sub(o, a);
  const dd = dot(d, e);
  const den = 1 - dd * dd;
  if (den < 1e-9) return null;
  const t = (dd * dot(w, e) - dot(w, d)) / den;
  const s = Math.max(0, Math.min(L, dot(w, e) + t * dd));
  if (t <= 0) return null;
  const p = along(o, d, t),
    q = along(a, e, s);
  return Math.hypot(...sub(p, q)) <= r ? { t, s } : null;
}

// reach: how far along the ray a thing is taken (an arm's; the eye: no limit); far: how far the ground is
// looked for (the hand's: where a thing is set down; the eye's: as far as the outside is grown); under:
// (x, y) → whether a house stands there (its floor, not the ground, is under it).
export function reachOutside(spec, o, d, ground, { reach = ARM, far = DOWN, under = null } = {}) {
  if (!spec) return null;
  let best = null;
  const take = (hit, most = reach) => {
    if (hit && hit.t <= most && (!best || hit.t < best.t)) best = hit;
  };
  for (const s of spec.stones) {
    const t = ball(o, d, s.at, Math.max(s.r, 0.03), STONE_SQUAT);
    if (t) take({ kind: 'stone', id: s.id, at: along(o, d, t), t });
  }
  for (const m of spec.made ?? []) {
    const t = ball(o, d, [m.at[0], m.at[1], m.at[2] + 0.03], 0.06);
    if (t) take({ kind: 'made', id: m.id, made: m, at: along(o, d, t), t });
  }
  for (const g of spec.galls ?? []) {
    const t = ball(o, d, g.at, Math.max(g.r, 0.03));
    if (t) take({ kind: 'gall', id: g.tree, tip: g.tip, laid: g.laid, at: along(o, d, t), t });
  }
  for (const h of spec.hives ?? []) {
    const t = ball(o, d, h.at, Math.max(h.r, 0.03));
    if (t) take({ kind: 'hive', id: h.tree, at: along(o, d, t), t });
  }
  for (const m of spec.mailboxes ?? []) {
    const t = ball(o, d, [m.at[0], m.at[1], m.at[2] + MAILBOX.post + MAILBOX.box[2] / 2], Math.max(...MAILBOX.box) / 2 + 0.05);
    if (t) take({ kind: 'mailbox', id: m.key, key: m.key, at: along(o, d, t), t });
  }
  // another's house's door (its near wall's opening): the hand on it opens it or shuts it
  for (const h of spec.houses ?? []) {
    const r = h.door;
    if (!r || Math.abs(d[1]) < 1e-9) continue;
    const t = (r.y - o[1]) / d[1];
    const p = along(o, d, t);
    if (t > 0 && p[0] >= r.x0 && p[0] <= r.x1 && p[2] >= r.z0 && p[2] <= r.z1) take({ kind: 'door', id: h.key, key: h.key, name: h.name, open: !!h.opens?.door, at: p, t });
  }
  for (const f of spec.feathers ?? []) {
    const t = ball(o, d, f.at, f.length / 2);
    if (t) take({ kind: 'feather', id: f.id, at: along(o, d, t), t });
  }
  for (const s of spec.sticks ?? [])
    for (const l of s.limbs) {
      const h = rod(o, d, l.from, l.to, Math.max(l.r, 0.015));
      if (h) take({ kind: 'stick', id: s.id, at: along(o, d, h.t), t: h.t, limb: l });
    }
  for (const tr of spec.trees)
    for (const l of tr.limbs) {
      const h = rod(o, d, l.from, l.to, Math.max(l.r, 0.015));
      if (h) take({ kind: 'limb', id: tr.id, tree: tr.tree, branch: l.branch, at: along(o, d, h.t), t: h.t, limb: l });
    }
  // the ground: stepped along the ray (the steps growing with the distance) until it is under it, then
  // the crossing found between the last two steps
  const below = (t) => {
    const p = along(o, d, t);
    return p[2] <= ground(p[0], p[1]) && !under?.(p[0], p[1]);
  };
  for (let a = 0, t = 0.05; t <= far && (!best || a < best.t); a = t, t += Math.max(0.05, t * 0.02)) {
    if (!below(t)) continue;
    let lo = a,
      hi = t;
    for (let k = 0; k < 12; k++) {
      const m = (lo + hi) / 2;
      if (below(m)) hi = m;
      else lo = m;
    }
    const p = along(o, d, hi);
    take({ kind: 'ground', at: [p[0], p[1], ground(p[0], p[1])], t: hi }, far);
    break;
  }
  return best;
}
