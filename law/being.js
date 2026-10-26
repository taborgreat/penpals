// The being (rooms.md §4): each person in a room is one being, a body and a
// head, the eye and the ear on the head. Its motion is acts, the same kind as
// pen acts, applied by the same rules everywhere, so everyone sees the same
// twist. Never recorded: the eye's own state, and motion below a step or an
// angle.
//
// A pose: { pos: [x, y, z] (room m: x the seat's right, y toward the window, z
// up), yaw (the head's heading, degrees, 0 toward the window, + to the right),
// pitch (degrees, + up), body (the body's heading, degrees), size (1 a person) }.
//
// The neck law: the head turns freely within a range of the body: up to NECK_YAW
// left or right, NECK_PITCH up or down. Turned past NECK_YAW the body turns with
// it, dragged by exactly the excess, so the head never passes the limit. (While
// flying the body follows the head's heading: the caller gives body = yaw.)

import { MAX_RING, PLOT_M } from './world.js';

export const NECK_YAW = 70;
export const NECK_PITCH = 80;
export const STEP_M = 0.05; // a motion act only past this far (Tabor's to set: 5 cm)
export const TURN_DEG = 5; // or past this turn
export const MAX_RATE = 5; // and at most this many a second

export const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

// The neck law: the body (heading `body`) under a head turned to `yaw`, `pitch`. → { body, yaw, pitch }
export function neck(body, yaw, pitch) {
  const p = Math.max(-NECK_PITCH, Math.min(NECK_PITCH, pitch));
  const off = wrap(yaw - body);
  if (off > NECK_YAW) return { body: wrap(body + (off - NECK_YAW)), yaw: wrap(yaw), pitch: p };
  if (off < -NECK_YAW) return { body: wrap(body + (off + NECK_YAW)), yaw: wrap(yaw), pitch: p };
  return { body: wrap(body), yaw: wrap(yaw), pitch: p };
}

// Whether a pose has moved enough from the last one sent (at `lastAt` ms) to be
// an act now (at `now` ms): past STEP_M or TURN_DEG, at most MAX_RATE a second.
export function isAct(last, lastAt, pose, now) {
  if (!last) return true;
  if (now - lastAt < 1000 / MAX_RATE) return false;
  const moved = Math.sqrt(pose.pos.reduce((s, v, k) => s + (v - last.pos[k]) ** 2, 0)); // (exact everywhere: no hypot)
  const turned = Math.max(Math.abs(wrap(pose.yaw - last.yaw)), Math.abs(pose.pitch - last.pitch), Math.abs(wrap((pose.body ?? pose.yaw) - (last.body ?? last.yaw))));
  return moved > STEP_M || turned > TURN_DEG;
}

// A pose made exact for the wire: mm, tenths of a degree; the neck law applied.
export function quantize(pose) {
  const q = (v, k) => Math.round(v * k) / k;
  const n = neck(pose.body ?? pose.yaw, pose.yaw, pose.pitch);
  return { pos: pose.pos.map((v) => q(v, 1000)), yaw: q(n.yaw, 10), pitch: q(n.pitch, 10), body: q(n.body, 10), size: q(pose.size ?? 1, 1e4) };
}

// A pose as anyone may send it: numbers in range, anywhere in the world (a house's room is a place in the
// one outside: a being walks out of its door and on, as far as the farthest plot: law/world.js).
export const REACH_M = (MAX_RING + 1) * PLOT_M;
export function checkPose(pose) {
  const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!pose || !Array.isArray(pose.pos) || pose.pos.length !== 3) return false;
  if (!pose.pos.every((v) => num(v, -REACH_M, REACH_M))) return false;
  return num(pose.yaw, -180, 180) && num(pose.pitch, -90, 90) && num(pose.body ?? pose.yaw, -180, 180) && num(pose.size ?? 1, 1e-5, 2);
}

// Others see a being glide between its acts: k 0..1 of the way from a to b.
export function glide(a, b, k) {
  const s = Math.max(0, Math.min(1, k));
  const t = s * s * (3 - 2 * s);
  const l = (x, y) => x + (y - x) * t;
  const turn = (x, y) => wrap(x + wrap(y - x) * t);
  return { pos: a.pos.map((v, i) => l(v, b.pos[i])), yaw: turn(a.yaw, b.yaw), pitch: l(a.pitch, b.pitch), body: turn(a.body ?? a.yaw, b.body ?? b.yaw), size: l(a.size ?? 1, b.size ?? 1) };
}
