# Phase 0: the hand lab

The experiment that decides whether the hand design stands (plan: "Phase 0 — the experiment").
Nothing else in Living Ink is built until it passes.

**The question.** A writer's login phrase is written on the public calibration paper; the
settled ink (not the raw strokes) is read into a bit vector, the hand measure. Does that measure:
- land close for the same person across sessions (false-reject rate under about 5%), and
- land far for a human tracer (false-accept under about 1%), and, the number that decides,
- land far for a **stitcher**, who knows the phrase and composes it from the person's public
  letterforms with their real timing and pressure?

The report compares that against the same zones read straight from the raw strokes, and against
arm A (a fresh public phrase each time, read text-independently), the control arm. A is expected
to fail against a digital copier, because public writing is public, dynamics included.

## Running it

1. `npm run dev`, then open `http://localhost:5173/hand-lab`. On a phone on the same Wi-Fi,
   open `http://<this computer's LAN ip>:5173/hand-lab` (Vite prints it).
2. For each person, enter a name and their secret phrase: a few words only they would write. The lab
   keeps the text so the stitcher can be tested; the real sign-in never shows, types or sends it.
3. **Sessions** (about ten per device, on different days if possible): pick the device, then in
   each session write **A** (a fresh phrase), then **B** (their phrase). On sessions 1, 5 and 10
   also write the calibration page. B moves the session number on, so write it last.
   - phone: thumb, in write mode with the chase (Play saves).
   - desktop: mouse, or a pen tablet ("desktop with a pen").
4. **Once per person, on a desktop:** the public writing, which is the alphabet in boxes plus the pangram.
5. **Attacks, on a desktop:**
   - each person writes each other person's phrase once, in their own hand;
   - each person traces at least one A, one B and one page sample of each other person.
6. Analyse: `node law/lab/analyze.js --out law/lab/report.md` (it reads `law/lab/samples/`).
7. Freeze: `node law/lab/freeze.js` checks the gate on `law/lab/report.json` and says what it would
   write; `node law/lab/freeze.js --apply` writes the radii into `law/v1/hand.js` and turns
   `LAW_HAND_UNFROZEN` off. It refuses synthetic reports, thin data, and anything that misses the gate.
   Accounts registered before the freeze register again (the code ids in their sketches change).

Minimum for a first read: 3 people × 10 sessions × 2 devices, all corpora, all impostor phrases,
and a tracing of each person's B. The page arm needs its three sessions per device.

## What the report gives

- For each measure (facts, raw), arm (B, A, PAGE) and quantization (fixed bins; bins centred on
  the person; centred plus their reliable bits only):
  - the radius t that keeps the false-reject rate at or under 5%;
  - false-reject rate per device and across devices (enrolled on one, tested on the other);
  - false-accept rate for the impostor, tracer, copier and stitcher.
- Distance distributions behind every number.
- Which features separate people (Fisher ratio), facts and raw.

**Gate:** design B with the facts measure must reach FRR < ~5% with tracer FAR < ~1%, and the
stitcher FAR decides. If it can't, the build stops here and the report goes to Tabor.

## Files

- `rawfeatures.js`: the raw-stroke baseline, the same shape as `v1/hand.js`.
- `stitch.js`: the stitcher attacker.
- `synth.js`: synthetic writers, used only to prove the pipeline (`--synthetic 4`). They cannot decide the gate.
- `analyze.js`: the analysis and the report.
- `freeze.js`: the gate, and writing the frozen radii (tested in `law/test/freeze.test.js`).
- `samples/`: the collected writing (gitignored).
