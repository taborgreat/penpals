# Rooms: your profile is your space

Layer 3 of 5. For another agent, after layers 1 and 2 are green and one page writes smoothly in the lit room.

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

A person's profile becomes their room. You enter their space: their walls carry their writing, their shelf holds their books, and if they let you, you write there together. Nothing here is new physics. A wall is a sheet, a book on the shelf is a `.book`, and writing together is several people's acts on one chain.

## The rules of this layer

- **A room is a space.** It wakes when someone enters and sleeps when the last person leaves.
- **Every surface is a sheet:** the table top, the walls, the floor, the ceiling. Same law, same seeds, same seals as a page.
- **The seal proves who wrote it; the surface shows where.**
- **Permission is possession.** There is one physical copy of every sheet. Where it lies and whose seal is pressed into wax on it decide who may write. There are no permission lists.

---

## 1. The room is the profile

- `/u/<name>` opens their room, seated at their table, facing their page. The journal (books-and-journal.md) is the page on the table and the walls.
- **Every room has the same shape** (light-waves §4: shared geometry and form factors), and **each person's surfaces are grown from their own key**, so no two rooms look alike. Nothing about the surfaces is stored except what has been done to them.
- **Storage reuses the book:**
  - `skeleton.json` gains `surfaces`: each wall, the floor, the ceiling and the table top as a page with a `matter` (plaster, wood) and a size.
  - Marks on a surface are ink lines in the same `ink.chain`, placed on that surface page.
  - The shelf (which books, in what order) and doors (links, as books-and-journal.md defines them).
- The `.book` download carries the surfaces like any other pages.
## 1a. The front door: the lobby

The whole site is the world. There is no separate sign-up page.
- **The lobby:** a general room everyone sees (the same shape, its surfaces grown from a fixed public seed). It is seen in black and white: luminance only, no color.
- **You arrive seated,** eyes fixed on a blank sheet on the table. You cannot look around yet.
- **Registering happens on that paper:** sign your name three times (the paper is zoomed in, so you feel the ink); your key is made from those signatures plus the device's randomness, and the last one becomes sheet 0, your signature. Then a username, your 24 words and private key, and an optional backup password (accounts-change.md).
- **Signing in** happens at the same desk: your username, then your password, your 24 words, or your private key. No writing is needed to sign in.
- **The moment it is done, the eye closes:** the lids come down and the view goes dark.
- **It opens in your room:** your space, its surfaces grown from your key. Color comes in as the eye adapts (the eye's own flare and settling from dark to light, light-waves §7). You can look up for the first time.
- Scene only: the lobby, the lids and the color coming in never touch the record.

## 1b. Each space keeps its own time; light is the clock

- **A space's time** is a fact of the space: its owner's time zone, taken from their machine when the room is made, changeable by an act. Everyone in a room sees that room's sun and sky (light-waves' sun, placed by the space's clock instead of the viewer's).
- **Joined rooms:** each room's window is lit by its own sun. Day in one and night in the other is fine: daylight pours through one window and spills into the other's dark across an open join. The bounce solve over both rooms already does this.
- **Light reacts only when a being is there.** Sunlight comes into a room only while a being is in it; with no one there, nothing reacts. At night the candles light whenever a being is in the room and go out when the last one leaves.
- **Candles last across nights:** each candle's lit time is the total time beings spent in the room at night, read from their enter and leave acts and the space's clock. It burns down over many visits; when spent, a new one replaces it.
- **Light is the clock for aging.** Oak gall darkens by the light its space has received (sun by day, candles by night), so only by time a being was there. An empty room, day or night, is a tomb: its ink rests unchanged. So is a closed book or a sealed letter. Computed in one step at view time from the being's enter and leave acts and the space's clock.
- Until this layer, aging keeps calendar age and the sun keeps the viewer's local clock.

## 2. Surfaces are sheets

- **Each surface has a sheet id and a seed** exactly like a page (keys.md: `sign(sk, T("paper") ‖ sheet)`), so writing on your own wall verifies exactly like your paper.
- **Plaster and wood are paper families**, with the same law fields and the wet front (cleanup §2): plaster is well sized (ink beads and spreads before it sinks); wood drinks along its grain.
- **One grain everywhere:** walls, floor, ceiling, table, pens, jar, candles, stamper and paper are all the same stuff at the paper's grain, each surface grown from the owner's key, plus its facts (writing, wax). Unwritten surface is grown on the fly and stored nowhere.
- **Light:** ink on a surface changes that patch's absorption; light-waves' bounce solver takes absorption as input, so the room's light updates when the ink does (a dark red wall warms and dims the room by candlelight).
- **Writing on a surface:** from fly mode, pen pointed at it: the same ray capture as 3D writing, onto that surface's plane, with the minimum angle measured from the surface's normal.

## 3. The shelf and doors

- **Books on the shelf** are the owner's `.book`s. Pull one down and it opens in front of you to flip through, rendered by the same sheet machinery.
- **Doors:** any written word made into a button can lead to another page, another surface, or another person's room. Following one into someone's room is entering their space.

## 3b. Holding things: candles and wax

- **Candles stand in small holders** with a dish at the base, so they stay exactly upright wherever they are set: on the table, on a shelf, on the paper.
- **Picking up and moving** a candle is a move act, like moving a table. You can carry it and set it down anywhere; anything let go of falls until it rests.
- **Tilting:** while holding a candle, hold **E** and the mouse tilts the candle instead of turning the head. Tilting is a coarse act, like the head's motion.
- **The melt pool is the heat rule:** the flame's heat flows into the wax around the wick, and wax above its melting threshold is liquid. When the flame goes out, the heat flows away to the air, the wax drops below its threshold and hardens. Every act settles: it cools even after you leave, so the next day it is solid (computed in one step from elapsed time on return).
- **Dripping:** liquid wax drips from the rim when the candle is tilted past the pool's lip, more when it is very liquid and tilted far. A drip falls straight down until it rests on the first surface below:
  - in the holder's dish, collecting into a reservoir of wax
  - on the table, where drips collect for good (cleaning the table comes later)
  - on the paper, where it stays
- **Drips are facts.** Where and how much wax lands comes from the law (pool state, tilt, position), so drips are reactions on the sheet they land on, regrown like ink and sealed with it.
- **Law addition (wax on sheets):** a cell can hold wax: it sits on top, does not soak in, and repels water-based ink (wax resist: ink beads off it). Version it with the other layer-3 law changes (v3) and give it goldens.
- Burnt wax still leaves as smoke (world.md); dripped wax is the part that did not burn.

**The stamper** (the second thing on the table):
- Picked up and moved like a candle (a move act).
- While holding it, type a username: the stamper's face takes that person's signature, in relief, made from their public signature (sheet 0 strokes and heights).
- **Pressing it** into wax on a sheet is an act. The face's relief is pressed into the wax as a dent field, at whatever angle and pressure the stamper is held; a tilted press leaves a partial, deeper-on-one-side mark.
- **The wax must be warm:** drip wax onto the paper and press while it is still above its softening threshold. Below it, the wax takes no impression. As the wax cools, the impression is fixed.

## 3c. Pens and the ink jar

Everything on the table is made of the same stuff as the ink and the paper: matter, at the paper's fine grain, running the same law.
- **A basic pen:** a simple rectangular body (Tabor will model a better one later). Its surfaces are sheets like any other, so you can write on the pen itself.
- **The nib is two tines:** two separate pieces of matter at the tip. Pressing spreads them apart, driven by the same pressure in the acts that drives the ink's width, so the nib you see opening is the line you get.
- **Picking up and setting down** pens is a move act; the held pen is the one you write with.
- **The ink jar:** glass and oak gall ink, both matter. The ink inside is liquid under the same law (surface and level).
- **Dipping:** lower the nib into the jar (an act) and ink is drawn into the nib's reservoir. A dip pen's line fades as the reservoir empties, until you dip again. A fountain pen keeps its own supply and never runs dry. **Law addition:** a nib reservoir that writing draws down and dipping refills (v3, with the other layer-3 law changes).
- **Hands, not arms:** the being shows a floating hand holding whatever it holds, at the head's position, for itself and for others.

## 4. Who is here: the being

- **The body is simple:** a ball with a head and two hands. No full figure to animate.
- **It can change size,** from human scale down to the size of a bead of ink. Its speed and its neck law scale with it.
- **Walking:** gravity holds the being to the surface under it, and it moves along it. At small size the surface is the page's facts: dents are canyons, dried beads are hills, ridges are walls to climb around. Wet ink is not ground: the being stays on top of solid surfaces.
- **Flying:** gravity off; move freely anywhere (light-waves §9).
- **Writing** happens from the seat, at human size.
- **Each person in a room is one being:** a body and a head. WASD and flying move the body; the mouse turns the head. The eye (light-waves §7) and the ear (world.md) are on the head, so they see and hear where it faces. There is no separate camera, listener or cursor.
- **The head is one thing with two faces.** For you, it is the camera: position and rotation, and you see from inside it. For everyone else, it is a physical head (a simple form, with the pen it holds and its signature beside it) that actually moves and turns in the room. Same position, same rotation, same acts.
- **The neck law:** the head turns freely within a range of the body: up to 70° left or right, 80° up or down. Turn past 70° and the body turns with it, dragged along so the head never goes past the limit. A small look is just the head; a big turn swings the whole body. While flying, the body follows the head's heading. A law of the being's matter, applied by the same acts, so everyone sees the same twist.
- **Its motion is acts**, the same kind as pen acts (an act changing matter): entering and leaving a room, sitting at a table or getting up to fly, the body moving, and the head turning.
  - **Coarse:** a motion act is recorded only when the being has moved more than a step (default 5 cm) or turned more than an angle (default 5°), at most 5 a second.
  - **Small:** delta-encoded like strokes (position and heading deltas, time), a few bytes each.
  - **Smooth for others:** each client draws the being gliding between its motion acts, so others see you look around and move without every tiny movement being sent.
- **Never recorded:** the eye's own state (pupil, adaptation) and motion below the step and angle.
- **Who can enter** follows the existing profile privacy and block rules.

## 5. Permission is possession

Every sheet exists as **one physical copy**: one chain, in one place at a time. There are two ways to write on someone else's sheet:

**It lies on your table.**
- The owner puts one of their sheets on your table: a move act, signed by the owner.
- While it lies there, you can write on it.
- The owner picks it back up (another move act), and your writing stops. What you wrote stays: it is ink on their chain.
- Your own sheets are always yours to write on, wherever your table is.

**Their seal is pressed into wax on it.**
- The sheet's owner drips warm wax onto the sheet and presses the stamper, set to the other person's signature, into it (§3b). That press is an act on the sheet's chain, signed by the owner, naming the other person's key.
- **It counts only if it took:** the law decides whether the wax was soft enough and the press deep enough to leave the signature's impression. A press into cold wax, or too faint, grants nothing.
- While the sheet lies on the owner's table, everyone whose seal is pressed into it, unbroken, may write on it.
- To revoke, the owner breaks the seal (an act): the wax cracks across the impression, and that person can no longer write.

**One copy, many hands.** Two writers or a hundred: one sheet, all the ink on it, in the stamper's order (§6). It cannot be duplicated: its surface grows only from the owner's key.

**Checked everywhere:**
- The stamper accepts a writer's act only if, at that point in the sheet's chain, the sheet lies on that writer's table, or the writer's seal is pressed into wax on it, took, and is unbroken, while it lies on the owner's table.
- A verifier replays the same rule from the chain.

## 6. Writing together

**The back end is a stamper.** One story, one stamper, no cross-signing:
1. An act arrives, sealed by its writer.
2. Check the permission facts on the sheet's chain (§5): is the sheet on this writer's table, or their seal pressed into wax, taken and unbroken?
3. Give it the next position, append it, and send it to everyone in the room.

Permission is facts landing: a move or a stamp lands, a pick-up or a broken seal lands. The check reads the latest.

- **Each mark is sealed by its writer;** the surface is the owner's.
- **The screen:**
  - Your own ink shows at once, before the stamper answers.
  - Others' acts appear as they arrive.
  - Ink mixing depends on order, so if two people write into the same wet spot within the same moment and the stamper ordered them differently than your screen guessed, your screen redoes those last moments in the stamper's order (from the undo snapshots).
  - This is a rare display correction; the facts are always the stamper's.
- **Inks mix across writers** where both are wet: one sheet.
- **Timeout:** an act not stamped within 8 seconds (a lag spike) is dropped from your screen: its ink is lifted locally, and you are told so you can rewrite it.

### Undo on a shared sheet: lift, don't rewind

On a shared sheet, undo never rewinds history. It is a forward act, **lift my stroke**, stamped like any other:
- **Removed:** that stroke's pigment, wherever it went (wet or settled, including what mixed into others' ink).
- **Kept:**
  - the water it brought, and the soak and swelling it left in the paper
  - dents and wear from the nib
  - how it pushed the other writer's ink
  - everyone's time (nothing replays)

Red and blue mix to purple; the red writer lifts their stroke; it goes back to blue, but the blue is still pushed out and blotched where the purple was, like lifting a wash with a damp brush.

**Law addition (shared sheets only):** each cell keeps a separate pigment amount per undoable stroke, for the last few strokes per writer (default 8). When a stroke leaves that window, its pigment merges into the cell's common pigment and can no longer be lifted. Appearance always uses the sum. This is a law change: version it (v3) and give it goldens.

Solo drafts keep today's undo: a full rewind from the snapshot, since no one else's ink is involved.
- **When the last person leaves,** the room settles (wet ink dries out in recorded time) and sleeps.

## 7. Joining spaces (replaced)

Replaced by one-world.md: houses stand near each other in one shared outside and people walk to each other's houses. There are no join acts.

## 8. Load by the senses

- **Surfaces** load only where the eye looks: an unseen wall loads nothing; a seen wall is grown in the shader and loads its marks as looks; a wall you fly up to loads its scene field and cells.
- **Shelf books** load their covers only; pages load when opened.
- **Through a door:** the other room loads when you step through (or, for a wall-down join, as its chunks come into view).
- **Other writers' acts** always arrive (they are tiny) and every sheet settles: the stamper settles each shared sheet to completion (it holds the record). A client with the sheet out of view does not draw it; when it comes into view, it loads the settled result.
- **Sound** of other writers follows the ear's range (world.md), not the eye's.

## 9. Cost

- An idle room: shared geometry and form factors (cached), surfaces grown in the shader, plus the owner's settled marks as looks and heights.
- Live cost: wet ink only, across all writers.
- Wire: acts only (ink and the beings' coarse motion acts).

## 10. Phases

1. **Your room:** the lobby and the eye opening into your room; the room as profile; the owner writes on the table page, walls and floor; surfaces in the book; the shelf.
2. **Visiting:** others enter, read the walls, open books, follow doors.
3. **Together:** beings in the room, possession (move acts), the stamper for shared sheets, ink mixing across writers.
4. **Seals and joins:** the stamper and wax seals (pressed, taken, broken); joining (wall down or door); furniture across; unjoin.

## Tests

- **Surface = sheet:** a stroke on a wall regrows byte-identically from its acts and the owner's surface seed, and verifies like paper.
- **Cost:** a stroke on a large wall costs the same per tick as on paper.
- **Gravity:** a drip lands on the first surface straight below it; a dropped pen rests on what is under it; a walking being stays on the surface it is on, including down in a dent's canyon at small size.
- **Pens:** pressing spreads the two tines in step with the line's width; a dip pen's line fades as its reservoir empties and recovers after a dip; writing on the pen's body leaves ink like any sheet.
- **Wax:** a tilted, hot candle drips onto the paper and the wax stays; ink written over it beads off; a candle left after the flame goes out is solid when the room is re-entered the next day; drips on the table remain.
- **Lift:** red and blue mixed to purple; lifting red leaves blue with the same displacement, soak and dents as before the lift, and no red pigment anywhere; the other writer's strokes are unchanged in time.
- **Undo window:** a stroke older than the window cannot be lifted; its pigment has merged.
- **Timeout:** an act unstamped after 8 seconds is withdrawn locally and the writer is told.
- **Order:** two clients writing into the same wet spot with different network delays both end byte-identical to the stamper's order.
- **Possession:** an act on a sheet that is neither on the writer's table nor carries their unbroken seal is rejected by the server and fails verification. After the owner picks the sheet up, the visitor's next act is rejected.
- **Seals:** a seal pressed into warm wax admits that key while the sheet is on the owner's table; a press into cold wax admits no one; after it is broken, that key is rejected; the impression and the crack render on the paper.
- **One copy:** a sheet is always on exactly one table; only its owner signs its moves.
- **Join:** joined rooms render and light as one. Unjoin returns every table and sheet home, including a table its owner never moved back.
- **Sleep:** an empty room does no work; re-entering shows the settled walls.
- **Neck law:** the head never exceeds 70° from the body's heading or 80° up or down; turning past it turns the body by exactly the excess.
- **The being:** motion acts appear only past the step or angle threshold and at most 5 a second; others see smooth motion between them; the eye's state never appears in any record or the `.book`.

## Needs Tabor's ruling

- Can the owner hide a visitor's mark from their room? (The acts stay in the chain.)
- How many people in a room at once.
- Joining: both owners' consent every time, or friends join freely once allowed.
- Which books stand on the shelf by default.
- How fast the melt pool forms and cools, and how far a candle must tilt to drip.
- When a candle is spent: replaced automatically (default), or a being places a new one (an act).
- Undo window on shared sheets (default the last 8 strokes per writer) and the stamp timeout (default 8 seconds).