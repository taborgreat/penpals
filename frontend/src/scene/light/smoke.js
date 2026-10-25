// The room's smoke as light takes it (world.md Phase 3b): thin matter, as the sky's air and haze are
// (air.js). Its soot's grains (law/matter.js smoke.grains) are far smaller than light's waves, so
// each drinks light as a small absorbing sphere does and turns a little of it aside (Rayleigh's: with
// K = (m² − 1) / (m² + 2) of their refractive index m and x = πd / λ, a grain drinks 4x·Im K and
// turns aside ⁸⁄₃ x⁴ |K|² of its cross-section; a kilogram of them drinks 6π·Im K / (ρλ) m²). A smoky
// room dims, bluer light most; its flames and its light glow in the air.
//   hazeOf(soot (kg/m³ of grains)) → { ext, sca } (1/m per bin: what a metre of it takes out of a
//     beam, and what it turns aside)
import { matter } from 'penpals-law';
import { N, HEAT, HEAT_NM, LAMBDA } from './axis.js';

const G = matter.MATTER.smoke.grains;
const n = G.ior / 1000,
  k = G.absorbs / 1000;
// K = (m² − 1) / (m² + 2), m = n − ik
const re2 = n * n - k * k,
  im2 = -2 * n * k;
const den = (re2 + 2) ** 2 + im2 * im2;
const Kre = ((re2 - 1) * (re2 + 2) + im2 * im2) / den,
  Kim = (im2 * (re2 + 2) - (re2 - 1) * im2) / den;
const d = G.size * 1e-9;
const area = (Math.PI * d * d) / 4,
  mass = (G.density * Math.PI * d * d * d) / 6;
const lambdaOf = (b) => (b === HEAT ? HEAT_NM : LAMBDA[b]) * 1e-9;

// a kilogram of grains: what it drinks and what it turns aside, m² per bin
export const DRINKS = Float64Array.from({ length: N }, (_, b) => (6 * Math.PI * Math.abs(Kim)) / (G.density * lambdaOf(b)));
export const TURNS = Float64Array.from({ length: N }, (_, b) => {
  const x = (Math.PI * d) / lambdaOf(b);
  return ((8 / 3) * x ** 4 * (Kre * Kre + Kim * Kim) * area) / mass;
});

export function hazeOf(soot) {
  const sca = TURNS.map((t) => t * soot);
  return { ext: DRINKS.map((a, b) => a * soot + sca[b]), sca };
}
