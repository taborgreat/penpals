# penpals

Pen pals, but every letter is handwritten. You write on paper and photograph the
page; your browser pulls the ink off the paper and only that ink (a PNG of about
50–200 KB) goes to the server. The recipient's browser paints it back onto paper.

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
journal of handwritten pages. Write anything anywhere, then move, resize,
recolour it, or make it a button to another page; every page has its own link
(`/u/<name>/<page>`). The owner can download their book as one `<name>.book`
file and open it again at `/book`, without the site's data.

## Run it

Needs Node 22+. There is no database: everything is files in `backend/data/` (see Storage).

```
npm install
npm run dev
```

- App: http://localhost:5173 (Vite dev server, proxies `/api` to the backend)
- API: http://localhost:3000
- From a phone on the same Wi-Fi: `http://<your-pc-ip>:5173`

Environment: `PORT`, `DATA_DIR` (where everything is stored, default `backend/data`),
`API_URL` (where the Vite dev server proxies `/api`, default `http://localhost:3000`).

Coming from the MongoDB version: `npm run migrate-from-mongo --workspace backend`
(reads `MONGODB_URI`, default `mongodb://127.0.0.1:27017/penpals`, never changes it;
refuses to run if `backend/data/users` already exists).

Without Vite: `npm run build` then `npm start`. Express serves `frontend/dist` itself.

## Layout

```
backend/src
  server.js        Express app; rebuilds the in-memory indexes from the files on start
  config.js        limits, TTLs, paths, book limits
  files.js         atomic writes (temp + fsync + rename), fsynced appends, one writer per key
  store/           accounts, sessions, books (skeleton + ink chain), ops, letters
  auth.js          scrypt passwords, cookie sessions
  social.js        friends and blocks, from the account files
  cleanup.js       deletes expired, unkept letters and old sessions every 10 min
  routes/          auth, users, letters, social, signatures, books
backend/scripts
  migrate-from-mongo.js   one-time move from the old MongoDB storage
frontend/src
  ink/             the pipeline (see below)
  book/            the journal: ink chain format, edits, pages
  hand/            handwritten labels and signatures
  components/      Pad, LetterView, Hand, Username, ...
  pages/           Home, Profile, Write, Inbox, HandStudio, BookViewer
```

## Storage

No database: the files are the storage, and anything kept in memory is rebuilt
from them on start ([books.md](books.md), Part A).

```
backend/data/
  users/<id>/account.json        private: login (scrypt hash), friends, requests, blocks
  users/<id>/book/skeleton.json  pages, items, links, colours, signature ref (rewritten per edit)
  users/<id>/book/ink.chain      append-only JSON lines, one stroke collection each
  letters/<id>/                  letter.json + ink.png + ink.strokes (deleted with the letter)
  sessions/<sha256>.json         login sessions (only a hash of each token)
  index/names.json               name → id, rebuilt from the accounts on every start
```

Edits to a book go through one queue per person and are checked against the
version the client had (a stale edit gets 409 and the client reloads). Every
rewrite is temp-file + fsync + rename; the ink chain is only ever appended to.

## The letter format

Whatever made the marks, a letter is **strokes of weighted, timed points**:

```
{ width, height, strokes: [{ angle, points: [{ x, y, t, w }] }] }
```

`x, y` in page pixels (1400 across), `t` in ms from the start of the letter, `w` the ink
width at that point. `angle` is null except for broad-nib strokes. On disk it is a small
deflated binary (`ink/strokes.js`, `PNPS` header, deltas per point, a few bytes a point;
a full page is 5-20 KB). The pad records it directly with real timing and nib widths;
a photographed page is traced into it (below). This is the data a future tutorial section
can grade against.

Every letter is stored twice: the strokes file and the ink PNG. Drawn letters are shown
from their strokes; photographed letters are shown from the PNG (the scan, shaped by the
ink sliders). Both can be watched being written, with a speed control. For a drawing the
recorded timing plays back. For a photo the scan is uncovered in reading order
(`ink/sweep.js`): the page's line geometry (tilt and the rows between text lines) steers a
front that sweeps each line left to right at a steady pace; dots and crossbars fill in at
the end of their word, finished words are filled in whole, and everything shows at the end.
The geometry comes from the ruled lines or the rows of writing (Auto), or the writer sets
a line height and first line by hand (Manual) with the chosen rows drawn as dashed guides
over the preview, or playback is switched off for that letter (Off). The rows and tilt are
stored in the strokes file. The corners step also has a Tilt slider that rotates the
flattened page a few degrees (zooming in slightly so nothing outside the page shows).

## The ink pipeline (`frontend/src/ink`)

Everything runs in the sender's browser. The server only ever sees the finished files.

1. `load.js` decodes the photo with EXIF orientation applied and caps the long edge at 2400 px.
2. `detect.js` guesses the page corners: Otsu threshold on a 320 px copy, largest bright
   blob, convex hull, reduced to the four corners that lose the least area. The user drags
   the handles if it is wrong.
3. `warp.js` solves the homography from those corners and resamples the page upright
   (bilinear, 2×2 supersampled when shrinking).
4. `extract.js` estimates the paper brightness under every pixel with integral-image box
   means (second pass ignores ink), computes darkness = 1 − gray/paper, and maps it through
   a soft ramp to an alpha mask. Then edge trim, despeckle, and a pen-colour estimate.
5. `encode.js` writes a PNG (grey + alpha, alpha quantized to 32 levels, adaptive row
   filters, deflate via `CompressionStream`). No image library involved.
6. `trace.js` recovers strokes from the mask: ruled lines out (thin ink that lines up
   across most of the page width at one tilt; only the lines' own thin pixels are erased,
   so writing crossing or sitting on a line survives, and the line positions give the
   reading order), a distance transform for the weight at every pixel, Zhang-Suen
   thinning to centrelines plus a minimal-skeleton pass and spur pruning, components in
   reading order with dots and crossbars after their word, a least-bend walk through
   junctions with pen lifts to the nearest unwalked end, RDP simplification that keeps
   width changes, and reading-order timing from `sweep.js`. It reports a fidelity score
   (IoU of the strokes' ink against the scan) in the result for anyone wanting to judge
   the trace.
7. `render.js` paints strokes or the mask in the ink colour onto paper with multiply
   blending, and `createPlayer` writes a letter out over time.

## The drawing pad (`ink/nibs.js`, `components/Pad.jsx`)

"Draw on screen" produces the same mask (`source: 'pad'`) and reuses encode and render.
Strokes are kept as point lists and rendered per nib model:

- plain pen: constant width (fine / medium / broad)
- flex nib: hairline, max width, "swell over" distance and slant. A downstroke along the
  slant swells in over that distance and thins again before release, so each shade is
  spindle-shaped. Copperplate (lots of spread) and Spencerian (little spread) are presets.
  A pressure-sensitive pen drives the width by pressure instead.
- broad nib: a flat edge at Pilot Parallel widths (1.5, 2.4, 3.8, 6.0 mm) held at any angle
  from 0° to 180°; thick and thin come from stroke direction.

Guide lines live on a separate canvas so they never become ink: plain baselines or
ascender : x-height : descender sets (1:2:1, 2:3:2, 3:2:3, 1:1:1). One set is "line height"
px tall: a dashed ascender line, the waist line, a dark baseline, then the dashed descender
line, which is the next set's ascender line. Slant lines appear for the flex nib. The
baselines are stored as rows in the strokes file. Undo re-renders the stroke list.

## API

| Method | Path | What |
| --- | --- | --- |
| POST | `/api/auth/register` `/login` `/logout` | cookie session |
| GET | `/api/auth/me` | current user |
| GET | `/api/users` | all scripters (homepage) |
| GET | `/api/users/:username` | profile + kept letters |
| POST | `/api/letters` | upload: multipart `ink` (PNG), `strokes` (strokes file), `display`, `inkColor`, `paper`, `source`, optional `to` (save & send) |
| GET | `/api/letters/:id/strokes` | the strokes file (same visibility rules as the ink) |
| POST | `/api/letters/:id/send` | `{ to }`: send a kept letter to one scripter (once; 2 per hour) |
| GET | `/api/letters/inbox`, `/sent`, `/top` | my mailbox; most upvoted letters |
| GET | `/api/letters/:id`, `/:id/ink` | metadata, the PNG |
| POST | `/api/letters/:id/open` | starts the 24 h timer |
| POST/DELETE | `/api/letters/:id/save` | keep on / remove from my profile |
| POST | `/api/letters/:id/upvote` | toggle my upvote |
| POST/DELETE | `/api/users/:username/friend` | request or accept / cancel, decline, unfriend |
| POST/DELETE | `/api/users/:username/block` | block / unblock |
| GET | `/api/social` | my friends, requests, blocks, privacy |
| POST | `/api/social/private` | `{ private }` |
| GET | `/api/books/:name` | a book's skeleton (`ETag` = its version) |
| GET | `/api/books/:name/ink` | its ink chain (JSON lines) |
| GET | `/api/books/:name/download` | `<name>.book` (owner only) |
| POST | `/api/books/me/edit` | one edit `{ op, ..., base }` → `{ version }` or 409 stale |
| POST | `/api/books/me/ink` | new ink `{ ink, place, base }`: appended, then placed |
| GET | `/api/signatures?names=` | signatures (ink + colour) for many names at once |
| PUT/DELETE | `/api/signatures/me`, PUT `/me/color` | sign, unsign, recolour |

## Next

- Move the pipeline into a Web Worker (the modules already avoid the DOM).
- Pad: trace over other scripters' letters, ink texture, pen tilt.
- Paper styles and ink textures on the render side.
- Cloudflare Tunnel in front of the homelab.
