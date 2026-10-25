// Carrying the room's things (rooms.md §3b): a candle picked up (a click on it),
// carried over the table at a hand's height above what is under it, tilted (E held,
// the mouse), and set down (a click), where it falls straight down until it rests.
// Picking up and setting down are place acts, sealed by your key, on the room's chain
// (law/room.js; backend store/rooms.js); where each candle stands is read from them, and its
// light comes from there (light.js placeCandle). Tilting it is your act too, coarse like your
// head's (law/room.js isTiltAct: past a turn or a step, at most five a second): its drips are
// the law's, regrown by everyone from the chain (matter-fixes §2; room/together.js).
//   name: the room; me: who holds; key: yours; room: its owner's key; page: [w, h] (page px);
//   sheets: the shared sheets on the table, as room/drops.js landing takes them
// The pens (rooms.md §3c; law/room.js PENS: a plain pen, a flex nib, a broad nib) are picked up and
// set down the same way: the one picked up is the pen in the hand (pens.hold), which writes; set
// down (H), it lies on the table where its nib was (read from its place acts), and another may be
// picked up. The ink jar too: carried and set down like the stamper.
// The stamper (rooms.md §3b, the second thing on the table) too: picked up (a click on it),
// carried, its face set in its panel (one-world.md), pressed with a click on a shared sheet,
// set down (E) where it falls onto what is under it.
//   pens: { held (the pen id in the hand), hold(id) } (components/PenPanel.jsx usePens)
// → { hand (SceneView's hand prop), held: () => { thing, which, at, tilt } | null }

import { useEffect, useMemo, useRef, useState } from 'react';
import { room as R, being as B } from 'penpals-law';
import { useThings, roomAct } from './presence.js';
import { landing } from './drops.js';
import { theLight, GEOM, originOf } from '../scene/light.js';
import { HOLDER, STAMPER, PEN, JAR, stamperRestOf, penRestOf, jarRestOf } from '../scene/light/room.js';

export const HAND_M = 0.18; // a carried thing is held this far above what is under it
const UPRIGHT_M = 0.2; // a candle in its holder, for the hand to find it
const TILT_MAX = R.TILT_MAX;

// Where a thing let go of at `p` (room m) comes to rest: straight down onto what is under it.
export const restOf = (geom, origin, sheets, p) => [p[0], p[1], landing(geom, [p[0], p[1]], { origin, sheets }).z];
// Where it is held over `p`: a hand's height above what is under it.
export const heldOver = (geom, origin, sheets, p) => {
  const r = restOf(geom, origin, sheets, p);
  return [r[0], r[1], r[2] + HAND_M];
};
// Each candle's foot now: where its last place act set it, else where the room was made with it.
export const candleFoot = (geom, things, which) => things[`candle-${which}`]?.at ?? geom.candles[which];
// The stamper: where its last place act set it, else on the table left of the page, face down.
export const stamperRest = (geom) => stamperRestOf(geom);
export const stamperFoot = (geom, things) => things.stamper?.at ?? stamperRest(geom);
// Each pen where it lies: where its last place act set it down, else its own place; held: null.
export const penFoot = (geom, things, id) => (things[id] && things[id].at === null ? null : (things[id]?.at ?? penRestOf(geom, R.PENS.indexOf(id))));
export const jarFoot = (geom, things) => things.jar?.at ?? jarRestOf(geom);
const KIND = (thing) => (thing.startsWith('candle-') ? 'candle' : R.PENS.includes(thing) ? 'pen' : thing);

export function useCarry({ name, me, key = null, room = null, page, sheets = [], pens = null }) {
  const things = useThings(name);
  const [holding, setHolding] = useState(null); // what is in the hand (a pen aside): 'candle-0' | 'candle-1' | 'stamper' | 'jar' | null
  const held = useRef(null); // { thing, which (a candle's), at, tilt }
  const origin = useMemo(() => originOf(page[0], page[1], GEOM), [page[0], page[1]]);
  const live = useRef({ sheets, things });
  live.current = { sheets, things };
  // the tilt acts sent: the last, when, and one held back by the rate
  const tilts = useRef({ last: null, at: 0, timer: 0 });
  useEffect(() => () => clearTimeout(tilts.current.timer), []);
  // others' doings: each candle where it was last set down (held by someone else: where it was)
  useEffect(() => {
    for (const which of [0, 1]) {
      if (held.current?.which === which) continue;
      const t = things[`candle-${which}`];
      if (t?.at) theLight().placeCandle(which, t.at, 0);
    }
  }, [things]);
  const hand = useMemo(() => {
    if (!name || !me || !key || !room) return null;
    const act = (a) => roomAct(name, key, room, a);
    const placeThing = (thing, to) => act({ act: 'place', thing, to });
    const put = (h) => {
      held.current = h;
      if (h.which !== null) theLight().placeCandle(h.which, h.at, h.tilt);
    };
    // the candle in hand tilted or moved: an act when it has changed enough (and, sooner
    // than the rate allows, a moment later if the hand stays there)
    const tilted = (h) => {
      const T = tilts.current;
      const next = { pos: h.at, deg: h.tilt };
      const send = () => {
        T.last = next;
        T.at = performance.now();
        act({ act: 'tilt', thing: `candle-${h.which}`, pos: next.pos, deg: next.deg });
      };
      const now = performance.now();
      clearTimeout(T.timer);
      if (R.isTiltAct(T.last, T.at, next, now)) send();
      else if (R.isTiltAct(T.last, -Infinity, next, now)) T.timer = setTimeout(send, Math.max(0, T.at + 1000 / B.MAX_RATE - now) + 40);
    };
    const upright = (at) => {
      clearTimeout(tilts.current.timer);
      tilts.current = { last: { pos: at, deg: 0 }, at: 0, timer: 0 }; // (a place act stands it upright)
    };
    const free = (thing) => {
      const t = things[thing];
      return !(t && t.at === null && t.by !== me); // (someone else is holding it)
    };
    const penHeld = pens?.held ?? 'pen';
    return {
      holding: holding !== null,
      kind: holding === null ? null : KIND(holding), // (the panel's)
      which: holding?.startsWith('candle-') ? Number(holding.slice(7)) : null, // the candle in the hand (0, 1), or null
      // what the hand may take up, each with its kind: 'candle' | 'stamper' | 'pen' | 'jar'
      pickables:
        holding !== null
          ? []
          : [
              ...[0, 1].filter((w) => free(`candle-${w}`)).map((w) => ({ id: w, kind: 'candle', at: candleFoot(GEOM, things, w), r: HOLDER.radius + 0.01, h: UPRIGHT_M })),
              ...(free('stamper') ? [{ id: 'stamper', kind: 'stamper', at: stamperFoot(GEOM, things), r: STAMPER.face + 0.01, h: STAMPER.handle }] : []),
              ...R.PENS.filter((id) => free(id) && penFoot(GEOM, things, id)).map((id) => ({ id, kind: 'pen', at: penFoot(GEOM, things, id), r: PEN.length / 2, h: PEN.thick * 2 })),
              ...(free('jar') ? [{ id: 'jar', kind: 'jar', at: jarFoot(GEOM, things), r: JAR.radius + 0.01, h: JAR.height }] : []),
            ],
      // take it up: → its kind (a pen taken up is the pen in the hand: SceneView's pen)
      pick(id) {
        if (R.PENS.includes(id)) {
          // another pen in the hand is set down at its own place first
          const was = live.current.things[penHeld];
          if (penHeld !== id && was && was.at === null && was.by === me) placeThing(penHeld, penRestOf(GEOM, R.PENS.indexOf(penHeld)));
          pens?.hold(id);
          placeThing(id, null);
          return 'pen';
        }
        const thing = typeof id === 'number' ? `candle-${id}` : id;
        const foot = thing === 'stamper' ? stamperFoot(GEOM, live.current.things) : thing === 'jar' ? jarFoot(GEOM, live.current.things) : candleFoot(GEOM, live.current.things, id);
        put({ thing, which: typeof id === 'number' ? id : null, at: [foot[0], foot[1], foot[2] + HAND_M], tilt: 0 });
        upright(held.current.at);
        setHolding(thing);
        placeThing(thing, null);
        return KIND(thing);
      },
      // where the jar is now (room m): in the hand, or where it lies
      jarAt: () => (held.current?.thing === 'jar' ? held.current.at : jarFoot(GEOM, live.current.things)),
      // where the stamper is now (room m): in the hand, or where it lies
      stamperAt: () => (held.current?.thing === 'stamper' ? held.current.at : stamperFoot(GEOM, live.current.things)),
      hover(p) {
        const h = held.current;
        if (!h) return;
        put({ ...h, at: heldOver(GEOM, origin, live.current.sheets, p) });
        if (h.tilt > 0) tilted(held.current);
      },
      tiltBy(d) {
        const h = held.current;
        if (!h || h.which === null) return; // (only a candle is tilted)
        put({ ...h, tilt: Math.max(0, Math.min(TILT_MAX, h.tilt + d)) });
        tilted(held.current);
      },
      // the pens: where each lies (room m), null the one in a hand
      penPlaces: Object.fromEntries(R.PENS.map((id) => [id, penFoot(GEOM, things, id)])),
      penHeld,
      // the pen in the hand is a dip pen; its nib into the jar (a dip: the next stroke's reservoir full)
      penDips: !!pens?.pen?.dip,
      dip: () => pens?.dip(),
      // the pen in the hand set down over `p` (room m): it falls onto what is under it (no p: at its own place)
      penDown(p) {
        placeThing(penHeld, p ? restOf(GEOM, origin, live.current.sheets, p) : penRestOf(GEOM, R.PENS.indexOf(penHeld)));
      },
      penUp() {
        placeThing(penHeld, null);
      },
      down(p) {
        const h = held.current;
        if (!h) return false;
        const rest = restOf(GEOM, origin, live.current.sheets, p);
        put({ ...h, at: rest, tilt: 0 }); // (set down in its holder, it stands upright)
        held.current = null;
        setHolding(null);
        upright(rest);
        placeThing(h.thing, rest);
        return true;
      },
    };
  }, [name, me, key, room, holding, things, origin, pens]);
  return { hand, held: () => held.current };
}
