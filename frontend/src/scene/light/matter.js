// Matter drinks by wavelength (light-waves §6). Every kind of matter has an
// absorption curve on the axis; what it drinks becomes heat, what it refuses
// is reflected. Colour is what matter refuses to drink: nothing is painted.
//
//   ink     the law's three absorbance channels stay sealed as they are; the
//           scene expands them with three fixed, smooth, overlapping basis
//           curves (curves.js INK), A_ink(λ) = a_r·B_r(λ) + a_g·B_g(λ) + a_b·B_b(λ),
//           chosen so a palette colour under noon daylight matches its swatch.
//           Oak gall adds its own curve, scaled by darkness.
//   a cell  R(λ) = R_surface(λ) · exp(−A_ink(λ))
//   paper   the picker's colour mapped to a curve through the same basis (its
//           colour as if it were ink on a perfect white), so it, too, matches
//   grown   plaster and wood cells mix their surface's light and dark curves
//           by the cell's tone (surface.js): R = mix(light, dark, tone / 255),
//           linear, so a region's average tone gives its average colour
// Gloss is roughness, a property apart: wet beads reflect the light's own
// spectrum like a mirror.

import { N, HEAT } from './axis.js';
import { INK, GALL, MATTER, PAPER_HEAT } from './curves.js';
import { GALL_ABS } from 'penpals-law/v2/sim';
import { GALL_FRESH } from 'penpals-law/v2/constants';

export { MATTER };

// A cell's ink as absorbance by wavelength. `abs`: the law's three channels
// (1/1024 absorbance, as F0..F2 in the facts); `gall`: the law's gall at its
// darkness (gallAmount below).
export function inkAbsorbance(abs, gall = 0, out = new Float64Array(N)) {
  const r = abs[0] / 1024, g = abs[1] / 1024, b = abs[2] / 1024, k = gall / GALL_ABS;
  for (let i = 0; i < N; i++) out[i] = r * INK[0][i] + g * INK[1][i] + b * INK[2][i] + k * GALL[i];
  return out;
}

// Oak gall's strength as the law shows it: the fixed gall FG at its darkness
// (0..256, look.js gallDark), from GALL_FRESH of its strength fresh to all of it.
export const gallAmount = (fg, dark) => (fg * (GALL_FRESH + ((256 - GALL_FRESH) * dark) / 256)) / 256;

// What a cell refuses: R(λ) = R_surface(λ) · exp(−A_ink(λ)).
export function cellReflectance(surface, abs, gall = 0, out = new Float64Array(N)) {
  inkAbsorbance(abs, gall, out);
  for (let i = 0; i < N; i++) out[i] = surface[i] * Math.exp(-out[i]);
  return out;
}

// The paper's curve from its colour (sRGB 0..255, the picker's): as if that
// colour were ink on a perfect white; in the heat bin, paper's own.
export function paperCurve(rgb) {
  const abs = rgb.map((c) => 1024 * Math.log(255 / Math.max(1, c)));
  const R = cellReflectance(new Float64Array(N).fill(1), abs);
  R[HEAT] = PAPER_HEAT;
  return R;
}

// A grown cell's curve: its surface's light and dark curves mixed by tone (0..255).
// `kind`: 'plaster' | 'floor' | 'table'.
export function grownCurve(kind, tone, out = new Float64Array(N)) {
  const { light, dark } = MATTER[kind];
  const t = tone / 255;
  for (let i = 0; i < N; i++) out[i] = light[i] + (dark[i] - light[i]) * t;
  return out;
}

// What a patch drinks, per bin, from what it refuses (the bounce solver's runtime input).
export const absorptionOf = (R) => R.map((v) => 1 - v);

// A whole set of patches' absorption, n × N: `curveOf(patch, i)` gives each one's
// averaged reflectance (a surface's mean tone, the page's paper and ink, ...).
export function patchAbsorption(patches, curveOf) {
  const a = new Float64Array(patches.length * N);
  patches.forEach((p, i) => {
    const R = curveOf(p, i);
    for (let b = 0; b < N; b++) a[i * N + b] = 1 - R[b];
  });
  return a;
}

// The page's averaged reflectance (it is one patch): its paper, with the
// inked cells' own curves in their share. `inked`: [{ abs, gall }] per inked
// cell; `cells`: how many cells the page has in all.
export function pageCurve(paper, inked, cells) {
  const sum = Float64Array.from(paper, (v) => v * Math.max(0, cells - inked.length));
  const R = new Float64Array(N);
  for (const c of inked) {
    cellReflectance(paper, c.abs, c.gall ?? 0, R);
    for (let i = 0; i < N; i++) sum[i] += R[i];
  }
  return sum.map((v) => v / Math.max(1, cells));
}

// Gloss: how rough each matter's surface is (0 a mirror, 1 matte), and how
// much of the light a smooth face sends back like a mirror, the light's own
// spectrum (Schlick's Fresnel, F0 by matter).
export const ROUGHNESS = Object.freeze({ paper: 0.9, plaster: 1, floor: 0.4, table: 0.3, wax: 0.35, wick: 1, brass: 0.25, wet: 0.03, glass: 0 });
export const F0 = Object.freeze({ wet: 0.02, glass: 0.04, wax: 0.03, floor: 0.04, table: 0.04 }); // (a metal's mirror is its own colour: brass reflects by its curve)
export const fresnel = (f0, cos) => f0 + (1 - f0) * (1 - Math.max(0, Math.min(1, cos))) ** 5;
