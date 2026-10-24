// The light (light-waves.md, brought into the scene by cleanup-and-speed.md §7).
// A beauty layer only: it never touches facts, digests or the record.
//
// Light is a range of waves (scene/light/): the sun is a black body through the
// air, placed by the viewer's own clock; it comes into the room only through
// the window, as the direct sun (a disk: the window's patch is soft-edged) and
// the sky. Two candles stand either side of the page; at night, while someone is
// there, they burn (their wax goes down, their flames shiver by their wick). The
// room's light settles between its walls (a worker: the bounce solver over the
// room's patches); the page takes what reaches it. The eye adapts to what it
// sees and turns radiance into the screen's colours. The viewer can drag the
// sun anywhere; on release it returns to the clock.
//
// Frames: the room's (metres; x the writer's right, y toward the window, z up)
// and each view's page (page px; x right, y down the page, z up). A view's page
// lies centred where the room's page lies (light/room.js), its top at the
// paper's; the engine's world is page px with the room's axes.

import {
  sunPlace,
  toward,
  sunLight,
  roomGeometry,
  decodeRoom,
  ROOM,
  PX_PER_M,
  curves,
  paperCurve,
  candleState,
  flameLight,
  newCandle,
  burn,
  candleLit,
  settledOn,
  createEye,
  exposureOf,
  step,
  screenWeights,
  grownCurve,
  N,
} from './light/index.js';

const MATTER_GLASS = curves.MATTER.glass;

import { frame } from './camera.js';

export { PX_PER_M };
const DEFAULT_PAPER = [0xf7, 0xf3, 0xea]; // the page the room settles with (and the eye looks at)

// The sun by the clock: { az, el } in degrees (light/air.js sunPlace).
export const sunAt = (date) => sunPlace(date);

// A room's own clock (rooms.md §1b: a space keeps its own time, its owner's
// zone): the moment `date` as that zone's wall clock reads it (what sunPlace
// reads), the instant itself unchanged. No zone: the viewer's own clock.
export function zoned(date, timeZone) {
  if (!timeZone) return date;
  let parts;
  try {
    parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hour12: false, hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date).map((x) => [x.type, x.value]));
  } catch {
    return date;
  }
  const h = Number(parts.hour) % 24;
  return { getHours: () => h, getMinutes: () => Number(parts.minute), getSeconds: () => Number(parts.second), getTime: () => date.getTime() };
}

// Easing a dragged sun back to the clock's.
export function returnTo(from, to, k) {
  const s = k * k * (3 - 2 * k);
  const dAz = ((to.az - from.az + 540) % 360) - 180;
  return { az: from.az + dAz * s, el: from.el + (to.el - from.el) * s };
}

// The room's shape now (cheap, pure), and its form factors when they arrive.
export const GEOM = roomGeometry(ROOM);

// A view's page in the room: where its page px (0, 0, 0) is (room m), centred on
// the room's page, at the paper's top.
export function originOf(pageW, pageH, geom = GEOM) {
  const r = geom.pageRect;
  return [(r.x0 + r.x1) / 2 - pageW / 2 / PX_PER_M, (r.y0 + r.y1) / 2 + pageH / 2 / PX_PER_M, geom.pageOrigin[2]];
}
// The camera kept in the room (light-waves §9: the camera from cleanup §3, its
// boundary the room's): the eye no nearer a wall, the floor or the ceiling than
// MARGIN_M, and never inside the table; the point it looks at on the table.
// cam: camera.js state for a view of a pageW × pageH page. The same cam when it is in.
const MARGIN_M = 0.02;
export function withinRoom(cam, pageW, pageH, geom = GEOM) {
  const o = originOf(pageW, pageH, geom);
  const toRoom = (p) => [o[0] + p[0] / PX_PER_M, o[1] - p[1] / PX_PER_M, o[2] + (p[2] ?? 0) / PX_PER_M];
  const toPage = (r) => [(r[0] - o[0]) * PX_PER_M, (o[1] - r[1]) * PX_PER_M];
  const t = geom.table;
  const inside = (p) => {
    const r = toRoom(p);
    if (r.some((v, k) => v < MARGIN_M || v > geom.size[k] - MARGIN_M)) return false;
    return !(r[0] > t.x0 - MARGIN_M && r[0] < t.x1 + MARGIN_M && r[1] > t.y0 - MARGIN_M && r[1] < t.y1 + MARGIN_M && r[2] > t.bottom - MARGIN_M && r[2] < t.top);
  };
  // the point looked at stays over the table
  const tr = toRoom(cam.target);
  const over = tr[0] >= t.x0 && tr[0] <= t.x1 && tr[1] >= t.y0 && tr[1] <= t.y1;
  let c = over ? cam : { ...cam, target: toPage([Math.max(t.x0, Math.min(t.x1, tr[0])), Math.max(t.y0, Math.min(t.y1, tr[1]))]) };
  for (let i = 0; i < 40 && !inside(frame(c).eye); i++) c = { ...c, dist: c.dist * 0.85 };
  return c;
}

// Room m → the engine's world (page px, the room's axes), for a view whose page starts at `origin`.
export const worldOf = (p, origin) => [(p[0] - origin[0]) * PX_PER_M, (p[1] - origin[1]) * PX_PER_M, (p[2] - origin[2]) * PX_PER_M];

const KEEP = 'penpals:candles';
function loadCandles() {
  try {
    const c = JSON.parse(sessionStorage.getItem(KEEP) ?? 'null');
    if (Array.isArray(c) && c.length === 2 && c.every((x) => Number.isFinite(x?.litMs) && Number.isInteger(x?.generation))) return c;
  } catch {
    /* none kept */
  }
  return [newCandle(), newCandle()];
}
function keepCandles(c) {
  try {
    sessionStorage.setItem(KEEP, JSON.stringify(c));
  } catch {
    /* memory only */
  }
}

const INDOORS = createEye(); // the eye before the room's light has settled

// A radiance spectrum through the eye's weights: linear r, g, b toned (the shader's eyeTone).
const KNEE = 0.9;
const toneOf = (x) => (x <= KNEE ? Math.max(0, x) : KNEE + (1 - KNEE) * Math.tanh((x - KNEE) / (1 - KNEE)));
export function seenRgb(W, radiance) {
  return [0, 1, 2].map((c) => {
    let v = 0;
    for (let b = 0; b < N; b++) v += W[c * N + b] * radiance[b];
    return toneOf(v);
  });
}

// The light of one room (one being, one eye, two candles). `settle(msg)` →
// Promise<{ day, flames, scales }>: the room's light in parts (light/lightWorker.js),
// given the decoded room first with `setRoom`.
export function createLight({ settle = null, geom = GEOM, paper = DEFAULT_PAPER, candles = null, keep = () => {} } = {}) {
  const S = {
    geom,
    room: null, // decoded, with its form factors: settling can begin
    parts: null, // { key, day: page N, flames: [page N], unit: [flame N at unit strength] }
    asked: null, // the key being settled
    candles: candles ?? [newCandle(), newCandle()],
    eye: null,
    t: null,
    page: paperCurve(paper),
    listeners: new Set(),
  };
  // The room's light in parts (the worker's settle): the day and each flame
  // (unit strength), and what of each comes straight from the sun's disk or a
  // flame. What does not (the sky through the window, all that the room
  // bounces) is each patch's ambient light; the direct light is drawn per pixel.
  function request(key, sun) {
    if (!settle || !S.room || S.asked === key) return;
    S.asked = key;
    settle({ sun: sun.el > -6 ? { az: sun.az, el: sun.el } : null, present: true, direct: true, candles: S.candles.map((c, which) => ({ ...c, which })) }).then(
      (r) => {
        if (S.asked !== key) return; // a newer one is coming
        S.parts = { key, day: r.day, flames: r.flames, sunDirect: r.sunDirect, flameDirect: r.flameDirect };
        for (const fn of S.listeners) fn();
      },
      (err) => {
        console.warn('[room light]', err.message);
        if (S.asked === key) S.asked = null;
      },
    );
  }

  return {
    get geom() {
      return S.geom;
    },
    get state() {
      const at = S.geom.page * N;
      return { room: !!S.room, parts: S.parts && { key: S.parts.key, day: Array.from(S.parts.day.slice(at, at + N)) }, asked: S.asked, eye: S.eye };
    },
    setRoom(room) {
      S.room = room;
      S.geom = room;
    },
    onSettled(fn) {
      S.listeners.add(fn);
      return () => S.listeners.delete(fn);
    },
    // The light at a moment. now: ms (performance clock); date: the room's
    // clock (zoned); override: { az, el } while the sun is dragged; present:
    // someone is looking (the candles burn only then, at night); eye: where the
    // lids and colour are headed (light-waves §7: { lids 0 closed..1 open,
    // color 0 luminance only..1 }; the eye ramps there by its own reactions);
    // gaze: the patch of the room the eye is on (Look), else the page: the eye
    // takes in what is in view, so a wall looked at is lit as a wall is.
    at({ now, date, override = null, present = true, eye = { lids: 1, color: 1 }, gaze = null }) {
      const dt = S.t === null ? 0 : Math.min(1, Math.max(0, (now - S.t) / 1000));
      S.t = now;
      const place = override ?? sunAt(date);
      const sun = { az: place.az, el: place.el, dir: toward(place.az, place.el) };
      sun.E = sunLight(place.el).map((v, b) => v * MATTER_GLASS[b]); // through the glass, normal to the beam
      // the candles: burning only at night while someone is here; their flames shiver by the hour's clock
      const lit = !override && candleLit({ sunEl: place.el, present });
      if (lit && dt > 0) {
        S.candles = S.candles.map((c, which) => burn(c, dt * 1000, true, { which }));
        keep(S.candles);
      }
      const clock = date.getTime() / 1000;
      const flames = S.candles.map((c, which) => {
        const st = candleState(c.litMs, clock, { which, generation: c.generation, lit });
        const foot = S.geom.candles[which];
        return { ...st, which, foot, pos: [foot[0], foot[1], foot[2] + st.flameAt], I: flameLight(st), lit: lit && !st.spent };
      });
      // the room's light at the page, less what comes straight from the sun and the flames (drawn per pixel)
      const key = [Math.round(place.az * 2), Math.round(place.el * 2), ...flames.map((f) => Math.round(f.height * 2000)), lit ? 1 : 0].join();
      if (!S.parts || S.parts.key !== key) request(key, sun);
      // each patch's ambient light now (its flames at their strength now), and all that reaches the page
      const n = S.geom.patches.length;
      const ambient = S.ambient?.length === n * N ? S.ambient : (S.ambient = new Float64Array(n * N));
      const pageLight = new Float64Array(N);
      if (S.parts) {
        const p = S.parts;
        for (let i = 0; i < n * N; i++) ambient[i] = p.day[i] - p.sunDirect[i];
        flames.forEach((fl, k) => {
          const part = p.flames[k],
            direct = p.flameDirect[k];
          if (!part || !fl.intensity) return;
          for (let i = 0; i < n * N; i++) ambient[i] += fl.intensity * (part[i] - direct[i]);
        });
        for (let i = 0; i < n * N; i++) if (ambient[i] < 0) ambient[i] = 0;
        const at = S.geom.page * N;
        for (let b = 0; b < N; b++) pageLight[b] = p.day[at + b] + flames.reduce((t, fl, k) => t + fl.intensity * (p.flames[k]?.[at + b] ?? 0), 0);
      } else ambient.fill(0);
      const indirect = ambient.slice(S.geom.page * N, S.geom.page * N + N);
      // the eye on the page: settled on the room's light the first time it is
      // there (before that, an eye at an ordinary indoor level), then adapting
      let seen = pageLight.map((v, b) => (v * S.page[b]) / Math.PI);
      const on = gaze !== null && gaze !== S.geom.page && S.parts ? S.geom.patches[gaze] : null;
      if (on) {
        // a surface of the room: all the light it takes, what its matter gives back
        const at = gaze * N;
        const R = grownCurve(on.matter, on.matter === 'plaster' ? 72 : 150);
        seen = R.map((r, b) => (r * (S.parts.day[at + b] + flames.reduce((t, fl, k) => t + fl.intensity * (S.parts.flames[k]?.[at + b] ?? 0), 0))) / Math.PI);
      }
      const aim = { lids: eye.lids ?? 1, color: eye.color ?? 1 };
      if (S.parts) S.eye = S.eye ? step(S.eye, seen, dt, aim) : settledOn(seen, aim);
      const W = S.eye ? screenWeights(S.eye) : screenWeights(INDOORS, aim);
      // each flame as the eye sees it (its radiance over its own outline), for the flame drawn
      for (const f of flames) {
        const area = f.flameSize * f.flameSize * 0.42 * (Math.PI / 4);
        f.seen =
          f.lit && area > 0
            ? seenRgb(
                W,
                f.I.map((v) => v / area),
              )
            : [0, 0, 0];
      }
      const blinking = !!S.eye && (Math.abs(S.eye.lids - aim.lids) > 1e-3 || Math.abs(S.eye.color - aim.color) > 1e-3);
      const adapting = blinking || (!!S.eye && dt > 0 && !!S.last && Math.abs(Math.log(exposureOf(S.eye) / exposureOf(S.last))) > 2e-3);
      S.last = S.eye;
      return {
        geom: S.geom,
        sun,
        flames,
        indirect,
        ambient, // per patch (n × N): the room drawn takes it
        W,
        night: lit ? 1 : 0,
        settling: !S.parts || S.parts.key !== key || adapting,
        key: [Math.round(sun.dir[0] * 400), Math.round(sun.dir[1] * 400), Math.round(sun.dir[2] * 400), ...flames.map((f) => Math.round(f.pos[2] * 4000))].join(),
      };
    },
  };
}

// The page's one light: the room fetched once, settled in a worker.
let shared = null;
export function theLight() {
  if (shared) return shared;
  const worker = new Worker(new URL('./light/lightWorker.js', import.meta.url), { type: 'module' });
  const waiting = new Map();
  let next = 1;
  worker.onerror = (e) => console.warn('[light worker]', e.message ?? 'did not start');
  worker.onmessage = ({ data }) => {
    if (data.type === 'room') return;
    const p = waiting.get(data.id);
    waiting.delete(data.id);
    if (!p) return;
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data);
  };
  const settle = (msg) =>
    new Promise((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ type: 'settle', id, ...msg });
    });
  shared = createLight({ settle, candles: loadCandles(), keep: keepCandles });
  globalThis.__sceneLight = shared; // (for the benches and checks: what the room's light is now)
  Promise.all([fetch('/room/room.json').then((r) => r.text()), fetch('/room/room.ff').then((r) => r.arrayBuffer())])
    .then(([json, bin]) => {
      const room = decodeRoom(json, bin);
      worker.postMessage({ type: 'room', json, bin }, []);
      shared.setRoom(room);
    })
    .catch((err) => console.warn('[room]', err.message));
  return shared;
}
