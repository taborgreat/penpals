# Matter: the basic substances of our world

For every agent. This is the package of what our world is made of. It is a short list on purpose: the basics we have decided, the way a world starts with a few elements. New substances come later as new words and new when/thens, added as the story grows. Nobody expects the whole story to be perfect at once.

## The one rule about numbers

There are two kinds of numbers, and only one is allowed in code:
- **Properties of matter** live in one table (below): at what heat it melts, burns or boils, how much heat it holds, how fast it passes heat on, how heavy it is, what it becomes. These are what the matter *is*.
- **Amounts, rates and angles for behavior** (a drip size, a burn time, a lip angle, a melt speed, a fire duration) are **not allowed**. They are always the result of the properties, the rules and the acts.

If code needs a behavior number, it is derived from the table, or it is listed as NEEDS RULING. Nothing is tuned to make a result look right.

## The rules (the same for everything)

Every substance obeys the same few rules. No substance has its own system.
- **Heat:** matter holds heat, passes it to its neighbors, gains it from absorbed light and from burning, and loses it to the air.
- **Phase:** when a matter's heat crosses one of its thresholds it changes: solid to liquid (melts), liquid to gas (boils), and back as it cools.
- **Fire is a release loop:** past its ignition heat, a burnable matter breaks apart, releasing heat, light and smoke, and leaving what it becomes (ash, char), until it runs out. The heat it releases heats its neighbors, which may then cross their own thresholds.
- **Everything falls until it rests,** unless held, flying, or lighter than what surrounds it: liquid metal pools, hot smoke rises, ash settles.
- **Flow:** liquids and gases move by the same flow law as ink and water.
- **Color is what matter refuses to drink.** Each substance has its absorption curve.

## The substances

Approximate real values. This table is the only place these numbers live.

| Substance | Melts | Burns (ignites) | Boils | Becomes | Notes |
|---|---|---|---|---|---|
| **Air** | – | – | – | – | carries heat and smoke; feeds fire |
| **Water** | 0 °C | – | 100 °C | steam | ink's carrier |
| **Wax** | ~60 °C | ~250 °C (its vapor) | ~370 °C | smoke | the candle's body and fuel |
| **Wood** | – | ~300 °C | – | char, then ash; smoke | table, floor, shelf, sticks, trees |
| **Paper** | – | ~230 °C | – | ash; smoke | sheets |
| **Plaster** | – | does not burn | – | cracks and crumbles when very hot | walls |
| **Metal** | ~900 °C | does not burn | – | liquid metal, then solid again | one metal for now (the candle holder, the nib); found in rocks |
| **Stone** | ~1200 °C | does not burn | – | – | rocks; holds metal |
| **Ink** | – | – | its water at 100 °C | what is left chars | water plus oak gall and iron |
| **Smoke** | – | – | – | – | thin, hot matter; scatters light; rises, cools, thins |
| **Ash / char** | – | char burns again | – | ash | what fire leaves |
| **Fire** | – | – | – | – | not a substance: the release loop happening in burnable matter |

"Brass" becomes **metal**. There is one metal until the story needs another.

## Volume

Today the room's matter is surfaces: walls and the table are grids of cells with no depth. To burn, a wall needs something to burn through, so surfaces get a thickness in cells (the table's boards, the floor's planks, the wall's plaster). Only cells that are hot or changing compute (the sleep rule), so a cold house costs nothing.

## The test: start the house on fire

This is the test that everything is one system. Say it exactly this way; it must not be read as a target to hit.

**The act:** knock the lit candle over onto the floor or the table. Nothing else is done.

**What must be true:**
- Everything that follows comes only from the table and the rules. There is no fire code, no burn timer, no "house fire" state, and no special case for any substance.
- The candle's flame heats what it touches. If that matter crosses its ignition heat, it burns, releasing heat that heats its neighbors. The fire spreads only as far as the rules carry it.
- Smoke rises and fills the room by the air rule. Burnt matter becomes char and ash and falls where it is.
- When it settles, everything is a fact: what burned, what is left, where the ash lies, what melted.
- **The metal holder:** if the heat where it sits passed metal's melting point, it is a puddle of metal that has cooled solid, lying where it flowed. If the heat never got that high, it is still a holder. **Either result passes**, as long as it came from the rules. Do not tune anything to make it melt. Report the highest heat it reached.
- Replaying the same acts gives the same fire, the same ash and the same metal on every machine.

**What fails it:** any code that names fire, a house, a candle falling, or a substance in a special case; any fixed duration, spread speed or amount.

If the fire does not spread where it should, or the metal does not melt when the heat says it should, the fix is in the table or the rules, never in a special case.

## Where this sits

- matter-fixes.md §1–2 (the heat rule, wax) are the first part of this.
- The room's air and smoke are world.md Phase 3b.
- Surface thickness and the fire test come after the three branches merge, as the last check before tagging.
