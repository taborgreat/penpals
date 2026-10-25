# Light: a range of waves, a room, and an eye

Layer 2 of 5. For a second agent, in parallel with layer 1.

## The whole picture (same block in all the docs)

Five layers, one set of primitives:
1. **cleanup-and-speed.md** (now, the builder): fix the lag, the camera, the table, candles as objects, and the wet front in the law.
   - **accounts-change.md** (the builder, after cleanup §1–6, before §7): signatures make the key; sign in by username plus password, 24 words or private key.
2. **light-waves.md** (now, in parallel, a second agent): light as a range of waves, the room, the eye. Built as standalone modules with no edits to existing files. The builder integrates them afterward (cleanup-and-speed.md §7).
3. **rooms.md** (later, another agent): your profile becomes your room; walls are sheets; writing together. Starts only after layers 1 and 2 are green and one page writes smoothly in the lit room.
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

## How to build this layer

- **Standalone, tested modules** in `frontend/src/scene/light/`, plus one build script for the room. Pure functions, no three.js, **no edits to existing files** (except adding the build script to the build).
- The builder integrates them into the renderer (cleanup §7).
- **These replace** `light.js`'s color model (`kelvin()`, `sunKelvin()`, the ambient formula) and the flat fading table in depth-water-gall.pdf §5.
- **Layer 3 is coming:** rooms.md puts writing on walls (ink changes a wall's absorption) and joins two rooms. So:
  - patch absorption must be a runtime input, never baked
  - the bounce solver must accept any set of patches and form factors, not only the one room

---

## The light primitives

1. **Light is a range of waves.** Every source gives an amount at each wavelength along one axis.
2. **Thin matter scatters by wavelength.** Air scatters short waves more than long ones, more the longer the path.
3. **Matter drinks by wavelength.** Every kind of matter has an absorption curve on the same axis. What it drinks becomes heat; what it refuses is reflected and goes on to meet more matter, until almost nothing is left.
4. **The eye is matter too.** It takes in the light that reaches it and reacts like everything else. It represents the person looking.

---

## 1. The axis

- Visible range 400–700 nm in **16 bins** (20 nm), plus **one heat bin** at the long end (invisible; absorbed light becomes heat by the shared heat rule).
- Every spectrum (sources, sky, matter, the eye's response) is a 17-value array. One literal table file holds all curves.

## 2. Sources

- **Sun:** a black body at about 5800 K before the air, placed by the viewer's local clock.
- **Candle flames:** black bodies at about 1850 K. The visible flame and the light it casts are one spectrum.
- **Night** is the absence of the sun's grant. Nothing is painted dark or blue; only the candles remain.
- **Light reacts only when a being is there** (rooms.md §1b). In this layer the viewer is always the being present.

### Candles burn

- **The flame is a release loop** (shared primitive): while lit it burns wax, giving this spectrum of light, heat and smoke. Each candle holds wax and burns only while lit. It is lit at night whenever a being is present (the viewer, in this layer; rooms.md makes it the room's beings) and goes out when they leave.
- **It keeps its burn across nights.** No reset: the same candle burns down over many nights, only while lit, so it can last days or a thousand years depending on how much time a being spends there at night. When it is spent, a new one replaces it.
- As it sinks, the flame sits lower, its light comes in lower, and shadows on the page grow longer.
- **Burnt wax is not deleted:** it is released as smoke (world.md, room air and smoke). This module reports the smoke rate.
- Flicker comes from the wick and fuel, not noise: a longer wick gives a taller, more restless flame that settles as it trims. Deterministic by the hour.
- **Module:** `candleState(litMs, t) → { height, wick, flameSize, intensity, heatRate, smokeRate, spent }` per candle, from its total lit time (and `t` for the flicker). The candle objects (cleanup §6) read it. Until rooms.md, the integration keeps each candle's lit time for the session.

## 3. The air

```
β(λ)    = β0 · (550 / λ)^4                       scattering strength per wavelength
path    = 1 / max(sin(elevation), 0.05)          longer when the sun is low
sun(λ)  = grant(λ) · exp(−β(λ) · path)           white at noon, gold low, red at sunset
sky(λ, view direction)                            the scattered light, brighter toward the sun and the horizon
```

## 4. The room

The page sits on a table in a small room (about 10 × 11 ft, 8 ft ceiling): plaster walls, wood floor, a ceiling, one window. Everything in it is matter at one grain, the paper's, grown from a key. Only wet ink runs the law; the room receives light and reacts.

### Grown from the key, at the paper's grain

- **Every surface is cells,** at the same grain as the paper. Each cell has a small height, its own absorption curve, and for wood a grain direction.
- **Grown, never stored:** each cell's properties come from hashing its coordinates with the surface's seed, with the same layered randomness as the paper:
  - wood: growth rings, grain streaks, per-cell jitter; floorboards as planks with seams
  - plaster: small bumps and tone shifts
- **The seed:** a fixed default in this layer. rooms.md passes each surface's seed grown from the owner's key, so every person's room is their own.
- **Plus its facts:** a surface shows what grows from its seed plus whatever has been done to it (writing, wax), exactly like a page.
- **Grown on the fly in the shader:** cells are computed as pixels are drawn, so there are no texture files. The room is billions of cells and costs a few math operations per pixel.
- **The view picks the level:**
  - Up close, each cell is drawn crisp (nearest), and its height gives it its own face to the light.
  - From farther away, where many cells fall in one pixel, the shader uses their averaged character, so there is no shimmer.
- **Objects:** table legs and edges, the window frame, the candles (and later the pens, ink jar and stamper of rooms.md) are matter at the same grain.

### Baked at build time: shape only

A script writes the room's geometry and its form factors (which patches see which, below) when the site is built. Same input, identical files. Nothing about the surfaces' cells is baked.

### Light bounces until it stops

- **Sunlight** enters only through the window: direct sun and the sky through the opening. The window patch moving across the table through the day comes from the geometry, soft-edged because the sun is a disk.
- **Candlelight** comes from the flames.
- **Radiosity over patches** (a few hundred patches over the room's surfaces; the page is one patch; each patch uses its cells' averaged absorption). Every pass, each patch gives its reflected share per bin to the patches it sees, until what is still moving falls below a threshold.
- **Baked:** the form factors (geometry only). **Runtime inputs:** sources (sun, sky, flames) and **each patch's absorption** (so ink on the page, or later on a wall, changes the room's light).
- **When:** whenever the light or any patch's absorption changes, in a worker, a few milliseconds.
- **Module output:** settled light per patch per bin. The page and the ink receive it from every direction; the ink's own relief casts its own shadows (cleanup §1.2).
- **Solver input is general:** `solve(patches, formFactors, absorption, sources)`, so layer 3 can pass two joined rooms.

## 5. Outside the window

- **Sky dome:** `sky(λ, direction)` by the same air rule: blue overhead, pale at the horizon, burning near the sun at sunrise and sunset, empty at night.
- **Sun disk** with its transmitted spectrum: white at noon, red at the horizon. Looking at it dazzles the eye (§7).
- **Ground:** a simple field, green because living matter drinks red and blue, and a few far tree lines as silhouettes.

## 6. Matter curves

- **Ink:** the law's three absorbance channels stay sealed as they are. The scene expands them with three fixed, smooth, overlapping basis curves:
  ```
  A_ink(λ) = a_r·B_r(λ) + a_g·B_g(λ) + a_b·B_b(λ)
  ```
  The basis is chosen so a palette color under noon daylight matches its swatch. Oak gall adds its own curve, scaled by darkness.
- **Paper, wood, plaster, wax, wick, grass:** reflectance curves in the table.
- **A cell:** `R(λ) = R_surface(λ) · exp(−A_ink(λ))`.
- **Gloss** is surface roughness, a separate property. Wet beads reflect the light's own spectrum like a mirror.

## 7. The eye

The eye is on the being's head (rooms.md §4): it looks where the head faces, and turning the head (the mouse) turns the view. This section is the eye's own reactions.

- **Pupil:** opens in dim light and closes in bright light. About a second to tighten, several seconds to open.
- **Color adaptation:** drifts toward treating the light it sees as white. Almost fully in bright light (noon reads white); only partly in dim light (candlelight stays warm). Strength follows the light level, so no dial.
- **You notice:** a flare then settling when the light jumps; the warm page slowly tuning in after looking away from the window; dazzle at the sun.
- **To the screen:** `seen(λ)` → XYZ (CIE 1931 2° matching functions at the bins) → linear sRGB → tonemap → sRGB.
- **State** is per viewer, for the session, never in the record.
- **Optional:** depth of field from pupil size and focus distance.
- **Lids and color** (used by rooms.md §1a): the eye can close (lids down, dark) and open, and can see in luminance only (black and white) until color is let in. Both are inputs to `toScreen`.
- **Module:** `eye.step(state, incoming, dt) → state`, plus `toScreen(seen, state)`.
- **The eye sets what is seen** (the shared primitive): the integration uses its view (direction, distance, field of view) to pick which chunks and which level of detail to draw. Looking out the window draws nothing of the page beyond its cached look. The light itself still needs the whole room, at patch level.

## 8. Fading by absorbed light

Light fades what it is drunk by.

```
drunk[ch]  = Σ_λ  daylight(λ) · (1 − exp(−A_ch(λ)))     from a fixed reference daylight
fade[ch]   = FADE[ exposure · drunk[ch] · SURFACE[depth] ]
```

Still at view time from the exposure count, still a pure function of the facts, age bucket and exposure bucket. Inks fade by what they absorb; surface ink fades before sunk ink.

## 9. The camera in the room

The camera from cleanup §3, with a wider boundary and three modes (seated, flying, walking):
- **Seated:** the writing view, as now.
- **Fly:** anywhere in the room: to the window and look out, around the table, down into the page's dents and between the beads. Speed and the near plane follow the distance to the nearest surface, so everything scales with you.
- **Walk:** gravity holds the being to the surface it stands on; at small size it walks the page's dents and beads (rooms.md §4).
- **Return to seat** and the height exaggeration slider are the same controls as cleanup §3.
- Writing only from the seat; flying is for looking.

## 10. Not now (set up, not built)

Sheen, shimmer, fluorescence, caustics through wet beads, base pigments in the law, heat into the law (only if the writer's light becomes part of the record), stars.

## Tests

- **Daylight match:** each palette color at noon, after adaptation, within ΔE ≤ 2 of its swatch.
- **Candlelight:** blue ink far darker than red ink; both match their swatches in daylight.
- **Air:** noon sky blue, low sun gold to red, night zero sun. Computed, not assigned.
- **Room build:** same input → byte-identical geometry and form factors; each patch's form factors sum to ≤ 1.
- **Room cells:** the same surface seed draws identical cells on every device; close up, plaster and wood cells are the paper's size; far away there is no shimmer.
- **Bounce:** white walls give a brighter page than dark walls; converges within the pass limit; corners darker than the center; changing one patch's absorption changes the result.
- **Candles:** lit at night while a being is present, out when they leave; height falls only with lit time and carries across nights; replaced only when spent; smoke rate is positive only while lit.
- **Eye:** after a step from dark to bright, exposure overshoots then settles within about a second; candlelight adaptation stays partial.
- **Fading:** blue and red inks at equal exposure fade by different amounts, matching their absorption.
- **Record untouched:** facts and digests identical under any light, time, candle state, room, eye state or bin count.

## Needs Tabor's ruling

- Bin count (default 16 + heat).
- Room style and size (default: plaster walls, wood floor, one window).
- Paper colors: keep the picker mapped to curves (default), or a fixed set of real paper kinds.
- Candle burn time.
- Depth of field: on or off.
