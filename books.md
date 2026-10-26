> **Where this stands (2026-10-25).** Part A's shape holds: the files are the storage, chains are only
> appended to, a book is one `.book` file anyone can check. What has gone since: the skeleton (A2, A3) and
> the layout it held, and Part B's living journal. A book is now its chain alone: the signature and every
> paper and surface its owner made, each with its own acts (paper is matter: `law/paper.js`,
> `6-steps/one-world.md`); a `.book` is version 3.

Books, Not a Database
Pen-pal site: .book storage and the living journal profile. Build spec for coding agents.
Part A. Books: the storage system
Each person's page is their book. The server applies each edit to the book and keeps
serving it. Anyone can download their book as one .book file. Ink is appended, never
rewritten. There is one storage, not two.
A1. Why no MongoDB
If everything is appending to files, the site doesn't need MongoDB for it. Keeping both would mean dual storage:
the same truth in two places that can drift apart. So the files are the storage. Nothing about a person's page,
ink, or letters lives anywhere else.
This is the hollow TreeOS shape: edits come in one at a time, each lands as a small change, and the stored file
is the current state, ready to hand out. Someone holding the file and the repo can open a page without the
server's database, because there isn't one.
A2. Two kinds of data, two kinds of file
• Ink (collections of strokes: a word, a sentence, a drawing, the signature). Ink never changes once written. It
goes in an append-only chain file: sequential, locked data. New ink is added at the end. Nothing is ever
edited in place.
• The skeleton (the profile file: pages, where each piece of ink sits, its size, color, links, background). This
changes all the time. It's one small file, rewritten whole on every micro edit.
The split is the important part. Moving, resizing, recoloring, or turning writing into a button only touches the
skeleton. The ink it points at never changes. So the skeleton stays tiny and fast to rewrite, and the big data only
ever grows at the end.
A3. On disk
data/
 users/
 <user_id>/
 account.json # PRIVATE, never in the book: login (password hash), friends, settings
 book/
 skeleton.json # pages, items, links, colors (rewritten per edit)
 ink.chain # append-only; one line per stroke collection (JSON lines)
 letters/
 inbox/<letter_id>.json # letter waiting to be opened (deleted after, per the
 # held-until-opened model) -- not part of the book
 index/
 names.json # display name -> user_id lookup for search and links
A person's book is the two parts in their book/ folder. That is everything needed to show their page.
A4. The ink chain
Each line of ink.chain is one stroke collection, written once, never changed:
{"id":"k_000183","made":"2026-10-23T09:14:02Z",
 "strokes":[ {"pts":[[x,y,pressure,t], ...]}, ... ],
 "bounds":[w,h]}
• id is sequential per user (k_000001, k_000002, ...). The next id is the id on the last complete line + 1. Do
not count lines.
• A line only exists once its newline lands. Append the whole line plus \n in one write, then fsync. Readers
ignore an unfinished last line (no newline), which can only come from a crash mid-write.
• Points are in the ink's own local units (its top-left is 0,0). Where it sits on a page and how big it is shown are
skeleton concerns, not ink concerns.
• t is kept so the live write-out playback still works.
• Appending is one write to the end of the file. Never rewrite this file.
A5. How an edit lands
client -> server: { op: "move", page: "home", item: "i7", x: 340, y: 120,
 base: 41 } # base = profile version the client had
server, per user, one edit at a time (a simple per-user queue/lock):
 1. load skeleton.json (or keep it in memory)
 2. if base != profile.version -> reply "stale" (client refetches, reapplies)
 3. apply the op to the skeleton
 4. profile.version += 1
 5. write skeleton.json.tmp, fsync it, then rename over skeleton.json
 # atomic: never half-written, survives power loss
 6. reply { version: 42 }
new ink (same per-user queue):
 1. append the stroke collection line to ink.chain, fsync
 2. then apply an "add" op that places it on a page (steps above)
Visitors just get the files: skeleton.json first (with its version as the cache tag), then the ink it references.
The server never renders a page. It only applies micro edits and hands out files.
A6. Rules for the build
• One writer per user at a time. Two edits for the same person never run at once.
• Every rewrite of skeleton.json is write-to-temp then rename. A crash can never leave a half file.
• ink.chain is append-only. If code ever seeks back into it and writes, the build is wrong.
• No second copy of any of this in a database, cache table, or search index that can't be rebuilt from the files.
An index like names.json is fine because it can be rebuilt by scanning every account.json. If it can't be
rebuilt from the books and account files, it isn't allowed.
• Ink is always appended before anything references it. So reading the skeleton first and the chain second
always gives a complete, consistent page, even while an edit is landing.
• Deleting a piece of writing from a page removes it from the skeleton. Whether its ink line stays in the chain is
a ruling (see the end).
A7. The .book file and downloading it
Anyone can download their book as one file, <name>.book. They can share it, keep it, and open it with the
repo without the site's database.
<name>.book (plain text, JSON lines, UTF-8)
line 1: {"book": 1, "name": "<display name>", "version": 42,
 "signature": "k_000004", "home": "home", "pages": { ... } }
 # = skeleton.json, with "book" and "name" added
line 2..end: one stroke collection per line, in chain order
 # = ink.chain, unchanged
• Making it is just joining the two parts: read the skeleton as line 1, then the ink chain as-is, in that order
(A6). No conversion and no rendering. The server can stream it straight out without locking.
• The book never contains account.json (password hash, friends, settings) or letters.
• Why two parts on the server and one file on download: the skeleton is rewritten on every edit and the ink
only grows at the end. Kept apart, an edit rewrites a tiny file and new ink is one append. Joined, every edit
would rewrite the whole book.
• Opening a .book: the repo's viewer reads line 1 for the pages and layout, then the remaining lines for the
ink, and shows the journal exactly as on the site, with playback.
Part B. The living journal profile
The profile is a scratch pad. Write anything, any size, anywhere. Resize it, color it, make it a
button that takes you to another page. A whole journal of linked pages, each with its own
shareable link.
B1. Where it sits
• The profile already has a section where you set your signature. The journal goes below it.
• Your own profile: you see the signature option at the top, a Download my book option, and the journal
below it, editable.
• Someone else's profile: no signature option. You instantly see their design, with the add friend button and
the rest of the visitor actions.
B2. It feels like a scratch pad
It's like HTML, but handwritten. A blank slate the owner writes onto. Everything on it is a piece of their writing
(an item), and every item can be:
• Written anywhere, at any size. Plain words, drawings, anything.
• Moved by dragging.
• Resized. Not font size, since it's handwriting: the writing itself is scaled up or down. Sizes are relative to
each other, like the hand page feature.
• Recolored: the color of the words.
• Made into a button that takes you to another page of their journal.
• Deleted from the page.
Each page also has its own background color. This takes a lot from the hand page (sizing the buttons relative
to each other), and adds more, only on the user profile.
B3. Pages and links
• A journal is a set of pages. There is always a home page; the owner can add as many more as they want.
• Buttons link pages together, so you move around the journal like a website turned into a notebook.
• Every page has its own link you can share easily: /u/<name> opens home, /u/<name>/<page> opens
that page.
• Opening a shared link to a page shows that page directly, with the profile around it.
B4. The skeleton file (skeleton.json)
{
 "version": 42,
 "signature": "k_000004", # existing signature, now just an ink ref
 "home": "home",
 "pages": {
 "home": {
 "background": "#f6f1e7",
 "items": [
 { "id": "i1", "ink": "k_000031", "x": 120, "y": 60,
 "scale": 1.6, "color": "#1d2a44" },
 { "id": "i7", "ink": "k_000040", "x": 340, "y": 120,
 "scale": 1.0, "color": "#b14a2a",
 "link": { "page": "poems" } } # this item is a button
 ]
 },
 "poems": { "background": "#ffffff", "items": [ ... ] }
 }
}
• x/y are positions on the page; scale is the resize; color tints the ink.
• An item with link is a button. Removing link makes it plain writing again.
• Items draw in list order, so later items sit on top.
• Page ids are the readable names used in the share link.
B5. The edit ops
Every change on the profile is one of these, sent as a micro edit (A5):
add page, ink, x, y, scale, color # place new writing
move page, item, x, y
resize page, item, scale
recolor page, item, color
link page, item, target_page # make it a button
unlink page, item
remove page, item
reorder page, item, index # bring forward / send back
add_page page_id, background
rename_page page_id, new_id # buttons pointing to it are updated
remove_page page_id
background page, color
Small set, all of it skeleton-only. Writing new ink is the only thing that touches ink.chain.
B6. Own profile vs visiting
render(profile_owner, viewer):
 if viewer == profile_owner:
 show signature setting
 show journal in edit mode (write, drag, resize, color, link, pages)
 else:
 show journal in view mode, instantly (no editing tools)
 show add friend button and visitor actions
 buttons in view mode navigate; in edit mode a tap selects, a separate
 'follow' control navigates
Needs Tabor's ruling
• What MongoDB holds today besides pages and ink (accounts, friends, letters, sessions), and whether all of
it moves to files now.
• Can visitors download someone else's .book from their profile, or only the owner?
• Should the server store one .book file directly instead of the two parts (costs a full rewrite per edit)?
• Removing writing from a page: does its ink line stay in ink.chain forever (unreferenced), or is it purged? If
kept, is there a separate purge for true deletion?
• Where a letter's ink lives. If it's in the sender's ink.chain, it can't be deleted from the server after opening
(the held-until-opened model) without breaking append-only. If it lives inside the letter file, it goes away with
the letter.
• What a button can link to: your own pages, another person's journal, an outside URL. (Same link field
either way, e.g. {page}, {user, page}, {url}.)
• Any page limit, size limit for the canvas, or private (friends-only) pages.
• Is an edit history kept (an append-only log of ops beside the skeleton, which allows undo and rebuilding the
skeleton), or only the current skeleton? A log is a second record of the same truth unless the skeleton is
treated as derived from it.
• Rotation of items: in or out.
Rulings taken in this build (October 2026)
Each open question above, as built. Each can be changed later; where a setting decides it, it's named.
• What moves to files: everything. Accounts (login hash, friends, requests, blocks, letters-sent count),
sessions, letters and books are all files under backend/data/. MongoDB is gone from the app; the only
thing that still talks to it is backend/scripts/migrate-from-mongo.js, a one-time move that reads Mongo
and never changes it. Indexes kept in memory (accounts by name, letters) and index/names.json are rebuilt
from the files on every start, so none of them is ever the only record of anything (A6).
• Who can download a .book: only its owner (config.book.visitorsCanDownload = false). Visitors can still
read the same skeleton and ink through the API, since that is what they see on the page.
• One file or two on the server: two (skeleton.json + ink.chain), joined into one .book on download.
• Removing writing: it leaves the skeleton; its ink line stays in ink.chain, unreferenced. There is no purge
yet. A purge would rewrite the chain, so if it's ever added it should be an offline tool, not part of the
live server.
• Where a letter's ink lives: inside the letter, not in anyone's chain. Each letter is a folder,
data/letters/<id>/ (letter.json, ink.png, ink.strokes), deleted whole when the letter goes (24 h after
opening, 90 days unopened, unless kept). So the held-until-opened model and append-only both hold.
• What a button can link to: the owner's own pages ({"page": "<id>"}). The link field is an object, so
{"user", "page"} and {"url"} can be added later without changing the format.
• Limits: 40 pages per book, 400 items per page, one piece of ink up to 1 MB / 2000 strokes / 120 000
points, a whole chain up to 50 MB (config.book). The canvas is a fixed logical page, 1000 × 1400 units,
scaled to the screen. No private pages: the profile's own privacy (friends-only) covers the whole book.
• Edit history: not kept. The current skeleton is the only record of the layout (no op log, so no second
copy of the truth).
• Rotation: out.

Build notes: where the build differs from the text above, and why
• Ink points are [x, y, w, t]: the third value is the ink's width at that point rather than raw pressure,
because the pen models (flex, broad) turn pressure and direction into width, and width is what's drawn.
A broad-nib stroke also carries "a", its nib angle.
• Paths: data/ is backend/data/ (DATA_DIR). Letters are data/letters/<id>/ rather than
users/<id>/letters/inbox/, because a letter can be unsent, or kept by its sender and its recipient,
so it isn't in any one person's inbox.
• skeleton.json also holds "signatureColor" (one of the eight signature colours) and "nextItem" (the
counter for item ids, so an id is never reused). The signature edit ops are "signature" (an ink ref, or
null) and "signature_color".
• Edits: POST /api/books/me/edit { op, ..., base } -> { version } or 409 { stale, version }; new ink:
POST /api/books/me/ink { ink, place, base }, appended and placed under the same per-person lock. The
client shows an edit at once, sends edits one at a time, and on a stale reply reloads and retries once.
• Viewing a .book: /book in the site opens a downloaded file locally (nothing is uploaded) and shows it
as on the site, with buttons and playback.


V2: Living Ink (keys.md)

What changed in the book with Living Ink. Everything above still holds unless it is said here.

• Ink chain lines are sealed records. A line is {"id":"k_000007","made","ink":{record},"seal","open"?}: the
record names its use (book, signature, letter, proof), its sheet, the key, the paper family, the acts (PNKA
bytes, base64url), the box of the settled ink, a commitment to the sheet's seed, and the facts digest; the seal
is the key's signature over it. A later line {"id","made","open":"s…","ref","seed","by"} opens a sheet.
Seeds of closed sheets are never in the chain (the server keeps them privately).
• The .book is version 2: line 1 is {"book":2,"name","key","fingerprint","law",...skeleton}, then the chain as
is. node law/bin/verify.js <file.book> checks every seal against the key, ids, one record per sheet, the
opens, the layout, and regrows every open sheet; /book does the same in the browser (and, with your key in
the tab, regrows your closed sheets too).
• No recolour: colour is pigment in the acts, chosen on the pen. Items have no color field; the recolor op,
the signature colour and signature removal are gone.
• Scale is an integer in 64ths (4..640, 64 = as written). Each size is its own look, grown again from the
scaled acts, not a stretched picture; a look is served only at a size the item is shown at.
• Every record carries its law ("law": 1 or 2). New writing is law 2 (depth, water, oak gall: keys.md); a
record grows, looks and verifies under its own law for good. A law-2 look is drawn at a moment: hours since
the line was made (oak gall darkens) and views so far (light fades it), in buckets, cached per bucket. Views
count once per viewer per day, in users/<id>/exposure.json (letters: letters/<id>/exposure.json), written only
when someone looks. The .book carries no exposure: offline, a sheet shows its fresh exposure at its true age.
• The skeleton has paperFamily ({grain, weight, tooth}); the family op changes it for new sheets. Every
record carries the family it was grown on.
• The signature is a record of use signature, open from birth. Sheet 0 is the one written at registration;
signing again adds a new sheet and points the skeleton at it.
• New ink: POST /api/books/me/ink { line, seed, place?, base? }. The server checks the seal and the seed,
grows the record and must get the same facts, then writes seed, line and edit in that order.
