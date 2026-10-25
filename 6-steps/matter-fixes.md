# Matter fixes: what is still a look instead of matter

For the builder. A review of commit 67048c2 (rooms phases 1–4a, the light modules integrated). Do it before one-world.md.

## The whole picture (same block in all the docs)

Five layers, one set of primitives:
1. **cleanup-and-speed.md** (now, the builder): fix the lag, the camera, the table, candles as objects, and the wet front in the law.
   - **accounts-change.md** (the builder, after cleanup §1–6, before §7): signatures make the key; sign in by username plus password, 24 words or private key.
2. **light-waves.md** (now, in parallel, a second agent): light as a range of waves, the room, the eye. Built as standalone modules with no edits to existing files. The builder integrates them afterward (cleanup-and-speed.md §7).
3. **rooms.md** (later, another agent): your profile becomes your room; walls are sheets; writing together. Starts only after layers 1 and 2 are green and one page writes smoothly in the lit room.
   - **matter-fixes.md** (the builder, after rooms phase 4a): the heat rule in the law, drips from the candle, objects as grown matter in the light, shine from the surface.
   - **one-world.md** (the builder, after matter-fixes): the site is one page, the world; houses near the start; every control becomes something the being does.
4. **outside.md** (after rooms): the laws that make circles and swings, the ground with stones and trees to pick up, break and carve, and the point of attention: keys, mouse and the eye's zoom.
5. **world.md** (last, after outside): sound as events (the pen first), weather, and the first life. Scene only, built in testable steps.

The primitives every layer follows:
- **One law.** Acts in, facts out. Only wet ink computes; dry tiles sleep. A wall is a sheet like a page.
- **Facts and the scene are separate.** Light, the room, the senses and the beings' motion never touch the ink's facts, seals or digests. The scene is a fold of the facts for display.
- **Color is what matter refuses to drink.** Ink, paper, wood and plaster all absorb by wavelength; nothing is painted.
- **Everything is an act on the chain.** Where things are and who may write are read from the chain.
- **Only acts cross the wire.** Everyone regrows the same result from the same acts in the same order.
- **Every act settles.** Its reactions run to completion under the law whether or not anyone is looking (the ink beads, sinks and dries; the candle burns down). Watching only decides what is shown.
- **One being, its senses on its head.** The person looking is one being: a body that moves and a head that turns, with the eye and the ear on the head. Moving the mouse turns the head the same way moving the pen lays ink: an act changing matter. Recorded coarsely, never every tiny motion.
- **One point of attention.** You can only be focused on one thing at a time. The keys place the body; the mouse moves whatever your attention is on (the head, the hand, the pen, the swing); the scroll sends the eye closer. No menus: only direct action.
- **Same rules everywhere.** Matter differs only by its properties, what surrounds it, and the key it was grown from. No phenomenon gets its own system.
- **Everything falls until it rests,** unless it is held, flying, or lighter than what surrounds it. Lighter rises, heavier sinks: warm smoke rises, a drip falls.
- **One rule for heat.** Matter holds heat, passes it to its neighbors, gains it from absorbed light and from burning, and loses it to the air. When a matter's heat crosses its thresholds it changes phase: wax melts and hardens, water evaporates and freezes.
- **Fire is a release loop.** Heat breaks bonds, releasing heat, light and smoke, until the fuel runs out. A candle flame is one.
- **Each sense pulls its own range.** The eye: exactly what is in view, at the detail it can see. The ear: a range around, out to where sounds fall below hearing, muffled by walls. Light: the whole room, but only at patch level. Nothing outside every sense's range is sent or drawn.

---

## The verdict

Where a primitive is in the law, the code builds from it: light as waves (16 bins through the eye's weights), the room's bounce over patches with runtime absorption, the walls, floor and table grown cell by cell from a seed, marks on walls drinking through the ink, the candle as a black body with a deterministic wick cycle, the neck law, wax as matter that ink beads off.

Where a primitive is missing, the look was faked. Three places: **heat**, **objects as matter**, and **shine**. This doc fixes them, in that order.

---

## 1. The heat rule, in the law

Today wax is soft for a fixed time (`WAX_SOFT_MS` + `WAX_SOFT_HEAT` × the drip's heat number, law/v2/constants.js) and nothing holds heat.

**Change (law 3, with goldens):**
- **A cell holds heat** where there is wax (a heat value per wax cell, awake only while it is warmer than the air: the sleep rule).
- **Heat flows** to neighboring cells and to the paper under it, and **leaves to the air**, each step, by integer rates.
- **The phase threshold:** wax above its melting heat is liquid; below it, solid. A press dents only wax above its softening heat (replacing `soft()`'s timer).
- **A drip lands carrying its heat** (as now), and from then on cools by the rule, not by a clock.

**Tests:** a hot drip stays soft longer than a cooler one, because it has more heat to lose; a drip next to a fresh drip stays soft longer (heat flows between them); a press after the wax has cooled past its threshold takes nothing; same acts give the same heat and the same dents on every machine.

## 2. Drips come from the candle

Today a drip is a tool button that fires a fixed drip every 350 ms (`DRIP = { amt: 400000, heat: 220, every: 350 }`, room/shared.js; TogetherBar.jsx).

**Change:**
- **The melt pool** comes from the flame's heat (`candleState`'s `heatRate`) flowing into the wax around the wick: how much is liquid, and how hot.
- **Tilting** a held candle (hold E, rooms.md §3b) tips the pool. Past the lip, wax runs over: the drip's amount and heat come from the pool and the tilt, not a constant.
- **The drip falls straight down** and lands as a drip act on whatever is below (a sheet, the table, the holder's dish).
- The candle you see sinks as it burns and shows its pool.
- Remove the wax tool button and the `DRIP` constant.

**Tests:** a candle just lit has no pool and drips nothing when tilted; a long-lit one drips; tilting further drips more; a drip's heat is the pool's.

## 3. Objects are grown matter

Today the brass holders are one brass curve on a smooth cylinder (`objectMaterial` with `kind === null`); the candle's wax and wick are one curve each (`waxMaterial`, `plainly(R)`); the legs and frame grow wood cells from world position; beings' clothes are RGB colors made into curves, picked by a hash of the name (`paperCurve([96, 40, 44])`, engine.js).

**Change:**
- **Every object has a kind with its own grower** (light/surface.js), the same way the walls do: brass (fine scratches, polish and tarnish in its tone), wax (smooth, its own tone), wick, cloth for beings. Each object has its own seed.
- **Cells on the object's own surface:** addressed by the object's local u, v (and around a cylinder, its angle and height), not world position, so the grain moves with the object when it is carried.
- **Colors from matter:** a being's cloth is a cloth curve pair grown like any surface. No RGB.

**Tests:** zoomed in, a holder shows its own cells like the wood does; a carried candle's grain stays fixed to it as it moves; the same seed grows the same object for everyone (JS, GLSL and WGSL agree, as for the walls).

## 4. Objects are in the light

Today legs, the frame, holders, candles and beings are left out of the light's geometry ("visual only", light/room.js) and lit by the room's mean (`meanLight`): a holder by the flame gets the same ambient as one in a dark corner, and nothing they hold or are casts a shadow.

**Change:**
- **Light at the object's place:** each object takes the room's settled light from the patches nearest it (as the wall marks do, `spectrumAt`), not the room's mean.
- **Shadows are not a separate system.** Everything is matter at the grain, and a cell is lit by a source only if the light reaches it: if any matter lies on the line between the cell and the flame (or the sun through the window), no light from that source; if none does, light. A hand, a pen, a carried candle, a holder, a being: each blocks light because it is matter, the same as the page's own relief does. How the line is tested (a depth map from each source is one way) is the builder's to choose; what it computes is fixed: light reaches the cell or it does not.
- The flame's own light already moves with it (sources are runtime inputs).

**Tests:** a holder next to a flame is brighter on that side than one across the room; a hand over the page casts a shadow on it from the candle; moving the candle moves every shadow.

## 5. Shine comes from the surface

Today shine is added where a cell is flagged wet (the wet bit in the chunk's flags) and objects have no surface to shine from.

**Change: roughness is the surface's own heights, not a stored value.**
- **Up close** (a cell several pixels wide): each cell's face comes from its neighbors' heights, and light leaves each face like a mirror. Aligned faces give a sharp glint (brass); scattered faces give a soft or no sheen (wood, plaster, paper).
- **Far away** (many cells in a pixel): the grower's mean (`growMean`) also returns how much the faces' slopes vary over the footprint. Little variation, a tight highlight; much, a broad dull one (the same idea as Toksvig filtering of bumpy surfaces).
- **Wet ink shines because it is smooth:** a bead's top is near flat, so it glints, and as it dries into the fibers it takes their roughness and goes matte. Remove the shine-by-wet-flag.
- **Each kind's grower is the stand-in for its history** (brass: crystal, worn and polished; wood: grown; plaster: troweled): how big its bumps are and how they spread. Later acts change it by the same rule: rubbing lowers the peaks and polishes (outside.md §2.3), carving roughens.

**Tests:** under one candle, brass shows a small bright highlight and wood a broad faint one; a wet bead glints and its glint fades as it dries without any flag; the same surface zoomed out keeps the same overall brightness (no shimmer, no highlight popping).

## 6. The flame

Today the flame is an additive teardrop sprite with a glow (`flameMaterial`); its light is a true spectrum but the shape is drawn.

**Change (small, for now):** its size, height and restlessness come only from `candleState` (`flameSize`, `flameAt`, the wick cycle), and its color from the same black body as its light, through the eye. As matter (hot gas in the room's air) it waits for world.md phase 3b.

## 7. Check: the height and the ink line up

A screenshot from the local build showed the paper's relief mirrored top to bottom against the ink in each chunk (paper ridges beside horizontal strokes, opposite ones beside slanted strokes, spikes where beads should be). If it is still there: one row order and one uv convention for every texture that holds height or color. **Test:** a single "/" stroke on a blank page; its relief sits exactly under its ink on every chunk at every exaggeration.

---

## Order

7 (if still present) → 1 → 2 → 3 → 4 → 5 → 6. Each ends green before the next.

## Needs Tabor's ruling

- Wax's melting heat and how fast heat leaves to the air (sets how long a drip stays soft).
- Brass's look: polished, tarnished, or grown with both by seed.
- Beings' cloth: one cloth curve pair for everyone, or a few, chosen by the being.