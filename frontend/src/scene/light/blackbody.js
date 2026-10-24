// A black body on the axis (light-waves §2): the sun before the air (about
// 5800 K) and a candle flame (about 1850 K) are both one. Planck's law, each
// visible bin integrated over its width, the heat bin exactly (the tail of
// Planck's law past 710 nm has a closed form).

import { BINS, BIN_NM, LAMBDA, N, HEAT, HEAT_FROM_NM } from './axis.js';

const H = 6.62607015e-34; // J s
const C = 299792458; // m / s
const K = 1.380649e-23; // J / K
const C2 = (H * C) / K; // m K

// Spectral radiance at `nm` nanometres and `T` kelvin, W / m² / sr / nm.
export function planck(nm, T) {
  const l = nm * 1e-9;
  return ((2 * H * C * C) / l ** 5 / Math.expm1(C2 / (l * T))) * 1e-9;
}

// Radiance from `nm` to infinitely long waves, W / m² / sr: in x = hc / λkT,
// ∫ x³ / (eˣ − 1) dx from 0 to x0 = π⁴/15 − Σ e^(−n·x0) (x0³/n + 3x0²/n² + 6x0/n³ + 6/n⁴).
export function planckTail(nm, T) {
  const x0 = C2 / (nm * 1e-9 * T);
  let tail = 0;
  for (let n = 1; n < 200; n++) {
    const t = Math.exp(-n * x0) * (x0 ** 3 / n + (3 * x0 ** 2) / n ** 2 + (6 * x0) / n ** 3 + 6 / n ** 4);
    tail += t;
    if (t < 1e-17) break;
  }
  return ((2 * K ** 4 * T ** 4) / (H ** 3 * C * C)) * (Math.PI ** 4 / 15 - tail);
}

// A black body's radiance on the axis, W / m² / sr per bin (Simpson's rule
// over each bin's 20 nm). Light shorter than 390 nm is on no bin.
export function blackbody(T) {
  const s = new Float64Array(N);
  const h = BIN_NM / 4;
  for (let i = 0; i < BINS; i++) {
    const a = LAMBDA[i] - BIN_NM / 2;
    const f = [0, 1, 2, 3, 4].map((k) => planck(a + k * h, T));
    s[i] = (h / 3) * (f[0] + 4 * f[1] + 2 * f[2] + 4 * f[3] + f[4]);
  }
  s[HEAT] = planckTail(HEAT_FROM_NM, T);
  return s;
}
