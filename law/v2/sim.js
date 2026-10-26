// The rules of flow, law v2 (depth-water-gall). Law v1's rules, in the same
// order with the same integer arithmetic, and six changes:
//
//   1. dents: the nib presses the paper down (pressure × time under it); a dent
//      is a groove: lower (zE), holding more (heldE), drinking slower (thirst)
//   2. ink in depth: settled ink sinks into the fibers (depth); the highest a
//      bead stood over a cell is kept (peak)
//   3. the water brush (a pen whose colour is WATER): water with no pigment;
//      on every dry step, water over fixed ink turns some of it wet again (revive)
//   4. oak gall (a pen whose colour is OAK_GALL): its own channel G (wet) and FG
//      (fixed), allocated only on tiles gall reached; its darkening is applied
//      at view time (look.js), never here
//   5. (fading is view time too: look.js)
//   6. paper remembers water: soak (water held, never goes down) raises thirst
//      and loosens fibers; working a wet cell wears it until it tears (a torn
//      cell holds nothing, and its neighbours sit lower, so ink runs to the rim);
//      a soaked cell dries buckled along the paper's ridges (cockle, in height)
//   7. splatter: an act may throw drops of the pen's ink (splat.js decides,
//      from the moment and the paper's hash); a drop is an ordinary deposit
//   8. the wet front (cleanup-and-speed.md §2): one water amount; the paper
//      holds what is within the layers its front has reached (heldE), the rest
//      stands on top. Ink lands on top; after ENTER ticks of standing water (none
//      on thirsty paper) the front advances each dry step (FRONT, slowing with
//      depth) until it holds the water or reaches the bottom; it never goes back
//      up (depthA is the front). Surface flow moves only what is on top, pore
//      flow only what is in the pores (and pore water arriving lifts the
//      receiver's front to hold it); evaporation takes from the top first. No
//      water is drunk: soaking in is the front advancing.
//
//
// Law 3 (rooms.md §3b, §3c, §5; the same rules, with what only law-3 records carry):
//   9. the nib's reservoir: a dipped pen's supply is scaled by what is left in it,
//      and drawn down by what it puts on the paper; a dip fills it again
//  10. wax: drips land at their moment and sit on top (their height is in the
//      surface the ink flows over, so ink runs off them to the paper around);
//      under wax the paper is sealed (no water enters its fibers) and ink landing
//      on it beads off the nib. A press dents soft wax with the stamper's face; a
//      break cracks it. Law-2 records have neither, so nothing here runs for them.
//  11. direction fairness (outside.md §1.3): a broad or flex nib's footprint is
//      measured across and along the nib rounding both ways alike, so the same
//      mark turned settles the same turned (law 2 rounds down: one side of a nib
//      came out a cell narrower than the other, and 135° drew longer than 45°)
//  12. heat (matter-fixes.md §1): wax holds heat. A drip lands carrying its heat;
//      each dry step heat flows to the cooler wax beside it and leaves to the
//      paper and the air (constants.js: Heat), until the cell is no warmer than
//      the air and sleeps. Above its melting heat wax is liquid; only wax above
//      its softening heat takes a press. No clock: a cell is soft for as long as
//      its heat says.
//  13. one matter (one-matter.md Phases 1-3): a cell is of a matter (law/matter.js; law/grow.js
//      grows each from its row, paper by its own grower): how much it holds, how fast it
//      drinks, how rough it is, its fibers are its row's. Its face takes as much of a nib's
//      ink as its matter's wets allows (a waxy face sheds most: it beads off); a liquid
//      sinks into it only if its matter drinks (wax, metal, glass: it stands on top and dries
//      there); a press dents it as much as its hardness gives. Wax lying on a cell is its face:
//      no wax rule of its own (law 3's sealed cells are this, the same to the bit). Law 2 and 3
//      sheets are paper throughout, so nothing here changes them; law 4 grows any matter.
//  14. removing matter (one-matter.md Phase 4; law 4): the nib cuts what is softer than it, wet
//      or dry, the more the softer (paper's rate the paper's own). Paper worn sheds its fibers
//      as fluff, as much of the sheet as it is worn; worn through over a body (a sheet lying on
//      the table), the body is its face from then on, and the nib cuts that: its dent deepens
//      and what it takes is shavings. Nothing is deleted: what is removed lies loose on its cell
//      (looseA: ng, looseM: its matter), and every ng removed is counted (removed, loose).
//  15. water and loose ground (one-matter.md Phase 6; law 4): water is ink's flow. Over loose
//      matter (its row's strength 0: dirt, sand, ash) the water standing on top carries grains
//      as it carries pigment, as many as its depth and how fast it is leaving can hold (the
//      grains' weight in water and their friction: their row's); short of that it lifts them
//      off the bed, past it it lays them down. The bed's rise and fall is the face the water
//      runs over, so running water cuts channels and builds banks, and drops its load as a
//      fan where it slows; drying, it lays down all it carried. A thrown drop landing on loose
//      ground lifts grains as it splashes. Every grain is the bed's or the water's: their sum
//      never changes.
//
// Law 5 (one-matter.md Phase 3: no substance is told by its colour):
//  16. an ink is what it holds: its pigment by its colour (as every ink's), and its oak gall by its pen act's
//      gall (acts.js format 6: how much of an oak gall ink's it holds), both laid down at once. An oak gall
//      ink is colourless and all gall; a pen's colour is only its pigment. (Laws 2-4 told oak gall by its
//      colour, OAK_GALL, and laid nothing else with it.)
//
//  17. a breath (one-matter.md Phase 4: loose matter can be blown): a round jet of air from the mouth, meeting the
//      sheet `dist` mm from it and running along it the way it blows, slowing as the air's jet does (its decay
//      × the mouth's width over how far it has gone) and spreading (its spread × that). Where its push (half the
//      air's density × its speed²) beats what lies loose on a cell (its weight over the cell, × the friction of
//      it on the face: both rows'), it lifts it, and carries it on until it slows too much to: it lands there,
//      off the sheet if that is past its edge. The jet computes nothing but that; the being's breath is
//      law/making.js BEING's. Nothing is deleted: what moves is moved.
//  18. burnt (matter.md, the house fire; law/fire.js grows the fire, no one writes it): the cells of a rectangle of
//      the sheet burnt away at their moment: gone (a hole), all they held with them (as smoke), and what their row
//      leaves burnt (its ash) lying loose where they were.
//
// Nothing computes on a dry tile: every new rule runs inside the loops over
// wet tiles (flow, settle, revive, dry), under the nib (stamp), or over warm
// tiles (heat).
// Each 10 ms tick: the deposits that fall in it, flow, then on dry ticks mix →
// settle → revive → dry.
//
// Live writing (frontend ink worker) uses the same sim with the API at the end:
// advanceTo while the pen is up, copy-on-write journals for undo, changed() for
// the tiles to repaint. None of it changes a result (law/test/v2.test.js).

import {
  TILE,
  TICK_MS,
  DRY_EVERY,
  HT_PER_CELL,
  P_NONE,
  NIB_FLEX,
  NIB_BROAD,
  STEP_HT,
  BROAD_T_HT,
  CARRY_MS,
  CAP_REF,
  W_SAT,
  W_WET,
  W_EPS,
  C_SAT,
  G_LEVEL,
  G_RUN,
  G_PORE,
  G_WICK,
  G_MAX,
  DIAG_Q,
  G_MIX,
  SETTLE,
  ENTER,
  FRONT,
  EVAP_BASE,
  EVAP_EDGE,
  E_MIN,
  MAX_WET_CELLS,
  MAX_WORK,
  DRAIN_MAX_TICKS,
  SCALE_ONE,
  SCALE_MIN,
  SCALE_MAX,
  OAK_GALL,
  DENT_SHIFT,
  DENT_MAX,
  DENT_CAP,
  DENT_Z,
  DENT_THIRST,
  THICK,
  DEPTH_SHIFT,
  PEAK_SHIFT,
  FILM_SHIFT,
  FILM_POOL_SHIFT,
  SUPPLY_V,
  WIPE_MAX16,
  FEED_Q,
  DWELL_MS,
  RAIL_WIDE,
  RAIL_MIN,
  RAIL_MID,
  RAIL_TINE,
  REDISSOLVE,
  SOAK_Q,
  SOAK_THIRST,
  SOAK_LINK,
  SOAK_PORE,
  SOAK_WICK,
  SOAK_FULL,
  WEAR_SHIFT,
  STRENGTH_BASE,
  WET_K,
  SOAK_K,
  RIM_Z,
  COCKLE_MIN,
  COCKLE_MAX,
  TORN,
  WEAR_STILL,
  OX_BASE,
  AGE_CAP_H,
  WELL_UNIT,
  WAX_MAX,
  WAX_R_MAX,
  WAX_SPREAD,
  WAX_SEAL,
  HEAT_Q,
  WAX_CONDUCT,
  WAX_COOL,
  WAX_MELT,
  WAX_SOFTEN,
  SEAL_RAISED,
  SEAL_DENT,
  SEAL_TOOK,
  WAX_CRACK,
} from './constants.js';
import { ABS_Q, PRESS, PRESS_SHAPE, FLOW_Q, COSSIN_Q14 } from '../v1/tables.js';
import { DENT_Q, WEAR_Q, COCKLE, OX, AIR } from './tables.js';
import { makePaper, NB_DX, NB_DY } from './paper.js';
import { floorDiv, ceilDiv, clamp, isqrt, LawError } from '../v1/int.js';
import { penTimeline, precheck } from './acts.js';
import { paperHasher } from '../v1/siphash.js';
import { splatter } from './splat.js';
import { MATTER, ROWS, idOf, cellNg, DROP_M, ORDER, CELL_M } from '../matter.js';
import { BEING as MK_BEING } from '../making.js';
const G_EARTH = 9.81; // m/s²
import { makeGrower } from '../grow.js';

const PAPER = MATTER.paper;
const METAL = MATTER.metal; // (a pen's nib: the pen's matter unless it says another, format 5)
const nibOf = (pen) => (pen?.matter !== undefined ? ROWS[pen.matter] : METAL);
const PAPER_ID = idOf('paper');
const SHEET_NG = cellNg(PAPER, PAPER.ink.thickness / 1e6); // a cell of a sheet, all of it
// a dent level's slice of a cell of this matter (ng): a cut that deep takes this much
const sliceNg = (row) => cellNg(row, DENT_Z * DROP_M);
const WAX_FACE = MATTER.wax.ink; // (wax lying on a cell, as its face)

const TT = TILE * TILE;
const STEP_FINE = STEP_HT * 256;
const LAST = TILE - 1;
const NB_OFF = NB_DX.map((dx, n) => NB_DY[n] * TILE + dx);
const TILE_DIR = new Int8Array([5, 6, 7, 4, -1, 0, 3, 2, 1]);
const INNER = new Uint8Array(TT).map((_, i) => {
  const x = i % TILE;
  const y = (i - x) / TILE;
  return x > 0 && x < LAST && y > 0 && y < LAST ? 1 : 0;
});
const diag = (g, n) => (n & 1 ? floorDiv(g * DIAG_Q, 256) : g);
const GS_WET = NB_DX.map((_, n) => diag(G_LEVEL, n));
const GS_DRY = NB_DX.map((_, n) => diag(G_RUN, n));
const DENT_TOP = DENT_MAX << DENT_SHIFT;
const DEPTH_TOP = THICK << DEPTH_SHIFT;
const SINK_W = [2, 1, 2, 1, 2, 1, 2, 1]; // the front's pace: 4 the cell, 2 each side, 1 each corner (16 in all)
const FRONT_STEP = 2 << DEPTH_SHIFT; // the furthest a front runs ahead of its deepest side neighbour

export function fineLength(dx, dy) {
  const d2 = dx * dx + dy * dy;
  return d2 < 2 ** 36 ? isqrt(d2 * 65536) : isqrt(d2) * 256;
}

// Gall strength: the oak gall colour's strongest channel, as absorbance ×1024
// per drop (G and FG are in these units; look.js spreads them over r, g, b).
export const GALL_ABS = Math.max(ABS_Q[OAK_GALL[0]], ABS_Q[OAK_GALL[1]], ABS_Q[OAK_GALL[2]]);
export const isGall = (rgb) => rgb[0] === OAK_GALL[0] && rgb[1] === OAK_GALL[1] && rgb[2] === OAK_GALL[2];

// How far gall has darkened (0..256) after ageH hours, sunk `depth` levels,
// under a dried film `film` levels thick: air reaches a hairline at the
// surface fully, ink sunk deep or lying thick less. The look applies it at
// view time; the sim uses it for the gall's resistance to water.
export function darkAt(depth, film, ageH) {
  const h = Math.max(0, Math.min(AGE_CAP_H, Math.floor(ageH)));
  const x = floorDiv(h * OX_BASE * AIR[Math.min(THICK, depth) * 16 + Math.min(15, film >> FILM_POOL_SHIFT)], 65536);
  return OX[Math.min(OX.length - 1, x)];
}
export const filmLevel = (filmA) => Math.min(255, filmA >> FILM_SHIFT);

class Tile {
  constructor(tx, ty, f) {
    this.tx = tx;
    this.ty = ty;
    this.cap = f.cap;
    this.hold = f.hold;
    this.siz = f.siz;
    this.z = f.z;
    this.link = f.link;
    this.ridge = f.ridge;
    this.mat = f.mat ?? null; // each cell's matter (law/matter.js ORDER); null: paper throughout
    this.under = f.under ?? null; // (a stack) what lies beneath each sheet's cell
    this.looseA = null; // (law 4) ng of loose matter lying on each cell, and its matter: allocated when some is
    this.looseM = null;
    this.goneA = null; // ng of the cell's own face already gone (worn off it)
    this.W = new Int32Array(TT);
    this.P = new Int32Array(TT * 3);
    this.F = new Uint16Array(TT * 3);
    this.dW = new Int32Array(TT);
    this.dP = new Int32Array(TT * 3);
    this.dentA = new Int32Array(TT);
    this.depthA = new Int32Array(TT);
    this.peak = new Uint8Array(TT);
    this.soakA = new Int32Array(TT);
    this.wearA = new Int32Array(TT);
    this.flags = new Uint8Array(TT);
    this.rim = new Uint8Array(TT);
    this.cockle = new Uint8Array(TT);
    this.drainA = new Int32Array(TT); // water that left here into the air (the books: every drop counted)
    this.enter = new Uint8Array(TT); // ticks of standing water before the front started
    this.dWp = new Int32Array(TT); // water arriving through the pores this tick (it lifts the front)
    this.adv = new Int32Array(TT); // the front a dry step moves to (scratch)
    this.filmA = new Int32Array(TT); // ink that dried on top (the ring and the last of a bead): the film above it
    this.wax = null; // wax (law 3: allocated when wax first lands on this tile)
    this.G = null; // oak gall, wet (allocated when gall first reaches this tile)
    this.FG = null; // oak gall, fixed
    this.dG = null;
    this.wet = 0;
    this.hot = 0; // its cells warmer than the air (law 3: wax)
    this.heatStep = -1;
    this.everWet = new Uint8Array(TT);
    this.touched = false;
    this.nb = new Array(8).fill(null);
    this.journal = null;
  }
}

// Wax on a tile (law 3): how much, the heat it holds (wax × its level above the
// air × HEAT_Q), a press's dent, cracks; dQ is the heat step's scratch.
function waxOn(t) {
  if (!t.wax) {
    t.wax = new Uint16Array(TT);
    t.waxQ = new Int32Array(TT);
    t.dQ = new Int32Array(TT);
    t.waxDent = new Uint8Array(TT);
    t.waxF = new Uint8Array(TT);
  }
}
// A cell's matter, and its face: wax lying on it once it covers the cell (WAX_SEAL), else its own.
const matterAt = (t, i) => (t.mat ? ROWS[t.mat[i]] : PAPER);
const waxFaced = (t, i) => t.wax !== undefined && t.wax !== null && t.wax[i] >= WAX_SEAL;
const faceOf = (t, i) => (waxFaced(t, i) ? WAX_FACE : matterAt(t, i).ink);
// Whether a liquid on it can sink in (its face drinks); how much of a nib's ink its face takes (‰).
const drinks = (t, i) => faceOf(t, i).drinks === 1;
const wets = (t, i) => faceOf(t, i).wets;

// n / 16384 rounded to the nearest, halves away from zero: the same both ways (law 3).
const roundQ14 = (n) => (n >= 0 ? floorDiv(n + 8192, 16384) : -floorDiv(-n + 8192, 16384));

function gallOn(t) {
  if (!t.G) {
    t.G = new Int32Array(TT);
    t.FG = new Uint16Array(TT);
    t.dG = new Int32Array(TT);
  }
}

// Per-cell derived values (levels from accumulators; the effective paper).
const dentL = (t, i) => t.dentA[i] >> DENT_SHIFT;
const soakL = (t, i) => Math.min(255, t.soakA[i] >> 8);
// what the paper holds here: its capacity within the front, and a dent's (the
// rest of the cell's water stands on top: views read the bead from it)
export const heldE = (t, i) => floorDiv(t.cap[i] * t.depthA[i], DEPTH_TOP) + dentL(t, i) * DENT_CAP;
// the front that would hold w drops here (never past the bottom)
function frontFor(t, i, w) {
  const d = w - dentL(t, i) * DENT_CAP;
  return d <= 0 || t.cap[i] === 0 ? 0 : Math.min(DEPTH_TOP, ceilDiv(d * DEPTH_TOP, t.cap[i]));
}
const zE = (t, i) => t.z[i] - dentL(t, i) * DENT_Z + t.cockle[i] - t.rim[i] * RIM_Z + (t.wax ? t.wax[i] - t.waxDent[i] : 0) + (t.bedA ? t.bedA[i] : 0);
// (law 4) loose ground: its grains carried in the water above it, and how far its bed has risen (−: fallen)
function grainsOn(t) {
  if (!t.S) {
    t.S = new Int32Array(TT);
    t.dS = new Int32Array(TT);
    t.bedA = new Int32Array(TT);
    t.outQ = new Int32Array(TT);
  }
}
const looseGround = (t, i) => {
  const r = matterAt(t, i);
  return r.strength === 0 && !!r.ink?.drinks;
};
// how much of a loose matter's grains (height units of its bed) a drop's worth of water can lift:
// the grains' weight in water (water's density over theirs) less their friction against each other
const liftOf = (r) => floorDiv(MATTER.water.density * (1000 - r.friction) * 1024, r.density * 1000); // /1024
const washed = (t, i) => Math.min(SOAK_FULL, t.soakA[i] >> 8);
const thirstE = (t, i) => clamp(t.siz[i] + floorDiv(washed(t, i) * SOAK_THIRST - dentL(t, i) * DENT_THIRST, 256), 0, 15);

// Does this tile hold any fact (ink, a dent, soak, wear, a tear, a ridge, a peak)?
function hasFacts(t) {
  for (let i = 0; i < TT; i++) {
    if (
      t.F[3 * i] ||
      t.F[3 * i + 1] ||
      t.F[3 * i + 2] ||
      t.dentA[i] >> DENT_SHIFT ||
      t.depthA[i] >> DEPTH_SHIFT ||
      t.peak[i] ||
      t.soakA[i] >> 8 ||
      t.wearA[i] >> WEAR_SHIFT ||
      t.flags[i] ||
      t.cockle[i] ||
      (t.FG && t.FG[i]) ||
      t.filmA[i] >> FILM_SHIFT ||
      (t.wax && t.wax[i]) ||
      (t.looseA && t.looseA[i]) ||
      (t.bedA && t.bedA[i])
    )
      return true;
  }
  return false;
}

// track: remember which tiles changed, for changed() (the live preview).
// gallAgeH: the age of the gall the water meets, in hours. Every record is
// minutes long, so within one record it is 0 (no record carries it); it is the
// hook for writing over an older sheet, which needs a ruling.
// paper: a paper to grow on instead of the key's (the law's own tests: an even sheet, to see the law alone)
// family.matter (law 4): the matter written on, grown from the key by its own grower (law/grow.js); paper by default
export function createSim({ paperKey, family, scale = SCALE_ONE, orgX = 0, orgY = 0, instrument = null, track = false, gallAgeH = 0, paper: evenPaper = null, law = 2 }) {
  if (!Number.isInteger(scale) || scale < SCALE_MIN || scale > SCALE_MAX) throw new LawError('scale', 'scale out of range');
  const paper = evenPaper ?? (law >= 4 && family?.matter && family.matter !== 'paper' ? makeGrower(family.matter, paperKey) : makePaper(paperKey, family));
  const tiles = new Map();
  const wetTiles = new Set();
  const hotTiles = new Set(); // (law 3) tiles with wax warmer than the air
  let hotCells = 0;
  let wetCells = 0;
  let everWet = 0;
  let work = 0;
  let now = 0;
  const touched = [];
  const dirty = track ? new Set() : null;
  const lost = { W: 0, P: 0, F: 0, G: 0 }; // what tears took with them (for the books: conservation)
  const cuts = { removed: 0, loose: 0, byMatter: {} }; // (law 4) ng taken off the cells, ng lying loose: always the same
  const splat = { drops: 0, W: 0 }; // what the pen threw (drops, and the water they put down)
  const put = { nib: 0, drops: 0 }; // water put down, by the nib and by drops (the books: every drop counted)
  const H = paperHasher(paperKey.subarray(0, 16));
  const hh = [0, 0];
  let strokeNo = -1; // which stroke, and which act of it: the paper's hash of a splatter is keyed by them
  let actNo = 0;
  let pdx = 0,
    pdy = 0; // the move before this one (a turn's sharpness)

  // Undo (live only): copy-on-write journals, one per stroke's pen-down.
  const journals = [];
  const saveState = (t) => [
    t,
    t.W.slice(),
    t.P.slice(),
    t.F.slice(),
    t.everWet.slice(),
    t.wet,
    t.dentA.slice(),
    t.depthA.slice(),
    t.peak.slice(),
    t.soakA.slice(),
    t.wearA.slice(),
    t.flags.slice(),
    t.rim.slice(),
    t.cockle.slice(),
    t.G ? t.G.slice() : null,
    t.FG ? t.FG.slice() : null,
    t.drainA.slice(),
    t.filmA.slice(),
    t.enter.slice(),
    t.wax ? [t.wax.slice(), t.waxQ.slice(), t.waxDent.slice(), t.waxF.slice(), t.hot] : null,
    // (law 4) what has come loose, and a stack's faces (a sheet worn through changes its cell)
    t.looseA || t.goneA || t.S ? [t.looseA?.slice() ?? null, t.looseM?.slice() ?? null, t.goneA?.slice() ?? null, t.S?.slice() ?? null, t.bedA?.slice() ?? null] : null,
    t.under ? [t.cap.slice(), t.hold.slice(), t.siz.slice(), t.z.slice(), t.link.slice(), t.mat.slice(), t.under.has.slice()] : null,
  ];
  function cow(t) {
    const j = journals.length ? journals[journals.length - 1] : null;
    if (!j || t.journal === j) return;
    t.journal = j;
    if (j.has.has(t)) return;
    j.has.add(t);
    j.saved.push(saveState(t));
  }

  const tileKey = (tx, ty) => (tx + 65536) * 131072 + (ty + 65536);
  function getTile(tx, ty) {
    const key = tileKey(tx, ty);
    let t = tiles.get(key);
    if (t) return t;
    t = new Tile(tx, ty, paper.tileFields(tx * TILE, ty * TILE));
    if (instrument) instrument.tile(t);
    tiles.set(key, t);
    for (let d = 0; d < 8; d++) {
      const o = tiles.get(tileKey(tx + NB_DX[d], ty + NB_DY[d]));
      if (o) {
        t.nb[d] = o;
        o.nb[(d + 4) & 7] = t;
      }
    }
    return t;
  }
  function neighbourTile(t, ox, oy) {
    const d = TILE_DIR[(oy + 1) * 3 + (ox + 1)];
    return t.nb[d] ?? getTile(t.tx + ox, t.ty + oy);
  }
  const res = [null, 0];
  function neighbour(t, idx, n) {
    const x = idx & LAST;
    const y = (idx - x) / TILE;
    const nx = x + NB_DX[n];
    const ny = y + NB_DY[n];
    if (nx >= 0 && nx < TILE && ny >= 0 && ny < TILE) {
      res[0] = t;
      res[1] = idx + NB_OFF[n];
    } else {
      res[0] = neighbourTile(t, nx < 0 ? -1 : nx >= TILE ? 1 : 0, ny < 0 ? -1 : ny >= TILE ? 1 : 0);
      res[1] = (ny & LAST) * TILE + (nx & LAST);
    }
    return res;
  }

  function becameWet(t, i) {
    if (instrument) instrument.wet(t, i);
    t.wet++;
    wetCells++;
    if (t.wet === 1) wetTiles.add(t);
    if (!t.everWet[i]) {
      t.everWet[i] = 1;
      everWet++;
      if (everWet > MAX_WET_CELLS) throw new LawError('cost', 'too much of the sheet is wet');
    }
  }
  function becameDry(t) {
    t.wet--;
    wetCells--;
    if (t.wet === 0) wetTiles.delete(t);
  }
  function becameHot(t) {
    t.hot++;
    hotCells++;
    if (t.hot === 1) hotTiles.add(t);
  }
  function becameCold(t) {
    t.hot--;
    hotCells--;
    if (t.hot === 0) hotTiles.delete(t);
  }
  function touch(t) {
    if (!t.touched) {
      t.touched = true;
      touched.push(t);
    }
  }

  // Whatever is still wet in a cell settles where it is, on top (the film), and
  // a soaked cell drying buckles along the paper's ridges.
  function snapCell(t, i) {
    const { P, F } = t;
    if (t.S && t.S[i]) {
      t.bedA[i] += t.S[i]; // (15) drying, the water lays down all it carried
      t.S[i] = 0;
    }
    for (let ch = 0; ch < 3; ch++) {
      const k = 3 * i + ch;
      if (P[k] > 0) {
        F[k] = Math.min(65535, F[k] + P[k]);
        t.filmA[i] += P[k];
        P[k] = 0;
      }
    }
    if (t.G && t.G[i] > 0) {
      t.FG[i] = Math.min(65535, t.FG[i] + t.G[i]);
      t.filmA[i] += t.G[i];
      t.G[i] = 0;
    }
    const sl = soakL(t, i);
    if (sl >= COCKLE_MIN) {
      const c = floorDiv(COCKLE_MAX * COCKLE[sl] * t.ridge[i], 65536);
      if (c > t.cockle[i]) t.cockle[i] = c;
    }
  }

  // A cell worn through: it holds nothing from now on (what it held is lost
  // with it), and its neighbours sit lower: ink reaching the rim pools there.
  function tear(t, i) {
    if (t.flags[i] & TORN) return;
    t.flags[i] |= TORN;
    lost.W += t.W[i];
    if (t.W[i] > 0) becameDry(t);
    t.W[i] = 0;
    for (let ch = 0; ch < 3; ch++) {
      lost.P += t.P[3 * i + ch];
      lost.F += t.F[3 * i + ch];
      t.P[3 * i + ch] = 0;
      t.F[3 * i + ch] = 0;
    }
    if (t.G) {
      lost.G += t.G[i] + t.FG[i];
      t.G[i] = 0;
      t.FG[i] = 0;
    }
    t.filmA[i] = 0;
    for (let n = 0; n < 8; n++) {
      neighbour(t, i, n);
      const tn = res[0];
      const j = res[1];
      if (journals.length) cow(tn);
      if (tn.rim[j] < 8) tn.rim[j]++;
      if (dirty) dirty.add(tn);
    }
  }

  // --- removing matter (law 4) ---

  // ng of matter `m` (an id) come loose on cell i: it lies there (it falls until it rests; on a
  // flat sheet, where it was), as much as was removed.
  function shed(t, i, ng, m) {
    if (ng <= 0) return;
    if (!t.looseA) {
      t.looseA = new Int32Array(TT);
      t.looseM = new Uint8Array(TT);
      t.goneA = t.goneA ?? new Int32Array(TT);
    }
    t.looseA[i] += ng;
    t.looseM[i] = m;
    cuts.removed += ng;
    cuts.loose += ng;
    cuts.byMatter[m] = (cuts.byMatter[m] ?? 0) + ng;
  }
  // (17) A breath meeting the sheet at cell (cx, cy), `dist` mm from the mouth, blowing `dir` degrees.
  function blow(cx, cy, dir, dist) {
    const jet = MATTER.air.jet;
    const reach = jet.decay * MK_BEING.mouth; // m: as far as it keeps its speed
    const q0 = 0.5 * MATTER.air.density * MK_BEING.breath ** 2 * reach * reach; // N·m²/m²: its push × distance² (past its reach)
    const ang = dir % 180,
      flip = dir >= 180 ? -1 : 1;
    const ux = (flip * COSSIN_Q14[2 * ang]) / 16384,
      uy = (flip * COSSIN_Q14[2 * ang + 1]) / 16384;
    const d0 = dist / 1000;
    const face = (t, i) => ORDER[t.mat ? t.mat[i] : 0] ?? 'paper';
    const moves = [];
    for (const t of tiles.values()) {
      if (!t.looseA) continue;
      for (let i = 0; i < TT; i++) {
        const ng = t.looseA[i];
        if (!ng) continue;
        const dx = t.tx * TILE + (i % TILE) - cx,
          dy = t.ty * TILE + Math.floor(i / TILE) - cy;
        const along = dx * ux + dy * uy,
          across = -dx * uy + dy * ux;
        if (along < 0) continue;
        const x = d0 + along * CELL_M; // m from the mouth
        if (Math.abs(across) * CELL_M > MK_BEING.mouth / 2 + jet.spread * x) continue; // (not under the jet)
        const m = ORDER[t.looseM[i]];
        const mu = Math.sqrt((MATTER[m].friction / 1000) * (MATTER[face(t, i)].friction / 1000));
        const holds = (mu * ng * 1e-12 * G_EARTH) / (CELL_M * CELL_M); // N/m²: what it takes to lift it
        const push = (x2) => (x2 <= reach * reach ? 0.5 * MATTER.air.density * MK_BEING.breath ** 2 : q0 / x2);
        if (push(x * x) < holds) continue;
        // carried on to where the jet no longer lifts it: push(x)² = holds there
        const land = Math.max(x, Math.sqrt(q0 / holds));
        const k = Math.floor((land - d0) / CELL_M) - Math.floor(along);
        if (k <= 0) continue;
        moves.push([t, i, ng, t.looseM[i], cx + Math.round(along * ux - across * uy) + Math.round(k * ux), cy + Math.round(along * uy + across * ux) + Math.round(k * uy)]);
      }
    }
    for (const [t, i, ng, m, lx, ly] of moves) {
      if (journals.length) cow(t);
      if (dirty) dirty.add(t);
      t.looseA[i] -= ng;
      const [tl, il] = cellAt(lx, ly);
      if (!tl.looseA) {
        tl.looseA = new Int32Array(TT);
        tl.looseM = new Uint8Array(TT);
        tl.goneA = tl.goneA ?? new Int32Array(TT);
      }
      if (tl.looseA[il] < ng) tl.looseM[il] = m; // (what lies there most is what it is)
      tl.looseA[il] += ng;
      cuts.blown = (cuts.blown ?? 0) + ng;
    }
  }
  // A cell's face worn as far as `level` of `strength`: the sheet's fibers that have gone, shed.
  function wearOff(t, i, row, level, strength) {
    if (!t.goneA) t.goneA = new Int32Array(TT);
    const want = row === PAPER ? floorDiv(SHEET_NG * Math.min(level, strength), strength) : 0;
    if (want > t.goneA[i]) {
      shed(t, i, want - t.goneA[i], t.mat ? t.mat[i] : PAPER_ID);
      t.goneA[i] = want;
    }
  }
  // Worn through. A sheet lying on a body: the rest of it goes (fluff), and the body beneath is the
  // cell's face from now on (its own fields, fresh). Else a hole, as ever (tear).
  function through(t, i) {
    const u = t.under;
    if (!u || !u.has[i]) {
      if (cutting) shed(t, i, SHEET_NG - (t.goneA ? t.goneA[i] : 0), t.mat ? t.mat[i] : PAPER_ID);
      tear(t, i);
      return;
    }
    shed(t, i, SHEET_NG - (t.goneA ? t.goneA[i] : 0), t.mat[i]);
    t.goneA[i] = 0;
    lost.W += t.W[i];
    if (t.W[i] > 0) becameDry(t);
    t.W[i] = 0;
    for (let ch = 0; ch < 3; ch++) {
      lost.P += t.P[3 * i + ch];
      lost.F += t.F[3 * i + ch];
      t.P[3 * i + ch] = 0;
      t.F[3 * i + ch] = 0;
    }
    t.filmA[i] = 0;
    t.cap[i] = u.cap[i];
    t.hold[i] = u.hold[i];
    t.siz[i] = u.siz[i];
    t.z[i] = u.z[i];
    t.mat[i] = u.mat[i];
    for (let n = 0; n < 8; n++) t.link[i * 8 + n] = u.link[i * 8 + n];
    u.has[i] = 0;
    t.wearA[i] = 0;
    t.dentA[i] = 0;
    t.depthA[i] = 0;
    t.soakA[i] = 0;
    t.cockle[i] = 0;
    t.enter[i] = 0;
    for (let n = 0; n < 8; n++) {
      neighbour(t, i, n);
      const tn = res[0];
      if (journals.length) cow(tn);
      if (tn.rim[res[1]] < 8) tn.rim[res[1]]++;
      if (dirty) dirty.add(tn);
    }
  }
  // A body's face cut `levels` deeper (wood, plaster: no fibers to tear): its dent, and the shavings.
  function cutInto(t, i, row, levels) {
    const was = t.dentA[i] >> DENT_SHIFT;
    t.dentA[i] = Math.min(DENT_TOP, t.dentA[i] + (levels << DENT_SHIFT));
    shed(t, i, ((t.dentA[i] >> DENT_SHIFT) - was) * sliceNg(row), t.mat[i]);
  }

  // --- the nib ---

  let pen = null;
  let nib = METAL; // what the nib is (its matter's row: law/matter.js)
  let penGall = false;
  let gallShare = 255; // (5) of an oak gall ink's gall, /255: the pen act's
  let abs0 = 0,
    abs1 = 0,
    abs2 = 0;
  const fair = law >= 3; // (11: direction fairness)
  const cutting = law >= 4; // (14: removing matter)
  let carry = 0;
  let well = 0; // what is left in a dipped nib's reservoir (law 3), of wellCap
  let wellCap = 0; // 0: not a dip pen (it never runs dry)
  const sc = (v) => floorDiv(v * scale, SCALE_ONE);

  function setPen(p) {
    if (batch) flushTick();
    pen = p;
    nib = nibOf(p);
    if (law >= 5) {
      // (16) an ink is what it holds: its pigment by its colour, its oak gall by the pen act's gall
      gallShare = p.gall ?? 0;
      penGall = gallShare > 0;
      abs0 = ABS_Q[p.rgb[0]];
      abs1 = ABS_Q[p.rgb[1]];
      abs2 = ABS_Q[p.rgb[2]];
      return;
    }
    penGall = isGall(p.rgb);
    abs0 = penGall ? 0 : ABS_Q[p.rgb[0]];
    abs1 = penGall ? 0 : ABS_Q[p.rgb[1]];
    abs2 = penGall ? 0 : ABS_Q[p.rgb[2]];
  }
  function widthAt(p) {
    if (pen.nib === NIB_FLEX) return sc(2 * (pen.size + floorDiv(pen.flex * PRESS_SHAPE[p], 256)));
    const base = sc(2 * pen.size);
    if (pen.nib === NIB_BROAD) return base;
    return floorDiv(base * (224 + floorDiv(p * 64, 255)), 256);
  }

  // Put `amt` drops through the footprint centred at (px, py), pressing with
  // pressure p and dent budget dd (dentA at the footprint's middle); a moving
  // nib wears a wet cell fully, a still one 1/16. A thrown drop (drop) is round
  // whatever the nib, presses nothing and wears nothing. Returns what did not fit.
  const fx = [];
  const fy = [];
  const fw = [];
  const fu = []; // |across| of each cell from the middle (flex tines)
  const fi = []; // ink weights (railroading moves the ink to the tines)
  function stamp(px, py, w, amt, p, dd, moving, drop = false) {
    fx.length = 0;
    fy.length = 0;
    fw.length = 0;
    fu.length = 0;
    let sum = 0;
    let top = 0;
    let spread = 0; // half the tines' spread, when they can railroad
    if ((pen.nib === NIB_BROAD || pen.nib === NIB_FLEX) && !drop) {
      // a broad edge, or flex tines spread across the nib's axis (`angle` is the spread's direction)
      const a = floorDiv(w, 2);
      const b = pen.nib === NIB_FLEX ? Math.max(HT_PER_CELL >> 1, sc(pen.size)) : floorDiv(sc(BROAD_T_HT), 2);
      if (pen.nib === NIB_FLEX) spread = a;
      const cos = COSSIN_Q14[2 * pen.angle];
      const sin = COSSIN_Q14[2 * pen.angle + 1];
      const r = a + b + HT_PER_CELL;
      const cx0 = floorDiv(px - r, HT_PER_CELL),
        cx1 = floorDiv(px + r, HT_PER_CELL);
      const cy0 = floorDiv(py - r, HT_PER_CELL),
        cy1 = floorDiv(py + r, HT_PER_CELL);
      for (let cy = cy0; cy <= cy1; cy++) {
        const dy = cy * HT_PER_CELL + 5 - py;
        for (let cx = cx0; cx <= cx1; cx++) {
          const dx = cx * HT_PER_CELL + 5 - px;
          const u = fair ? roundQ14(dx * cos + dy * sin) : floorDiv(dx * cos + dy * sin, 16384);
          const v = fair ? roundQ14(dy * cos - dx * sin) : floorDiv(dy * cos - dx * sin, 16384);
          const g = clamp(a - Math.abs(u), 0, HT_PER_CELL) * clamp(b - Math.abs(v), 0, HT_PER_CELL);
          if (g > 0) {
            fx.push(cx);
            fy.push(cy);
            fw.push(g);
            fu.push(Math.abs(u));
            sum += g;
            if (g > top) top = g;
          }
        }
      }
    } else {
      const R = floorDiv(w, 2);
      const R2 = R * R;
      const cx0 = floorDiv(px - R, HT_PER_CELL),
        cx1 = floorDiv(px + R, HT_PER_CELL);
      const cy0 = floorDiv(py - R, HT_PER_CELL),
        cy1 = floorDiv(py + R, HT_PER_CELL);
      for (let cy = cy0; cy <= cy1; cy++) {
        const dy = cy * HT_PER_CELL + 5 - py;
        for (let cx = cx0; cx <= cx1; cx++) {
          const dx = cx * HT_PER_CELL + 5 - px;
          const g = R2 - dx * dx - dy * dy;
          if (g > 0) {
            fx.push(cx);
            fy.push(cy);
            fw.push(g);
            sum += g;
            if (g > top) top = g;
          }
        }
      }
    }
    if (sum === 0) {
      fx.push(floorDiv(px, HT_PER_CELL));
      fy.push(floorDiv(py, HT_PER_CELL));
      fw.push(1);
      fu.push(0);
      sum = 1;
      top = 1;
      spread = 0;
    }
    // Wide tines with too little ink for the footprint: it runs down the tines, the middle starves.
    fi.length = 0;
    let sumI = sum;
    if (spread >= sc(RAIL_WIDE) && amt < RAIL_MIN * fx.length) {
      const inner = spread - sc(RAIL_TINE);
      sumI = 0;
      for (let k = 0; k < fx.length; k++) {
        const g = fu[k] < inner ? floorDiv(fw[k] * RAIL_MID, 256) : fw[k];
        fi.push(g);
        sumI += g;
      }
      if (sumI === 0) {
        fi.length = 0;
        sumI = sum;
      }
    }
    const ink = fi.length ? fi : fw;
    let given = 0;
    for (let k = 0; k < fx.length; k++) {
      const cx = fx[k];
      const cy = fy[k];
      const tx = floorDiv(cx, TILE);
      const ty = floorDiv(cy, TILE);
      const t = getTile(tx, ty);
      const i = (cy - ty * TILE) * TILE + (cx - tx * TILE);
      if (t.flags[i] & TORN) continue;
      if (journals.length) cow(t);
      if (dirty) dirty.add(t);
      // The nib presses: a dent (plastic), and on a wet cell, wear.
      const m = matterAt(t, i);
      if (dd > 0) t.dentA[i] = Math.min(DENT_TOP, t.dentA[i] + floorDiv(floorDiv(dd * fw[k], top) * PAPER.hardness, m.hardness));
      if (!drop && t.W[i] >= W_WET && !cutting) {
        t.wearA[i] += floorDiv((moving ? WEAR_Q[p] : WEAR_Q[p] >> WEAR_STILL) * fw[k], top); // < 2^9 · 2^16 per pass
        const strength = (m.ink.wear ?? STRENGTH_BASE * m.hardness) - floorDiv(t.W[i] * WET_K + soakL(t, i) * SOAK_K, 256);
        if (t.wearA[i] >> WEAR_SHIFT > strength) {
          tear(t, i);
          continue;
        }
      } else if (!drop && cutting && m.hardness < nib.hardness) {
        // (14) the nib cuts what is softer than it, wet or dry: the more, the harder the nib is than it
        // (a metal nib on paper at the paper's own rate; a stone harder, a stick of wood softer)
        const was = t.wearA[i] >> WEAR_SHIFT;
        t.wearA[i] += floorDiv(floorDiv((moving ? WEAR_Q[p] : WEAR_Q[p] >> WEAR_STILL) * fw[k], top) * (nib.hardness - m.hardness), METAL.hardness - PAPER.hardness);
        const level = t.wearA[i] >> WEAR_SHIFT;
        if (m === PAPER) {
          const dry = m.ink.wear;
          const strength = dry - floorDiv(t.W[i] * WET_K + soakL(t, i) * SOAK_K, 256);
          wearOff(t, i, m, level, dry);
          if (level > strength) {
            through(t, i);
            continue;
          }
        } else if (level > was) cutInto(t, i, m, level - was);
      }
      const room = floorDiv(W_SAT * wets(t, i), 1000) - t.W[i]; // a face that sheds ink holds only a skin of it: the rest beads off
      if (room <= 0) continue;
      const g = Math.min(floorDiv(amt * ink[k], sumI), room);
      if (g <= 0) continue;
      if (t.W[i] === 0) becameWet(t, i);
      t.W[i] += g;
      if (cutting && drop && looseGround(t, i)) {
        // (15) a drop landing on loose ground lifts grains as it splashes
        grainsOn(t);
        const lift = floorDiv(g * liftOf(m), 1024);
        t.S[i] += lift;
        t.bedA[i] -= lift;
      }
      if (penGall) {
        gallOn(t);
        t.G[i] += floorDiv(g * GALL_ABS * gallShare, 256 * 255);
      }
      if (!penGall || law >= 5) {
        t.P[3 * i] += floorDiv(g * abs0, 256);
        t.P[3 * i + 1] += floorDiv(g * abs1, 256);
        t.P[3 * i + 2] += floorDiv(g * abs2, 256);
      }
      if (instrument) instrument.deposit(t, i, g, now);
      given += g;
    }
    return amt - given;
  }

  // Deposit per tick (as v1): the tick's pieces stamped together, a stamp every
  // STEP_HT of travel, or one at the end if the pen barely moved. The dent
  // budget is the tick's pressure × time, shared over its stamps.
  let batch = null;
  let travel = 0;
  let dwellMs = 0; // how long the nib has sat still (its tip empties)
  const DEPOSIT_D = HT_PER_CELL * 256 * 16 * SCALE_ONE;
  const DEPOSIT_D16 = HT_PER_CELL * 256 * 16 * 16;

  function addPiece(k, x0, y0, p0, x1, y1, p1, dt) {
    if (batch && batch.k !== k) flushTick();
    if (!batch) {
      runUntil(k);
      batch = { k, segs: [] };
    }
    batch.segs.push([x0, y0, p0, x1, y1, p1, dt]);
  }

  function flushTick() {
    const b = batch;
    batch = null;
    if (!b) return;
    // Supply: wiped off by the distance moved, and fed for the time spent, less
    // as the cell under the nib fills and none once a still nib's tip is empty.
    let wipe = 0;
    let feed = 0;
    let dent = 0;
    let tickMs = 0;
    for (const [x0, y0, p0, x1, y1, p1, dt] of b.segs) {
      const pa = floorDiv(p0 + p1, 2);
      const unit = floorDiv(FLOW_Q[pen.flow] * widthAt(pa) * PRESS[pa] * scale, SCALE_ONE); // law 1's supply a ms
      wipe += unit * Math.min(WIPE_MAX16, floorDiv(fineLength(x1 - x0, y1 - y0) * 16, SUPPLY_V));
      feed += unit * dt * 16;
      dent += DENT_Q[pa] * dt;
      tickMs += dt;
    }
    const sx = [],
      sy = [],
      sp = [];
    for (const [x0, y0, p0, x1, y1, p1] of b.segs) {
      const dx = x1 - x0,
        dy = y1 - y0;
      const L = fineLength(dx, dy);
      if (L === 0) continue;
      for (let at = STEP_FINE - travel; at <= L; at += STEP_FINE) {
        sx.push(x0 + floorDiv(dx * at, L));
        sy.push(y0 + floorDiv(dy * at, L));
        sp.push(p0 + floorDiv((p1 - p0) * at, L));
      }
      travel = travel + L - STEP_FINE * floorDiv(travel + L, STEP_FINE);
    }
    const end = b.segs[b.segs.length - 1];
    const moving = sx.length > 0;
    if (!moving) {
      sx.push(end[3]);
      sy.push(end[4]);
      sp.push(end[5]);
      travel = 0;
    }
    dwellMs = moving ? 0 : dwellMs + tickMs;
    const ex = floorDiv(end[3], HT_PER_CELL),
      ey = floorDiv(end[4], HT_PER_CELL);
    const et = getTile(floorDiv(ex, TILE), floorDiv(ey, TILE));
    const under = fair ? wetAt(end[3], end[4]) : et.W[(ey - et.ty * TILE) * TILE + (ex - et.tx * TILE)];
    const fill = Math.min(256, floorDiv(under * 256, W_SAT));
    const fed = dwellMs > DWELL_MS ? 0 : floorDiv(floorDiv(feed, 256) * FEED_Q, 256) * (256 - fill);
    const supply = pen.flow === 0 ? 0 : floorDiv(wipe + fed, DEPOSIT_D16) + carry;
    // a dipped nib gives as much as it still holds allows: its line fades as it empties
    const total = wellCap ? Math.min(well, ceilDiv(supply * well, wellCap)) : supply;
    const n = sx.length;
    let left = 0;
    for (let m = 1; m <= n; m++) {
      const amt = floorDiv(total * m, n) - floorDiv(total * (m - 1), n);
      const dd = floorDiv(dent * m, n) - floorDiv(dent * (m - 1), n);
      const l = stamp(sx[m - 1], sy[m - 1], widthAt(sp[m - 1]), amt, sp[m - 1], dd, moving);
      put.nib += amt - l;
      left += l;
    }
    if (wellCap) well -= total - left; // what went onto the paper left the reservoir
    carry = pen.flow === 0 ? 0 : Math.min(left, floorDiv(FLOW_Q[pen.flow] * widthAt(end[5]) * 256 * CARRY_MS * scale, DEPOSIT_D));
    // what the pen threw in this tick lands after the nib's ink
    if (b.drops) {
      for (const [x, y, r, amt] of b.drops) {
        const given = amt - stamp(x, y, 2 * r, amt, 0, 0, false, true);
        splat.drops++;
        splat.W += given;
        put.drops += given;
      }
    }
  }

  // --- the rules ---

  function flow() {
    for (const t of wetTiles) {
      const { W, P, link, dW, dP, hold } = t;
      const G = t.G;
      let gave = false;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        const s = Wi - heldE(t, i); // standing on top (below the surface when negative)
        const sPos = s > 0 ? s : 0;
        const inP = Math.min(Wi, floorDiv(t.cap[i] * t.depthA[i], DEPTH_TOP)); // in the pores (below the front; a groove's water stays in the groove)
        const pk = Math.min(255, sPos >> PEAK_SHIFT);
        if (pk > t.peak[i]) t.peak[i] = pk;
        if (sPos > 0 && t.depthA[i] === 0 && t.enter[i] < 255) t.enter[i]++; // the top still resisting
        const phi = s + zE(t, i);
        const holdI = hold[i];
        const sl = soakL(t, i);
        const inner = INNER[i] === 1;
        const P0 = P[3 * i],
          P1 = P[3 * i + 1],
          P2 = P[3 * i + 2];
        const Gi = G ? G[i] : 0;
        const Si = t.S ? t.S[i] : 0;
        let outS = 0,
          outQs = 0;
        let outW = 0,
          out0 = 0,
          out1 = 0,
          out2 = 0,
          outG = 0;
        for (let n = 0; n < 8; n++) {
          let tn = t;
          let j = i + NB_OFF[n];
          if (!inner) {
            neighbour(t, i, n);
            tn = res[0];
            j = res[1];
          }
          if (tn.flags[j] & TORN) continue;
          const Wj = tn.W[j];
          const d = phi - (Wj - heldE(tn, j) + zE(tn, j));
          if (d <= 0) continue;
          const dryJ = Wj < W_WET;
          const gs = s > 0 && (!dryJ || s > holdI) ? (dryJ ? GS_DRY[n] : GS_WET[n]) : 0;
          let lk = link[i * 8 + n];
          if (lk && sl) lk += floorDiv(lk * sl * SOAK_LINK, 256); // soaked fibers loosen
          let gp = tn.cap[j] === 0 ? 0 : diag(dryJ ? G_WICK + SOAK_WICK * washed(tn, j) : G_PORE + SOAK_PORE * sl, n) + lk; // (nothing goes into pores it has not got)
          if (gs + gp > G_MAX) gp = G_MAX - gs;
          const qp = floorDiv(Math.min(d, inP) * gp, 4096); // through the pores
          const qs = floorDiv(Math.min(d, sPos) * gs, 4096);
          const q = qs + qp; // and over the top
          if (q <= 0) continue;
          if (cutting && qs > 0) {
            // (15) the grains ride on what runs over the top
            outQs += qs;
            if (Si) {
              const ms = floorDiv(Si * qs, Wi);
              if (ms) {
                grainsOn(tn);
                tn.dS[j] += ms;
                outS += ms;
              }
            }
          }
          const m0 = floorDiv(P0 * q, Wi);
          const m1 = floorDiv(P1 * q, Wi);
          const m2 = floorDiv(P2 * q, Wi);
          const mg = Gi ? floorDiv(Gi * q, Wi) : 0;
          outW += q;
          out0 += m0;
          out1 += m1;
          out2 += m2;
          outG += mg;
          if (journals.length && tn !== t) cow(tn);
          tn.dW[j] += q;
          if (qp) tn.dWp[j] += qp;
          tn.dP[3 * j] += m0;
          tn.dP[3 * j + 1] += m1;
          tn.dP[3 * j + 2] += m2;
          if (mg) {
            gallOn(tn);
            tn.dG[j] += mg;
          }
          if (tn !== t) touch(tn);
          if (instrument && link[i * 8 + n]) instrument.fiber(t, i, n, floorDiv(Math.min(d, inP) * lk, 4096));
        }
        if (outQs) {
          grainsOn(t);
          t.outQ[i] += outQs;
          if (outS) t.dS[i] -= outS;
        }
        if (outW) {
          dW[i] -= outW;
          dP[3 * i] -= out0;
          dP[3 * i + 1] -= out1;
          dP[3 * i + 2] -= out2;
          if (outG) t.dG[i] -= outG;
          gave = true;
        }
      }
      if (gave) touch(t);
    }
    applyDeltas();
  }

  function applyDeltas() {
    for (const t of touched) {
      if (journals.length) cow(t);
      if (dirty) dirty.add(t);
      const { W, P, dW, dP, dWp } = t;
      const G = t.G;
      const dG = t.dG;
      if (t.dS) {
        for (let i = 0; i < TT; i++)
          if (t.dS[i]) {
            t.S[i] += t.dS[i];
            t.dS[i] = 0;
          }
      }
      for (let i = 0; i < TT; i++) {
        const dw = dW[i];
        const dp0 = dP[3 * i],
          dp1 = dP[3 * i + 1],
          dp2 = dP[3 * i + 2];
        const dg = dG ? dG[i] : 0;
        const dwp = dWp[i];
        if (dw === 0 && dp0 === 0 && dp1 === 0 && dp2 === 0 && dg === 0 && dwp === 0) continue;
        const was = W[i];
        const w = was + dw;
        if (dwp) {
          // what came through the pores is in the pores: the front reaches it
          const pores = floorDiv(t.cap[i] * t.depthA[i], DEPTH_TOP);
          const fr = Math.min(DEPTH_TOP, ceilDiv(Math.min(w, Math.min(was, pores) + dwp) * DEPTH_TOP, t.cap[i]));
          if (fr > t.depthA[i]) t.depthA[i] = fr;
          dWp[i] = 0;
        }
        W[i] = w;
        P[3 * i] += dp0;
        P[3 * i + 1] += dp1;
        P[3 * i + 2] += dp2;
        dW[i] = 0;
        dP[3 * i] = 0;
        dP[3 * i + 1] = 0;
        dP[3 * i + 2] = 0;
        if (dg) {
          G[i] += dg;
          dG[i] = 0;
          if (G[i] < 0) throw new Error(`law invariant broken: G=${G[i]}`);
        }
        if (w >= 8192 || w < 0) throw new Error(`law invariant broken: W=${w}`);
        if (was === 0 && w > 0) becameWet(t, i);
        else if (was > 0 && w === 0) {
          becameDry(t);
          snapCell(t, i);
        }
      }
      t.touched = false;
    }
    touched.length = 0;
  }

  // (15) Loose ground under running water: the water lifts grains off the bed up to what it can carry
  // (its depth on top, the share of it leaving this tick, the grains' lift), and lays down what it
  // cannot. (Grains only change place between the bed and the water: their sum is fixed.)
  function grains() {
    for (const t of wetTiles) {
      const { W } = t;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0 || !looseGround(t, i)) continue;
        grainsOn(t);
        const s = Math.max(0, Wi - heldE(t, i));
        const cap = floorDiv(floorDiv(s * t.outQ[i], Wi) * liftOf(matterAt(t, i)), 1024);
        t.outQ[i] = 0;
        const d = cap - t.S[i];
        if (d === 0) continue;
        if (journals.length) cow(t);
        t.S[i] += d;
        t.bedA[i] -= d;
        if (dirty) dirty.add(t);
      }
    }
  }

  // Pigment (and gall) diffuses between wet 4-neighbours, toward the lower concentration.
  function mix() {
    for (const t of wetTiles) {
      const { W, P } = t;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        const inner = INNER[i] === 1;
        for (let n = 0; n <= 2; n += 2) {
          let tn = t,
            j = i + NB_OFF[n];
          if (!inner) {
            neighbour(t, i, n);
            tn = res[0];
            j = res[1];
          }
          const Wj = tn.W[j];
          if (Wj <= 0) continue;
          const den = (Wi + Wj) * 4096;
          for (let ch = 0; ch < 3; ch++) {
            const x = P[3 * i + ch] * Wj - tn.P[3 * j + ch] * Wi;
            if (x === 0) continue;
            const m = floorDiv(Math.abs(x) * G_MIX, den);
            if (m === 0) continue;
            const sign = x > 0 ? 1 : -1;
            t.dP[3 * i + ch] -= sign * m;
            tn.dP[3 * j + ch] += sign * m;
            touch(t);
            touch(tn);
          }
          if (t.G || tn.G) {
            const gi = t.G ? t.G[i] : 0;
            const gj = tn.G ? tn.G[j] : 0;
            const x = gi * Wj - gj * Wi;
            if (x !== 0) {
              const m = floorDiv(Math.abs(x) * G_MIX, den);
              if (m) {
                gallOn(t);
                gallOn(tn);
                const sign = x > 0 ? 1 : -1;
                t.dG[i] -= sign * m;
                tn.dG[j] += sign * m;
                touch(t);
                touch(tn);
              }
            }
          }
        }
      }
    }
    applyDeltas();
  }

  // Wet pigment binds to the fibers at the cell's (effective) thirst and sinks
  // into them: deeper where the paper is thirstier and in a groove.
  function settle() {
    for (const t of wetTiles) {
      const { W, P, F } = t;
      const G = t.G;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        const th = thirstE(t, i);
        const rate = SETTLE[th];
        const inPaper = Math.min(Wi, heldE(t, i)); // pigment binds where the water is in the paper
        const den = Wi * 65536;
        for (let ch = 0; ch < 3; ch++) {
          const k = 3 * i + ch;
          const p = P[k];
          if (p <= 0) continue;
          const f = Math.min(p, ceilDiv(p * rate * inPaper, den));
          P[k] = p - f;
          F[k] = Math.min(65535, F[k] + f);
        }
        if (G && G[i] > 0) {
          const g = G[i];
          const f = Math.min(g, ceilDiv(g * rate * inPaper, den));
          G[i] = g - f;
          t.FG[i] = Math.min(65535, t.FG[i] + f);
        }
      }
    }
  }

  // Water over fixed ink turns some of it wet again (the water brush, and any
  // wet ink over dry). Oak gall resists as it darkens: REDISSOLVE·(1 − dark).
  function revive() {
    for (const t of wetTiles) {
      const { W, P, F } = t;
      const FG = t.FG;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        let back = 0;
        for (let ch = 0; ch < 3; ch++) {
          const k = 3 * i + ch;
          if (!F[k]) continue;
          const r = floorDiv(F[k] * REDISSOLVE * Wi, W_SAT * 65536); // < 2^16 · 2^12 · 2^11
          if (!r) continue;
          F[k] -= r;
          P[k] += r;
          back += r;
        }
        if (FG && FG[i]) {
          const keep = 256 - darkAt(t.depthA[i] >> DEPTH_SHIFT, filmLevel(t.filmA[i]), gallAgeH);
          const r = floorDiv(FG[i] * REDISSOLVE * Wi * keep, W_SAT * 65536 * 256); // < 2^16 · 2^12 · 2^13 · 2^9
          if (r) {
            FG[i] -= r;
            t.G[i] += r;
            back += r;
          }
        }
        if (back) t.filmA[i] = Math.max(0, t.filmA[i] - back); // the film on top lifts first
      }
    }
  }

  // The front advances where water stands over it; water leaves into the air
  // (edges first, from the top first), soaking the paper as it goes; what the
  // water can no longer carry is left behind (the ring).
  function dry() {
    const list = [...wetTiles];
    for (const t of list) {
      const { W, dW, adv } = t;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        // the front: once the top has let the water in, it sinks, slower deeper, never past the
        // water around it (the fibers carry it sideways: a cell and its neighbours, as SINK_W),
        // nor more than FRONT_STEP ahead of its deepest side neighbour (one wet front, no spikes)
        adv[i] = -1;
        const fr = t.depthA[i];
        if (fr < DEPTH_TOP && Wi > heldE(t, i) && drinks(t, i)) {
          let th = 4 * thirstE(t, i);
          let wa = 4 * Wi;
          let side = 0;
          for (let n = 0; n < 8; n++) {
            neighbour(t, i, n);
            th += SINK_W[n] * thirstE(res[0], res[1]);
            wa += SINK_W[n] * res[0].W[res[1]];
            if (!(n & 1) && res[0].depthA[res[1]] > side) side = res[0].depthA[res[1]];
          }
          th >>= 4;
          if (fr > 0 || t.enter[i] >= ENTER[th]) {
            const to = Math.min(fr + Math.max(1, floorDiv(FRONT[th] * (DEPTH_TOP - fr), DEPTH_TOP)), frontFor(t, i, wa >> 4), side + FRONT_STEP);
            adv[i] = Math.max(fr, to);
          }
        }
        let nd = 0;
        if (INNER[i] === 1) {
          for (let n = 0; n < 8; n++) if (W[i + NB_OFF[n]] < W_WET) nd++;
        } else {
          for (let n = 0; n < 8; n++) {
            neighbour(t, i, n);
            if (res[0].W[res[1]] < W_WET) nd++;
          }
        }
        dW[i] = Math.max(E_MIN, ceilDiv((EVAP_BASE + EVAP_EDGE * nd) * CAP_REF, 65536));
      }
    }
    for (const t of list) {
      const { W, P, F, dW } = t;
      const G = t.G;
      for (let i = 0; i < TT; i++) {
        const Wi = W[i];
        if (Wi <= 0) continue;
        if (t.adv[i] > t.depthA[i]) t.depthA[i] = t.adv[i];
        if (drinks(t, i)) t.soakA[i] = Math.min(255 << 8, t.soakA[i] + floorDiv(Wi * SOAK_Q, W_SAT));
        const e = dW[i];
        dW[i] = 0;
        let w = Wi - Math.min(e, Wi);
        if (w < W_EPS) w = 0;
        t.drainA[i] += Wi - w;
        W[i] = w;
        if (w === 0) {
          becameDry(t);
          snapCell(t, i);
          continue;
        }
        // what the water can no longer carry is left on top (the ring)
        const capP = floorDiv(w * C_SAT, 256);
        for (let ch = 0; ch < 3; ch++) {
          const k = 3 * i + ch;
          if (P[k] > capP) {
            F[k] = Math.min(65535, F[k] + P[k] - capP);
            t.filmA[i] += P[k] - capP;
            P[k] = capP;
          }
        }
        if (G && G[i] > capP) {
          t.FG[i] = Math.min(65535, t.FG[i] + G[i] - capP);
          t.filmA[i] += G[i] - capP;
          G[i] = capP;
        }
      }
    }
  }

  // Heat (law 3): each warm wax cell gives to each cooler wax cell beside it, by
  // the difference and the thinner one's wax (as water flows: from the giver's
  // side, all from the step's start), and loses to the paper and the air by its
  // level, rounded up; a cell left no warmer than the air holds none and sleeps.
  // Only warm tiles compute: a cold cell gives nothing, and a cold tile that
  // receives wakes.
  let heatSteps = 0;
  function heat() {
    heatSteps++;
    const got = [];
    const take = (t) => {
      if (t.heatStep === heatSteps) return;
      if (journals.length) cow(t);
      t.heatStep = heatSteps;
      t.dQ.fill(0);
      got.push(t);
    };
    work += hotCells;
    for (const t of hotTiles) {
      take(t);
      const { wax, waxQ, dQ } = t;
      for (let i = 0; i < TT; i++) {
        const Q = waxQ[i];
        if (Q === 0) continue;
        const w = wax[i];
        const T = floorDiv(Q, w);
        if (T === 0) {
          dQ[i] -= Q; // no warmer than the air
          continue;
        }
        const inner = INNER[i] === 1;
        let out = 0;
        for (let n = 0; n < 8; n++) {
          let tn = t;
          let j = i + NB_OFF[n];
          if (!inner) {
            neighbour(t, i, n);
            tn = res[0];
            j = res[1];
          }
          const wj = tn.wax ? tn.wax[j] : 0;
          if (!wj) continue;
          const d = T - floorDiv(tn.waxQ[j], wj);
          if (d <= 0) continue;
          const q = floorDiv(d * Math.min(w, wj) * diag(WAX_CONDUCT, n), 4096);
          if (q === 0) continue;
          take(tn);
          tn.dQ[j] += q;
          out += q;
        }
        dQ[i] -= out + ceilDiv(T * WAX_COOL, 256);
      }
    }
    for (const t of got) {
      const { waxQ, dQ } = t;
      for (let i = 0; i < TT; i++) {
        if (dQ[i] === 0) continue;
        const was = waxQ[i];
        const q = Math.max(0, was + dQ[i]);
        waxQ[i] = q;
        if (was === 0 && q > 0) becameHot(t);
        else if (was > 0 && q === 0) becameCold(t);
      }
    }
  }

  function step(k) {
    if (dirty) for (const t of wetTiles) dirty.add(t);
    if (journals.length) for (const t of wetTiles) cow(t);
    work += wetCells;
    if (work > MAX_WORK) throw new LawError('cost', 'this writing takes too long to settle');
    flow();
    if (cutting) grains();
    if (k % DRY_EVERY === DRY_EVERY - 1) {
      mix();
      settle();
      revive();
      dry();
      if (hotCells) heat();
    }
    if (instrument) instrument.step(k, wetTiles);
  }

  function runUntil(k) {
    while (now < k) {
      if (wetCells === 0 && hotCells === 0) {
        now = k;
        break;
      }
      step(now);
      now++;
    }
  }

  // The water under the nib's point (law 3, direction fairness): the four cells about
  // it, each as near as it is (law 2 read the one cell down and right of the point, so
  // a nib on a cell's corner fed one way more than its mirror).
  function wetAt(X, Y) {
    const x0 = floorDiv(X - 5, HT_PER_CELL),
      y0 = floorDiv(Y - 5, HT_PER_CELL);
    const fx = X - 5 - x0 * HT_PER_CELL,
      fy = Y - 5 - y0 * HT_PER_CELL;
    let w = 0;
    for (const [cx, cy, k] of [
      [x0, y0, (HT_PER_CELL - fx) * (HT_PER_CELL - fy)],
      [x0 + 1, y0, fx * (HT_PER_CELL - fy)],
      [x0, y0 + 1, (HT_PER_CELL - fx) * fy],
      [x0 + 1, y0 + 1, fx * fy],
    ]) {
      if (!k) continue;
      const t = getTile(floorDiv(cx, TILE), floorDiv(cy, TILE));
      w += t.W[(cy - t.ty * TILE) * TILE + (cx - t.tx * TILE)] * k;
    }
    return floorDiv(w, HT_PER_CELL * HT_PER_CELL);
  }

  // --- law 3: the dip, and the wax ---

  // The pen dipped: its reservoir full (level 1..WELL_MAX).
  function dip(level) {
    if (batch) flushTick();
    wellCap = level * WELL_UNIT;
    well = wellCap;
  }

  const seals = []; // each press: whether it took (the design dented into soft wax)
  const cellOf = (x, y) => [floorDiv(hx(x), HT_PER_CELL), floorDiv(hy(y), HT_PER_CELL)];
  function cellAt(cx, cy) {
    const t = getTile(floorDiv(cx, TILE), floorDiv(cy, TILE));
    if (dirty) dirty.add(t);
    if (journals.length) cow(t);
    return [t, (cy - t.ty * TILE) * TILE + (cx - t.tx * TILE)];
  }
  // soft: warmer than its softening heat (level ≥ WAX_SOFTEN, exactly: Q ≥ WAX_SOFTEN × HEAT_Q × wax)
  const soft = (t, i) => t.waxQ[i] >= WAX_SOFTEN * HEAT_Q * t.wax[i];

  // The wax at a point (the record's tenths) as it is now: how much, its level
  // above the air, liquid (above its melting heat), soft (it would take a press).
  function waxAt(x, y) {
    const [cx, cy] = cellOf(x, y);
    const t = tiles.get(tileKey(floorDiv(cx, TILE), floorDiv(cy, TILE)));
    const i = t ? (cy - t.ty * TILE) * TILE + (cx - t.tx * TILE) : 0;
    const wax = t && t.wax ? t.wax[i] : 0;
    const level = wax ? floorDiv(t.waxQ[i], wax * HEAT_Q) : 0;
    return { wax, level, liquid: wax > 0 && level >= WAX_MELT, soft: wax > 0 && level >= WAX_SOFTEN };
  }

  // A mark at its moment (on the record's clock): a drip, a press, a break, or (law 4) water poured.
  function mark(m) {
    if (batch) flushTick();
    runUntil(floorDiv(m.t, TICK_MS));
    const [cx, cy] = cellOf(m.x, m.y);
    if (m.kind === 'burn') {
      if (law < 5) throw new LawError('acts', 'a burn is law 5');
      const [x1, y1] = cellOf(m.x + m.w, m.y + m.h);
      for (let y = cy; y < y1; y++)
        for (let x = cx; x < x1; x++) {
          const [t, i] = cellAt(x, y);
          if (t.flags[i] & TORN) continue;
          t.flags[i] |= TORN;
          const row = ROWS[t.mat ? t.mat[i] : 0];
          const ash = Math.floor((cellNg(row, row.ink?.thickness ? row.ink.thickness / 1e6 : 1e-4) * (row.heat.leaves ?? 0)) / 1000);
          cuts.burnt = (cuts.burnt ?? 0) + 1;
          if (ash > 0) {
            if (!t.looseA) {
              t.looseA = new Int32Array(TT);
              t.looseM = new Uint8Array(TT);
              t.goneA = t.goneA ?? new Int32Array(TT);
            }
            t.looseA[i] += ash;
            t.looseM[i] = idOf('ash');
            cuts.loose += ash;
          }
        }
      return;
    }
    if (m.kind === 'blow') {
      if (law < 5) throw new LawError('acts', 'a breath is law 5');
      blow(cx, cy, m.dir, m.dist);
      return;
    }
    if (m.kind === 'pour') {
      // (15) water landing where it is poured: on its cell, and as much as that holds on each ring
      // about it, out to where it has all landed (it lands on top, as ink does)
      if (!cutting) throw new LawError('acts', 'a pour is law 4');
      if (m.t > lastT) lastT = m.t; // (the water settles from its last landing)
      let left = m.amt;
      for (let r = 0; left > 0 && r <= WAX_R_MAX; r++)
        for (let dy = -r; dy <= r && left > 0; dy++)
          for (let dx = -r; dx <= r && left > 0; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
            const [t, i] = cellAt(cx + dx, cy + dy);
            if (t.flags[i] & TORN) continue;
            const g = Math.min(left, W_SAT - t.W[i]);
            if (g <= 0) continue;
            if (t.W[i] === 0) becameWet(t, i);
            t.W[i] += g;
            put.drops += g;
            left -= g;
          }
      return;
    }
    if (m.kind === 'drip') {
      // a dome of wax, wider the more of it and the more liquid it is
      const R = clamp(sc(isqrt(floorDiv(m.amt * (128 + m.heat), WAX_SPREAD))), 1, WAX_R_MAX);
      const cells = [];
      let sum = 0;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const g = R * R - dx * dx - dy * dy;
          if (g <= 0) continue;
          cells.push([cx + dx, cy + dy, g]);
          sum += g;
        }
      for (const [x, y, g] of cells) {
        const [t, i] = cellAt(x, y);
        if (t.flags[i] & TORN) continue;
        waxOn(t);
        // it lands carrying its heat: the cell's heat and the drip's, over their wax together
        const add = Math.min(WAX_MAX - t.wax[i], floorDiv(m.amt * g, sum));
        t.wax[i] += add;
        const was = t.waxQ[i];
        t.waxQ[i] = was + add * m.heat * HEAT_Q;
        if (was === 0 && t.waxQ[i] > 0) becameHot(t);
      }
    } else if (m.kind === 'press') {
      // the face, turned to the stamper's angle, each pixel m.cell cells; tilted, one side deeper
      const cos = COSSIN_Q14[2 * m.angle];
      const sin = COSSIN_Q14[2 * m.angle + 1];
      const hw = m.w * m.cell,
        hh = m.h * m.cell;
      const R = isqrt(hw * hw + hh * hh) + 1;
      let design = 0,
        took = 0;
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const u = floorDiv(dx * cos + dy * sin, 16384) + (hw >> 1);
          const v = floorDiv(dy * cos - dx * sin, 16384) + (hh >> 1);
          if (u < 0 || v < 0 || u >= hw || v >= hh) continue;
          const fu = floorDiv(u, m.cell),
            fv = floorDiv(v, m.cell);
          const relief = m.face[fv * m.w + fu];
          const lean = 256 + floorDiv(m.tiltX * (2 * fu + 1 - m.w), m.w) + floorDiv(m.tiltY * (2 * fv + 1 - m.h), m.h);
          const want = floorDiv(relief * m.depth * Math.max(0, lean), 255 * 256);
          const [t, i] = cellAt(cx + dx, cy + dy);
          const raised = relief >= SEAL_RAISED;
          if (raised) design++;
          if (!t.wax || t.wax[i] < WAX_SEAL || !soft(t, i)) continue; // cold wax, or none, takes no impression
          const d = Math.min(want, t.wax[i], 255);
          if (d > t.waxDent[i]) t.waxDent[i] = d;
          if (raised && t.waxDent[i] >= SEAL_DENT) took++;
        }
      seals.push({ t: m.t, took: design > 0 && took * 256 >= SEAL_TOOK * design, design, dented: took });
    } else {
      // a crack across the wax, from (x, y) to (x1, y1)
      const [ex, ey] = cellOf(m.x1, m.y1);
      const n = Math.max(Math.abs(ex - cx), Math.abs(ey - cy), 1);
      for (let k = 0; k <= n; k++) {
        const x = cx + floorDiv((ex - cx) * k, n),
          y = cy + floorDiv((ey - cy) * k, n);
        for (const [ox, oy] of [
          [0, 0],
          [1, 0],
          [0, 1],
        ]) {
          const [t, i] = cellAt(x + ox, y + oy);
          if (t.wax && t.wax[i]) t.waxF[i] |= WAX_CRACK;
        }
      }
    }
  }

  // --- feeding acts ---

  const hx = (x) => 20 * orgX + floorDiv(2 * x * scale, SCALE_ONE);
  const hy = (y) => 20 * orgY + floorDiv(2 * y * scale, SCALE_ONE);

  let last = null;
  let lastT = 0;
  let inStroke = false;

  function strokeStart(x, y, t, p) {
    if (batch) flushTick();
    runUntil(floorDiv(t, TICK_MS));
    last = { x: hx(x), y: hy(y), p, t };
    carry = 0;
    travel = 0;
    lastT = t;
    inStroke = true;
    strokeNo++;
    actNo = 0;
    dwellMs = 0;
    pdx = 0;
    pdy = 0;
    if (instrument) instrument.strokeStart(t);
  }

  function act(x, y, t, p) {
    const X = hx(x),
      Y = hy(y);
    const a = last;
    const dt = t - a.t;
    if (dt < 1) throw new LawError('acts', 'time must move forward');
    let tau = a.t;
    let pxs = a.x,
      pys = a.y,
      pps = a.p;
    while (tau < t) {
      const k = floorDiv(tau, TICK_MS);
      const tb = Math.min(t, (k + 1) * TICK_MS);
      const f = tb - a.t;
      const pxe = a.x + floorDiv((X - a.x) * f, dt);
      const pye = a.y + floorDiv((Y - a.y) * f, dt);
      const ppe = a.p + floorDiv((p - a.p) * f, dt);
      addPiece(k, pxs, pys, pps, pxe, pye, ppe, tb - tau);
      pxs = pxe;
      pys = pye;
      pps = ppe;
      tau = tb;
    }
    actNo++;
    if (pen.spatter) {
      const ci = floorDiv(X, HT_PER_CELL),
        cj = floorDiv(Y, HT_PER_CELL);
      const tt = getTile(floorDiv(ci, TILE), floorDiv(cj, TILE));
      const drops = splatter(H, hh, {
        si: strokeNo,
        i: actNo,
        x0: a.x,
        y0: a.y,
        x1: X,
        y1: Y,
        pdx,
        pdy,
        dt,
        p,
        flow: pen.flow,
        spatter: pen.spatter,
        tooth: tt.z[(cj - tt.ty * TILE) * TILE + (ci - tt.tx * TILE)],
        scale,
      });
      if (drops.length) {
        (batch.drops ??= []).push(...drops);
        if (instrument?.splat) instrument.splat(strokeNo, actNo, drops);
      }
    }
    pdx = X - a.x;
    pdy = Y - a.y;
    last = { x: X, y: Y, p, t };
    lastT = t;
  }

  function finish() {
    if (batch) flushTick();
    runUntil(floorDiv(lastT, TICK_MS) + 1);
    const drainEnd = floorDiv(lastT, TICK_MS) + 1 + DRAIN_MAX_TICKS;
    while (wetCells > 0 && now < drainEnd) {
      step(now);
      now++;
    }
    for (const t of [...wetTiles]) {
      for (let i = 0; i < TT; i++) {
        if (t.W[i] > 0) {
          t.drainA[i] += t.W[i];
          t.W[i] = 0;
          becameDry(t);
          snapCell(t, i);
        }
      }
    }
    if (instrument) instrument.finish(now);
    return {
      tiles: [...tiles.values()].filter(hasFacts),
      ticks: now,
      work,
      lost: { ...lost },
      splat: { ...splat },
      put: { ...put },
      seals: [...seals],
      well,
      cuts: { ...cuts, byMatter: { ...cuts.byMatter } },
    };
  }

  // --- live (between strokes only) ---

  function endStroke() {
    inStroke = false;
  }

  function advanceTo(k) {
    if (inStroke) throw new Error('advanceTo while the pen is down');
    if (batch) flushTick();
    runUntil(Math.min(k, floorDiv(lastT, TICK_MS) + 1 + DRAIN_MAX_TICKS));
  }

  function snapshot() {
    if (inStroke) throw new Error('snapshot while the pen is down');
    if (batch) flushTick();
    const j = {
      saved: [],
      has: new Set(),
      counters: { now, wetCells, hotCells, everWet, work, lastT, pen, carry, travel, strokeNo, well, wellCap, lost: { ...lost }, splat: { ...splat }, put: { ...put } },
    };
    journals.push(j);
    return j;
  }

  function restore(snap) {
    if (journals[journals.length - 1] !== snap) throw new Error('restore the newest snapshot first');
    journals.pop();
    for (let k = snap.saved.length - 1; k >= 0; k--) {
      const [t, W, P, F, ev, wet, dentA, depthA, peak, soakA, wearA, flags, rim, cockle, G, FG, drainA, filmA, enter, wax, loose, faces] = snap.saved[k];
      t.looseA = loose?.[0] ? loose[0].slice() : null;
      t.looseM = loose?.[1] ? loose[1].slice() : null;
      t.goneA = loose?.[2] ? loose[2].slice() : null;
      if (loose?.[3]) {
        grainsOn(t);
        t.S.set(loose[3]);
        t.bedA.set(loose[4]);
      } else if (t.S) t.S = t.dS = t.bedA = t.outQ = null;
      if (faces) {
        t.cap.set(faces[0]);
        t.hold.set(faces[1]);
        t.siz.set(faces[2]);
        t.z.set(faces[3]);
        t.link.set(faces[4]);
        t.mat.set(faces[5]);
        t.under.has.set(faces[6]);
      }
      t.W.set(W);
      t.P.set(P);
      t.F.set(F);
      t.everWet.set(ev);
      t.wet = wet;
      t.dentA.set(dentA);
      t.depthA.set(depthA);
      t.peak.set(peak);
      t.soakA.set(soakA);
      t.wearA.set(wearA);
      t.flags.set(flags);
      t.rim.set(rim);
      t.cockle.set(cockle);
      t.drainA.set(drainA);
      t.filmA.set(filmA);
      t.enter.set(enter);
      if (G) {
        gallOn(t);
        t.G.set(G);
        t.FG.set(FG);
      } else if (t.G) {
        t.G = null;
        t.FG = null;
        t.dG = null;
      }
      if (wax) {
        waxOn(t);
        t.wax.set(wax[0]);
        t.waxQ.set(wax[1]);
        t.waxDent.set(wax[2]);
        t.waxF.set(wax[3]);
        t.hot = wax[4];
      } else if (t.wax) {
        t.wax = null;
        t.hot = 0;
      }
      if (t.hot > 0) hotTiles.add(t);
      else hotTiles.delete(t);
      t.journal = null;
      if (wet > 0) wetTiles.add(t);
      else wetTiles.delete(t);
      if (dirty) dirty.add(t);
    }
    batch = null;
    ({ now, wetCells, hotCells, everWet, work, lastT, carry, travel, strokeNo, well, wellCap } = snap.counters);
    Object.assign(lost, snap.counters.lost);
    Object.assign(splat, snap.counters.splat);
    Object.assign(put, snap.counters.put);
    if (snap.counters.pen) setPen(snap.counters.pen);
    last = null;
    inStroke = false;
  }

  function forget(snap) {
    if (journals.indexOf(snap) === 0) journals.shift();
  }

  function redraw(tx, ty) {
    if (dirty) dirty.add(getTile(tx, ty));
  }

  // The tiles that changed since the last call: live views of their state.
  function changed() {
    if (!dirty) throw new Error('createSim({ track: true }) to use changed()');
    const out = [...dirty];
    dirty.clear();
    return out;
  }

  return {
    setPen,
    dip,
    mark,
    strokeStart,
    act,
    finish,
    runUntil,
    endStroke,
    advanceTo,
    snapshot,
    restore,
    forget,
    changed,
    redraw,
    waxAt,
    get hotCells() {
      return hotCells;
    },
    get now() {
      return now;
    },
    get lastT() {
      return lastT;
    },
    get wetCells() {
      return wetCells;
    },
    get activeTiles() {
      return wetTiles.size;
    },
    get lost() {
      return { ...lost };
    },
    get splat() {
      return { ...splat };
    },
    // what is left in a dipped nib's reservoir, of its fill (a pen not dipped never runs dry): the scene's
    get reservoir() {
      return wellCap ? well / wellCap : 1;
    },
    tiles: () => tiles.values(),
    getTile,
  };
}

// Grow a whole decoded record on a paper. Returns the tiles with facts (and, for
// law 3, each press's seal: whether it took). A record's marks (law 3) land at
// their moments, between and within its strokes; a pen act that sets `well` is a dip.
export function grow(rec, { paperKey, family, scale = SCALE_ONE, instrument = null, gallAgeH = 0, law = 2, paper = null }) {
  precheck(rec, scale);
  const sim = createSim({ paperKey, family, scale, orgX: rec.orgX, orgY: rec.orgY, instrument, gallAgeH, law, paper });
  const timeline = penTimeline(rec);
  const marks = rec.marks ?? [];
  let mi = 0;
  const due = (t) => {
    while (mi < marks.length && marks[mi].t <= t) sim.mark(marks[mi++]);
  };
  rec.strokes.forEach((s, si) => {
    const pens = timeline[si];
    const dipped = new Map(s.pens.filter((a) => a.well !== undefined).map((a) => [a.at, a.well]));
    const pen = (k) => {
      sim.setPen(pens[k][1]);
      if (dipped.has(pens[k][0])) sim.dip(dipped.get(pens[k][0]));
    };
    let k = 0;
    due(s.t[0]);
    pen(0);
    const p = (i) => (s.hasP ? s.p[i] : P_NONE);
    sim.strokeStart(s.x[0], s.y[0], s.t[0], p(0));
    for (let i = 1; i < s.x.length; i++) {
      while (k + 1 < pens.length && pens[k + 1][0] <= i - 1) pen(++k);
      due(s.t[i] - 1);
      sim.act(s.x[i], s.y[i], s.t[i], p(i));
    }
  });
  due(Infinity);
  return sim.finish();
}
