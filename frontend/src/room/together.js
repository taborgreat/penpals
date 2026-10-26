// Together in a house (rooms.md §4, §5, §6; law/paper.js): who else is here, the papers lying in it (each
// grown from its stamped acts and what dripped onto it, your own strokes laid over it as your guess until
// they are grown), your pen on the ones you may mark (yours; one lying on your table; one with your name
// pressed into it), and your hand: a paper taken up from wherever it lies, carried, and let go anywhere (in
// a house, on a table, outside), posted into a mailbox (it is theirs then), saved into your book (yours),
// taken out of your book or out of your mailbox (the oldest letter first). All of it acts on the paper's
// own chain, sealed by your key: nothing here but what its chain says. On the table the hand holds the pen
// or the stamper (set to someone's seal: pressed into a paper of yours). The candles are lit and put out
// by acts (below: by the world's clock), carried and tilted (room/carry.js); each burns down and drips as
// the law has it, regrown here from the room's chain alone (law/wax.js), and each paper grows with what
// landed on it. Papers lying outside are drawn where they lie too.
//
// → { others, report, body, candles (law/wax.js createRoomWax), candleLit(which), lightCandle(which, on),
//     papers (lying here: [{ view, at (room m), field, grown, facts, seals, mayWrite }]), held (the paper in
//     your hand: its view, or null), book (the papers in your book), notice, clearNotice, tool, useTool(t),
//     stamperFor(name), newPaper({ size, rule }) (one more on your table, somewhere on it: half or full, ruled or
//     not), lift() (your last stroke on the
//     paper you last wrote on), shelve(path), takeOut(view), scene: { sheets, tableWriter, beings, onPose,
//     heard, papers (the hand on them: SceneView's) } }
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRoom, useRoomLines, useThings, useWorld, seatOf, roomAct } from './presence.js';
import { usePaperFields, createPaperWriter, guessOver, sceneSheetOf, mayMark, sealsOf, strokeOf, paperAct, newPaper as bornPaper, newSurface, stacked, restedAt, wornAt, SEAL_R } from './papers.js';
import { CELLS } from '../ink/live.js';
import { waxContext } from './table.js';
import { dripsOnSurface } from './drops.js';
import { wax as WX, room as R, candle as C, paper as P } from 'penpals-law';
import { GEOM, theLight, originOf } from '../scene/light.js';
import { PX_PER_M } from '../scene/light/index.js';
import { HAND } from '../scene/light/room.js';
import { frameOf, inBox } from '../scene/outside.js';
import { api } from '../api.js';

const byHand = { on: false }; // (the e2e lights them itself: globalThis.__candles)

// Which candles burn and which are in someone's hand, by the room's signed acts. → { lit, held } ('01' strings)
function candlesOf(lines) {
  const lit = R.litOf(lines), // (the last one out puts them out: law/room.js)
    held = {};
  for (const l of lines) if (l.act?.act === 'place') held[l.act.thing] = l.act.to === null;
  return { lit: R.CANDLES.map((c) => (lit[c] ? 1 : 0)).join(''), held: R.CANDLES.map((c) => (held[c] ? 1 : 0)).join('') };
}
const CATCH_UP_MS = 120000; // the candles are regrown this much of the room's time at a go, between frames
// A new paper's place on the table (room m: its middle): the first in front of the chair, where you sit
// before it; any more somewhere on the table, wholly on it.
export function newPaperAt(geom, size = P.SIZES.half, first = false, rand = Math.random) {
  const t = geom.table;
  if (first) return [(geom.pageRect.x0 + geom.pageRect.x1) / 2, (geom.pageRect.y0 + geom.pageRect.y1) / 2, t.top];
  const [w, h] = size.map((v) => v / PX_PER_M);
  return [t.x0 + w / 2 + rand() * (t.x1 - t.x0 - w), t.y0 + h / 2 + rand() * (t.y1 - t.y0 - h), t.top];
}

export function useTogether({ name, key, room: roomKey = null, me, mine: myRoom = false, pageW, pageH, pen, family = null, plot = null }) {
  const { beings, papers: here, report, body } = useRoom(name, { seat: myRoom ? 0 : seatOf(me), space: roomKey });
  const lines = useRoomLines(name);
  const { lit, held: candleHeld } = useMemo(() => candlesOf(lines), [lines]);
  const burning = lit.includes('1'),
    inHand = candleHeld.includes('1');
  // The candles and what they let fall (law/wax.js), regrown from the room's chain as its lines
  // arrive and as time passes: caught up a slice at a time (a candle lit for hours is many
  // steps), then kept up, often while one is in someone's hand, now and then while one burns.
  // The light draws them as they are (scene/light.js setCandles): lit or out, how far down, how fed.
  const candles = useMemo(() => WX.createRoomWax(waxContext({ geom: GEOM })), [name]);
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
  // the drips that landed on it: a paper, or this house's table or floor (once it is matter with a chain)
  const dripsOf = useCallback((view) => (view.where?.surface ? dripsOnSurface(GEOM, wax.drips, view.where.surface, view.born ?? 0) : WX.dripsOn(wax.drips, view.paper, view.born ?? 0)), [wax]);

  const myKey = key?.publicKey ?? null;
  const [notice, setNotice] = useState(null);
  const fail = (err) => setNotice(err?.message ?? String(err));
  // your hand and your book (store/papers.js: read again after each of your moves), and the papers lying
  // outside (drawn where they lie, when this house has a plot to stand on)
  const [held, setHeld] = useState(null);
  const [book, setBook] = useState([]);
  const [outside, setOutside] = useState([]);
  const refresh = useCallback(() => {
    if (myKey) {
      api.get('/api/papers/held').then((r) => setHeld(r.papers.at(-1) ?? null), fail);
      api.get('/api/papers/book').then((r) => setBook(r.papers), fail);
    }
    if (plot) api.get('/api/papers/in/outside').then((r) => setOutside(r.papers), fail);
  }, [myKey, plot?.join()]);
  useEffect(refresh, [refresh]);
  // in your own house, the first time: a paper of yours on your table
  useEffect(() => {
    if (!myRoom || !key || !family) return;
    api
      .get('/api/papers/made')
      .then((r) => (r.made ? null : bornPaper(key, family, newPaperAt(GEOM, P.SIZES.half, true))))
      .catch(fail);
  }, [myRoom, key, family?.grain, family?.weight]);

  const views = useMemo(() => [...here, ...outside.filter((v) => !here.some((x) => x.paper === v.paper)), ...(held ? [held] : [])], [here, outside, held]);
  const fields = usePaperFields(views, dripsOf);
  const origin = useMemo(() => originOf(pageW, pageH, GEOM), [pageW, pageH]);
  const frame = useMemo(() => (plot ? frameOf(GEOM, plot) : null), [plot?.join()]);
  // where each paper lies (room m: its middle), here or outside
  const restingAt = useCallback(
    (v) => {
      const at = v.where.at.map((x) => x / 1000);
      return v.where.space === 'outside' ? (frame ? frame.toRoom(at) : null) : at;
    },
    [frame],
  );
  // each where it lies, in the order they came to rest (the last let go lies on top of any it was let go
  // onto: a paper's thickness higher for each under it: room/papers.js stacked)
  const placed = useMemo(
    () =>
      stacked(
        views
          .filter((v) => v.where.space && !v.where.surface)
          .flatMap((view) => {
            const at = restingAt(view);
            if (!at) return [];
            const f = fields.get(view.paper);
            const seals = sealsOf(view, f?.seals);
            return [
              { view, at, rested: restedAt(view), field: f?.field ?? null, grown: f?.n ?? 0, facts: f?.facts ?? null, seals, mayWrite: mayMark(view, myKey), sheet: sceneSheetOf(view, at, origin) },
            ];
          }),
      ),
    [views, fields, myKey, origin, restingAt],
  );
  const placedRef = useRef(placed);
  placedRef.current = placed;

  // the writers: one for each paper you write on, let go when it is no longer yours to mark here
  const [writers, setWriters] = useState(() => new Map()); // paper → room/papers.js writer
  const writersRef = useRef(writers);
  writersRef.current = writers;
  const active = useRef(null); // the writer the pen is on
  const lastWritten = useRef(null); // the writer last written with (lift)
  // the house's surfaces written on (law/paper.js: its walls, floor, ceiling and table top, each matter with its
  // chain), and those you begin writing on now (theirs once their birth is stamped)
  const [begun, setBegun] = useState(() => new Map()); // surface → { view, ready }
  const surfaces = useMemo(() => {
    const stamped = here.filter((v) => v.where.surface);
    return [...stamped, ...[...begun.values()].map((b) => b.view).filter((v) => !stamped.some((x) => x.where.surface === v.where.surface))];
  }, [here, begun]);
  const surfacesRef = useRef(surfaces);
  surfacesRef.current = surfaces;
  useEffect(() => {
    const keep = new Set([...placed.filter((p) => p.mayWrite).map((p) => p.view.paper), ...surfaces.filter((v) => mayMark(v, myKey)).map((v) => v.paper)]);
    const gone = [...writers.keys()].filter((s) => !keep.has(s));
    if (!gone.length) return;
    const next = new Map(writers);
    for (const s of gone) {
      next.get(s).destroy();
      next.delete(s);
    }
    setWriters(next);
  }, [placed, surfaces, writers, myKey]);
  useEffect(() => () => writersRef.current.forEach((w) => w.destroy()), []);
  // the pen in the hand, as the law takes it on a paper: what the writers write with
  const penNow = useMemo(() => pen.lawPen(P.PAPER_LAW), [pen]);
  useEffect(() => {
    for (const w of writers.values()) w.setPen(penNow);
  }, [penNow, writers]);
  // the stamped paper grown anew: your guess goes once everything you sent is in it
  useEffect(() => {
    for (const p of placed) writers.get(p.view.paper)?.settled(p.view, p.grown);
    for (const v of surfaces) writers.get(v.paper)?.settled(v, fields.get(v.paper)?.n ?? 0);
  }, [placed, surfaces, fields, writers]);
  const writerFor = useCallback(
    (paper) => {
      let w = writersRef.current.get(paper);
      if (w) return w;
      const p = placedRef.current.find((x) => x.view.paper === paper);
      if (!p?.mayWrite || !key) return null;
      w = createPaperWriter({ key, view: p.view, pen: penNow, onNotice: setNotice });
      writersRef.current = new Map(writersRef.current).set(paper, w);
      setWriters(writersRef.current);
      return w;
    },
    [key, penNow],
  );

  // others' strokes as they come (world.md Phase 2: each writer's pen heard from where it wrote, as it was
  // written); what lay there when you came is not heard
  const listeners = useRef(new Set());
  const heardTo = useRef(new Map()); // paper → its lines heard so far
  useEffect(() => {
    for (const p of placed) {
      const was = heardTo.current.get(p.view.paper);
      heardTo.current.set(p.view.paper, p.view.lines.length);
      if (was === undefined || !listeners.current.size) continue;
      for (const l of p.view.lines.slice(was)) {
        if (l.act.act !== 'stroke' || l.act.by === myKey) continue;
        for (const fn of listeners.current) fn({ origin: p.sheet.origin, rec: strokeOf(l), seed: l.n });
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

  // the ink on the house's surfaces, as the scene draws it (scene/marks.js): each surface's grown field, and your
  // guess over it while you write there
  const surfaceGuesses = useRef(new Map()); // paper → { writer, field, live }
  const marks = useMemo(
    () =>
      surfaces.flatMap((v) => {
        const field = fields.get(v.paper)?.field ?? null;
        const w = writers.get(v.paper);
        // (a mark's origin: where its box's corner lies on the surface, its units: scene/marks.js)
        if (!w)
          return field ? [{ id: `surface:${v.paper}`, surface: v.where.surface, origin: [field.box[0] / CELLS, field.box[1] / CELLS], cellUnits: 1 / CELLS, box: field.box, abs: field.abs }] : [];
        const g = surfaceGuesses.current.get(v.paper);
        const live = g?.writer === w && g.field === field ? g.live : guessOver(w.live, field);
        surfaceGuesses.current.set(v.paper, { writer: w, field, live });
        // (and its ink as stamped, for the room's light: scene/inkLight.js)
        const ink = field ? { origin: [field.box[0] / CELLS, field.box[1] / CELLS], box: field.box, abs: field.abs } : null;
        return [{ id: `surface:${v.paper}`, surface: v.where.surface, origin: [0, 0], cellUnits: 1 / CELLS, box: [0, 0, v.birth.size[0] * CELLS, v.birth.size[1] * CELLS], live, ink }];
      }),
    [surfaces, fields, writers],
  );
  // the pen on a surface of your own house (from Look: rooms.md §2), in that surface's units: the first stroke
  // on one makes it matter with its own chain
  const surfaceWriter = useRef(null);
  const wallWriter = useMemo(
    () =>
      myRoom && key
        ? {
            down(surface, p, ev, type) {
              let v = surfacesRef.current.find((x) => x.where.surface === surface);
              let ready = null;
              if (!v) {
                const b = newSurface(key, surface);
                b.ready.catch(fail);
                setBegun((m) => new Map(m).set(surface, b));
                [v, ready] = [b.view, b.ready];
              } else ready = begun.get(surface)?.view.paper === v.paper ? begun.get(surface).ready : null;
              let w = writersRef.current.get(v.paper);
              if (!w) {
                w = createPaperWriter({ key, view: v, pen: penNow, ready, onNotice: setNotice });
                writersRef.current = new Map(writersRef.current).set(v.paper, w);
                setWriters(writersRef.current);
              }
              surfaceWriter.current = w;
              lastWritten.current = w;
              return w.pen.down(p, ev, type);
            },
            move: (p, ev) => surfaceWriter.current?.pen.move(p, ev),
            up: (p, ev) => surfaceWriter.current?.pen.up(p, ev),
            cancel: () => surfaceWriter.current?.pen.cancel(),
            nib: () => surfaceWriter.current?.nib() ?? null,
          }
        : null,
    [myRoom, key, penNow, begun],
  );

  const [tool, setTool] = useState('pen'); // 'pen' | { seal: { name, key, w, h, face } }
  // the stamper's face as its chain has it: their seal, from their signature (backend routes/signatures.js)
  const faceName = useMemo(() => R.stamperFace(lines), [lines]);
  useEffect(() => {
    if (!faceName) return setTool('pen');
    let alive = true;
    api
      .get(`/api/signatures/${encodeURIComponent(faceName)}/seal`)
      .then((r) => alive && r?.face && setTool({ seal: r }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [faceName]);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  // the scene: each paper where it lies, grown, your guess over it; the one in your hand, in it
  const guesses = useRef(new Map()); // paper → { writer, field, live }
  const sceneSheets = useMemo(() => {
    const lying = placed.map((p) => {
      const w = writers.get(p.view.paper);
      let live;
      if (w) {
        const g = guesses.current.get(p.view.paper);
        if (g?.writer === w && g.field === p.field) live = g.live;
        else {
          live = guessOver(w.live, p.field);
          guesses.current.set(p.view.paper, { writer: w, field: p.field, live });
        }
      }
      return { ...p.sheet, field: p.field ?? undefined, live };
    });
    if (!held) return lying;
    const inHand = sceneSheetOf(held, [0, 0, GEOM.table.top], origin);
    return [...lying, { ...inHand, origin: [0, 0], lift: 0, held: true, field: fields.get(held.paper)?.field ?? undefined }];
  }, [placed, writers, held, fields, origin]);
  // the pen on the papers lying on this table that you may mark (in each one's own units)
  const writable = placed.filter((p) => p.mayWrite && p.view.where.space === roomKey && P.onTable(p.view.where));
  const rects = writable.map((p) => `${p.view.paper}@${p.sheet.origin.join()}`).join('|');
  const tableWriter = useMemo(
    () => ({
      sheets: [...writable].reverse().map((p) => ({ sheet: p.view.paper, origin: p.sheet.origin, size: p.sheet.size })), // (the topmost first)
      down(paper, q, ev, type) {
        const w = writerFor(paper);
        if (!w) return false;
        active.current = w;
        lastWritten.current = w;
        return w.pen.down(q, ev, type);
      },
      // the stamper in the hand pressed here, its face set to someone's seal (harder with a pen pressed
      // harder); without a face, nothing
      press(paper, q, ev) {
        const w = writerFor(paper);
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
      // worn through at q (its units)? Then the nib there is on what the paper lies on (law 4)
      wornAt: (paper, q) => wornAt(writersRef.current.get(paper)?.live, fields.get(paper)?.field, q),
    }),
    [rects, writerFor, fields],
  );

  // the hand on the papers (SceneView's `papers`): take one up where it lies, let the one in your hand go
  // at a place (room m: in this house, or outside it), post it into a mailbox, take the oldest letter out of
  // yours; a bare hand pressed on a seal of yours (under its palm) cracks its wax
  const moved = (p) => p.then(refresh, (err) => (fail(err), refresh()));
  const hand = useMemo(
    () => ({
      lying: placed.map((p) => ({ paper: p.view.paper, sheet: p.sheet.id, origin: p.sheet.origin, size: p.sheet.size, lift: p.sheet.lift })),
      held: held ? { paper: held.paper, sheet: `paper:${held.paper}`, size: held.birth.size } : null,
      take(paper) {
        const p = placedRef.current.find((x) => x.view.paper === paper);
        if (p && key) moved(paperAct(key, p.view, 'take'));
      },
      put(at) {
        if (!held || !key) return;
        const out = !inBox(GEOM, at) && frame;
        moved(paperAct(key, held, 'put', out ? { space: 'outside', at: frame.toWorld(at) } : { space: roomKey, at }));
        setHeld(null);
      },
      post(toKey) {
        if (!held || !key) return Promise.resolve();
        setHeld(null);
        return moved(paperAct(key, held, 'post', { to: toKey }));
      },
      async takeLetter() {
        const [view] = (await api.get('/api/papers/mailbox').catch(fail))?.papers ?? [];
        if (!view) return fail(new Error('Your mailbox is empty.'));
        return moved(paperAct(key, view, 'take'));
      },
      letters: async (keys) =>
        new Map(
          await Promise.all(
            keys.map((k) =>
              api.get(`/api/papers/mailbox/${k}`).then(
                (r) => [k, r.letters],
                () => [k, 0],
              ),
            ),
          ),
        ),
      touch(paper, q) {
        const p = placedRef.current.find((x) => x.view.paper === paper);
        if (!p || p.view.ownerKey !== myKey) return false;
        const palm = HAND.r * PX_PER_M + SEAL_R; // (a seal under the palm: its wax cracked)
        const seal = p.seals.find((x) => !x.broken && Math.hypot(x.at.x - q.x, x.at.y - q.y) <= palm);
        const w = seal && writerFor(paper);
        if (!w) return false;
        w.breakSeal(seal.n, seal.at);
        return true;
      },
    }),
    [placed, held, key, roomKey, frame, myKey, writerFor],
  );

  const others = useMemo(() => beings.filter((b) => b.name !== me), [beings, me]);
  // everyone else in the world, where they are (the world's stream: world m), drawn in this house's frame:
  // out of doors, in their own houses, in this one (one-world.md: one space)
  const world = useWorld();
  const things = useThings(name);
  // whether a being holds one of this house's pens (its acts: in a hand, theirs)
  const holdsPen = useCallback((who) => R.PENS.some((p) => things?.[p]?.at === null && things[p]?.by === who), [things]);
  const seen = useMemo(() => {
    if (!frame) return others.map((b) => ({ ...b, pen: holdsPen(b.name) }));
    const local = (pose) => pose && { ...pose, pos: frame.toRoom(pose.pos) };
    return world.beings.filter((b) => b.name !== me && b.to).map((b) => ({ ...b, from: local(b.from), to: local(b.to), pen: holdsPen(b.name) }));
  }, [world.beings, frame, me, others, holdsPen]);
  const actions = {
    // one more paper on your own table, somewhere on it
    newPaper: ({ size = P.SIZES.half, rule = 0 } = {}) => (key && family ? bornPaper(key, family, newPaperAt(GEOM, size), { size, rule }).catch(fail) : null),
    lift: () => lastWritten.current?.lift(),
    useTool: (t) => setTool(t),
    // the stamper's face set to someone's seal: an act on it, its fact for everyone (law/room.js stamperFace)
    stamperFor(who) {
      if (key && roomKey) roomAct(name, key, roomKey, { act: 'set', thing: 'stamper', set: { name: who } });
    },
    // the paper in your hand into your book, at a path (names, from the book's top); one out of it, into your hand
    shelve: (path) => (held && key ? (setHeld(null), moved(paperAct(key, held, 'shelve', { book: path }))) : null),
    takeOut: (view) => (key ? moved(paperAct(key, view, 'take')) : null),
  };

  // Lighting the candles and putting them out are acts (matter-fixes §2). As the sun goes down by
  // the world's clock (law/room.js isNight), or as one comes in at night, the first of those here
  // (by name) lights them; as it comes up, puts them out; the last one to leave puts them out as it
  // goes (that, the chain: law/room.js litOf, law/wax.js). A candle someone lit or put out by hand (one-world.md, its panel: lightCandle) is left as
  // they had it until the sun turns again. (globalThis.__candles, for the e2e: light(which),
  // out(which) by hand, and the clock leaves them be.)
  const [dusk, setNight] = useState(() => R.isNight(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setNight(R.isNight(Date.now())), 60000);
    return () => clearInterval(t);
  }, []);
  // shut up (the door and the shutters shut: outside.md Phase 4) no daylight comes in: as at night
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
  useEffect(() => {
    if (!body || !key || !roomKey) return;
    globalThis.__candles = {
      light: (which) => ((byHand.on = true), roomAct(name, key, roomKey, { act: 'light', thing: R.CANDLES[which] })),
      out: (which) => ((byHand.on = true), roomAct(name, key, roomKey, { act: 'out', thing: R.CANDLES[which] })),
      candle: (which) => candles.candle(which),
    };
  }, [name, body, key, roomKey, candles]);
  // (for the checks, e2e/oneworld.mjs: everyone else in the world as this screen sees them, in its frame)
  globalThis.__world = { seen: () => seen.map((b) => ({ name: b.name, house: b.house, at: b.to?.pos ?? null })), opens: () => world.opens };
  // (for the checks, e2e: the papers here and where each lies (room m), the one in your hand, your book)
  globalThis.__papers = {
    lying: () =>
      placedRef.current.map((p) => ({ paper: p.view.paper, owner: p.view.owner, at: p.at, lines: p.view.lines.length, grown: p.grown, facts: p.facts, mayWrite: p.mayWrite, seals: p.seals })),
    held: () => held?.paper ?? null,
    book: () => book.map((v) => ({ paper: v.paper, path: v.where.book })),
  };

  const scene = useMemo(
    () => ({ sheets: sceneSheets, marks, wallWriter, tableWriter: key ? tableWriter : null, beings: seen, opens: world.opens, onPose: report, heard, papers: key ? hand : null }),
    [sceneSheets, marks, wallWriter, tableWriter, seen, world.opens, report, heard, hand, key],
  );
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
    papers: placed,
    held,
    book,
    notice,
    clearNotice: () => setNotice(null),
    tool,
    ...actions,
    scene,
  };
}
