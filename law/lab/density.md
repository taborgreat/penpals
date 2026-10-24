# Phone density check

The plan's check: viewed on a phone at one device pixel per cell, does the look read as ink or
as blur? (If blur, more cells per unit before the law froze.) Tabor has since ruled the physics
frozen at 2 cells per page unit, so this records whether that grain holds.

## How a sheet meets a phone's pixels

| Where | CSS px per page unit | device px per cell (DPR 3) |
|---|---|---|
| journal page at fit width (1000 units across ~390 px) | 0.39 | ≈ 0.6 |
| pad at fit width (1400 units) | 0.28 | ≈ 0.4 |
| write mode, the chase (a 230 px line over ~91 units) | 2.53 | ≈ 3.8 |
| `/law-check` columns | | 1, 2, 4 |

## Run

`node law/browser/density.js` opens `/law-check` as a Pixel 7 (Chromium, DPR 2.625) and an iPhone 13
(WebKit, DPR 3) and saves each fixture in real device pixels to `law/lab/density/` (regenerable,
not committed).

## What it shows (2026-10-23, emulated)

- **1 device px per cell** (where the journal and the pad sit): crisp ink. The fast hairline is a
  true hairline, the dwell's bead a distinct dot, the cursive loops clean.
- **2 per cell**: the grain appears as ink texture: speckled pigment in washes, feathered edges,
  the broad nib's flat edge.
- **4 per cell** (about the chase on a phone): the cells show as grain and slightly stepped edges,
  but it reads as textured ink, not blur; beads, the dry ring, starved hairlines and the wet
  mixing boundary all stay legible.

**Verdict: 2 cells per unit holds.** No law v2 needed for density. The last word is a look at
`http://<lan-ip>:5173/law-check` on Tabor's own phone (emulation renders the true device pixels;
a real screen and eye are still the final check).
