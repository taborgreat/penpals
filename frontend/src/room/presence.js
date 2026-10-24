// Being in a room together (rooms.md §4, §6): the room's stream (backend
// routes/rooms.js) while you look at it. Who else is here and how they move
// (each glides between their coarse acts), the shared sheets lying on its
// owner's table and each act as the stamper places it; and your own coarse
// motion acts, sent as your head moves (law/being.js: past a step or an angle,
// at most five a second; the eye's own state never). Writing happens from the seat:
// seated, your being sits at a seat at the table (the room's owner in the middle,
// visitors either side), its head turned to what you look at; flying, the head is
// where your eye is.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { being as B } from 'penpals-law';
import { api } from '../api.js';
import { GEOM } from '../scene/light.js';
import { roomCamera } from '../scene/light/index.js';

export const GLIDE_MS = 220; // others glide between their acts this long
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

// Where a being is now, between its last two acts (and whether it is still on its way).
export function poseNow(b, now) {
  if (!b.to) return { pose: null, moving: false };
  const k = (now - b.t0) / GLIDE_MS;
  return { pose: k >= 1 || !b.from ? b.to : B.glide(b.from, b.to, k), moving: k < 1 };
}

export function useRoom(name, { seat = 0 } = {}) {
  const [beings, setBeings] = useState(() => new Map()); // name → { name, from, to, t0 }
  const [sheets, setSheets] = useState(() => new Map()); // sheet → view (routes/rooms.js viewOf), lines as stamped
  const [body, setBody] = useState(false);
  const sent = useRef({ pose: null, at: 0 });
  const bodyAt = useRef(null); // your body's heading: dragged by the head past the neck's reach
  const trailing = useRef(0); // the last pose, held back by the rate: sent when it allows
  useEffect(() => () => clearTimeout(trailing.current), [name]);
  useEffect(() => {
    if (!name || typeof EventSource === 'undefined') return undefined;
    const es = new EventSource(`/api/rooms/${encodeURIComponent(name)}/stream`);
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
    on('here', (d) => {
      setBody(!!d.body);
      setBeings(new Map(d.beings.map((b) => [b.name, { name: b.name, from: b.pose, to: b.pose, t0: performance.now() }])));
    });
    on('being', (d) => {
      if (d.kind === 'leave')
        setBeings((m) => {
          const next = new Map(m);
          next.delete(d.name);
          return next;
        });
      else put(d.name, d.pose ?? null);
    });
    on('table', (d) =>
      setSheets((m) => {
        const next = d.sheets ? new Map() : new Map(m);
        for (const s of d.sheets ?? []) next.set(s.sheet, s);
        if (d.arrived) next.set(d.arrived.sheet, d.arrived);
        if (d.left) next.delete(d.left);
        return next;
      }),
    );
    on('shared', (d) =>
      setSheets((m) => {
        const s = m.get(d.sheet);
        if (!s || s.lines.some((l) => l.n === d.line.n)) return m;
        return new Map(m).set(d.sheet, { ...s, lines: [...s.lines, d.line].sort((a, b) => a.n - b.n) });
      }),
    );
    return () => es.close();
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
  const sheetList = useMemo(() => [...sheets.values()], [sheets]);
  return { beings: beingList, sheets: sheetList, report, body };
}
