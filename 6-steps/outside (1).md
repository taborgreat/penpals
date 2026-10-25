# Outside: the ground, the hands, and the eye

Layer 4 of 5. For an agent, after rooms.md is green. world.md comes after this one.

This doc has three parts, and the third ties them together:
1. **The laws of the universe in this world:** circles, swings, levers and wrapping come out of the law; nothing is coded as a shape.
2. **The outside and the hands:** ground, stones and trees grown from the world's seed; picking things up, breaking branches, carving sticks. Just that for now.
3. **The point of attention:** the whole interface is a few keys and a mouse, with no menus, plus the scroll that sends the eye down to a spot without moving the body.

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

## Part 1: the laws of the universe in this world

### 1.1 Shapes come out of the law

Circles, swings and balances are not coded. They are what the law does when nothing tells it otherwise.
- **Round:** a free drop spreads the same in every direction, so it settles round. A body pulled equally from all sides settles round. The circle is what "the same in every direction" looks like once it rests.
- **Swing:** a weight held by a string falls; the string will not let it fall straight, so it falls sideways, overshoots, and falls back. Falling plus being held, with the motion bleeding off as heat, until it rests at the bottom. Circular motion is the same thing: falling toward a center while moving sideways.
- **Balance (the lever):** a beam turning on one point tips toward the side where weight times distance is larger. The beam computes nothing; it tips or it does not. The equation is what beings wrote down after watching it.
- **Wrapping holds:** a cord wrapped around a stick grips harder the more it wraps. The grip grows with every turn (each bit of wrap presses the cord against the stick, and that pressing is friction against slipping), which is why a few turns hold what one turn cannot. This comes from contact and friction, not from a "knot" rule.

**2 + 2 = 4 is marks.** Number and equation are systems beings made, taught each other and put into machines. They live on the paper, read by beings. The only equal sign the structure keeps is the law's: the same acts on the same paper give the same facts.

### 1.2 What the law must have for this

These are the few properties every new matter carries. Nothing else.
- **Mass** (how hard it falls and how hard it pushes).
- **Hardness** (which of two touching matters gives way when rubbed).
- **Strength** (how far it bends before it breaks: a branch, a binding, a stick).
- **Friction** (how much it resists sliding against another matter).
- **Heat** properties, from the heat rule (how it holds heat, its phase thresholds, whether it burns).
- **Absorption by wavelength,** from light-waves (its color).

A string is just matter with low stiffness and high strength along its length: a chain of short pieces, each falling and each held by its neighbors at a fixed reach. A pendulum, a sling and a tied axe all come from that plus the properties above.

### 1.3 The free-drop test (direction fairness)

A law on a grid makes circles only if it treats every direction the same. A naive square-grid rule spreads into diamonds or squares, which shows that the law has a favorite direction.
- **Test:** one free drop of ink on blank paper, settled, compared at 0°, 45° and 90°: its outline is round within one cell, and the same drop rotated settles the same up to rotation.
- **Test:** a weight on a string, let go, swings and settles at the bottom, and its swing does not grow (energy only leaves).

### 1.4 What could be built later (not now)

Listed so the law is built to allow them, not to build them now:
- a string from bark fiber, a pendulum hung from a branch
- a cord wrapped around a stick, and a rock tied to a stick by hand: if the binding holds, it is an axe; if it is loose, the first swing pulls it apart
- a lever: a stick over a stone to lift something heavy
- fire from rubbing wood fast enough that the heat crosses its threshold

### 1.5 What is a fact and what is scene

- **Anything that changes matter lastingly is a fact:** a branch broken, a stick carved, a stone moved and set down, a mark pressed into wax. It is regrown by everyone from the acts, so it must run in the law: deterministic, integer, versioned with goldens (v3 or a new law module).
- **The motion in between is scene:** the arc of a swing, the wobble of a stick as it is carried. Others see it glide between coarse motion acts, as with the head (rooms.md §4).
- **The outcome comes from the acts:** a swing is recorded as the being's coarse motion acts; whether the stick breaks or the stone cuts is computed by the law from those acts, the same on every machine.

---

## Part 2: the outside and the hands

### 2.1 The outside is grown from the world's seed

Like the room (light-waves §4) and the paper, the outside is grown on the fly, from the world's public seed, at the paper's one grain. Nothing about it is stored except what has been done to it.
- **Dirt:** the ground. Walkable; things let go of land on it.
- **Stones:** loose, of different sizes and hardness. Small ones can be picked up.
- **Trees:** trunk, branches, bark, leaves. Grown from the seed, so no two trees are the same.

Only what the senses reach is grown (the primitives' sense ranges). A tree out of view is not drawn; a branch broken off it stays broken because the break is a fact on the chain.

### 2.2 The outside is spaces too, and doors decide what loads

- **Every scene is a space.** Each house is its owner's space, grown from their key (rooms.md §1). The outside is one shared space grown from the world's public seed, with the houses standing in it (one-world.md).
- **The house opens to it** through its door and its window (rooms.md §3 doors). Walk out with WASD.
- **Door principles apply:** a closed door or window is a wall. With both closed, the outside is not loaded or drawn at all, because that is how it is: nothing outside reaches any sense. It also keeps a slow PC fast.
- **Open either one** and the outside beyond it loads, only as far as the senses reach through the opening.
- **With both closed, the candles light.** No daylight comes in, so the room is lit by its candles (as at night, rooms.md §1b).
- **Every act settles behind a closed door:** the outside keeps its own time; what happened out there is computed in one step from elapsed time when the door opens again.

### 2.3 What the hands do, just this for now

- **Pick up:** a stone, a fallen stick, a leaf. Holding is a move act, like picking up a candle.
- **Let go:** set it down where you are, or drop it and it falls until it rests.
- **Break a branch:** hold it and pull; it bends, and past its strength it snaps. The broken branch is a stick you can carry.
- **Carve a stick:** hold a stone and rub it along a stick. The harder matter takes the softer away where they touch. This is the same act as the nib scratching the paper's fibers, with different matter: carving is writing that removes. Carve a point and the stick becomes a pen; carve a word into a tree with a stone the same way.

That is all of it for now: dirt, stones, trees, pick up, let go, break, carve. Everything else in §1.4 waits.

### 2.4 The house stays unlimited for now

The ink jar, the wax, the candles, the stamper and the paper stay in the house in unlimited supply, the way an infinite water bucket does in creative mode. The point is to test the law on the things that matter most before the gathering exists. The shortcut never has to be undone: later, a jar can be one you filled from galls you crushed, and the ink inside obeys the same law either way.

Things from outside already work with the house:
- **Dip a carved stick** into the ink jar and write with it. Its line comes from its carved tip; until carved tips have their own nib law, the closest existing nib type stands in.
- **Ink a leaf and press it onto paper with a stone:** it leaves its veins.
- **Press a piece of bark** from the stick you carved into warm wax: it leaves its texture.

---

## Part 3: the point of attention

### 3.1 The idea

You are the point of attention controlling a muscle group. You can only focus on one thing at a time. The rest of the body keeps following the law on its own (the body drags after the neck; the head stays roughly where it was while you write), the same way one chosen act runs the hundreds of small ones under it until something needs your attention again.

Everyone sees the same being: a body, a head and two hands, under the same light. What differs is the screen. Each screen is that being's own moment: what its eye reaches and where its attention is. Others see that you are bent over the desk; you see the nib and the ink.

### 3.2 The keys

| Input | What it does |
|---|---|
| **W A S D** | walk the body across the ground (x and y) |
| **Space** | jump: push up, then fall back |
| **Space twice** | fly: stop falling; Space rises while flying |
| **Shift** | lower while flying; crouch on the ground |
| **Mouse** | move whatever your attention is on: the head when looking, the hand and pen when writing, the arm when swinging |
| **Scroll** | the eye's zoom: attention travels closer or back (§3.4) |
| **E (hold)** | tilt what you hold (rooms.md §3b) |

No menus. What you can do comes from what you are holding and what is in front of you.

### 3.3 Where the mouse goes

- **Looking:** the mouse turns the head (rooms.md §4, the neck law).
- **Writing:** with a pen in hand at a sheet, the mouse is the hand: you just write, and do not worry about the rest of the body.
- **Swinging and rubbing:** with a stone or a stick in hand, the mouse's direction and speed become the arm's direction and force: a swing at a tree, a stroke along a stick.

How attention moves from the head to the hand (a held button, or simply being at a sheet with a pen) is in "Needs Tabor's ruling."

This replaces cleanup-and-speed.md §3's Hand/Pen switch and Q/E for up and down once this layer lands. Until then, §3 stands as it is.

### 3.4 The zoom: attention travels, the body stays

**What it feels like:** scrolling in feels like getting small and going down to the spot you are looking at. The ink blobs become enormous, the dips and valleys rise as terrain, the paper's fibers become a field, and candlelight rakes low across the ridges. But you do not become small. Your being's matter does not move: you are still the same size, sitting in the same chair. Only your attention travels, like your eyes leaning in to look close at one spot. Your body moves only when you press WASD.

**How it works:**
- **The eye's viewpoint moves; the body and head do not.** Scrolling slides the eye's viewpoint along the line from the head to the point under the cursor. Scrolling back returns it toward the head. The farthest out is the eye's own place in the head.
- **Toward the cursor:** the point under the cursor stays under the cursor as you go in, so you travel to exactly the spot you are looking at.
- **Speed by distance:** each scroll step moves a fixed fraction of the remaining distance, so going from the desk to a bead of ink takes the same handful of steps as going from the room to the desk.
- **Depth works at every distance:** near plane = distance / 1000, `logarithmicDepthBuffer: true` (as in cleanup §3's close flight).
- **The relief at true scale:** seen from close enough, the ink's real heights look like hills without being stretched. Height exaggeration becomes unnecessary at depth. Keep the slider until this is seen working; whether its default drops to 1× is in the rulings.
- **Writing while zoomed:** the mouse still drives the nib, now at the zoomed scale, so the hand can work finer where the eye has gone.
- **The ear stays on the head.** Zoom is the eye's; sound still comes to where your head is.
- **Not the same as changing size.** rooms.md §4 lets the being change size and walk among the dried beads; that moves the body. The scroll never does.

### 3.5 The zoom is fidelity where you look

Attention is the dial for fidelity: wherever the eye travels, the world grows finer right there, and everywhere else stays coarse.
- **The patch shrinks as the grain rises.** The eye pulls exactly what is in view at the detail it can see (the primitives). Close in, it pulls a tiny patch at fine grain; pulled back, a wide view at coarse grain. The cost stays about the same at every depth: one screen's worth.
- **Detail is grown, not stored.** The paper's fibers and the room's grain come from the key, so any spot can be grown finer the moment attention arrives, the same for everyone who looks there.
- **Below the law's cell:** the law's facts have one grain. Finer detail the eye sees beyond it (fibers within a cell, the texture of a bead's surface) is grown from the key for display only. It is scene, never facts.
- **Seeing more never changes what happened.** The ink settles by the law whether anyone zooms or not. Zooming in reads more of what is already true there.

### 3.6 Never recorded

The zoom depth, the eye's viewpoint and where attention is all live only in your own moment, like the eye's pupil and adaptation (rooms.md §4). Others see your head turned toward the desk, not how closely you are looking.

---

## Phases

Each phase ends usable and tested, and builds only on phases before it.

1. **The keys and the mouse:** WASD, jump, fly, Shift, the mouse on the head, the mouse on the pen at a sheet. **Test:** walk, jump and land; fly and lower; sit and write without touching anything else; others see the same body move.
2. **The zoom:** scroll toward the cursor, body fixed, depth at every distance, writing while zoomed. **Test:** scroll from the room to a single bead and back in a handful of steps; the body's motion acts do not change while scrolling; a frame at deep zoom costs about the same as one pulled back; zoom depth appears in no request and no `.book`.
3. **The free-drop test and the string:** direction fairness in the ink law; a weight on a string swings and settles. **Test:** §1.3.
4. **The outside:** dirt, stones and trees grown on the fly from the world's seed, one shared space with the houses in it; the door and window open to it. **Test:** the same seed grows the same trees for everyone; with door and window closed nothing outside loads and the candles light; opening either loads only what is seen through it; leaving and returning shows the same ground.
5. **The hands:** pick up, let go, break a branch, carve a stick, carve into a tree. **Test:** a broken branch stays broken for everyone and after return; carving with a soft stone on hard wood removes nothing; the same carving acts regrow the same stick on every machine.
6. **Outside meets the house:** dip a carved stick in the jar, press an inked leaf with a stone, press bark into warm wax. **Test:** each leaves a mark that regrows exactly; the jar never runs out.

## Cost

- The outside grows only where the senses reach; a forest out of view is free, and with door and window closed none of it loads.
- Breaking and carving are facts only where they happen, like ink: only the touched matter computes.
- The zoom costs one screen's worth at any depth.

## Needs Tabor's ruling

- How attention moves from the head to the hand: a held mouse button, being at a sheet with a pen, or something else.
- Picking up: which input reaches for the thing under the eye's center, and which lets go.
- Whether WASD while zoomed walks the body and keeps the eye where it is, or brings attention back to the head first.
- Height exaggeration's default once the zoom is in: keep about 20×, or 1× with the true relief seen up close.
- Whether a carved stick gets its own nib law (its tip shape and how it holds ink) or keeps standing in as the closest nib for now.
- Whether this layer's law additions (direction fairness, breaking, carving, strings) go in v3 with the rooms additions or a separate version.