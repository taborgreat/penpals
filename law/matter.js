// The matter of the world (matter.md; one-matter.md Phase 1): one table, a row
// per substance. These are what each matter IS; every amount, rate and angle of
// behaviour comes from them, the rules and the acts (matter.md, the one rule
// about numbers). Integers, so every machine reads the same:
//   density   kg/m³ (how hard it falls and how hard it pushes)
//   hardness  1..10 (which of two touching matters gives way when rubbed: the harder takes the softer)
//   strength  N/mm² (how far it bends or pulls before it breaks)
//   stiffness N/mm² (how hard it resists stretching: stretched past strength/stiffness, it cracks)
//   rots      days for half of it to break down into dirt where it lies
//   poisson   ‰: how much it narrows as it is stretched (with its stiffness, how a shell of it bends)
//   loss      ‰ of its bending's energy it turns to heat a cycle (how long it rings: Q = 1000 / loss)
//   friction  ×1000 (how much it resists sliding against another matter)
//   heat      { holds (J/(kg·K)), conducts (mW/(m·K)), melts, boils, burns (°C) | null,
//               fuses (J/kg the melting takes and the setting gives back), releases (J/kg its
//               burning gives), softens (°C: a solid that gives under a press, as warm wax does),
//               hardens (°C: what heat makes lastingly hard, as fired clay), burnRate (g/(m²·s): how
//               fast it burns over the face it shows the air), leaves (‰ of what burns left as its
//               residue: char, ash), air (kg of air a kg of it burns with), shines (‰ of its
//               flame's heat that leaves as light: a sooty flame's glow) } (the heat rule)
//   becomes   what it turns into: { burnt, melted, boiled, frozen, fired } (names in this table)
//   ink       how it takes a liquid, as the ink law reads it (law/v2/sim.js, law/grow.js):
//               drinks   its pores open to its face (0: it drinks nothing: a liquid stands on it)
//               wets     ‰ of a nib's ink its face takes (a waxy face sheds most: it beads off)
//               cap, capStep, capMin, capMax   how much a cell holds (drops) and its spread
//               thirst   how fast it drinks, 0..15        hold   drops standing before a bead runs (when it drinks nothing)
//               rough    its face's roughness a step (height units)
//               fibers   'paper' | 'grain' (along one way, as wood) | null;  fiber: their strength (1..3)
//   draws     µg/s (a wick: the liquid it lifts to its flame, which the flame burns)
//   pores     ‰ of its volume open (a wick: what it holds of the liquid it lifts)
//   tension   mN/m (a liquid's surface: how high it stands at a dry edge before it runs over)
//   light     its curve in light-waves (its colour: what it refuses to drink)
//   ior       ×1000, its refractive index (its shine: matter-fixes §5); null for a metal
//   sound     ‰ of the sound reaching its face it drinks, by octave (31 Hz .. 16 kHz: world.md's ten
//             bands; Sabine's coefficients, the low and high ends as the nearest measured octave)
//   molar     g/mol (a gas's: with its heat, how fast sound runs through it)
//   viscous   nPa·s (a gas's: how it drags on what moves through it, as smoke's grains settling)
//   soot      ppm of what burns that leaves as soot (the grains in its smoke that darken the air)
//   grains    { size (nm), density (kg/m³), ior, absorbs (×1000: the real and imaginary parts of their
//             refractive index) }: the solid grains a smoke carries (how they settle, stick and
//             drink light)
// Paper's ink row is today's paper exactly (law/v1/constants.js, v2/constants.js): the ink law
// reads its own constants for paper, and the table says what they are. Approximate real values
// otherwise (matter.md: the table is the only place these numbers live).

import * as V1 from './v1/constants.js';
import * as V2 from './v2/constants.js';

const PAPER_INK = Object.freeze({
  drinks: 1,
  wets: 1000,
  cap: V1.CAP_BASE,
  capWeight: V1.CAP_WEIGHT,
  capStep: V1.CAP_STEP,
  capMin: V1.CAP_MIN,
  capMax: V1.CAP_MAX,
  thirst: V1.SIZ_BASE,
  rough: V1.Z_SCALE,
  fibers: 'paper',
  fiber: 3,
  thick: V2.THICK,
  wear: V2.STRENGTH_BASE,
  thickness: 100, // µm: a sheet of writing paper
  holdQ: V1.HOLD_Q,
});

export const MATTER = Object.freeze({
  air: { density: 1, hardness: 0, strength: 0, friction: 0, heat: { holds: 1005, conducts: 26, melts: null, boils: null, burns: null }, light: 'air', ior: 1000, molar: 28.97, viscous: 18100 }, // feeds fire; carries heat, smoke and sound
  water: {
    density: 1000,
    hardness: 0,
    strength: 0,
    friction: 0,
    heat: { holds: 4186, conducts: 600, melts: 0, boils: 100, burns: null, fuses: 334000 },
    becomes: { boiled: 'steam', frozen: 'ice' },
    tension: 72,
    light: 'water',
    sound: [10, 10, 10, 10, 10, 15, 20, 20, 20, 20],
    ior: 1333,
  }, // ink's carrier
  ink: {
    density: 1010,
    hardness: 0,
    strength: 0,
    friction: 0,
    heat: { holds: 4100, conducts: 600, melts: 0, boils: 100, burns: null },
    becomes: { boiled: 'char' },
    tension: 60,
    light: 'water',
    ior: 1340,
  }, // water, oak gall and iron: its water boils off, what is left chars
  paper: {
    density: 800,
    hardness: 1,
    strength: 30,
    friction: 500,
    heat: { holds: 1340, conducts: 50, melts: null, boils: null, burns: 233, releases: 16000000, burnRate: 15, leaves: 10, air: 5, shines: 300 },
    becomes: { burnt: 'ash' },
    ink: PAPER_INK,
    light: 'paper',
    sound: [20, 20, 20, 20, 30, 40, 50, 50, 50, 50],
    ior: 1500,
  },
  wood: {
    density: 750,
    hardness: 3,
    strength: 90,
    stiffness: 11000,
    friction: 450,
    heat: { holds: 2000, conducts: 160, melts: null, boils: null, burns: 300, releases: 18000000, burnRate: 10, leaves: 250, air: 6, shines: 300 },
    becomes: { burnt: 'char' },
    ink: { drinks: 1, wets: 1000, cap: 120, capStep: 6, capMin: 60, capMax: 200, thirst: 3, rough: 8, fibers: 'grain', fiber: 3 },
    light: 'table',
    sound: [150, 150, 150, 110, 100, 70, 60, 70, 70, 70],
    ior: 1540,
  }, // oak: table, floor, shelf, sticks, trees
  wax: {
    density: 900,
    hardness: 1,
    strength: 2,
    friction: 300,
    heat: { holds: 2140, conducts: 250, melts: 60, softens: 45, boils: 370, burns: 250, fuses: 200000, releases: 44000000, burnRate: 30, leaves: 0, air: 15, shines: 300 },
    becomes: { burnt: 'smoke' },
    soot: 50,
    tension: 30,
    ink: { drinks: 0, wets: 125, hold: 600, thirst: 0, rough: 1, fibers: null },
    light: 'wax',
    sound: [20, 20, 20, 20, 30, 30, 40, 40, 40, 40],
    ior: 1440,
  }, // paraffin: the candle's body and fuel
  wick: {
    density: 1500,
    hardness: 1,
    strength: 300,
    friction: 500,
    heat: { holds: 1300, conducts: 60, melts: null, boils: null, burns: 250, releases: 16000000, burnRate: 15, leaves: 20, air: 5, shines: 300 },
    becomes: { burnt: 'ash' },
    draws: 2000,
    pores: 500,
    light: 'paper',
    ior: 1500,
  }, // braided cotton
  plaster: {
    density: 1100,
    hardness: 2,
    strength: 2,
    friction: 600,
    heat: { holds: 1000, conducts: 400, melts: null, boils: null, burns: null },
    ink: { drinks: 1, wets: 1000, cap: 300, capStep: 12, capMin: 200, capMax: 420, thirst: 15, rough: 12, fibers: null },
    light: 'plaster',
    sound: [13, 13, 13, 15, 20, 30, 40, 50, 50, 50],
    ior: 1520,
  }, // walls: cracks and crumbles when very hot
  metal: {
    density: 8500,
    hardness: 4,
    strength: 350,
    friction: 350,
    heat: { holds: 380, conducts: 120000, melts: 900, boils: null, burns: null, fuses: 170000 },
    becomes: { melted: 'metal' },
    ink: { drinks: 0, wets: 500, hold: 200, thirst: 0, rough: 1, fibers: null },
    light: 'brass',
    sound: [10, 10, 10, 10, 10, 15, 20, 20, 20, 20],
    ior: null,
  }, // one metal for now: the candle's holder, the nib; found in rocks
  stone: {
    density: 2700,
    hardness: 6,
    strength: 15,
    friction: 600,
    heat: { holds: 790, conducts: 2800, melts: 1200, boils: null, burns: null, fuses: 400000 },
    ink: { drinks: 1, wets: 1000, cap: 20, capStep: 2, capMin: 8, capMax: 40, thirst: 1, rough: 16, fibers: null },
    light: 'plaster',
    sound: [10, 10, 10, 10, 15, 20, 20, 20, 20, 20],
    ior: 1540,
  }, // rocks: hard, brittle in pulling; holds metal
  chalk: { density: 2100, hardness: 2, strength: 3, friction: 550, heat: { holds: 900, conducts: 900, melts: null, boils: null, burns: null }, light: 'plaster', ior: 1600 }, // a soft stone
  glass: {
    density: 2500,
    hardness: 6,
    strength: 40,
    stiffness: 70000,
    poisson: 220,
    loss: 1,
    friction: 900,
    heat: { holds: 840, conducts: 1000, melts: 1400, boils: null, burns: null },
    ink: { drinks: 0, wets: 800, hold: 300, thirst: 0, rough: 0, fibers: null },
    light: 'glass',
    sound: [350, 350, 350, 250, 180, 120, 70, 40, 40, 40],
    ior: 1500,
  },
  dirt: {
    density: 1500,
    hardness: 1,
    strength: 0,
    friction: 700,
    heat: { holds: 800, conducts: 500, melts: null, boils: null, burns: null },
    ink: { drinks: 1, wets: 1000, cap: 400, capStep: 20, capMin: 250, capMax: 560, thirst: 12, rough: 20, fibers: null },
    light: 'floor',
    sound: [150, 150, 150, 250, 400, 550, 600, 600, 600, 600],
    ior: 1500,
  },
  clay: {
    density: 1800,
    hardness: 2,
    strength: 1,
    friction: 650,
    heat: { holds: 900, conducts: 1000, melts: null, boils: null, burns: null, hardens: 600 },
    becomes: { fired: 'pottery' },
    ink: { drinks: 1, wets: 1000, cap: 300, capStep: 10, capMin: 200, capMax: 400, thirst: 4, rough: 6, fibers: null },
    light: 'floor',
    ior: 1500,
  }, // where water meets dirt; fired, it is hard
  pottery: {
    density: 1900,
    hardness: 5,
    strength: 20,
    friction: 600,
    heat: { holds: 850, conducts: 1200, melts: 1200, boils: null, burns: null },
    ink: { drinks: 1, wets: 1000, cap: 60, capStep: 4, capMin: 30, capMax: 90, thirst: 6, rough: 8, fibers: null },
    light: 'floor',
    ior: 1500,
  }, // clay fired
  grass: {
    density: 400,
    hardness: 1,
    strength: 10,
    friction: 500,
    heat: { holds: 3500, conducts: 300, melts: null, boils: null, burns: 260, releases: 15000000, burnRate: 30, leaves: 50, air: 5, shines: 250 },
    becomes: { burnt: 'ash' },
    ink: { drinks: 0, wets: 300, hold: 400, thirst: 0, rough: 4, fibers: null },
    light: 'grass',
    sound: [110, 110, 110, 260, 600, 690, 920, 990, 990, 990],
    ior: 1450,
  }, // waxy blades: ink beads off them
  bark: {
    density: 550,
    hardness: 2,
    strength: 20,
    stiffness: 300,
    friction: 650,
    heat: { holds: 1500, conducts: 120, melts: null, boils: null, burns: 280, releases: 17000000, burnRate: 12, leaves: 250, air: 6, shines: 300 },
    becomes: { burnt: 'char' },
    light: 'table',
    sound: [100, 100, 100, 110, 100, 80, 80, 90, 90, 90],
    ior: 1540,
  },
  leaf: {
    density: 600,
    hardness: 1,
    strength: 5,
    friction: 400,
    rots: 400,
    heat: { holds: 3500, conducts: 300, melts: null, boils: null, burns: 250, releases: 15000000, burnRate: 20, leaves: 50, air: 5, shines: 250 },
    becomes: { burnt: 'ash', rotted: 'dirt' },
    light: 'leaf',
    sound: [30, 30, 30, 60, 110, 170, 270, 310, 310, 310],
    ior: 1450,
  },
  fiber: {
    density: 1300,
    hardness: 1,
    strength: 400,
    friction: 500,
    heat: { holds: 1300, conducts: 60, melts: null, boils: null, burns: 250, releases: 16000000, burnRate: 15, leaves: 20, air: 5, shines: 300 },
    becomes: { burnt: 'ash' },
    light: 'paper',
    sound: [70, 70, 70, 310, 490, 750, 700, 600, 600, 600],
    ior: 1500,
  }, // a string's (bark fiber, linen), cloth
  skin: {
    density: 1100,
    hardness: 1,
    strength: 20,
    friction: 600,
    heat: { holds: 3500, conducts: 370, melts: null, boils: null, burns: 300, releases: 20000000, burnRate: 5, leaves: 100, air: 8, shines: 300 },
    becomes: { burnt: 'char' },
    light: 'skin',
    sound: [250, 250, 250, 350, 420, 460, 500, 500, 500, 500],
    ior: 1440,
  }, // a being's (outside.md Part 4)
  char: {
    density: 400,
    hardness: 1,
    strength: 1,
    friction: 500,
    heat: { holds: 1000, conducts: 90, melts: null, boils: null, burns: 350, releases: 30000000, burnRate: 5, leaves: 50, air: 11 },
    becomes: { burnt: 'ash' },
    ink: { drinks: 1, wets: 1000, cap: 500, capStep: 20, capMin: 360, capMax: 640, thirst: 15, rough: 14, fibers: null },
    light: 'char',
    ior: 1500,
  }, // what fire leaves; it burns again
  ash: {
    density: 600,
    hardness: 1,
    strength: 0,
    friction: 600,
    heat: { holds: 800, conducts: 100, melts: null, boils: null, burns: null },
    ink: { drinks: 1, wets: 1000, cap: 500, capStep: 20, capMin: 360, capMax: 640, thirst: 15, rough: 10, fibers: null },
    light: 'ash',
    ior: 1500,
  }, // what is left when nothing more burns
  smoke: {
    density: 1,
    hardness: 0,
    strength: 0,
    friction: 0,
    heat: { holds: 1100, conducts: 30, melts: null, boils: null, burns: null },
    light: 'smoke',
    ior: 1000,
    grains: { size: 100, density: 1800, ior: 1950, absorbs: 790 },
  }, // thin hot matter: scatters light; rises, cools, thins
});

// Matter by number (a cell's), in a fixed order: a cell's matter is its index here. Never reordered.
export const ORDER = Object.freeze([
  'paper',
  'wood',
  'wax',
  'plaster',
  'metal',
  'stone',
  'glass',
  'dirt',
  'clay',
  'pottery',
  'grass',
  'char',
  'ash',
  'water',
  'ink',
  'air',
  'wick',
  'chalk',
  'bark',
  'leaf',
  'fiber',
  'skin',
  'smoke',
]);
export const idOf = (name) => {
  const k = ORDER.indexOf(name);
  if (k < 0) throw new Error(`no such matter: ${name}`);
  return k;
};
export const ROWS = Object.freeze(ORDER.map((n) => MATTER[n]));

// The grain's units (the page's: a cell is half a pixel of a letter page 1400 px across; a drop of
// height is what the scene draws as 0.004 px): what a cell's matter weighs, what a cut removes.
export const CELL_M = 0.2159 / 2800;
export const DROP_M = (0.004 * 0.2159) / 1400;
// The mass of a cell of a matter thick metres deep, in ng (integer).
export const cellNg = (row, thick) => Math.round(row.density * CELL_M * CELL_M * thick * 1e12);

// The room's air, as the heat rule takes it: its temperature (°C), and its film (W/(m²·K)):
// how fast still air carries heat off a surface warmer than it.
export const AIR = Object.freeze({ temp: 20, film: 10 });

// The kinds of tree (one-matter.md Phase 7): what each IS, as the tree's law (law/tree.js) reads it.
// Nothing here draws a shape; the shape is what these do under the sun.
//   of         its matters: { wood, bark, leaf } (rows above)
//   seed       g: what a seed holds to start on
//   sprouts    { water: ‰ of the dirt's pores holding water, warmth: °C }: what wakes the seed
//   leafOut, leafFall   hours of sun a day at which its buds open (the days lengthening) and its
//              leaves fall (the days shortening)
//   leaf       m² of leaves a growing tip carries;  leafMass  g/m²: what they cost to make
//   yield      g of wood made per MJ of light its leaves take
//   thirst     g of water breathed out per g of wood made
//   upkeep     { leaf, skin }  g a day each m² of its leaves, of its living skin (under the bark), burns
//   pipe       mm² of new wood laid a year all the way down from each m² of its leaves (the pipe
//              model: the ring is the leaves' water pipes, so it is as wide as the leaves above it)
//   roots      g of roots under each m² of ground they reach
//   grows      m a year a tip pushes out at most (its growth rate)
//   bears      years from sprouting before it bears seed (till then what it has over thickens its wood)
//   shoot      m: a new shoot's radius;  budEvery  m of shoot between buds;  angle  degrees a bud's
//              shoot leans from the stem it leaves
//   leader     ‰: how strongly its leading tip holds back the others, young;  relax  years until
//              that hold is halved
//   contrast   its late wood's density over its early wood's (the ring's two bands)
//   store      how many springs of leaves and years of upkeep it keeps back before it grows
export const TREES = Object.freeze({
  oak: {
    of: { wood: 'wood', bark: 'bark', leaf: 'leaf' },
    seed: 4,
    sprouts: { water: 150, warmth: 15 },
    leafOut: 13,
    leafFall: 11,
    leaf: 2,
    leafMass: 70,
    yield: 0.3,
    thirst: 300,
    upkeep: { leaf: 1.5, skin: 1 },
    pipe: 8,
    roots: 100,
    grows: 0.5,
    bears: 30,
    shoot: 0.005,
    budEvery: 1,
    angle: 45,
    leader: 900,
    relax: 40,
    contrast: 2,
    store: 1,
  }, // the gall oak: its galls are ink's
});

export const matterOf = (name) => {
  const m = MATTER[name];
  if (!m) throw new Error(`no such matter: ${name}`);
  return m;
};
// Which gives way when two rub: the softer (equal: both, a little).
export const givesWay = (a, b) => (matterOf(a).hardness < matterOf(b).hardness ? a : matterOf(b).hardness < matterOf(a).hardness ? b : null);
