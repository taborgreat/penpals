# Performance report (cleanup-and-speed.md §1–6, §5b)

## How this was measured

Both columns were measured back to back on this machine on 2026-10-24, with the same bench: `frontend/e2e/perf.mjs` from commit 8da9ee4.
- The bench builds the site in production mode with the dev pages in (`VITE_LABS=1`), serves it, and drives the full Chromium on this machine's GPU at 1280 × 900, device pixel ratio 2.
- For WebGL2, each scene frame waits for the GPU (`__sceneSync`), so its draw time is the whole frame.
- "Main" is the main thread's busy share over the window (Chrome's TaskDuration, the Performance panel's total).
- **Before:** commit c74f539, before §1, in a git worktree. The only additions were what the bench reads: the engine's frame, draw-time and upload counters, the GPU wait, and the dev pages built in (the pad check page).
- **After:** commit 8da9ee4, after §5 and §5b.
- Rerun with `node frontend/e2e/perf.mjs [--webgpu]`.

## Idle at night (nothing moves but the candles)

| | main busy | scene frames | per frame | page frames p95 / worst |
|---|---|---|---|---|
| WebGL2 before | 19.1% | 9.6 fps | 18.0 ms | 15.9 / 24.0 ms |
| WebGL2 after | 8.1% | 11.2 fps | 5.2 ms | 8.1 / 8.3 ms |
| WebGPU before | 3.9% | 11.6 fps | 1.17 ms | 8.1 / 8.3 ms |
| WebGPU after | 3.5% | 11.6 fps | 0.92 ms | 8.1 / 8.3 ms |

- **Before, a still night view ran the full-cost shader at the flicker's rate.** That was about 170 texture reads a pixel: shadows marched toward the sun and each candle, every frame, at full resolution with MSAA. On WebGL2 that cost 18 ms a frame and dropped page frames.
- **Now shadows and openness are baked per chunk** (§1.2). Only the flicker is drawn, at most 12 fps, and at 0.75× resolution after a quiet second (§1.1).
- 26 chunks are drawn.

## Writing a line (a 2 s stroke at 120 Hz, then a second of drying)

| | main busy | scene frames | per frame | worst frame | uploads |
|---|---|---|---|---|---|
| WebGL2 before, first line | 22.3% | 23.1 fps | 6.34 ms | 39.9 ms | 8,497 KB/s |
| WebGL2 before, second line | 22.6% | 22.2 fps | 6.97 ms | 8.2 ms | 8,429 KB/s |
| WebGL2 after, first line | 20.9% | 31.2 fps | 4.27 ms | 55.9 ms | 1,738 KB/s |
| WebGL2 after, second line | 22.2% | 31.4 fps | 4.74 ms | 16.0 ms | 1,493 KB/s |
| WebGPU before, first line | 19.2% | 21.0 fps | 4.71 ms | 119.2 ms | 8,767 KB/s |
| WebGPU before, second line | 15.1% | 22.3 fps | 3.05 ms | 24.0 ms | 9,100 KB/s |
| WebGPU after, first line | 25.5% | 29.9 fps | 5.76 ms | 63.4 ms | 1,871 KB/s |
| WebGPU after, second line | 24.5% | 32.7 fps | 4.95 ms | 39.4 ms | 1,618 KB/s |

- **Uploads fall about five-fold** (8.4–9.1 MB/s → 1.5–1.9 MB/s). A live tile now uploads only its 16 × 16 rectangle as half floats, not the whole 136 × 136 chunk (§1.4).
- **The ink keeps up with more frames.** The view draws 30–33 frames a second while writing, against 21–23.
- **On WebGPU the main thread is busier for it** (19% → 25%). Each three.js render-target switch costs WebGPU CPU time. One live tile costs:
  - WebGPU: 0.46–0.49 ms (taking it in, plus its share of the uploads and bakes);
  - WebGL2: 0.12–0.14 ms.
- **The first line's worst frame is the page making its first chunks.** On WebGPU it halves (119 → 63 ms).
- **The ink itself differs a little.** The bench writes in the middle of the 3D pad view. Since §3 that view looks from the seat, so the same pointer path puts down a similar but not identical amount of ink.

## Orbiting (three seconds of dragging, by day)

| | main busy | scene frames | per frame | worst frame |
|---|---|---|---|---|
| WebGL2 before | 15.2% | 22.7 fps | 4.52 ms | 12.9 ms |
| WebGL2 after | 22.4% | 53.3 fps | 3.12 ms | 23.1 ms |
| WebGPU before | 10.8% | 41.6 fps | 1.16 ms | 8.2 ms |
| WebGPU after | 10.5% | 44.7 fps | 0.98 ms | 8.3 ms |

- **Each frame is cheaper.** Shadows are baked, a frame reads about 4 textures a pixel, resolution is 0.75× while moving, and it is capped at 1.5× device pixels (§1.2, §1.5).
- **The view is drawn straight into its own canvas** when it is the only one on screen, not copied (§1.3).
- **WebGL2 keeps up with the drag:** 53 frames a second against 23.

## Scene payload (§5)

Before §5, the server sent PNKS 1 for every cell of the box. At c74f539, before the wet front, that was 746,381 B (59,598 deflated) for the line of handwriting, and 598,281 B (90,255 deflated) for the flicks.

Below, the same fields today, in both formats:

| field | PNKS 1 (every cell) | PNKS 2 | PNKS 1 deflated | PNKS 2 deflated |
|---|---|---|---|---|
| a line of handwriting (794 × 96 cells) | 762,261 B | 135,635 B | 67,985 B | 53,731 B |
| flicks with splatter (342 × 178 cells) | 608,781 B | 283,728 B | 123,065 B | 116,443 B |

- PNKS 2 stores only the cells that hold anything, as runs along each row. The surface takes one byte when its range fits.
- What crosses the wire is deflated: 5–21% smaller.
- The decoded size is 2–6× smaller, which is what the device parses and holds.
- The flicks field is larger than at c74f539 (598,281 B raw) because §2's wet front changed what settles.

## Load by the senses (§5b)

A page asks only for what its view can see:
- **Out of view:** nothing is requested and nothing is drawn. Anything out of sight for 20 s is let go.
- **Far or small:** the flat look at a level of detail. The server shrinks it, at `?lod=1..3`.
- **Near:** the scene field of the chunks in view (`?mode=scene&at=x0,y0,w,h&lod=`). The server grows the whole field once, caches it, and cuts each window from it.

The e2e checks this as a visitor. With the journal below the fold, the page makes 0 look requests. Scrolled into view, it makes one scene request and shows the ink.

## What the white box was (§6)

It was the paper, lit flat by a high sun:
- At true relief, ink heights are below a pixel, so the paper read as a bright slab with no depth cues.
- The sun was only a light direction, with no sky and no object to see.
- The table was an unlit colour plane 40 px below the page.

What changed:
- Height is exaggerated 20× by default, with a slider from 1× to 200×.
- The paper rests on a lit table and casts a soft shadow on it.
- The two candles are objects: wax, wick, and a flame that flickers with their light.

The sky, window light and colour grading come with light-waves (§7).

## After §7: the lit room

Measured the same way, with the light-waves modules integrated. The page now sits on the table of a grown room: walls, floor and ceiling, the window with the outside, and two burning candles. Every pixel is shaded bin by bin through the eye.

| | idle at night | writing a line | a second line | orbiting (by day) |
|---|---|---|---|---|
| WebGL2 | 7.0% main, 11.2 fps × 3.7 ms | 25.1%, 28.9 fps × 5.7 ms | 26.8%, 30.0 fps × 6.1 ms | 54.3%, 51.5 fps × 9.3 ms |
| WebGPU | 4.6% main, 11.6 fps × 1.4 ms | 29.8%, 28.2 fps × 7.0 ms | 27.6%, 30.2 fps × 6.0 ms | 13.4%, 40.2 fps × 1.5 ms |

- **Orbiting costs most.** Turning toward the walls fills the screen with surfaces grown cell by cell (light/surface.js growMean, averaged as cells shrink below a pixel). On WebGL2 the bench waits for the GPU, so those 9 ms are the GPU's: about 54% of the main thread while orbiting at 51 fps.
- **A first-orbit stall is gone.** Each view now compiles the room's shaders while the page loads. The room's meshes are never culled, since they surround the eye. Before that, the first turn toward the walls stalled 380 ms on WebGPU; now its worst frame is 8.3 ms.
- **The eye adapts gently.** It starts settled on the room's light as soon as that light arrives, rather than from darkness. While it adapts, the scene draws 25 frames a second, not every display frame. Without this, writing at night ran at the display's full rate.
- **The room's light settles in a worker** (bounce, sun, sky and flames): about 100–150 ms when the sun moves half a degree or a candle burns down half a millimetre. Flicker only rescales the flames' parts.
