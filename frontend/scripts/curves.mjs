// Makes the light's one literal table of curves (src/scene/light/curves.js,
// light-waves §1 and §6): every spectrum the scene's light uses, on the axis.
//   node scripts/curves.mjs          write the table
//   node scripts/curves.mjs --check  only report how well it fits
// Not part of the build: the table is committed, and this is how it was made.
//
//   CMF       the CIE 1931 2° matching functions, each averaged over its bin
//             (from the 10 nm table below, trapezoid over the bin's 20 nm)
//   DAYLIGHT  the reference daylight: noon (the clock's highest sun, 68°) on
//             level ground, sun and sky, from air.js
//   INK       the three smooth, overlapping basis curves that turn the law's
//             three sealed absorbances into absorbance by wavelength
//             (A(λ) = a_r·B_r(λ) + a_g·B_g(λ) + a_b·B_b(λ)), fitted so every
//             palette colour under noon daylight, through the eye settled on a
//             white page, matches its swatch
//   GALL      oak gall's own curve at full darkness, fitted to its swatch
//   MATTER    reflectances: plaster, the floor's and the table's wood, and the
//             things' matter (brass, wax, wick, cloth, skin, the ink in its jar), each a light and a
//             dark curve the grown cells mix between; grass, leaves, and the
//             window glass's transmittance
//   DRUNK     how much of the reference daylight each ink channel (and gall)
//             drinks, per unit absorbance, ×256 with a mean of 256 (fade.js)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { N, BINS, LAMBDA, HEAT } from '../src/scene/light/axis.js';
import { daylight, toward, NOON_EL } from '../src/scene/light/air.js';
import { xyzOf, LUMENS, adaptDegree, brightness, screenMatrix, display, srgbToLab, hexToSrgb, deltaE } from '../src/scene/light/color.js';
import { SIGNATURE_COLORS } from '../src/hand/colors.js';
import { OAK_GALL, GALL_FRESH } from 'penpals-law/v2/constants';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'src', 'scene', 'light', 'curves.js');

// CIE 1931 2° standard observer, 380–720 nm every 10 nm: x̄, ȳ, z̄.
const CIE = {
  380: [0.001368, 0.000039, 0.00645], 390: [0.004243, 0.00012, 0.02005], 400: [0.01431, 0.000396, 0.06785],
  410: [0.04351, 0.00121, 0.2074], 420: [0.13438, 0.004, 0.6456], 430: [0.2839, 0.0116, 1.3856],
  440: [0.34828, 0.023, 1.74706], 450: [0.3362, 0.038, 1.77211], 460: [0.2908, 0.06, 1.6692],
  470: [0.19536, 0.09098, 1.28764], 480: [0.09564, 0.13902, 0.81295], 490: [0.03201, 0.20802, 0.46518],
  500: [0.0049, 0.323, 0.272], 510: [0.0093, 0.503, 0.1582], 520: [0.06327, 0.71, 0.07825],
  530: [0.1655, 0.862, 0.04216], 540: [0.2904, 0.954, 0.0203], 550: [0.43345, 0.99495, 0.00875],
  560: [0.5945, 0.995, 0.0039], 570: [0.7621, 0.952, 0.0021], 580: [0.9163, 0.87, 0.00165],
  590: [1.0263, 0.757, 0.0011], 600: [1.0622, 0.631, 0.0008], 610: [1.0026, 0.503, 0.00034],
  620: [0.85445, 0.381, 0.00019], 630: [0.6424, 0.265, 0.00005], 640: [0.4479, 0.175, 0.00002],
  650: [0.2835, 0.107, 0], 660: [0.1649, 0.061, 0], 670: [0.0874, 0.032, 0], 680: [0.04677, 0.017, 0],
  690: [0.0227, 0.00821, 0], 700: [0.011359, 0.004102, 0], 710: [0.00579, 0.002091, 0], 720: [0.002899, 0.001047, 0],
};
const cmfBin = (k) => Float64Array.from({ length: N }, (_, i) => (i === HEAT ? 0 : 0.25 * CIE[LAMBDA[i] - 10][k] + 0.5 * CIE[LAMBDA[i]][k] + 0.25 * CIE[LAMBDA[i] + 10][k]));
const CMF = { x: cmfBin(0), y: cmfBin(1), z: cmfBin(2) };

// --- matter: smooth shapes on the axis (the heat bin given on its own) ---
const curve = (f, heat) => Float64Array.from({ length: N }, (_, i) => (i === HEAT ? heat : f(LAMBDA[i])));
const rise = (l, at, w) => 1 / (1 + Math.exp(-(l - at) / w)); // 0 → 1 across `at`
const bump = (l, at, w) => Math.exp(-(((l - at) / w) ** 2));
const MATTER = {
  // lime plaster: bright, a little warm; the dark curve is its tone shifts
  plaster: { light: curve((l) => 0.8 + 0.08 * rise(l, 480, 40), 0.8), dark: curve((l) => 0.7 + 0.12 * rise(l, 500, 45), 0.74) },
  // oak boards, oiled: earlywood light, latewood darker and redder
  floor: { light: curve((l) => 0.1 + 0.45 * rise(l, 590, 55), 0.55), dark: curve((l) => 0.05 + 0.3 * rise(l, 610, 55), 0.45) },
  // walnut table: darker still
  table: { light: curve((l) => 0.06 + 0.26 * rise(l, 615, 60), 0.42), dark: curve((l) => 0.03 + 0.14 * rise(l, 630, 60), 0.32) },
  // the things (matter-fixes §3): grown like the walls, each between its light and dark
  // a cream candle; the dark its deeper pours
  wax: { light: curve((l) => 0.68 + 0.14 * rise(l, 470, 25), 0.6), dark: curve((l) => 0.58 + 0.17 * rise(l, 485, 28), 0.56) },
  // cotton, charred: grey where the flame has not reached, black where it has
  wick: { light: curve(() => 0.14, 0.12), dark: curve(() => 0.04, 0.05) },
  // the candles' holders, the nib: a metal, gold because it drinks the blue; tarnish is darker and browner
  brass: { light: curve((l) => 0.3 + 0.55 * rise(l, 545, 38), 0.92), dark: curve((l) => 0.12 + 0.3 * rise(l, 575, 42), 0.85) },
  // the beings' cloth: undyed wool, warm grey; the dark its denser threads
  cloth: { light: curve((l) => 0.32 + 0.16 * rise(l, 560, 60), 0.5), dark: curve((l) => 0.14 + 0.1 * rise(l, 580, 60), 0.42) },
  // their head and hands: skin drinks the blue and some green (its blood), lets the red back
  skin: { light: curve((l) => 0.3 + 0.38 * rise(l, 575, 30), 0.62), dark: curve((l) => 0.18 + 0.3 * rise(l, 595, 30), 0.56) },
  // living matter drinks red and blue: chlorophyll, and the bright near-infrared past the red edge
  grass: curve((l) => 0.04 + 0.09 * bump(l, 550, 32) + 0.4 * rise(l, 715, 10), 0.45),
  leaf: curve((l) => 0.025 + 0.06 * bump(l, 550, 30) + 0.3 * rise(l, 715, 10), 0.35),
  glass: curve((l) => 0.9 - 0.02 * bump(l, 400, 30) - 0.015 * rise(l, 650, 30), 0.75), // transmittance
  // the ground's matter (outside.md Phase 6): still water seen from above (its face turns back a little
  // of every wave; what goes in, its depth drinks, the red most); clay, reddened by its iron; ore, rust
  // red-brown and dark; plain stone, grey, the dark its weathered faces
  water: curve((l) => 0.03 + 0.03 * bump(l, 500, 60), 0.02),
  clay: { light: curve((l) => 0.12 + 0.3 * rise(l, 585, 45), 0.5), dark: curve((l) => 0.07 + 0.2 * rise(l, 600, 45), 0.42) },
  ore: { light: curve((l) => 0.06 + 0.22 * rise(l, 600, 35), 0.35), dark: curve((l) => 0.04 + 0.12 * rise(l, 610, 35), 0.3) },
  stone: { light: curve((l) => 0.3 + 0.04 * rise(l, 600, 80), 0.35), dark: curve((l) => 0.16 + 0.03 * rise(l, 600, 80), 0.25) },
};
const PAPER_HEAT = 0.72; // paper's reflectance in the heat bin (its visible curve comes from its colour, matter.js)
const INK_HEAT = 0; // dyes are clear past the red
const GALL_HEAT = 0.1;

// --- seeing a reflectance as the eye settled on a white page at noon does ---
const NOON = daylight(toward(0, NOON_EL));
const white = NOON.map((v) => v / Math.PI); // a white page's radiance
const WXYZ = xyzOf(white, CMF, LUMENS);
const SCREEN = screenMatrix(WXYZ, adaptDegree(WXYZ[1]), brightness(WXYZ[1]) / WXYZ[1]);
const seen = (R) => display(xyzOf(white.map((v, i) => v * R[i]), CMF, LUMENS), SCREEN);
const labOf = (R) => srgbToLab(seen(R));

// The law's absorbance of a colour (ABS_Q, in absorbance units): a = ln(255 / c), c = 0 as 1.
const absOf = (rgb255) => rgb255.map((c) => Math.log(255 / Math.max(1, c)));
const toRgb = (hex) => hexToSrgb(hex).map((v) => Math.round(v * 255));
const reflect = (B, a) => Float64Array.from({ length: N }, (_, i) => Math.exp(-(a[0] * B[0][i] + a[1] * B[1][i] + a[2] * B[2][i])));

// What the basis is fitted to: the palette, the papers, a few greys.
const PALETTE = SIGNATURE_COLORS.map((c) => ({ name: c.id, rgb: toRgb(c.light), w: 2, palette: true }));
const PAPERS = [['plain', '#f7f3ea'], ['cream', '#f2e8d0'], ['parchment', '#eddcb6']].map(([name, hex]) => ({ name, rgb: toRgb(hex), w: 0.5 }));
const GREYS = [40, 96, 160, 220].map((g) => ({ name: `grey ${g}`, rgb: [g, g, g], w: 2 }));
const TARGETS = [...PALETTE, ...PAPERS, ...GREYS].map((t) => ({ ...t, a: absOf(t.rgb), lab: srgbToLab(t.rgb.map((v) => v / 255)) }));

// --- a small Levenberg–Marquardt with a numeric Jacobian ---
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}
function fit(residual, p0, iterations = 200) {
  let p = [...p0];
  let r = residual(p);
  let cost = r.reduce((s, v) => s + v * v, 0);
  let mu = 1e-3;
  for (let it = 0; it < iterations; it++) {
    const J = p.map((_, j) => {
      const q = [...p];
      q[j] += 1e-6;
      return residual(q).map((v, i) => (v - r[i]) / 1e-6);
    }); // J[j][i]: column j
    const JtJ = p.map((_, a) => p.map((__, b) => J[a].reduce((s, v, i) => s + v * J[b][i], 0)));
    const Jtr = p.map((_, a) => J[a].reduce((s, v, i) => s + v * r[i], 0));
    let better = false;
    for (let tries = 0; tries < 12 && !better; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => v + (a === b ? mu * (v + 1e-9) : 0)));
      const d = solveLinear(A, Jtr.map((v) => -v));
      const q = p.map((v, j) => v + d[j]);
      const rq = residual(q);
      const cq = rq.reduce((s, v) => s + v * v, 0);
      if (cq < cost) {
        p = q;
        r = rq;
        better = cost - cq > 1e-12 * cost;
        cost = cq;
        mu = Math.max(1e-9, mu / 3);
        if (!better) return p;
      } else mu *= 4;
    }
    if (!better) break;
  }
  return p;
}

// The basis: each curve a soft window, B(λ) = A · rise(λ, lo, s1) · rise(−λ, −hi, s2):
// smooth and single-humped by its shape, its edges overlapping its neighbours'.
// Parameters per curve: log A, lo, hi, log s1, log s2 (nm). Edges are kept from
// growing sharper than SOFTEST nm.
const SOFTEST = 14;
const windowCurve = ([la, lo, hi, l1, l2]) => (l) => Math.exp(la) * rise(l, lo, Math.exp(l1)) * rise(-l, -hi, Math.exp(l2));
const unpack = (p) => [0, 1, 2].map((k) => curve(windowCurve(p.slice(5 * k, 5 * k + 5)), INK_HEAT));
function inkResidual(p) {
  const B = unpack(p);
  const r = [];
  for (const t of TARGETS) {
    const lab = labOf(reflect(B, t.a));
    for (let c = 0; c < 3; c++) r.push((lab[c] - t.lab[c]) * t.w);
  }
  for (let k = 0; k < 3; k++) for (const j of [3, 4]) r.push(4 * Math.max(0, Math.log(SOFTEST) - p[5 * k + j]));
  return r;
}
const START = [[2.4, 585, 760, 14, 20], [2.4, 490, 590, 14, 14], [2.4, 340, 495, 20, 14]].flatMap(([a, lo, hi, s1, s2]) => [Math.log(a), lo, hi, Math.log(s1), Math.log(s2)]);
const check = process.argv.includes('--check');
const INK = unpack(fit(inkResidual, START));

// Oak gall: at full darkness its swatch, freshly written its pale tint (the
// law's GALL_FRESH share of its strength), one smooth curve.
const gallTarget = (share) => {
  const rgb = OAK_GALL.map((c) => Math.round(255 * (c / 255) ** share));
  return { rgb, lab: srgbToLab(rgb.map((v) => v / 255)) };
};
const GALL_TARGETS = [{ share: 1, ...gallTarget(1) }, { share: GALL_FRESH / 256, ...gallTarget(GALL_FRESH / 256) }];
const unpackGall = (p) => Float64Array.from({ length: N }, (_, i) => (i === HEAT ? GALL_HEAT : Math.exp(p[i])));
function gallResidual(p) {
  const G = unpackGall(p);
  const r = [];
  for (const t of GALL_TARGETS) {
    const lab = labOf(G.map((v) => Math.exp(-v * t.share)));
    for (let c = 0; c < 3; c++) r.push(lab[c] - t.lab[c]);
  }
  for (let i = 1; i < BINS - 1; i++) r.push(2 * (G[i - 1] - 2 * G[i] + G[i + 1]));
  return r;
}
const GALL = unpackGall(fit(gallResidual, LAMBDA.map(() => Math.log(1.6))));
// oak gall ink standing in its jar (rooms.md §3c): deep, so darker than at full darkness on a page (a
// surface × e^−A, what the gall curve is fitted to): its light as two such films over white, its dark as three
MATTER.ink = { light: GALL.map((a) => Math.exp(-2 * a)), dark: GALL.map((a) => Math.exp(-3 * a)) };

// How much of the reference daylight one unit of each channel's absorbance drinks.
const visible = (s) => s.slice(0, BINS).reduce((t, v) => t + v, 0);
const drinks = (A) => visible(NOON.map((d, i) => d * (1 - Math.exp(-A[i])))) / visible(NOON);
const gallUnit = Math.max(...OAK_GALL.map((c) => Math.log(255 / c))); // the law's GALL_ABS, in absorbance units
const raw = [...INK.map(drinks), drinks(GALL.map((v) => v / gallUnit))];
const mean = (raw[0] + raw[1] + raw[2]) / 3;
const DRUNK = raw.map((v) => Math.round((256 * v) / mean));

// --- report ---
const rows = [];
let worst = 0;
for (const t of TARGETS) {
  const e = deltaE(labOf(reflect(INK, t.a)), t.lab);
  if (t.palette) worst = Math.max(worst, e);
  rows.push(`${t.name.padEnd(10)} ΔE ${e.toFixed(2)}`);
}
for (const t of GALL_TARGETS) rows.push(`gall ${t.share === 1 ? 'dark ' : 'fresh'} ΔE ${deltaE(labOf(GALL.map((v) => Math.exp(-v * t.share))), t.lab).toFixed(2)}`);
console.log(rows.join('\n'));
console.log(`worst palette ΔE ${worst.toFixed(2)}; DRUNK ${DRUNK.join(', ')}`);
if (check) process.exit(0);

// --- the table ---
const num = (v) => (Math.abs(v) < 1e-7 ? '0' : Number(v.toPrecision(6)).toString());
const arr = (s) => `Float64Array.from([${[...s].map(num).join(', ')}])`;
const pair = (p) => `{ light: ${arr(p.light)}, dark: ${arr(p.dark)} }`;
const text = `// GENERATED by frontend/scripts/curves.mjs — do not edit. The light's curves (light-waves §1, §6).
// Every curve is ${N} values on the axis (axis.js): ${BINS} visible bins, centred ${LAMBDA[0]}–${LAMBDA[BINS - 1]} nm, then the heat bin.
// Fit: worst palette colour ΔE2000 ${worst.toFixed(2)} at noon (scripts/curves.mjs --check for every colour).

// The CIE 1931 2° matching functions, each averaged over its bin (none in the heat bin).
export const CMF = Object.freeze({ x: ${arr(CMF.x)}, y: ${arr(CMF.y)}, z: ${arr(CMF.z)} });

// The reference daylight: noon (68°) on level ground, sun and sky, W / m² per bin.
export const DAYLIGHT = ${arr(NOON)};

// The ink basis: absorbance by wavelength per unit of each of the law's three channels.
export const INK = Object.freeze([${INK.map(arr).join(', ')}]);

// Oak gall's absorbance at full darkness, for the law's GALL_ABS of gall (matter.js scales it).
export const GALL = ${arr(GALL)};

// Reflectances (glass: transmittance). Grown surfaces mix their light and dark curves by the cell's tone.
export const MATTER = Object.freeze({
  plaster: ${pair(MATTER.plaster)},
  floor: ${pair(MATTER.floor)},
  table: ${pair(MATTER.table)},
  wax: ${pair(MATTER.wax)},
  wick: ${pair(MATTER.wick)},
  brass: ${pair(MATTER.brass)},
  cloth: ${pair(MATTER.cloth)},
  skin: ${pair(MATTER.skin)},
  grass: ${arr(MATTER.grass)},
  leaf: ${arr(MATTER.leaf)},
  glass: ${arr(MATTER.glass)},
  ink: ${pair(MATTER.ink)},
  water: ${arr(MATTER.water)},
  clay: ${pair(MATTER.clay)},
  ore: ${pair(MATTER.ore)},
  stone: ${pair(MATTER.stone)},
});
export const PAPER_HEAT = ${PAPER_HEAT};

// The daylight one unit of absorbance drinks, per channel (r, g, b) and for gall: ×256, mean of r, g, b 256.
export const DRUNK = Object.freeze([${DRUNK.join(', ')}]);
`;
fs.writeFileSync(OUT, text);
console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
