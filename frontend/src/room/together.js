// Together in a room (rooms.md §4, §5, §6): who else is here, the shared sheets
// on its owner's table (each grown from its stamped acts, your own strokes laid
// over it as your guess until they are grown), your pen on the ones you may
// write on (yours, one lying on your table, or one on its owner's table with your
// seal pressed into it), and the acts that lay a sheet on someone's table, take it
// back, or lift your stroke. On the table the hand holds the pen or the stamper (set
// to someone's seal: the next press, then the pen again). A candle is carried and
// tilted (room/carry.js: tilt acts); what drips from it is the law's, regrown here
// from the room's chain (law/wax.js), and each sheet grows with what landed on it.
// Where each sheet lies is read from the chain too (its lay lines: room/table.js).
//
// → { others, report, body, sheets: [{ view, slot, field, mayWrite, seals }], scene: { sheets,
//     tableWriter, beings, onPose, focus }, mine (your shared sheets, wherever they lie), tool,
//     notice, clearNotice, share(family), layOn(view, name), takeBack(view), lift(view), lookAt(view),
//     useTool('pen'), stamperFor(name), breakSeal(view, n) }
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoom, useRoomLines, seatOf } from './presence.js';
import { useSharedFields, createSharedWriter, guessOver, sceneSheetOf, slotOf, shareSheet, moveSheet, keyOfName, SHARED_PAGE } from './shared.js';
import { lyingOn, waxContext } from './table.js';
import { wax as WX } from 'penpals-law';
import { GEOM } from '../scene/light.js';

// The seals pressed into a sheet, in its order: [{ n, for (key), name, took, broken, at: { x, y } }]
// (took: the sheet grown to that press, its i-th seal; until then, not yet).
export function sealsOf(view, took = []) {
  const broken = new Set(view.lines.filter((l) => l.act.act === 'break').map((l) => l.act.break.seal));
  return view.lines
    .filter((l) => l.act.act === 'press')
    .map((l, i) => ({ n: l.n, for: l.act.press.for, name: view.names?.[l.act.press.for] ?? null, took: !!took[i], broken: broken.has(l.n), at: { x: l.act.press.x / 10, y: l.act.press.y / 10 } }));
}
// May `me` write here (law/shared.js mayWrite, read from the view and its seals)?
export const mayWriteOn = (view, seals, me) => !!me && (view.birth.key === me || view.table === me || (view.table === view.birth.key && seals.some((x) => x.for === me && x.took && !x.broken)));
import { api } from '../api.js';

export function useTogether({ name, key, me, mine: myRoom = false, pageW, pageH, timeZone = null, color }) {
  const { beings, sheets, report, body } = useRoom(name, { seat: myRoom ? 0 : seatOf(me) });
  // the drips the room's candles let fall (law/wax.js), regrown from its chain: anew as its
  // lines arrive, and as time passes while a candle is in someone's hand
  const lines = useRoomLines(name);
  const wax = useMemo(() => waxContext({ geom: GEOM, page: [pageW, pageH], timeZone }), [pageW, pageH, timeZone]);
  const held = useMemo(() => {
    const inHand = {};
    for (const l of lines) if (l.kind === 'place') inHand[l.thing] = l.to === null;
    return Object.values(inHand).some(Boolean);
  }, [lines]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!held) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [held]);
  const drips = useMemo(() => (lines.length ? WX.dripsOf(lines, { ...wax, until: Math.max(now, Date.now()) }) : []), [lines, wax, now]);
  const dripsOf = useCallback((view) => WX.dripsOn(drips, view.sheet, view.born ?? 0), [drips]);
  const fields = useSharedFields(sheets, dripsOf);
  const lying = useMemo(() => lyingOn(lines), [lines]);
  const myKey = key?.publicKey ?? null;
  const [writers, setWriters] = useState(() => new Map()); // sheet → room/shared.js writer
  const writersRef = useRef(writers);
  writersRef.current = writers;
  const active = useRef(null); // the writer the pen is on
  const [notice, setNotice] = useState(null);
  const [mine, setMine] = useState([]);
  const [focus, setFocus] = useState(null);
  const [tool, setTool] = useState('pen'); // 'pen' | { seal: { name, key, w, h, face } }
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const placed = useMemo(
    () =>
      sheets.map((view, i) => {
        const seals = sealsOf(view, fields.get(view.sheet)?.seals);
        const lies = lying.find((s) => s.sheet === view.sheet);
        return {
          view,
          slot: slotOf(lies ? lies.slot : lying.length + i, pageW), // (its lay line on its way: after the others)
          field: fields.get(view.sheet)?.field ?? null,
          grown: fields.get(view.sheet)?.n ?? 0,
          facts: fields.get(view.sheet)?.facts ?? null,
          seals,
          mayWrite: mayWriteOn(view, seals, myKey),
        };
      }),
    [sheets, fields, pageW, myKey, lying],
  );
  const viewsRef = useRef(placed);
  viewsRef.current = placed;

  // writers for sheets no longer here (or no longer yours to write on) are let go
  useEffect(() => {
    const keep = new Set(placed.filter((p) => p.mayWrite).map((p) => p.view.sheet));
    const gone = [...writers.keys()].filter((s) => !keep.has(s));
    if (!gone.length) return;
    const next = new Map(writers);
    for (const s of gone) {
      next.get(s).destroy();
      next.delete(s);
    }
    setWriters(next);
  }, [placed, writers]);
  useEffect(() => () => writersRef.current.forEach((w) => w.destroy()), []);
  useEffect(() => {
    for (const w of writers.values()) w.setColor(color);
  }, [color, writers]);
  // the stamped sheet grown anew: your guess goes once everything you sent is in it
  useEffect(() => {
    for (const p of placed) writers.get(p.view.sheet)?.settled(p.view.lines, p.grown);
  }, [placed, writers]);

  const writerFor = useCallback(
    (sheet) => {
      let w = writersRef.current.get(sheet);
      if (w) return w;
      const p = viewsRef.current.find((x) => x.view.sheet === sheet);
      if (!p?.mayWrite || !key) return null;
      w = createSharedWriter({ key, view: p.view, color, onNotice: setNotice });
      writersRef.current = new Map(writersRef.current).set(sheet, w);
      setWriters(writersRef.current);
      return w;
    },
    [key, color],
  );

  // the scene: each sheet at its slot, grown, your guess over it
  const guesses = useRef(new Map()); // sheet → { writer, field, live }
  const sceneSheets = useMemo(
    () =>
      placed.map((p) => {
        const w = writers.get(p.view.sheet);
        let live;
        if (w) {
          const g = guesses.current.get(p.view.sheet);
          if (g?.writer === w && g.field === p.field) live = g.live;
          else {
            live = guessOver(w.live, p.field);
            guesses.current.set(p.view.sheet, { writer: w, field: p.field, live });
          }
        }
        return { ...sceneSheetOf(p.view.sheet, p.slot), field: p.field ?? undefined, live };
      }),
    [placed, writers],
  );
  const writable = placed.filter((p) => p.mayWrite);
  const rects = writable.map((p) => `${p.view.sheet}@${p.slot.join()}`).join('|');
  const tableWriter = useMemo(
    () =>
      writable.length
        ? {
            sheets: writable.map((p) => ({ sheet: p.view.sheet, origin: p.slot, size: [SHARED_PAGE.width, SHARED_PAGE.height] })),
            down(sheet, q, ev, type) {
              const w = writerFor(sheet);
              if (!w) return false;
              const t = toolRef.current;
              if (t?.seal) {
                // the stamper pressed here (harder with a pen pressed harder), then the pen again
                const depth = ev?.pressure > 0 && ev.pressure !== 0.5 ? Math.max(40, Math.round(255 * ev.pressure)) : 220;
                const tiltX = Math.max(-127, Math.min(127, Math.round((ev?.tiltX ?? 0) * 2)));
                const tiltY = Math.max(-127, Math.min(127, Math.round((ev?.tiltY ?? 0) * 2)));
                w.press(q, t.seal, { depth, tiltX, tiltY });
                setTool('pen');
                active.current = null;
                return true;
              }
              active.current = w;
              return w.pen.down(q, ev, type);
            },
            move(q, ev) {
              active.current?.pen?.move(q, ev);
            },
            up(q, ev) {
              active.current?.pen?.up(q, ev);
              active.current = null;
            },
            cancel() {
              active.current?.pen?.cancel();
              active.current = null;
            },
          }
        : null,
    [rects, writerFor], // (the sheets you may write on, by place: not every act on them)
  );

  // your shared sheets, wherever they lie (to take one back)
  const refreshMine = useCallback(() => {
    if (!myKey) return setMine([]);
    api
      .get('/api/shared/mine')
      .then((r) => setMine(r.sheets ?? []))
      .catch(() => {});
    return undefined;
  }, [myKey]);
  const tableKey = sheets.map((s) => `${s.sheet}:${s.table}`).join('|');
  useEffect(refreshMine, [refreshMine, tableKey]);

  const fail = (err) => setNotice(err?.message ?? String(err));
  const kFor = (view) => writersRef.current.get(view.sheet)?.nextK();
  const actions = {
    share: (family) => shareSheet(key, family).then(refreshMine, fail),
    async layOn(view, who) {
      const to = await keyOfName(who).catch(() => null);
      if (!to) return fail(new Error(`There is no one called @${who}.`));
      return moveSheet(key, view, to, kFor(view)).then(refreshMine, fail);
    },
    takeBack: (view) => moveSheet(key, view, myKey, kFor(view)).then(refreshMine, fail),
    lift(view) {
      const w = writerFor(view.sheet);
      if (!w) return fail(new Error('That sheet is not on your table.'));
      return w.lift(view.lines);
    },
    useTool: (t) => setTool(t),
    // the stamper set to someone: their seal's face, from their signature (backend routes/signatures.js)
    async stamperFor(who) {
      const r = await api.get(`/api/signatures/${encodeURIComponent(who)}/seal`).catch((err) => fail(err));
      if (r?.face) setTool({ seal: r });
    },
    breakSeal(view, n) {
      const w = writerFor(view.sheet);
      const at = sealsOf(view).find((x) => x.n === n)?.at;
      if (!w || !at) return fail(new Error('Only its owner breaks a seal.'));
      return w.breakSeal(n, at);
    },
    lookAt(view) {
      const p = placed.find((x) => x.view.sheet === view.sheet);
      if (p) setFocus((f) => ({ at: [p.slot[0] + SHARED_PAGE.width / 2, p.slot[1] + SHARED_PAGE.height / 2], size: SHARED_PAGE.width, n: (f?.n ?? 0) + 1 }));
    },
  };
  const others = useMemo(() => beings.filter((b) => b.name !== me), [beings, me]);
  const scene = useMemo(() => ({ sheets: sceneSheets, tableWriter, beings: others, onPose: report, focus }), [sceneSheets, tableWriter, others, report, focus]);
  return {
    others,
    report,
    body,
    sheets: placed,
    mine,
    notice,
    clearNotice: () => setNotice(null),
    tool,
    ...actions,
    scene,
  };
}
