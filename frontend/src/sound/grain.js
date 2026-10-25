// A sound grain (world.md Phase 1): an event's spread of frequencies as seeded noise in its ten bands,
// shaped in time (a quick rise, a fall to silence), and, where its matter rings, a resonance. Seeded by
// the event, so no two grains are alike and the same event sounds the same everywhere.
//   grain({ bands (10 energies), dur (s), attack (s), seed, rate, ring: { f, q, share } }) → Float32Array
import { BANDS, NB } from './bands.js';

// a seeded stream of numbers in [-1, 1)
export function noise(seed) {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return (a >>> 0) / 2147483648 - 1;
  };
}
// a band-pass biquad (an octave wide) at f, for `rate` (the RBJ cookbook's constant-peak band-pass)
function bandpass(f, rate, q = Math.SQRT2) {
  const w = (2 * Math.PI * Math.min(f, rate * 0.45)) / rate;
  const al = Math.sin(w) / (2 * q);
  const a0 = 1 + al;
  return { b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w)) / a0, a2: (1 - al) / a0 };
}
const filters = new Map(); // rate → the bands' filters
const bankFor = (rate) =>
  filters.get(rate) ??
  (filters.set(
    rate,
    BANDS.map((f) => bandpass(f, rate)),
  ),
  filters.get(rate));

// Noise of a spectrum (the bands' energies) into out (added), times env(i).
export function shaped(out, bands, rand, rate, env = () => 1) {
  const bank = bankFor(rate);
  const n = out.length;
  const src = new Float32Array(n);
  for (let i = 0; i < n; i++) src[i] = rand();
  for (let b = 0; b < NB; b++) {
    const e = bands[b];
    if (!(e > 1e-9) || BANDS[b] > rate * 0.45) continue;
    const { b0, b2, a1, a2 } = bank[b];
    const g = Math.sqrt(e) * 2; // (an octave's share of white noise, back to its energy)
    let x1 = 0,
      x2 = 0,
      y1 = 0,
      y2 = 0;
    for (let i = 0; i < n; i++) {
      const x = src[i];
      const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      out[i] += g * y * env(i);
    }
  }
  return out;
}

// How long, at its full level, a grain's energy would last (s): its rise and its fall to silence.
export const worth = ({ dur = 0.03, attack = 0.002 }) => attack / 3 + Math.max(0, dur - attack) / (2 * Math.log(1000));

export function grain({ bands, dur = 0.03, attack = 0.002, seed = 1, rate = 48000, ring = null }) {
  const n = Math.max(8, Math.ceil(dur * rate));
  const out = new Float32Array(n);
  const rise = Math.max(1, Math.round(attack * rate));
  const fall = Math.log(1000) / Math.max(1, n - rise); // to −60 dB by its end
  const env = (i) => (i < rise ? i / rise : Math.exp(-(i - rise) * fall));
  shaped(out, bands, noise(seed), rate, env);
  if (ring) {
    // a matter that rings (glass, metal): a decaying tone at its pitch, its share of the energy
    const w = (2 * Math.PI * ring.f) / rate;
    const amp = Math.sqrt(ring.share * bands.reduce((a, e) => a + e, 0));
    const tau = ring.q / (Math.PI * ring.f); // s
    for (let i = 0; i < n; i++) out[i] += amp * Math.sin(w * i) * Math.exp(-i / rate / tau) * (i < rise ? i / rise : 1);
  }
  return out;
}
