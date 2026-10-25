# For the builder: one-world.md on `world/one-page`

From penpals-42, who built this branch in a separate worktree (`C:\Users\Chris\Documents\GitHub\penpals-world`) so main's HEAD stayed yours. Everything here is on the branch; nothing touched main.

## What the branch does

1. **One page** (one-world.md "Remove"). `/` is the lobby until you are in, then your house; `/u/<name>` is the world at that person's house. Home, Profile (and `/u/<name>/<page>`), Write, Proofs and HandStudio are gone, with the components only they used and their CSS. The routes are one table, `frontend/src/routes.js`, rendered by `App.jsx` and tested by `routes.test.js`. `/inbox`, `/book` and the dev pages stay outside the world with the old header.
2. **The house act and placement** ("Spawned matter"). `data/world.chain`, stamped in arrival order: `{ v: 1, kind: 'house', key, k: 0 }` and `{ v: 1, kind: 'move', key, k, plot: [i, j] }`, sealed with `K.sealOf` over `SHA-256(T("world") ‖ JCS(act))`. `k` counts the key's acts so an old move cannot be replayed. Plots go ring by ring around `[0, 0]` (the start, no one's), counterclockwise from +x, `PLOT_M = 12` m apart. `GET /api/world`, `GET /api/world/chain`, `POST /api/world/acts`. Register sends the house act right after `register/finish`; the world page sends it again the next time you are in if it never landed.
3. **The keys** (outside.md Part 3). SceneView takes `world` (JournalPage sets it for the house): W A S D stand up from the chair and walk, Space jumps, Space twice flies (Space rises, Shift lowers), Shift on the ground crouches (the head others see is crouched too), drag turns the head, scroll is the eye's zoom (only the eye moves, along the ray under the cursor; never sent), E picks up / sets down / sits at the chair, E held still tilts. In the world there is no L, F, Q/E-as-up-down, and no toolbar over the view. Pads and labs keep the old controls. The rules are pure in `scene/keys.js` (tested in `keys.test.js`).

4. **The panel, signing in, the account corner, no theme** ("The panel"). One box (`components/Panel.jsx`); `room/panel.js` says which form it holds, from what SceneView tells the room (`RoomContext.onBeing`: seated, at the chair, at the corner, what the hand holds, the pen). Signed out, anywhere, it offers sign in or register: the lobby's forms are now the panel over a full-window lobby. In your own house, standing by the corner behind the chair on the right (`scene/keys.js cornerOf`), it offers the password backup, your keys (words and private key behind a click) and sign out everywhere (`components/AccountPanel.jsx`). The theme is gone: `public/theme.js`, every `prefers-color-scheme: dark` and `[data-theme]` rule, and Hand.jsx's theme listener.

## Belongs to you (I could not touch law/)

- **Draw the account corner's thing.** The corner works (walk there and the panel opens) but nothing is drawn there: a new object in the room is engine.js / scene/light/ drawing. `cornerOf(GEOM)` is where it stands.

- **Move the house law into law/.** `backend/src/world.js` (plots, order, act shapes, check, fold) and the 4-line digest in `frontend/src/room/world.js` are one rule written twice. They belong next to `law/being.js` and `law/shared.js`, and the `T("world")` message in `law/keys.js`'s list of what the key signs. `backend/test/world.test.js` signs with the frontend module so the two cannot drift until then.
- `grow()` replays a chain without checking seals (the stamper checked them). A client or verifier regrowing from `/api/world/chain` should check each seal (`sealed()` is async: WebCrypto).
- The registration route is untouched: the house act is its own request, so `crash.test.js` holds as it was.

## Merging

- **Rebase, don't merge main into the branch.** The branch is rebased on `72f8dd4`. Conflicts to expect if main moves:
  - `frontend/src/scene/SceneView.jsx`: my changes are the `world` prop, `camOfPose`'s near plane when zoomed, `headNow`/`eyeNow`, the draw loop's `input` and `head`, `look()` standing up at the chair, `S.lastPointer`, the wheel's world branch, `resize()` (your `[ ]` code, moved), `worldKeyDown`/`worldKeyUp`, the hint and `!world` on the toolbar. Your walk, fly, size and carry code is used as you wrote it.
  - `frontend/src/styles.css`: about 320 lines of dead page CSS removed; world CSS added after `.lobby`.
  - `frontend/src/App.jsx`, `book/Journal.jsx` (the empty-house early return gone), `book/JournalPage.jsx` (`world={!!room}`), `backend/src/app.js` (world store and route).
- **Data:** no migration. Existing accounts get a house the next time they are in the world with their key in the tab. The FORMAT number is unchanged (a new file at the data root).
- **e2e:** `frontend/e2e/flow.mjs` still uses the removed pages until the section that updates it lands (see below).
- **Worktree only:** the fresh checkout wrote `law/v2/tables.js` with CRLF, which fails `goldens-v2.test.js` byte for byte. I set it to LF and `--skip-worktree` in this worktree's index. Nothing about it is committed.

## Left out, waiting on others

- **Walking between houses and through doors:** needs the outside (outside.md phase 4: ground, the door as a real door). The house positions are in `/api/world` for it.
- **Crouch speed:** crouching lowers the eye only; a slower crouched walk needs a speed input to `roomCamera.walk` (scene/light/).
- **Zoom into the relief:** the zoom stops short of the page's heights as drawn (×relief); whether relief drops to 1× is a ruling.
