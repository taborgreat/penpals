# Performance report (cleanup-and-speed.md §1–6, §5b)

Measured with `node frontend/e2e/perf.mjs` (and `--webgpu`). It builds the site in production mode, serves it, and drives the full Chromium on this machine's GPU at 1280 × 900, device pixel ratio 2. For WebGL2 each scene frame waits for the GPU (`__sceneSync`), so its draw time is the whole frame. "Main" is the main thread's busy share over the window (Chrome's TaskDuration, the Performance panel's total).

**Before**: commit c74f539, before §1. **After**: the working tree at §5b, the commit that adds this report.

## Idle at night (nothing moves but the candles)

| | main busy | scene frames | per frame | uploads |
|---|---|---|---|---|
| WebGL2 before | 6.9% | 11.2 fps | 3.71 ms | 0 |
| WebGL2 after | 8.3% | 11.2 fps | 5.35 ms | 0 |
| WebGPU before | 4.8% | 12.0 fps | 1.39 ms | 0 |
| WebGPU after | 3.5% | 11.8 fps | 0.93 ms | 0 |

- A still night view now draws only the candle flicker, at most 12 fps and at 0.75× resolution after a quiet second (§1.1).
- Before, the 12 fps was the cap of the old flicker loop. That loop still ran the full-cost shader every frame: about 170 texture reads a pixel, at full resolution with MSAA.
- On WebGL2 the after frame costs more than §1's own 3.1 ms. The difference is the lit table with its soft shadows and the two candle objects (§4, §6), which are new things on screen.
- 26 chunks are drawn.

## Writing a line

| | main busy | scene frames | per frame | worst frame | uploads |
|---|---|---|---|---|---|
| WebGL2 before | 23.5% | 21.6 fps | 6.96 ms | 34.6 ms | 9,203 KB/s |
| WebGL2 after, first line | 20.4% | 30.1 fps | 4.39 ms | 55.9 ms | 1,794 KB/s |
| WebGL2 after, second line | 20.6% | 30.7 fps | 4.42 ms | 8.3 ms | 1,520 KB/s |
| WebGPU before | 24.9% | 21.3 fps | 6.70 ms | 125 ms | 11,227 KB/s |
| WebGPU after, first line | 25.1% | 30.4 fps | 5.53 ms | 66.6 ms | 1,861 KB/s |
| WebGPU after, second line | 23.4% | 31.8 fps | 4.83 ms | 55.5 ms | 1,641 KB/s |

- **The bench writes more ink than before.** Since §3, the writing view looks at the page from the seat, so the bench now writes where the view shows the page: two full-width lines, 240 samples at 120 Hz each.
  - The old bench path drew over the 2D pad's box. In the new view, most of that lands off the page.
  - Each line is now about 1,000–1,300 live tiles and 24–30 new chunks.
- **One live tile** (taking it into its chunk, plus its share of the uploads and bakes):
  - WebGL2: 0.11–0.13 ms.
  - WebGPU: 0.43–0.50 ms. Each three.js render target switch costs WebGPU more CPU time.
- **Uploads fall about five-fold** (9.2 → 1.8 MB/s) while writing more. Live updates now upload only the changed 16 × 16 rectangle as half floats, not the whole 136 × 136 chunk (§1.4).
- **The first line's worst frame** is the page making its first chunks. The second line's worst frame on WebGL2 is 8.3 ms.

## Orbiting (three seconds of dragging, by day)

| | main busy | scene frames | per frame |
|---|---|---|---|
| WebGL2 before | 18.1% | 35.4 fps | 3.49 ms |
| WebGL2 after | 19.7% | 53.2 fps | 2.65 ms |
| WebGPU before | 12.7% | 36.3 fps | 1.37 ms |
| WebGPU after | 10.4% | 44.6 fps | 1.03 ms |

Shadows and openness are baked per chunk, so a frame reads about 4 textures a pixel. Resolution drops to 0.75× while moving and is capped at 1.5× device pixels (§1.2, §1.5). When one view is on screen, it is drawn straight into its own canvas, not copied (§1.3).

## Scene payload (§5)

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
