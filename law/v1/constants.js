// The constants of law v1. Every one is part of the law. v1 is FROZEN: its
// goldens are recorded (law/fixtures/goldens.json, checked by npm test), so a
// change here, in tables.js or in the rules is a new law version (law/v2/),
// never an edit. The hand measure (hand.js) is the one part not yet frozen.
// Units: positions in tenths of an ink unit (records) and half-tenths ("ht",
// inside the sim; a cell is 10 ht = 0.5 unit); time in ms; water in drops
// (CAP_REF drops = one full cell); pigment in 1/1024 of an absorbance unit.

export const LAW = 1;

// --- space and time ---
export const CELLS_PER_UNIT = 2;
export const HT_PER_CELL = 10; // half-tenths per cell
export const TILE = 16; // cells per tile side (an implementation detail; results do not depend on it)
export const TICK_MS = 10;
export const DRY_EVERY = 5; // mix, settle and dry run every 5th tick (50 ms of recorded time)

// --- the pen ---
export const P_NONE = 153; // pressure used when the device has none
export const NIB_ROUND = 0;
export const NIB_FLEX = 1;
export const NIB_BROAD = 2;
export const STEP_HT = 5; // a stamp every half cell along the path
export const BROAD_T_HT = 20; // a broad nib's edge is 1 unit thick
export const CARRY_MS = 50; // ink a saturated nib can hold back, as ms of supply

// --- water and pigment ---
export const CAP_REF = 256;
export const W_SAT = 1280; // the most a cell can hold, bead and all
export const W_WET = 16; // below this a cell counts as dry for pinning and edges
export const W_EPS = 4; // below this the last water goes and the cell snaps to fixed
export const C_SAT = 4 * 5674; // pigment one drop can carry before it precipitates (×256 per drop)

// --- paper (family = { grain 0..15, weight 0..15, tooth 0 }) ---
export const COORD_OFFSET = 1 << 20; // cell coords are shifted by this before hashing (keeps them non-negative)
export const CAP_BASE = 176; // capacity at weight 0; each weight step adds CAP_WEIGHT
export const CAP_WEIGHT = 10;
export const CAP_STEP = 9; // per step of the 4-bit capacity noise around its middle
export const CAP_MIN = 96;
export const CAP_MAX = 640;
export const LF_CAP = 40; // low-frequency capacity swing (drops)
export const LF_SIZ = 3; // low-frequency sizing swing (steps)
export const SIZ_BASE = 8;
export const Z_SCALE = 6; // roughness height per step
export const FIBER_BLOCK = 8; // cells per fiber block side
export const FIBER_COUNT = [0, 0, 1, 1]; // fibers in a block, by two hash bits
export const FIBER_LEN = [12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 40]; // cells
export const FIBER_REACH = 20 + FIBER_BLOCK; // how far a block's fibers reach (cells)
export const LF1 = 32; // fine low-frequency lattice (cells)
export const LF2 = 128; // coarse lattice: direction drift and height

// Hold before a bead breaks, as a fraction (/256) of capacity, by thirst (sizing) 0..15.
export const HOLD_Q = [160, 154, 148, 142, 136, 130, 124, 118, 112, 106, 100, 94, 88, 82, 76, 70];

// --- flow (conductances are /4096 per tick, per direction; their sum per direction ≤ G_MAX) ---
export const G_LEVEL = 384; // surface flow into a wet neighbour (pools level out)
export const G_RUN = 320; // surface flow into a dry neighbour once a bead breaks
export const G_PORE = 40; // slow wicking inside the paper
export const G_WICK = 0; // wicking into a dry cell (blotting papers)
export const G_FIB = 256; // fiber-to-fiber conduction along the fiber
export const G_MAX = 512;
export const DIAG_Q = 128; // diagonal neighbours conduct at 128/256 of orthogonal ones
export const G_MIX = 160; // pigment diffusion between wet neighbours (/4096 per dry step)

// --- settle and dry (per dry step, /65536) ---
export const SETTLE = [1200, 1400, 1600, 1800, 2000, 2300, 2600, 2900, 3200, 3600, 4000, 4500, 5000, 5600, 6200, 6800];
export const ABSORB = [1300, 1420, 1540, 1660, 1780, 1900, 2050, 2200, 2350, 2500, 2650, 2800, 2950, 3100, 3250, 3400]; // share of in-paper water absorbed per dry step
export const EVAP_BASE = 3840; // ×CAP_REF/65536 drops per dry step from every wet cell (≈15)
export const EVAP_EDGE = 1280; // more for each dry neighbour (of 8)
export const E_MIN = 1; // every wet cell loses at least this much each dry step

// --- canonical caps (exceeding one is the same INVALID everywhere) ---
export const MAX_STROKES = 2000;
export const MAX_ACTS = 120000;
export const MAX_DURATION = 30 * 60 * 1000;
export const MAX_GAP = 60000;
export const MAX_DT = 60000;
export const MAX_ORG = 20000; // whole units
export const MAX_COORD = 200000; // tenths, record-local
export const MAX_SIZE = 400; // nib size, tenths
export const MIN_SIZE = 5;
export const MAX_FLEX = 400;
export const MAX_PATH_WORK = 3e8; // stamps × footprint cells, checked before simulating
export const MAX_WET_CELLS = 4e6; // cells ever wet
export const MAX_WORK = 1.5e9; // Σ wet cells over all ticks
export const DRAIN_MAX_TICKS = 3000; // after the last act, at most 30 s of recorded drying, then snap
export const SCALE_ONE = 64; // item scale unit: 64 = 1×
export const SCALE_MIN = 4;
export const SCALE_MAX = 640;
