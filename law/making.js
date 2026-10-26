// The creation tree (outside.md §2.5, Phase 7): what hands make from the outside's matter. Nothing here
// is a recipe the world checks: each making is an act (law/hands.js) and whether it works is the
// matter's, by its row (law/matter.js) and the one rule for each:
//   Handful  a hand takes as much as it holds (HAND) of what is there: grass gives fibre, clay a lump.
//   String   grass fibres twisted share the load: a string holds what its grass holds together (the
//            row's strength over its section: mass over density over length); a string twisted onto
//            another joins it end to end: as long as both, no stronger than the weaker.
//   Chip     a stone struck with another: if the striking one is not the softer and its blow (its
//            mass at the speed the arm brought it down: the act's, no faster than an arm swings,
//            BEING.swing) has the energy to crack the struck one (its strength squared over its
//            stiffness, through its own size cubed), the struck one takes an edge.
//   Bind     a stone tied to a stick with string, so many turns as tight as the binder pulled it
//            winding (no harder than a hand pulls, nor than the string holds): each turn presses the stone to the stick and holds it by
//            the string's friction on it. Swung, the stone pulls away as hard as its mass going round
//            at the swing's speed (the act's) on the stick's length; if the turns' grip is less, it comes apart.
//   Lever    a stick laid over a stone (the fulcrum) under a load and pushed down at its far end by a hand:
//            the beam computes nothing; it tips or it does not. The load goes over if the push on its arm
//            (the stick past the fulcrum) turns harder than the load's weight on its own (from the fulcrum
//            to the load), and only if the stick bears that turning (its wood's strength over its section).
//   Fire     wood rubbed on wood, as fast and as long as the hand rubbed it (the act's: outside.md §3.3, the
//            mouse's speed is the arm's): the rubbing's work heats the track it rubs along, as much
//            as the two can carry away into themselves (a hot patch on two half-spaces), and only as
//            fast as the heat soaks into them; past the wood's burning heat, it is fire. A stone
//            carries the heat away too fast: rubbed on wood, it makes none.
//   A fire's heat: what its wood gives burning, less what leaves as light, into the air it burns with.
//            It is that wood burning: as fast as its row burns over the faces it shows the air (its
//            burnRate), until its wood is gone; then it is out, and what its row leaves is ash.
//   Clay     only what heat hardens can be formed and keep its shape (its row's `hardens`): clay is
//            pressed into a cup; in a fire past its hardening heat, it is fired (pottery) and holds water.
//   Ink      oak galls crushed and soaked in water with crushed ore: the ore's metal and the galls'
//            tannin bind (BIND) and blacken; what metal is left unbound is free, and eats the paper
//            it is written on, year by year (CORRODES).
//   Metal    ore in a fired cup in a fire past its melting heat: the metal runs out of it (its row's
//            share); poured into a fired form, it sets in its shape.
//   Candle   a string dipped in molten wax: it is a candle if its fibres draw the wax up (their row's
//            `draws`), as a wick does.
import { MATTER, AIR } from './matter.js';

export const HAND = 0.0002; // m³ a hand holds (a handful: Tabor's to set)
export const BEING = Object.freeze({ pull: 300, swing: 10 }); // N a hand pulls (and presses); m/s the fastest an arm's end goes, swung or rubbing (Tabor's to set)
export const FIBRE_LENGTH = 0.3; // m: a grass blade, twisted along its length (Tabor's to set)
export const BIND = 0.3; // g of metal a gram of gall's tannin binds black (Tabor's to set)
export const CORRODES = 0.2; // the share of its paper's strength a gram of free metal a gram of ink eats a year (Tabor's to set)

const row = (m) => MATTER[m];
export const handful = (matter) => row(matter).density * HAND * 1000; // g

// a string twisted of grass fibre: how long (m) and how hard it holds (N), from its fibres' mass (g)
export function stringOf(grams, matter = 'grass') {
  const f = row(matter);
  const section = grams / 1000 / f.density / FIBRE_LENGTH; // m²
  return { matter, length: FIBRE_LENGTH, holds: f.strength * 1e6 * section };
}
// two strings twisted together end to end
export const joined = (a, b) => ({ matter: a.matter, length: a.length + b.length, holds: Math.min(a.holds, b.holds) });

// a stone's mass (kg) from its radius (m) and matter
export const massOf = (matter, r) => (row(matter).density * 4 * Math.PI * r ** 3) / 3;

// how fast an arm's end goes (m/s): as fast as the hand moved it, no faster than an arm swings
export const armSpeed = (speed) => Math.max(0, Math.min(BEING.swing, speed));

// whether `tool` (matter, r) struck at `stone` (matter, r), brought down at `speed` (m/s), chips it
export function chips(tool, stone, speed) {
  const T = row(tool.matter),
    S = row(stone.matter);
  if (T.hardness < S.hardness) return false; // (the softer gives way itself)
  const blow = 0.5 * massOf(tool.matter, tool.r) * armSpeed(speed) ** 2; // J
  const stiff = (S.stiffness ?? 50000) * 1e6; // Pa (stone's, where its row says nothing)
  const crack = ((S.strength * 1e6) ** 2 / stiff) * stone.r ** 3; // J
  return blow >= crack;
}

// whether a binding holds when swung: the stone pulled out as hard as it goes round, against the turns'
// grip (each turn pressing it as hard as the string was pulled tight, by its friction on the stone)
export function holds({ stone, stick, string, turns, pull = BEING.pull, speed }) {
  const tight = Math.min(pull, BEING.pull, string.holds); // (as hard as it was pulled winding it: loose, little)
  const mu = Math.sqrt((row('fiber').friction / 1000) * (row(stone.matter).friction / 1000));
  const grip = turns * tight * mu;
  const away = (massOf(stone.matter, stone.r) * armSpeed(speed) ** 2) / Math.max(stick.length, 0.1); // N: the stone going round
  const around = Math.PI * 2 * stick.r * turns; // the string it takes
  return { holds: grip >= away && string.length >= around, grip, away, enough: string.length >= around };
}

// a load of `weight` (N) pried over a fulcrum `load` m from it with a stick `length` m long, `r` m thick,
// of `matter`, pushed at its far end as hard as a hand pushes: whether it tips, and whether the stick holds
export function pries({ weight, load, length, r, matter = 'wood' }) {
  const effort = length - load; // m: the stick past the fulcrum
  const turning = weight * load; // N·m: the load's, about the fulcrum
  const bears = (row(matter).strength * 1e6 * Math.PI * r ** 3) / 4; // N·m: what the stick bends under before it breaks
  return { tips: effort > 0 && BEING.pull * effort >= turning && turning <= bears, effort, turning, bears };
}

// rubbing `tool` on `wood` (matters) so many strokes at `speed` (m/s) for `seconds`: how hot the track gets
// (K above the air), and whether it catches. They touch over as much as the press spreads on what the softer
// bears (its strength); each stroke runs as far as the hand went in its share of the time.
export function rubbed(tool, wood, { strokes, speed, seconds }) {
  const soft = Math.min(row(tool).strength, row(wood).strength) * 1e6;
  const a = Math.sqrt(BEING.pull / soft / Math.PI); // m: the touch's radius
  const v = armSpeed(speed),
    t = Math.max(0, seconds);
  if (!(v > 0 && t > 0)) return { dT: 0, catches: false }; // (a hand that does not move warms nothing)
  const P = Math.sqrt((row(tool).friction / 1000) * (row(wood).friction / 1000)) * BEING.pull * v; // W
  const k = row(tool).heat.conducts / 1000 + row(wood).heat.conducts / 1000; // W/(m·K)
  const W = row(wood);
  const alpha = W.heat.conducts / 1000 / (W.density * W.heat.holds); // m²/s: how fast heat soaks into it
  const patch = Math.sqrt(((v * t) / Math.max(1, strokes)) * ((2 * a) / Math.PI)); // m: a stroke's track, as a round patch
  const tau = (patch * patch) / alpha; // s: the patch comes to its heat over this
  const dT = (P / (4 * patch * k)) * Math.sqrt(Math.min(1, t / tau));
  return { dT, catches: W.heat.burns !== null && AIR.temp + dT >= W.heat.burns };
}

// a wood fire's heat (°C): its burning's heat, less its light, into the air it burns with
export function fireHeat(fuel = 'wood') {
  const h = row(fuel).heat;
  return AIR.temp + (h.releases * (1 - h.shines / 1000)) / ((1 + h.air) * row('air').heat.holds);
}
// a fire of `grams` of `fuel` showing `area` m² to the air, `seconds` after it caught: { left (g), ash (g), out }
export function burning(fuel, grams, area, seconds) {
  const h = row(fuel).heat;
  const burnt = Math.min(grams, h.burnRate * area * Math.max(0, seconds));
  return { left: grams - burnt, ash: (burnt * (h.leaves ?? 0)) / 1000, out: burnt >= grams };
}
export const formable = (matter) => !!row(matter).heat.hardens;
export const fires = (matter, fuel = 'wood') => formable(matter) && fireHeat(fuel) >= row(matter).heat.hardens;
export const melts = (matter, fuel = 'wood') => row(matter).heat.melts !== null && fireHeat(fuel) >= row(matter).heat.melts;
export const metalOf = (oreGrams) => (oreGrams * row('ore').metal) / 1000;

// ink from galls and metal (g) in water (g): how black (0..1: what is bound, of what could be), and how
// much free metal a gram of it holds
export function inkOf({ gall = 0, metal = 0, water = 0 }) {
  const bound = Math.min(metal, gall * BIND);
  const all = gall + metal + water || 1;
  return { black: gall > 0 ? bound / (gall * BIND) : 0, free: (metal - bound) / all, bound: bound / all };
}
// what is left of a paper's strength (0..1) after `years` under an ink holding `free` metal a gram
export const paperLeft = (free, years) => Math.max(0, 1 - CORRODES * free * years);

// a string a candle: its fibres draw the molten wax up (a wick's work)
export const wicks = (matter) => (row(matter).draws ?? 0) > 0 && row('wax').heat.melts !== null && fireHeat() >= row('wax').heat.melts;
