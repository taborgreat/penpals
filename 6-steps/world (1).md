# World: sound, weather, and the first life

Layer 5 of 5. For an agent, after outside.md is green.

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

---

## The rules of this layer

- **Sound is a range of waves too.** Every sound has its own spread of frequencies; matter drinks sound by frequency the way it drinks light (walls muffle the highs, glass rings, wood knocks).
- **Every sound is an event.** There are no soundtracks. A sound plays because something happened: a nib dragged over a fiber, a drop hit the glass, a cricket chirped. It plays from where it happened, quieter with distance, colored by what it passed through.
- **The ears are on the being's head** (rooms.md §4): turn the head and the sound turns with it.
- **The ear's range, not the eye's.** Sound loads within hearing range all around, behind you included, muffled by walls. Within it, only what is near is detailed. Close events are individual; far ones are summed into a total (a hiss, a wash), the same way only wet ink computes.
- **All of it is scene.** Nothing here enters the record. Weather and life grow from the date and the room's seed, so everyone in a room hears the same storm at the same moment.
- **Asking for weather** works like dragging the light: the viewer can call up rain or wind for a while, then it eases back to the day's own weather.

**Build order:** each phase ends usable and tested, and builds only on phases before it. Nothing later requires reworking anything earlier.

---

## Phase 1: the sound core

- **The engine:** Web Audio. An event (`{ kind, position, time, strength, spectrum }`) becomes a short sound grain at that position.
- **Spatial:** a panner per voice (HRTF), distance falloff.
- **Frequency bands:** 10 octave bands (31 Hz–16 kHz) for absorption, the sound counterpart of light's bins.
- **Three tiers, by how close and how many:**
  - **Voices:** the nearest, loudest events, each its own sound (at most 32; the quietest drops first). Like real hearing: you pick out a handful at a time.
  - **Cloud:** the next few hundred, rendered together as a dense texture of tiny grains with varied size, pitch and timing.
  - **Wash:** thousands or more become one sound shaped by their statistics (rate, sizes, distance, what they land on): the washed-out distant roar.
- **Never mechanical:** no two events sound identical (size, surface and distance vary each one), and timing is irregular (seeded, not evenly spaced), so a hundred drops never sound like an engine.
- **Silence costs nothing:** no events, no work.

**Test:** a test click placed left, right, near and far sounds from there; 100 clicks a second stay under budget; silence uses no CPU.

## Phase 2: the pen

The most important sound. Made from the same acts the ink is.

- **Scratch:** per act, from the nib's speed and pressure, the paper's tooth and fibers under the nib (the paper fields), and the nib type:
  - flex and fine nibs scratch
  - broad nibs hiss
  - a brush is nearly silent
- **Ink changes it:** a well-wetted glide is quieter and smoother; a nib running dry rasps.
- **Small events:** the tick of pen-down, the lift at pen-up, a splatter's patter, a dip pen tapping the inkwell.
- **Playback replays it:** the sound comes from the acts, so playing back a letter plays back its exact scratching, at any speed.
- **Writing together:** each writer's pen sounds from where their pen is.

**Test:** pen-to-sound latency under 20 ms; same acts give the same sound on playback; fast strokes sound higher and brighter than slow ones; a brush is quieter than a flex nib.

## Phase 3: the room's acoustics

- **Reverb from the room itself:** the room's surfaces absorb sound by band (plaster, wood, glass), and the reverb time and early reflections come from the room's size and absorption. The pen sounds like it is in that room.
- **The window:** closed muffles outside sound (glass drinks the highs); open lets it in crisp.
- **The candles:** soft crackle events from the burn state (a long wick crackles more).
- **Joined rooms** (rooms.md §7) share acoustics through an open wall; a closed door muffles.

**Test:** the same pen stroke sounds drier in a small room than a large one; a test source outside is muffled until the window opens.

## Phase 3b: room air and smoke

- **The room's air:** a coarse grid (default 10 cm cells), awake only where there is smoke or moving air (the sleep rule).
- **Smoke from the candles:** while lit, each candle releases smoke at its `smokeRate` (light-waves §2). It leaves the flame hot, so it is lighter than the air and rises; as it gives its heat to the air it spreads along the ceiling and slowly thins.
- **Smoke is thin matter:** it scatters and absorbs light by the same air rule as the sky. A smoky room grows hazy, the candle glow becomes visible in the air, and the bounce light dims.
- **Openings:** an open door or window, or an open join to another room, lets smoke pour through by the same flow law.
- **Many candles fill the room.**
- **Every act settles:** after the last being leaves, the smoke keeps settling; it is computed in one step from elapsed time when someone returns.
- Scene only: smoke never enters the record.

**Test:** one candle's smoke thins to nothing over time; enough candles fill the room with visible haze; opening a door drains it through the opening; a room left and re-entered shows the same smoke as one watched the whole time.

## Phase 4: weather as state (heard, not yet seen)

- **A few numbers,** evolving by the shared rules at a coarse scale: cloud cover, humidity, wind, temperature (the heat rule applied to the air), rain rate, lightning charge.
  - Humid air cooling past its threshold makes clouds (a phase change).
  - Warm air rises and cool air flows in under it: that is wind.
  - Heavy clouds make rain.
  - Unstable, charged air makes lightning.
- **Seeded** by the date and the room's seed: deterministic, the same for everyone in the room.
- **Sounds from totals only:** wind as a filtered noise whose level follows wind speed; distant rain as a hiss from the rain rate.

**Test:** the state evolves the same way for the same date and seed; rain hiss rises with the rain rate; calm weather is near silent.

## Phase 5: weather you see

- **Clouds:** the air rule from light-waves. Droplets scatter all wavelengths equally, so clouds are white, and gray when thick. They dim the sun's grant through the window.
- **Rain outside:** visible through the window, drawn only in the view.
- **Rain on the glass:** the window glass is a sheet running the water law. Each drop that lands is an event (a tick on the glass, from where it hit) that beads, joins and streaks down. Only the glass is simulated, so the cost is bounded.
- **Lightning:** one event that is both a light source (the room flashes through the window) and a sound. The thunder arrives late by the real speed of sound, so the gap tells you the distance.

**Test:** the window glass costs the same per drop as ink on paper; the thunder delay matches the strike distance; cloud cover dims the room's light through the bounce solver.

## Phase 6: the first life, bugs

- **Crickets:** each a tiny being with its own chirp rhythm, chirping faster when the air holds more heat (Dolbear's law). Heard through the open window at night.
- **A moth** drawn to a candle flame, circling it, its shadow flickering across the page.
- Beings far from the eye run coarse; near ones run every step.

**Test:** chirp rate follows temperature; crickets go quiet in heavy rain; the moth never enters the flame.

## Phase 7: a fish tank

- **A small water volume on the shelf,** glass and water lit by the room (the candlelight dances in it).
- **A few fish** following simple rules: stay near each other, avoid the glass, wander.
- **Small sounds:** bubbles from a filter as events.

**Test:** fish never leave the water; the tank's glass passes light through the bounce solver; bubbles stay within the voice budget.

## Phase 8: birds

- **A small flock outside** with the same kind of rules, chirping to each other: mostly heard, sometimes seen through the window.
- They sing most at dawn and shelter in rain.

**Test:** the dawn chorus rises at sunrise by the viewer's clock; birds go quiet in a storm.

---

## Cost

- **Audio:** the 32-voice budget; far events summed; silence costs nothing.
- **Weather:** a few numbers per step, plus the window glass when it rains.
- **Life:** a handful of beings; only near ones detailed.
- None of it touches the ink law, so writing never slows because it is raining.

## Needs Tabor's ruling

- Pen sound on by default, and its volume.
- Weather shared per room (default) or per viewer.
- Whether visitors can call up weather in someone else's room, or only the owner.
- Order of life after crickets: fish tank or birds.
