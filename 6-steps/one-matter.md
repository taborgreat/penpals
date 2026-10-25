# One matter: everything interacts with everything

For a fresh agent, after the three in-flight branches are merged. This doc stands alone: read it and the code, nothing else. Where an older doc disagrees, this one wins.

## The problem

The world grew out of a pen-and-paper site, and that history is still in the code. The pen writes only on a sheet, ink stops at the paper's edge, and the ink law only knows paper. Scrape through the paper and nothing happens to the table under it. Other matter has its own special cases (wax resist, torn paper, timers for drips).

But the ink law already has almost everything the world needs: flow, splatter, soaking, beading, drying, scratching. A river carving the earth is the same flow as ink across paper; dirt is paper with different properties. So the work is to make the ink law the one law for all matter, then put everything on it.

## The primitives (for this doc)

- **One law for all matter.** Acts in, facts out. Every substance is the same kind of thing (cells at one grain) and differs only by its properties.
- **Anything can meet anything.** There are no sheets and no boundaries between kinds of matter. Ink is matter; it goes onto whatever it touches. A nib, a stone or a hand acts on whatever matter is under it.
- **Matter is never deleted.** Removed matter becomes loose matter (shavings, fluff, ash, smoke) that falls until it rests or rises if lighter.
- **Only changing matter computes.** Cold, dry, still cells sleep.
- **The same at every scale.** Ink channeling through paper and a river carving a mountainside are one law. Cells are grown at the detail the eye can see where it is looking: a mountain from far away is few big cells; one drop of the river up close is many small ones. Cost follows what is seen and what is changing, never the size of the thing. A coarse cell holds exactly the sum of the fine cells it stands for, so zooming in or out never changes what happened.
- **The ink law is the asset.** It already works. Lift it and generalize it; do not rewrite it. Every paper golden stays byte-identical through every phase.
- **The factory shape.** Every change is: an act (a being does something) → the law (rules and when/thens) → facts on the chain → the fold the senses show. Input handlers only make acts. No listener, timer or interval changes the world.
- **The one rule about numbers.** Properties of matter live in one table (what it is). Amounts, rates, angles and durations of behavior are never written in code; they come from the properties, the rules and the acts. If you need one, derive it or list it as NEEDS RULING.

## Order

Each phase ends green, is committed, and is reported before the next starts. After each edit, run only the tests for the files you touched; run the full suite once per phase; re-record goldens only when a phase changes the law, once, saying which.

### Phase 0: audit (no code changes)

List every place matter is special-cased:
- sheet boundaries (where ink, scratching or the nib stop at a sheet's edge)
- paper-only constants in the ink law
- special cases for one substance (wax resist, the torn flag, the drip constant)
- timers, intervals and listeners that change the world
- behavior constants (amounts, rates, angles, durations)
- matter that is drawn but has no cells (objects, candles, holders)

Report the list with file and line. This list is the work.

### Phase 1: one matter table

- Move every property the ink law uses (how much a cell holds, how fast it drinks, how it swells, its fibers, roughness, hardness) into one table with a row per substance.
- **Rows:** air, water, ink, paper, wood, wax, plaster, metal, stone, dirt, clay, grass, ash.
- **Heat properties in the same rows:** melts at, ignites at, boils at, how much heat it holds, how fast it passes heat (approximate real values: wax melts ~60 °C, paper ignites ~230 °C, wood ~300 °C, metal melts ~900 °C, stone ~1200 °C; water 0 / 100 °C; plaster, metal and stone do not burn).
- Paper's row is exactly today's numbers.

**Test:** every existing paper golden is byte-identical.

### Phase 2: cells everywhere

- Every surface and object is cells at the one grain, with thickness: the table's boards, the floor, the walls, a pen's body, a holder, a candle.
- **Matter stacks:** a sheet lying on the table is paper cells over wood cells. Each cell knows what is under it.
- A sheet is no longer a kind of thing. A piece of paper keeps what made it provable (its id, its seed from its owner's key, its acts on the chain), so seals and proofs are unchanged.

**Test:** zoomed in, the table, a holder and a candle all show their own cells; a sheet on the table sits on the table's cells.

### Phase 3: ink on anything

- The nib puts ink on whatever matter it touches. Write off the paper's edge and the line continues onto the table, where wood drinks it by wood's row (slowly, along the grain).
- Wax drinks nothing, so ink beads off it (wax resist as a property, not a special case). Metal drinks nothing, so ink sits on top and dries there. Plaster drinks fast.

**Test:** one stroke across paper onto the table settles by each matter's row on each side of the edge; the same stroke on paper, wood, plaster, wax and metal settles five ways, the same on every machine; ink on wax beads off with the special case removed.

### Phase 4: removing matter

- Scraping, carving and scratching remove cells where the tool is harder than the matter, as much as the pressure and the hardness give.
- **Removed matter becomes loose matter:** paper fluff, wood shavings, stone dust, sized by how hard and how far you scraped. It falls until it rests and can be picked up or blown.
- Scrape through the paper and you reach the table: the nib starts cutting wood and wood shavings appear.

**Test:** a hard scrape through paper tears it, then dents the table and leaves wood shavings; a light scrape leaves only paper fluff; the mass of loose matter equals the mass removed.

### Phase 5: heat, phase and fire for everything

- **Heat:** matter holds heat, passes it to its neighbors, gains it from absorbed light and burning, loses it to the air.
- **Phase:** crossing a threshold melts, boils, freezes or hardens it.
- **Fire is a release loop:** past ignition, burnable matter breaks apart, releasing heat, light and smoke and leaving char and ash, until it runs out.
- If a heat rule already exists for wax, generalize it to every row. Nothing in this phase names a substance.
- The candle's pool, its drips and its burning are this phase applied to wax: the pool is the wax past its melting heat; a drip is whatever liquid crosses the rim when tilted; burnt wax leaves as smoke.

**Test:** wax melts and hardens, paper chars and burns, metal melts only past its point; mass is conserved (burnt + dripped + remaining wax = the new candle).

### Phase 6: water and dirt

- Water is the same flow as ink. Dirt is a row like paper: it drinks water and holds it.
- **Water carries loose grains** where it moves fast and drops them where it slows. So running water cuts channels and builds banks: a river carves the earth by the same law as ink across paper.
- Splatter is the same splatter: a drop hitting dirt throws grains as ink throws drops.

**Test:** water poured on a slope of dirt cuts a channel and leaves a fan where it slows; the same pour gives the same channel on every machine.

### Phase 7: a tree grows

A tree is grown, not modeled: every bit of wood is laid down as a fact when it grows, so a tree cut in half shows its whole history.
- **Sprouting:** a gall seed under dirt starts when it has enough water and warmth (a threshold). Until then it is dormant.
- **Fuel:** leaves drink light (from the light system), roots drink water from the dirt. Growth turns fuel into wood.
- **Two places grow:** the tips push out (shoots toward light, roots toward water), and the living skin under the bark adds a layer of wood all around on every growing day. The bark is pushed outward and cracks into furrows where the push passes its strength.
- **Seasons come from the sun:** the world clock moves the sun along its yearly path, so day length, sun height and warmth change by date. Fast pale wood in spring, dense dark wood in late summer, none in winter: a ring. A dry or shaded year leaves a thin ring.
- **Branches:** after a length of growth a tip leaves a bud; buds in light grow, buds in shade starve and die. A young tree's leading tip dominates; as it ages the dominance relaxes, the lower shaded branches die, and the crown spreads. The deciduous shape comes from that balance changing; nobody draws it.
- **Knots:** a branch starts at the trunk's surface in the year it sprouts; later rings bury its base, so a cut shows knots where branches were.
- **Autumn:** leaves drop, fall until they rest, and break down into dirt.
- **Tree kinds** are properties in the table (how strongly the leader dominates, branch angle, growth rate, ring contrast, how the bark cracks), not behavior constants.
- **Cheap:** the tree steps once per day of fuel; unwatched, it replays in one step when someone comes back. Its facts are one thin shell of wood per season plus one per branch start: a hundred-year tree is a few hundred facts. A cut is read from those shells.

**Test:** plant a gall seed in dirt and water it, simulate 100 years, cut the trunk: rings, one per year, thinner in dry years, with knots where branches grew; the same seed, place and water grow the same tree on every machine; the young tree and the old tree have different shapes without any shape code.

### Phase 8: the proof

- **The factory-shape check:** for every world-changing code path, name its act and its rule. Any path with neither is wrong; fix it.
- **The house-fire test:** knock the lit candle over, nothing else. Everything that follows comes only from the table and the rules: no fire code, no burn timer, no special case. If the heat where the metal holder sits passed metal's melting point, it is a cooled puddle where it flowed; if not, it is still a holder. Either result passes; report the highest heat it reached. Nothing is tuned to make it melt.

## Needs Tabor's ruling (list, don't decide)

Anything a phase needs that the table and the rules do not give.
