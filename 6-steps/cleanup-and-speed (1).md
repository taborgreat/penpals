# Cleanup and speed

Layer 1 of 5. Review of commit 30fda0f. For the agent that built the site.

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

Rule for this layer: never trade the law for speed. Slow and true beats fast and stunted. Every speed fix is in the scene or the plumbing. Only §2 changes facts.

---

## 1. Lag: what is actually causing it

Found in the code, biggest first.

**1.1 At night the scene renders every frame, forever.**
`SceneView.jsx:89` schedules another frame whenever `light.night > 0.01` (candle flicker). After dusk the full-cost render runs nonstop even when nothing moves.
- Flicker at most 12 fps.
- With no camera motion and nothing changing, render only the flicker frames, at reduced resolution.

**1.2 The fragment shader reads up to ~170 textures per pixel.**
`shadowTo` marches 28 steps (2 reads each) for the sun and each candle, plus 8 reads for the normal, at full resolution with MSAA.
- Bake shadow and openness per chunk into a texture when that chunk's heights change or the light moves. The per-frame shader then reads ~4 textures.
- Until baked: 12 steps with growing length; candles without shadows; no sun shadows above 70°.
- `antialias: false`; 0.75× resolution while the camera moves, full after 200 ms still.

**1.3 Every frame is copied from WebGL to a 2D canvas.**
`engine.js:582–583` `drawImage`s the WebGL canvas into each view's 2D canvas, a GPU-to-CPU sync every frame.
- When one view is on screen (write mode, a letter), render straight into a WebGL canvas in that view.
- Keep the copy path only for pages with many small views, or use one page-sized canvas with a scissor rect per view.

**1.4 Live writing re-processes whole chunks.**
Each live tile goes through `putCell` per cell, marks the whole 136 × 136 chunk dirty, re-smooths it and re-uploads ~220 KB.
- The worker sends heights as half floats.
- The engine copies rows with typed-array `set`, uses numeric chunk keys and no per-cell closures.
- Smooth and upload only the changed 16 × 16 rect (+1 cell border).

**1.5 Resolution.** Cap at 1.5× device pixels on desktop, 1× on phones, 0.75× during motion.

**Report:** Performance panel numbers before and after for idle at night, writing a line, and orbiting.

---

## 2. Ink pools on top before it sinks (the law)

Found in `law/v2/live.js` `heightTile` (and `cut()` [14]): `bead = W − (cap + dent × DENT_CAP)`. Water up to capacity counts as already inside the paper, so ink only shows on top when it overflows.

**The fix: one water amount, a wet front, and the paper's surface tension.** No second water store.

```
front    = how many of the paper's THICK layers the water has reached (per cell, grows only)
held     = capacity of the layers within the front (+ dent capacity)
on top   = max(0, W − held)      standing water: surface flow, beads under the hold rule, evaporates
in pores = min(W, held)          slow pore flow and fiber links only
```

- **Landing:** `front = 0`, so all the ink stands on top.
- **Breaking through:** the paper's top resists wetting (its sizing). The front starts after `ENTER[siz]` ticks of standing water: at once on thirsty paper; on sized paper the water beads and spreads first.
- **Sinking:** the front then advances each dry step at `SOAK[siz]`, slowing with depth, until it reaches the water or the bottom layer.
- **Flow:** surface flow moves only `on top`; pore flow moves only `in pores`.
- **Drying:** evaporation takes from `on top` first, then the top pore layer. The `ABSORB` term in `dry()` is removed: soaking in is the front advancing.
- **Facts:** `depth` becomes the live wet front (monotonic, in the digest). The side view and the scene show `on top` above the surface and the soaked layers below.

The ink itself changes: drops stand and spread on sized paper, vanish into thirsty paper. (The ink law keeps its own evaporation rule for now; making drying follow the shared heat rule is a later law change.) Re-record the v2 goldens (only test sheets exist) and say so in the commit.

**Tests:**
- One dwell: all water stands on top first; on sized paper it spreads before the front starts; the soaked layers grow while the water on top shrinks; total water accounted for every tick.
- The same drop on thirsty paper sinks sooner and spreads less.
- **One-way sink:** once a cell stops receiving water, its water on top never increases again; after drying, only the thin film is on top.
- Conservation and determinism suites pass on the new goldens.

---

## 3. The camera

Found: in write mode a left-drag always writes (orbit only on right-drag or two fingers, unexplained); elevation clamps at 5°–89.9°; zoom goes toward the target; minimum distance 4 px; heights fixed at `DROP_PX = 0.004`.

- **Hand / Pen switch** in 3D (button + `H`).
  - Hand: left-drag orbits, right-drag or shift pans, wheel dollies toward the cursor.
  - Pen: left-drag writes; orbit on right-drag and two fingers; a one-line hint.
  - Default: Pen in write mode, Hand in viewers.
- **Elevation 0°–90°** for looking (dead sideways). Writing still needs ≥ 25°.
- **Dolly to the cursor:** the target slides toward the page point under the cursor as you come closer.
- **Close flight:** minimum distance 0.3 px; near plane = distance / 1000; `logarithmicDepthBuffer: true`; WASD across, Q/E up and down. Speed scales with distance.
- **Height exaggeration:** slider 1×–200× on `dropPx`, default about 20×. Scene only.
- **Return to seat:** one button glides back to the default writing view.

Light-waves §9 extends this same camera into the whole room; build it here so that is only a wider boundary later.

---

## 4. The table

Today the table is an unlit color plane 40 px below the paper, so from the side the page floats.
- The paper rests on the table: table top at `-SLAB_PX`.
- The paper casts a soft shadow on the table, offset away from the light.
- Tears show the table through the hole (the stencil path already does this).
- Surface: plain and lit for now. Its wood is grown from a seed in the shader when light-waves lands.

---

## 5. Cleanup and tightening

No logic loss. `npm test` green after every step. Law v1 and v2 stay byte-for-byte except §2.

- **Smaller scene data:** PNKS encodes 10 bytes for every cell of the box. Encode only cells that hold anything (row runs); 8-bit surface when its range fits (header flag).
- **Fewer allocations:** reuse tile buffers in the worker; numeric chunk keys and typed-array copies in the engine.
- **One source for shared constants** (cells per unit, tile size) used by both engine and law.
- **One style:** ESLint + Prettier across law, backend and frontend. Keep the explanatory comments; drop stale references.
- **Dead code:** the import scan found no unimported frontend files; remove only what tests prove unused.
- **Benches:** frame time at night with N chunks; one live tile update; scene payload for a typical letter.
- **Not now:** no sim rewrites that risk determinism. The Rust/WASM port waits for the law freeze.

---

## 5b. Load by the senses (start now, on the page)

Today the client asks for every item's look on a page. Make what it asks for follow the eye (and, later, the ear and the light, per the shared primitives):
- **Out of view:** not requested. Already-loaded chunks and looks that leave the view are dropped after a while (keep a small cache).
- **Far or small** (a journal item across the room, a thumbnail): the flat look at reduced resolution.
- **Near:** the scene field (heights, depth, color) for the chunks in view.
- **Very near (bead scale):** full cells; own and open sheets regrow locally from the acts.
- **Wet ink out of view keeps settling:** the worker that holds the sheet keeps running its reactions to completion; only rendering and tile uploads stop. When it comes back into view, it is already settled. Play/done always finishes a sheet before sealing.
- **Server:** serves looks and scene fields by sheet, chunk range and level of detail, behind the same visibility rules.
- **Tests:** an item scrolled out of view makes no requests and draws nothing; a sheet that leaves view while wet keeps settling (its worker still steps) and ends byte-identical to one watched the whole time.

## 6. Candles you can see

The sun and candles exist only as numbers in the shader. Tabor saw a white box and no sun.

- **Check first:** what is the white box? (The paper lit flat at full sun, the slab, or an uninitialized frame.) Find it and report.
- **Candles as objects:** two candles stand on the table either side of the page (at `candlesAt`'s positions, resting on the table): a wax body, a dark wick, and a flame.
  - Flame: an additive, camera-facing teardrop (white-yellow core into orange) with a soft glow, its size and brightness driven by the same value as the candle's light, so the flame and the light on the ink flicker together.
  - For now that value is the existing `flicker()`. Light-waves replaces it with burn state (height, wick), and the object reads it the same way.
- In 2D the candles sit off the page, but their light still plays across the ink.
- **Close-up look of the page:** setting for crisp cells (nearest filtering) or smooth (bicubic) at bead scale. (The room is always crisp; this is for the page.)

Do not build sky fill, window light, color grading, tonemapping or color tables: light-waves replaces all of the lighting model.

---

## 7. Integration (after the light-waves modules land)

The second agent delivers standalone modules in `frontend/src/scene/light/` and a room build script. Then, here:
1. Replace `light.js`'s color model (`kelvin()`, `sunKelvin()`, the ambient formula) with the spectral sources, the air rule and the eye.
2. Shader: the per-band loop over direct lights plus the room's settled light; the worker sends the three absorbances per cell instead of color-to-alpha RGBA.
3. Load the room's geometry and form factors; grow its surfaces (walls, floor, ceiling, the table's wood, objects) in the shader. Run the bounce worker when the light changes.
4. Candle objects read burn state instead of `flicker()`.
5. Widen the camera from the page to the room (light-waves §9).
6. Fading reads absorbed light (light-waves §8).

---

## Order

1. Night render, shader, canvas copy (1.1–1.3): most of the lag.
2. Live-update path (1.4, 1.5).
3. The wet front in the law (§2).
4. Camera (§3).
5. Table and candles (§4, §6).
6. Cleanup pass (§5, §5b).
7. accounts-change.md (its own doc).
8. Integration (§7), when the light modules are green.

## Needs Tabor's ruling

- Candle flicker: on by default, or a setting.
- Default height exaggeration.
- Close-up look of the page: crisp cells or smooth by default.
