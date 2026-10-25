// The weather heard (world.md Phase 4), from its totals only (law/weather.js):
//   Rain   the hiss of its drops landing all about: as many a second as its rate brings at the size
//          rain falls in at that rate (Marshall–Palmer's middle drop), each landing at its falling
//          speed (Atlas's) as a knock (sound/bands.js); heard from the ground all around the ear,
//          each band from as far as the air lets it come (a plane of sources: 2π·E₁(αh)).
//   Wind   the air's rush past what stands in it: as loud as the sixth power of its speed (Curle's:
//          the flow's force on each thing, swinging), about the pitch its speed sheds eddies off the
//          twigs at (Strouhal's 0.2 · U / D).
//   Thunder (Phase 5) a strike's share of sound, let go along its channel (from the clouds' foot to the
//          ground: law/weather.js LAYER), each stretch bursting as wide as its channel relaxes (Few's
//          radius: √(its energy a metre / π·p)), so its spread is a knock that short; heard as long as
//          sound takes along the channel, from where it struck: the ear's own way to it is the gap
//          between the flash and the thunder. Matter's music tunes it, but never moves it (its time is
//          its distance).
// Outside, as it is; inside, through the window (sound/room.js through: open, all of it; shut, what
// the glass lets by).
//   rainBed(mmPerHour, height) → bands (energy a second, at the ear: the ear's units)
//   windBed(speed, height) → bands      weatherBeds(weather, head, acoustics) → { rain, wind }
//   thunder(strike, from (room m), t (s, the ear's clock), world (s)) → an event
import { BANDS, NB, LOUD, SPEED, knock, airAbsorption, throughPane } from './bands.js';
import { STRIKE, LAYER } from 'penpals-law/weather';
import { inside } from './room.js';
import { PANE } from '../scene/light/room.js';

export const TWIG = 0.005; // m: what the wind shears past (outside.md's trees will say: Tabor's to set)
export const RUSH = 1e-7; // W a m² of ground at 1 m/s, as U⁶ (how loud the wind is in what stands: Tabor's to set)
const RHO_W = 1000;
const NP = 10 * Math.LOG10E;

// E₁(x), the exponential integral (Abramowitz & Stegun 5.1.53, 5.1.56)
function E1(x) {
  if (x <= 1) return -Math.log(x) - 0.57721566 + x * (0.99999193 + x * (-0.24991055 + x * (0.05519968 + x * (-0.00976004 + x * 0.00107857))));
  const n = x * x + 2.334733 * x + 0.250621,
    d = x * x + 3.330657 * x + 1.681534;
  return (Math.exp(-x) / x) * (n / d);
}
// a plane of sources p (energy a second a m², by band) all around, the ear h above it
const plane = (p, h) => p.map((x, b) => 2 * Math.PI * x * E1(Math.max(1e-9, (airAbsorption(BANDS[b]) / NP) * h)));

export function rainBed(mm, h = 1.6) {
  if (!(mm > 0)) return new Array(NB).fill(0);
  const D = 0.000895 * mm ** 0.21; // m: the middle drop (Marshall–Palmer)
  const v = 9.65 - 10.3 * Math.exp(-0.6 * D * 1000); // m/s: its fall (Atlas)
  const m = (RHO_W * Math.PI * D ** 3) / 6;
  const drops = mm / 3600 / m; // a m², a second
  const k = knock(0.5 * m * v * v, D / v); // (each landing: its energy, its spread)
  const per = k.bands.map((x) => x * k.dur * drops); // energy a second a m²
  return plane(per, h);
}

export function windBed(U, h = 1.6) {
  if (!(U > 0)) return new Array(NB).fill(0);
  const f = (0.2 * U) / TWIG;
  const shape = BANDS.map((fb) => Math.exp(-(Math.log2(fb / f) ** 2) / 2));
  const total = shape.reduce((a, x) => a + x, 0) || 1;
  const P = RUSH * U ** 6 * LOUD;
  return plane(
    shape.map((x) => (P * x) / total),
    h,
  );
}

export function thunder(s, from, t, world = t) {
  const E = STRIKE.energy * STRIKE.sound;
  const R0 = Math.sqrt(STRIKE.energy / LAYER / (Math.PI * 101325)); // m: the channel's burst
  const k = knock(E, R0 / SPEED);
  const dur = LAYER / SPEED;
  const total = k.bands.reduce((a, x) => a + x, 0) || 1;
  const a = (s.bearing * Math.PI) / 180;
  return {
    kind: 'thunder',
    matter: true,
    keepTime: true,
    t,
    world,
    rate: 1 / 120,
    pos: [from[0] + Math.sin(a) * s.away, from[1] + Math.cos(a) * s.away, from[2] + LAYER / 2],
    bands: k.bands.map((x) => ((E * LOUD) / dur) * (x / total)),
    dur,
    attack: R0 / SPEED,
    seed: (s.at >>> 0) ^ 0x7a1d,
  };
}

// As heard where the head is: outside, as it is; inside, through the window (given off from it
// into the room: all of it open, what the glass lets by shut), as far from it as the head is.
export function weatherBeds(w, head, ac) {
  const rain = rainBed(w.rain),
    wind = windBed(w.wind);
  if (!ac || !inside(head.pos, ac.geom)) return { rain, wind };
  const g = ac.geom,
    win = g.window;
  const pane = [(win.x0 + win.x1) / 2, g.size[1], (win.z0 + win.z1) / 2];
  const d = Math.max(0.3, Math.hypot(...head.pos.map((v, k) => v - pane[k])));
  const S = (win.x1 - win.x0) * (win.z1 - win.z0);
  const pass = ac.open ? new Array(NB).fill(1) : throughPane('glass', PANE);
  const k = S / (2 * Math.PI * d * d);
  return { rain: rain.map((x, b) => x * k * pass[b]), wind: wind.map((x, b) => x * k * pass[b]) };
}
