// Where a sound is heard from (world.md Phase 1, spatial): the ear is on the being's head (rooms.md
// §4), so a source is to the left or right, above or below, as the head is turned. Room m; the head
// { pos, yaw, pitch } as the scene's pose has it (yaw 0 facing +y, 90 facing +x; pitch up).
// → { az (degrees, + to the right), el (degrees, up), dist (m), delay (s: it comes as fast as sound
//     runs), gain (as near as it is: 1 at a metre), air: what the air between lets through, by band }
import { BANDS, SPEED, airAbsorption } from './bands.js';

const RAD = Math.PI / 180;
export const NEAR = 0.05; // m: nearer than this, as loud as this (an ear is not a point)

export function heard(pos, head, { speed = SPEED, humidity = 50 } = {}) {
  const d = [pos[0] - head.pos[0], pos[1] - head.pos[1], pos[2] - head.pos[2]];
  const dist = Math.hypot(...d);
  const cy = Math.cos((head.yaw ?? 0) * RAD),
    sy = Math.sin((head.yaw ?? 0) * RAD),
    cp = Math.cos((head.pitch ?? 0) * RAD),
    sp = Math.sin((head.pitch ?? 0) * RAD);
  const fwd = [sy * cp, cy * cp, sp];
  const right = [cy, -sy, 0];
  const up = [-sy * sp, -cy * sp, cp];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const az = dist > 0 ? Math.atan2(dot(d, right), dot(d, fwd)) / RAD : 0;
  const el = dist > 0 ? Math.asin(Math.max(-1, Math.min(1, dot(d, up) / dist))) / RAD : 0;
  return {
    az,
    el,
    dist,
    delay: dist / speed,
    gain: 1 / Math.max(dist, NEAR),
    air: BANDS.map((f) => 10 ** ((-airAbsorption(f, undefined, humidity) * dist) / 10)),
  };
}
