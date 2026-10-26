// Rain as it falls near the eye (world.md Phase 4: the weather's rain rate; glass.js rainDrops: Marshall–
// Palmer's middle drop at that rate and how fast it falls): how many drops hang in a cubic metre of air (the
// drops a square metre of ground takes a second, over how fast each falls), and the nearest of them drawn where
// they are now: each falls at its speed and the wind carries it along; none under a roof, none below the
// ground. The window's glass is where each drop is followed (glass.js); here the air is filled to the same
// rate, so what beads on the window is what falls outside it.
//   rainNear({ rate (mm/h), wind ([wx, wy] m/s), eye ([x, y, z] room m), t (s: the world's clock), roofs:
//     [[x0, y0, x1, y1, top]] (room m), ground (m: below it, none), drawn }) → { D (m), fall (m/s), velocity
//     ([vx, vy, vz] m/s), n, at: Float32Array 3n (room m) } | null
import { rainDrops } from './glass.js';

export const DRAWN = 12000; // the nearest drops drawn (a drawing's grain: Tabor's to set)
const frac = (v) => v - Math.floor(v);
// drop i's own place in its cube of air (0..1 each way): fixed, so the eye moves through the same rain
const own = (i, k) => frac(Math.sin(i * 12.9898 + k * 78.233) * 43758.5453);

export function rainNear({ rate, wind = [0, 0], eye, t, roofs = [], ground = -Infinity, drawn = DRAWN }) {
  if (!(rate > 0) || !eye) return null;
  const { D, fall, perM2 } = rainDrops(rate);
  const perM3 = perM2 / fall;
  const side = Math.cbrt(drawn / perM3); // the cube of air about the eye that holds that many
  const v = [wind[0], wind[1], -fall];
  const at = new Float32Array(drawn * 3);
  const lo = eye.map((e) => e - side / 2);
  let n = 0;
  for (let i = 0; i < drawn; i++) {
    // where it is now: its own place, moved as it has fallen since the clock began, in the cube about the eye
    const p = [0, 1, 2].map((k) => lo[k] + side * frac((own(i, k) * side + v[k] * t - lo[k]) / side));
    if (p[2] < ground) continue;
    if (roofs.some(([x0, y0, x1, y1, top]) => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1 && p[2] < top)) continue;
    at.set(p, 3 * n++);
  }
  return { D, fall, velocity: v, n, at };
}
