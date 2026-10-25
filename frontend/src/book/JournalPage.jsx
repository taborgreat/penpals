import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import InkItem from './InkItem.jsx';
import { itemSize, CELLS, SCALE_ONE } from './ink.js';
import SceneView from '../scene/SceneView.jsx';
import { sceneOn, sceneSupported, setViewChoice, useLowPower } from '../scene/support.js';
import { hexRgb } from '../scene/sources.js';
import { wantOf, toAsk, stale } from '../scene/sight.js';
import { CHUNK } from '../scene/engine.js';
import { ruleCss } from './ruled.js';

// One page of a journal: its background, and its writing in list order (later
// items on top). Each item is a sealed record's look; `lookSrc(item, line)`
// says where its look comes from (the server, or grown here for a .book). The page is a fixed logical canvas (`size`, e.g. 1000 × 1400)
// scaled to the width it's given.
//
// Writing that links to a page is a button that goes there. (Writing is moved by
// the hand, in the world: room.sheetHand, a move each time it is set down.)
//
// The scene (`sceneSrc(item, line, want)` → its field or look): every item a sheet
// in one scene over the page, lit by the time of day; 2D (the page as ever, lit) or
// 3D. In 2D the page's own items stay above it, unseen, for links and editing.
// What is asked for follows the scene's eye (cleanup-and-speed.md §5b, sight.js):
// writing out of sight is not asked for, far or small writing is its flat look at
// a level of detail, near writing the scene of the chunks in view; what has been
// out of sight a while is let go.
// `momentsSrc(item, line)` → (() => Promise<{ box, at }>) | null: show the moments
// of the sheets this device can grow (yours, or open).
//
// The room (rooms.md §1, §2): the page lies on its owner's table, in their room.
// `room`: { surfaces (the book's: skeleton.surfaces), seeds (the owner's grown
// room, room/seeds.js), wallWriter (the owner's pen
// on the walls, from Look), live (marks being written now) }. Ink on a surface is
// drawn on it (scene/marks.js), every piece of it (there are few), whole.
// `room.together` (room/together.js): the shared sheets on the table beside the
// page, the pen on them, and the others in the room.
export default function JournalPage({ page, size, inks, onFollow, lookSrc, sceneSrc = null, momentsSrc = null, room = null }) {
  const ref = useRef(null);
  const [k, setK] = useState(0); // CSS px per page unit
  const [scene, setScene] = useState(() => !!sceneSrc && sceneOn());
  const lowPower = useLowPower();
  useEffect(() => {
    setScene(!!sceneSrc && sceneOn());
  }, [lowPower]); // eslint-disable-line react-hooks/exhaustive-deps
  const [sceneMode, setSceneMode] = useState('3d'); // always 3D
  const [shown, setShown] = useState(() => new Map()); // item key → { want, d: { field, detail } | { look } }
  const [sight, setSight] = useState(null); // what the scene's eye sees (sight.js sightOf), null: nothing
  const sightRef = useRef(null);
  sightRef.current = sight;
  const seenAt = useRef(new Map()); // item key → when it was last in sight
  const keyOf = (item) => `${item.id}:${item.ink}`;
  const sceneShows = scene;
  // each item's place (page px) and cells
  const placed = useMemo(
    () =>
      page.items.flatMap((item) => {
        const line = inks.get(item.ink);
        if (!line?.ink) return [];
        const [w, h] = itemSize(line.ink, item.scale);
        return [{ item, line, key: keyOf(item), rect: [item.x, item.y, item.x + w, item.y + h], cellPx: item.scale / SCALE_ONE / CELLS, box: line.ink.box }];
      }),
    [page.items, inks],
  );
  // ask for what is in sight that is not here yet
  useEffect(() => {
    if (!sceneShows) return undefined;
    let alive = true;
    for (const { p, want } of toAsk(placed, sight, shown, seenAt.current, performance.now(), { chunk: CHUNK })) {
      sceneSrc(p.item, p.line, want)
        .then((d) => {
          if (alive && d) setShown((m) => new Map(m).set(p.key, { want, d }));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [sceneShows, sight, placed]); // eslint-disable-line react-hooks/exhaustive-deps
  // let go of what has been out of sight a while
  useEffect(() => {
    if (!sceneShows) return undefined;
    const tick = setInterval(() => {
      const now = performance.now();
      for (const p of placed) if (wantOf(sightRef.current, p, { chunk: CHUNK })) seenAt.current.set(p.key, now);
      const gone = stale(seenAt.current, now);
      if (!gone.length) return;
      for (const k of gone) seenAt.current.delete(k);
      setShown((m) => {
        const next = new Map(m);
        for (const k of gone) next.delete(k);
        return next;
      });
    }, 5000);
    return () => clearInterval(tick);
  }, [sceneShows, placed]);
  const sheets = useMemo(
    () =>
      placed.flatMap((p) => {
        const d = shown.get(p.key)?.d;
        if (!d) return [];
        if (d.look) {
          // the flat look, over the item as the page shows it (at its level of detail)
          const box = [0, 0, d.look.w, d.look.h];
          return [{ id: p.key, box, origin: [p.rect[0], p.rect[1]], cellPx: (p.rect[2] - p.rect[0]) / d.look.w, look: { rgba: d.look.rgba, box } }];
        }
        // the scene's cells, each 2^lod of the sheet's a side; the sheet is the whole item
        const n = 1 << (d.field.lod ?? 0);
        const b = p.box;
        const box = [Math.floor(b[0] / n), Math.floor(b[1] / n), Math.ceil((b[0] + b[2]) / n) - Math.floor(b[0] / n), Math.ceil((b[1] + b[3]) / n) - Math.floor(b[1] / n)];
        const origin = [p.rect[0] + (box[0] * n - b[0]) * p.cellPx, p.rect[1] + (box[1] * n - b[1]) * p.cellPx];
        return [{ id: p.key, box, origin, cellPx: p.cellPx * n, field: d.field, detail: d.detail ?? undefined }];
      }),
    [placed, shown],
  );
  // the shared sheets lying on the table beside the page, and a fresh sheet on it (the world's new paper)
  const tableSheets = room?.together?.sheets;
  const freshSheet = room?.paper ?? null;
  const allSheets = useMemo(() => [...sheets, ...(tableSheets ?? []), ...(freshSheet ? [freshSheet] : [])], [sheets, tableSheets, freshSheet]);
  // the world: the writing on the page, for the hand to pick up (in list order: the last on top)
  const hand = room?.sheetHand ?? null;
  const sheetHand = useMemo(() => (hand ? { ...hand, items: placed.map((p) => ({ id: p.item.id, sheet: p.key, rect: p.rect })) } : null), [hand, placed]);
  // ink on the room's surfaces: each piece's whole field (or its look), set on its surface
  const [onWalls, setOnWalls] = useState(() => new Map()); // item key → mark
  const surfaceItems = useMemo(
    () =>
      Object.entries(room?.surfaces ?? {}).flatMap(([surface, f]) =>
        f.items.flatMap((item) => {
          const line = inks.get(item.ink);
          return line?.ink ? [{ surface, item, line, key: `${surface}:${keyOf(item)}` }] : [];
        }),
      ),
    [room?.surfaces, inks],
  );
  useEffect(() => {
    if (!sceneShows || !sceneSrc) return undefined;
    let alive = true;
    for (const w of surfaceItems) {
      if (onWalls.has(w.key)) continue;
      sceneSrc(w.item, w.line, { lod: 0, at: null })
        .then((d) => {
          if (!alive || !d) return;
          const cellUnits = w.item.scale / SCALE_ONE / CELLS;
          const mark = d.field
            ? { id: w.key, surface: w.surface, origin: [w.item.x, w.item.y], cellUnits, box: d.field.box, rgba: d.field.rgba }
            : { id: w.key, surface: w.surface, origin: [w.item.x, w.item.y], cellUnits: itemSize(w.line.ink, w.item.scale)[0] / d.look.w, box: [0, 0, d.look.w, d.look.h], rgba: d.look.rgba };
          setOnWalls((m) => new Map(m).set(w.key, mark));
        })
        .catch((err) => console.warn('[room] ink on the', w.surface, err.message)); // (the wall stays bare)
    }
    return () => {
      alive = false;
    };
  }, [sceneShows, surfaceItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const marks = useMemo(() => {
    const keys = new Set(surfaceItems.map((w) => w.key));
    return [...[...onWalls.values()].filter((m) => keys.has(m.id)), ...(room?.live ?? [])];
  }, [onWalls, surfaceItems, room?.live]);
  // doors (rooms.md §3): writing that leads somewhere, on the page or on a surface, followed in the scene
  const doors = useMemo(
    () => [
      ...placed.filter((p) => p.item.link).map((p) => ({ id: p.key, surface: null, rect: p.rect, link: p.item.link })),
      ...surfaceItems
        .filter((w) => w.item.link)
        .map((w) => {
          const [iw, ih] = itemSize(w.line.ink, w.item.scale);
          return { id: w.key, surface: w.surface, rect: [w.item.x, w.item.y, w.item.x + iw, w.item.y + ih], link: w.item.link };
        }),
    ],
    [placed, surfaceItems],
  );
  const paper = useMemo(() => hexRgb(page.background), [page.background]);
  const moments = useMemo(() => {
    const parts = momentsSrc
      ? page.items.flatMap((item) => {
          const line = inks.get(item.ink);
          const d = shown.get(keyOf(item))?.d;
          const get = line?.ink && d?.field && !d.field.lod ? momentsSrc(item, line) : null; // (every cell: the moments are per cell)
          return get ? [{ id: keyOf(item), get }] : [];
        })
      : [];
    return parts.length ? () => Promise.all(parts.map((p) => p.get().then((m) => ({ id: p.id, ...m })))) : null;
  }, [momentsSrc, page.items, inks, shown]);

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
      className={`journal-page${sceneShows ? ` scene-shown scene-${sceneMode}` : ''}`}
      style={{ background: page.background, backgroundImage: ruleCss(page.rule ?? 0, k), aspectRatio: `${size.width} / ${size.height}` }}
    >
      {k > 0 &&
        page.items.map((item) => {
          const line = inks.get(item.ink);
          if (!line?.ink) return null;
          return <Item key={item.id} item={item} body={line.ink} src={sceneShows ? null : lookSrc(item, line)} scale={item.scale} k={k} onFollow={() => item.link && onFollow(item.link.page)} />;
        })}
      {sceneShows && (
        <SceneView
          className="journal-scene"
          page={[size.width, size.height]}
          mode={sceneMode}
          onMode={setSceneMode}
          sheets={allSheets}
          paper={paper}
          rule={page.rule ?? 0}
          moments={moments}
          onSight={setSight}
          seeds={room?.seeds ?? null}
          marks={marks}
          wallWriter={room?.wallWriter ?? null}
          shelf={room?.shelf ?? null}
          doors={doors}
          onDoor={room?.follow ?? ((link) => link.page && onFollow(link.page))}
          gazeAt={room?.gazeAt ?? null}
          beings={room?.together?.beings ?? null}
          onPose={room?.together?.onPose ?? null}
          tableWriter={room?.together?.tableWriter ?? null}
          heard={room?.together?.heard ?? null}
          space={room?.space ?? null}
          outside={room?.outside ?? null}
          hands={room?.hands ?? null}
          focus={room?.together?.focus ?? null}
          hand={room?.hand ?? null}
          writer={room?.paperWriter ?? null}
          sheetHand={sheetHand}
          world={!!room?.world}
          ground
          onFlat={() => {
            setViewChoice('flat');
            setScene(false);
          }}
        />
      )}
      {!scene && sceneSrc && sceneSupported() && (
        <div className="scene-tools">
          <button
            type="button"
            onClick={() => {
              setViewChoice('scene');
              setScene(true);
            }}
            title="The page lit, in 3D"
          >
            Scene
          </button>
        </div>
      )}
    </div>
  );
}

// `k` places the item in the page's own CSS px.
function Item({ item, body, src, scale, k, onFollow }) {
  const [w, h] = itemSize(body, scale);
  const style = { left: item.x * k, top: item.y * k, width: w * k, height: h * k };
  const art = <InkItem src={src} body={body} scale={scale} />;
  if (!item.link)
    return (
      <span className="ink-item" style={style} role="img" aria-label="handwriting">
        {art}
      </span>
    );
  return (
    <button type="button" className="ink-item ink-link" style={style} onClick={onFollow} title={`Go to ${item.link.page}`} aria-label={`Go to the page ${item.link.page}`}>
      {art}
    </button>
  );
}
