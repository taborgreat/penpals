// Fading by absorbed light (light-waves §8): light fades what it is drunk by.
// The law's flat fade (depth-water-gall §5: every channel by the same share)
// becomes one per channel, by how much of a fixed reference daylight that
// channel's curve drinks:
//
//   drunk[ch] = Σ_λ daylight(λ) · (1 − exp(−A_ch(λ)))     (curves.js DRUNK, per unit absorbance)
//   fade[ch]  = FADE[ exposure · drunk[ch] · SURFACE[depth] ]
//
// Still at view time from the exposure count, still a pure function of the
// facts, the age bucket and the exposure bucket, in integers like the law's
// look: inks fade by what they absorb (a red ink, drinking the green and blue
// where daylight is strong, fades sooner than a blue one), and surface ink
// before sunk ink. At zero exposure nothing fades, so the canonical look and
// its digest are untouched.

import { FADE, SURFACE } from 'penpals-law/v2/tables';
import { THICK, FADE_SHIFT } from 'penpals-law/v2/constants';
import { exposureBucket } from 'penpals-law/v2/look';
import { DRUNK } from './curves.js';

// What is left (0..256) of each channel's ink, and of its oak gall, after
// `views` at `depth` (the cell's depth fact, levels of THICK): [r, g, b, gall].
export function fadeByLight(views, depth) {
  if (!views) return [256, 256, 256, 256];
  const lit = exposureBucket(views) * SURFACE[Math.min(THICK, Math.max(0, depth))];
  return DRUNK.map((d) => FADE[Math.min(FADE.length - 1, Math.floor((lit * d) / (256 << FADE_SHIFT)))]);
}

// A cell's absorbances after fading: `abs` the law's three channels (F0..F2),
// `gall` its gall amount (matter.js gallAmount). → { abs, gall }
export function fadedInk(abs, gall, views, depth) {
  const f = fadeByLight(views, depth);
  return { abs: abs.map((a, c) => Math.floor((a * f[c]) / 256)), gall: Math.floor((gall * f[3]) / 256) };
}
