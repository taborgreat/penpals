// The constants of law v2 (depth-water-gall): everything in law v1, plus
// paper depth and dents, ink depth, the water brush, the oak gall colour,
// fading by exposure, paper that remembers water, and splatter. v2 is a new frozen law:
// its goldens are law/fixtures/goldens-v2.json. v1 records keep growing under
// v1 exactly as before; new writing is made under v2.
//
// Units as in v1 (drops of water, 1/1024 absorbance of pigment, half-tenths
// of position, ms). New per-cell facts are small integers kept with finer
// accumulators inside the sim (dentA, depthA, soakA, wearA) and published as
// levels (Uint8).
//
// A note on "sizing": v1's per-cell `siz` is thirst (0..15, higher drinks
// faster: SETTLE, the wet front's pace (ENTER, FRONT) and the bead's hold all follow it). The spec's
// "sizing washes out with soak" is thirst going UP with soak; "fibers
// compress in a dent" is thirst going DOWN in a dent.

export * from '../v1/constants.js';
export const LAW = 2;

// --- the pens that are not pigment: chosen by the pen's colour (already in PNKA) ---
export const OAK_GALL = Object.freeze([0x35, 0x34, 0x38]); // the colour that ages (Tabor's to set)
export const WATER = Object.freeze([255, 255, 255]); // carries water and no pigment

// --- 1. paper depth and dents ---
export const DENT_SHIFT = 10; // dentA units per dent level
export const DENT_MAX = 32; // levels; a dent never recovers
export const DENT_CAP = 8; // capacity added per dent level (drops): a groove holds more
export const DENT_Z = 8; // height removed per dent level: surface ink runs into it
export const DENT_THIRST = 40; // thirst lost per dent level, /256 of a step: compressed fibers drink slower

// --- 2. ink in depth ---
export const THICK = 24; // paper thickness in depth levels (Tabor's to set)
export const DEPTH_SHIFT = 10; // depthA units per depth level
export const PEAK_SHIFT = 3; // peak level = drops standing over capacity >> 3 (kept for walk back and the moments, not for height)

// --- the height field (the scene, §0): above the surface the water standing on
// top while it is wet, and once dry only the film the ink left on top (the ring
// higher), never the peak; below it, the wet front. On top + in the pores + what
// went into the air = the water that came to the cell. ---
export const FILM_SHIFT = 9; // filmA (absorbance ×1024, summed over the colours) per film level
export const FILM_Q = 1; // drops of height one film level stands (a view constant)
export const FILM_POOL_SHIFT = 2; // film level >> this = how thick the ink lies, for the air it lets in (AIR)

// --- the wet front (cleanup-and-speed.md §2): one water amount, a front that
// grows only downward, and the paper's surface tension. The water within the
// layers the front has reached is in the pores (held: the cell's capacity ×
// front ÷ THICK, plus a dent's); the rest stands on top. Ink lands on top;
// the paper's top resists wetting for ENTER ticks of standing water (none on
// thirsty paper: there it sinks at once; on sized paper it beads and spreads
// first); then the front advances each dry step by FRONT, slowing with depth,
// until it holds the water or reaches the bottom. depthA is the front. ---
export const ENTER = Object.freeze([80, 75, 69, 64, 59, 53, 48, 43, 37, 32, 27, 21, 16, 11, 5, 0]); // ticks of standing water before the front starts, by thirst
export const FRONT = Object.freeze([256, 316, 391, 483, 597, 738, 913, 1128, 1394, 1723, 2130, 2633, 3254, 4022, 4971, 6144]); // depthA a dry step at the top, by thirst (256 · 24^(thirst/15))

// --- the nib's supply (§8): wiped off as it moves (per distance) and fed while
// it sits (per time, less as the paper under it fills). The tip holds a little:
// a still nib feeds for a while and then has no more to give. ---
export const SUPPLY_V = 1536; // fine units a ms (300 ink units a second: ordinary handwriting) at which the wipe gives law 1's rate
export const WIPE_MAX16 = 1280; // a move counts at most this (ms × 16): far past that speed a stroke thins
export const FEED_Q = 96; // the fed share (/256) of law 1's rate while the cell under the nib is empty; none when full
export const DWELL_MS = 1200; // a still nib feeds this long, then its tip is empty: a dwell beads to a capped size

// --- flex tines (§7): the footprint is a short wide rectangle, the tines spread
// across the nib's axis by pressure. Wide apart with too little ink, they railroad. ---
export const RAIL_WIDE = 30; // half-tenths of half-spread from which the tines can railroad
export const RAIL_MIN = 48; // drops per footprint cell below which the middle starves
export const RAIL_MID = 24; // /256 of its share the middle then gets
export const RAIL_TINE = 10; // half-tenths: the strip each tine wets

// --- 3. the water brush: water + fixed ink → wet ink, every dry step ---
export const REDISSOLVE = 3072; // /65536 of fixed ink returned to wet per dry step, at W_SAT

// --- 4. oak gall (its own channel; darkening happens at view time, see look.js) ---
export const GALL_FRESH = 64; // /256 of its strength shown at darkness 0 (pale grey-blue while writing)
export const OX_BASE = 98; // oxidation index per hour at full air access, ×256 (about 3.5 days to most of the way)
export const AGE_CAP_H = 720; // hours: past 30 days the colour no longer changes
export const POOL_LEVELS = 16; // AIR rows: pool height (peak >> 2), capped

// --- 5. fading by exposure (views, at most one per viewer per day) ---
export const EXPOSURE_STEP = 8; // views per exposure bucket (looks are cached per bucket)
export const FADE_SHIFT = 10; // fade index = views × SURFACE[depth] × DRUNK[ch] / 256 >> FADE_SHIFT
// How much of a reference daylight each channel's absorbance curve drinks (and
// oak gall's), per unit absorbance, ×256 (light-waves §8; the curves are
// frontend/src/scene/light/curves.js, made by frontend/scripts/curves.mjs):
// light fades what it is drunk by. [r, g, b, gall]
export const DRUNK = Object.freeze([278, 273, 217, 721]);

// --- 6. paper that remembers water ---
export const SOAK_Q = 512; // soakA per dry step at W_SAT (soak level = soakA >> 8): +2 levels a step when full
export const SOAK_FULL = 64; // soak at which the sizing is all washed out: thirst and wicking stop growing (strength does not)
export const SOAK_THIRST = 24; // thirst gained per soak level, /256 of a step: washed-out sizing drinks faster
export const SOAK_LINK = 4; // fiber conductance gained per soak level, /256 of the fiber's own: soaked fibers loosen
export const SOAK_PORE = 2; // pore conductance gained per soak level (/4096 per tick), between wet cells
export const SOAK_WICK = 12; // wicking into a dry cell per level of ITS soak (/4096 per tick): washed-out sizing draws ink in
export const WEAR_SHIFT = 4; // wearA units per wear level
export const WEAR_STILL = 4; // a nib that is not moving wears 1/16 as much (>> 4): scrubbing tears, a pause does not
export const STRENGTH_BASE = 200; // a dry cell's strength, in wear levels
export const WET_K = 12; // strength lost per drop of water, /256 (a saturated cell: about 60 of 200)
export const SOAK_K = 96; // strength lost per soak level, /256
export const RIM_Z = 30; // a torn neighbour lowers a cell this much: ink runs to the torn rim and pools
export const COCKLE_MIN = 32; // soak below this dries flat
export const COCKLE_MAX = 240; // the highest ridge (height units, as z; the paper's own roughness spans 0..120)
export const TORN = 1; // flags bit

// --- 7. splatter: ink the pen throws. The odds come from the moment (speed,
// a sharp turn, a fast landing, a dwell at high flow, the paper's tooth at the
// nib) times the pen's spatter; the paper's hash decides (splat.js) ---
export const SPLAT_K = 32; // P = min(SPLAT_CAP, score × spatter × SPLAT_K / 256), out of 65536, per act
export const SPLAT_CAP = 8192; // at most one act in eight throws ink, however wild the writing
export const SPLAT_MIN_SEG = 512; // a move shorter than this (fine units: 2 half-tenths) has no direction
export const MAX_DROPS = 9; // drops from one act, at most
export const DROP_R = Object.freeze([3, 5, 8, 12, 18]); // drop radius by size class, half-tenths: specks mostly, rarely a big drop
export const DROP_W = Object.freeze([60, 150, 360, 800, 1800]); // water each size class carries (drops of CAP_REF)
export const DROP_R_MAX = 18;
export const DROP_REACH = 400; // half-tenths: the farthest a drop is flung (40 cells)

// --- law 3 (rooms.md §3b, §3c, §5): wax on sheets and the nib's reservoir. Only
// records of law 3 carry them (PNKA format 3), so nothing above changes for law 2.
export const LAW3 = 3;
// The nib reservoir: a dip pen (a pen act setting `well`, 1..WELL_MAX) is filled
// to WELL_UNIT × well drops when it is dipped; writing draws it down and its
// line fades with it (the supply × what is left ÷ what it holds); dipped again,
// it is full. A pen with no well (a fountain pen, every law-2 pen) never runs dry.
export const WELL_MAX = 15;
export const WELL_UNIT = 1 << 20; // drops of CAP_REF a well level holds (Tabor's to set: a level writes about a word at a heavy flow)
// Wax (marks: drips, presses, breaks, each at its moment on the record's clock).
// Wax sits on top of the paper: it does not soak in, it stands (its height in the
// surface ink runs on, so ink beads off it and runs to the paper around), and a
// cell under wax lets no water into its fibers (wax resist).
export const MAX_MARKS = 64;
export const WAX_MAX = 4095; // the most wax a cell holds (its height, in the surface's units)
export const WAX_DRIP_MAX = 1 << 20; // a drip's wax, at most
export const WAX_R_MAX = 64; // cells: the widest a drip spreads
export const WAX_SPREAD = 1 << 18; // a drip spreads to √(amt × (128 + heat) ÷ WAX_SPREAD) cells (a hot drip of 400000: about 3.5 mm across)
export const WAX_SEAL = 24; // wax under which a cell is sealed: no water enters its fibers
export const WAX_BEAD = 3; // sealed wax holds 1/2^WAX_BEAD of what paper does: a skin of ink, the rest beads off the nib
// Heat (matter-fixes.md §1, the one rule for heat). A cell holds heat where there
// is wax: its wax × how far it is above the air, in levels of HEAT_Q steps (a
// drip's heat, 0..255, is its level as it lands: 0.4 °C a level above a room at
// 20 °C, so 255 is 122 °C). Each dry step heat flows from a wax cell to each cooler
// wax cell beside it (the difference × the thinner one's wax × WAX_CONDUCT ÷ 4096,
// a diagonal by DIAG_Q), and leaves to the paper under it and the air above (its
// level × WAX_COOL ÷ 256, rounded up: it always cools). A cell no warmer than the
// air holds none, and sleeps. Thick wax holds its heat longer; a thin edge sets at once.
export const HEAT_Q = 16;
export const WAX_CONDUCT = 256;
export const WAX_COOL = 450; // Tabor's to set: how fast heat leaves (with the thresholds, how long a drip stays soft)
export const WAX_MELT = 100; // levels: hotter, wax is liquid (60 °C: law/matter.js wax melts)
export const WAX_SOFTEN = 63; // levels: hotter, wax takes a press (45 °C; Tabor's to set)
// A press: the stamper's face (a relief, FACE_MAX × FACE_MAX at most, each face
// pixel `cell` paper cells) pressed into the wax at an angle, tilted (deeper on one
// side), as deep as `depth`. Only soft wax takes it, and no deeper than the wax is.
export const FACE_MAX = 32;
export const FACE_CELL_MAX = 16;
export const SEAL_RAISED = 128; // a face pixel this high or more is the design
export const SEAL_DENT = 24; // a design pixel took if the wax under it dented this deep ...
export const SEAL_TOOK = 179; // ... and the press took if this share (/256: 70%) of the design did
export const WAX_CRACK = 1; // waxF bit: cracked (a broken seal)
