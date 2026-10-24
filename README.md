# penpals

Pen pals, but every letter is handwritten. Write on the pad, or on paper and
photograph the page; what travels is your ink.

Since **Living Ink** ([keys.md](keys.md)), writing on the pad is not painted: each
sampled point of the pen is an act that releases ink onto a sheet of paper grown
from your key, and what settles is the mark. The look is public; the paper is
yours. Every record is sealed by your key, the same strokes on the same paper
grow the same ink byte for byte on any machine, and anyone can check an open
sheet offline. Your account is that key, opened by your name and the way you
write your secret phrase, with a typed password as an optional backup.

Writing puts the letter on your own profile, or saves and sends it in one go. A
letter goes to one scripter, once. The server is a postman, not an archive: a sent
letter is deleted 24 hours after it is opened, or after 90 days unopened, unless the
sender or the recipient keeps it on their profile (up to 10 each). You can send 2
letters an hour.

Profiles can be private (off the homepage, visible and writable only by friends;
friendship is request + accept). Kept letters can be upvoted by anyone who can see
them, which feeds the top-letters list. Blocking hides two people from each other
and ends any friendship.

Each profile is a **book** ([books.md](books.md)): a signature and a living
journal of handwritten pages. Write anything anywhere, then move, resize, or make
it a button to another page; every page has its own link (`/u/<name>/<page>`).
The owner can download their book as one `<name>.book` file, and anyone can
check it at `/book` or with `node law/bin/verify.js`, without the site.

## Run it

Needs Node 22+. There is no database: everything is files in `backend/data/` (see Storage).

```
npm install
npm run dev
```

- App: http://localhost:5173 (Vite dev server, proxies `/api` to the backend)
- API: http://localhost:3000
- From a phone on the same Wi-Fi: `http://<your-pc-ip>:5173`

Environment: `PORT`, `DATA_DIR` (default `backend/data`), `API_URL` (where Vite
proxies `/api`), `RENDER_WORKERS` (render threads; `0` renders inline),
`ORIGINS` (comma-separated origins allowed to send writes; default: the request's
own host), `COOKIE_SECURE=1` behind HTTPS, `TRUST_PROXY`.

Without Vite: `npm run build` then `npm start`. Express serves `frontend/dist` itself.

A data directory from before Living Ink is refused (no `FORMAT` file): move it away
to start clean.

### Checks

```
npm test                                  # law, backend, frontend suites
npm run check:browsers -w law             # the law byte-identical in Chromium, Firefox, WebKit
node frontend/e2e/flow.mjs --dev --no-webgl   # the same flow with WebGL off: the flat look, writing in 2D
npm run build -w frontend && node frontend/e2e/flow.mjs   # the whole site in Chromium, by hand-like input
node backend/scripts/fsck.js [--regrow]   # the data directory, read-only
node law/bin/verify.js <file.book | proof.json> [--json]
```

## Layout

```
law/                 the law (workspace package penpals-law): pure ESM, integers, no DOM
  v1/                FROZEN: paper, acts (PNKA), the sim (+ live, playback, film, trace), look, hand
  v2/                depth, water and oak gall: dents, ink depth, soak, tears, cockle, gall, fading, splatter (keys.md)
  laws.js            the laws by number: a record grows, looks and verifies under the law it carries
  keys.js            the key, sheet seeds, seals, opens, auth messages, proofs, fingerprints
  fuzzy.js unlock.js handkey.js   BCH fuzzy commitment, OPRF + argon2id + keyring, sketches
  record.js verify.js bin/verify.js   records, and checking a .book or proof anywhere
  lab/ tools/ test/ browser/          the hand lab, tables, goldens, suites, browser checks
backend/src
  app.js server.js   the app (FORMAT check, crash recovery, routes); listen
  render/            worker-thread pool that grows sheets (looks, facts, films)
  store/             accounts, sessions, nonces, unlock, seeds, books, ops, letters, proofs, cache
  routes/            auth, users, books, signatures, letters, proofs, social, law
  limits.js auth.js  token buckets; cookie sessions and the Origin check
backend/scripts/fsck.js
frontend/src
  keys/              the key in this tab; register, sign in, sketches (key worker)
  ink/               capture, live sheet (ink worker), films, plus the photo pipeline
  scene/             the scene: one three.js renderer, 2D/3D cameras, the light, writing by ray
  book/              the journal: chain, looks, edits, walk back
  components/ pages/ Pad, WriteMode, Register, SignIn, Proofs, BookViewer, ...
```

## Storage

No database: the files are the storage, and anything kept in memory is rebuilt
from them on start ([books.md](books.md), Part A).

```
backend/data/
  FORMAT                          {"penpals":2}
  users/<id>/account.json         private: name, public key, friends, requests, blocks (no password)
  users/<id>/unlock.json          private: the OPRF key (never served), the keyring, the sketches
  users/<id>/logins.chain         private: digests of sealed login sheets
  users/<id>/seeds.chain          private: seeds of closed sheets (never served)
  users/<id>/book/skeleton.json   pages, items (integer scales), links, paper family, signature ref
  users/<id>/book/ink.chain       append-only: sealed records, and opens
  users/<id>/exposure.json        views of each ink (law 2 fading): once per viewer per day, written only on a view
  letters/<id>/                   letter.json + ink.line.json (+ sheet.seed, private, exposure.json) or the photo's PNG + strokes
  proofs/<id>/proof.json          an ask and its answer
  sessions/<sha256>.json          login sessions (only a hash of each token)
  cache/                          looks and films: disposable, rebuilt on demand
```

Every rewrite is temp file + fsync + rename; chains are only appended to (a torn
last line from a crash is cut at the next start). A registration, an ink upload
and a letter each have one commit point, so a crash never leaves half of one.

## Living Ink, in short

- **Acts** (`ink/capture.js`): every pointer sample, with its own timestamp, held-pen
  samples while still, pressure only from pens; encoded as PNKA bytes.
- **Writing live** (`ink/live.js`, `ink/inkWorker.js`): the law's integer sim runs in a
  worker as you write; points are fed as they become final, idle drying runs while the
  pen is up, undo restores a snapshot. Proven equal to growing the finished record.
- **Sealing**: the device grows the record, seals `{ use, sheet, key, paper family, acts,
  box, commit to the seed, facts }`, and sends it with the sheet's seed; the server grows
  it again and must get the same facts.
- **Looks**: the server grows a sheet's settled ink from its private seed (1 px per cell,
  colour to alpha), only for those who may see it, at integer sizes.
- **Opening a sheet** publishes its seed, signed open by the key: anyone can regrow it.
- **Law 2** (new writing): the nib dents the paper, ink sinks in, a water brush wets dry
  ink again, wet paper wears and tears, soaked paper cockles, pens throw ink (splatter, decided
  by the paper), and oak gall darkens over days while every colour fades with views: aging is
  applied when someone looks, never on a timer.
  Law 1 sheets settle exactly as they always did.
- **The scene**: every ink view is a lit 3D scene, seen straight down (2D) or from anywhere
  (3D), lit by the viewer's clock (candles at night); you can write in either. The flat look
  where WebGL2 is not there (or by choice). Walk back: the side view, the sheet in the
  scene with a cut plane, and its moments.
- **Walk back**: tap a spot of your own (or an open) sheet and see why it looks that way.
- **Films**: the sheet being written, frame by frame, saved as WebM (WebCodecs) or GIF.
- **Live proofs**: ask someone; your challenge and their key name a sheet and a phrase;
  their answer is a file anyone can check.

## Photographed letters (`frontend/src/ink`)

A photo letter is the scan's ink as a PNG and its traced strokes, sealed by your key
(the seal names both files' hashes). Everything runs in the sender's browser:

1. `load.js` decodes the photo with EXIF orientation applied and caps the long edge at 2400 px.
2. `detect.js` guesses the page corners (Otsu threshold, largest bright blob, convex hull,
   four corners); the user drags the handles if it is wrong.
3. `warp.js` resamples the page upright from those corners.
4. `extract.js` estimates the paper under every pixel and maps darkness to an alpha mask.
5. `encode.js` writes the PNG (grey + alpha, deflate via `CompressionStream`).
6. `trace.js` recovers strokes from the mask in reading order, with timing from `sweep.js`.
7. `render.js` paints the mask onto paper and uncovers it along the strokes.

## API

C = cookie session, K = signed by the account key in the body (on top of the cookie).

| Method | Path | What |
| --- | --- | --- |
| GET | `/api/law` | law versions, caps, hand and unlock parameters |
| GET | `/api/auth/me`, `/name/:name` | current user (and whether a password backs their hand); is a name free |
| POST | `/api/auth/register/begin` → `/register/finish` | hold the name, answer the first OPRF guess → key, keyring, sketches, sealed signature (K) |
| POST | `/api/auth/begin` → `/unlock` → `/login` | challenge + keyring + sketches → counted OPRF answers (5/h) → signed challenge + sealed login sheet (K) |
| POST/PUT | `/api/auth/challenge`, `/sketches` | refresh or add a rhythm (C+K) |
| PUT | `/api/auth/keyring` | the key locked again: the password backup on, off or changed (C+K) |
| POST | `/api/auth/logout`, `/logout-all` | end this session; end every session (C+K) |
| GET | `/api/users`, `/api/users/:username` | scripters; a profile (with key and fingerprint) and its kept letters |
| GET | `/api/books/:name`, `/ink`, `/download` | skeleton (+ key, fingerprint); the chain; the `.book` (owner) |
| GET | `/api/books/:name/look/:inkId?s=` | a sheet's look at an integer size (visibility first) |
| GET | `/api/books/:name/film/:inkId` | its film (deflated PNKF) |
| POST | `/api/books/me/edit` | one layout edit `{ op, ..., base }` → `{ version }` or 409 stale |
| POST | `/api/books/me/ink` | `{ line, seed, place?, base? }`: a sealed record lands, then is placed (C+K) |
| PUT | `/api/books/me/signature` | sign again: a sealed, open signature (C+K) |
| POST | `/api/books/me/open` | `{ sheet, by }`: publish a sheet's seed (C+K) |
| GET | `/api/signatures?names=`, `/:name/look` | signatures for many names; one's look |
| POST | `/api/letters` | a pad letter `{ line, seed, background, page, to? }` (C+K) |
| POST | `/api/letters/photo` | multipart `ink`, `strokes?`, `line` (sealed photo body), `inkColor`, `background`, `to?` (C+K) |
| GET | `/api/letters/:id`, `/line`, `/look`, `/film`, `/ink`, `/strokes` | a letter, by the same visibility rules |
| POST | `/api/letters/:id/send`, `/open`, `/save`, `/upvote`; DELETE `/save` | the mailbox |
| GET | `/api/letters/inbox`, `/sent`, `/top` | my mailbox; most upvoted letters |
| POST | `/api/proofs`; GET `/pending`, `/mine` | ask someone for a live proof; asks of me; asks I made |
| POST | `/api/proofs/:id/answer` | the sealed, open proof sheet (C+K) |
| GET | `/api/proofs/:id`, `/look` | the bundle anyone can check offline; its look |
| POST/DELETE | `/api/users/:username/friend`, `/block` | friends and blocks |
| GET/POST | `/api/social`, `/api/social/private` | my friends, requests, blocks; privacy |

Errors are `{ error, code }`; 429 and 503 carry `Retry-After`.
