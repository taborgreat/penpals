// The pen (world.md Phase 2): its sound made from the same acts the ink is, so playing a letter back
// plays its very scratching, at any speed.
//   Scratch  each step of the nib drags it over the paper's grain: it is struck as often as it crosses
//            a cell of it (its speed over the law's cell), so a fast stroke sounds higher and brighter;
//            as loud as the friction's work (the nib's matter on the paper, by their rows' friction;
//            the pressure; the speed). Its contact spans so many cells of the grain, each struck out
//            of step with the rest: a fine or flexible point, a few, its sound gathered about that
//            pitch (a scratch); a broad edge, many, its sound spread wide (a hiss). Hair (the water
//            brush) is soft against the paper: as much quieter as it is softer than metal, squared.
//   Ink      a well-wetted nib glides on its ink (its wet share lubricated); a nib running dry is all
//            metal on paper: louder, its highs lifted (a rasp).
//   Small    the tick of the nib coming down, the lift as it leaves, the knock of a dip pen at the
//            jar's glass and the glass's ring (its lowest bending, from the glass's row and the jar).
//   Patter   each drop the pen throws (the law's splatter) landing: as hard as its water's weight at
//            the nib's speed, over the time the drop takes to flatten (its width at that speed).
// Each act is one event, seeded by its place in the stroke: the same acts, the same sound.
//   strokeSounds(points, { pen, wet, at, seed, t0, speed }) → events (sound/ear.js), one stroke
//     points: [{ x, y, t (ms), p (0..1) }] in page px; pen: { nib, size? (px), hairline?, maxWidth? }
//     (a law pen's settings); wet: how wetted its track is (0..1); at(x, y) → room m (the nib)
//   recordSounds(rec, { at, seed, t0, speed }) → a decoded record's (law/v2/acts.js) every stroke
//   penHand(hear, seed) → { down, move, up }: a hand's pen, live, its events heard as they come
import { MATTER, CELL_M, DROP_M } from 'penpals-law/matter';
import { penTimeline } from 'penpals-law/v2/acts';
import { BANDS, LOUD, knock } from './bands.js';

const PX_PER_M = 1400 / 0.2159;
const NIB_N = 1; // N a full press puts on the nib (a hand writing hard)
export const WET_GRIP = 0.25; // a wetted track's grip, of the dry one's (how far its ink lubricates: Tabor's to set)
const grip = (matter, on) => Math.sqrt((MATTER[matter].friction / 1000) * (MATTER[on].friction / 1000));
const NIBS = ['pen', 'flex', 'broad']; // (law/v1/constants.js: nib 0, 1, 2)
const WATER = [255, 255, 255]; // the water brush: water and no pigment (ink/InkWell.jsx)

// How wide a nib touches the paper (m), by its settings (the law pen's px): a fine point its size, a
// flexible one its hairline, a broad one its edge.
const contact = (pen) => (pen.nib === 'broad' ? pen.size : pen.nib === 'flex' ? (pen.hairline ?? 1.4) : (pen.size ?? 5)) / PX_PER_M;

// One scratch's spread over the bands: about `f` (Hz), `octaves` wide, the highs lifted when dry.
export function scratchBands(f, octaves, dry) {
  return BANDS.map((fb) => {
    const o = Math.log2(fb / f);
    const peak = Math.exp(-(o * o) / (2 * octaves * octaves));
    return fb > f ? peak * (1 + dry * Math.min(2, o)) : peak;
  });
}

// A law pen (its act's fields: nib 0..2, size in tenths of a px) as its sound takes it.
export const soundPen = (lp) => (lp.rgb?.every((c, i) => c === WATER[i]) ? { nib: 'brush', size: lp.size / 10 } : { nib: NIBS[lp.nib], size: lp.size / 10, hairline: lp.size / 10 });

// One drop landing (m kg, at v m/s): its energy let go over the time it takes to flatten (its width
// at that speed).
function dropBands(m, v) {
  const d = Math.cbrt((6 * m) / (Math.PI * MATTER.water.density)); // its width, m
  return knock(0.5 * m * v * v, d / v);
}

// One pen's voice, act by act (the live hand, and playback, the same): down(p, pos, t), move(p, pos, t),
// up(p, pos, t) → the events each makes. p: { x, y (page px), t (ms), p (0..1) }; pos: the nib, room m;
// t: when it is heard (s). on: the matter it writes on; wet(w): how wetted its track is now;
// patter(pos, t, W): a drop it threw (W: its water, the law's drops of height over a cell) landing.
export function penVoice({ pen = { nib: 'pen', size: 5 }, wet = 1, seed = 1, on = 'paper' } = {}) {
  const hair = pen.nib === 'brush';
  const matter = hair ? 'fiber' : 'metal';
  const hush = (MATTER[matter].hardness / MATTER.metal.hardness) ** 2;
  const cells = Math.max(1, contact(pen) / CELL_M); // cells of the grain under the nib at once
  const octaves = 0.25 + Math.log2(cells) / 2; // struck out of step: spread as they are many
  let dry, mu;
  const wetted = (w) => {
    dry = 1 - Math.max(0, Math.min(1, w));
    mu = grip(matter, on) * (dry + WET_GRIP * (1 - dry));
  };
  wetted(wet);
  let n = 0;
  let last = null;
  let speed = 0;
  const ev = (k, pos, t, bands, dur, attack) => ({ kind: `pen-${k}`, t, pos, bands, dur, attack, seed: seed * 4096 + ++n });
  return {
    wet: wetted,
    patter(pos, t, W) {
      if (!(speed > 0) || !(W > 0)) return [];
      const { bands, dur } = dropBands(W * DROP_M * CELL_M * CELL_M * MATTER.water.density, speed);
      return [ev('patter', pos, t, bands, dur, dur / 2)]; // (a knock rises over half its time)
    },
    // the nib comes down: a tick as hard as it lands
    down(p, pos, t) {
      last = p;
      return [
        ev(
          'down',
          pos,
          t,
          BANDS.map((f) => (f > 1000 ? 1 : 0.4) * (0.002 + p.p * 0.01) * hush),
          0.008,
          0.0003,
        ),
      ];
    },
    move(p, pos, t) {
      const a = last;
      last = p;
      if (!a) return [];
      const dt = (p.t - a.t) / 1000;
      if (dt <= 0) return [];
      const v = Math.hypot(p.x - a.x, p.y - a.y) / PX_PER_M / dt; // m/s
      speed = v;
      if (v < 1e-4) return [];
      const f = v / CELL_M; // Hz: the grain's cells crossed
      const work = mu * NIB_N * p.p * v; // W: the friction's work
      const shape = scratchBands(f, octaves, dry);
      const total = shape.reduce((s, x) => s + x, 0) || 1;
      const e = work * LOUD * hush;
      return [
        ev(
          'scratch',
          pos,
          t,
          shape.map((x) => (e * x) / total),
          Math.max(0.008, dt * 1.5),
          0.001,
        ),
      ];
    },
    // and leaves: a softer tick
    up(p, pos, t) {
      last = null;
      speed = 0;
      return [
        ev(
          'lift',
          pos,
          t,
          BANDS.map((f) => (f > 2000 ? 1 : 0.3) * 0.002 * hush),
          0.006,
          0.0005,
        ),
      ];
    },
  };
}

// A whole stroke's sound, as it was written (playback: its acts' points, at `speed` times).
export function strokeSounds(points, { pen, wet, at = (x, y) => [x / PX_PER_M, 0, -y / PX_PER_M], seed = 1, t0 = 0, speed = 1 } = {}) {
  if (!points.length) return [];
  const voice = penVoice({ pen, wet, seed });
  const when = (p) => t0 + p.t / 1000 / speed;
  const out = voice.down(points[0], at(points[0].x, points[0].y), when(points[0]));
  for (const p of points.slice(1)) out.push(...voice.move(p, at(p.x, p.y), when(p)));
  out.push(...voice.up(points.at(-1), at(points.at(-1).x, points.at(-1).y), when(points.at(-1))));
  return out;
}

// A decoded record's every stroke (law/v2/acts.js decodeActs), as it was written: each with the pen
// in force (its timeline), at(x, y) its page px in the room.
export function recordSounds(rec, { at, seed = 1, t0 = 0, speed = 1 } = {}) {
  const pens = penTimeline(rec);
  const px = (v, org) => v / 10 + org; // (tenths of a px, from the record's origin in px)
  return rec.strokes.flatMap((s, si) =>
    strokeSounds(
      Array.from(s.x, (x, i) => ({ x: px(x, rec.orgX), y: px(s.y[i], rec.orgY), t: s.t[i], p: s.hasP ? s.p[i] / 255 : 0.5 })),
      { pen: soundPen(pens[si][0][1]), at, seed: seed * 256 + si, t0, speed },
    ),
  );
}

// A hand's pen, live (SceneView): each act heard as it comes, from the nib. down(p, pos, t, nib) begins
// a stroke (nib: the writer's { pen (a law pen), on (the matter), reservoir, drops, W } as its ink has
// them now), move(...) goes on (the reservoir as it runs down, and each drop thrown since, heard),
// up(p, pos, t) ends it.
export function penHand(hear, seed = 1) {
  let voice = null;
  let strokes = 0;
  let thrown = null; // { drops, W } when last heard
  const said = (evs) => evs.forEach(hear);
  return {
    down(p, pos, t, nib = {}) {
      voice = penVoice({ pen: nib.pen ? soundPen(nib.pen) : undefined, wet: nib.reservoir ?? 1, seed: seed * 65536 + ++strokes, on: nib.on ?? 'paper' });
      thrown = { drops: nib.drops ?? 0, W: nib.W ?? 0 };
      said(voice.down(p, pos, t));
    },
    move(p, pos, t, nib = {}) {
      if (!voice) return;
      if (nib.reservoir !== undefined) voice.wet(nib.reservoir);
      said(voice.move(p, pos, t));
      const k = (nib.drops ?? thrown.drops) - thrown.drops;
      if (k > 0) {
        const W = ((nib.W ?? thrown.W) - thrown.W) / k;
        for (let i = 0; i < k; i++) said(voice.patter(pos, t, W));
        thrown = { drops: nib.drops, W: nib.W ?? thrown.W };
      }
    },
    up(p, pos, t) {
      if (voice) said(voice.up(p, pos, t));
      voice = null;
    },
  };
}

// A shell of glass rings at its lowest bending (n = 2 about it): f = (h / 2πR²) √(E / 12ρ(1−ν²)) ·
// n(n²−1)/√(n²+1), and for as long as its loss lets it (Q = 1 / loss).
export function shellRing(matter, radius, wall) {
  const g = MATTER[matter];
  const nu = g.poisson / 1000;
  const c = Math.sqrt((g.stiffness * 1e6) / (12 * g.density * (1 - nu * nu)));
  return { f: (wall / (2 * Math.PI * radius * radius)) * c * (6 / Math.sqrt(5)), q: 1000 / g.loss };
}

// A dip pen's nib knocking the jar's glass: a short knock and the glass's ring.
export function dipTap(pos, t, { radius, wall }, seed = 1) {
  return { kind: 'pen-dip', t, pos, bands: BANDS.map((f) => (f > 500 && f < 8000 ? 0.02 : 0.004)), dur: 0.15, attack: 0.0004, seed, ring: { ...shellRing('glass', radius, wall), share: 0.4 } };
}
