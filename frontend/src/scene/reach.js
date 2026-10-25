// What a hand reaches for outside (outside.md Phase 5): the nearest thing the pointer's ray meets, out
// of the outside as it is drawn (scene/outside.js outsideNear), within an arm's reach of the head.
//   reachOutside(spec, origin, dir, ground, { reach }) → { kind: 'stone' | 'stick' | 'limb' | 'ground', id,
//     tree?, branch?, at (room m: where the ray meets it), t (m along the ray), limb? } | null
export const ARM = 1.8; // m a hand reaches from the head: down to the ground at the feet, a being bending (Tabor's to set)
export const DOWN = 3; // m to the ground a thing is set down on (at the feet, or a step off)

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const along = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];

// a ray against a ball: the nearer meeting, or null
function ball(o, d, c, r) {
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

export function reachOutside(spec, o, d, ground, { reach = ARM } = {}) {
  if (!spec) return null;
  let best = null;
  const take = (hit, most = reach) => {
    if (hit && hit.t <= most && (!best || hit.t < best.t)) best = hit;
  };
  for (const s of spec.stones) {
    const t = ball(o, d, s.at, Math.max(s.r, 0.03));
    if (t) take({ kind: 'stone', id: s.id, at: along(o, d, t), t });
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
  // the ground: stepped along the ray until it is under it
  for (let t = 0.05; t <= DOWN && (!best || t < best.t); t += 0.05) {
    const p = along(o, d, t);
    if (p[2] <= ground(p[0], p[1])) {
      take({ kind: 'ground', at: [p[0], p[1], ground(p[0], p[1])], t }, DOWN);
      break;
    }
  }
  return best;
}
