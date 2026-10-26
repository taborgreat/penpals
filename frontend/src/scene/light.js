// The light (light-waves.md, brought into the scene by cleanup-and-speed.md §7).
// A beauty layer only: it never touches facts, digests or the record.
//
// Light is a range of waves (scene/light/): the sun is a black body through the
// air, placed by the world's clock (Pacific); it comes into the room only through
// the window, as the direct sun (a disk: the window's patch is soft-edged) and
// the sky. Two candles stand either side of the page. They burn in the law (law/
// candle.js), lit and put out by acts on the room's chain (law/wax.js regrows them:
// setCandles); drawn here as the law has them (their wax down, their flames fed and
// shivering by their wick). Where no chain says (the lobby), they burn at night while
// someone looks, and never go down. The
// room's light settles between its walls (a worker: the bounce solver over the
// room's patches); the page takes what reaches it. The eye adapts to what it
// sees and turns radiance into the screen's colours. The viewer can drag the
// sun anywhere; on release it returns to the clock. The room's air (roomAir.js,
// world.md 3b) takes the flames' heat and smoke; its soot hazes the room (light/
// smoke.js): what the room bounces dims over its mean free path, and the haze
// goes to the drawing (each pixel dimmed over its way to the eye, the grains'
// glow added). The weather (law/weather.js: setWeather) clouds the sky, dimming the sun's beam
// by the deck's depth and lighting the room from its underside (the solver's day, under it), and
// a strike's flash lights the room through the window as a bright sky does (the solver's even
// sky, scaled) for as long as it lasts.
//
// Frames: the room's (metres; x the writer's right, y toward the window, z up)
// and each view's page (page px; x right, y down the page, z up). A view's page
// lies centred where the room's page lies (light/room.js), its top at the
// paper's; the engine's world is page px with the room's axes.

import { WORLD_ZONE } from 'penpals-law/room';
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
  NEW_CANDLE,
  candleLit,
  settledOn,
  createEye,
  exposureOf,
  step,
  screenWeights,
  grownCurve,
  deckOf,
  levelLight,
  N,
} from './light/index.js';

const MATTER_GLASS = curves.MATTER.glass;

import { frame } from './camera.js';
import { createRoomAir, AIR_DX } from './roomAir.js';
import { STRIKE } from 'penpals-law/weather';
import { hazeOf } from './light/smoke.js';

export { PX_PER_M };
const DEFAULT_PAPER = [0xf7, 0xf3, 0xea]; // the page the room settles with (and the eye looks at)

// The sun by the clock: { az, el } in degrees (light/air.js sunPlace).
export const sunAt = (date) => sunPlace(date);

// The clouds, as the light takes them: to a hundredth (the room's light settles anew past each), never
// all of it (a deck that turned back every last ray would be night at noon).
export const cloudOf = (w) => Math.min(0.99, Math.round((w?.cloud ?? 0) * 100) / 100);
// A strike's light on the clouds over the room, while it lasts: the sky's radiance it adds, per bin
// (white: spread evenly over the visible bins), or null.
function flashOf(w, ms) {
  let L = 0;
  for (const s of [...(w?.strikes ?? []), ...(w?.coming ?? [])]) {
    const age = (ms - s.at) / 1000;
    if (age < 0 || age > STRIKE.lasts) continue;
    const E = (STRIKE.energy * STRIKE.light) / STRIKE.lasts / (4 * Math.PI * s.away * s.away); // W/m² here
    L += E / Math.PI;
  }
  return L > 0 ? Float64Array.from({ length: N }, (_, b) => (b < N - 1 ? L / (N - 1) : 0)) : null;
}

// The world's clock (rooms.md §1b: one world, one sun, one time zone, Pacific): the
// moment `date` as its wall clock reads it (what sunPlace reads), the instant itself
// unchanged. Never the viewer's own clock.
const worldWall = new Intl.DateTimeFormat('en-US', { timeZone: WORLD_ZONE, hour12: false, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
export function worldClock(date) {
  const parts = Object.fromEntries(worldWall.formatToParts(date).map((x) => [x.type, x.value]));
  const h = Number(parts.hour) % 24;
  return {
    getFullYear: () => Number(parts.year),
    getMonth: () => Number(parts.month) - 1,
    getDate: () => Number(parts.day),
    getHours: () => h,
    getMinutes: () => Number(parts.minute),
    getSeconds: () => Number(parts.second),
    getTime: () => date.getTime(),
  };
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
export function createLight({ settle = null, geom = GEOM, paper = DEFAULT_PAPER } = {}) {
  const S = {
    geom,
    room: null, // decoded, with its form factors: settling can begin
    parts: null, // { key, day: page N, flames: [page N], unit: [flame N at unit strength] }
    asked: null, // the key being settled
    candles: null, // the room's candles as the law has them: [{ lit, height, fed, burntS, spent }] (setCandles); null: no chain says
    candleAt: [null, null], // where a candle stands when it has been carried (rooms.md §3b): its foot, room m
    candleTilt: [0, 0], // how far a candle leans (degrees: held and tilted, or lying)
    candleWay: [
      [1, 0],
      [1, 0],
    ], // the way it leans, in the plane
    eye: null,
    t: null,
    page: paperCurve(paper),
    listeners: new Set(),
    air: null, // the room's air (roomAir.js), begun when it is first drawn
    fires: [], // what a fire gives the room now (law/fire.js; room/together.js): [{ pos, top, light (W), K, heat (W), smoke (g/s) }]
    open: false, // the window (an act: room/carry.js)
    outside: 0, // the outside air's heat, °C above the room's (the weather's: world.md Phase 4)
    weather: null, // law/weather.js weatherAt, now
    opens: { door: false, shutters: true }, // what lets the outside in (outside.md Phase 4: a shut one is a wall)
    even: null, // the room under an even sky of unit radiance (the solver's; asked once)
    seeds: {}, // whose house: its surfaces' seeds by name (room/seeds.js), as its walls are grown
    ink: { curves: {}, key: '' }, // the patches ink lies on, each its reflectance (scene/inkLight.js)
  };
  // a fire's flames shining now (law/fire.js)
  const litFires = () => S.fires.filter((f) => f.light > 0 && f.K > 0);
  // The room's light in parts (the worker's settle): the day and each flame
  // (unit strength), and what of each comes straight from the sun's disk or a
  // flame. What does not (the sky through the window, all that the room
  // bounces) is each patch's ambient light; the direct light is drawn per pixel.
  function request(key, sun) {
    if (!settle || !S.room || S.asked === key) return;
    S.asked = key;
    const candles = [0, 1].map((which) => ({ ...(S.candles?.[which] ?? NEW_CANDLE), lit: undefined, which, at: S.candleAt[which] ?? undefined }));
    const cloud = cloudOf(S.weather);
    const closed = !S.opens.door && !S.opens.shutters; // (shut up: no daylight comes in)
    const fires = litFires().map((f) => ({ pos: f.pos, K: f.K }));
    settle({
      sun: sun.el > -6 && !closed ? { az: sun.az, el: sun.el, cloud, opens: S.opens } : null,
      present: true,
      direct: true,
      even: !S.even,
      candles,
      fires,
      curves: S.ink.curves,
      seeds: S.seeds,
    }).then(
      (r) => {
        if (r.even) S.even = r.even;
        if (S.asked !== key) return; // a newer one is coming
        S.parts = { key, day: r.day, flames: r.flames, sunDirect: r.sunDirect, flameDirect: r.flameDirect, fires: fires.length };
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
    // blank paper's reflectance (N): every paper's (one kind of paper: law/paper.js)
    get paper() {
      return S.page;
    },
    get state() {
      const at = S.geom.page * N;
      return { room: !!S.room, parts: S.parts && { key: S.parts.key, day: Array.from(S.parts.day.slice(at, at + N)) }, asked: S.asked, eye: S.eye, ink: Object.keys(S.ink.curves).map(Number) };
    },
    setRoom(room) {
      S.room = room;
      S.geom = room;
    },
    // Whose house it is: its surfaces' seeds (room/seeds.js); the room's light settles anew by them.
    setSeeds(seeds) {
      const was = JSON.stringify(S.seeds);
      S.seeds = seeds ?? {};
      if (JSON.stringify(S.seeds) !== was) for (const fn of S.listeners) fn();
    },
    // Ink on its surfaces and papers lying on them (scene/inkLight.js markedCurves, papersCurves): { [patch]:
    // reflectance }; the room's light settles anew when it changes (light-waves §4: ink changes the light)
    setInk(curves) {
      const key = Object.entries(curves ?? {})
        .map(([p, R]) => `${p}:${R.map((v) => Math.round(v * 1000)).join('.')}`)
        .join('|');
      if (key === S.ink.key) return;
      S.ink = { curves: curves ?? {}, key };
      for (const fn of S.listeners) fn();
    },
    onSettled(fn) {
      S.listeners.add(fn);
      return () => S.listeners.delete(fn);
    },
    // The light at a moment. now: ms (performance clock); date: the room's
    // clock (worldClock); override: { az, el } while the sun is dragged; present:
    // someone is looking (the candles burn only then, at night); eye: where the
    // lids and colour are headed (light-waves §7: { lids 0 closed..1 open,
    // color 0 luminance only..1 }; the eye ramps there by its own reactions);
    // gaze: the patch of the room the eye is on (Look), else the page: the eye
    // takes in what is in view, so a wall looked at is lit as a wall is.
    // A candle carried (rooms.md §3b): standing at `at` (its foot, room m; null: back where it
    // was made) and leaning `tilt` degrees. Its light comes from there (the room's light settles anew).
    placeCandle(which, at, tilt = 0, way = [1, 0]) {
      S.candleAt[which] = at ? [...at] : null;
      S.candleTilt[which] = tilt;
      S.candleWay[which] = way;
      for (const fn of S.listeners) fn();
    },
    // The room's candles as the law has regrown them from its chain (room/together.js):
    // [{ lit, height (m), fed (0..1), burntS, spent }] (law/candle.js heightOf, flameOf), or null.
    setCandles(list) {
      S.candles = list;
      for (const fn of S.listeners) fn();
    },
    // The window open or shut, and the outside air's heat (°C above the room's): what the room's air
    // exchanges through it (world.md 3b)
    setWindow(open, outside = S.outside) {
      S.open = !!open;
      S.outside = outside;
    },
    get air() {
      return S.air;
    },
    // What a fire gives the room now (law/fire.js, as room/together.js has it by the clock): its flames' light (W, as
    // hot as K) from the middle of what is alight, and what rises from its top into the room's air (W of heat, g/s
    // of smoke): [{ pos, top (room m), light, K, heat, smoke }]
    setFires(list) {
      S.fires = list ?? [];
    },
    // What lets the outside in: { door, shutters } (open or shut: the room's acts)
    setOpens(o) {
      const was = JSON.stringify(S.opens);
      S.opens = { door: !!o?.door, shutters: o?.shutters !== false };
      if (JSON.stringify(S.opens) !== was) for (const fn of S.listeners) fn(); // (the room's light settles anew)
    },
    // The weather over the room now (law/weather.js weatherAt): its clouds, its strikes
    setWeather(w) {
      const was = cloudOf(S.weather);
      S.weather = w;
      if (cloudOf(w) !== was) for (const fn of S.listeners) fn(); // (the room's light settles anew)
    },
    // look: which way the eye looks ({ forward (room), fov (degrees), outdoors }): the sun's disk in view
    // dazzles it (light-waves §7)
    at({ now, date, override = null, present = true, eye = { lids: 1, color: 1 }, gaze = null, look = null }) {
      const dt = S.t === null ? 0 : Math.min(1, Math.max(0, (now - S.t) / 1000));
      S.t = now;
      const place = override ?? sunAt(date);
      const sun = { az: place.az, el: place.el, dir: toward(place.az, place.el) };
      const { through: beamThrough } = deckOf(cloudOf(S.weather));
      sun.E = sunLight(place.el).map((v, b) => (S.opens.shutters ? v * MATTER_GLASS[b] * beamThrough : 0)); // through the clouds and the glass, normal to the beam (shuttered: none)
      const level = place.el > -6 ? levelLight(sun.dir, cloudOf(S.weather)) : null;
      const skyE = level ? level.sky : new Float64Array(N); // (what lies outside takes the sky's light)
      // the candles: lit as the room's acts have them (where no chain says: at night while someone
      // is here); their flames shiver by the hour's clock
      const dark = candleLit({ sunEl: !S.opens.door && !S.opens.shutters ? -90 : place.el, present }); // (shut up: as at night)
      const clock = date.getTime() / 1000;
      const flames = [0, 1].map((which) => {
        const c = S.candles?.[which] ?? NEW_CANDLE;
        const lit = !override && (S.candles ? !!c.lit : dark);
        const st = candleState(c, clock, { which, lit });
        const foot = S.candleAt[which] ?? S.geom.candles[which];
        const tilt = S.candleTilt[which] ?? 0,
          way = S.candleWay[which] ?? [1, 0];
        const a = (tilt * Math.PI) / 180; // (leaning, its flame is where its wick is)
        return {
          ...st,
          which,
          foot,
          tilt,
          way,
          pos: [foot[0] + Math.sin(a) * st.flameAt * way[0], foot[1] + Math.sin(a) * st.flameAt * way[1], foot[2] + Math.cos(a) * st.flameAt],
          shape: c.shape ?? null, // (its rings as the law has them: the drawn candle's cup)
          I: flameLight(st),
          lit: lit && !st.spent,
        };
      });
      // the room's air: the flames' heat and smoke, the window; its soot's haze (scene only)
      S.air ??= createRoomAir(S.geom);
      S.air.to(date.getTime() / 1000, { flames, fires: S.fires, open: S.open, door: S.opens.door, outside: S.outside });
      const haze = hazeOf(S.air.soot());
      // its smoke where it is (the room's air's cells, and a fire's own under its top), as soot (kg/m³ of its grains)
      // in each of the room's air's cells: [[x, y, z, kg/m³]], asked again as the air moves
      if (!S.smokeAt || now - S.smokeAt.ms > 250) {
        const by = new Map();
        const share = S.air.sooty();
        // (µg of soot: of each smoke, its share)
        for (const [x, y, z, ug] of [
          ...S.air.cells().map((c) => [...c.slice(0, 3), (c[3] * share) / 1e6]),
          ...S.fires.flatMap((f) => (f.smokeCells ?? []).map((c) => [...c.slice(0, 3), (c[3] * (f.soot ?? 0)) / 1e6])),
        ]) {
          const k = [x, y, z].map((v) => Math.round(v * 1000)).join();
          by.set(k, [x, y, z, (by.get(k)?.[3] ?? 0) + ug]);
        }
        const V = AIR_DX ** 3;
        S.smokeAt = { ms: now, cells: [...by.values()].map(([x, y, z, ug]) => [x, y, z, (ug * 1e-9) / V]) };
      }
      const [gw, gd, gh] = S.geom.size;
      const free = (4 * gw * gd * gh) / (2 * (gw * gd + gw * gh + gd * gh)); // the room's mean free path, m
      const through = haze.ext.map((e) => Math.exp(-e * free)); // what of a bounce the smoke lets through
      // the room's light at the page, less what comes straight from the sun and the flames (drawn per pixel)
      const lit = flames.some((f) => f.lit);
      const key = [
        S.opens.door ? 1 : 0,
        S.opens.shutters ? 1 : 0,
        cloudOf(S.weather),
        Math.round(place.az * 2),
        Math.round(place.el * 2),
        ...flames.map((f) => [Math.round(f.height * 2000), ...f.pos.map((v) => Math.round(v * 200))].join(':')),
        ...litFires().map((f) => [...f.pos.map((v) => Math.round(v * 20)), Math.round(f.K / 100)].join(':')), // (a fire's flames: where, how hot)
        lit ? 1 : 0,
        S.ink.key,
        JSON.stringify(S.seeds),
      ].join();
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
        // a fire's flames, all their light at patch level (straight and bounced: not drawn per pixel)
        const fl2 = litFires().slice(0, p.fires ?? 0);
        fl2.forEach((f, j) => {
          const part = p.flames[flames.length + j];
          if (part) for (let i = 0; i < n * N; i++) ambient[i] += f.light * part[i];
        });
        for (let i = 0; i < n * N; i++) ambient[i] = ambient[i] < 0 ? 0 : ambient[i] * through[i % N];
        const at = S.geom.page * N;
        for (let b = 0; b < N; b++)
          pageLight[b] =
            (p.day[at + b] + flames.reduce((t, fl, k) => t + fl.intensity * (p.flames[k]?.[at + b] ?? 0), 0) + fl2.reduce((t, f, j) => t + f.light * (p.flames[flames.length + j]?.[at + b] ?? 0), 0)) *
            through[b];
      } else ambient.fill(0);
      // a strike's flash: the clouds lit, as bright every way as its light falls on them here
      const flash = flashOf(S.weather, date.getTime());
      if (flash && S.even) {
        const at = S.geom.page * N;
        for (let i = 0; i < n * N; i++) ambient[i] += S.even[i] * flash[i % N];
        for (let b = 0; b < N; b++) pageLight[b] += S.even[at + b] * flash[b];
      }
      const indirect = ambient.slice(S.geom.page * N, S.geom.page * N + N);
      // the eye on the page: settled on the room's light the first time it is
      // there (before that, an eye at an ordinary indoor level), then adapting
      let seen = pageLight.map((v, b) => (v * S.page[b]) / Math.PI);
      const on = gaze !== null && gaze !== 'outside' && gaze !== S.geom.page && S.parts ? S.geom.patches[gaze] : null;
      if (gaze === 'outside') {
        // looking out: the daylight itself (the sky's and the sun's on a level face), as a white face gives it
        // back: as the eye settles on the page indoors (an eye takes the light for white, not the grass)
        seen = skyE.map((v, b) => (v + (level ? level.beam[b] * Math.max(0, sun.dir[2]) : 0)) / Math.PI);
        // the sun's disk in view: its beam (through the glass, from in the house), spread over what the eye sees
        const half = look && level ? (look.fov * Math.PI) / 360 : 0;
        if (half && look.forward[0] * sun.dir[0] + look.forward[1] * sun.dir[1] + look.forward[2] * sun.dir[2] > Math.cos(half)) {
          const view = 2 * Math.PI * (1 - Math.cos(half));
          const beam = look.outdoors ? level.beam : sun.E;
          seen = seen.map((v, b) => v + beam[b] / view);
        }
      } else if (on) {
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
        haze,
        smoke: S.smokeAt.cells,
        skyE,
        sunOut: level ? level.beam : new Float64Array(N), // (the sun outside: through the clouds, no glass)
        flash, // (the sky's radiance a strike adds, per bin, or null)
        weather: S.weather,
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
  shared = createLight({ settle });
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

// The room's shape by name (engine.js asks by name): there is the one room. (Rooms are
// not joined: one-world.md replaced rooms.md §7; houses stand apart in one outside.)
export const geomOf = () => GEOM;
