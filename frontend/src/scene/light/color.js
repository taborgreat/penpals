// How the eye's colour works, without its state (light-waves §7): from a
// spectrum to the screen. A spectrum's XYZ (the CIE 1931 2° matching
// functions at the bins: the weights come with the curve table), the
// adaptation that drifts toward treating the light it sees as white (a von
// Kries gain in CAT02 cone space, by degree D), then linear sRGB, exposure,
// black and white or colour, the lids, a tone curve and sRGB.
//
// Also the yardsticks the tests hold the light to: CIELAB and ΔE (CIEDE2000).
// Pure maths; the curve table's maker (scripts/curves.mjs) uses this too, so
// it imports no table.

const mat = (m, v) => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];
const matMul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));

export const LUMENS = 683; // lm / W at 555 nm: luminance (cd / m²) = 683 · Y of radiance
export const D65 = [0.95047, 1, 1.08883]; // the screen's white
const XYZ_TO_RGB = [[3.2404542, -1.5371385, -0.4985314], [-0.969266, 1.8760108, 0.041556], [0.0556434, -0.2040259, 1.0572252]];
const RGB_TO_XYZ = [[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.072175], [0.0193339, 0.119192, 0.9503041]];
const CAT02 = [[0.7328, 0.4296, -0.1624], [-0.7036, 1.6975, 0.0061], [0.003, 0.0136, 0.9834]];
const CAT02_INV = [[1.096124, -0.278869, 0.182745], [0.454369, 0.473533, 0.072098], [-0.009628, -0.005698, 1.015326]];

export const xyzToLinear = (xyz) => mat(XYZ_TO_RGB, xyz);
export const linearToXyz = (rgb) => mat(RGB_TO_XYZ, rgb);
export const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
export const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export const hexToSrgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.replace('#', '').slice(i - 1, i + 1), 16) / 255);

// A spectrum's XYZ with the binned matching functions `cmf` ({ x, y, z }, each
// the function's average over its bin, as the light's values are each bin's
// power): radiance → XYZ with Y in cd / m² when `k` is LUMENS, else relative.
export function xyzOf(s, cmf, k = 1) {
  let X = 0, Y = 0, Z = 0;
  for (let i = 0; i < cmf.y.length; i++) {
    X += s[i] * cmf.x[i];
    Y += s[i] * cmf.y[i];
    Z += s[i] * cmf.z[i];
  }
  return [X * k, Y * k, Z * k];
}

// --- adaptation ---
// How far the eye goes toward treating what it sees as white: almost all the
// way in bright light (noon reads white), only partly in dim light (candlelight
// stays warm). The strength follows the light level, so no dial.
export const ADAPT_MAX = 0.97;
export const ADAPT_HALF = 10; // cd / m² at which it goes half way
export const adaptDegree = (L) => (ADAPT_MAX * Math.max(0, L)) / (Math.max(0, L) + ADAPT_HALF);

// The 3 × 3 that takes XYZ seen under `white` (XYZ, any scale) to XYZ as the
// screen shows it, adapted by degree D (CAT02 von Kries, toward D65).
export function adaptMatrix(white, D) {
  const w = mat(CAT02, white.map((v) => v / Math.max(1e-30, white[1])));
  const d = mat(CAT02, D65);
  const g = [0, 1, 2].map((c) => D * (d[c] / Math.max(1e-30, w[c])) + (1 - D));
  return matMul(CAT02_INV, CAT02.map((row, c) => row.map((v) => v * g[c])));
}

// --- the screen ---
// How bright a light level looks once the eye has settled on it (the adapted
// white's place on the screen, 0..1): bright light reads white, dim light dim.
export const DIM_L = 2; // cd / m²: the level that looks half as bright as day
export const DIM_Q = 0.8;
export const brightness = (L) => {
  const q = Math.max(0, L) ** DIM_Q;
  return q / (q + DIM_L ** DIM_Q);
};

// The tone curve: exact up to KNEE (so colours under it are what they are),
// then a soft shoulder into white for what is brighter than the adapted white.
export const KNEE = 0.9;
export const tone = (x) => (x <= KNEE ? Math.max(0, x) : KNEE + (1 - KNEE) * Math.tanh((x - KNEE) / (1 - KNEE)));

// The linear map from XYZ to the screen's linear sRGB before the tone curve:
// adapted, exposed by k, black and white mixed by `color` (0: luminance only,
// 1: full colour), darkened by the lids (0 closed, 1 open).
export function screenMatrix(white, D, k, { color = 1, lids = 1 } = {}) {
  const m = matMul(XYZ_TO_RGB, adaptMatrix(white, D)).map((row) => row.map((v) => v * k * lids));
  const grey = [0, 1, 2].map((j) => 0.2126 * m[0][j] + 0.7152 * m[1][j] + 0.0722 * m[2][j]);
  return m.map((row) => row.map((v, j) => color * v + (1 - color) * grey[j]));
}
// XYZ → sRGB 0..1 through a screen matrix.
export const display = (xyz, m) => mat(m, xyz).map((v) => encode(tone(v)));

// --- yardsticks ---
const labF = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
export function xyzToLab([X, Y, Z], white = D65) {
  const fx = labF(X / white[0]), fy = labF(Y / white[1]), fz = labF(Z / white[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const srgbToLab = (rgb) => xyzToLab(linearToXyz(rgb.map(decode)));

// CIEDE2000 (Sharma, Wu and Dalal's formulation).
export function deltaE([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1 = hue(b1, a1p), h2 = hue(b2, a2p);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) dh = Math.abs(h2 - h1) <= 180 ? h2 - h1 : h2 - h1 > 180 ? h2 - h1 - 360 : h2 - h1 + 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2;
  if (C1p * C2p !== 0) hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
