// The room's acoustics (world.md Phase 3): what a room does to every sound in it, from its size and
// what its faces are made of (their rows' `sound`: law/matter.js), as its light's bounce comes from
// the same faces (scene/light/room.js).
//   Tail     Sabine's: the reverberation's time, band by band, is 24·ln 10 · V / (c·A), A what the
//            faces drink (each its area times its row's share) and the air's own over the volume;
//            its level is the room's: the reverberant field holds 4 / R of a source's power (R the
//            room constant, A / (1 − ᾱ)) against the direct sound's 1 / 4πr², so 16π / R of it at a
//            metre. It begins once sound has crossed the room's mean free path (4V / S).
//   Early    the first reflection off each of the six planes of the box: the source mirrored in it,
//            heard from there, later by the longer way, keeping what the face it met does not drink
//            (glass where the window is; nothing comes back from an open one).
//   Window   a sound on the other side of the window comes through it: what reaches the pane, given
//            off again from the pane into the half space beyond, all of it open, what the glass lets
//            through (the mass law: sound/bands.js throughPane) shut.
//   acoustics(geom, { open, door }) → { volume, area, rt60, send, delay, geom, open, door }
//   reflections(pos, ac) → [{ pos (the image), keep (by band) }]
//   through(e, head, ac) → the event as heard where the head is (inside or out), or e itself
//   roomIR(ac, rate, seed) → [left, right]: the tail, each band at its time and level
import { MATTER } from 'penpals-law/matter';
import { BANDS, NB, SPEED, airAbsorption, absorbs, throughPane } from './bands.js';
import { shaped, noise } from './grain.js';
import { PANE } from '../scene/light/room.js';

// The light's names for its faces, as matter (scene/light/room.js roomGeometry)
const MATTER_OF = { floor: 'wood', table: 'wood', plaster: 'plaster', glass: 'glass', paper: 'paper' };
const matterOf = (m) => MATTER_OF[m] ?? (MATTER[m] ? m : 'plaster');
const NP = 10 * Math.LOG10E; // dB in a neper of intensity

export function acoustics(geom, { open = false, door = false } = {}) {
  const [W, D, H] = geom.size;
  const volume = W * D * H;
  const drink = new Array(NB).fill(0);
  let area = 0;
  const face = (matter, s) => {
    const a = matter === 'open' ? new Array(NB).fill(1) : absorbs(matterOf(matter)); // (an open window: what reaches it leaves)
    for (let b = 0; b < NB; b++) drink[b] += s * a[b];
    area += s;
  };
  for (const p of geom.patches) face(p.matter, p.area);
  for (const o of geom.openings) face(o.kind === 'door' ? (door ? 'open' : 'wood') : open ? 'open' : 'glass', o.area); // (the door: its wood, or open)
  const rt60 = [],
    send = [];
  for (let b = 0; b < NB; b++) {
    const air = (4 * volume * airAbsorption(BANDS[b])) / NP; // the air's own drinking, as an area
    const A = drink[b] + air;
    const mean = Math.min(0.999, drink[b] / area);
    rt60.push((24 * Math.LN10 * volume) / (SPEED * A));
    send.push((16 * Math.PI * (1 - mean)) / A);
  }
  return { volume, area, rt60, send, delay: (4 * volume) / area / SPEED, geom, open, door };
}

// Within the room's box?
export const inside = (pos, geom) => pos[0] >= 0 && pos[1] >= 0 && pos[2] >= 0 && pos[0] <= geom.size[0] && pos[1] <= geom.size[1] && pos[2] <= geom.size[2];
const onWindow = (geom, x, z) => x >= geom.window.x0 && x <= geom.window.x1 && z >= geom.window.z0 && z <= geom.window.z1;
const onDoor = (geom, x, z) => !!geom.door && x >= geom.door.x0 && x <= geom.door.x1 && z >= geom.door.z0 && z <= geom.door.z1;

// The six first reflections of a sound at pos, for a head at `at`: each image, and what the face
// keeps of each band where the way meets it.
export function reflections(pos, at, ac) {
  const { geom, open, door } = ac;
  const [W, D, H] = geom.size;
  const planes = [
    [0, 0, 'plaster'],
    [0, W, 'plaster'],
    [1, 0, 'near'],
    [1, D, 'far'],
    [2, 0, 'floor'],
    [2, H, 'plaster'],
  ];
  const out = [];
  for (const [k, v, m] of planes) {
    const img = [...pos];
    img[k] = 2 * v - pos[k];
    // where the way from the image to the head crosses the plane
    const s = (v - img[k]) / (at[k] - img[k]);
    const hit = img.map((c, j) => c + (at[j] - c) * s);
    let matter = m;
    if (m === 'near') {
      if (onDoor(geom, hit[0], hit[2])) {
        if (door) continue; // (out through the open door)
        matter = 'wood';
      } else matter = 'plaster';
    }
    if (m === 'far') {
      if (onWindow(geom, hit[0], hit[2])) {
        if (open) continue; // (out through the open window: nothing comes back)
        matter = 'glass';
      } else matter = 'plaster';
    }
    out.push({ pos: img, keep: absorbs(matterOf(matter)).map((a) => 1 - a) });
  }
  return out;
}

// A sound on the other side of the house's wall from the head comes through it where it can: the window
// (all of it open, what the glass lets through shut) and the door while it is open, each given off as
// loud as what reached it over its area, into the half space; later by its way there, and drunk by the
// air on it. The louder way is the one heard.
export function through(e, head, ac) {
  const { geom, open, door } = ac;
  if (inside(e.pos, geom) === inside(head.pos, geom)) return e;
  const ways = [];
  const w = geom.window;
  ways.push({ at: [(w.x0 + w.x1) / 2, geom.size[1], (w.z0 + w.z1) / 2], S: (w.x1 - w.x0) * (w.z1 - w.z0), pass: open ? new Array(NB).fill(1) : throughPane('glass', PANE) });
  const dr = geom.door;
  if (dr && door) ways.push({ at: [(dr.x0 + dr.x1) / 2, 0, (dr.z0 + dr.z1) / 2], S: (dr.x1 - dr.x0) * (dr.z1 - dr.z0), pass: new Array(NB).fill(1) });
  const heard = ways.map(({ at, S, pass }) => {
    const d = Math.max(Math.hypot(...e.pos.map((v, k) => v - at[k])), 1e-3);
    const k = S / (2 * Math.PI * d * d);
    return { ...e, t: e.t + d / SPEED, pos: at, bands: e.bands.map((x, b) => x * k * pass[b] * 10 ** ((-airAbsorption(BANDS[b]) * d) / 10)) };
  });
  const loud = (x) => x.bands.reduce((a, v) => a + v, 0);
  return heard.reduce((a, x) => (loud(x) > loud(a) ? x : a));
}

// The tail: per band, noise falling 60 dB in its time, its energy the band's share of the room's
// (a unit of energy in, so much reverberant energy out); two ears, two draws.
export function roomIR(ac, rate = 48000, seed = 1) {
  const longest = Math.max(...ac.rt60);
  const n = Math.ceil((ac.delay + longest) * rate);
  const start = Math.round(ac.delay * rate);
  return [0, 1].map((ear) => {
    const ir = new Float32Array(n);
    const one = new Float32Array(n);
    for (let b = 0; b < NB; b++) {
      if (BANDS[b] > rate * 0.45) continue;
      one.fill(0);
      const fall = (3 * Math.LN10) / (ac.rt60[b] * rate); // amplitude: 10⁻³ (60 dB) over its time
      shaped(
        one,
        BANDS.map((_, j) => (j === b ? 1 : 0)),
        noise(seed * 64 + ear * 16 + b + 1),
        rate,
        (i) => (i < start ? 0 : Math.exp(-(i - start) * fall)),
      );
      let e = 0;
      for (let i = 0; i < n; i++) e += one[i] * one[i];
      const g = e > 0 ? Math.sqrt(ac.send[b] / e) : 0;
      for (let i = 0; i < n; i++) ir[i] += one[i] * g;
    }
    return ir;
  });
}
