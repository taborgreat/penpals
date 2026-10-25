// The being's keys in the world (outside.md Part 3, one-world.md): the keys
// place the body, the mouse moves what your attention is on, the scroll sends
// the eye closer. Pure: SceneView feeds it the keys held and the pose
// (light/roomCamera.js), and draws what comes back.
//   W A S D (arrows)  walk; flying, move
//   Space             jump; twice quickly, fly (stop falling) or stop flying; held while flying, rise
//   Shift             crouch on the ground; held while flying, lower
//   scroll            the eye's zoom (§3.4): only the eye moves, toward the point under the
//                     cursor, a share of what is left each step; back toward the head. The body
//                     and head stay where they are, and the zoom is never recorded (§3.6)
import { roomCamera } from './light/index.js';

export const DOUBLE_MS = 300; // two presses of Space this close together: fly, or stop flying
export const JUMP_M = 0.45; // how high a jump lifts the feet, at a person's size
export const CROUCH = 0.6; // a crouched eye at this share of its standing height
export const ZOOM_HALF = 100; // a wheel turn this big (deltaY) halves the way to the point under the cursor
export const NEAR_K = 1e-3; // zoomed, the near plane at this share of the distance to what is nearest
const SNAP = 1e-6; // an offset this small (of the being's size) is the eye back in the head

export const MOVE_KEYS = { w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right' };
export const isMoveKey = (k) => k in MOVE_KEYS;

// The keys held → roomCamera's input ({ forward, right, up }, each −1..1).
export function inputOf(keys, flying) {
  const has = (dir) => [...keys].some((k) => MOVE_KEYS[k] === dir);
  const up = flying ? (keys.has(' ') ? 1 : 0) - (keys.has('shift') ? 1 : 0) : 0;
  return { forward: (has('forward') ? 1 : 0) - (has('back') ? 1 : 0), right: (has('right') ? 1 : 0) - (has('left') ? 1 : 0), up };
}

const feetOf = (pose) => pose.pos[2] - roomCamera.EYE * (pose.size ?? 1);
// Standing on something: walking, not rising or falling, the feet on what is under them.
export function grounded(geom, pose, ground = null) {
  if (pose.mode !== 'walk' || pose.vz) return false;
  const feet = feetOf(pose);
  return feet - roomCamera.supportAt(geom, pose.pos[0], pose.pos[1], feet + 1e-6, ground) < 1e-4 * (pose.size ?? 1);
}
// A push up: the feet leave what they stand on rising fast enough to reach JUMP_M (scaled by size), then fall.
export const jumpSpeed = (size = 1) => Math.sqrt(2 * roomCamera.G * JUMP_M * size);
export function jump(geom, pose, ground = null) {
  if (!grounded(geom, pose, ground)) return pose;
  const vz = jumpSpeed(pose.size ?? 1);
  return { ...pose, vz, pos: [pose.pos[0], pose.pos[1], pose.pos[2] + vz * 1e-3] }; // (just off the ground: walk() lets it fly)
}
// Fly (gravity off, light-waves §9), or stop flying and fall until it rests.
export const toggleFly = (pose) => ({ ...pose, mode: pose.mode === 'fly' ? 'walk' : 'fly', vz: 0 });

// Space pressed at `now`: a second press within DOUBLE_MS of the first is a double. → { double, at }
export function spacePress(lastAt, now) {
  const double = lastAt !== null && now - lastAt < DOUBLE_MS;
  return { double, at: double ? null : now };
}

// The head as it is seen (for you, the eye; for others, the head): crouched on the ground, lower.
export function headOf(pose, crouched) {
  if (!crouched || pose.mode !== 'walk') return pose;
  const eyeH = roomCamera.EYE * (pose.size ?? 1);
  return { ...pose, pos: [pose.pos[0], pose.pos[1], pose.pos[2] - eyeH * (1 - CROUCH)] };
}
// Standing up from the chair: at the seat, the feet on the floor, facing as the eye was.
export function standUp(geom, facing, size = 1) {
  const s = roomCamera.seat(geom);
  return { mode: 'walk', pos: [s.pos[0], s.pos[1], roomCamera.EYE * size], yaw: facing.yaw, pitch: facing.pitch, size, vz: 0 };
}
// Near enough the chair to sit down (room m, across the floor).
export const SIT_M = 0.8;
export const atChair = (geom, pose) => Math.hypot(pose.pos[0] - roomCamera.seat(geom).pos[0], pose.pos[1] - roomCamera.seat(geom).pos[1]) < SIT_M;

// --- the eye's zoom ---
// The share of the way a wheel turn of deltaY covers.
const shareOf = (deltaY) => 1 - 0.5 ** (Math.abs(deltaY) / ZOOM_HALF);
// In: the eye travels along the ray under the cursor (dir, unit) a share of the distance `t`
// to what it meets, so that point stays under the cursor. offset: from the head to the eye (m).
export const zoomIn = (offset, dir, t, deltaY) => offset.map((v, k) => v + dir[k] * t * shareOf(deltaY));
// Back: toward the head, a share of what is left; at the head, the eye is home.
export function zoomOut(offset, deltaY, size = 1) {
  const next = offset.map((v) => v * (1 - shareOf(deltaY)));
  return Math.hypot(...next) < SNAP * size ? [0, 0, 0] : next;
}
export const eyeOf = (head, offset) => (offset ? { ...head, pos: head.pos.map((v, k) => v + offset[k]) } : head);
export const zoomed = (offset) => !!offset && Math.hypot(...offset) > 0;
