import { useCallback, useEffect, useState } from 'react';
import Pad from '../components/Pad.jsx';
import Hand from '../components/Hand.jsx';
import { SIGNATURE_COLORS } from '../hand/colors.js';
import { useBook } from './useBook.js';
import { inkFromStrokes } from './ink.js';
import { pageIdFrom } from './ops.js';
import JournalPage from './JournalPage.jsx';

// The living journal (books.md, Part B): a book of handwritten pages. The owner
// writes anything anywhere, then moves, resizes, recolours and links it; every
// change is one micro edit. Visitors see the same pages, and writing that's a
// button takes them to its page. Every page has its own link (onPage).
const WRITE_PAD = { width: 1000, height: 470 }; // writing is placed at the size it was written on a page-wide pad
const INK_COLORS = SIGNATURE_COLORS.map((c) => ({ id: c.id, name: c.name, hex: c.light }));
const BACKGROUNDS = ['#f6f1e7', '#ffffff', '#f2e8d0', '#e8eef6', '#f6e6e6', '#e7f1e6', '#2b2a33', '#1f2a40'];
const DEFAULT_PAGE = { width: 1000, height: 1400 };

export default function Journal({ name, pageId, editable = false, onPage, fromFile = null }) {
  const { book, send, addInk, error, clearError } = useBook(name, fromFile);
  const [selected, setSelected] = useState(null);
  const [writing, setWriting] = useState(false);
  const [preview, setPreview] = useState(false);
  const editing = editable && !preview;

  const skeleton = book.skeleton;
  const current = skeleton && (pageId && skeleton.pages[pageId] ? pageId : skeleton.home);
  const page = skeleton?.pages[current];
  const item = page?.items.find((it) => it.id === selected) ?? null;
  const pageIds = skeleton ? Object.keys(skeleton.pages) : [];

  useEffect(() => setSelected(null), [current]);

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
                {id === skeleton.home ? '⌂ ' : ''}{id}
              </button>
            ))}
            {editing && <button type="button" className="quiet" onClick={newPage} title="Add a page">+ page</button>}
          </div>
          {editable && (
            <div className="cluster">
              {editing && (
                <button type="button" className="primary" aria-pressed={writing} onClick={() => setWriting((w) => !w)}>
                  ✎ <Hand>Write</Hand>
                </button>
              )}
              <button type="button" className="toggle" aria-pressed={preview} onClick={() => { setPreview((p) => !p); setWriting(false); setSelected(null); }}>
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
                <button key={c} type="button" title={c} aria-pressed={page.background === c} style={{ '--sig-l': c, '--sig-d': c }} onClick={() => send({ op: 'background', page: current, color: c })} />
              ))}
              <input type="color" value={page.background} onChange={(e) => send({ op: 'background', page: current, color: e.target.value })} title="Any colour" />
            </span>
          </span>
          <button type="button" className="quiet" onClick={renamePage}>Rename page</button>
          {current !== skeleton.home && <button type="button" className="quiet" onClick={removePage}>Remove page</button>}
        </div>
      )}

      {editing && writing && <WritePanel onPlace={(ink, color) => place(ink, color)} />}

      {editing && item && (
        <div className="journal-tools selected-tools" role="toolbar" aria-label="Selected writing">
          <span className="field">
            <span>Colour</span>
            <span className="swatches small" role="group" aria-label="Ink colour">
              {INK_COLORS.map((c) => (
                <button key={c.id} type="button" title={c.name} aria-pressed={item.color === c.hex} style={{ '--sig-l': c.hex, '--sig-d': c.hex }} onClick={() => send({ op: 'recolor', page: current, item: item.id, color: c.hex })} />
              ))}
              <input type="color" value={item.color} onChange={(e) => send({ op: 'recolor', page: current, item: item.id, color: e.target.value })} title="Any colour" />
            </span>
          </span>
          <label className="field">
            <span>Button to</span>
            <select
              value={item.link?.page ?? ''}
              onChange={(e) => send(e.target.value
                ? { op: 'link', page: current, item: item.id, target_page: e.target.value }
                : { op: 'unlink', page: current, item: item.id })}
            >
              <option value="">— not a button —</option>
              {pageIds.filter((id) => id !== current).map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
          </label>
          {item.link && <button type="button" onClick={() => onPage(item.link.page === skeleton.home ? null : item.link.page)}>Follow →</button>}
          <button type="button" onClick={() => send({ op: 'reorder', page: current, item: item.id, index: page.items.length - 1 })} title="Bring to front">Forward</button>
          <button type="button" onClick={() => send({ op: 'reorder', page: current, item: item.id, index: 0 })} title="Send to back">Back</button>
          <button type="button" className="quiet danger" onClick={() => { send({ op: 'remove', page: current, item: item.id }); setSelected(null); }}>Delete</button>
        </div>
      )}

      {error && <p className="error" role="alert">{error} <button type="button" className="quiet" onClick={clearError}>ok</button></p>}
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
      />
      {editing && !page.items.length && <p className="hint journal-empty">An empty page. Press ✎ Write to put something on it.</p>}
    </section>
  );

  // New writing goes in the middle of what's on screen of this page.
  async function place(ink, color) {
    const el = document.querySelector('.journal-page');
    const r = el.getBoundingClientRect();
    const k = r.width / size.width;
    const top = Math.max(r.top, 0);
    const bottom = Math.min(r.bottom, window.innerHeight);
    const midY = bottom > top ? (top + bottom) / 2 : r.top + r.height / 2; // the page's middle if none of it is in view
    const x = Math.round(size.width / 2 - ink.bounds[0] / 2);
    const y = Math.round(Math.max(0, Math.min(size.height - ink.bounds[1], (midY - r.top) / k - ink.bounds[1] / 2)));
    const id = await addInk(ink, { page: current, x, y, scale: 1, color });
    if (id) {
      setSelected(id);
      setWriting(false);
    }
  }
}

// Write something on a page-wide pad, then put it on the page.
function WritePanel({ onPlace }) {
  const [result, setResult] = useState(null);
  const [color, setColor] = useState(INK_COLORS[0].hex);
  const [busy, setBusy] = useState(false);
  const onResult = useCallback((r) => setResult(r), []);
  const ink = result ? inkFromStrokes(result.strokesData.strokes) : null;

  return (
    <div className="write-panel">
      <div className="row">
        <span className="field">
          <span>Ink</span>
          <span className="swatches small" role="group" aria-label="Ink colour">
            {INK_COLORS.map((c) => (
              <button key={c.id} type="button" title={c.name} aria-pressed={color === c.hex} style={{ '--sig-l': c.hex, '--sig-d': c.hex }} onClick={() => setColor(c.hex)} />
            ))}
          </span>
        </span>
        <span className="spacer" />
        <button
          type="button"
          className="primary"
          disabled={!ink || busy}
          onClick={async () => {
            setBusy(true);
            await onPlace(ink, color);
            setBusy(false);
          }}
        >
          {busy ? 'Placing…' : 'Place on page'}
        </button>
      </div>
      <Pad size={WRITE_PAD} onResult={onResult} inkColor={color} hint="Write anything: a word, a sentence, a drawing. Then place it on the page." />
    </div>
  );
}
