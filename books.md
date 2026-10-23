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