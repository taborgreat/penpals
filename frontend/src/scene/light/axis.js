// The axis every spectrum shares (light-waves §1). The visible range in BINS
// bins of BIN_NM nm, centred on 400, 420, ... 700 nm (each covers its centre
// ± 10 nm, so 390–710), plus one heat bin for everything longer: invisible,
// and what matter drinks there becomes heat by the shared heat rule.
//
// Every spectrum is N = BINS + 1 numbers on this axis:
//   light   the power in each bin, integrated over its width (radiance in
//           W / m² / sr per bin, irradiance in W / m² per bin, a flame's
//           intensity in W / sr per bin)
//   matter  a fraction per bin (reflectance, transmittance, absorption)
// Pure maths, no three.js. The scene only: nothing here touches the record.

export const BINS = 16; // visible bins (Tabor's to set; the curve table is made for this count)
export const BIN_NM = 20;
export const FIRST_NM = 400; // the first bin's centre
export const N = BINS + 1;
export const HEAT = BINS; // the heat bin's index
export const HEAT_FROM_NM = FIRST_NM + (BINS - 0.5) * BIN_NM; // 710 nm: the heat bin is all that is longer
export const HEAT_NM = 1000; // where the heat bin stands for one wavelength (the air's scattering there)

// The bin centres, nm.
export const LAMBDA = Object.freeze(Array.from({ length: BINS }, (_, i) => FIRST_NM + i * BIN_NM));

export const spectrum = (fill = 0) => new Float64Array(N).fill(fill);
export const from = (values) => Float64Array.from(values);
export const scale = (s, k) => s.map((v) => v * k);
export const add = (a, b) => a.map((v, i) => v + b[i]);
export const mul = (a, b) => a.map((v, i) => v * b[i]);
export const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// a += b · k, in place (sums of many sources without making arrays)
export function addTo(a, b, k = 1, at = 0) {
  for (let i = 0; i < N; i++) a[at + i] += b[i] * k;
  return a;
}
export const total = (s) => s.reduce((t, v) => t + v, 0);
