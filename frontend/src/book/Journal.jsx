import { useCallback, useEffect, useMemo, useState } from 'react';
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

// The living journal (books.md, Part B; keys.md): a book of handwritten pages.
// The owner writes anything anywhere (each piece a sheet of the law's paper,
// sealed by their key), then moves, resizes and links it; every layout change
// is one micro edit. Visitors see the same pages, each piece as its settled
// look, and writing that's a button takes them to its page. Every page has its
// own link (onPage). A sheet's paper is the writer's secret until they open it.
const WRITE_PAD = { width: 1000, height: 470 }; // writing is placed at the size it was written on a page-wide pad
const INK_COLORS = SIGNATURE_COLORS.map((c) => ({ id: c.id, name: c.name, hex: c.light }));
const BACKGROUNDS = ['#f6f1e7', '#ffffff', '#f2e8d0', '#e8eef6', '#f6e6e6', '#e7f1e6', '#2b2a33', '#1f2a40'];
const DEFAULT_PAGE = { width: 1000, height: 1400 };

export default function Journal({ name, pageId, editable = false, onPage, fromFile = null, lookSrc = null, sceneSrc = null }) {
  const { book, send, addInk, openSheet, error, clearError } = useBook(name, fromFile);
  const { user } = useAuth();
  const key = useKey(user);
  const [selected, setSelected] = useState(null);
  const [writing, setWriting] = useState(false);
  const [preview, setPreview] = useState(false);
  const [walking, setWalking] = useState(null); // the item being walked back
  const editing = editable && !preview;

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

  if (book.status === 'loading') return <p className="muted">Opening the book…</p>;
  if (book.status === 'private') return <p className="muted">This journal is private. Only their friends can see it.</p>;
  if (book.status === 'error') return <p className="error">Could not open the book: {book.error}</p>;
  const size = book.page ?? DEFAULT_PAGE;
  // Nothing written in the whole book yet: visitors see nothing rather than a blank page.
  if (!editable && Object.values(skeleton.pages).every((p) => !p.items.length)) return null;
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

  return (
    <section className="journal">
      {(editable || pageIds.length > 1) && (
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

      {editing && (
        <div className="journal-tools">
          <span className="field">
            <span>Page</span>
            <span className="swatches small" role="group" aria-label="Page background">
              {BACKGROUNDS.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  aria-pressed={page.background === c}
                  style={{ '--sig-l': c, '--sig-d': c }}
                  onClick={() => send({ op: 'background', page: current, color: c })}
                />
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
        </div>
      )}

      {editing && writing && <WritePanel family={skeleton.paperFamily} onPlace={place} />}

      {editing && item && (
        <div className="journal-tools selected-tools" role="toolbar" aria-label="Selected writing">
          <span className="meta">size {Math.round((item.scale / SCALE_ONE) * 100)}%</span>
          {item.scale !== SCALE_ONE && (
            <button type="button" className="quiet" onClick={() => send({ op: 'resize', page: current, item: item.id, scale: SCALE_ONE })}>
              As written
            </button>
          )}
          <label className="field">
            <span>Button to</span>
            <select
              value={item.link?.page ?? ''}
              onChange={(e) => send(e.target.value ? { op: 'link', page: current, item: item.id, target_page: e.target.value } : { op: 'unlink', page: current, item: item.id })}
            >
              <option value="">— not a button —</option>
              {pageIds
                .filter((id) => id !== current)
                .map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
            </select>
          </label>
          {item.link && (
            <button type="button" onClick={() => onPage(item.link.page === skeleton.home ? null : item.link.page)}>
              Follow →
            </button>
          )}
          <button type="button" onClick={() => send({ op: 'reorder', page: current, item: item.id, index: page.items.length - 1 })} title="Bring to front">
            Forward
          </button>
          <button type="button" onClick={() => send({ op: 'reorder', page: current, item: item.id, index: 0 })} title="Send to back">
            Back
          </button>
          <OpenSheet line={book.inks.get(item.ink)} opened={book.opened} keyOf={key} onOpen={openSheet} />
          <FilmDownload source={() => filmOf(item)} background={page.background} name={`${bookName}-${item.ink}`} />
          <button
            type="button"
            className="quiet"
            disabled={!seedOf(item)}
            onClick={() => setWalking(item)}
            title={seedOf(item) ? 'Why each spot looks the way it does' : 'Unlock to walk back your own sheets'}
          >
            Walk back
          </button>
          <button
            type="button"
            className="quiet danger"
            onClick={() => {
              send({ op: 'remove', page: current, item: item.id });
              setSelected(null);
            }}
          >
            Delete
          </button>
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

      <JournalPage
        pageId={current}
        page={page}
        size={size}
        inks={book.inks}
        editable={editing}
        selected={selected}
        onSelect={setSelected}
        onOp={op}
        onFollow={(id) => onPage(id === skeleton.home ? null : id)}
        lookSrc={lookSrc ?? looks}
        sceneSrc={sceneSrc ?? (fromFile ? null : scenes)}
        momentsSrc={momentsSrc}
      />
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

// Write something on a page-wide pad (a fresh sheet of your paper, growing
// live), then seal it and put it on the page.
function WritePanel({ family, onPlace }) {
  return <KeyGate signedOut={<p className="muted">Sign in to write.</p>}>{(key) => <WriteSheet key={key.publicKey} writer={key} family={family} onPlace={onPlace} />}</KeyGate>;
}

function WriteSheet({ writer, family, onPlace }) {
  const [n, setN] = useState(0);
  const sheet = useMemo(() => newSheet(writer), [writer, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const ink = useLiveInk({ paperKey: sheet.paperKey, family, size: WRITE_PAD }, sheet.sheet);
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
