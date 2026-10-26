// One ray for everything (Tabor, 2026-10-25): what a ray from the eye meets first in the world, the same
// for the eye's zoom, the pointer, E and the pen's aim. The nearest of this house (its room's surfaces,
// light/room.js hit), the others' houses (the same house where each stands: its shell, and through an open
// door or window its room), and everything outside (scene/reach.js's tests, with no arm's limit: an arm
// limits what a hand takes, never where the eye goes; the ground as far as the outside is grown, SIGHT).
//   worldHit(world, origin, dir, { hand }) → { t, at, kind: 'room' | 'opening' | 'house' | reach.js's kinds,
//     surface?, patch?, opening? (this house's, met shut or passed open: { index, kind, t }), key? (a house's) } | null
//   world: { geom, opens (this house's: { door, window, shutters }), houses (scene/outside.js: { key, at, opens }),
//            spec (scene/outside.js outsideNear, or null), ground (x, y) → z (room m) }
// An opening lets the eye through while its shutters are open (the glass is seen through) or the door is
// open; a hand only through an open door, or a window whose sash and shutters are both open.
import { hit as roomHit } from './light/room.js';
import { reachOutside } from './reach.js';
import { SIGHT, inBox } from './outside.js';

const along = (o, d, t) => [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
const passes = (kind, opens, hand) => (kind === 'door' ? !!opens?.door : hand ? opens?.shutters !== false && !!opens?.window : opens?.shutters !== false);

// Through one house (its corner `at`, room m) from `o`: the first of its matter the ray meets, or null (it
// misses the house, or leaves it through an opening). From outside, its shell first: a wall, or through an
// opening that lets it in, its room. `via`: the first opening met (shut: where it stops; open: passed).
function throughHouse(geom, at, opens, o, d, hand) {
  const [W, D, H] = geom.size;
  const p = [o[0] - at[0], o[1] - at[1], o[2] - at[2]];
  let from = p,
    t0 = 0,
    via = null;
  if (!(p[0] > 0 && p[0] < W && p[1] > 0 && p[1] < D && p[2] > 0 && p[2] < H)) {
    // outside it: where the ray comes onto its shell (a box), and whether an opening there lets it in
    let tn = -Infinity,
      tf = Infinity,
      face = -1;
    for (let k = 0; k < 3; k++) {
      const hi = geom.size[k];
      if (Math.abs(d[k]) < 1e-12) {
        if (p[k] < 0 || p[k] > hi) return null;
        continue;
      }
      const a = (0 - p[k]) / d[k],
        b = (hi - p[k]) / d[k];
      if (Math.min(a, b) > tn) {
        tn = Math.min(a, b);
        face = k;
      }
      tf = Math.min(tf, Math.max(a, b));
    }
    if (tn > tf || tf <= 0 || tn <= 0) return null;
    const q = along(p, d, tn);
    const hole =
      face !== 1
        ? null
        : q[1] < D / 2
          ? geom.door && q[0] >= geom.door.x0 && q[0] <= geom.door.x1 && q[2] >= geom.door.z0 && q[2] <= geom.door.z1 && 'door'
          : q[0] >= geom.window.x0 && q[0] <= geom.window.x1 && q[2] >= geom.window.z0 && q[2] <= geom.window.z1 && 'window';
    if (hole) via = { kind: hole, t: tn };
    if (!hole || !passes(hole, opens, hand)) return { t: tn, kind: 'house', via };
    from = along(p, d, tn + 1e-6);
    t0 = tn + 1e-6;
  }
  // in its room: its surfaces from inside; an opening that lets the ray out, and nothing more of this house
  const h = roomHit(geom, from, d);
  if (!h) return via ? { t: Infinity, via } : null;
  if (h.opening !== undefined) {
    const kind = geom.openings[h.opening]?.kind === 'door' ? 'door' : 'window';
    const met = { index: h.opening, kind, t: t0 + h.t };
    if (passes(kind, opens, hand)) return { t: Infinity, via: via ?? met };
    return { t: t0 + h.t, kind: 'opening', surface: h.surface, opening: met, via: via ?? met };
  }
  return { t: t0 + h.t, kind: 'room', surface: h.surface, patch: h.patch, via };
}

export function worldHit({ geom, opens = null, houses = [], spec = null, ground = null }, o, d, { hand = false } = {}) {
  let best = null;
  const take = (h) => {
    if (h && Number.isFinite(h.t) && (!best || h.t < best.t - 1e-6)) best = h;
  };
  // outside first (its door, the hand's to open, wins a tie with the shell it is in)
  if (spec && ground) {
    const out = reachOutside(spec, o, d, (x, y) => ground(x, y), { reach: Infinity, far: SIGHT, under: (x, y) => inBox(geom, [x, y]) || houses.some((h) => inBox(geom, [x - h.at[0], y - h.at[1]])) });
    if (out) take(out);
  }
  const mine = throughHouse(geom, [0, 0, 0], opens, o, d, hand);
  if (mine) {
    if (mine.kind === 'house') take({ t: mine.t, kind: 'house', key: null, opening: mine.via ?? undefined });
    else if (mine.kind) take({ ...mine, opening: mine.opening ?? mine.via ?? undefined });
  }
  for (const h of houses) {
    const r = throughHouse(geom, h.at, h.opens, o, d, hand);
    if (r?.kind) take({ t: r.t, kind: 'house', key: h.key, inside: r.kind !== 'house' });
  }
  if (!best) {
    // nothing met: the opening this house's ray left by, if any (what E opens or shuts)
    return mine?.via ? { t: Infinity, kind: 'away', opening: mine.via } : null;
  }
  const at = best.at ?? along(o, d, best.t);
  const opening = best.opening ?? (mine?.via && mine.via.t <= best.t ? mine.via : undefined);
  return { ...best, at, ...(opening ? { opening } : {}) };
}
