// The sounds of life (world.md Phase 6). The beings themselves (bugs, birds; later fish) are grown in
// outside.md Part 4, as matter; here only what they sound like. Each is a being, so its sounds are its
// acts, heard as they happen: never placed on the pulse, never tuned (sound/music.js leaves them be).
//   Chirp     a gall bug chirps as fast as its body is warm, and it is as warm as the air: Dolbear's law
//             (chirps a minute = 7.2 × °C − 32, the snowy tree cricket's); too cold, it is still. Each
//             chirp a few strokes of its file across its scraper, its wing ringing at its own pitch.
//   Song      a bird sings most at dawn (the sun just up: as the light grows), less through the day,
//             not at all in the dark; it shelters from rain.
//   Wingbeat  a wing's stroke pushes the air: each beat a soft rush, as often as it flaps.
//   chirpRate(°C) → chirps a second     chirps(bug, from, to, °C) → events
//   singing(sunEl (°), rain (mm/h)) → 0..1 (how much of the time it sings)
//   wingbeats(flyer, from, to) → events   (flyer: { pos, flaps (a second), mass (kg), seed })
import { BANDS, knock } from './bands.js';

// What the beings will carry themselves once outside.md Part 4 grows them (Tabor's to set until then):
// how far a chirp strays from its slot (of a period), a chirp's length and its wing's ring (Q); the
// dawn chorus (the sun's height it peaks at, how wide in degrees, how much is sung the rest of the
// day); the rain a bird shelters from (mm/h).
export const LIFE = Object.freeze({ stray: 0.3, chirp: { dur: 0.06, q: 30 }, dawn: { el: 4, width: 8, rest: 0.15 }, shelter: 0.5 });

// Dolbear (1897): chirps a minute = 4·°F − 160
export const chirpRate = (c) => Math.max(0, 4 * (c * 1.8 + 32) - 160) / 60;

const fmix = (h) => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
const mix = (a, b) => fmix((fmix(a >>> 0) + Math.imul(b, 0x9e3779b9)) >>> 0) / 4294967296;

// A bug's chirps in [from, to) (s): each one in its own slot of the bug's period, a little early or
// late (seeded: a living thing, never a clock). bug: { pos, seed, pitch (Hz: its wing's ring), loud
// (W: what its stroke puts into the air) }
export function chirps(bug, from, to, c) {
  const rate = chirpRate(c);
  if (!rate) return [];
  const out = [];
  for (let k = Math.floor(from * rate); k < to * rate; k++) {
    const t = (k + 0.5 + LIFE.stray * (mix(bug.seed, k) - 0.5)) / rate;
    if (t < from || t >= to) continue;
    const bands = BANDS.map((f) => (f > bug.pitch / 2 && f < bug.pitch * 2 ? bug.loud : 0)); // (its ring, an octave about)
    out.push({ kind: 'chirp', being: true, t, pos: bug.pos, bands, dur: LIFE.chirp.dur, attack: 1 / bug.pitch, seed: fmix(bug.seed ^ k), ring: { f: bug.pitch, q: LIFE.chirp.q, share: 1 } });
  }
  return out;
}

// How much of the time a bird sings: with the light as it comes (the sun just over the horizon most),
// nothing in the dark, sheltering in rain.
export function singing(sunEl, rain = 0) {
  if (sunEl < -6 || rain > LIFE.shelter) return 0; // (night, past civil twilight; rain)
  const dawn = Math.exp(-(((sunEl - LIFE.dawn.el) / LIFE.dawn.width) ** 2)); // (the chorus: the light coming in)
  return Math.min(1, LIFE.dawn.rest + (1 - LIFE.dawn.rest) * dawn);
}

// A flyer's wingbeats in [from, to): each downstroke a rush of the air it pushes, its energy what the
// stroke must give to hold its weight up for that beat (its weight × the beat's time × the air it
// pushes down), spread as a knock as short as half a beat.
export function wingbeats(f, from, to) {
  const out = [];
  for (let k = Math.ceil(from * f.flaps); k < to * f.flaps; k++) {
    const t = k / f.flaps;
    const beat = 1 / f.flaps;
    const E = 0.5 * f.mass * (9.81 * beat) ** 2; // J: the lift a beat, as the air it throws down
    const kn = knock(E, beat / 2);
    out.push({ kind: 'wingbeat', being: true, t, pos: f.pos, bands: kn.bands, dur: beat / 2, attack: beat / 8, seed: fmix(f.seed ^ k) });
  }
  return out;
}
