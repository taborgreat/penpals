import { useLayoutEffect, useRef, useState } from 'react';
import InkItem from './InkItem.jsx';
import { itemSize, clampScale } from './ink.js';

// One page of a journal: its background, and its writing in list order (later
// items on top). Each item is a sealed record's look; `lookSrc(item, line)`
// says where its look comes from (the server, or grown here for a .book). The page is a fixed logical canvas (`size`, e.g. 1000 × 1400)
// scaled to the width it's given.
//
// View mode: writing that links to a page is a button that goes there.
// Edit mode (`editable`): a tap selects, dragging moves, the corner handle
// resizes; each finished gesture is one edit (`onOp`).
export default function JournalPage({ pageId, page, size, inks, editable, selected, onSelect, onOp, onFollow, lookSrc }) {
  const ref = useRef(null);
  const [k, setK] = useState(0); // CSS px per page unit

  useLayoutEffect(() => {
    const el = ref.current;
    const measure = () => setK(el.clientWidth / size.width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.width]);

  return (
    <div
      ref={ref}
      className={`journal-page${editable ? ' editing' : ''}`}
      style={{ background: page.background, aspectRatio: `${size.width} / ${size.height}` }}
      onPointerDown={(e) => { if (editable && e.target === ref.current) onSelect(null); }}
    >
      {k > 0 && page.items.map((item) => {
        const line = inks.get(item.ink);
        if (!line?.ink) return null;
        return (
          <Item
            key={item.id}
            item={item}
            body={line.ink}
            src={lookSrc(item, line)}
            k={k}
            screenScale={() => ref.current.getBoundingClientRect().width / size.width}
            editable={editable}
            selected={selected === item.id}
            onSelect={() => onSelect(item.id)}
            onMove={(x, y) => onOp({ op: 'move', page: pageId, item: item.id, x, y })}
            onResize={(scale) => onOp({ op: 'resize', page: pageId, item: item.id, scale })}
            onFollow={() => item.link && onFollow(item.link.page)}
          />
        );
      })}
    </div>
  );
}

const round = (v) => Math.round(v * 10) / 10;

// `k` places the item in the page's own CSS px; `screenScale()` is page units
// to screen px, for gestures (they differ when the page is inside CSS zoom).
function Item({ item, body, src, k, screenScale, editable, selected, onSelect, onMove, onResize, onFollow }) {
  const [draft, setDraft] = useState(null); // { x, y, scale } while being dragged
  const gesture = useRef(null);
  const x = draft?.x ?? item.x;
  const y = draft?.y ?? item.y;
  const scale = draft?.scale ?? item.scale;
  const [w, h] = itemSize(body, scale);
  const style = { left: x * k, top: y * k, width: w * k, height: h * k };
  const art = <InkItem src={src} body={body} />; // stretched while dragged, grown again at the new size after

  if (!editable) {
    if (!item.link) return <span className="ink-item" style={style} role="img" aria-label="handwriting">{art}</span>;
    return (
      <button type="button" className="ink-item ink-link" style={style} onClick={onFollow} title={`Go to ${item.link.page}`} aria-label={`Go to the page ${item.link.page}`}>
        {art}
      </button>
    );
  }

  const start = (e, kind) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* a pointer that can't be captured still drags while it stays over the item */ }
    gesture.current = { kind, px: e.clientX, py: e.clientY, x: item.x, y: item.y, scale: item.scale, w: itemSize(body, item.scale)[0], ks: screenScale() };
  };
  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    const dx = (e.clientX - g.px) / g.ks;
    const dy = (e.clientY - g.py) / g.ks;
    if (g.kind === 'move') setDraft({ x: round(g.x + dx), y: round(g.y + dy), scale: g.scale });
    else setDraft({ x: g.x, y: g.y, scale: clampScale((g.scale * (g.w + dx)) / g.w) }); // whole 64ths: each size is its own look
  };
  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || !draft) return;
    if (g.kind === 'move' && (draft.x !== g.x || draft.y !== g.y)) onMove(draft.x, draft.y);
    if (g.kind === 'resize' && draft.scale !== g.scale) onResize(draft.scale);
    setDraft(null);
  };

  return (
    <div
      className={`ink-item editable${selected ? ' selected' : ''}${item.link ? ' linked' : ''}`}
      style={style}
      onPointerDown={(e) => start(e, 'move')}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {art}
      {item.link && <span className="link-badge">→ {item.link.page}</span>}
      {selected && (
        <span
          className="resize-handle"
          title="Drag to resize"
          onPointerDown={(e) => start(e, 'resize')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      )}
    </div>
  );
}
