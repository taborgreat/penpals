# Accounts change: signatures make the key, not the login

For the builder. A small, standalone change to the account system. Do it after cleanup-and-speed.md §1–6, before §7. It does not touch the ink law or the renderer.

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

## The ruling

The hand is no longer a way to sign in. Signatures do two jobs instead:
- **entropy** for the key
- **the first taste of the ink:** the pad is zoomed in, so a new person feels the system while thinking they are just writing on a good ink pad

Signing in is by name plus a password, the 24 words, or the private key. It never relies on writing.

---

## Register

1. **Sign your name three times** on a zoomed-in pad (on the lobby's paper once rooms.md lands; on the existing pad until then). The live ink runs as usual: beads, sinking, drying.
2. **The key is made on the device, from the randomness, the hand and the law together:**
   ```
   r32      = fresh device randomness, made the moment the first scribble starts
   paper₀   = a provisional sheet grown from r32 (the paper they sign on)
   facts_i  = the law's settled facts of signature i on paper₀ (factsDigest, from the live sim's finish)
   master   = sha256(T("key") ‖ r32 ‖ PNKA(sig1) ‖ PNKA(sig2) ‖ PNKA(sig3)
                     ‖ factsDigest(sig1) ‖ factsDigest(sig2) ‖ factsDigest(sig3))
   sk       = HKDF-SHA256(master, "penpals/ed25519/v1")
   words    = BIP39(master)            24 words: the key in a form a person can write down
   ```
   The hidden key is what the random key and the hand made together under the law: how the ink actually settled on a paper that existed only for that moment. Strength comes from `r32` (256 bits) plus the acts; the physics is a deterministic step, so it adds origin, not extra secrecy. The words back the key up, so it never has to be reproduced from writing.
3. **Sheet 0:** the last signature is settled again on the paper grown from the new key and sealed. That is the person's signature (open by default, as now).
4. **Choose a username.**
5. **Keep the key:**
   - Shown once: the **24 words** and the **private key** (copy or download).
   - **Optional backup password:** if set, the key is stored on the server encrypted under it, using the existing OPRF + argon2id + AEAD keyring, so guessing still needs a counted server round trip. If not set, the server holds only the public key.

## Sign in

Username, then any one of:
- **the password**: the device fetches the keyring, runs the OPRF unlock, decrypts the key locally (existing path, with the hand removed)
- **the 24 words**
- **the private key**

The key session is as now (memory plus this tab's sessionStorage, gone on sign-out).

## Remove

- **The hand from the unlock path:**
  - fuzzy extractor use
  - sketches and helpers
  - the calibration page
  - the secret login phrase
  - `PUT /api/auth/sketches`
  - the phrase-writing step in Register and SignIn
- **The keyring's hand opener.** Openers become `password` (optional) only; the typed-openers list stays, for later.
- **Law v1 is frozen:** leave `law/v1/hand.js` and its goldens in place, unused by auth. Remove only from the auth path, not from the law.
- `/hand-lab` can stay as a dev page (it costs nothing), or go. Builder's call; say which.

## Keep

Seeds, seals, commits, opens, the OPRF unlock, the key session, sheet ids, records, the `.book`. Everything about the ink and its proof is unchanged.

## Tests

- Register with three signatures, then sign in with each of password, 24 words and private key: same public key every time.
- No password set: sign in works with words or key; the server holds no keyring.
- Different signatures with the same `r32` produce different keys; the same signatures with a different `r32` produce different keys (and different facts, since paper₀ differs).
- The key derivation uses the canonical law's facts: running it twice on the same `r32` and acts gives the same key.
- No auth route accepts or asks for writing to sign in.
- The privacy canary still passes: the key, the words, the password and the master never appear in any request or file.

## Note for Tabor

The second provisional patent (provisional-patent-hand-key.pdf) describes the hand opening the key. The product no longer uses it. Whether to file it anyway, as the idea, is your call; the first patent (the paper grown from the key) is unaffected.
