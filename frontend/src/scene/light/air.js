// The sun and the air (light-waves §2, §3). The sun is a black body at about
// 5800 K before the air, placed by the world's clock and its day of the year
// (law/sun.js: the one sun, whose light the trees drink; its facts are the law's). The air is thin
// matter that scatters by wavelength, short waves far more than long ones and
// more the longer the path, so the light that comes straight through is white
// at noon, gold low and red at sunset, and the light it scatters is the sky:
//
//   β(λ)    = β0 · (550 / λ)^4 + haze(λ)       scattering strength per wavelength
//   path    = 1 / max(sin(elevation), 0.05)     longer when the sun is low
//   sun(λ)  = grant(λ) · exp(−β(λ) · path)
//   sky(λ, view direction)                      single scattering in a flat
//            layer of air: what the sun beam loses on the way down, turned
//            toward the eye and dimmed on its own way out
//
// The haze is the air's dust: thin matter too, scattering nearly all waves
// alike and mostly forward, so the sky is brighter toward the sun and pales
// at the horizon. Night is the absence of the sun's grant: below the horizon
// the beam is gone, and once the sun is TWILIGHT_EL under it the sky has
// nothing left to scatter. Nothing is painted dark or blue.
//
// Directions are in the room frame (room.js): x to the writer's right, y away
// from the seated writer (toward the window), z up; unit vectors toward the
// light or along the view.

import { SUN, SKY, WORLD, sunAt } from 'penpals-law/sun';
import { N, HEAT, HEAT_NM, LAMBDA } from './axis.js';
import { blackbody } from './blackbody.js';

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const SUN_K = SUN.temp;
export const SUN_RADIUS = SUN.radius / SUN.distance; // the sun's angular radius, rad (a disk, so the window's patch has soft edges)
const SUN_DISTANCE = (SUN.radius / SUN.distance) ** 2; // (solar radius / its distance)²
export const BETA0 = SKY.scatter; // the air's straight-up scattering at 550 nm
export const HAZE = SKY.haze; // the haze's straight-up scattering at 550 nm
const HAZE_FALL = SKY.hazeFall; // the haze scatters as λ^−fall
const HAZE_G = SKY.hazeForward; // and that far forward (Henyey–Greenstein)
export const MIN_SIN = SKY.minSin; // the longest path is 20 airs
export const TWILIGHT_EL = -6; // degrees: the sun this far down leaves the sky nothing to scatter

const nm = (i) => (i === HEAT ? HEAT_NM : LAMBDA[i]);
export const BETA_AIR = Float64Array.from({ length: N }, (_, i) => BETA0 * (550 / nm(i)) ** 4);
export const BETA_HAZE = Float64Array.from({ length: N }, (_, i) => HAZE * (550 / nm(i)) ** HAZE_FALL);
export const BETA = BETA_AIR.map((v, i) => v + BETA_HAZE[i]);

// What the sun grants before the air: irradiance on a surface facing it, W / m² per bin.
export const GRANT = blackbody(SUN_K).map((v) => Math.PI * v * SUN_DISTANCE);

// How many airs a ray crosses at this elevation (degrees).
export const airPath = (el) => 1 / Math.max(Math.sin(rad(el)), MIN_SIN);

// How much of the sun's disk stands above the horizon (el its centre's elevation, degrees).
export function sunVisible(el) {
  const h = rad(el) / SUN_RADIUS; // the centre's height in radii
  if (h >= 1) return 1;
  if (h <= -1) return 0;
  return 1 - (Math.acos(h) - h * Math.sqrt(1 - h * h)) / Math.PI; // the circle above a chord
}

// The sun as it reaches the ground: irradiance normal to the beam, W / m² per bin.
export function sunLight(el) {
  const path = airPath(el);
  const seen = sunVisible(el);
  return GRANT.map((g, i) => g * Math.exp(-BETA[i] * path) * seen);
}

// Where the sun stands at an instant (a Date, or anything with getTime): the law's sun
// (law/sun.js) over the world's place, the window facing south, so it rises on the
// writer's left and sets on their right, highest at the sun's noon, higher and longer up
// in the summer. → { az, el } degrees.
export function sunPlace(date) {
  const [east, north, up] = sunAt(date.getTime());
  return { el: deg(Math.asin(Math.max(-1, Math.min(1, up)))), az: deg(Math.atan2(-east, -north)) };
}
// The room-frame direction toward a light at azimuth az (0: straight ahead,
// beyond the window; −90 the writer's left) and elevation el, degrees.
export function toward(az, el) {
  const a = rad(az), e = rad(el);
  return [Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)];
}
export const elevationOf = (dir) => deg(Math.asin(Math.max(-1, Math.min(1, dir[2]))));

// How much of the sun's light the air still has to scatter (1 by day, fading
// through twilight, 0 at night).
export function skyLit(el) {
  const t = clamp01((el - TWILIGHT_EL) / -TWILIGHT_EL);
  return t * t * (3 - 2 * t);
}

const rayleigh = (c) => 0.75 * (1 + c * c);
const henyey = (c) => (1 - HAZE_G * HAZE_G) / (1 + HAZE_G * HAZE_G - 2 * HAZE_G * c) ** 1.5;

// The sky's radiance looking along `dir` (unit, up into the sky), with the sun
// toward `sunDir`: W / m² / sr per bin. Below the horizon: none (the ground is outside.js's).
export function sky(dir, sunDir, out = new Float64Array(N)) {
  out.fill(0);
  const el = elevationOf(sunDir);
  const lit = skyLit(el);
  if (dir[2] <= 0 || lit <= 0) return out;
  const mv = 1 / Math.max(dir[2], MIN_SIN);
  const ms = 1 / Math.max(sunDir[2], MIN_SIN);
  const c = dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2];
  const pr = rayleigh(c), ph = henyey(c);
  for (let i = 0; i < N; i++) {
    const t = BETA[i];
    const phase = (BETA_AIR[i] * pr + BETA_HAZE[i] * ph) / t;
    const d = ms - mv;
    const path = Math.abs(d) < 1e-9 ? t * Math.exp(-t * mv) : (Math.exp(-t * mv) - Math.exp(-t * ms)) / d;
    out[i] = (GRANT[i] * lit * phase * mv * path) / (4 * Math.PI);
  }
  return out;
}

// The sky's light on a surface facing `normal`: ∫ sky · cos over the part of
// the sky it faces, by a fixed equal-area grid. W / m² per bin.
export function skyIrradiance(normal, sunDir, rings = 24, spokes = 48) {
  const e = new Float64Array(N);
  const s = new Float64Array(N);
  const dw = (2 * Math.PI) / (rings * spokes); // each cell's solid angle (z uniform in 0..1)
  for (let r = 0; r < rings; r++) {
    const z = (r + 0.5) / rings;
    const rho = Math.sqrt(1 - z * z);
    for (let k = 0; k < spokes; k++) {
      const phi = ((k + 0.5) / spokes) * 2 * Math.PI;
      const d = [rho * Math.cos(phi), rho * Math.sin(phi), z];
      const cos = d[0] * normal[0] + d[1] * normal[1] + d[2] * normal[2];
      if (cos <= 0) continue;
      sky(d, sunDir, s);
      for (let i = 0; i < N; i++) e[i] += s[i] * cos * dw;
    }
  }
  return e;
}

// Daylight on the ground (a level surface): the sun's beam plus the sky. W / m² per bin.
export function daylight(sunDir) {
  const el = elevationOf(sunDir);
  const beam = sunLight(el);
  const sin = Math.max(0, sunDir[2]);
  const s = skyIrradiance([0, 0, 1], sunDir);
  return s.map((v, i) => v + beam[i] * sin);
}

export const NOON_EL = 90 - WORLD.latitude + WORLD.obliquity; // the year's highest sun (noon at midsummer)
