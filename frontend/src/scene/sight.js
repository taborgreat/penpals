// What the eye sees (cleanup-and-speed.md §5b; the shared primitive "each sense
// pulls its own range"): the part of the page under the view and how fine it is
// there, so a page asks only for the writing in view, at the detail the eye can
// see, and lets go of what it has not seen for a while.
//
//   sightOf(cam, w, h)        → { rect, eye, k, flat }: the page rectangle the view
//                               covers (page px) and its scale (device px a page px)
//   pxAt(sight, rect)         → device px a page px at the rectangle's nearest point
//   wantOf(sight, item)       → what to ask for one piece of writing (below)
//   toAsk(placed, sight, …)   → the pieces in sight not already held as wanted
//   stale(seenAt, now)        → the keys not seen for DROP_MS: let go
import { frame, rayThrough } from './camera.js';
import { MAX_LOD } from 'penpals-law/v2/scene';

export const FAR = 1 / 8; // device px a cell below which relief is nothing to see: the flat look
export const MARGIN = 0.25; // of the view's size, asked for around it (a turn of the head costs no wait)
export const DROP_MS = 20000; // what left the view is let go after this (a glance away and back costs nothing)
const GRID = 6; // the view's rays sampled GRID + 1 a side

const rad = (d) => (d * Math.PI) / 180;

// The view (camera.js state) over w × h device px. Rays that miss the paper
// (above the horizon) reach `reach` page px.
export function sightOf(cam, w, h, reach = 20000) {
  const aspect = w / h;
  const { eye } = frame(cam);
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (let j = 0; j <= GRID; j++) {
    for (let i = 0; i <= GRID; i++) {
      const { origin, dir } = rayThrough(cam, -1 + (2 * i) / GRID, -1 + (2 * j) / GRID, aspect);
      let p;
      if (dir[2] < -1e-9) {
        const t = -origin[2] / dir[2];
        p = [origin[0] + dir[0] * t, origin[1] + dir[1] * t];
      } else p = null;
      const dx = (p ? p[0] : origin[0] + dir[0] * reach) - eye[0],
        dy = (p ? p[1] : origin[1] + dir[1] * reach) - eye[1];
      const d = Math.hypot(dx, dy);
      const s = d > reach ? reach / d : 1; // (near the horizon the paper goes on and on: so far, no further)
      const x = eye[0] + dx * s,
        y = eye[1] + dy * s;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return { rect: [x0, y0, x1, y1], eye, k: cam.mode === '2d' ? null : h / (2 * Math.tan(rad(cam.fov) / 2)), flat: cam.mode === '2d' ? w / cam.view : null };
}

// Device px a page px, at the point of `rect` (page px) nearest the eye.
export function pxAt(sight, rect) {
  if (sight.flat) return sight.flat;
  const [ex, ey, ez] = sight.eye;
  const dx = Math.min(Math.max(ex, rect[0]), rect[2]) - ex,
    dy = Math.min(Math.max(ey, rect[1]), rect[3]) - ey;
  return sight.k / Math.max(1e-6, Math.hypot(dx, dy, ez));
}

// One piece of writing: `rect` its place on the page (page px), `cellPx` page px
// a cell, `box` its cells ([x0, y0, w, h] in its own frame). →
//   null                   out of sight: nothing asked for, nothing drawn
//   { look: true, lod }    far or small: the flat look, at a level of detail
//   { lod, at }            near: the scene field of the chunks in view (at:
//                          [x0, y0, w, h] of its cells, or null for all of it),
//                          at the detail the eye can see (0: every cell)
export function wantOf(sight, { rect, cellPx, box }, { chunk = 128 } = {}) {
  if (!sight) return null;
  const [sx0, sy0, sx1, sy1] = sight.rect;
  const mx = (sx1 - sx0) * MARGIN,
    my = (sy1 - sy0) * MARGIN;
  const vx0 = Math.max(rect[0], sx0 - mx),
    vy0 = Math.max(rect[1], sy0 - my);
  const vx1 = Math.min(rect[2], sx1 + mx),
    vy1 = Math.min(rect[3], sy1 + my);
  if (vx0 >= vx1 || vy0 >= vy1) return null;
  const px = pxAt(sight, [vx0, vy0, vx1, vy1]) * cellPx; // device px a cell, where it is nearest
  const lod = Math.max(0, Math.min(MAX_LOD, Math.floor(Math.log2(1 / px))));
  if (px < FAR) return { look: true, lod };
  // the cells in view, out to whole chunks (a chunk is drawn whole or not at all)
  const c0x = Math.floor((box[0] + (vx0 - rect[0]) / cellPx) / chunk) * chunk,
    c0y = Math.floor((box[1] + (vy0 - rect[1]) / cellPx) / chunk) * chunk;
  const c1x = Math.ceil((box[0] + (vx1 - rect[0]) / cellPx) / chunk) * chunk,
    c1y = Math.ceil((box[1] + (vy1 - rect[1]) / cellPx) / chunk) * chunk;
  const ax = Math.max(box[0], c0x),
    ay = Math.max(box[1], c0y);
  const bx = Math.min(box[0] + box[2], c1x),
    by = Math.min(box[1] + box[3], c1y);
  const all = ax <= box[0] && ay <= box[1] && bx >= box[0] + box[2] && by >= box[1] + box[3];
  return { lod, at: all ? null : [ax, ay, bx - ax, by - ay] };
}

// The pieces of writing (`placed`: { key, rect, cellPx, box }) to ask for now: in
// sight, and not already held (`held`: key → { want }) as wanted. Each one in sight
// is marked seen (`seenAt`: key → time) at `now`.
export function toAsk(placed, sight, held, seenAt, now, opts) {
  const out = [];
  for (const p of placed) {
    const want = wantOf(sight, p, opts);
    if (!want) continue; // out of sight: nothing asked for
    seenAt.set(p.key, now);
    if (!holds(held.get(p.key)?.want, want)) out.push({ p, want });
  }
  return out;
}

// Whether what is loaded (`had`: a want) already holds what is wanted now.
export function holds(had, want) {
  if (!had || !want || !!had.look !== !!want.look || had.lod !== want.lod) return false;
  if (want.look || !had.at) return true;
  if (!want.at) return false;
  const [a, b] = [had.at, want.at];
  return b[0] >= a[0] && b[1] >= a[1] && b[0] + b[2] <= a[0] + a[2] && b[1] + b[3] <= a[1] + a[3];
}

// The keys of `seenAt` (key → when last in sight) not seen for `dropMs`.
export function stale(seenAt, now, dropMs = DROP_MS) {
  return [...seenAt].filter(([, t]) => now - t > dropMs).map(([key]) => key);
}

// A box's bytes (one a cell, row by row over `box`) cut to `at` (clipped): the paper's detail of a window.
export function cropCells(data, box, at) {
  const ax = Math.max(box[0], at[0]),
    ay = Math.max(box[1], at[1]);
  const w = Math.max(0, Math.min(box[0] + box[2], at[0] + at[2]) - ax),
    h = Math.max(0, Math.min(box[1] + box[3], at[1] + at[3]) - ay);
  const out = new data.constructor(w * h);
  for (let y = 0; y < h; y++) out.set(data.subarray((ay + y - box[1]) * box[2] + (ax - box[0]), (ay + y - box[1]) * box[2] + (ax - box[0]) + w), y * w);
  return { data: out, box: [ax, ay, w, h] };
}
