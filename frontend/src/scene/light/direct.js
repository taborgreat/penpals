// What each patch receives straight from the sources (light-waves §4, "Light
// bounces until it stops"): the first bounce's input. Sunlight comes in only
// through the window, as the direct sun (a disk, so the window's patch of sun
// is soft-edged) and as the sky and ground seen through the opening; the
// candles' light comes from their flames. Everything else is bounce.js's.
//
// General over the room it is given (roomGeometry plus its baked form factors:
// decodeRoom's { ...geom, F, W }), so layer 3 can gather each joined room's
// own and pass the solver both. Spectra are N values on the axis (axis.js).

import { N } from './axis.js';
import { SUN_RADIUS } from './air.js';
import { hit } from './room.js';

export { SUN_RADIUS }; // rad: the sun's disk, about 0.27°
const SAMPLES = 4; // a patch's sample points a side

// The share of a disk of unit radius whose coordinate along one axis is below s.
const below = (s) => (s <= -1 ? 0 : s >= 1 ? 1 : 0.5 + (s * Math.sqrt(1 - s * s) + Math.asin(s)) / Math.PI);
// The share of the disk (centre c, half-width w) that falls within [a, b].
const within = (c, w, a, b) => below((b - c) / w) - below((a - c) / w);

// The fraction of the sun's disk seen through the window from point p (room
// frame), toward the sun along sunDir (a unit vector). The disk's image on the
// window's plane is centred where p's ray toward the sun meets it, with a
// half-width of distance × SUN_RADIUS, stretched along each axis by how
// obliquely the ray crosses the wall; its share inside the opening, axis by
// axis. 0 when the sun is behind the wall or below the horizon. This is the
// soft-edged window patch on the table; the integration may port it to the
// shader as it stands (sqrt and asin only).
export function sunAperture(geom, p, sunDir) {
  const [sx, sy, sz] = sunDir;
  if (sz <= 0 || sy <= 1e-6) return 0;
  const wall = geom.size[1];
  const t = (wall - p[1]) / sy;
  if (t <= 0) return 0;
  const x = p[0] + sx * t, z = p[2] + sz * t;
  const w = t * SUN_RADIUS;
  const { x0, x1, z0, z1 } = geom.window;
  return Math.max(0, within(x, w * Math.hypot(1, sx / sy), x0, x1) * within(z, w * Math.hypot(1, sz / sy), z0, z1));
}

// A patch's sample points, a little off its face.
function samplesOf(geom, p) {
  const s = geom.surfaces[p.surface];
  const [u0, u1, v0, v1] = p.rect;
  const out = [];
  for (let j = 0; j < SAMPLES; j++) {
    for (let i = 0; i < SAMPLES; i++) {
      const a = u0 + ((i + 0.5) / SAMPLES) * (u1 - u0), b = v0 + ((j + 0.5) / SAMPLES) * (v1 - v0);
      out.push([0, 1, 2].map((k) => s.origin[k] + s.u[k] * a + s.v[k] * b + p.normal[k] * 1e-6));
    }
  }
  return out;
}

// The light each patch receives directly: Float64Array n × N, W / m² per bin.
//   sunDir   room-frame unit vector toward the sun
//   sun      irradiance normal to the beam, after the air (N values)
//   outside  dir → radiance (N values) seen looking out along dir (the sky above, the ground below), or null
//   flames   [{ pos: [x, y, z] (m), intensity: W / sr per bin (N values) }]
//   glass    the window's transmittance (N values; default clear)
// opens: which openings let the outside in ({ door, shutters }: outside.md Phase 4; a shut one is a wall)
export function directLight(geom, { sunDir = [0, 0, -1], sun = null, outside = null, flames = [], glass = null, opens = null } = {}) {
  const n = geom.patches.length, m = geom.openings.length;
  const letsIn = (o) => (o.kind === 'door' ? !!opens?.door : opens?.shutters !== false);
  const E = new Float64Array(n * N);
  const pass = glass ?? new Float64Array(N).fill(1);
  const far = geom.surfaces.findIndex((s) => s.id === 'wall-far');
  const sunUp = sun && sunDir[2] > 0 && sunDir[1] > 0 && opens?.shutters !== false;
  for (let i = 0; i < n; i++) {
    const p = geom.patches[i];
    const nr = p.normal;
    const pts = samplesOf(geom, p);
    const o = i * N;
    // the sun: lit where the disk shows through the window and nothing in the room is in the way
    if (sunUp) {
      const cos = nr[0] * sunDir[0] + nr[1] * sunDir[1] + nr[2] * sunDir[2];
      if (cos > 0) {
        let lit = 0;
        for (const q of pts) {
          const ap = sunAperture(geom, q, sunDir);
          if (ap <= 0) continue;
          const toWall = (geom.size[1] - q[1]) / sunDir[1];
          if (!hit(geom, q, sunDir, toWall * (1 - 1e-9), far)) lit += ap;
        }
        const k = (cos * lit) / pts.length;
        if (k > 0) for (let b = 0; b < N; b++) E[o + b] += sun[b] * k * pass[b];
      }
    }
    // the sky and the ground, through each opening it sees
    if (outside && geom.W) {
      for (let w = 0; w < m; w++) {
        const f = geom.W[i * m + w];
        if (!(f > 0) || !letsIn(geom.openings[w])) continue;
        const c = geom.openings[w].center;
        const d = [c[0] - p.center[0], c[1] - p.center[1], c[2] - p.center[2]];
        const len = Math.hypot(...d);
        const L = outside(d.map((v) => v / len));
        for (let b = 0; b < N; b++) E[o + b] += f * Math.PI * L[b] * pass[b];
      }
    }
    // the flames: points, falling off with distance, shadowed by what is between
    for (const fl of flames) {
      let k = 0;
      for (const q of pts) {
        const d = [fl.pos[0] - q[0], fl.pos[1] - q[1], fl.pos[2] - q[2]];
        const d2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        const len = Math.sqrt(d2);
        const cos = (nr[0] * d[0] + nr[1] * d[1] + nr[2] * d[2]) / len;
        if (cos <= 0) continue;
        if (hit(geom, q, d.map((v) => v / len), len * (1 - 1e-9))) continue;
        k += cos / d2;
      }
      k /= pts.length;
      if (k > 0) for (let b = 0; b < N; b++) E[o + b] += fl.intensity[b] * k;
    }
  }
  return E;
}
