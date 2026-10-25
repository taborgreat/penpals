import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keys as K, b64url } from 'penpals-law';
import Pad from '../components/Pad.jsx';
import Hand from '../components/Hand.jsx';
import KeyGate from '../components/KeyGate.jsx';
import { SIGNATURE_COLORS } from '../hand/colors.js';
import { useAuth } from '../auth.jsx';
import { useKey, newSheet, sealInk, openBy } from '../keys/session.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import { useBook } from './useBook.js';
import { itemSize, SCALE_ONE } from './ink.js';
import { pageIdFrom } from './ops.js';
import JournalPage from './JournalPage.jsx';
import WalkBack from './WalkBack.jsx';
import { sceneOf } from '../scene/sources.js';
import { momentsHere } from '../ink/grown.js';
import InkWell from '../ink/InkWell.jsx';
import FilmDownload from '../components/FilmDownload.jsx';
import { fromB64url } from 'penpals-law';
import { roomSeedsOf } from '../room/seeds.js';
import { createWallInk } from '../room/wallInk.js';
import { useTogether } from '../room/together.js';
import { useCarry } from '../room/carry.js';
import { SHARED_PAGE } from '../room/shared.js';
import TogetherBar from '../room/TogetherBar.jsx';
import Panel from '../components/Panel.jsx';
import PenPanel, { usePen } from '../components/PenPanel.jsx';
import PaperPanel, { FreshSheet } from '../components/PaperPanel.jsx';
import { useFreshSheet, SIZES } from './fresh.js';

// The living journal (books.md, Part B; keys.md): a book of handwritten pages.
// The owner writes anything anywhere (each piece a sheet of the law's paper,
// sealed by their key), then moves, resizes and links it; every layout change
// is one micro edit. Visitors see the same pages, each piece as its settled
// look, and writing that's a button takes them to its page. Every page has its
// own link (onPage). A sheet's paper is the writer's secret until they open it.
//
// The journal is the page on the owner's table in their room, and the room's
// surfaces are its pages too (rooms.md §1, §2): their walls, floor, ceiling and
// table, grown from their key, carry what they wrote there. The owner writes on
// a surface from Look, the pen pointed at it (room/wallInk.js). Others in the room are there with you, and shared
// sheets lie on its table to write on together (rooms.md §4–§6, room/together.js).
//
// In the world (`world`, one-world.md) there is no flat editor: the owner is in
// their house, and the world's one panel (`panel`, room/panel.js) holds what the
// toolbars did for what is in hand: the pen (components/PenPanel.jsx; it writes
// the next strokes on the walls, on shared sheets and on a fresh sheet), or, at
// the table with nothing in hand, new paper (a fresh sheet on the table:
// book/fresh.js). Ctrl+Z lifts the fresh sheet's last stroke. E on a piece of
// your writing picks it up (`sheetHand`): its panel is the editor's tools for
// it, and E again sets it down at the pointer (one move). The book pulled down
// from the shelf is in the hand too (`onHold('book')`): its panel turns its
// pages and holds the page's own tools.
const WRITE_PAD = { width: 1000, height: 470 }; // writing is placed at the size it was written on a page-wide pad
const INK_COLORS = SIGNATURE_COLORS.map((c) => ({ id: c.id, name: c.name, hex: c.light }));
const BACKGROUNDS = ['#f6f1e7', '#ffffff', '#f2e8d0', '#e8eef6', '#f6e6e6', '#e7f1e6', '#2b2a33', '#1f2a40'];
const DEFAULT_PAGE = { width: 1000, height: 1400 };
// The cloth a book on the shelf is bound in (rooms.md §3): one of these, by its owner's key.
const CLOTHS = [
  [104, 28, 32],
  [32, 64, 44],
  [30, 40, 76],
  [92, 62, 36],
  [58, 40, 70],
];
const clothOf = (seeds) => CLOTHS[(seeds?.table?.[0] ?? 0) % CLOTHS.length];
// A door's target as one select value, and back (rooms.md §3: a page, a surface, someone's room).
const doorValue = (l) => (l?.page ? `page:${l.page}` : l?.surface ? `surface:${l.surface}` : l?.room ? `room:${l.room}` : '');
const surfaceName = (id) => `the ${id.replace('-', ' ')}`;

export default function Journal({ name, pageId, editable = false, onPage, fromFile = null, lookSrc = null, sceneSrc = null, world = false, panel = null, onHold = null }) {
  const { book, send, addInk, openSheet, error, clearError } = useBook(name, fromFile);
  const { user } = useAuth();
  const key = useKey(user);
  const [selected, setSelected] = useState(null);
  const [writing, setWriting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [walking, setWalking] = useState(null); // the item being walked back
  const editing = editable && !preview && !world;
  const pen = usePen(); // the pen in the hand (the world's)
  // writing on the room's surfaces: one sheet at a time, begun where the pen first touches one
  const [wall, setWall] = useState(null); // room/wallInk.js, while a surface is being written on
  const wallRef = useRef(null);
  wallRef.current = wall;
  const [wallColor, setWallColor] = useState(INK_COLORS[0].hex);
  const [wallBusy, setWallBusy] = useState(false);
  const [reading, setReading] = useState(false); // the book pulled down from the shelf, to flip through
  const [gazeAt, setGazeAt] = useState(null); // a door to a surface was followed: { surface, n } (the head turns to it)
  const [tableColor, setTableColor] = useState(INK_COLORS[0].hex); // the pen on shared sheets
  const navigate = useNavigate();
  // Through a door (rooms.md §3): to a page of this book, to a surface of this room
  // (the head turns to it), or into someone's room (entering their space).
  const follow = useCallback(
    (link) => {
      if (link?.page) onPage(link.page === book.skeleton?.home ? null : link.page);
      else if (link?.surface) setGazeAt((g) => ({ surface: link.surface, n: (g?.n ?? 0) + 1 }));
      else if (link?.room) navigate(`/u/${encodeURIComponent(link.room)}`);
    },
    [onPage, navigate, book.skeleton?.home],
  );
  useEffect(() => () => wallRef.current?.destroy(), []);

  const skeleton = book.skeleton;
  const current = skeleton && (pageId && skeleton.pages[pageId] ? pageId : skeleton.home);
  const page = skeleton?.pages[current];
  const item = page?.items.find((it) => it.id === selected) ?? null;
  const pageIds = skeleton ? Object.keys(skeleton.pages) : [];

  useEffect(() => setSelected(null), [current]);
  useEffect(() => setWalking(null), [selected, current]);

  // Delete removes the selected writing; Escape lets go of it.
  useEffect(() => {
    if (!editing || !selected) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'Escape') setSelected(null);
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        send({ op: 'remove', page: current, item: selected });
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, selected, current, send]);

  const op = useCallback((o) => send(o), [send]);
  const bookName = book.name ?? name;
  const looks = useCallback((item) => `/api/books/${encodeURIComponent(bookName)}/look/${item.ink}?s=${item.scale}`, [bookName]);
  // The scene of a piece of writing: grown here when this device can (yours, or open), else the
  // server's; as much of it as the eye can see (want: scene/sight.js); far, its look as shown.
  const scenes = useCallback(
    (item, line, want) =>
      sceneOf({
        line,
        seed: seedOf(item),
        lookUrl: (lod) => `/api/books/${encodeURIComponent(bookName)}/look/${item.ink}?s=${item.scale}${lod ? `&lod=${lod}` : ''}`,
        sceneUrl: `/api/books/${encodeURIComponent(bookName)}/look/${item.ink}?mode=scene&s=64`,
        want,
      }),
    // seedOf reads the book and the key, which are these
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookName, book.inks, book.seeds, key],
  );
  // Show the moments of a sheet this device can grow (yours, or open; law 2).
  const momentsSrc = useCallback(
    (item, line) => {
      const seed = seedOf(item);
      return seed && line.ink.law >= 2 ? () => momentsHere(line.ink, seed) : null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book.inks, book.seeds, key],
  );
  // A sheet's film: grown here when this device can (yours, or open), else the server's.
  const filmOf = (it) => {
    const line = book.inks.get(it.ink);
    const seed = seedOf(it);
    if (seed) return { local: { actsBytes: fromB64url(line.ink.acts), paperKey: K.paperKeyOf(fromB64url(seed, 64)), family: line.ink.paper, box: line.ink.box, law: line.ink.law } };
    return { url: `/api/books/${encodeURIComponent(bookName)}/film/${it.ink}` };
  };
  // A sheet's seed, to grow it here: published (open), or made with your key (yours).
  const seedOf = (it) => {
    const sheet = book.inks?.get(it.ink)?.ink.sheet;
    if (!sheet) return null;
    if (book.seeds?.get(sheet)) return book.seeds.get(sheet);
    return key && key.publicKey === book.key ? b64url(K.sheetSeed(key.sk, sheet)) : null;
  };

  // the room this page lies in: the owner's own, grown from their key
  const seeds = useMemo(() => roomSeedsOf(book.key), [book.key]);
  const mine = !!(editable && key && book.key && key.publicKey === book.key && skeleton?.surfaces);
  // the world: a fresh sheet on the table, written on in the scene, sealed into the book where it lies
  const fresh = useFreshSheet({
    writer: world && mine ? key : null,
    family: skeleton?.paperFamily ?? null,
    pen,
    onPlace: (line, seed, at) => addInk(line, seed, { page: current, x: Math.round(at.x), y: Math.round(at.y), scale: SCALE_ONE }),
  });
  // the world: a piece of writing on the page picked up (E), its panel open, and set down elsewhere (one move)
  const [held, setHeld] = useState(null); // { id, grab: [dx, dy] (page px, from its corner) }
  useEffect(() => setHeld(null), [current]);
  const heldItem = held ? (page?.items.find((it) => it.id === held.id) ?? null) : null;
  const pageSize = book.page ?? DEFAULT_PAGE;
  // in your own house you sit before a fresh sheet, the pen in your hand (as you came in from the lobby)
  const laid = useRef(false);
  useEffect(() => {
    if (!world || !mine || laid.current || fresh.sheet) return;
    laid.current = true;
    fresh.newPaper({ size: SIZES.half });
  }, [world, mine, fresh]);
  const sheetHand = useMemo(
    () =>
      world && mine && page
        ? {
            held: held?.id ?? null,
            pick(id, p) {
              const it = page.items.find((x) => x.id === id);
              if (it) setHeld({ id, grab: [p.x - it.x, p.y - it.y] });
            },
            down(p) {
              if (!held) return false;
              const it = page.items.find((x) => x.id === held.id);
              setHeld(null);
              if (!it) return true;
              const [w, h] = itemSize(book.inks.get(it.ink).ink, it.scale);
              const x = Math.round(Math.max(0, Math.min(pageSize.width - w, p.x - held.grab[0])));
              const y = Math.round(Math.max(0, Math.min(pageSize.height - h, p.y - held.grab[1])));
              if (x !== it.x || y !== it.y) send({ op: 'move', page: current, item: it.id, x, y });
              return true;
            },
          }
        : null,
    [world, mine, page, held, current, send, book.inks, pageSize.width, pageSize.height],
  );
  // the book pulled down from the shelf is in the hand: the world's panel is its
  useEffect(() => {
    onHold?.(world && reading ? 'book' : null);
  }, [world, reading, onHold]);
  useEffect(() => {
    if (!world || !fresh.sheet) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      fresh.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [world, fresh]);
  async function placeWall(w) {
    if (!w.strokes) {
      w.destroy();
      if (wallRef.current === w) setWall(null);
      return;
    }
    setWallBusy(true);
    try {
      await w.place(addInk);
    } finally {
      setWallBusy(false);
      w.destroy();
      if (wallRef.current === w) setWall(null);
    }
  }
  const wallWriter = useMemo(
    () =>
      mine
        ? {
            down(surface, p, ev, type) {
              const was = wallRef.current;
              if (was?.pen.down(surface, p, ev, type)) return;
              if (was) placeWall(was); // the pen came down elsewhere: what was there is laid down, a new sheet begins
              const next = createWallInk({ writer: key, family: skeleton.surfaces[surface].family, surface, at: p, ...(world ? { color: pen.color, nib: pen.settings() } : { color: wallColor }) });
              wallRef.current = next;
              setWall(next);
              next.pen.down(surface, p, ev, type);
            },
            move: (p, ev) => wallRef.current?.pen.move(p, ev),
            up: (p, ev) => wallRef.current?.pen.up(p, ev),
            cancel: () => wallRef.current?.pen.cancel(),
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mine, key, skeleton?.surfaces, wallColor, world, pen],
  );
  useEffect(() => {
    if (world && wall) wall.setColor(pen.color); // the pen's ink, on the sheet begun on a wall
  }, [world, wall, pen.color]);
  // the shelf: the owner's own book (their journal), until Tabor rules which others stand there
  const shelf = useMemo(() => ({ books: [{ id: 'journal', color: clothOf(seeds) }], onOpen: () => setReading(true) }), [seeds]);
  // together in this room: who else is here, the shared sheets on its table
  const together = useTogether({
    name: fromFile ? null : name,
    key,
    room: book.key ?? null,
    me: user?.username ?? null,
    mine: !!key && key.publicKey === book.key,
    pageW: (book.page ?? DEFAULT_PAGE).width,
    pageH: (book.page ?? DEFAULT_PAGE).height,
    color: world ? pen.color : tableColor,
  });
  // the room's things in the hand (rooms.md §3b): a candle picked up, carried, tilted, set down
  const tableSheets = useMemo(() => together.sheets.map((p) => ({ sheet: p.view.sheet, origin: p.slot, size: [SHARED_PAGE.width, SHARED_PAGE.height] })), [together.sheets]);
  const carry = useCarry({
    name: fromFile ? null : name,
    me: user?.username ?? null,
    key,
    room: book.key ?? null,
    page: [(book.page ?? DEFAULT_PAGE).width, (book.page ?? DEFAULT_PAGE).height],
    sheets: tableSheets,
  });
  const room = useMemo(
    () => ({
      surfaces: skeleton?.surfaces ?? null,
      seeds,
      wallWriter,
      live: wall ? [wall.mark] : [],
      shelf,
      follow,
      gazeAt,
      together: together.scene,
      hand: carry.hand,
      paper: fresh.scene, // the fresh sheet on the table, and the pen on it
      paperWriter: fresh.writer,
      sheetHand,
      world,
    }),
    [skeleton?.surfaces, seeds, wallWriter, wall, shelf, follow, gazeAt, together.scene, carry.hand, fresh.scene, fresh.writer, sheetHand, world],
  );

  if (book.status === 'loading') return <p className="muted">Opening the book…</p>;
  if (book.status === 'private') return <p className="muted">This journal is private. Only their friends can see it.</p>;
  if (book.status === 'error') return <p className="error">Could not open the book: {book.error}</p>;
  const size = book.page ?? DEFAULT_PAGE; // (a house with nothing written in it is still a house: visitors see its room)
  const missing = pageId && !skeleton.pages[pageId];

  function newPage() {
    const typed = window.prompt('Name the new page (letters, numbers, dashes):');
    const id = typed && pageIdFrom(typed);
    if (!id) return;
    if (skeleton.pages[id]) return onPage(id);
    send({ op: 'add_page', page_id: id, background: page.background });
    onPage(id);
  }
  function renamePage() {
    const typed = window.prompt(`Rename "${current}" to:`, current);
    const id = typed && pageIdFrom(typed);
    if (!id || id === current) return;
    if (skeleton.pages[id]) return window.alert(`There is already a page "${id}".`);
    send({ op: 'rename_page', page_id: current, new_id: id });
    onPage(id);
  }
  function removePage() {
    if (!window.confirm(`Remove the page "${current}" and everything written on it? Buttons that lead to it will stop being buttons.`)) return;
    send({ op: 'remove_page', page_id: current });
    onPage(skeleton.home);
  }
  // The page open on the table: its colour, the paper next writing is grown on, its name. (The editor's
  // page tools; in the world, the book's panel.)
  const pageTools = () => (
    <>
      <span className="field">
        <span>Page</span>
        <span className="swatches small" role="group" aria-label="Page background">
          {BACKGROUNDS.map((c) => (
            <button key={c} type="button" title={c} aria-pressed={page.background === c} style={{ '--sig-l': c }} onClick={() => send({ op: 'background', page: current, color: c })} />
          ))}
          <input type="color" value={page.background} onChange={(e) => send({ op: 'background', page: current, color: e.target.value })} title="Any colour" />
        </span>
      </span>
      <FamilyPicker family={skeleton.paperFamily} onChange={(f) => send({ op: 'family', grain: f.grain, weight: f.weight })} />
      <button type="button" className="quiet" onClick={renamePage}>
        Rename page
      </button>
      {current !== skeleton.home && (
        <button type="button" className="quiet" onClick={removePage}>
          Remove page
        </button>
      )}
    </>
  );
  // One piece of writing on the page: its size, a door, its place in the stack, opening it, its
  // film, walking it back, removing it. (The editor's selected tools; in the world, the sheet in hand's panel.)
  const sheetTools = (it, letGo) => (
    <>
      <span className="meta">size {Math.round((it.scale / SCALE_ONE) * 100)}%</span>
      {it.scale !== SCALE_ONE && (
        <button type="button" className="quiet" onClick={() => send({ op: 'resize', page: current, item: it.id, scale: SCALE_ONE })}>
          As written
        </button>
      )}
      <label className="field">
        <span>Door to</span>
        <select
          value={doorValue(it.link)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) return send({ op: 'unlink', page: current, item: it.id });
            const at = v.indexOf(':');
            const kind = v.slice(0, at),
              to = v.slice(at + 1);
            if (kind === 'room' && !to) {
              const name = window.prompt('Whose room? (their name)');
              if (name) send({ op: 'link', page: current, item: it.id, target_room: name.trim() });
              return undefined;
            }
            return send({ op: 'link', page: current, item: it.id, [`target_${kind}`]: to });
          }}
        >
          <option value="">— not a door —</option>
          <optgroup label="A page">
            {pageIds
              .filter((id) => id !== current)
              .map((id) => (
                <option key={id} value={`page:${id}`}>
                  {id}
                </option>
              ))}
          </optgroup>
          {skeleton.surfaces && (
            <optgroup label="The room">
              {Object.keys(skeleton.surfaces).map((id) => (
                <option key={id} value={`surface:${id}`}>
                  {surfaceName(id)}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Someone else">
            {it.link?.room && <option value={`room:${it.link.room}`}>@{it.link.room}'s room</option>}
            <option value="room:">Someone's room…</option>
          </optgroup>
        </select>
      </label>
      {it.link && (
        <button type="button" onClick={() => follow(it.link)}>
          Follow →
        </button>
      )}
      <button type="button" onClick={() => send({ op: 'reorder', page: current, item: it.id, index: page.items.length - 1 })} title="Bring to front">
        Forward
      </button>
      <button type="button" onClick={() => send({ op: 'reorder', page: current, item: it.id, index: 0 })} title="Send to back">
        Back
      </button>
      <OpenSheet line={book.inks.get(it.ink)} opened={book.opened} keyOf={key} onOpen={openSheet} />
      <FilmDownload source={() => filmOf(it)} background={page.background} name={`${bookName}-${it.ink}`} />
      <button type="button" className="quiet" disabled={!seedOf(it)} onClick={() => setWalking(it)} title={seedOf(it) ? 'Why each spot looks the way it does' : 'Unlock to walk back your own sheets'}>
        Walk back
      </button>
      <button
        type="button"
        className="quiet danger"
        onClick={() => {
          send({ op: 'remove', page: current, item: it.id });
          letGo();
        }}
      >
        Delete
      </button>
    </>
  );

  return (
    <section className="journal">
      {!world && (editable || pageIds.length > 1) && (
        <div className="journal-bar">
          <div className="journal-pages" role="tablist" aria-label="Pages">
            {pageIds.map((id) => (
              <button key={id} type="button" role="tab" aria-selected={id === current} onClick={() => onPage(id === skeleton.home ? null : id)}>
                {id === skeleton.home ? '⌂ ' : ''}
                {id}
              </button>
            ))}
            {editing && (
              <button type="button" className="quiet" onClick={newPage} title="Add a page">
                + page
              </button>
            )}
          </div>
          {editable && (
            <div className="cluster">
              {editing && (
                <button type="button" className="primary" aria-pressed={writing} onClick={() => setWriting((w) => !w)}>
                  ✎ <Hand>Write</Hand>
                </button>
              )}
              <button
                type="button"
                className="toggle"
                aria-pressed={preview}
                onClick={() => {
                  setPreview((p) => !p);
                  setWriting(false);
                  setSelected(null);
                }}
              >
                {preview ? 'Back to editing' : 'Preview'}
              </button>
            </div>
          )}
        </div>
      )}

      {editing && <div className="journal-tools">{pageTools()}</div>}

      {editing && writing && <WritePanel family={skeleton.paperFamily} onPlace={place} />}

      {editing && item && (
        <div className="journal-tools selected-tools" role="toolbar" aria-label="Selected writing">
          {sheetTools(item, () => setSelected(null))}
        </div>
      )}

      {walking && seedOf(walking) && <WalkBack line={book.inks.get(walking.ink)} seed={seedOf(walking)} src={looks({ ink: walking.ink, scale: SCALE_ONE })} onClose={() => setWalking(null)} />}
      {error && (
        <p className="error" role="alert">
          {error}{' '}
          <button type="button" className="quiet" onClick={clearError}>
            ok
          </button>
        </p>
      )}
      {missing && <p className="muted">There is no page "{pageId}" in this book, so here is the first page.</p>}

      {!fromFile && !world && (
        <TogetherBar t={together} myRoom={!!key && key.publicKey === book.key} me={user?.username ?? null} family={skeleton.paperFamily} color={tableColor} onColor={setTableColor} />
      )}
      <JournalPage
        pageId={current}
        page={page}
        size={size}
        inks={book.inks}
        editable={editing}
        selected={selected}
        onSelect={setSelected}
        onOp={op}
        onFollow={(id) => follow({ page: id })}
        lookSrc={lookSrc ?? looks}
        sceneSrc={sceneSrc ?? (fromFile ? null : scenes)}
        momentsSrc={momentsSrc}
        room={fromFile ? null : room}
      />
      {world && panel === 'book' && (
        <Panel title="The book, open in your hands">
          <div className="journal-pages" role="tablist" aria-label="Pages">
            {pageIds.map((id) => (
              <button key={id} type="button" role="tab" aria-selected={id === current} onClick={() => onPage(id === skeleton.home ? null : id)}>
                {id === skeleton.home ? '⌂ ' : ''}
                {id}
              </button>
            ))}
            {mine && (
              <button type="button" className="quiet" onClick={newPage} title="Add a page">
                + page
              </button>
            )}
          </div>
          {mine && <div className="journal-tools">{pageTools()}</div>}
          {mine && (
            <p className="book-download">
              <a className="button" href="/api/books/me/download" download={`${bookName}.book`}>
                ↓ Download this book
              </a>{' '}
              <span className="meta">your journal and signature as one .book file</span>
            </p>
          )}
          <button type="button" className="quiet" onClick={() => setReading(false)}>
            Put it back
          </button>
        </Panel>
      )}
      {world && panel === 'sheet' && heldItem && (
        <Panel title="Your writing, in your hand">
          <div className="journal-tools selected-tools">{sheetTools(heldItem, () => setHeld(null))}</div>
          <p className="meta">Tap E to set it down where the pointer is.</p>
        </Panel>
      )}
      {!world && reading && (
        <div className="journal-tools book-open" role="toolbar" aria-label="The book, pulled down from the shelf">
          <span className="meta">The book, open:</span>
          {pageIds.map((id) => (
            <button key={id} type="button" aria-pressed={id === current} onClick={() => onPage(id === skeleton.home ? null : id)}>
              {id}
            </button>
          ))}
          <button type="button" className="quiet" onClick={() => setReading(false)}>
            Put it back
          </button>
        </div>
      )}
      {world && panel === 'pen' && (
        <Panel title="The pen in your hand">
          <PenPanel pen={pen}>
            {fresh.sheet && <FreshSheet fresh={fresh} />}
            {wall && (
              <WallSheet
                wall={wall}
                busy={wallBusy}
                onPlace={() => placeWall(wall)}
                onLetGo={() => {
                  wall.destroy();
                  setWall(null);
                }}
              />
            )}
          </PenPanel>
        </Panel>
      )}
      {world && panel === 'paper' && editable && (
        <Panel title="At your table">
          <KeyGate>{() => <PaperPanel fresh={fresh} family={skeleton.paperFamily} onFamily={(f) => send({ op: 'family', grain: f.grain, weight: f.weight })} />}</KeyGate>
          <TogetherBar t={together} myRoom={!!key && key.publicKey === book.key} me={user?.username ?? null} family={skeleton.paperFamily} color={pen.color} onColor={pen.set.color} />
        </Panel>
      )}
      {world && panel === 'paper' && !editable && (together.others.length > 0 || together.sheets.length > 0) && (
        <Panel title="At their table">
          <TogetherBar t={together} myRoom={false} me={user?.username ?? null} family={skeleton.paperFamily} color={pen.color} onColor={pen.set.color} />
        </Panel>
      )}
      {world && panel === 'candle' && (
        <Panel title="A candle in your hand">
          <p className="meta">Hold E and move the mouse to tilt it; tap E to set it down where the pointer is.</p>
        </Panel>
      )}
      {!world && wall && (
        <div className="journal-tools wall-tools" role="toolbar" aria-label="Writing on the room">
          <span className="meta">On the {wall.surface.replace('-', ' ')}</span>
          <InkWell
            value={wallColor}
            onChange={(c) => {
              setWallColor(c);
              wall.setColor(c);
            }}
          />
          <button type="button" onClick={() => wall.undo()} disabled={wallBusy}>
            Undo
          </button>
          <button type="button" className="primary" onClick={() => placeWall(wall)} disabled={wallBusy}>
            {wallBusy ? 'Sealing…' : 'Place it there'}
          </button>
          <button
            type="button"
            className="quiet"
            onClick={() => {
              wall.destroy();
              setWall(null);
            }}
            disabled={wallBusy}
          >
            Let it go
          </button>
        </div>
      )}
      {editing && !page.items.length && <p className="hint journal-empty">An empty page. Press ✎ Write to put something on it.</p>}
    </section>
  );

  // New writing goes in the middle of what's on screen of this page, as written.
  async function place(sealed) {
    const el = document.querySelector('.journal-page');
    const r = el.getBoundingClientRect();
    const k = r.width / size.width;
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    const midY = bottom > top ? (top + bottom) / 2 : r.top + r.height / 2; // the page's middle if none of it is in view
    const [w, h] = itemSize(sealed.line.ink, SCALE_ONE);
    const x = Math.round(Math.max(0, size.width / 2 - w / 2));
    const y = Math.round(Math.max(0, Math.min(size.height - h, (midY - r.top) / k - h / 2)));
    const id = await addInk(sealed.line, sealed.seed, { page: current, x, y, scale: SCALE_ONE });
    if (id) {
      setSelected(id);
      setWriting(false);
    }
  }
}

// The sheet begun on a wall, in the pen's panel: a stroke lifted, sealed there, or let go.
function WallSheet({ wall, busy, onPlace, onLetGo }) {
  return (
    <div className="stack wall-sheet">
      <p className="meta">On the {wall.surface.replace('-', ' ')}</p>
      <div className="row">
        <button type="button" className="quiet" onClick={() => wall.undo()} disabled={busy}>
          Undo
        </button>
        <button type="button" onClick={onPlace} disabled={busy}>
          {busy ? 'Sealing…' : 'Seal it there'}
        </button>
        <button type="button" className="quiet" onClick={onLetGo} disabled={busy}>
          Let it go
        </button>
      </div>
    </div>
  );
}

// Write something on a page-wide pad (a fresh sheet of your paper, growing
// live), then seal it and put it on the page.
function WritePanel({ family, onPlace }) {
  return <KeyGate signedOut={<p className="muted">Sign in to write.</p>}>{(key) => <WriteSheet key={key.publicKey} writer={key} family={family} onPlace={onPlace} />}</KeyGate>;
}

// A dip pen's reservoir (law 3: rooms.md §3c): this many well levels (Tabor's to set).
const DIP_WELL = 2;
function WriteSheet({ writer, family, onPlace }) {
  const [n, setN] = useState(0);
  const [dip, setDip] = useState(false); // a fountain pen (never runs dry), or a dip pen and the ink jar
  const sheet = useMemo(() => newSheet(writer), [writer, n, dip]); // eslint-disable-line react-hooks/exhaustive-deps
  const ink = useLiveInk({ paperKey: sheet.paperKey, family, size: WRITE_PAD, ...(dip ? { law: 3 } : {}) }, sheet.sheet);
  const [color, setColor] = useState(INK_COLORS[0].hex);
  const [strokes, setStrokes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function put() {
    setBusy(true);
    setError(null);
    try {
      const settled = await ink.settle();
      if (!settled?.box[2]) throw new Error('Nothing to place yet.');
      const { line } = sealInk(writer, { sheet: sheet.sheet, seed: sheet.seed, use: 'book', family, settled });
      await onPlace({ line, seed: b64url(sheet.seed) });
      setN((v) => v + 1); // the next writing is a new sheet
    } catch (err) {
      setError(err.law ? 'That is more ink than one sheet can hold. Undo some, or place it in parts.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="write-panel">
      <div className="row">
        <span className="field">
          <span>Ink</span>
          <InkWell value={color} onChange={setColor} />
        </span>
        <label className="field" title="A fountain pen keeps its own ink; a dip pen draws from the jar and its line fades until you dip again">
          <input type="checkbox" checked={dip} disabled={strokes > 0} onChange={(e) => setDip(e.target.checked)} /> Dip pen
        </label>
        <span className="spacer" />
        <button type="button" className="primary" disabled={!strokes || busy} onClick={put}>
          {busy ? 'Sealing…' : 'Place on page'}
        </button>
      </div>
      {ink && (
        <Pad
          key={sheet.sheet}
          ink={ink}
          size={WRITE_PAD}
          inkColor={color}
          onChange={setStrokes}
          dipPen={dip ? { well: DIP_WELL } : null}
          hint="Write anything: a word, a sentence, a drawing. Colours mix while wet; the water brush wets dry ink again. Then place it on the page."
        />
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// The paper new sheets are written on: grain and weight (0 to 15). Each sheet
// keeps the family it was written on; this only changes what comes next.
function FamilyPicker({ family, onChange }) {
  const f = family ?? { grain: 8, weight: 8, tooth: 0 };
  const opt = (v) => (
    <option key={v} value={v}>
      {v}
    </option>
  );
  const range = [...Array(16).keys()];
  return (
    <span className="field" title="The paper your next writing is grown on">
      <span>Paper</span>
      <label className="meta">
        grain{' '}
        <select value={f.grain} onChange={(e) => onChange({ ...f, grain: Number(e.target.value) })}>
          {range.map(opt)}
        </select>
      </label>
      <label className="meta">
        weight{' '}
        <select value={f.weight} onChange={(e) => onChange({ ...f, weight: Number(e.target.value) })}>
          {range.map(opt)}
        </select>
      </label>
    </span>
  );
}

// Open a sheet: publish its seed, signed open by your key, so anyone can grow
// its paper and check the ink settles exactly as sealed. It cannot be closed again.
function OpenSheet({ line, opened, keyOf, onOpen }) {
  if (!line?.ink || line.ink.use !== 'book') return null;
  if (opened?.has(line.ink.sheet))
    return (
      <span className="meta" title="Its paper is public: anyone can regrow it">
        open sheet
      </span>
    );
  const open = () => {
    if (!window.confirm('Open this sheet? Its paper becomes public, so anyone can check the ink grows exactly as you sealed it. This cannot be undone.')) return;
    const seed = K.sheetSeed(keyOf.sk, line.ink.sheet);
    const { by } = openBy(keyOf, K.recordDigest(line.ink), line.ink.sheet, seed);
    onOpen(line.ink.sheet, by);
  };
  return (
    <button type="button" className="quiet" disabled={!keyOf} onClick={open} title={keyOf ? 'Publish the paper of this sheet' : 'Unlock to open sheets'}>
      Open sheet
    </button>
  );
}
