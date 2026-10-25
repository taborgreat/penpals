// Outside the window (light-waves §5): the sky dome by the air's own rule
// (blue overhead, pale at the horizon, burning near the sun at sunrise and
// sunset, empty at night), the sun's disk with its transmitted spectrum (white
// at noon, red at the horizon: looking at it dazzles the eye), and the ground:
// a field, green because living matter drinks red and blue, lit by the same
// sun and sky, with a few far tree lines standing against the sky as
// silhouettes, paled by the air between.
//
// One look outward is a radiance spectrum (W / m² / sr per bin) for a
// room-frame direction (air.js). The window's light in the room is these
// looks through the glass (direct.js); the view out of the window draws them.

import { N } from './axis.js';
import { sky, sunLight, skyIrradiance, elevationOf, BETA, SUN_RADIUS } from './air.js';
import { MATTER } from './curves.js';

const rad = (d) => (d * Math.PI) / 180;

// Far tree lines: the angular height of the treetops (degrees) at each
// azimuth, a few ragged belts at different distances. Grown from a seed like
// everything else (a fixed default in this layer).
export const TREES_SEED = 0x7e3a91c5;
const belts = (seed) => {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: 4 }, () => ({ at: rnd() * 360, width: 30 + rnd() * 70, height: 1.2 + rnd() * 2.8, far: 1.5 + rnd() * 4 }));
};
const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// The treetops' height at azimuth az (degrees: 0 straight out of the window),
// and how far away those trees are (in airs: how much the air pales them).
export function treeline(az, seed = TREES_SEED) {
  let top = 0,
    far = 0;
  for (const b of belts(seed)) {
    const d = angle(az, b.at) / (b.width / 2);
    if (d >= 1) continue;
    const ragged = 0.75 + 0.25 * Math.sin(az * 2.7 + b.at) * Math.sin(az * 7.1 + b.far); // crowns, not a wall
    const h = b.height * Math.sqrt(1 - d * d) * ragged;
    if (h > top) {
      top = h;
      far = b.far;
    }
  }
  return { top, far };
}

// The look outward, for a sun toward `sunDir`: → (dir) → radiance spectrum.
// What the ground and the trees are lit by is worked out once per sun.
// A deck of cloud (world.md Phase 5) turning back `cloud` of the light (law/weather.js): its droplets
// scatter every wave alike, so it is white, and grey as it thickens. Its optical depth τ (cloud =
// τ / (τ + 7.7), the two-stream share turned back); of the light on its top, e^−τ comes through
// straight, the rest it lets through comes out of its underside every way alike.
export function deckOf(cloud = 0) {
  if (!(cloud > 0)) return { through: 1, glow: 0 };
  const tau = (7.7 * cloud) / (1 - Math.min(cloud, 0.999));
  const through = Math.exp(-tau);
  return { through, glow: Math.max(0, 1 - cloud - through) };
}

export function outsideAt(sunDir, { seed = TREES_SEED, cloud = 0 } = {}) {
  const el = elevationOf(sunDir);
  const deck = deckOf(cloud);
  const clearBeam = sunLight(el);
  const clearSky = skyIrradiance([0, 0, 1], sunDir);
  const top = clearSky.map((v, i) => v + clearBeam[i] * Math.max(0, sunDir[2])); // on a level face above the deck
  const under = top.map((v) => (v * deck.glow) / Math.PI); // the deck's underside, as bright every way
  const beam = clearBeam.map((v) => v * deck.through);
  const disk = beam.map((v) => v / (Math.PI * SUN_RADIUS * SUN_RADIUS)); // the disk's radiance
  const fromSky = clearSky.map((v, i) => v * deck.through + under[i] * Math.PI);
  const level = fromSky.map((v, i) => v + beam[i] * Math.max(0, sunDir[2])); // on the field
  const ground = level.map((v, i) => (MATTER.grass[i] * v) / Math.PI);
  const crowns = fromSky.map((v, i) => (MATTER.leaf[i] * 0.5 * v) / Math.PI); // the trees' shaded sides face us
  const horizon = new Float64Array(N);
  return (dir, out = new Float64Array(N)) => {
    const z = dir[2];
    if (z <= 0) {
      out.set(ground);
      return out;
    }
    const az = (Math.atan2(dir[0], dir[1]) * 180) / Math.PI;
    const { top, far } = treeline(az, seed);
    if (z < Math.sin(rad(top))) {
      // a tree line: its own light, paled toward the horizon's sky by the air between
      sky([dir[0], dir[1], 0.02], sunDir, horizon);
      for (let i = 0; i < N; i++) {
        const t = Math.exp(-BETA[i] * far);
        out[i] = crowns[i] * t + horizon[i] * (1 - t);
      }
      return out;
    }
    sky(dir, sunDir, out);
    for (let i = 0; i < N; i++) out[i] = out[i] * deck.through + under[i];
    const c = dir[0] * sunDir[0] + dir[1] * sunDir[1] + dir[2] * sunDir[2];
    if (c > Math.cos(SUN_RADIUS)) for (let i = 0; i < N; i++) out[i] += disk[i];
    return out;
  };
}

// The view out, as an equirectangular map: w × h looks (azimuth −180..180
// across, elevation 90..−90 down), each N values: for the integration to draw
// the sky dome and the field behind the glass when the sun moves.
// A sky of one radiance every way and the field under it (what a flash of lightning in the clouds
// is, at unit strength): what the room takes through its window from it.
export const evenSky = (dir, out = new Float64Array(N)) => {
  for (let i = 0; i < N; i++) out[i] = dir[2] > 0 ? 1 : MATTER.grass[i];
  return out;
};

export function outsideMap(sunDir, w, h, opts) {
  const look = outsideAt(sunDir, opts);
  const map = new Float32Array(w * h * N);
  const s = new Float64Array(N);
  for (let y = 0; y < h; y++) {
    const e = rad(90 - (180 * (y + 0.5)) / h);
    for (let x = 0; x < w; x++) {
      const a = rad(-180 + (360 * (x + 0.5)) / w);
      look([Math.sin(a) * Math.cos(e), Math.cos(a) * Math.cos(e), Math.sin(e)], s);
      map.set(s, (y * w + x) * N);
    }
  }
  return map;
}
