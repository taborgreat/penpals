import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useKey } from '../keys/session.js';
import { useHouse } from './useHouse.js';
import { RULE_MM } from '../book/ruled.js';
import { paper as P, hands as H } from 'penpals-law';
import SceneView from '../scene/SceneView.jsx';
import { roomSeedsOf } from './seeds.js';
import { useTogether } from './together.js';
import { useCarry } from './carry.js';
import { worldNow } from './world.js';
import { useHands } from './hands.js';
import { usePens, stickPen } from './pens.js';
import { useThings, roomAct } from './presence.js';
import { usePaperFields } from './papers.js';
import Panel from '../components/Panel.jsx';
import PenPanel from '../components/PenPanel.jsx';
import PaperLook from '../components/PaperLook.jsx';
import KeyGate from '../components/KeyGate.jsx';

// A house (one-world.md; rooms.md §1–§6): its owner's space, grown from their key, under the one world
// clock. Its room (walls, floor, ceiling, the table, the shelf), the ink on its surfaces (rooms.md §2: its
// owner's pen pointed at one, from Look: ink deposited on that matter, room/together.js), who else is here,
// the papers lying in it and your hand
// on them (room/together.js: law/paper.js), the room's things in the hand (room/carry.js), and out of its
// door, the world (outside.md). Paper is matter: taken up (E), carried, let go anywhere (E), posted into a
// mailbox (E at it), saved into your book; nothing else moves it.
//
// The one panel (room/panel.js) follows what is in your hand: the pen (components/PenPanel.jsx), a paper
// (into your book, at a path), the book pulled down from the shelf (the papers in it: one taken out), a
// candle, the stamper; at your own table with nothing in hand, new paper.
const PAGE = [1000, 1400]; // (page px: the writing place in front of the chair, the camera's home)
// The dye of the cloth a book on the shelf is bound in (rooms.md §3): one of these, by its owner's key (as if
// ink on white: engine.js dyes the cloth's own threads with it). Tabor's to set.
const CLOTHS = [
  [104, 28, 32],
  [32, 64, 44],
  [30, 40, 76],
  [92, 62, 36],
  [58, 40, 70],
];
const clothOf = (seeds) => CLOTHS[(seeds?.table?.[0] ?? 0) % CLOTHS.length];

export default function House({ name, editable = false, panel = null, onHold = null }) {
  const book = useHouse(name);
  const { user } = useAuth();
  const key = useKey(user);
  // the pens on the table (law/room.js PENS), their settings their facts on the room's chain; the one
  // in the hand writes (the world's)
  const roomThings = useThings(name);
  const penAct = useCallback((a) => (key && book.key && name ? roomAct(name, key, book.key, a) : null), [key, book.key, name]);
  const pens = usePens({ things: roomThings, act: penAct });
  const pen = pens.pen;
  const [reading, setReading] = useState(false); // the book pulled down from the shelf
  const navigate = useNavigate();
  const arrive = useLocation().state?.arrive ?? null; // (come in through this house's door, from outside)
  const bookName = book.name ?? name;
  // the room this house is: its owner's, grown from their key
  const seeds = useMemo(() => roomSeedsOf(book.key), [book.key]);
  // the book pulled down from the shelf is in the hand: the world's panel is its
  useEffect(() => {
    onHold?.(reading ? 'book' : null);
  }, [reading, onHold]);
  // the shelf: the owner's book
  const shelf = useMemo(() => ({ books: [{ id: 'book', color: clothOf(seeds) }], onOpen: () => setReading(true) }), [seeds]);
  // where the house stands among the others (law/world.js): the outside is grown around it (outside.md Phase 4)
  const [houses, setHouses] = useState(null);
  useEffect(() => {
    let alive = true;
    worldNow()
      .then((w) => alive && setHouses(w.houses ?? []))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [book.key]);
  const plot = houses?.find((h) => h.key === book.key)?.plot ?? null;
  const outside = useMemo(() => (plot ? { plot, houses } : null), [plot?.join(), houses]); // eslint-disable-line react-hooks/exhaustive-deps
  // what hands have done outside, and yours (outside.md Phase 5)
  const handsNow = useHands({ key });
  // a carved stick in your hand, brought in from outside (outside.md §2.5, §2.6): it is the pen you write with,
  // as fine as it was carved; clicked on the jar, it is dipped (room/pens.js stickPen)
  const stickHeld = useMemo(() => {
    const f = handsNow.facts,
      me = key?.publicKey;
    if (!f || !me) return null;
    const id = [...f.things]
      .filter(([t, h]) => t.startsWith('stick:') && h.at === null && h.by === me)
      .map(([t]) => t)
      .at(-1);
    const tip = id ? H.tipOf(f, id) : null;
    return tip && { id, tip };
  }, [handsNow.facts, key?.publicKey]);
  const [stickDips, setStickDips] = useState({ id: null, n: 0 });
  const dipsNow = stickHeld && stickDips.id === stickHeld.id ? stickDips.n : 0;
  const writing = useMemo(() => (stickHeld ? stickPen(stickHeld.tip, dipsNow) : pen), [stickHeld, dipsNow, pen]);
  const pensInHand = useMemo(() => (stickHeld ? { ...pens, pen: writing, stick: true, dip: () => setStickDips({ id: stickHeld.id, n: dipsNow + 1 }) } : pens), [stickHeld, pens, writing, dipsNow]);
  const hands = useMemo(() => ({ ...handsNow, me: key?.publicKey ?? null }), [handsNow.facts, handsNow.act, key?.publicKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // new papers are grown on the paper you choose at your table (law/paper.js: its family is its birth's)
  const [family, setFamily] = useState(null);
  useEffect(() => {
    if (book.family && !family) setFamily(book.family);
  }, [book.family]); // eslint-disable-line react-hooks/exhaustive-deps
  const together = useTogether({
    name,
    key,
    room: book.key ?? null,
    me: user?.username ?? null,
    mine: !!key && key.publicKey === book.key,
    pageW: PAGE[0],
    pageH: PAGE[1],
    pen: writing,
    family,
    plot,
  });
  // the room's things in the hand (rooms.md §3b): a candle picked up, carried, tilted, set down
  const carry = useCarry({ name, me: user?.username ?? null, key, room: book.key ?? null, pens: pensInHand });
  // Ctrl+Z, the pen in the hand: your last stroke lifted from the paper you last wrote on
  useEffect(() => {
    if (panel !== 'pen') return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select') || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      together.lift();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, together]);

  if (book.status === 'loading') return <p className="muted">Opening the house…</p>;
  if (book.status === 'private') return <p className="muted">This house is private.</p>;
  if (book.status === 'error') return <p className="error">Could not open the house: {book.error}</p>;
  const myHouse = !!key && key.publicKey === book.key;

  return (
    <section className="house">
      {together.notice && (
        <p className="error world-note" role="alert">
          {together.notice}{' '}
          <button type="button" className="quiet" onClick={together.clearNotice}>
            ok
          </button>
        </p>
      )}
      <div className="house-view" style={{ aspectRatio: `${PAGE[0]} / ${PAGE[1]}` }}>
        <SceneView
          className="house-scene"
          page={PAGE}
          mode="3d"
          sheets={together.scene.sheets}
          seeds={seeds}
          marks={together.scene.marks}
          flames={together.scene.flames}
          onSeen={together.scene.onSeen}
          ash={together.scene.ash}
          fireGives={together.scene.fireGives}
          waxLying={together.scene.waxLying}
          wallWriter={together.scene.wallWriter}
          shelf={shelf}
          beings={together.scene.beings}
          onPose={together.scene.onPose}
          tableWriter={together.scene.tableWriter}
          heard={together.scene.heard}
          papers={together.scene.papers}
          opens={together.scene.opens}
          arrive={arrive}
          onEnter={(h, pose) => h.name && navigate(`/u/${encodeURIComponent(h.name)}`, { state: { arrive: pose } })}
          onHouseDoor={(h) => key && h.name && roomAct(h.name, key, h.key, { act: h.open ? 'shut' : 'open', thing: 'door' }, { k: Date.now() })}
          space={book.key ?? null}
          outside={outside}
          hands={hands}
          hand={carry.hand}
          world
        />
      </div>
      {panel === 'book' && (
        <Panel title={myHouse ? 'Your book, open in your hands' : 'A book, in your hands'}>
          {myHouse ? <BookPanel t={together} /> : <p className="meta">It is @{bookName}'s: what is in it is theirs.</p>}
          {myHouse && (
            <p className="book-download">
              <a className="button" href="/api/books/me/download" download={`${bookName}.book`}>
                ↓ Download your book
              </a>{' '}
              <span className="meta">everything you made, and your signature, as one .book file</span>
            </p>
          )}
          <button type="button" className="quiet" onClick={() => setReading(false)}>
            Put it back
          </button>
        </Panel>
      )}
      {panel === 'paper' && together.held && (
        <Panel title="A paper in your hand">
          {together.held.ownerKey === key?.publicKey && <Shelve t={together} />}
          <p className="meta">Tap E to let it go where the pointer is (on a table, the floor, outside). At someone's mailbox, by their door, E posts it to them.</p>
        </Panel>
      )}
      {panel === 'pen' && stickHeld && (
        <Panel title="A carved stick in your hand">
          <p className="meta">
            Its tip is {(stickHeld.tip.r * 2000).toFixed(1)} mm across: carve it finer with a stone outside.{' '}
            {writing.dipped ? "It holds the jar's ink." : 'Dry, it only scratches: click the jar with it to dip it.'}
          </p>
        </Panel>
      )}
      {panel === 'pen' && !stickHeld && (
        <Panel title="The pen in your hand">
          <PenPanel pen={pen}>
            <button type="button" className="quiet" onClick={() => together.lift()} title="Ctrl+Z: its pigment goes, the water and the dents it left stay">
              Lift my last stroke
            </button>
          </PenPanel>
        </Panel>
      )}
      {panel === 'table' && editable && (
        <Panel title="At your table">
          <KeyGate>{() => <NewPaper family={family} onFamily={setFamily} onNew={together.newPaper} />}</KeyGate>
        </Panel>
      )}
      {panel === 'stamper' && <StamperPanel t={together} />}
      {panel === 'candle' && carry.hand.which !== null && (
        <Panel title="A candle in your hand">
          <div className="row">
            {together.candleLit(carry.hand.which) ? (
              <button type="button" onClick={() => together.lightCandle(carry.hand.which, false)}>
                Put it out
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => together.lightCandle(carry.hand.which, true)}>
                Light it
              </button>
            )}
          </div>
          <p className="meta">Melting is the flame's: you wait for it. Hold E and move the mouse to tilt it; tap E to set it down where the pointer is.</p>
        </Panel>
      )}
    </section>
  );
}

// At your table with nothing in hand: one more paper on it, somewhere on it, grown on the paper you choose
// (grain and weight: law/v1/paper.js; its size: law/paper.js SIZES).
const RANGE = [...Array(16).keys()];
function NewPaper({ family, onFamily, onNew }) {
  const f = family ?? { grain: 8, weight: 8, tooth: 0 };
  const pick = (field) => (e) => onFamily({ ...f, [field]: Number(e.target.value) });
  const [page, setPage] = useState('half');
  const [rule, setRule] = useState(0);
  return (
    <div className="stack paper-panel">
      <div className="field" title="The paper the next one is grown on">
        <span>Paper</span>
        {['grain', 'weight'].map((field) => (
          <label key={field} className="meta">
            {field}{' '}
            <select value={f[field]} onChange={pick(field)}>
              {RANGE.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="field">
        <span>Page</span>
        <select value={page} onChange={(e) => setPage(e.target.value)}>
          <option value="half">half</option>
          <option value="full">full</option>
        </select>
      </label>
      <label className="field" title="Ruled: its lines ruled in ink as it is made, this far apart">
        <span>Lines</span>
        <select value={rule} onChange={(e) => setRule(Number(e.target.value))}>
          <option value={0}>none</option>
          {RULE_MM.map((mm) => (
            <option key={mm} value={mm}>
              {mm} mm apart
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="primary" onClick={() => onNew({ size: P.SIZES[page], rule })} disabled={!family}>
        New paper
      </button>
      <p className="meta">It lies somewhere on your table. Pick up a pen to write on it; E takes a paper up, and lets it go.</p>
    </div>
  );
}

// The paper in your hand, saved into your book: at a path (book names, from its top), one already in it or
// a new one.
function Shelve({ t }) {
  const paths = useMemo(() => [...new Set(t.book.map((v) => v.where.book.join(' / ')))].sort(), [t.book]);
  const [path, setPath] = useState(paths[0] ?? 'letters');
  const parts = path
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (parts.length) t.shelve(parts);
      }}
    >
      <label className="field">
        <span>Into your book, at</span>
        <input list="book-paths" value={path} onChange={(e) => setPath(e.target.value)} placeholder="letters / from ana" aria-label="Where in your book" />
        <datalist id="book-paths">
          {paths.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>
      <button type="submit" className="primary" disabled={!parts.length || parts.length > 8}>
        Save it into your book
      </button>
    </form>
  );
}

// Your book, open: its papers in the tree of their paths, each one grown; one taken out is in your hand.
function BookPanel({ t }) {
  const fields = usePaperFields(t.book);
  const tree = useMemo(() => {
    const byPath = new Map();
    for (const v of t.book) {
      const p = v.where.book.join(' / ');
      byPath.set(p, [...(byPath.get(p) ?? []), v]);
    }
    return [...byPath].sort(([a], [b]) => a.localeCompare(b));
  }, [t.book]);
  if (!t.book.length) return <p className="meta">Nothing in it yet. A paper of yours in your hand can be saved into it.</p>;
  return (
    <div className="stack book-tree">
      {tree.map(([path, views]) => (
        <details key={path} open>
          <summary>{path}</summary>
          <div className="book-papers">
            {views.map((v) => (
              <figure key={v.paper} className="book-paper" data-paper={v.paper}>
                <PaperLook field={fields.get(v.paper)?.field ?? null} size={v.birth.size} />
                <figcaption className="meta">
                  {new Date(v.born).toLocaleDateString()}{' '}
                  <button type="button" className="quiet" onClick={() => t.takeOut(v)} disabled={!!t.held}>
                    Take it out
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

// The stamper in your hand (one-world.md, the panel; rooms.md §3b, §5): type the name whose signature its
// face takes; then a click on a paper of yours presses it into the warm wax there. E sets it down.
function StamperPanel({ t }) {
  const [name, setName] = useState('');
  const face = t.tool?.seal ?? null;
  return (
    <Panel title="The stamper in your hand">
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) t.stamperFor(name.trim().replace(/^@/, ''));
        }}
      >
        <input aria-label="Whose seal" placeholder="their name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="primary" disabled={!name.trim()}>
          Set its face
        </button>
      </form>
      <p className="meta">
        {face
          ? `Its face is @${face.name}'s signature, in relief: drip wax on a paper of yours and press it there while the wax is warm. Their name in it, they may write on that paper; your bare hand on the seal cracks it.`
          : 'Its face is blank.'}{' '}
        Tap E to set it down.
      </p>
    </Panel>
  );
}
