# penpals

One world of houses and the land between them, where everything is matter and every
change to it is an act on a chain. You sign your name three times and a key is grown
from how the ink settled; a house is grown for you on the next free plot. In it: a table,
a window and a door, two candles, pens and a jar of oak gall ink, a stamper, a pendulum,
and a paper before your chair. Outside: dirt, stones, oaks with their galls, hives and
birds, and everyone else's house, the same house, where it stands.

Paper is matter ([keys.md](keys.md), [books.md](books.md)): each paper has its own chain,
born on its owner's table; every stroke, lift, seal pressed into wax, seal broken, and every
time a hand takes it up, lets it go, posts it into a mailbox or saves it into a book, is an
act sealed by the being who did it. Ink is matter on matter: a stroke goes on off a paper
onto the table it lies on, a hard scrape wears through the paper (its fibres loose) and into
the table's wood (its shavings loose), and the walls, floor, ceiling, table top and the pen's
body take ink on their own plaster or wood, each its own chain. The same acts grow the same
cells byte for byte on any machine.

A book is its chain: your signature and everything you made. You can download it as one
`<name>.book` file, and anyone can check it at `/book` or with `node law/bin/verify.js`,
without the site.

## Run it

Needs Node 22+. There is no database: everything is files in `backend/data/` (see Storage).

```
npm install
npm run dev
```

- App: http://localhost:5173 (Vite dev server, proxies `/api` to the backend)
- API: http://localhost:3000
- From a phone on the same Wi-Fi: `http://<your-pc-ip>:5173`

Environment: `PORT`, `HOST`, `DATA_DIR` (default `backend/data`), `API_URL` (where Vite
proxies `/api`), `RENDER_WORKERS` (render threads; `0` renders inline), `ORIGINS`
(comma-separated origins allowed to send writes; default: the request's own host),
`COOKIE_SECURE=1` behind HTTPS, `TRUST_PROXY`.

Without Vite: `npm run build` then `npm start`. Express serves `frontend/dist` itself.

A data directory of another layout is refused at start (its `FORMAT` says which; this is
format 4): move it away to start clean. Old data is never migrated.

### Checks

```
npm test                                  # law, backend, frontend suites
npm run check:browsers -w law             # the law byte-identical in Chromium, Firefox, WebKit
npm run build -w frontend                 # then, in the full Chromium on this machine's GPU:
node frontend/e2e/flow.mjs                # registering, the house, writing, the eye's zoom, the key corner
node frontend/e2e/room.mjs                # the house, the shelf, a wall written on, visiting, a paper written together, seals
node frontend/e2e/edges.mjs               # a stroke from a paper onto the table; a scrape through the paper into the wood
node frontend/e2e/matter.mjs              # free matter: carried things push, let go they fall; the bare hand and the pendulum
node frontend/e2e/mail.mjs                # a paper posted into a mailbox and taken out
node frontend/e2e/oneworld.mjs            # beings see each other out of doors; in through another's door
node frontend/e2e/outside.mjs             # the door, the window and what is grown beyond them; the eye's zoom out there
node frontend/e2e/hands.mjs life.mjs weather.mjs shadows.mjs grower.mjs relief.mjs perf.mjs
node backend/scripts/fsck.js [--regrow]   # the data directory, read-only
node law/bin/verify.js <file.book | proof.json> [--json]
```

## Layout

```
law/                 the law (workspace package penpals-law): pure ESM, integers, no DOM
  v1/ v2/            FROZEN paper and ink laws; v2 grows laws 2, 3 and 4 (depth, gall, wax, any matter, matter worn away)
  laws.js            the laws by number: a record grows, looks and verifies under the law it carries
  matter.js          one table of matter (rows: paper, wood, wax, plaster, metal, stone, dirt, ...)
  paper.js           papers and a house's surfaces: births, acts, who may mark, growing them
  room.js world.js   a house's things and acts; the world's plots
  being.js bodies.js poses; free matter (carried, pushed, falling, the pendulum)
  outside.js hands.js making.js tree.js life.js weather.js sun.js heat.js candle.js wax.js string.js
  keys.js unlock.js  the key, seeds, seals, auth messages, proofs; the password backup
  record.js verify.js bin/verify.js   records, and checking a .book or proof anywhere
backend/src
  app.js server.js   the app (FORMAT check, crash recovery, routes); listen
  render/            worker-thread pool that grows records (looks, facts)
  store/             accounts, sessions, unlock, books (the chain), papers, rooms, world, outside, seals, proofs, cache
  routes/            auth, users, books, signatures, papers, rooms, world, outside, proofs, social, law
backend/scripts/fsck.js
frontend/src
  keys/              the key in this tab; register (the key from the signatures), sign in (key worker)
  ink/               capture, the live sheet (ink worker)
  room/              the house: papers (their chains, writers, the hand), together, presence, carrying, the table
  scene/             one three.js renderer (WebGPU, else WebGL2): the room, its light (light/), the outside, one ray
  sound/             the ear: pens, the room, rain, life
  pages/ components/ World, Lobby, Register, SignIn, BookViewer, panels
```

## Storage

No database: the files are the storage, and anything kept in memory is rebuilt from them
on start ([books.md](books.md), Part A).

```
backend/data/
  FORMAT                          {"penpals":3}
  users/<id>/account.json         private: name, public key, privacy (no password)
  users/<id>/unlock.json          private, only with a password backup: the OPRF key (never served) and the keyring
  users/<id>/book/ink.chain       append-only: the signature, and every paper and surface its owner made with its acts
  users/<id>/room.chain           append-only: the house's acts (things placed, carried, lit; doors; who came and went)
  users/<id>/exposure.json        views of the signature (law 2 fading): once per viewer per day
  world.chain outside.chain       append-only: houses on their plots; what hands did out of doors
  proofs/<id>/proof.json          an ask and its answer
  sessions/<sha256>.json          login sessions (only a hash of each token)
  index/ cache/                   rebuilt on every start; looks, disposable
```

Every rewrite is temp file + fsync + rename; chains are only appended to (a torn last line
from a crash is cut at the next start). A registration and every act have one commit point.

## Living Ink, in short

- **Acts** (`ink/capture.js`): every pointer sample, with its own timestamp, held-pen samples
  while still, pressure only from pens; encoded as PNKA bytes.
- **Writing live** (`ink/live.js`, `ink/inkWorker.js`): the law's integer sim runs in a worker
  as you write; what the stamper takes is grown again from the chain on every screen.
- **The laws**: law 1 settles ink in paper; law 2 adds depth (dents, ink sinking, wear and
  tears, cockle, splatter, oak gall darkening, fading by views); law 3 the dip pen's well and
  wax; law 4 any matter: ink on plaster, wood or stone by its own row, the nib wearing away
  what is softer than it (paper's fibres as fluff, wood as shavings: nothing deleted), water
  carrying loose ground. Papers and surfaces grow under law 4.
- **The scene**: one lit 3D world, light as a range of waves (`scene/light/`): the sun and
  the sky by the world's one clock, candles by their acts, the room's light settled patch by
  patch, the eye adapting. Everything is grown cell by cell from its seed (the walls, the
  table, the ground, a stone, an oak's bark), finer as the eye comes closer.
- **Live proofs**: ask someone; your challenge and their key name a sheet and a phrase; their
  answer is a file anyone can check.

## API

C = cookie session, K = signed by the account key in the body (on top of the cookie).

| Method | Path | What |
| --- | --- | --- |
| GET | `/api/law` | law versions, caps, the password backup's stretch |
| GET | `/api/auth/me`, `/name/:name` | current user; is a name free |
| POST | `/api/auth/register/begin` → `/register/finish` | hold the name → public key, the sealed signature, keyring if a password (K) |
| POST | `/api/auth/begin` → `/unlock` → `/login` | challenge + key + keyring → one counted OPRF answer to a password (5/h) → the signed challenge (K) |
| POST/PUT | `/api/auth/challenge`, `/keyring/oprf`, `/keyring` | the password backup set, changed or turned off (C+K) |
| POST | `/api/auth/logout`, `/logout-all` | end this session; end every session (C+K) |
| GET | `/api/users/:username` | a profile: its key and fingerprint |
| GET | `/api/books/:name`, `/ink`, `/download` | whose house, its signature; the chain; the `.book` (owner) |
| PUT | `/api/books/me/signature` | sign again (C+K) |
| GET | `/api/signatures?names=`, `/:name/seal`, `/:name/look` | signatures; a seal's face; a signature's look |
| POST | `/api/papers`, `/api/papers/:paper/acts` | a paper or a surface born; an act on it, stamped in order (C+K) |
| GET | `/api/papers/:paper`, `/in/:space`, `/held`, `/book`, `/made` | a paper and its chain; what lies in a house; what is in my hand, in my book; how many I made |
| GET | `/api/papers/mailbox`, `/mailbox/:key` | the letters in my mailbox; how many wait in someone's |
| GET/POST | `/api/rooms/:name/stream`, `/here`, `/motion`, `/act` | a house's acts as they land; who is in it; my pose; an act on its things (C+K) |
| GET/POST | `/api/world`, `/chain`, `/acts`, `/beings` | the plots; the world's chain; a house moved; every being's pose, as it moves |
| GET/POST | `/api/outside`, `/chain`, `/acts` | what hands did out of doors; an act of the hands (C+K) |
| POST | `/api/proofs`; GET `/pending`, `/mine` | ask someone for a live proof; asks of me; asks I made |
| POST | `/api/proofs/:id/answer` | the sealed, open proof sheet (C+K) |
| GET | `/api/proofs/:id`, `/look` | the bundle anyone can check offline; its look |
| GET/POST | `/api/social`, `/api/social/private` | my privacy |

Errors are `{ error, code }`; 429 and 503 carry `Retry-After`.
