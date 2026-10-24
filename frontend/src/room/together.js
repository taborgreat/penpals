// Together in a room (rooms.md §4, §5, §6): who else is here, the shared sheets
// on its owner's table (each grown from its stamped acts, your own strokes laid
// over it as your guess until they are grown), your pen on the ones you may
// write on (yours, or one lying on your table), and the acts that lay a sheet on
// someone's table, take it back, or lift your stroke.
//
// → { others, report, body, sheets: [{ view, slot, field, mayWrite }], scene: { sheets,
//     tableWriter, beings, onPose, focus }, mine (your shared sheets, wherever they lie),
//     notice, clearNotice, share(family), layOn(view, name), takeBack(view), lift(view), lookAt(view) }
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoom, seatOf } from './presence.js';
import { useSharedFields, createSharedWriter, guessOver, sceneSheetOf, slotOf, shareSheet, moveSheet, keyOfName, SHARED_PAGE } from './shared.js';
import { api } from '../api.js';

export function useTogether({ name, key, me, mine: myRoom = false, pageW, color }) {
  const { beings, sheets, report, body } = useRoom(name, { seat: myRoom ? 0 : seatOf(me) });
  const fields = useSharedFields(sheets);
  const myKey = key?.publicKey ?? null;
  const [writers, setWriters] = useState(() => new Map()); // sheet → room/shared.js writer
  const writersRef = useRef(writers);
  writersRef.current = writers;
  const active = useRef(null); // the writer the pen is on
  const [notice, setNotice] = useState(null);
  const [mine, setMine] = useState([]);
  const [focus, setFocus] = useState(null);
  const mayWrite = useCallback((v) => !!myKey && (v.birth.key === myKey || v.table === myKey), [myKey]);
  const placed = useMemo(
    () =>
      sheets.map((view, i) => ({
        view,
        slot: slotOf(i, pageW),
        field: fields.get(view.sheet)?.field ?? null,
        grown: fields.get(view.sheet)?.n ?? 0,
        facts: fields.get(view.sheet)?.facts ?? null,
        mayWrite: mayWrite(view),
      })),
    [sheets, fields, pageW, mayWrite],
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
              active.current = w;
              return w.pen.down(q, ev, type);
            },
            move: (q, ev) => active.current?.pen.move(q, ev),
            up: (q, ev) => active.current?.pen.up(q, ev),
            cancel: () => active.current?.pen.cancel(),
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
    ...actions,
    scene,
  };
}
