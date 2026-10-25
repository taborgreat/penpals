// The sun (one-matter.md Phase 7; light-waves §2): one sun for the world, by the world's clock.
//
// Its place: the earth leans `obliquity` to its path round the sun, and the world stands at
// `latitude`, so through the year the sun climbs higher and stays up longer, then sinks lower and
// sets sooner. Its light: a black body at the sun's heat, at the sun's distance, through the air:
// the air scatters short waves far more than long (λ^−4) and its haze all waves nearly alike,
// more the longer the path; of what it scatters, the air sends half down and the haze, scattering
// forward, more. What reaches a level face of the ground is what a tree's leaves drink, and what
// warms the day: the ground gives its heat back to the air above it (its film) and to the sky
// (its glow, 4σT³ a kelvin), so a day is as much warmer than the year's mean as its sun is.
//
// Everything a law reads here is reckoned with + − × ÷ alone (law/dmath.js): the same everywhere.
// The scene draws the same sun (frontend/src/scene/light/air.js takes its facts from here).

import { sin, cos, exp, pow } from './dmath.js';
import { AIR } from './matter.js';

export const SUN = Object.freeze({ temp: 5800, radius: 6.957e8, distance: 1.495978707e11 }); // K, m, m
// The air's light (light-waves §2): its straight-up scattering at 550 nm, the haze's, how the
// haze's falls with wavelength (λ^−fall), how far forward the haze scatters (Henyey–Greenstein g),
// and the longest path (1 / this many airs).
export const SKY = Object.freeze({ scatter: 0.1, haze: 0.04, hazeFall: 1.3, hazeForward: 0.76, minSin: 0.05 });
// The world's place: its latitude (degrees north) and longitude (east; west is negative), the earth's
// lean, the year (days) and the day of the year of the March equinox (Jan 1 is day 0).
export const WORLD = Object.freeze({ latitude: 45.44, longitude: -122.68, obliquity: 23.44, year: 365.2422, equinox: 78.8 });

const TAU = 6.283185307179586;
const RAD = TAU / 360;
const SIGMA = 5.670374419e-8; // W/(m²·K⁴)
const H = 6.62607015e-34,
  C = 299792458,
  K = 1.380649e-23;

// The light the sun grants per waveband (W/m² facing it, before the air), and the air's scattering
// in each: 300–2500 nm in 25 nm bands (made when first asked for: the sun's place needs none of it)
let BANDS = null,
  LEVEL = null,
  DAYS = null;
function bands() {
  BANDS = [];
  for (let nm = 312.5; nm < 2500; nm += 25) {
    const l = nm * 1e-9;
    const planck = (2 * H * C * C) / (l * l * l * l * l) / (exp((H * C) / (l * K * SUN.temp)) - 1); // W/(m²·sr·m)
    const ratio = (SUN.radius / SUN.distance) * (SUN.radius / SUN.distance);
    const air = SKY.scatter * pow(550 / nm, 4);
    const haze = SKY.haze * pow(550 / nm, SKY.hazeFall);
    BANDS.push({ grant: Math.PI * planck * ratio * 25e-9, air, haze });
  }
  LEVEL = new Float64Array(STEPS + 1);
  for (let k = 0; k <= STEPS; k++) {
    const s = k / STEPS;
    if (s === 0) continue;
    const m = 1 / Math.max(s, SKY.minSin);
    let w = 0;
    for (const b of BANDS) {
      const t = b.air + b.haze;
      const through = exp(-t * m);
      const scattered = 1 - through;
      const down = t > 0 ? (b.air * 0.5 + b.haze * (1 + SKY.hazeForward) * 0.5) / t : 0;
      w += b.grant * s * (through + scattered * down);
    }
    LEVEL[k] = w;
  }
}
// W/m² on a level face of the ground, the sun at sin(elevation) = s (a table: 1024 steps of s)
const STEPS = 1024;
export function levelLight(s) {
  if (s <= 0) return 0;
  if (!LEVEL) bands();
  const x = Math.min(1, s) * STEPS;
  const k = Math.floor(x);
  return k >= STEPS ? LEVEL[STEPS] : LEVEL[k] + (LEVEL[k + 1] - LEVEL[k]) * (x - k);
}

const PHI = WORLD.latitude * RAD;
const SIN_PHI = sin(PHI),
  COS_PHI = cos(PHI);
const SIN_EPS = sin(WORLD.obliquity * RAD);
const MINUTES = 1440;
const COS_HOUR = Float64Array.from({ length: MINUTES }, (_, m) => cos((TAU * (m + 0.5)) / MINUTES - TAU / 2));

// The sun's lean (declination) on a day of the year (a fraction of days since Jan 1): sin and cos,
// and whether the days are lengthening (from the winter's shortest day to the summer's longest).
function lean(doy) {
  const lam = (TAU * (doy - WORLD.equinox)) / WORLD.year;
  const s = SIN_EPS * sin(lam);
  return { s, c: Math.sqrt(1 - s * s), lengthening: cos(lam) > 0 };
}

// Each day of the year (0..365, its middle): its light on a level face (J/m²), its length (minutes
// of sun), whether it is lengthening, the sun's height at noon (sin), and its warmth (°C).
function days() {
  DAYS = [];
  for (let d = 0; d <= 365; d++) {
    const { s, c, lengthening } = lean(d + 0.5);
    let light = 0,
      up = 0;
    for (let m = 0; m < MINUTES; m++) {
      const e = SIN_PHI * s + COS_PHI * c * COS_HOUR[m];
      if (e > 0) {
        up++;
        light += levelLight(e) * 60;
      }
    }
    DAYS.push({ light, minutes: up, lengthening, noon: SIN_PHI * s + COS_PHI * c });
  }
  const T0 = AIR.temp + 273.15;
  const GIVE = AIR.film + 4 * SIGMA * T0 * T0 * T0; // W/(m²·K): the ground's heat back to the air and the sky
  const MEAN = DAYS.slice(0, 365).reduce((n, d) => n + d.light, 0) / 365 / 86400;
  for (const d of DAYS) d.warmth = AIR.temp + (d.light / 86400 - MEAN) / GIVE;
  Object.freeze(DAYS);
}

// The day of the year (0..365) of a day counted from Jan 1 of year 0.
export const dayOfYear = (day) => Math.floor(day - Math.floor(day / WORLD.year) * WORLD.year);
export const yearOf = (day) => Math.floor(day / WORLD.year);
// A day (counted from Jan 1 of year 0): { light, minutes, lengthening, noon, warmth }.
export const dayOf = (day) => (DAYS || days(), DAYS[Math.min(365, dayOfYear(day))]);

// Toward the sun at an hour (0..24) of a day of the year: [east, north, up], unit.
export function sunToward(doy, hour) {
  const { s, c } = lean(doy + hour / 24);
  const h = (TAU * hour) / 24 - TAU / 2;
  const ch = cos(h),
    sh = sin(h);
  return [-c * sh, COS_PHI * s - SIN_PHI * c * ch, SIN_PHI * s + COS_PHI * c * ch];
}

// Toward the sun at an instant (ms since 1970, UTC): the world's own sun time is UTC moved by its
// longitude (an hour each 15°), so the clock on the wall (Pacific, with its summer hour) is not the sun's.
export function sunAt(ms) {
  const d = new Date(ms + (WORLD.longitude / 15) * 3600000);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000;
  return sunToward(doy, d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600);
}
