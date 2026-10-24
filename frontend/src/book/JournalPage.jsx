import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import InkItem from './InkItem.jsx';
import { itemSize, clampScale, CELLS, SCALE_ONE } from './ink.js';
import SceneView from '../scene/SceneView.jsx';
import { sceneOn, sceneSupported, setViewChoice, useLowPower } from '../scene/support.js';
import { hexRgb } from '../scene/sources.js';

// One page of a journal: its background, and its writing in list order (later
// items on top). Each item is a sealed record's look; `lookSrc(item, line)`
// says where its look comes from (the server, or grown here for a .book). The page is a fixed logical canvas (`size`, e.g. 1000 × 1400)
// scaled to the width it's given.
//
// View mode: writing that links to a page is a button that goes there.
// Edit mode (`editable`): a tap selects, dragging moves, the corner handle
// resizes; each finished gesture is one edit (`onOp`).
//
// The scene (`sceneSrc(item, line)` → its field or look): every item a sheet in
// one scene over the page, lit by the time of day; 2D (the page as ever, lit) or
// 3D. In 2D the page's own items stay above it, unseen, for links and editing.
// `momentsSrc(item, line)` → (() => Promise<{ box, at }>) | null: show the moments
// of the sheets this device can grow (yours, or open).
export default function JournalPage({ pageId, page, size, inks, editable, selected, onSelect, onOp, onFollow, lookSrc, sceneSrc = null, momentsSrc = null }) {
  const ref = useRef(null);
  const [k, setK] = useState(0); // CSS px per page unit
  const [scene, setScene] = useState(() => !!sceneSrc && sceneOn());
  const lowPower = useLowPower();
  useEffect(() => { setScene(!!sceneSrc && sceneOn()); }, [lowPower]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sceneMode, setSceneMode] = useState('2d');
  const [shown, setShown] = useState(() => new Map()); // item key → { field, detail } | { look }
  const keyOf = (item) => `${item.id}:${item.ink}`;
  useEffect(() => {
    if (!scene) return;
    let alive = true;
    for (const item of page.items) {
      const line = inks.get(item.ink);
      if (!line?.ink || shown.has(keyOf(item))) continue;
      sceneSrc(item, line).then((d) => {
        if (alive && d) setShown((m) => new Map(m).set(keyOf(item), d));
      }).catch(() => {});
    }
    return () => { alive = false; };
  }, [scene, page.items, inks]); // eslint-disable-line react-hooks/exhaustive-deps
  const sheets = useMemo(() => page.items.flatMap((item) => {
    const d = shown.get(keyOf(item));
    const line = inks.get(item.ink);
    if (!d || !line?.ink) return [];
    const box = d.field?.box ?? d.look.box;
    const cellPx = item.scale / SCALE_ONE / CELLS;
    return [{ id: keyOf(item), box, origin: [item.x + (box[0] - line.ink.box[0]) * cellPx, item.y + (box[1] - line.ink.box[1]) * cellPx], cellPx, field: d.field, detail: d.detail, look: d.look }];
  }), [page.items, shown, inks]); // eslint-disable-line react-hooks/exhaustive-deps
  const paper = useMemo(() => hexRgb(page.background), [page.background]);
  const moments = useMemo(() => {
    const parts = momentsSrc ? page.items.flatMap((item) => {
      const line = inks.get(item.ink);
      const get = line?.ink && shown.has(keyOf(item)) ? momentsSrc(item, line) : null;
      return get ? [{ id: keyOf(item), get }] : [];
    }) : [];
    return parts.length ? () => Promise.all(parts.map((p) => p.get().then((m) => ({ id: p.id, ...m })))) : null;
  }, [momentsSrc, page.items, inks, shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const sceneShows = scene && !editable;

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
      className={`journal-page${editable ? ' editing' : ''}${sceneShows ? ` scene-shown scene-${sceneMode}` : ''}`}
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
      {sceneShows && (
        <SceneView
          className="journal-scene"
          page={[size.width, size.height]}
          mode={sceneMode}
          onMode={setSceneMode}
          sheets={sheets}
          paper={paper}
          moments={moments}
          ground
          onFlat={() => { setViewChoice('flat'); setScene(false); }}
        />
      )}
      {!scene && sceneSrc && !editable && sceneSupported() && (
        <div className="scene-tools">
          <button type="button" onClick={() => { setViewChoice('scene'); setScene(true); }} title="The page lit, in 2D or 3D">Scene</button>
        </div>
      )}
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
