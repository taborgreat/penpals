// The sounds of life (world.md Phase 6; outside.md Part 4). The beings themselves (gall bugs, hive bugs,
// birds) are law/life.js's, each of its own matter (law/matter.js BEINGS: what each is, its voice with
// it); here what they sound like. Each is a being, so its sounds are its acts, heard as they happen:
// never placed on the pulse, never tuned (sound/music.js leaves them be).
//   Chirp     a gall bug chirps as fast as its body is warm, and it is as warm as the air: Dolbear's law
//             (chirps a minute = 7.2 × °C − 32, the snowy tree cricket's); too cold, it is still. Each
//             chirp a few strokes of its file across its scraper, its wing ringing at its own pitch.
//   Song      a bird sings most at dawn (the sun just up: as the light grows), less through the day,
//             not at all in the dark; it shelters from rain. A phrase is its notes, each about its voice.
//   Wingbeat  a wing's stroke pushes the air: each beat a soft rush, as often as it flaps; a wing beating
//             faster than the ear tells beats apart (the lowest band's) is a hum at its beat.
//   chirpRate(°C) → chirps a second     chirps(bug, from, to, °C) → events
//   singing(sunEl (°), rain (mm/h)) → 0..1 (how much of the time it sings)
//   songs(bird, from, to, share) → events          wingbeats(flyer, from, to) → events
//   (bug: { pos, seed, pitch, loud }; bird: { pos, seed }; flyer: { pos, flaps (a second), mass (kg), seed,
//   q (its wing's ring: its matter's, 1000 / loss) })
import { BEINGS } from 'penpals-law/matter';
import { BANDS, knock } from './bands.js';

const CHIRP = BEINGS.gallbug.chirp,
  SONG = BEINGS.bird.song;

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
const octave = (f, loud) => BANDS.map((b) => (b > f / 2 && b < f * 2 ? loud : 0)); // (its ring, an octave about)

// A bug's chirps in [from, to) (s): each one in its own slot of the bug's period, a little early or
// late (seeded: a living thing, never a clock). bug: { pos, seed, pitch (Hz: its wing's ring), loud
// (W: what its stroke puts into the air) }
export function chirps(bug, from, to, c) {
  const rate = chirpRate(c);
  if (!rate) return [];
  const out = [];
  for (let k = Math.floor(from * rate); k < to * rate; k++) {
    const t = (k + 0.5 + CHIRP.stray * (mix(bug.seed, k) - 0.5)) / rate;
    if (t < from || t >= to) continue;
    out.push({
      kind: 'chirp',
      being: true,
      t,
      pos: bug.pos,
      bands: octave(bug.pitch, bug.loud),
      dur: CHIRP.dur,
      attack: 1 / bug.pitch,
      seed: fmix(bug.seed ^ k),
      ring: { f: bug.pitch, q: CHIRP.q, share: 1 },
    });
  }
  return out;
}

// How much of the time a bird sings: with the light as it comes (the sun just over the horizon most),
// nothing in the dark, sheltering in rain.
export function singing(sunEl, rain = 0) {
  if (sunEl < -6 || rain > SONG.shelter) return 0; // (night, past civil twilight; rain)
  const dawn = Math.exp(-(((sunEl - SONG.dawn.el) / SONG.dawn.width) ** 2)); // (the chorus: the light coming in)
  return Math.min(1, SONG.dawn.rest + (1 - SONG.dawn.rest) * dawn);
}

// A bird's song in [from, to): its time in slots a phrase and as long a rest; a slot sung as often as
// it sings (share, seeded); each note of a phrase about its voice (an octave either way, seeded).
export function songs(bird, from, to, share) {
  const slot = 2 * SONG.notes * SONG.note;
  const out = [];
  for (let k = Math.floor(from / slot); k * slot < to; k++) {
    if (mix(bird.seed, k) >= share) continue;
    for (let j = 0; j < SONG.notes; j++) {
      const t = k * slot + j * SONG.note;
      if (t < from || t >= to) continue;
      const f = SONG.pitch * 2 ** (mix(bird.seed ^ 0x5bd1e995, k * SONG.notes + j) - 0.5);
      out.push({
        kind: 'song',
        being: true,
        t,
        pos: bird.pos,
        bands: octave(f, SONG.loud),
        dur: SONG.note,
        attack: 1 / f,
        seed: fmix(bird.seed ^ (k * SONG.notes + j)),
        ring: { f, q: SONG.q, share: 1 },
      });
    }
  }
  return out;
}

// A flyer's wingbeats in [from, to): each downstroke a rush of the air it pushes, its energy what the
// stroke must give to hold its weight up for that beat (its weight × the beat's time × the air it
// pushes down), spread as a knock as short as half a beat. Beating faster than the lowest band, the
// beats run together: a hum at its beat, a second at a time, as much as its beats in it.
export function wingbeats(f, from, to) {
  const out = [];
  const beat = 1 / f.flaps;
  const E = 0.5 * f.mass * (9.81 * beat) ** 2; // J: the lift a beat, as the air it throws down
  if (f.flaps >= BANDS[0]) {
    for (let k = Math.ceil(from); k < to; k++) {
      const kn = knock(E * f.flaps, 1);
      out.push({ kind: 'hum', being: true, t: k, pos: f.pos, bands: kn.bands, dur: 1, attack: beat, seed: fmix(f.seed ^ k), ring: { f: f.flaps, q: f.q, share: 1 } });
    }
    return out;
  }
  for (let k = Math.ceil(from * f.flaps); k < to * f.flaps; k++) {
    const kn = knock(E, beat / 2);
    out.push({ kind: 'wingbeat', being: true, t: k * beat, pos: f.pos, bands: kn.bands, dur: beat / 2, attack: beat / 8, seed: fmix(f.seed ^ k) });
  }
  return out;
}
