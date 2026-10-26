// Being in a room together (rooms.md §4, §6): the room's stream (backend
// routes/rooms.js) while you look at it. Who else is here and how they move
// (each glides between their coarse acts), the papers lying in it and each act
// on them as the stamper places it; and your own coarse
// motion acts, sent as your head moves (law/being.js: past a step or an angle,
// at most five a second; the eye's own state never). Writing happens from the seat:
// seated, your being sits at a seat at the table (the room's owner in the middle,
// visitors either side), its head turned to what you look at; flying, the head is
// where your eye is.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { being as B, room as R } from 'penpals-law';
import { api } from '../api.js';
import { GEOM } from '../scene/light.js';
import { roomCamera } from '../scene/light/index.js';

export const GLIDE_MS = 220; // others glide between their acts this long

// Where the room's things are (rooms.md §3b, §3c: the candles, the pen), as its stream
// tells it: { [thing]: { at: [x, y, z] | null (held), by } }, by room. useThings(name)
// follows it; roomAct picks one up or sets it down.
const things = new Map(); // room name → { now, listeners }
const thingsIn = (name) => {
  let t = things.get(name);
  if (!t) things.set(name, (t = { now: {}, listeners: new Set() }));
  return t;
};
function setThings(name, f) {
  const t = thingsIn(name);
  t.now = f(t.now);
  for (const fn of t.listeners) fn(t.now);
}
export function useThings(name) {
  const [now, setNow] = useState(() => thingsIn(name).now);
  useEffect(() => {
    const t = thingsIn(name);
    setNow(t.now);
    t.listeners.add(setNow);
    return () => t.listeners.delete(setNow);
  }, [name]);
  return now;
}
// The room's lines its drips are regrown from (law/wax.js: the signed acts on its things,
// who came and went, where papers came to rest in it), by room, as its stream tells them.
// useRoomLines(name) follows them.
const roomLines = new Map(); // room name → { now, listeners }
const linesIn = (name) => {
  let t = roomLines.get(name);
  if (!t) roomLines.set(name, (t = { now: [], listeners: new Set() }));
  return t;
};
function setLines(name, f) {
  const t = linesIn(name);
  t.now = f(t.now);
  for (const fn of t.listeners) fn(t.now);
}
export function useRoomLines(name) {
  const [now, setNow] = useState(() => linesIn(name).now);
  useEffect(() => {
    const t = linesIn(name);
    setNow(t.now);
    t.listeners.add(setNow);
    return () => t.listeners.delete(setNow);
  }, [name]);
  return now;
}

// What you do to the room's things (rooms.md §3b, §3c; matter-fixes §2): light a candle or
// put it out, pick a thing up or set it down ({ act: 'place', thing, to: room m | null }),
// tilt the candle in your hand ({ act: 'tilt', thing, pos, deg }): an act sealed by your key
// (law/room.js), counted on from your last in the room's lines, sent one after another.
// key: yours (keys/session.js); room: its owner's key. keepalive: as the page goes (not queued).
const sending = new Map(); // room name → { k: the last count sent, queue }
export function roomAct(name, key, room, act, { keepalive = false, k = null } = {}) {
  const s = sending.get(name) ?? { k: 0, queue: Promise.resolve() };
  sending.set(name, s);
  for (const l of linesIn(name).now) if (l.act?.by === key.publicKey) s.k = Math.max(s.k, l.act.k);
  s.k = Math.max(s.k + 1, k ?? 0);
  const made = R.makeRoomAct({ sk: key.sk, pk: key.pk, room, k: s.k, ...act });
  const url = `/api/rooms/${encodeURIComponent(name)}/act`;
  if (keepalive) return fetch(url, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(made) }).catch(() => {});
  s.queue = s.queue.then(() => api.post(url, made).catch(() => {}));
  return s.queue;
}

const SEAT_X = [0, -0.45, 0.45, -0.9, 0.9]; // m from the middle seat (the owner's), along the table

// The i-th seat's eye (room m): 0 the owner's, in front of the page; then either side, then a row behind.
export function seatAt(i, geom = GEOM) {
  const s = roomCamera.seat(geom).pos;
  return [s[0] + SEAT_X[i % SEAT_X.length], s[1] - 0.5 * Math.floor(i / SEAT_X.length), s[2]];
}
// A visitor's seat, by their name (one of the four beside the owner's).
export const seatOf = (name) => 1 + ([...String(name ?? '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 4);
// Your head seated at seat `i`, turned to the point `at` (room m).
export function seatedHead(i, at, geom = GEOM) {
  const pos = seatAt(i, geom);
  const d = at.map((v, k) => v - pos[k]);
  const len = Math.hypot(...d) || 1;
  return { pos, yaw: (Math.atan2(d[0], d[1]) * 180) / Math.PI, pitch: (Math.asin(d[2] / len) * 180) / Math.PI, size: 1, flying: false };
}

// The one world (one-world.md; backend routes/world.js /beings): every being where it is (world m) and the
// house it came by, gliding between its coarse acts as in a room, and every house's door and windows, open
// or shut. → { beings: [{ name, house, from, to, t0 }] (world m), opens: { [house key]: { door, window,
// shutters } } }. One stream, however many houses ask.
const theWorld = { beings: new Map(), opens: {}, listeners: new Set(), es: null };
function tellTheWorld() {
  const now = { beings: [...theWorld.beings.values()], opens: theWorld.opens };
  for (const fn of theWorld.listeners) fn(now);
}
function openWorld() {
  if (theWorld.es || typeof EventSource === 'undefined') return;
  const es = new EventSource('/api/world/beings');
  theWorld.es = es;
  const on = (ev, fn) => es.addEventListener(ev, (m) => fn(JSON.parse(m.data)));
  on('beings', (d) => {
    theWorld.beings = new Map(d.beings.map((b) => [b.name, { name: b.name, house: b.house, from: b.pose, to: b.pose, t0: performance.now() }]));
    theWorld.opens = d.opens ?? {};
    tellTheWorld();
  });
  on('being', (d) => {
    if (d.kind === 'leave') theWorld.beings.delete(d.name);
    else {
      const was = theWorld.beings.get(d.name);
      const now = performance.now();
      const pose = d.pose ?? was?.to ?? null;
      const at = was?.to && pose ? B.glide(was.from ?? was.to, was.to, (now - was.t0) / GLIDE_MS) : pose;
      theWorld.beings.set(d.name, { name: d.name, house: d.house, from: at ?? pose, to: pose, t0: now });
    }
    tellTheWorld();
  });
  on('opens', (d) => {
    theWorld.opens = { ...theWorld.opens, [d.house]: d.opens };
    tellTheWorld();
  });
}
export function useWorld() {
  const [now, setNow] = useState(() => ({ beings: [...theWorld.beings.values()], opens: theWorld.opens }));
  useEffect(() => {
    theWorld.listeners.add(setNow);
    if (document.readyState === 'complete') openWorld();
    else window.addEventListener('load', openWorld, { once: true });
    return () => {
      theWorld.listeners.delete(setNow);
      if (!theWorld.listeners.size) {
        theWorld.es?.close();
        theWorld.es = null;
      }
    };
  }, []);
  return now;
}

// Where a being is now, between its last two acts (and whether it is still on its way).
export function poseNow(b, now) {
  if (!b.to) return { pose: null, moving: false };
  const k = (now - b.t0) / GLIDE_MS;
  return { pose: k >= 1 || !b.from ? b.to : B.glide(b.from, b.to, k), moving: k < 1 };
}

// space: the house's key (its owner's): the papers lying in it.
export function useRoom(name, { seat = 0, space = null } = {}) {
  const [beings, setBeings] = useState(() => new Map()); // name → { name, from, to, t0 }
  const [papers, setPapers] = useState(() => new Map()); // paper → view (store/papers.js viewOf), lines as stamped
  const [body, setBody] = useState(false);
  const sent = useRef({ pose: null, at: 0 });
  const bodyAt = useRef(null); // your body's heading: dragged by the head past the neck's reach
  const trailing = useRef(0); // the last pose, held back by the rate: sent when it allows
  const spaceRef = useRef(space);
  spaceRef.current = space;
  useEffect(() => () => clearTimeout(trailing.current), [name]);
  useEffect(() => {
    if (!name || typeof EventSource === 'undefined') return undefined;
    // the stream opens once the page has loaded: a stream open before then keeps the page loading
    let es = null;
    let closed = false;
    const open = () => {
      if (closed) return;
      es = new EventSource(`/api/rooms/${encodeURIComponent(name)}/stream`);
      listen();
    };
    const on = (ev, fn) => es.addEventListener(ev, (m) => fn(JSON.parse(m.data)));
    const put = (who, pose) =>
      setBeings((m) => {
        const next = new Map(m);
        const was = m.get(who);
        const now = performance.now();
        const at = was?.to ? B.glide(was.from ?? was.to, was.to, (now - was.t0) / GLIDE_MS) : pose;
        next.set(who, { name: who, from: at ?? pose, to: pose, t0: now });
        return next;
      });
    const listen = () => {
      on('here', (d) => {
        setBody(!!d.body);
        setThings(name, () => d.things ?? {});
        setLines(name, () => d.lines ?? []);
        setBeings(new Map(d.beings.map((b) => [b.name, { name: b.name, from: b.pose, to: b.pose, t0: performance.now() }])));
      });
      on('thing', ({ thing, ...now }) => setThings(name, (t) => ({ ...t, [thing]: now }))); // (all the room says of it: where, whose, its settings, open or shut)
      on('room', (l) => setLines(name, (ls) => (ls.some((x) => x.n === l.n) ? ls : [...ls, l].sort((a, b) => a.n - b.n))));
      on('being', (d) => {
        if (d.kind === 'leave')
          setBeings((m) => {
            const next = new Map(m);
            next.delete(d.name);
            return next;
          });
        else put(d.name, d.pose ?? null);
      });
      // the papers lying here: as they are, then each as an act lands on it or it comes or goes
      on('papers', (d) => setPapers(new Map(d.papers.map((v) => [v.paper, v]))));
      on('paper', ({ paper: v }) =>
        setPapers((m) => {
          const was = m.get(v.paper);
          if (was && was.lines.length > v.lines.length) return m; // (an older word of it, arriving late)
          const next = new Map(m);
          if (v.where.space && v.where.space === spaceRef.current) next.set(v.paper, v);
          else next.delete(v.paper);
          return next;
        }),
      );
    };
    if (document.readyState === 'complete') open();
    else window.addEventListener('load', open, { once: true });
    return () => {
      closed = true;
      window.removeEventListener('load', open);
      es?.close();
    };
  }, [name]);
  // your head moved ({ pos, yaw, pitch, size, flying }, or seated: { at: the point looked at }):
  // a motion act when it has moved enough (and you are a being here); flying, the body
  // follows the head's heading
  const report = useCallback(
    (eye) => {
      if (!name || !body || !eye) return;
      const head = eye.at ? seatedHead(seat, eye.at) : eye;
      bodyAt.current = head.flying ? head.yaw : B.neck(bodyAt.current ?? head.yaw, head.yaw, head.pitch).body;
      const pose = { pos: head.pos, yaw: B.wrap(head.yaw), pitch: head.pitch, size: head.size ?? 1, body: bodyAt.current };
      if (!B.checkPose(pose)) return;
      const send = () => {
        sent.current = { pose, at: performance.now() };
        api.post(`/api/rooms/${encodeURIComponent(name)}/motion`, { pose: B.quantize(pose) }).catch(() => {});
      };
      const now = performance.now();
      const last = sent.current;
      clearTimeout(trailing.current);
      if (B.isAct(last.pose, last.at, pose, now)) send();
      // moved enough, but sooner than the rate allows: if the head comes to rest here, this
      // pose still goes (a moment after the rate allows: the stamper's clock is not ours)
      else if (B.isAct(last.pose, -Infinity, pose, now)) trailing.current = setTimeout(send, Math.max(0, last.at + 1000 / B.MAX_RATE - now) + 40);
    },
    [name, body, seat],
  );
  const beingList = useMemo(() => [...beings.values()], [beings]);
  const paperList = useMemo(() => [...papers.values()], [papers]);
  return { beings: beingList, papers: paperList, report, body };
}
