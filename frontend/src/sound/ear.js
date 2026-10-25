// The ear (world.md Phase 1): every sound is an event, heard from where it happened, as loud as it
// is near, coloured by the air it crossed. Three tiers, by how near and how many:
//   voices  the nearest, loudest events, each its own grain, placed in space (at most VOICES; the
//           quietest gives way first), as real hearing picks out a handful at a time
//   cloud   the next few hundred, as one texture: their summed spread of frequencies, each a short
//           swell where and when it came (no grain of its own)
//   wash    the rest, as one sound shaped by their numbers: how many a second, how loud in each band
// No event is heard twice alike (each grain seeded by its event), timing is the events' own, and
// with no events nothing is done. In a room (Phase 3: sound/room.js) each voice also comes back off
// the six planes (its first reflections, from their images) and into the room's tail; a sound on the
// other side of the window is heard through it.
//
//   const ear = createEar({ out })   out (sound/audio.js, or nothing in a check): voice(grain, at, pos, h,
//                                    { scale, early, wet }), cloud(buffer, at, h), wash({ rate, bands }),
//                                    room(acoustics), idle()
//   ear.hear({ t (s), pos (room m), bands (10 energies), dur, attack, seed, kind, ring })
//   ear.head(pose)                   where the ear is: { pos, yaw, pitch }
//   ear.room(acoustics | null)       the room it is in (sound/room.js acoustics)
//   ear.space(key | null)            whose space: matter's sounds placed on the pulse and tuned to its
//                                    key (sound/music.js); a being's act as it happened
//   ear.frame(now, ahead)            what falls due before now + ahead is sounded → { voices, cloud, wash } | { idle }
import { NB } from './bands.js';
import { heard } from './hear.js';
import { grain, shaped, noise, worth } from './grain.js';
import { through, reflections, inside } from './room.js';
import { place } from './music.js';

export const VOICES = 32;
export const CLOUD = 256;

export function createEar({ out = null, rate = 48000 } = {}) {
  let pending = [];
  let head = { pos: [1.5, 2, 1.2], yaw: 0, pitch: 0 };
  let made = 0; // grains made (the cost)
  let wasIdle = true;
  let room = null;
  let space = null;
  const ear = {
    space(key) {
      space = key;
    },
    room(ac) {
      room = ac;
      out?.room?.(ac);
    },
    hear(e) {
      pending.push(e.matter && space !== null ? place(e, space) : e);
    },
    head(pose) {
      if (pose) head = pose;
    },
    get pending() {
      return pending.length;
    },
    get made() {
      return made;
    },
    frame(now, ahead = 0.05) {
      if (!pending.length) {
        if (!wasIdle) out?.idle?.();
        wasIdle = true;
        return { idle: true };
      }
      const end = now + ahead;
      const due = [],
        later = [];
      for (const e of pending) (e.t < end ? due : later).push(e);
      pending = later;
      if (!due.length) return { idle: false, voices: 0, cloud: 0, wash: 0 };
      wasIdle = false;
      const within = !!room && inside(head.pos, room.geom);
      const heardAs = due.map((ev) => {
        const e = room ? through(ev, head, room) : ev;
        const h = heard(e.pos, head);
        const bands = e.bands.map((x, b) => x * h.air[b] * h.gain * h.gain);
        return { e, h, bands, loud: bands.reduce((a, x) => a + x, 0) };
      });
      heardAs.sort((a, b) => b.loud - a.loud || a.e.seed - b.e.seed);
      const voices = heardAs.slice(0, VOICES),
        cloud = heardAs.slice(VOICES, VOICES + CLOUD),
        wash = heardAs.slice(VOICES + CLOUD);
      for (const v of voices) {
        const g = grain({ bands: v.e.bands.map((x, b) => x * v.h.air[b]), dur: v.e.dur, attack: v.e.attack, seed: v.e.seed, rate, ring: v.e.ring });
        made++;
        out?.voice?.(g, v.e.t + v.h.delay, v.e.pos, v.h, { wet: within, tune: v.e.tune });
        if (!within) continue;
        // its first reflections: the same grain from each image, as much as the face kept of it
        const e0 = v.e.bands.reduce((a, x, b) => a + x * v.h.air[b], 0) || 1;
        for (const r of reflections(v.e.pos, head.pos, room)) {
          const hr = heard(r.pos, head);
          const kept = v.e.bands.reduce((a, x, b) => a + x * hr.air[b] * r.keep[b], 0) / e0;
          out?.voice?.(g, v.e.t + hr.delay, r.pos, hr, { scale: Math.sqrt(kept), early: true, tune: v.e.tune });
        }
      }
      if (cloud.length) {
        // one texture: the cloud's summed spectrum, swelling at each of its events
        const t0 = Math.min(...cloud.map((c) => c.e.t + c.h.delay));
        const t1 = Math.max(...cloud.map((c) => c.e.t + c.h.delay + (c.e.dur ?? 0.03)));
        const n = Math.max(8, Math.ceil((t1 - t0) * rate));
        const level = new Float32Array(n);
        for (const c of cloud) {
          const at = Math.round((c.e.t + c.h.delay - t0) * rate);
          const len = Math.max(1, Math.round((c.e.dur ?? 0.03) * rate));
          const a = Math.sqrt(c.loud);
          for (let i = 0; i < len && at + i < n; i++) level[at + i] += a * Math.exp((-6.9 * i) / len);
        }
        const sum = new Array(NB).fill(0);
        for (const c of cloud) for (let b = 0; b < NB; b++) sum[b] += c.bands[b];
        const total = sum.reduce((a, x) => a + x, 0) || 1;
        const buf = shaped(
          new Float32Array(n),
          sum.map((x) => x / total),
          noise(cloud[0].e.seed),
          rate,
          (i) => level[i],
        );
        made++;
        const az = cloud.reduce((a, c) => a + c.h.az * c.loud, 0) / cloud.reduce((a, c) => a + c.loud, 0);
        out?.cloud?.(buf, t0, { az, n: cloud.length });
      }
      if (wash.length) {
        const bands = new Array(NB).fill(0);
        for (const w of wash) for (let b = 0; b < NB; b++) bands[b] += w.bands[b] * worth(w.e);
        out?.wash?.({ rate: wash.length / ahead, bands: bands.map((x) => x / ahead) }); // (its level: the grains' energy, spread over the frame)
      } else out?.wash?.(null);
      return { idle: false, voices: voices.length, cloud: cloud.length, wash: wash.length };
    },
  };
  return ear;
}
