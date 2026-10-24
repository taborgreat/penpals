# Done: layer 1 (the builder)

Layer 1 of the five-layer plan in `6-steps/` is finished:
- cleanup-and-speed.md §1 to §7, including §5b;
- accounts-change.md.

Layer 2 (light-waves.md) was built by the second agent as standalone modules. It is now committed as delivered and integrated (§7).

**Rooms (layer 3, rooms.md) can start.** The all-green bar it waits for is met on all three e2e backends.

## Commits, oldest first

| Commit | What |
|---|---|
| a2b55c2 | §1: the lag |
| 8e29308 | §2: the wet front. Law v2 changed; the v2 goldens were re-recorded. |
| c3ee2da | §3: the camera |
| 29f4008 | §4 and §6: the table, and candles you can see |
| 8da9ee4 | §5 and §5b: one style (ESLint + Prettier), PNKS 2, the benches, and loading by the senses |
| fec84e0 | accounts-change.md: signatures make the key. Sign in with a password, the 24 words or the private key. |
| 00f662f | light-waves: the modules as delivered |
| 7d35845 | §7: light-waves integrated (see below) |

## State

**Green:**
- `npm test` passes: law 99, backend 36, frontend 71.
- `npm run lint` has 0 errors and 3 warnings. The warnings were left on purpose, in LetterView, VectorPad and WriteMode.
- `npm run format:check` passes.
- The e2e passes: `npm run build -w frontend && node frontend/e2e/flow.mjs` with `--webgpu`, with the default (SwiftShader WebGL2), and with `--no-webgl`.

**Performance:** `PERFORMANCE.md` holds the before/after report, the white-box finding, and the room's cost. The benches are run with `node frontend/e2e/perf.mjs [--webgpu]`.

**Law:**
- v1 is frozen and byte-identical, including `law/v1/hand.js`, which auth no longer uses.
- v2 changed twice:
  - §2, the wet front.
  - §7, fading by absorbed light: `law/v2/look.js` `fadeByLight`, with DRUNK as a law constant. Only the looks at views 400 and 4000 were re-recorded.
- The server's look cache rev went to 2.

## What later layers build on

### The light (`frontend/src/scene/light.js`)
- `theLight()` is the page's one light: one being, one eye, two candles.
  - The room is fetched once from `/room/room.json` and `/room/room.ff`, which are baked at build by `frontend/scripts/room.mjs`.
  - It is settled in `light/lightWorker.js`. The worker now also returns each source's direct part per patch, when the settle message has `direct: true`.
- `at({ now, date, override, present })` returns:
  - the sun (spectrum through the glass, direction in room axes);
  - the flames (burn state, place, light now, colour as seen);
  - `ambient` per patch (n × 17: settled light less the sun's and flames' direct light, which is drawn per pixel);
  - the page's ambient;
  - the eye's weights `W` (3 × 17);
  - `settling`.
- A view's page lies centred on the room's page: `originOf(pageW, pageH)` and `worldOf(roomPoint, origin)`.
- `withinRoom(cam, …)` keeps the camera inside the room: off the walls, the floor and the ceiling, and out of the table.

### The room drawn
- `frontend/src/scene/roomDraw.js`:
  - `roomMeshes(geom)` gives each surface's grid mesh (window holes included), its cell coordinates, and which patches each vertex touches.
  - `vertexLight(...)` turns the ambient light into two colours per vertex: what the light curve reflects, and what the dark curve adds.
- `engine.js` builds one room group per view and shares its geometry. The shader:
  - grows every surface cell by cell, using light/surface.js growMean as WGSL or GLSL through TSL code nodes;
  - adds the sun through the window (soft-edged aperture, the table slab's shadow) and the flames per pixel;
  - shows the outside in the window panes (`outsideMap`).
- The materials are in `nodes.js` (`roomMaterial`, `objectMaterial`, `windowMaterial`). The shading is spectral throughout: `spectral()`, 16 visible bins as four vec4s.

### Ink in the light
- The chunk colour texture is the law's per-channel transmittance; the shader takes its absorbance (−ln T).
- Through the light agent's INK basis, cell reflectance is `paper(λ) · exp(−A)`.

### Loading by the senses
- `scene/sight.js`, plus `onSight` on SceneView.
- The server serves scene windows and levels of detail (`?at=`, `?lod=`, in `backend/src/sight.js`).
- `useNear` holds off lists of looks until they are near the screen.

### Accounts
- `law/keys.js`: `newR32`, `provisionalPaperKey`, `masterOf`, `wordsOf`, `keyFromWords`, `privateKeyText`, `keyFromPrivate`.
- `law/record.js`: `accountKey(r32, [3 PNKA])`.
- Register, SignIn and PasswordSetting are in `frontend/src/components`.
- `/api/auth/keyring/oprf` and `PUT /api/auth/keyring` handle the optional password backup.
- `/hand-lab` stays as a dev page.

## Left open, for later layers or Tabor

- **Walking (light-waves §9 / rooms.md §4) is not wired.** The camera flies anywhere in the room and returns to the seat. `light/roomCamera.js` walk/fly/glide are ready for rooms.md's being.
- **The page's ink does not yet change the room's light.** The settle uses plain paper for the page patch. `matter.pageCurve` plus the worker's `page` input is the hook, and rooms.md's walls will want the same.
- **Candles' lit time** is kept for the session (sessionStorage), as the module says, until rooms.md's enter and leave acts.
- **The eye adapts to the page**, so the rest of the room is dim by day next to a sunlit page. That is the physics.
- **Defaults taken for Tabor's open rulings:**
  - light-waves: 16 bins plus heat; plaster walls, a wood floor and one window; candle burn time 12 h; no depth of field;
  - cleanup: flicker on; relief 20×; close-up smooth (Crisp is a toggle);
  - accounts: no password unless one is chosen.
- **Note for Tabor:** the hand no longer opens the key. Whether to file the second provisional patent (`provisional-patent-hand-key.pdf`) anyway is Tabor's call. The first patent (the paper grown from the key) is unaffected.
