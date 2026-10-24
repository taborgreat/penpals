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
// faster: SETTLE, ABSORB and the bead's hold all follow it). The spec's
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

// --- the height field (the scene, §0): above the surface a standing bead while
// it is wet, and once dry only the film the ink left on top (the ring higher),
// never the peak; below it, how far the liquid sank. Bead + liquid in the paper
// + what the paper drank = the water that came to the cell. ---
export const FILM_SHIFT = 9; // filmA (absorbance ×1024, summed over the colours) per film level
export const FILM_Q = 1; // drops of height one film level stands (a view constant)
export const FILM_POOL_SHIFT = 2; // film level >> this = how thick the ink lies, for the air it lets in (AIR)
export const POROSITY = 48; // drops of liquid one depth level of fully sized paper takes in
export const POROSITY_THIRST = 24; // thirst t takes POROSITY·(24 − t)/24 a level: thirsty paper lets it sink deeper

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
export const FADE_SHIFT = 10; // fade index = views × SURFACE[depth] >> FADE_SHIFT

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
