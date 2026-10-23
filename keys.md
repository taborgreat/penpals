# Living Ink

Ink that acts. Paper that reacts. Marks that are facts. The writing everyone sees is the public face; the records behind it belong to the writer.

Pen-pal site, idea doc. Three factors to get right, in order.

---

## The idea in one pass

Today a stroke is a line: points joined and painted black. Here a stroke is a run of **acts**. Each sampled point of the pen is an act that releases a little ink onto a sheet of **paper**. The paper is **matter** with its own state (fibers, absorbency, roughness). The ink **reacts** with the paper: it spreads along fibers, pools where the pen dwelt, starves where it flew, dries. What settles is the **fact**: the mark.

The look of the writing is never drawn directly. It emerges from millions of tiny interactions between the writer's acts and the paper. Same letter, same lines, different ink every time, unless you have what the writer has.

Three records stand behind every mark:

| Record | What it is | Who can see it |
|---|---|---|
| **Stroke facts** (acts) | position, time, pressure of every pen sample | public, in the `.book`, shown by playback |
| **Paper facts** (matter) | the sheet's fiber map, absorbency, roughness, cell by cell | **only the writer** (it is made from their key) |
| **Ink facts** | where every bit of ink flowed and settled, and which acts caused it | derivable only by whoever has both of the above |

The **look** is the ink facts rendered. Everyone sees the look. The records behind it are not perceivable from the look. That is the whole design.

---

## What this is, and exactly what is new

**What we did:** handwriting verified digitally. One mark now carries two proofs at once.

- **The strokes verify the hand.** That is what a bank does when it compares your signature to the card on file: the person's own motion.
- **The ink verifies the key.** That is what a bank does when you log in: a secret only you hold.

Those two have always been separate. A wet-ink signature was proof of the person but forgeable; a key was unforgeable but had nothing to do with the person. Here the look is the writer's own motion, and the way the ink settled into the paper can only come from their key. The same mark is both.

**Why it holds:** nothing is stored, so nothing can be stolen or altered. Strokes + sheet seed + the fixed rules of flow regrow the exact marks, byte for byte. Match, and it is theirs. The paper is the only secret, and it can be regrown forever by one person.

**What is not new:** a real wet-ink signature was always a record of acts meeting matter (fibers, dwell, pressure), and forensics reads that record under a microscope. What is new is that the record is regenerable instead of examined, and the matter is tied to the person. The paper is grown from their key.

### Plain words for the pieces

| Term | What it is |
|---|---|
| **keypair** | two matching numbers. The **private key** is a stamp only you own; the **public key** is its imprint, which everyone can see. You can check an imprint came from the stamp; you cannot carve the stamp from the imprint. |
| **signature** | the stamp pressed on one specific message. Different message, different squiggle. Anyone with the public key can check it; nobody can make it without the stamp. Same stamp on the same message always gives the exact same squiggle (Ed25519 is deterministic). |
| **sheet** | one piece of paper, numbered. Every letter or page gets its own. |
| **sheet seed** | the stamp pressed on the words `"paper" ‖ sheet_id`. It is just a signature with the sheet number as the message. Only the writer can make it, and they can make it again any time, identically. |
| **paper** | grown from the seed: feed the seed and each spot's coordinates into a hash, out comes that spot's fibers, thirst, roughness. One seed grows the whole sheet. Nothing is saved. |
| **look** | the settled ink, rendered. Public. |
| **open sheet** | a sheet whose seed the writer has chosen to publish, so anyone can verify it offline. |

---

## Factor one: ink, paper, and the rules of flow

Goal: low data, cheap to compute, deterministic, and it must not look like shit. The way to get all four at once is **atoms**: a few local rules, repeated many times. Complexity comes from repetition, not from the rules.

### Paper is a function, not a file

The paper is never stored. Every cell's state is computed on demand from a seed and its coordinates:

```
cell(x, y) = H(seed, x, y)        # one hash gives the cell's bytes
```

From that hash the cell gets:

| Field | Bits | Meaning |
|---|---|---|
| fiber direction | 4 | one of 16 angles; ink flows easier along it |
| capacity | 4 | how much ink the cell can hold before it overflows |
| roughness | 4 | height; ink runs downhill into low cells |
| sizing | 4 | how fast the cell drinks (absorbs) wet ink |

Two bytes per cell, and zero bytes on disk. A whole sheet costs one seed.

Low-frequency character (grain direction that drifts across the sheet, a slightly thirstier patch) comes from mixing a smoothed noise of the same seed into the per-cell hash, so the paper looks like paper and not like static.

### Ink lives in two numbers per cell, times three for color

```
wet[x,y]    ink that can still move
fixed[x,y]  ink that has settled (pigment)   <- this is the fact
```

Each is three channels: how much red, green, and blue light the pigment absorbs. Six small integers per cell. That one choice gives shading and color mixing for free (see "Color is pigment" below).

`wet` is an amount, and an amount sitting on a cell has height. So the ink already has a surface, for free: **height = wet above the cell's capacity.** Nothing extra is stored.

### The four rules (the atoms)

Run on the cells near the pen, in this fixed order, a fixed number of times per act:

1. **Deposit.** An act puts ink into the cells under the nib. Amount = base × pressure. When pressure is missing, use dwell: slower pen = more ink (real ink does this anyway: a slow pen pools, a fast hairline starves). Nib: a small disc, or for copperplate a flex nib that widens with pressure on the downstroke.
2. **Flow.** Each cell pushes part of its wet ink to its neighbors. More goes along the fiber direction, more goes to lower (rougher) cells, nothing goes into a cell that is at capacity. The amount over capacity is what moves, **but only once it is over the hold.** Ink has surface tension: a cell can carry some surplus above capacity as a bead before it breaks and runs. Below the hold it stands; above it, it flows.
3. **Settle.** Each cell turns part of its wet ink into fixed, at the rate of its sizing. Settled ink does not move again.
4. **Dry.** Each cell loses a little wet ink to air. Once a region is dry it is finished, and the simulation stops touching it.

That is the entire physics. Feathering, pooling at turns, the dark dot where a stroke ends, the light hairline on the upstroke: all of it falls out of these four.

### Color is pigment, not paint

Ink is stored as **absorbance**: how much of each of red, green, and blue light it eats. Red ink eats green and blue. Blue ink eats red and green. The display is one formula, cell by cell:

```
shown = paper_color × exp(-(fixed + wet))      per channel, exp by lookup table (integers)
```

Everything color-related falls out of that:

- **Shading.** More of the same ink in a cell eats more light. A light pass is pale; a second pass over it is darker. A dwell is darkest. Thin ink (low flow) gives washes; heavy ink gives solid line. No separate shading system.
- **Mixing.** Wet ink flows by channel. Where red wet meets blue wet, the cells in between carry some of each and show purple. Nothing mixes "at once": the gradient spreads only as far as the wet ink flowed, so two colors laid down near each other bleed into one another across the touching region and stop where the ink dried. Three primaries laid close make long gradients through every color between.
- **Layering.** Dried ink does not flow, but new wet ink over it still stacks in the formula: both eat light. So writing over dry color darkens and tints, like a glaze, without bleeding into it.

Set the color (and the flow) **during** writing, not after. The acts carry the pen:

```
pen act    { set flow: 7 }        # scroll wheel, mid-stroke
pen act    { set color: #2b3a8c }
stroke act (x, y, t, p)           # uses the current pen
```

Pen changes are their own tiny acts in the stroke stream, so a sample only costs position, time, and pressure, and the pen state is exact at every point in playback. Changing flow or color mid-stroke is just more acts, more variation, same chain.

### Wet and dry: time, read from the record

Drying is time, but recorded time, never measured time. The acts already carry `t` for playback, so drying reads its clock from the chain:

- Between two acts, the ink dries by the gap between their timestamps, in fixed quanta (e.g. one dry step per 50 ms of recorded time), capped at fully dry.
- Between strokes, the same, using the gap from pen-up to the next pen-down.
- Play/done is an act with its own `t`; after it, everything dries to completion.

Deterministic, because anyone regrowing the marks reads the same `t` values from the `.book`. Physically honest, because a slow writer's next word lays over dry ink and glazes, while a fast writer's words are still wet and bleed into each other. Hesitation shows in the marks. The chase stays time-free (it moves with acts only); the ink reads time from the record. Two different things.

A finished piece is always shown fully dried. Wet ink is only seen in the live preview, and in playback if the physics is replayed.

### The droplet

Go fast: each cell gets one small deposit and the pen is gone. Thin, starved, light. Hold in one spot: deposit after deposit lands on the same cells. They fill to capacity, then bead up under the hold, standing as a real droplet with height, not a flat black spot. Keep holding and the bead passes the hold, breaks, and runs down the roughness and along the fibers. Then it dries: height falls, pigment settles, and because the edge dries first, the fixed ink is darkest in a ring around where the bead stood.

Rendering uses the height: a little shading and a highlight on the bead while it is wet, and the ring after. It is the same two numbers per cell; the surface is read, not stored. If the 3D look is too much for the first build, drop the shading and keep the hold rule anyway, because it is what makes a dwell pool instead of smear.

### Acts in, facts out

```
for each act (x, y, t, p) in stroke order:
    deposit(act)
    repeat K times:        # K fixed, e.g. 8
        flow()
        settle()
        dry()
after the last act of a stroke:
    repeat until no wet ink above threshold:
        flow(); settle(); dry()
```

Only cells inside a small radius of recent deposits are simulated (the wet front). Everything else is dry and untouched.

### Determinism rules (non-negotiable)

The same acts on the same paper must produce the exact same marks on any machine, forever. Otherwise nothing below works.

- **Integer math only** in the canonical simulation. Fixed-point, no floats. GPUs differ on float rounding; integers never differ.
- Fixed rule order, fixed `K`, fixed neighbor order, fixed nib tables. These are part of the format and get a version number.
- No random numbers anywhere. Any "randomness" is the paper, and the paper is a hash.
- A fast GPU path may be used for the live preview while writing, but the fact state is produced by the integer path. If they ever differ, the integer path is the truth.

### Cost

A letter's worth of writing is a few thousand cells on the wet front, times `K` steps, times a few thousand acts. That is tens of millions of tiny integer operations: well under a second on a phone's CPU, instant on a GPU. "Millions of acts, still small and fast" holds.

### What gets stored

Nothing new. The `.book` already holds the strokes. The look is re-derived from strokes + paper whenever it is needed. A rendered PNG may be cached, but it is disposable and rebuildable, same rule as any index. The ink facts are never written down; they are regenerated on demand, exactly, every time.

---

### There is no line thickness

Once ink is physics, "font size" and "line thickness" stop being settings. A thick line is a wide nib pushing a lot of ink; a thin one is a fine nib with little flow. So the pen settings are the pen, and nothing else:

| Setting | What it does |
|---|---|
| **nib width** | how many cells the nib covers |
| **flex** | how much the nib widens under pressure (copperplate swells on the downstroke) |
| **flow** | how much ink one act releases at base pressure |
| **ink** | color (pigment, as absorbance), and how fast it settles. Settable mid-stroke. |

Everything that used to be "thickness" is converted into these. A heavy line is high flow on a wide nib; it also bleeds more, pools more, and dries slower, because that is what heavy ink does. A light line is low flow on a fine nib. The same strokes under different pen settings are different writing, the way the same hand with a different pen is.

**Resizing on the profile.** The journal's `scale` scales the acts' positions. What happens to the pen is a ruling: either the nib and flow scale with the writing (a big word looks like the small word enlarged), or the pen stays fixed (a big word is written with the same nib, so it reads as fine-lined, like a large word written small-pen on real paper). Either way, the look is re-derived from the scaled acts, not stretched as a picture.

---

## Factor two: public face, private key

### The plain truth first

The look itself is not a cryptographic key. A picture can be copied. If the look were only `f(strokes, paper)` and both were public, anyone with the `.book` could re-run the physics and get the same look. There has to be one thing the writer holds that nobody else does.

That thing is already in the system: the writer's keypair. The design below binds the key to the ink so that **the handwriting is what the key looks like**.

### The paper comes from the key

Each sheet of paper is grown from a seed that only the writer can make:

```
sheet_seed = sign(private_key, "paper" || sheet_id)
paper      = cells from H(sheet_seed, x, y)
```

Ed25519 signatures are deterministic: same key, same `sheet_id`, same seed, same paper, every time. And a signature cannot be produced without the private key.

Now:

| Anyone can | Only the writer can |
|---|---|
| see the look | grow the paper for any sheet |
| play back the strokes | make new writing whose ink falls the right way |
| trace the lines with their own hand | prove a sheet is theirs |
| copy the picture | |

A forger has the strokes. They can reproduce the lines exactly. They cannot reproduce the ink, because the ink reacted with paper that only the writer can grow. Same lines, same rules, different paper, different marks.

### Proving a sheet is yours

1. Writer reveals `sheet_seed` for that one sheet.
2. Verifier checks `verify(public_key, "paper" || sheet_id, sheet_seed)`. If it checks, the seed could only have come from the writer's key.
3. Verifier grows the paper from the seed, runs the strokes through the integer physics, and compares the result to the published look. Match = the writer made this.

Revealing one sheet's seed exposes only that sheet. Every other sheet, past and future, is still unreachable, because each has its own signature.

### Live proof

"Are you really them?" Give the writer a phrase and a fresh `sheet_id`. They write it. Later, they reveal that sheet's seed. The strokes show the hand; the ink shows the key. Nobody who merely studied their writing can pass, because the paper is not theirs to grow.

### Register: write your name

There is no account. There is a key, and your signature is what the key looks like.

1. Write your name. The device makes the keypair from those marks mixed with the device's own randomness: `key = hash(marks ‖ random_bytes)`. The act is in the key; the random bytes make it unguessable even for a single dot. (Marks alone are never enough: one dot is almost no information, and even a full name is tens of bits, not 256.)
2. The key grows sheet 0, and the name just written is laid on it. That is the signature: the marks made the key, and the key made the paper the marks sit on.
3. 24 words are shown once. They are the private key in a form a human can write down, and the only way in. No reset.

Sign in: type the words; the key sits in memory for the session and is gone on sign-out. Nothing stored on the device, nothing on the server but the public key. (A password-on-the-server custody option can be added later for those who want it; it is not the default.)

Sheet 0 is open by default: public key, signature strokes, and sheet 0's seed are published together, so anyone with the `.book` can verify the signature offline. The profile shows the signature where other sites show a username.

### What the hand adds to the key

Credential-wise this is a key, same as crypto. The advantage is what a key becomes with a hand attached:

- **The public key has a face.** A key string is unreadable; a signature is recognized at a glance, and here the face is also the proof.
- **Two factors in one mark.** A stolen key cannot write in your hand (friends see it, live proof catches it); traced strokes cannot make the ink. Key and hand are both needed, with no sensor and no vendor.
- **Recovery rides on the hand.** Lost words: write your name on a new key; the old signature strokes are public, so friends compare the hand and countersign the new key. Social recovery, no custodian.
- **Physical bridge.** Sign real paper, photograph it; the photo mode turns it into strokes. Same hand, same key, both worlds.

### Where the work happens, and what crosses the wire

The computing is local. The writer's device has everything the ink needs (the strokes it just captured and the sheet seed), so the live preview, the beading, and the final marks are all computed on the phone or in the browser. Nothing is sent in order to compute the ink.

The private key never has to leave the device either. The box under the password is opened client-side: the server stores only the encrypted blob; at login the device derives the unlock key from the password, decrypts locally, signs sheet seeds locally, and forgets the key at logout. The server never sees the private key. (Login itself uses a separate password hash, as today.)

What crosses the wire is one of two things. Tabor's ruling:

| | Sent | Server holds | Visitors get | Verifiable |
|---|---|---|---|---|
| **1. Strokes + sheet seed** | strokes (they are the letter, public anyway) and the sheet's seed | strokes in the ink chain, seed beside the sheet; a disposable render cache | the look, rendered by the server on demand | any time, by anyone the seed is shown to |
| **2. Strokes + picture, seed stays home** | strokes and the finished rendered look | strokes, plus a picture it cannot rebuild | the stored picture | only after the writer later reveals the seed |

Option 1 keeps the rule that everything on the server is rebuildable, and a seed exposes only its one sheet, which is why it is safe to send. Option 2 keeps the seed on the device at the cost of storing an unrebuildable picture.

Visitors never compute closed sheets; they receive the look. For **open sheets** the seed is public, so a visitor's device regrows the paper and renders locally from the `.book`, with no server at all.

Someone holding their own exported key is in option 1 or 2 by their own choice. Someone on the password model gets the same, because decryption happens on their device either way.

### Uses on the site (no extra steps for anyone)

- **Every letter is on the writer's own paper.** Their ink behaves like theirs, letter after letter. Nothing to click.
- **Zoom.** Anyone can lean into any writing and see the fibers, the bleed, the beads where the pen dwelt. That is how the proof is displayed: you look at it. Nothing to enter.
- **The signature section** on the profile becomes a real seal: their strokes on their paper, and the site can confirm it is theirs on demand.
- **Copied strokes show.** If someone lifts strokes from another person's `.book` and sends them as their own letter, the ink renders on the copier's paper and looks wrong. The original writer can open the sheet and prove it.
- **Live proof for friends.** "Is it really you?" The site gives a phrase and a fresh sheet; they write it; the site checks. A handwritten CAPTCHA that is theirs alone.
- **Open sheets.** The writer marks a letter or page as open, which publishes that sheet's seed. Anyone holding the `.book` can then verify it offline, without the server.
- **Letters.** A received letter is on the sender's paper. The recipient can be shown that it checks, and the sender can open it later if it is ever questioned.

### Uses off the site (third parties)

- **A bank, or any service:** the person writes a phrase on a fresh sheet; the service receives the sheet seed through the site (or from the person, if they hold their own key) and verifies against the public key. The hand and the ink together, in one mark.
- **Documents:** sign a page by writing on it; the sheet seed is the proof, releasable per page.
- **Offline:** anyone with the `.book`, the open sheet's seed, and the public rules of flow can verify with no server at all.

### Why the paper and not the ink

The randomness could instead be seeded into the flow itself (jitter per deposit from the signature). It works the same. Putting it in the paper is cleaner: the rules of flow stay fixed, public law; the acts stay the writer's motion; the paper is the matter the writer brings. One secret, one place, and it is a noun.

### Per sheet, or one paper per person

- **Per sheet** (above): safest. Revealing a seed spends only that sheet.
- **One paper per person** (`sign(private_key, "paper")`): their ink behaves the same on every letter, which is beautiful, but revealing it once reveals it forever.
- **Both**: a public paper family the writer chooses (tint, grain style, weight: public parameters anyone can see), with the per-sheet secret fibers underneath.

Tabor's ruling.

### Limits, stated plainly

- The look is public, like a photo of a wet-ink signature. What is protected is *making another one*, not *looking at this one*.
- If the strokes are public, a forger can trace the lines. Only the ink gives them away.
- Verification needs the seed revealed, so it is a choice the writer makes per sheet.
- All of this rests on the integer physics being byte-for-byte reproducible. Break determinism and the proof breaks.

---

## Factor three: the records behind the present

This is the TreeOS shape, on paper.

Everyone sees the present: the marks, the look, the page as it is. Nobody can see, from the look, the fact chains behind it: which act released which ink, which fiber carried it, why this blotch is dark and that hairline thin. Those records are real, they are complete, and they are not perceivable from the surface.

They are perceivable to the Creator. The writer holds the key, the key grows the paper, the paper plus the acts regenerates every ink fact exactly. The writer can, at will, open any mark and walk it back: this darkness exists because these acts dwelt here, on these fibers, at this capacity. Nobody else can even begin the walk, because the matter it happened on is not theirs.

And they are perceivable to a higher dimension granted access to the Records: whoever is given a sheet's seed. Then the whole chain behind that sheet opens, act by act, and the present is seen for what it is: the folded head of a history.

Nothing about the records is stored. They are regenerated from the key, the acts, and the law of flow. Keep the head, re-derive the rest. The present is the visible consequence; the identity is in the history that produced it.

Three facts, one mark:

```
stroke facts  (acts, public)        the writer's motion
paper facts   (matter, from the key) the surface it met
ink facts     (react -> fact)        what settled, and why
```

---

## Needs Tabor's ruling

- Per-sheet paper, one paper per person, or both (public family + secret fibers).
- Confirm the register model: key from marks ‖ device randomness, 24 words only, no device password, sheet 0 open by default.
- Wire model: option 1 (send the sheet seed, server renders, nothing unrebuildable stored) or option 2 (send the picture, seed stays on the device).
- Which sheets are open by default: none, the profile signature only, or all profile pages.
- Whether the live preview while writing shows the real ink (slower, exact) or a fast approximation that snaps to the exact ink on Play/done.
- Cell size relative to the page unit (sets how fine the grain is and how much it costs).
- Whether playback replays the ink physics live (watch it bleed) or only the strokes over the finished marks.
- Whether a pressure-less stroke uses dwell (speed) as pressure, or a flat default.
- On resize: does the nib and flow scale with the writing, or stay fixed.
- Droplet shading (height render, ring on dry) in the first build, or hold rule only.
- Which pen settings are the writer's to change per piece, and which are fixed per person (part of their hand).
- Mid-stroke controls on phone: the scroll wheel sets flow on desktop; what does it on a thumb (an edge slider, a second finger, pressure).
- How fast wet ink mixes relative to how fast it dries (short = colors stay mostly where laid; long = big gradients).
- The dry quantum (recorded milliseconds per dry step) and the time to full dry.

## Build order

1. Integer paper function and the four rules on a CPU, one stroke, PNG out. Make it look right before anything else. The test strokes: a fast hairline, a slow curve, and a dwell that must bead and then run.
2. Determinism test: same inputs on two machines, byte-identical output.
3. Paper from `sign(key, "paper" || sheet_id)`. Reveal-and-verify path.
4. Wet-front optimization, then the GPU preview for write mode.
5. Hook into the `.book`: strokes stay as they are; the look is derived; the cache is disposable.