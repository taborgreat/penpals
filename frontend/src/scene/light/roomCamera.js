// The camera in the room (light-waves §9): the eye on the being's head, in the
// room frame (room.js: metres, x to the writer's right, y toward the window,
// z up). The page camera (camera.js, cleanup §3) with a wider boundary and
// three modes:
//   seated  the writing view, as now (writing only from the seat)
//   fly     anywhere in the room: to the window to look out, around the table,
//           down into the page's dents and between the beads. Speed and the near
//           plane follow the distance to the nearest surface, so everything
//           scales with you, and no step is ever longer than half that distance
//           (you slow as you come close; nothing can be passed through)
//   walk    gravity holds the being to the surface it stands on: everything
//           falls until it rests. At small size (rooms.md §4) the ground is the
//           page's own heights: dents are canyons, beads are hills, a ridge
//           taller than a step is a wall to go around
// Return to seat glides back. The neck law, the being's size changes and its
// motion acts are rooms.md's; this is only where the eye can go and how fast.
//
// A pose: { mode, pos: [x, y, z] (the eye, m), yaw (degrees, 0 toward the
// window, + to the right), pitch (degrees, + up), size (1 a person .. 1e-4 a
// bead), vz (m / s, falling) }.
//
// `ground(x, y)` (optional, room m → m): the page's surface above the paper's
// top where the integration has heights (the height field × its exaggeration).

import { roomToPage, PX_PER_M } from './room.js';

const rad = (d) => (d * Math.PI) / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const FLY_K = 1.5; // a flying eye covers this many clearances a second
export const FLY_MAX = 2; // m / s at most
export const GAP = 1e-7; // m: the closest the eye comes to anything (a sliver of a cell)
export const NEAR_K = 0.2; // the near plane: this share of the clearance
export const NEAR_MAX = 0.05;
export const FAR = 200; // m (the sky beyond is drawn at infinity)
export const WALK = 1.4; // m / s at a person's size
export const EYE = 1.6; // m: a standing person's eye above their feet
export const STEP = 0.35; // of the eye's height: the tallest step walked up
export const G = 9.81; // m / s²
export const FOV = 40; // degrees, vertical

// --- what is solid ---
// The room's boxes the eye cannot enter: the table's slab, the paper on it,
// the legs, the window's frame, the holders (as their boxes). Made once per geometry.
const solidsOf = new WeakMap();
export function solids(geom) {
  let s = solidsOf.get(geom);
  if (s) return s;
  const tb = geom.table, pg = geom.pageRect;
  s = [
    [tb.x0, tb.y0, tb.bottom, tb.x1, tb.y1, tb.top],
    [pg.x0, pg.y0, tb.top, pg.x1, pg.y1, geom.pageOrigin[2]],
    ...(geom.objects ?? []).map((o) => o.box ?? [o.center[0] - o.radius, o.center[1] - o.radius, o.z0, o.center[0] + o.radius, o.center[1] + o.radius, o.z1]),
  ];
  solidsOf.set(geom, s);
  return s;
}
const PAPER = 1; // the paper's box in solids(): where the page's heights are given, they are its top instead
const boxDistance = (p, b) => Math.hypot(Math.max(b[0] - p[0], 0, p[0] - b[3]), Math.max(b[1] - p[1], 0, p[1] - b[4]), Math.max(b[2] - p[2], 0, p[2] - b[5]));
const onPage = (geom, x, y) => x >= geom.pageRect.x0 && x <= geom.pageRect.x1 && y >= geom.pageRect.y0 && y <= geom.pageRect.y1;

// How far the nearest surface is from p (0 when p is inside something).
export function clearance(geom, p, ground = null) {
  const [W, D, H] = geom.size;
  let c = Math.min(p[0], W - p[0], p[1], D - p[1], p[2], H - p[2]);
  const heights = !!ground && onPage(geom, p[0], p[1]);
  solids(geom).forEach((b, k) => {
    if (!(heights && k === PAPER)) c = Math.min(c, boxDistance(p, b));
  });
  if (heights) c = Math.min(c, p[2] - geom.pageOrigin[2] - ground(p[0], p[1]));
  return Math.max(0, c);
}

// --- poses ---
// The seat: in front of the page, eyes a little above and behind it, looking at its middle.
export function seat(geom) {
  const pg = geom.pageRect;
  const mid = [(pg.x0 + pg.x1) / 2, (pg.y0 + pg.y1) / 2, geom.pageOrigin[2]];
  const pos = [mid[0], pg.y0 - 0.3, mid[2] + 0.42];
  const pitch = (Math.atan2(mid[2] - pos[2], mid[1] - pos[1]) * 180) / Math.PI;
  return { mode: 'seated', pos, yaw: 0, pitch, size: 1, vz: 0 };
}
export const canWrite = (pose) => pose.mode === 'seated';

// Which way the eye looks.
export function look(pose) {
  const y = rad(pose.yaw), p = rad(pose.pitch);
  const forward = [Math.sin(y) * Math.cos(p), Math.cos(y) * Math.cos(p), Math.sin(p)];
  const right = [Math.cos(y), -Math.sin(y), 0];
  const up = [right[1] * forward[2] - right[2] * forward[1], right[2] * forward[0] - right[0] * forward[2], right[0] * forward[1] - right[1] * forward[0]];
  return { forward, right, up };
}
export const turn = (pose, dyaw, dpitch) => ({ ...pose, yaw: (((pose.yaw + dyaw + 180) % 360) + 360) % 360 - 180, pitch: clamp(pose.pitch + dpitch, -89, 89) });

// --- flying ---
export const speedAt = (c) => Math.min(FLY_MAX, FLY_K * Math.max(c, GAP));
export const nearAt = (c) => clamp(NEAR_K * c, GAP / 10, NEAR_MAX);

// input: { forward, right, up } each −1..1 (WASD, Q / E); dt seconds.
export function fly(geom, pose, { forward = 0, right = 0, up = 0 } = {}, dt, { ground = null } = {}) {
  const { forward: f, right: r } = look(pose);
  let d = [0, 1, 2].map((k) => f[k] * forward + r[k] * right + (k === 2 ? up : 0));
  const len = Math.hypot(...d);
  if (len < 1e-12) return { ...pose, mode: 'fly', vz: 0 };
  if (len > 1) d = d.map((v) => v / len);
  const c = clearance(geom, pose.pos, ground);
  const step = Math.min(speedAt(c) * dt, 0.5 * c);
  const ok = (p) => clearance(geom, p, ground) >= GAP;
  let pos = pose.pos.map((v, k) => v + d[k] * step);
  if (!ok(pos)) {
    // slide along what is in the way: each axis on its own
    pos = [...pose.pos];
    for (let k = 0; k < 3; k++) {
      const q = [...pos];
      q[k] += d[k] * step;
      if (ok(q)) pos = q;
    }
  }
  return { ...pose, mode: 'fly', pos, vz: 0 };
}

// --- walking ---
// The highest surface under (x, y) no higher than `limit` (feet height): the
// floor, a box's top, the paper and the page's heights.
export function supportAt(geom, x, y, limit, ground = null, outside = null) {
  const [W, D] = geom.size;
  if (outside && (x < 0 || y < 0 || x > W || y > D)) {
    return outside.ground(x, y); // (out of the house: the outside's dirt, outside.md Phase 4)
  }
  let s = 0;
  const heights = !!ground && onPage(geom, x, y);
  solids(geom).forEach((b, k) => {
    if (!(heights && k === PAPER) && x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && b[5] <= limit && b[5] > s) s = b[5];
  });
  if (heights) {
    const g = geom.pageOrigin[2] + ground(x, y);
    if (g <= limit && g > s) s = g;
  }
  return s;
}
// Whether something rises in the way of a being standing at (x, y) with its
// feet at `feet`: a box, the page's heights or the room's walls. outside ({ door
// (open or not), ground(x, y), houses: [{ at (its corner, room m), door (open or
// not) }] }): the house's door, and the world beyond it (outside.md Phase 4):
// through the open door's way, out onto the dirt, where only the houses' walls
// stand in the way (each the same house: through its open door, into it).
function blocked(geom, x, y, feet, eyeH, ground, outside = null) {
  const [W, D] = geom.size;
  const r = 0.15 * eyeH;
  if (outside) {
    const d = geom.door;
    const doorway = !!d && outside.door && x >= d.x0 + r && x <= d.x1 - r && y > -r && y < r;
    if (doorway) return false;
    for (const h of outside.houses ?? []) {
      const [hx, hy] = [x - h.at[0], y - h.at[1]];
      if (hx < -r || hy < -r || hx > W + r || hy > D + r) continue; // (not at it)
      if (d && h.door && hx >= d.x0 + r && hx <= d.x1 - r && hy > -r && hy < D - r) return false; // its doorway, and in
      return true; // its walls
    }
    const out = x < -r || y < -r || x > W + r || y > D + r;
    if (out) return outside.ground(x, y) > feet + STEP * eyeH; // (the dirt rises too steeply)
    if (x < r || y < r || x > W - r || y > D - r) return true; // the walls, from either side
  }
  if (x < r || y < r || x > W - r || y > D - r) return true;
  const top = feet + STEP * eyeH;
  const heights = !!ground && onPage(geom, x, y);
  if (solids(geom).some((b, k) => !(heights && k === PAPER) && x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && b[5] > top && b[2] < feet + eyeH)) return true;
  return heights && geom.pageOrigin[2] + ground(x, y) > top;
}

// input: { forward, right } −1..1 along the ground (the head's pitch does not matter).
export function walk(geom, pose, { forward = 0, right = 0 } = {}, dt, { ground = null, outside = null } = {}) {
  const eyeH = EYE * pose.size;
  let feet = pose.pos[2] - eyeH;
  let [x, y] = pose.pos;
  const a = rad(pose.yaw);
  let d = [Math.sin(a) * forward + Math.cos(a) * right, Math.cos(a) * forward - Math.sin(a) * right];
  const len = Math.hypot(...d);
  if (len > 1) d = d.map((v) => v / len);
  if (len > 1e-12) {
    const nx = x + d[0] * WALK * pose.size * dt, ny = y + d[1] * WALK * pose.size * dt;
    if (!blocked(geom, nx, ny, feet, eyeH, ground, outside)) [x, y] = [nx, ny];
  }
  // up a step at once; down by falling
  const under = supportAt(geom, x, y, feet + STEP * eyeH, ground, outside);
  let vz = pose.vz ?? 0;
  if (under >= feet) {
    feet = under;
    vz = 0;
  } else {
    vz -= G * dt;
    feet += vz * dt;
    if (feet <= under) {
      feet = under;
      vz = 0;
    }
  }
  return { ...pose, mode: 'walk', pos: [x, y, feet + eyeH], vz };
}

// --- back to the seat ---
// Between two poses (smoothstep): the glide back to the seat, or to anywhere.
export function glide(from, to, t) {
  const s = clamp(t, 0, 1) ** 2 * (3 - 2 * clamp(t, 0, 1));
  const dyaw = ((to.yaw - from.yaw + 540) % 360) - 180;
  return {
    mode: t >= 1 ? to.mode : 'fly',
    pos: from.pos.map((v, k) => v + (to.pos[k] - v) * s),
    yaw: from.yaw + dyaw * s,
    pitch: from.pitch + (to.pitch - from.pitch) * s,
    size: Math.exp(Math.log(from.size) + (Math.log(to.size) - Math.log(from.size)) * s),
    vz: 0,
  };
}

// --- what the eye sees ---
// The view for drawing: in the room frame, or the page frame (page px, as
// engine.js draws) with pageView. The near plane follows the clearance.
export function roomView(geom, pose, { fov = FOV, ground = null } = {}) {
  return { eye: pose.pos, ...look(pose), fov, near: nearAt(clearance(geom, pose.pos, ground)), far: FAR };
}
export function pageView(geom, pose, opts) {
  const v = roomView(geom, pose, opts);
  const flip = (d) => [d[0], -d[1], d[2]];
  return { eye: roomToPage(v.eye, geom.pageOrigin), forward: flip(v.forward), right: flip(v.right), up: flip(v.up), fov: v.fov, near: v.near * PX_PER_M, far: v.far * PX_PER_M };
}
// Whether a sphere (centre, radius) is in the view (the eye pulls only what is
// in view: chunks out of it are not drawn or asked for).
export function inView(view, center, radius, aspect) {
  const v = [0, 1, 2].map((k) => center[k] - view.eye[k]);
  const dot = (a) => a[0] * v[0] + a[1] * v[1] + a[2] * v[2];
  const z = dot(view.forward);
  if (z + radius < view.near || z - radius > view.far) return false;
  const ky = Math.tan(rad(view.fov) / 2), kx = ky * aspect;
  return Math.abs(dot(view.right)) <= kx * z + radius * Math.hypot(1, kx) && Math.abs(dot(view.up)) <= ky * z + radius * Math.hypot(1, ky);
}
// How many cells of `cellSize` fall across one pixel at `distance` (the level
// of detail: ≤ 1 crisp cells, more the averaged character, surface.js growMean's foot).
export const footprint = (view, distance, viewportH, cellSize) => (2 * Math.max(distance, 1e-12) * Math.tan(rad(view.fov) / 2)) / viewportH / cellSize;
