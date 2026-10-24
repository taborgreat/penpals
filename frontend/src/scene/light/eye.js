// The eye (light-waves §7) is matter too: it takes in the light that reaches
// it and reacts like everything else. It sits on the being's head, looking
// where the head faces; this is its own reactions, per viewer, for the
// session, never in the record.
//
//   pupil       opens in dim light and closes in bright: about a second to
//               tighten, several seconds to open
//   gain        the retina's own adaptation over the pupil's: quick to bright
//               light, slow to the dark
//   colour      drifts toward treating the light it sees as white: almost
//               fully in bright light (noon reads white), only partly in dim
//               (candlelight stays warm); the strength follows the light level
//   lids        can close (lids down, dark) and open
//   colour on   can see in luminance only (black and white) until colour is
//               let in (rooms.md §1a)
// What you notice: a flare then settling when the light jumps; the warm page
// slowly tuning in after looking away from the window; dazzle at the sun.
//
//   eye.step(state, incoming, dt, { lids, color }) → state   (incoming: the
//     radiance spectrum reaching the eye, averaged over what it sees; lids
//     and color: where they are headed, 0..1)
//   toScreen(seen, state, { lids, color }) → sRGB 0..1     (seen: one look's radiance)
// The screen: seen(λ) → XYZ (CIE 1931 2° at the bins) → adapted → linear sRGB
// → exposure → tone curve → sRGB.

import { N } from './axis.js';
import { CMF } from './curves.js';
import { xyzOf, LUMENS, D65, adaptDegree, brightness, screenMatrix, display, tone, encode, KNEE } from './color.js';

export const TIGHTEN_S = 0.22; // the pupil closing (time constant, s)
export const OPEN_S = 2.5; // the pupil opening
export const BRIGHTER_S = 0.15; // the retina's gain falling to bright light
export const DARKER_S = 3; // and rising in the dark
export const WHITE_S = 4; // colour adaptation drifting
export const LEVEL_S = 1; // the light level colour adaptation follows
export const LID_CLOSE_S = 0.12; // lids coming down (a ramp)
export const LID_OPEN_S = 0.3; // and lifting
export const COLOR_S = 1.5; // colour coming in (or going)
const L_MIN = 1e-4; // cd / m²: darker than this is as dark as it gets

// The settled pupil at a light level (Moon and Spencer), mm.
export const pupilAt = (L) => 4.9 - 3 * Math.tanh(0.4 * Math.log10(Math.max(L, L_MIN)));
const area = (d) => (Math.PI * d * d) / 4;
// The retina's settled gain (log): with the settled pupil, the light level lands where it looks (color.js brightness).
const gainAt = (L) => Math.log(brightness(Math.max(L, L_MIN)) / (Math.max(L, L_MIN) * area(pupilAt(L))));
const toward = (v, target, dt, up, down) => v + (target - v) * (1 - Math.exp(-dt / (target > v ? up : down)));

// What multiplies the light's luminance (cd / m²) on its way to the screen.
export const exposureOf = (state) => area(state.pupil) * Math.exp(state.gain);

// An eye settled on light of level L (cd / m²), white as the screen's white.
export function createEye({ level = 100, white = D65, lids = 1, color = 1 } = {}) {
  return { pupil: pupilAt(level), gain: gainAt(level), level, white: white.map((v) => v / white[1]), lids, color };
}

// An eye settled on this light (what it would be after looking long enough).
export function settledOn(incoming, opts) {
  const xyz = xyzOf(incoming, CMF, LUMENS);
  return createEye({ ...opts, level: xyz[1], white: xyz[1] > L_MIN ? xyz : D65 });
}

export function step(state, incoming, dt, { lids = state.lids, color = state.color } = {}) {
  const s = { ...state };
  const xyz = xyzOf(incoming, CMF, LUMENS).map((v) => v * s.lids); // closed lids let nothing in
  const L = Math.max(xyz[1], L_MIN);
  s.pupil = toward(s.pupil, pupilAt(L), dt, OPEN_S, TIGHTEN_S);
  s.gain = toward(s.gain, gainAt(L), dt, DARKER_S, BRIGHTER_S);
  s.level = Math.exp(toward(Math.log(Math.max(s.level, L_MIN)), Math.log(L), dt, LEVEL_S, LEVEL_S));
  if (xyz[1] > L_MIN) {
    const k = 1 - Math.exp(-dt / WHITE_S);
    s.white = s.white.map((v, c) => v + (xyz[c] / xyz[1] - v) * k);
  }
  s.lids = lids > s.lids ? Math.min(lids, s.lids + dt / LID_OPEN_S) : Math.max(lids, s.lids - dt / LID_CLOSE_S);
  s.color = s.color + (color - s.color) * (1 - Math.exp(-dt / COLOR_S));
  return s;
}

// How far the eye is treating its light as white right now (0..ADAPT_MAX).
export const adaptationOf = (state) => adaptDegree(state.level);

// The screen matrix for this state (color.js): XYZ → linear sRGB before the tone curve.
const matrixOf = (state, { lids = state.lids, color = state.color } = {}) =>
  screenMatrix(state.white, adaptDegree(state.level), exposureOf(state), { lids, color });

// One look's radiance → sRGB 0..1.
export const toScreen = (seen, state, opts) => display(xyzOf(seen, CMF, LUMENS), matrixOf(state, opts));
export const toBytes = (rgb) => rgb.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));

// For the shader's per-band loop: the 3 × N weights that take a radiance
// spectrum straight to the screen's linear sRGB (before EYE_GLSL's eyeTone and
// sRGB), row-major: r = Σ w[b] · seen[b], then g, then b. Changes only as the
// eye does, so it is set once a frame.
export function screenWeights(state, opts) {
  const m = matrixOf(state, opts);
  const w = new Float32Array(3 * N);
  for (let c = 0; c < 3; c++) {
    for (let b = 0; b < N; b++) w[c * N + b] = LUMENS * (m[c][0] * CMF.x[b] + m[c][1] * CMF.y[b] + m[c][2] * CMF.z[b]);
  }
  return w;
}

// The tone curve and sRGB in GLSL, the same as color.js's tone and encode.
export const EYE_GLSL = /* glsl */ `
vec3 eyeTone(vec3 x) {
  vec3 over = ${KNEE.toFixed(4)} + ${(1 - KNEE).toFixed(4)} * tanh((x - ${KNEE.toFixed(4)}) / ${(1 - KNEE).toFixed(4)});
  return mix(max(x, 0.0), over, step(${KNEE.toFixed(4)}, x));
}
vec3 eyeSrgb(vec3 v) {
  return mix(12.92 * v, 1.055 * pow(v, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, v));
}`;
export { tone, encode };

// Depth of field (optional, Tabor's to turn on): the blur circle, as an angle
// (rad), of something `depth` m away when the eye focuses at `focus` m.
export const DEPTH_OF_FIELD = false;
export const blurOf = (state, depth, focus) => (state.pupil / 1000) * Math.abs(1 / Math.max(depth, 1e-3) - 1 / Math.max(focus, 1e-3));
