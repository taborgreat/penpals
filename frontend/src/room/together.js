// Together in a room (rooms.md §4, §5, §6): who else is here, the shared sheets
// on its owner's table (each grown from its stamped acts, your own strokes laid
// over it as your guess until they are grown), your pen on the ones you may
// write on (yours, one lying on your table, or one on its owner's table with your
// seal pressed into it), and the acts that lay a sheet on someone's table, take it
// back, or lift your stroke. On the table the hand holds the pen or the stamper (set
// to someone's seal: the next press, then the pen again). The candles are lit and put out
// by acts (below: by the world's clock), carried and tilted (room/carry.js); each burns
// down and drips as the law has it, regrown here from the room's chain alone (law/wax.js),
// and each sheet grows with what landed on it. Where each sheet lies is read from the
// chain too (its lay lines: room/table.js).
//
// → { others, report, body, sheets: [{ view, slot, field, mayWrite, seals }], scene: { sheets,
//     tableWriter, beings, onPose, focus, heard: { on(fn) }: others' strokes as they come, fn({ origin
//     (its sheet's slot), rec (decoded), seed }) }, candles (law/wax.js createRoomWax: candle(which) →
//     { cd, lit, holder, pos, deg }, as far as at()), mine (your shared sheets, wherever they lie), tool,
//     notice, clearNotice, share(family), layOn(view, name), takeBack(view), lift(view), lookAt(view),
//     useTool('pen'), stamperFor(name), breakSeal(view, n), and the mail (one-world.md): letter (the sheet
//     in your hand, to post: your own, off the table while you hold it), hold(sheet), letGo(), post(key)
//     (into the mailbox of that key), take() (the oldest out of yours: on your table, in your hand),
//     letters(keys) → Map(key → how many wait in each mailbox) }
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoom, useRoomLines, useThings, seatOf, roomAct } from './presence.js';
import { useSharedFields, createSharedWriter, guessOver, sceneSheetOf, slotOf, shareSheet, moveSheet, postSheet, takeSheet, keyOfName, SHARED_PAGE } from './shared.js';
import { lyingOn, waxContext } from './table.js';
import { wax as WX, room as R, candle as C, shared as SH, fromB64url } from 'penpals-law';
import { lawOf } from 'penpals-law/laws';
import { GEOM, theLight } from '../scene/light.js';

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
const byHand = { on: false }; // (the e2e lights them itself: globalThis.__candles)

// Which candles burn and which are in someone's hand, by the room's signed acts. → { lit, held } ('01' strings)
function candlesOf(lines) {
  const lit = {},
    held = {};
  for (const l of lines) {
    const a = l.act;
    if (a?.act === 'light' || a?.act === 'out') lit[a.thing] = a.act === 'light';
    if (a?.act === 'place') held[a.thing] = a.to === null;
  }
  return { lit: R.CANDLES.map((c) => (lit[c] ? 1 : 0)).join(''), held: R.CANDLES.map((c) => (held[c] ? 1 : 0)).join('') };
}
const CATCH_UP_MS = 120000; // the candles are regrown this much of the room's time at a go, between frames

export function useTogether({ name, key, room: roomKey = null, me, mine: myRoom = false, pageW, pageH, color }) {
  const { beings, sheets, report, body } = useRoom(name, { seat: myRoom ? 0 : seatOf(me) });
  const lines = useRoomLines(name);
  const { lit, held } = useMemo(() => candlesOf(lines), [lines]);
  const burning = lit.includes('1'),
    inHand = held.includes('1');
  // The candles and what they let fall (law/wax.js), regrown from the room's chain as its lines
  // arrive and as time passes: caught up a slice at a time (a candle lit for hours is many
  // steps), then kept up, often while one is in someone's hand, now and then while one burns.
  // The light draws them as they are (scene/light.js setCandles): lit or out, how far down, how fed.
  const candles = useMemo(() => WX.createRoomWax(waxContext({ geom: GEOM, page: [pageW, pageH] })), [name, pageW, pageH]);
  const [wax, setWax] = useState({ drips: [], n: 0 });
  useEffect(() => () => theLight().setCandles(null), [candles]);
  useEffect(() => {
    if (!lines.length) return undefined;
    let timer = 0;
    const go = () => {
      const now = Date.now();
      const until = Math.min(now, (candles.at() ?? Date.parse(lines[0].at)) + CATCH_UP_MS);
      const drips = candles.advance(lines, until);
      setWax((w) => (w.drips === drips && w.n === drips.length ? w : { drips, n: drips.length }));
      theLight().setCandles(
        R.CANDLES.map((_, which) => {
          const c = candles.candle(which);
          return { lit: c.lit, height: C.heightOf(c.cd), ...C.flameOf(c.cd), spent: C.spent(c.cd) };
        }),
      );
      if (until < now) timer = setTimeout(go, 0);
      else if (inHand || burning) timer = setTimeout(go, inHand ? 500 : 5000);
    };
    go();
    return () => clearTimeout(timer);
  }, [candles, lines, inHand, burning]);
  const dripsOf = useCallback((view) => WX.dripsOn(wax.drips, view.sheet, view.born ?? 0), [wax]);
  const fields = useSharedFields(sheets, dripsOf);
  const lying = useMemo(() => lyingOn(lines), [lines]);
  const myKey = key?.publicKey ?? null;
  const [writers, setWriters] = useState(() => new Map()); // sheet → room/shared.js writer
  const writersRef = useRef(writers);
  writersRef.current = writers;
  const active = useRef(null); // the writer the pen is on
  const [notice, setNotice] = useState(null);
  const [mine, setMine] = useState([]);
  const [letter, setLetter] = useState(null); // the sheet in your hand to post (one-world.md: the mail)
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
  // others' strokes as they come (world.md Phase 2: each writer's pen heard from where it wrote, as
  // it was written); what lay there when you came is not heard
  const listeners = useRef(new Set());
  const heardTo = useRef(new Map()); // sheet → its lines heard so far
  useEffect(() => {
    for (const p of placed) {
      const was = heardTo.current.get(p.view.sheet);
      heardTo.current.set(p.view.sheet, p.view.lines.length);
      if (was === undefined || !listeners.current.size) continue;
      for (const l of p.view.lines.slice(was)) {
        if (l.act.act !== 'stroke' || l.act.by === myKey) continue;
        const rec = lawOf(SH.SHARED_LAW).decodeCanonical(fromB64url(l.act.stroke));
        for (const fn of listeners.current) fn({ origin: p.slot, rec, seed: l.n });
      }
    }
  }, [placed, myKey]);
  const heard = useMemo(
    () => ({
      on(fn) {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
    }),
    [],
  );

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
      placed
        .filter((p) => p.view.sheet !== letter) // (the letter in your hand is not on the table)
        .map((p) => {
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
    [placed, writers, letter],
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
            // the stamper in the hand pressed here, its face set to someone's seal (harder with a pen pressed
            // harder); without a face, nothing
            press(sheet, q, ev) {
              const w = writerFor(sheet);
              const t = toolRef.current;
              if (!w || !t?.seal) return false;
              const depth = ev?.pressure > 0 && ev.pressure !== 0.5 ? Math.max(40, Math.round(255 * ev.pressure)) : 220;
              const tiltX = Math.max(-127, Math.min(127, Math.round((ev?.tiltX ?? 0) * 2)));
              const tiltY = Math.max(-127, Math.min(127, Math.round((ev?.tiltY ?? 0) * 2)));
              w.press(q, t.seal, { depth, tiltX, tiltY });
              return true;
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
            nib: () => active.current?.nib() ?? null,
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
    // the mail: a sheet of yours taken up off the table, carried to a mailbox and posted; the oldest letter
    // taken out of your own (it lies on your table, and is in your hand until you set it down)
    hold: (sheet) => setLetter(sheet),
    letGo: () => setLetter(null),
    async post(toKey) {
      const view = mine.find((v) => v.sheet === letter);
      if (!view) return fail(new Error('That letter is not yours to send.'));
      return postSheet(key, view, toKey, kFor(view)).then(() => {
        setLetter(null);
        refreshMine();
      }, fail);
    },
    async take() {
      const [view] = (await api.get('/api/shared/mailbox').catch(fail))?.sheets ?? [];
      if (!view) return fail(new Error('Your mailbox is empty.'));
      return takeSheet(key, view).then(() => setLetter(view.sheet), fail);
    },
    letters: async (keys) =>
      new Map(
        await Promise.all(
          keys.map((k) =>
            api.get(`/api/shared/mailbox/${k}`).then(
              (r) => [k, r.letters],
              () => [k, 0],
            ),
          ),
        ),
      ),
    lookAt(view) {
      const p = placed.find((x) => x.view.sheet === view.sheet);
      if (p) setFocus((f) => ({ at: [p.slot[0] + SHARED_PAGE.width / 2, p.slot[1] + SHARED_PAGE.height / 2], size: SHARED_PAGE.width, n: (f?.n ?? 0) + 1 }));
    },
  };
  const others = useMemo(() => beings.filter((b) => b.name !== me), [beings, me]);

  // Lighting the candles and putting them out are acts (matter-fixes §2). As the sun goes down by
  // the world's clock (law/room.js isNight), or as one comes in at night, the first of those here
  // (by name) lights them; as it comes up, puts them out; the last one to leave puts them out as it
  // goes. A candle someone lit or put out by hand (one-world.md, its panel: lightCandle) is left as
  // they had it until the sun turns again. (globalThis.__candles, for the e2e: light(which),
  // out(which) by hand, and the clock leaves them be.)
  const [dusk, setNight] = useState(() => R.isNight(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setNight(R.isNight(Date.now())), 60000);
    return () => clearInterval(t);
  }, []);
  // shut up (the door and the shutters shut: outside.md Phase 4) no daylight comes in: as at night
  const things = useThings(name);
  const night = dusk || (!R.openNow(things, 'door') && !R.openNow(things, 'shutters'));
  const tends = body && !!key && !!roomKey && !!me && [me, ...others.map((b) => b.name)].sort()[0] === me;
  const asked = useRef({}); // candle → what was asked of it, until it is so (an act on its way is not sent twice)
  const byOwnHand = useRef({ night, things: new Set() }); // the candles someone tended by hand since the sun last turned
  if (byOwnHand.current.night !== night) byOwnHand.current = { night, things: new Set() };
  useEffect(() => {
    const want = night ? '1' : '0';
    if (!tends || byHand.on) return;
    R.CANDLES.forEach((thing, i) => {
      if (byOwnHand.current.things.has(thing)) return;
      if (lit[i] === want) delete asked.current[thing];
      else if (asked.current[thing] !== want) {
        asked.current[thing] = want;
        roomAct(name, key, roomKey, { act: night ? 'light' : 'out', thing });
      }
    });
  }, [tends, night, lit, name, key, roomKey]);
  const last = useRef({ alone: true, lit });
  last.current = { alone: !others.length, lit };
  useEffect(() => {
    if (!body || !key || !roomKey) return;
    globalThis.__candles = {
      light: (which) => ((byHand.on = true), roomAct(name, key, roomKey, { act: 'light', thing: R.CANDLES[which] })),
      out: (which) => ((byHand.on = true), roomAct(name, key, roomKey, { act: 'out', thing: R.CANDLES[which] })),
      candle: (which) => candles.candle(which),
    };
  }, [name, body, key, roomKey, candles]);
  useEffect(() => {
    if (!body || !key || !roomKey) return undefined;
    const bye = () => {
      if (byHand.on || !last.current.alone) return;
      R.CANDLES.forEach((thing, i) => last.current.lit[i] === '1' && roomAct(name, key, roomKey, { act: 'out', thing }, { keepalive: true }));
    };
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      bye();
    };
  }, [name, body, key, roomKey]);

  // the mail, for the scene: the letter in your hand, and what E does at a mailbox (scene/SceneView.jsx)
  const mail = useMemo(
    () => ({ letter, mine: mine.map((v) => v.sheet), hold: actions.hold, letGo: actions.letGo, post: actions.post, take: actions.take, letters: actions.letters }),
    [letter, mine, key],
  );
  const scene = useMemo(() => ({ sheets: sceneSheets, tableWriter, beings: others, onPose: report, focus, heard, mail }), [sceneSheets, tableWriter, others, report, focus, heard, mail]);
  return {
    others,
    report,
    body,
    // a candle lit or put out by hand (one-world.md: the candle in your hand, its panel)
    candleLit: (which) => lit[which] === '1',
    lightCandle(which, on) {
      if (!body || !key || !roomKey) return;
      byOwnHand.current.things.add(R.CANDLES[which]);
      roomAct(name, key, roomKey, { act: on ? 'light' : 'out', thing: R.CANDLES[which] });
    },
    candles,
    sheets: placed,
    mine,
    letter,
    notice,
    clearNotice: () => setNotice(null),
    tool,
    ...actions,
    scene,
  };
}
