// Carrying the room's things (rooms.md §3b): a candle picked up (a click on it),
// carried over the table at a hand's height above what is under it, tilted (E held,
// the mouse), and set down (a click), where it falls straight down until it rests.
// Picking up and setting down are place acts on the room's chain (backend
// store/rooms.js); where each candle stands is read from them, and its light comes
// from there (light.js placeCandle). onTilt(which, tilt, at): the hand tilted it
// (what tips its melt pool: matter-fixes §2).
//   name: the room; me: who holds; page: [w, h] (page px); sheets: the shared sheets on
//   the table, as room/drops.js landing takes them
// → { hand (SceneView's hand prop), held: () => { which, at, tilt } | null }

import { useEffect, useMemo, useRef, useState } from 'react';
import { useThings, placeThing } from './presence.js';
import { landing } from './drops.js';
import { theLight, GEOM, originOf } from '../scene/light.js';
import { HOLDER } from '../scene/light/room.js';

export const HAND_M = 0.18; // a carried thing is held this far above what is under it
const UPRIGHT_M = 0.2; // a candle in its holder, for the hand to find it
const TILT_MAX = 90;

// Where a thing let go of at `p` (room m) comes to rest: straight down onto what is under it.
export const restOf = (geom, origin, sheets, p) => [p[0], p[1], landing(geom, [p[0], p[1]], { origin, sheets }).z];
// Where it is held over `p`: a hand's height above what is under it.
export const heldOver = (geom, origin, sheets, p) => {
  const r = restOf(geom, origin, sheets, p);
  return [r[0], r[1], r[2] + HAND_M];
};
// Each candle's foot now: where its last place act set it, else where the room was made with it.
export const candleFoot = (geom, things, which) => things[`candle-${which}`]?.at ?? geom.candles[which];

export function useCarry({ name, me, page, sheets = [], onTilt = null }) {
  const things = useThings(name);
  const [holding, setHolding] = useState(null); // which candle is in the hand
  const held = useRef(null); // { which, at, tilt }
  const origin = useMemo(() => originOf(page[0], page[1], GEOM), [page[0], page[1]]);
  const live = useRef({ sheets, onTilt, things });
  live.current = { sheets, onTilt, things };
  // others' doings: each candle where it was last set down (held by someone else: where it was)
  useEffect(() => {
    for (const which of [0, 1]) {
      if (held.current?.which === which) continue;
      const t = things[`candle-${which}`];
      if (t?.at) theLight().placeCandle(which, t.at, 0);
    }
  }, [things]);
  const hand = useMemo(() => {
    if (!name || !me) return null;
    const put = (h) => {
      held.current = h;
      theLight().placeCandle(h.which, h.at, h.tilt);
    };
    return {
      holding: holding !== null,
      pickables:
        holding !== null
          ? []
          : [0, 1]
              .filter((w) => {
                const t = things[`candle-${w}`];
                return !(t && t.at === null && t.by !== me); // (someone else is holding it)
              })
              .map((w) => ({ id: w, at: candleFoot(GEOM, things, w), r: HOLDER.radius + 0.01, h: UPRIGHT_M })),
      pick(which) {
        const foot = candleFoot(GEOM, live.current.things, which);
        put({ which, at: [foot[0], foot[1], foot[2] + HAND_M], tilt: 0 });
        setHolding(which);
        placeThing(name, `candle-${which}`, null).catch(() => {});
      },
      hover(p) {
        const h = held.current;
        if (h) put({ ...h, at: heldOver(GEOM, origin, live.current.sheets, p) });
      },
      tiltBy(d) {
        const h = held.current;
        if (!h) return;
        put({ ...h, tilt: Math.max(0, Math.min(TILT_MAX, h.tilt + d)) });
        live.current.onTilt?.(h.which, held.current.tilt, h.at);
      },
      down(p) {
        const h = held.current;
        if (!h) return false;
        const rest = restOf(GEOM, origin, live.current.sheets, p);
        put({ which: h.which, at: rest, tilt: 0 }); // (set down in its holder, it stands upright)
        held.current = null;
        setHolding(null);
        live.current.onTilt?.(h.which, 0, rest);
        placeThing(name, `candle-${h.which}`, rest).catch(() => {});
        return true;
      },
    };
  }, [name, me, holding, things, origin]);
  return { hand, held: () => held.current };
}
