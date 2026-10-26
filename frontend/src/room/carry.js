// Carrying the room's things (rooms.md §3b; Tabor, 2026-10-25: nothing is glued to a place): a thing
// picked up (a click on it) is in the hand, carried at a hand's height over what is under it (keeping its
// height over what is lower: past the table's edge it is in the air over the floor; Q lowers it, Z raises
// it, never through what is under it), and let go (a click)
// where the hand has it: from there it falls until it rests, and what it meets on the way, carried, it
// pushes (law/bodies.js: everyone regrows where each thing is from the room's chain). Picking up and
// letting go are place acts, sealed by your key, on the room's chain (law/room.js; backend
// store/rooms.js); carrying is too, coarse like your head's (law/room.js isTiltAct: past a step, at most
// five a second): a candle's are tilt acts (where the hand has it, and how far it leans: E held, the
// mouse), anything else's carry acts. A candle's light comes from where its body is (light.js
// placeCandle), and its drips are the law's, regrown by everyone from the chain (matter-fixes §2;
// room/together.js).
//   name: the room; me: who holds; key: yours; room: its owner's key
// The pens (rooms.md §3c; law/room.js PENS: a plain pen, a flex nib, a broad nib) are picked up and
// set down the same way: the one picked up is the pen in the hand (pens.hold), which writes; set
// down (H), it lies where its nib was, and another may be picked up. The ink jar and the stamper
// (rooms.md §3b: its face set in its panel, one-world.md; pressed with a click on a paper) are
// carried and let go like the candles. The window is opened and shut (E at it: world.md Phase 3, what
// comes in through it): an act too.
//   pens: { held (the pen id in the hand), hold(id) } (components/PenPanel.jsx usePens)
// → { hand (SceneView's hand prop), held: () => { thing, which, at, tilt } | null }

import { useEffect, useMemo, useRef, useState } from 'react';
import { room as R, being as B } from 'penpals-law';
import { startBodies, stepBodies, bodyAt, bobAt } from 'penpals-law/bodies';
import { useThings, useRoomLines, roomAct } from './presence.js';
import { landing } from './drops.js';
import { bodiesContext } from './table.js';
import { theLight, GEOM } from '../scene/light.js';
import { penRestOf, PEN } from '../scene/light/room.js';

export const HAND_M = 0.01; // a carried thing is held just this clear of what is under it, so it meets what stands there (Tabor's to set)
const TILT_MAX = R.TILT_MAX;
const BODIES = bodiesContext(GEOM);

// Where a thing let go of at `p` (room m) comes to rest: straight down onto what is under it (a paper is
// matter too thin to stand on: law/paper.js).
export const restOf = (geom, p) => [p[0], p[1], landing(geom, [p[0], p[1]]).z];
// Where it is held over `p`: a hand's height above what is under it.
export const heldOver = (geom, p) => {
  const r = restOf(geom, p);
  return [r[0], r[1], r[2] + HAND_M];
};
// The room's things as bodies after its lines (law/bodies.js), and those of your own acts not yet back
// on its chain (shown done: they will be).
export function bodiesAfter(lines, pending = []) {
  const S = startBodies(BODIES.start);
  for (const l of lines) stepBodies(S, l, BODIES);
  for (const l of pending) stepBodies(S, l, BODIES);
  return S;
}
// Where a thing is now (its foot, room m), falling while it falls; and each candle's.
export const footNow = (bodies, thing, ms = Date.now()) => (bodies[thing] ? bodyAt(bodies[thing], ms) : BODIES.start[thing]);
export const candleFoot = (bodies, which, ms) => footNow(bodies, `candle-${which}`, ms);
// a body falling now (let go above where it rests, not yet down)
const fallingNow = (b, ms) => !!b.fell && ms > b.fell.ms && bodyAt(b, ms)[2] > b.at[2];
const KIND = (thing) => (thing.startsWith('candle-') ? 'candle' : R.PENS.includes(thing) ? 'pen' : thing);
const SWING_LASTS_MS = 120000; // a swing is drawn as it goes this long at most (law/string.js: it dies down long before)
// how far the candle held by `by` leans (its last tilt act), else upright
const tiltOf = (lines, thing, by) => {
  for (let i = lines.length - 1; i >= 0; i--) {
    const a = lines[i].act;
    if (a?.thing !== thing || a.by !== by) continue;
    return a.act === 'tilt' ? a.deg : 0;
  }
  return 0;
};
const sameAct = (a, b) => a?.by === b.by && a.act === b.act && a.thing === b.thing && JSON.stringify(a.to ?? a.pos) === JSON.stringify(b.to ?? b.pos);

export function useCarry({ name, me, key = null, room = null, pens = null }) {
  const things = useThings(name);
  const lines = useRoomLines(name);
  const [pending, setPending] = useState([]); // your acts on its things sent, not yet back on the room's chain
  useEffect(() => setPending((p) => (p.length ? p.filter((x) => !lines.some((l) => sameAct(l.act, x.act))) : p)), [lines]);
  const bodies = useMemo(() => bodiesAfter(lines, pending), [lines, pending]);
  const [holding, setHolding] = useState(null); // what is in the hand (a pen aside): 'candle-0' | 'candle-1' | 'stamper' | 'jar' | null
  const held = useRef(null); // { thing, which (a candle's), at, tilt }
  const live = useRef({ things, bodies });
  live.current = { things, bodies };
  // (for the checks, e2e/matter.mjs: where each thing is, as its body)
  globalThis.__things = {
    bodies: () => live.current.bodies,
    at: (thing, ms) => footNow(live.current.bodies, thing, ms),
    bob: (ms = Date.now()) => (live.current.bodies.pendulum ? bobAt(live.current.bodies.pendulum, BODIES.shapes.pendulum, ms) : null),
  };
  // the carry acts sent: the last, when, and one held back by the rate
  const tilts = useRef({ last: null, at: 0, timer: 0 });
  const reaches = useRef({ last: null, at: 0, timer: 0 }); // (the bare hand's reach acts, coarse as a carry)
  useEffect(() => () => clearTimeout(tilts.current.timer), []);
  // each candle where its body is: held by someone else, where their hand has it; let go, falling as it falls
  useEffect(() => {
    let frame = 0;
    const place = () => {
      const ms = Date.now();
      let falling = false;
      for (const which of [0, 1]) {
        if (held.current?.which === which) continue;
        const thing = `candle-${which}`,
          b = bodies[thing];
        if (!b) continue;
        falling ||= fallingNow(b, ms);
        theLight().placeCandle(which, bodyAt(b, ms), b.lying ? 90 : b.held ? tiltOf(lines, thing, b.held) : 0, b.lying ?? [1, 0]);
      }
      if (falling) frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [bodies, lines]);
  const hand = useMemo(() => {
    if (!name || !me || !key || !room) return null;
    // an act on a thing: sent, and shown done until the room's chain has it
    const act = (a) => {
      if (a.act === 'place' || a.act === 'tilt' || a.act === 'carry') {
        const mm = (p) => p.map((v) => Math.round(v * 1000));
        const shown = {
          kind: 'room',
          by: key.publicKey,
          act: a.act,
          thing: a.thing,
          ...(a.act === 'place' ? { to: a.to && mm(a.to) } : { pos: mm(a.pos) }),
          ...(a.act === 'tilt' ? { deg: Math.round(a.deg) } : {}),
        };
        setPending((p) => [...p, { at: new Date().toISOString(), act: shown }]);
      }
      return roomAct(name, key, room, a);
    };
    const placeThing = (thing, to) => act({ act: 'place', thing, to });
    const put = (h) => {
      held.current = h;
      if (h.which !== null) theLight().placeCandle(h.which, h.at, h.tilt);
    };
    // the thing in hand moved (a candle: or tilted): an act when it has changed enough (and, sooner than
    // the rate allows, a moment later if the hand stays there)
    const moved = (h) => {
      const T = tilts.current;
      const next = { pos: h.at, deg: h.which === null ? 0 : h.tilt };
      const send = () => {
        T.last = next;
        T.at = performance.now();
        act(h.which === null ? { act: 'carry', thing: h.thing, pos: next.pos } : { act: 'tilt', thing: h.thing, pos: next.pos, deg: next.deg });
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
    // where the hand finds a thing: standing, its foot up its height; lying, along its length, as thick as it is
    const pickable = (thing, kind, id) => {
      const b = bodies[thing],
        s = BODIES.shapes[thing];
      const foot = footNow(bodies, thing);
      if (b?.lying) return { id, kind, at: [foot[0] + (b.lying[0] * s.h) / 2, foot[1] + (b.lying[1] * s.h) / 2, foot[2]], r: s.h / 2 + 0.01, h: 2 * s.r };
      return { id, kind, at: foot, r: s.r + 0.01, h: kind === 'pen' ? s.h * 2 : s.h };
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
              ...[0, 1].filter((w) => free(`candle-${w}`)).map((w) => pickable(`candle-${w}`, 'candle', w)),
              ...(free('stamper') ? [pickable('stamper', 'stamper', 'stamper')] : []),
              ...R.PENS.filter((id) => free(id) && !bodies[id]?.held).map((id) => ({ ...pickable(id, 'pen', id), r: PEN.length / 2 })),
              ...(free('jar') ? [pickable('jar', 'jar', 'jar')] : []),
              ...(free('pendulum') ? [pickable('pendulum', 'pendulum', 'pendulum')] : []),
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
        const foot = footNow(live.current.bodies, thing);
        put({ thing, which: typeof id === 'number' ? id : null, at: [foot[0], foot[1], foot[2] + HAND_M], tilt: 0 });
        upright(held.current.at);
        setHolding(thing);
        placeThing(thing, null);
        return KIND(thing);
      },
      // where the jar is now (room m): in the hand, or where it lies (and the way it lies, if it does)
      jarAt: () => (held.current?.thing === 'jar' ? held.current.at : footNow(live.current.bodies, 'jar')),
      jarLying: () => (held.current?.thing === 'jar' ? null : (live.current.bodies.jar?.lying ?? null)),
      // the pendulum now (room m): its stand's foot (in the hand, or where it stands or lies), the way it lies,
      // and its bob (hanging, or swinging as the string law has it); and whether it swings
      pendulumAt: () => (held.current?.thing === 'pendulum' ? held.current.at : footNow(live.current.bodies, 'pendulum')),
      pendulumLying: () => (held.current?.thing === 'pendulum' ? null : (live.current.bodies.pendulum?.lying ?? null)),
      bobAt: (ms = Date.now()) => {
        const b = live.current.bodies.pendulum;
        if (!b) return null;
        const at = held.current?.thing === 'pendulum' ? { ...b, at: held.current.at, held: me } : b;
        return bobAt(at, BODIES.shapes.pendulum, ms);
      },
      bob: BODIES.shapes.pendulum.bob,
      // the bare hands reaching in the room now (law/bodies.js: each being's, while it pushes): where each is
      hands: () => Object.entries(live.current.bodies).flatMap(([id, b]) => (id.startsWith('hand:') ? [b.at] : [])),
      swinging: () => {
        const sw = live.current.bodies.pendulum?.bob?.swing;
        return !!sw && Date.now() - sw.ms < SWING_LASTS_MS;
      },
      // the bare hand (a reach act: law/room.js): where it is as it goes (room m), pushing what it meets; null,
      // drawn back
      reach(p) {
        const T = reaches.current;
        const next = p && { pos: p, deg: 0 };
        const send = (to = next) => {
          T.last = to;
          T.at = performance.now();
          act({ act: 'reach', thing: 'hand', pos: to ? to.pos : null });
        };
        clearTimeout(T.timer);
        if (!p) {
          if (T.want && T.want !== T.last) send(T.want); // (where it went last, before it is drawn back)
          T.want = null;
          return send(null);
        }
        T.want = next;
        const now = performance.now();
        if (R.isTiltAct(T.last, T.at, next, now)) send();
        else if (R.isTiltAct(T.last, -Infinity, next, now)) T.timer = setTimeout(send, Math.max(0, T.at + 1000 / B.MAX_RATE - now) + 40);
        return undefined;
      },
      // where the stamper is now (room m): in the hand, or where it lies
      stamperAt: () => (held.current?.thing === 'stamper' ? held.current.at : footNow(live.current.bodies, 'stamper')),
      stamperLying: () => (held.current?.thing === 'stamper' ? null : (live.current.bodies.stamper?.lying ?? null)),
      // anything let go and not yet down (the scene draws it falling)
      falling: () => Object.values(live.current.bodies).some((b) => fallingNow(b, Date.now())),
      // the hand over `p` (a point on what the pointer meets): it keeps its height over what is lower
      hover(p) {
        const h = held.current;
        if (!h) return;
        const rest = restOf(GEOM, p);
        put({ ...h, at: [rest[0], rest[1], Math.max(rest[2], h.at[2])] });
        moved(held.current);
      },
      // the hand raised or lowered (Q, Z: rooms.md §3b; Tabor, 2026-10-25): never through what is under it
      raise(dz) {
        const h = held.current;
        if (!h) return;
        const rest = restOf(GEOM, h.at)[2];
        put({ ...h, at: [h.at[0], h.at[1], Math.max(rest, h.at[2] + dz)] });
        moved(held.current);
      },
      // how far the thing in the hand is above what is under it (m)
      clearance: () => (held.current ? held.current.at[2] - restOf(GEOM, held.current.at)[2] : null),
      tiltBy(d) {
        const h = held.current;
        if (!h || h.which === null) return; // (only a candle is tilted)
        put({ ...h, tilt: Math.max(0, Math.min(TILT_MAX, h.tilt + d)) });
        moved(held.current);
      },
      // the pens: where each lies (room m), null the one in a hand
      penPlaces: Object.fromEntries(R.PENS.map((id) => [id, things[id]?.at === null ? null : footNow(bodies, id)])),
      penHeld,
      // the pen in the hand is a dip pen; its nib into the jar (a dip: the next stroke's reservoir full)
      penDips: !!pens?.pen?.dip,
      dip: () => pens?.dip(),
      // the pen in the hand set down over `p` (room m): it falls onto what is under it (no p: at its own place)
      penDown(p) {
        placeThing(penHeld, p ? restOf(GEOM, p) : penRestOf(GEOM, R.PENS.indexOf(penHeld)));
      },
      penUp() {
        placeThing(penHeld, null);
      },
      // the window (its sash), its shutters and the door: open or shut (their last open or shut acts), and
      // opened or shut
      windowOpen: R.openNow(things, 'window'),
      openWindow: (open) => act({ act: open ? 'open' : 'shut', thing: 'window' }),
      opens: Object.fromEntries(R.OPENINGS.map((t) => [t, R.openNow(things, t)])),
      setOpen: (thing, open) => act({ act: open ? 'open' : 'shut', thing }),
      // let go: where the hand has it (it falls from there until it rests: law/bodies.js)
      down() {
        const h = held.current;
        if (!h) return false;
        held.current = null;
        setHolding(null);
        upright(h.at);
        placeThing(h.thing, h.at);
        return true;
      },
    };
  }, [name, me, key, room, holding, things, pens, bodies]);
  return { hand, held: () => held.current };
}
