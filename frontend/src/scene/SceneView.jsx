import { forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createView, engineReady, DROP_PX } from './engine.js';
import { groundOf } from './ground.js';
import { camera2d, camera3d, pageAt, canWrite, orbit, zoomBy, panBy, flyTo, fly, lerpCam, chaseFollow, frame, rayThrough, MIN_WRITE_EL } from './camera.js';
import { theLight, originOf, withinRoom, returnTo, sunAt, worldClock, GEOM } from './light.js';
import { roomCamera, pageToRoom, roomToPage, PX_PER_M } from './light/index.js';
import { patchCurve } from './light/settle.js';
import { markedCurves, papersCurves } from './inkLight.js';
import { surfaceFrame, fromRoom, toRoom, onSurface, surfaceOfHit, setPenPlace, SURFACE_IDS } from './surfaces.js';
import { RoomContext } from '../room/RoomContext.js';
import { poseNow } from '../room/presence.js';
import { lawPen, lineWidthPx } from '../ink/pens.js';
import { PEN_SIZES } from '../ink/nibs.js';
import { shelfLayout, rayBox } from './shelf.js';
import { penRestOf, JAR, HAND } from './light/room.js';
import { hear, earAt, roomIs, spaceIs, weatherIs, startSound, now as soundNow } from '../sound/index.js';
import { weatherAt } from 'penpals-law/weather';
import { thunder } from '../sound/weather.js';
import { createPane } from './glass.js';
import { ask, asWeather } from './askWeather.js';
import { outsideNear, groundOf as outsideGround, inBox, frameOf, seenFrom } from './outside.js';
import { world as WORLD } from 'penpals-law';
import { reachOutside, ARM } from './reach.js';
import { worldHit } from './worldRay.js';
import { AIR, BEINGS, MATTER } from 'penpals-law/matter';
import { dayOf, sunAt as sunToward } from 'penpals-law/sun';
import * as LIFE from 'penpals-law/life';
import { armSpeed } from 'penpals-law/making';
import { chirps, songs, singing, wingbeats } from '../sound/life.js';
import { BAR } from '../sound/music.js';
import { penHand, recordSounds, dipTap } from '../sound/pen.js';
import { acoustics } from '../sound/room.js';
import { crackles } from '../sound/candle.js';
import { isPhone } from './support.js';
import { rainNear } from './rain.js';
import * as WK from './keys.js';

// The scene (the scene spec): the page as a lit 3D scene, seen straight down
// (2D) or from anywhere (3D), one renderer for both. Facts decide; the scene
// only shows.
//
//   page        [w, h] page px (the camera's home, the candles' places)
//   mode        '3d': the scene is always seen in 3D (no toggle; '2d', straight down, is kept for the lab only)
//   sheets      [{ id, box: [x0, y0, w, h] (cells), origin: [px, py], cellPx, lift? (page px above the
//                  page's plane: a paper on the floor lies below it), held? (in your hand: it follows the
//                  pointer), field?, look?: { rgba, box }, live?, detail?: { data, box }, bands?: { data, box } }]
//   frame2d     () => [x0, y0, x1, y1]: the part of the page the 2D view shows (default: all of it)
//   writer      { down(p, ev, type), move(p, ev), up(p, ev), cancel(), penDown?(cam) }: writing in 3D
//   follow      { base: [x, y], offset: [dx, dy] }: the chase, in 3D
//   cutSide     (a, b) => Promise<{ width, height, rgba }>: the cross-section picture for the cut plane
//   moments     () => Promise<{ box, at } | [{ id, box, at }]>: show the moments (own and open sheets)
//   momentsKey  changes when the writing does: shown moments are banded again
//   ground      the sheets lie on a page (the lobby's slip, a pad's), not on the table
//   onFlat      the viewer chose the flat look
//   toolsHost   an element to put the tools in (a pad's own bar, off the page), else over the view
//   seeds       whose room this is: { [surface name]: [s0, s1] } (rooms.md §1, room/seeds.js), else the shared room
//   marks       ink on the room's surfaces (rooms.md §2): [{ id, surface, origin: [x, y], cellUnits,
//                  box: [x0, y0, w, h] (cells), abs?: the box's ink by its absorbances, live?: { tiles(), onTiles(fn) },
//                  ink?: { origin, box, abs } (a live one's ink as stamped: what the room's light takes) }]
//   wallWriter  { down(surface, p, ev, type), move(p, ev), up(p, ev), cancel() }: writing on a surface
//               from Look (the pen pointed at it: rooms.md §2), p in that surface's page units
//   eye         where the eye's lids and colour are headed ({ lids, color }, light-waves §7)
//   fixed       the eye cannot look around (the lobby, rooms.md §1a)
//   shelf       { books: [{ id, color: [r, g, b] }], onOpen(id) }: the owner's books on the shelf (rooms.md §3);
//               a click on one pulls it down
//   beings      [{ name, from, to, t0 }]: the others in the room (rooms.md §4, room/presence.js),
//               each drawn gliding between its last two motion acts
//   onPose      ({ pos, yaw, pitch, size, flying }) => …: where your head is (room m, degrees), as it
//               moves; seated (the writing view), ({ at }): the point on the table you look at
//   tableWriter { sheets: [{ sheet, origin: [x, y], size: [w, h] }] (page px), down(sheet, p, ev, type),
//               move(p, ev), up(p, ev), cancel() }: writing on the papers on the table (rooms.md §6),
//               p in that paper's own units
//   papers      the hand on papers (room/together.js; law/paper.js): { lying: [{ paper, sheet, origin, size,
//               lift }] (page px), held: { paper, sheet, size } | null, take(paper), put(at) (room m),
//               post(key), takeLetter(), letters(keys), touch(paper, q) }: E takes up the paper under the
//               pointer and lets the one in the hand go where it points; at a mailbox E posts it (or, empty
//               handed at your own, takes the oldest letter out); a bare hand on a seal of yours cracks it
//   space       whose space this is (its owner's key): the music of its matter is in its key (world.md 3c)
//   outside     { plot, houses } (law/world.js): where this house stands among the others, so the outside
//               (outside.md Phase 4) is grown around it when its door or shutters let it in
//   hands       { facts, act(a), me } (room/hands.js): what hands have done out there, and yours: E takes
//               up a stone or a stick, pulls at a branch (law/hands.js: it breaks or it holds), sets down
//               what is in the hand; with a stone in it, rubbing along a stick or a trunk carves it
//   heard       { on(fn) }: others' strokes as they come, fn({ origin (the sheet's, page px), rec, seed }):
//               each heard from where it was written (world.md Phase 2). Writers' nib?() (the pen, the
//               matter it is on, its ink's reservoir and drops thrown) is how your own pen is heard
//   hand        { holding, pickables: [{ id, at: [x, y, z] (its foot, room m), r, h }], pick(id),
//               hover(at), down(at), tiltBy(degrees) }: a thing in the hand (rooms.md §3b): a click on
//               a pickable picks it up; held, it follows the pointer over the table (at: the point
//               there, room m), E held makes the mouse tilt it, a click sets it down
//   world       the being in the world (one-world.md, outside.md Part 3, scene/keys.js): seated at
//               the table, W A S D stand up and walk, Space jumps (twice: flies), Shift crouches or
//               lowers, a drag turns the head, the scroll is the eye's zoom, E picks up, sets down,
//               opens and shuts the window and sits at the chair (held, it tilts what is in the
//               hand); no tools over the view
// ref: { camera(), setCamera(cam), invalidate(), look(on) }
const BAND_MS = 40;
const LIVE_MS = 16; // a sheet being written is drawn again at most this often (about every frame)
const STILL_MS = 200; // after this long without the camera moving, frames are full resolution again
const MOVING = 0.75; // the resolution while the camera moves, and for frames drawn only for the candles' flicker
const CAP_DESKTOP = 1.5; // device pixels per CSS pixel, at most (phones: 1)
// How much taller than true the relief is drawn (scene only): 1× to 200×, about
// 20× by default (cleanup-and-speed.md §3); the slider runs on a log scale.
const RELIEF = 20;
const RELIEF_KEY = 'penpals:relief';
const reliefFrom = (pos) => Math.max(1, Math.round(200 ** (pos / 100)));
const posFrom = (x) => Math.round((100 * Math.log(Math.max(1, x))) / Math.log(200));
function storedRelief() {
  try {
    const v = Number(localStorage.getItem(RELIEF_KEY));
    return v >= 1 && v <= 200 ? v : RELIEF;
  } catch {
    return RELIEF;
  }
}
const SETTLE_MS = 40; // while the eye adapts (it is slow: seconds), drawn this often
const FOV = 40;
// Look: the head turned in the room (light-waves §9): drag to turn, W A S D Q E to fly;
// F walks instead (gravity holds the being to what is under it), [ and ] make it smaller
// and larger, down to a bead of ink (rooms.md §4), where the page's own heights are its ground.
const TURN = 0.25; // degrees a CSS px
const FLY_KEYS = { w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', q: 'up', e: 'down' };
const toRoomDir = (d) => [d[0], -d[1], d[2]]; // page frame ↔ the room's (y flips)
const INSIDE_M = 0.3; // another's head nearer your eye than this (at their size): you are in it, and do not see it
const SIZE_MIN = 1e-4; // a being as small as a bead of ink
// The pen in the hand (rooms.md §3c): a writer that says nothing of its nib writes with a medium pen.
const PLAIN_PEN = lawPen({ nib: 'pen', size: PEN_SIZES.medium }, '#000000');
const LIFT_M = 0.002; // the nib above the paper between strokes
const HAND_PX = 0.005 * PX_PER_M; // a sheet in the hand, just above the page it was taken from (page px): it moves over it
// Where the plain pen lies when set down and nothing says where: its place on the table (light/room.js).
const penRest = () => penRestOf(GEOM, 0);
const FLICKER_MS = 80; // candlelight alone is drawn again this often: enough to shiver, and cheap
// The wind as the rain is carried by it: the weather says how hard (law/weather.js), and it blows onto the
// window, as the glass takes it (scene/glass.js): from beyond the far wall, toward the room.
const windOf = (w) => [0, -(w?.wind ?? 0)];

const TRAIL_MS = 150; // the moment the hand's speed is taken over (scene: how fast the pointer moved)
// the angle between two directions (unit vectors), radians
const angleOf = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

const SceneView = forwardRef(function SceneView(
  {
    page,
    mode,
    sheets,
    frame2d,
    writer,
    follow,
    cutSide,
    moments,
    momentsKey,
    ground = false,
    onFlat,
    paper = null,
    tools = true,
    toolsHost = null,
    className = '',
    style,
    seeds: seedsProp = null,
    marks = null,
    flames = null, // a fire's cells alight now (law/fire.js; room m): [[x, y, z]]
    onSeen = null, // (ids) the papers and written surfaces the eye has in view (rooms.md §8: only they grow)
    wallWriter = null,
    eye: eyeProp = null,
    fixed: fixedProp = false,
    shelf = null,
    beings = null,
    onPose = null,
    tableWriter = null,
    heard = null,
    papers = null,
    opens: houseOpens = null, // the others' houses' doors and windows, open or shut ({ [key]: { door, window, shutters } })
    onEnter = null, // (house { key, name }, pose (in its room, m)): walked in through another's door
    onHouseDoor = null, // (house { key, name, open }): the hand on another's door, out in the world
    arrive = null, // a pose to stand at as the view opens (come in through this house's door: walking)
    space = null,
    outside = null,
    hands = null,
    hand: carrying = null, // (the thing in the hand; not the hand/pen switch below)
    world = false,
  },
  ref,
) {
  // the room these views are in (room/RoomContext.js): its seeds, the eye's way, fixed or not
  const inRoom = useContext(RoomContext);
  const seeds = seedsProp ?? inRoom?.seeds ?? null;
  const eye = eyeProp ?? inRoom?.eye ?? null;
  const fixed = fixedProp || !!inRoom?.fixed;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const st = useRef(null);
  const [tool, setTool] = useState(null); // 'light' | 'cut' | null
  // the hand (drag turns, right-drag or shift slides) or the pen (drag writes, right-drag turns):
  // the pen where there is writing to do (a pad), the hand in viewers; in the world, your bare hands
  // until you take a pen up (H, or a click on one)
  const [handChoice, setHand] = useState(null); // null: as the view is
  const canPen = !!(writer || wallWriter || tableWriter); // a pad, the room's surfaces (from Look), the papers on the table
  const hand = handChoice ?? (world || !canPen);
  const penMode = canPen && !hand;
  // the pen picked up while it writes, set down when the hand takes over (place acts: room/carry.js)
  const penWas = useRef(null);
  useEffect(() => {
    if (penWas.current === null) {
      penWas.current = penMode;
      return;
    }
    if (penWas.current === penMode) return;
    penWas.current = penMode;
    if (penMode) carrying?.penUp?.();
    else carrying?.penDown?.(S.lastPointer ? roomPointOf(S.lastPointer) : null); // (let go where the pointer is: it falls onto what is under it)
    if (!penMode && st.current) st.current.pen = null;
    schedule(); // (drawn again: the pen in the hand, or set down)
  }, [penMode]); // eslint-disable-line react-hooks/exhaustive-deps
  const [relief, setRelief] = useState(storedRelief);
  const [crisp, setCrisp] = useState(false); // the page close up: smooth between its cells, or each cell crisp
  const [steep, setSteep] = useState(false); // too low to write
  const [bandsOn, setBandsOn] = useState(false);
  const [banded, setBanded] = useState([0, 0]); // cells in a dark band, of all with a moment (shown on the element: data-banded, data-timed)
  const [ready, setReady] = useState(null); // the renderer, once chosen: 'webgpu' | 'webgl2'
  const [looking, setLooking] = useState(false); // Look: the head free in the room
  const [walking, setWalking] = useState(false); // Look: walking (else flying)
  const [size, setSize] = useState(1); // the being's size (1 a person)
  const phone = useRef(isPhone()).current;

  if (!st.current) {
    const cam0 = mode === '3d' ? camera3d(...page) : camera2d(...page);
    st.current = {
      cam: cam0,
      home: cam0,
      anim: null,
      override: null,
      back: null,
      raf: 0,
      last: 0,
      view: null,
      applied: new Map(),
      css: [1, 1],
      moveUntil: 0,
      pointers: new Map(),
      drag: null,
      taps: [],
      pose: null, // Look: the head in the room (light/roomCamera.js pose, room m)
      zoom: [0, 0, 0], // the world: from the head to the eye (room m), the eye's zoom (never recorded)
      spaceAt: null, // the world: when Space was last pressed (twice quickly: fly)
      keys: new Set(),
      marksOn: new Map(),
    };
  }
  const S = st.current;
  const eyeRef = useRef(eye);
  eyeRef.current = eye;
  const origin = () => originOf(page[0], page[1]);
  // A pose as the engine's camera (camera.js 'pose', the page frame).
  // The page's heights under a small being's feet (scene/ground.js): what the eye sees is what it stands on.
  const groundNow = () => (S.ground ??= groundOf(S.sheetsNow, { origin: origin(), pxPerM: PX_PER_M, dropPx: DROP_PX, relief: S.reliefNow ?? 1 }));
  function camOfPose(pose) {
    const { forward } = roomCamera.look(pose);
    const c = roomCamera.clearance(GEOM, pose.pos, groundNow());
    const near = (WK.zoomed(S.zoom) ? Math.max(roomCamera.GAP / 10, WK.NEAR_K * c) : roomCamera.nearAt(c)) * PX_PER_M; // zoomed: depth at every distance (§3.4)
    return { mode: 'pose', eye: roomToPage(pose.pos, origin()), forward: toRoomDir(forward), up: [0, 0, 1], fov: FOV, near, target: S.cam.target ?? [page[0] / 2, page[1] / 2] };
  }
  // The world: the head as it is (crouched or not), for you and the others; the eye where the zoom has it.
  const crouched = () => world && S.keys.has('shift') && S.pose?.mode === 'walk';
  const headNow = () => (S.pose ? WK.headOf(S.pose, crouched()) : null);
  const eyeNow = () => WK.eyeOf(headNow(), world ? S.zoom : null);
  // The world: where the being is and what it holds, told to the room when it changes (the panel follows it: room/panel.js).
  S.beingIn = { world, onBeing: inRoom?.onBeing ?? null, holding: carrying?.kind ?? (papers?.held ? 'paper' : null), pen: penMode };
  S.papersNow = papers;
  // the plot the being stands on, out of doors, if no house stands on it (law/world.js): [i, j] or null
  function freePlotUnder() {
    const o = S.outsideNow;
    if (!S.pose || !o?.plot || inBox(GEOM, S.pose.pos)) return null;
    const [x, y] = frameOf(GEOM, o.plot).toWorld(S.pose.pos);
    const plot = [Math.round(x / WORLD.PLOT_M), Math.round(y / WORLD.PLOT_M)];
    return (o.houses ?? []).some((h) => h.plot?.[0] === plot[0] && h.plot?.[1] === plot[1]) ? null : plot;
  }
  function tellPlace() {
    const b = S.beingIn;
    if (!b.world || !b.onBeing) return;
    const place = {
      seated: !S.pose,
      atChair: !!S.pose && WK.atChair(GEOM, S.pose),
      atTable: !!S.pose && WK.atTable(GEOM, S.pose),
      atCorner: !!S.pose && WK.atCorner(GEOM, S.pose),
      holding: b.holding,
      pen: b.pen,
      freePlot: freePlotUnder(),
    };
    const key = JSON.stringify(place);
    if (key === S.placeKey) return;
    S.placeKey = key;
    b.onBeing(place);
  }
  useEffect(tellPlace); // (a thing picked up or set down, the pen taken up: between frames too)
  // What the eye is on in Look: the patch of the room its gaze meets (null: the page).
  function gazeOf() {
    if (!S.pose) return null;
    if (S.outsideNow?.plot && !inBox(GEOM, S.pose.pos)) return 'outside'; // (out of the house: the field in daylight)
    const h = rayHit(S.pose.pos, roomCamera.look(S.pose).forward);
    if (!h || h.kind === 'opening') return null; // (an opening shut: its wood, in the room's light)
    return h.kind === 'room' ? (h.patch ?? null) : 'outside'; // looking out through an opening that is open: the outside's light
  }
  // The pose the page camera is in now (turning it into Look keeps the view).
  function poseOfCam(cam) {
    const f = frame(cam);
    const d = toRoomDir(f.forward);
    return { mode: 'fly', pos: pageToRoom(f.eye, origin()), yaw: (Math.atan2(d[0], d[1]) * 180) / Math.PI, pitch: (Math.asin(Math.max(-1, Math.min(1, d[2]))) * 180) / Math.PI, size: 1, vz: 0 };
  }
  const onPoseRef = useRef(onPose);
  onPoseRef.current = onPose;
  S.beings = beings;
  if (S.reliefNow !== relief) {
    S.reliefNow = relief; // (the ground is drawn as tall as the view draws it)
    S.ground = null;
  }

  const schedule = () => {
    if (!S.raf && S.view) S.raf = requestAnimationFrame(draw);
  };
  const liveSoon = () => {
    if (S.liveTimer) return;
    const wait = Math.max(0, LIVE_MS - (performance.now() - S.last));
    S.liveTimer = setTimeout(() => {
      S.liveTimer = 0;
      schedule();
    }, wait);
  };
  const invalidate = schedule;

  function currentLight(now) {
    let override = S.override;
    if (!override && S.back) {
      const k = Math.min(1, (now - S.back.t0) / 800);
      override = k < 1 ? returnTo(S.back.from, sunAt(worldClock(new Date())), k) : null;
      if (k >= 1) S.back = null;
    }
    const look = S.pose ? { forward: roomCamera.look(S.pose).forward, fov: FOV, outdoors: !inBox(GEOM, S.pose.pos) } : null; // (the sun in view dazzles)
    return theLight().at({ now, date: worldClock(new Date()), override, eye: eyeRef.current ?? undefined, gaze: gazeOf(), look });
  }

  function draw(now) {
    S.raf = 0;
    if (!S.view || S.hidden) return; // out of sight: drawn again when it comes back
    if (phone && now - S.last < 32 && S.anim === null) {
      // a frame cap on phones
      schedule();
      return;
    }
    S.last = now;
    if (S.anim) {
      const k = Math.min(1, (now - S.anim.t0) / S.anim.ms);
      S.cam = lerpCam(S.anim.from, S.anim.to, k);
      if (k >= 1) S.anim = null;
    }
    let cam = S.cam;
    if (cam.mode === '2d' && frame2d) {
      const [x0, y0, x1, y1] = frame2d();
      cam = { ...cam, target: [(x0 + x1) / 2, (y0 + y1) / 2], view: Math.max(1, x1 - x0) };
    }
    // Q lowers what is in the hand, Z raises it: as fast as the flying eye nears a surface (its clearance)
    const lift = (S.keys.has('z') ? 1 : 0) - (S.keys.has('q') ? 1 : 0);
    if (world && lift && carrying?.holding) {
      const dt = Math.max(0, Math.min(0.05, (now - (S.liftT ?? now)) / 1000));
      carrying.raise(lift * roomCamera.speedAt(Math.max(carrying.clearance() ?? 0, roomCamera.GAP)) * dt);
      S.liftT = now;
    } else S.liftT = now;
    if (S.pose) {
      // Look: fly by the keys held, at a speed that follows the nearest surface; or walk,
      // gravity holding the being to what is under it (falling, it falls until it rests)
      const walking = S.pose.mode === 'walk';
      if ((S.keys.size || walking) && !S.glide) {
        const dt = Math.max(0, Math.min(0.05, (now - (S.keyT ?? now)) / 1000)); // (a key pressed after this frame's time: no time yet, never back)
        const has = (k) => [...S.keys].some((x) => FLY_KEYS[x] === k);
        const input = world
          ? WK.inputOf(S.keys, S.pose.mode === 'fly')
          : { forward: (has('forward') ? 1 : 0) - (has('back') ? 1 : 0), right: (has('right') ? 1 : 0) - (has('left') ? 1 : 0), up: (has('up') ? 1 : 0) - (has('down') ? 1 : 0) };
        if (walking) S.pose = roomCamera.walk(GEOM, S.pose, input, dt, { ground: groundNow(), outside: S.outsideWalk ?? null });
        else if (dt > 0) S.pose = roomCamera.fly(GEOM, S.pose, input, dt, { ground: groundNow() });
        // in through another's door: into its house (its owner's space), standing where you came in
        const into =
          !S.entered &&
          (S.outsideWalk?.houses ?? []).find((h) => S.pose.pos[0] > h.at[0] && S.pose.pos[1] > h.at[1] && S.pose.pos[0] < h.at[0] + GEOM.size[0] && S.pose.pos[1] < h.at[1] + GEOM.size[1]);
        if (into && S.onEnter) {
          S.entered = true;
          S.onEnter(into, { pos: [S.pose.pos[0] - into.at[0], S.pose.pos[1] - into.at[1], S.pose.pos[2] - into.at[2]], yaw: S.pose.yaw, pitch: S.pose.pitch, size: S.pose.size ?? 1 });
        }
        S.keyT = now;
        if (S.keys.size) S.moveUntil = now + STILL_MS;
      }
      if (S.glide) {
        const k = Math.min(1, (now - S.glide.t0) / S.glide.ms);
        S.pose = roomCamera.glide(S.glide.from, S.glide.to, k);
        if (k >= 1) {
          const home = S.glide.to.mode === 'seated';
          S.glide = null;
          if (home) {
            S.pose = null; // back in the seat: the page camera again
            S.cam = S.home;
            S.zoom = [0, 0, 0];
            setLooking(false);
          }
        }
      }
    }
    if (S.pose) cam = camOfPose(eyeNow());
    if (cam.mode === '3d' && follow) cam = chaseFollow(cam, follow.base, follow.offset);
    if (cam.mode === '3d') {
      // in the room: never through a wall, the floor, the ceiling or the table
      const kept = withinRoom(cam, page[0], page[1]);
      if (kept !== cam) {
        cam = kept;
        if (!S.anim && !follow) S.cam = kept;
      }
    }
    // your head (room m): the camera, for you (the eye's zoom aside, which only you see)
    const head = cam.mode === '2d' ? null : (headNow() ?? poseOfCam(cam));
    if (head) earAt(head); // (the ears are on it: world.md)
    // the others here, each where its glide has it now (one whose head yours is in is not seen)
    let gliding = false;
    if (S.beings?.length || S.beingsOn) {
      const list = (S.beings ?? []).map((b) => {
        const { pose, moving } = poseNow(b, now);
        gliding ||= moving;
        const inside = !!pose && !!head && Math.hypot(...pose.pos.map((v, k) => v - head.pos[k])) < INSIDE_M * (pose.size ?? 1);
        return { name: b.name, pose, hidden: inside, pen: !!b.pen }; // (a pen in their hand: theirs to hold)
      });
      S.view.setBeings(list);
      S.beingsOn = list.length > 0;
    }
    const light = currentLight(now);
    S.view.setLight(light, originOf(page[0], page[1]));
    // the candles crackle as they burn (world.md Phase 3): heard a bar ahead (Phase 3c: each placed on
    // the pulse, which may bring it half a leaf sooner), what falls since the frame before (a gap
    // longer than the flicker's frames is time not drawn: nothing in it is heard)
    const worldS = worldClock(new Date()).getTime() / 1000;
    if (S.heardTo !== undefined && worldS - S.heardTo < (2 * FLICKER_MS) / 1000)
      for (const f of light.flames) for (const e of crackles(f, S.heardTo + BAR, worldS + BAR)) hear({ ...e, t: e.t - worldS + soundNow() });
    S.heardTo = worldS;
    // the rain on the window's glass (world.md Phase 5): stepped as the frames go, each drop's landing
    // heard where it lands, the beads drawn as the view bends through them
    const w = S.weather;
    if (w && (w.rain > 0 || S.pane?.beads.length)) {
      const win = GEOM.window;
      S.pane ??= createPane({
        width: win.x1 - win.x0,
        height: win.z1 - win.z0,
        seed: [...String(space ?? '')].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5),
        at: (x, y) => [win.x0 + x, GEOM.size[1], win.z1 - y],
      });
      const dt = Math.min(0.25, Math.max(0, (now - (S.paneAt ?? now)) / 1000));
      for (const e of S.pane.step(dt, { rain: w.rain, wind: w.wind, t: worldS })) hear({ ...e, t: e.t - worldS + soundNow() });
      S.view.setBeads(S.pane.heights(256, 307), 256, 307);
      S.beadsShown = true;
    } else if (S.beadsShown) {
      S.view.setBeads(null);
      S.beadsShown = false;
    }
    S.paneAt = now;
    // the outside's beings near (outside.md Part 4, law/life.js): each where it is now, as the seen oaks'
    // numbers have them; drawn, and heard as it does what it does (a gall bug sitting chirps, a bird
    // sitting sings, a wing beats while it flies)
    const lifeNow = S.outsideSpec?.life;
    if (lifeNow?.length) {
      const ms = worldS * 1000;
      const F = frameOf(GEOM, S.outsideNow.plot);
      const list = [];
      for (const { tree, L } of lifeNow)
        for (const b of LIFE.beingsAt(tree, L, ms)) {
          const at = F.toRoom(b.at);
          if (seenFrom(GEOM, S.outsideSpec.ways, at)) list.push({ ...b, at });
        }
      S.view.setLife(
        list.map((b) => ({
          at: b.at,
          r: LIFE.bodyOf(b.kind).r,
          matter: BEINGS[b.kind].of.cover ?? BEINGS[b.kind].of.body,
          flying: b.flying,
          span: BEINGS[b.kind].span,
          heading: ((b.seed % 360) * Math.PI) / 180,
        })),
      );
      if (S.lifeHeardTo !== undefined && worldS - S.lifeHeardTo < (2 * FLICKER_MS) / 1000) {
        const air = dayOf(LIFE.dayAt(ms)).warmth;
        const share = singing((Math.asin(Math.max(-1, Math.min(1, sunToward(ms)[2]))) * 180) / Math.PI, S.weather?.rain ?? 0);
        for (const b of list) {
          if (b.dead) continue;
          const B = BEINGS[b.kind];
          const evs = b.flying
            ? wingbeats({ pos: b.at, flaps: B.flaps, mass: B.mass / 1000, seed: b.seed, q: 1000 / (MATTER[B.of.body].loss ?? 1000) }, S.lifeHeardTo, worldS)
            : B.chirp
              ? chirps({ pos: b.at, seed: b.seed, pitch: B.chirp.pitch, loud: B.chirp.loud }, S.lifeHeardTo, worldS, air)
              : B.song
                ? songs({ pos: b.at, seed: b.seed }, S.lifeHeardTo, worldS, share)
                : [];
          for (const e of evs) hear({ ...e, t: e.t - worldS + soundNow() });
        }
      }
      S.lifeHeardTo = worldS;
      S.lifeShown = list.length > 0;
      globalThis.__life = list.map((b) => ({ kind: b.kind, id: b.id, at: b.at, flying: b.flying, dead: b.dead })); // (for the checks: e2e/life.mjs)
    } else if (S.lifeShown) {
      S.view.setLife(null);
      S.lifeShown = false;
    }
    // the rain out there (scene/rain.js), drawn while the outside is seen: none under a roof
    const raining = !!S.outsideSpec && (S.weather?.rain ?? 0) > 0;
    if (raining || S.rainShown) {
      const eye = head?.pos ?? roomCamera.seat(GEOM).pos;
      const [W, D, H] = GEOM.size;
      const roofs = [[0, 0, W, D, H], ...(S.outsideWalk?.houses ?? []).map((h) => [h.at[0], h.at[1], h.at[0] + W, h.at[1] + D, h.at[2] + H])];
      const r = raining ? rainNear({ rate: S.weather.rain, wind: windOf(S.weather), eye, t: worldS, roofs, ground: S.outsideWalk ? S.outsideWalk.ground(eye[0], eye[1]) : 0 }) : null;
      S.view.setRain(r, Math.min(0.1, Math.max(1 / 120, worldS - (S.rainAt ?? worldS))));
      globalThis.__rainNow = { eye, roofs, n: r?.n ?? 0, D: r?.D ?? null, at: r ? Array.from(r.at.subarray(0, 12)) : [] }; // (for the checks: e2e/weather.mjs)
      S.rainAt = worldS;
      S.rainShown = raining;
    }
    if (S.outsideNow?.plot && S.pose) loadOutside(); // (it follows the being out of the house, and about out there)
    // the resolution: capped; lower while moving and for the flicker alone (full again once still)
    const moving = !!S.anim || now < S.moveUntil || S.drag?.kind === 'orbit' || S.drag?.kind === 'pan' || S.drag?.kind === 'two';
    if (!S.flickerOnly) S.lastFull = now;
    const quiet = S.flickerOnly && now - (S.lastFull ?? 0) > 1000; // only the candles, for a second now
    const k = (phone ? 1 : Math.min(CAP_DESKTOP, window.devicePixelRatio || 1)) * (moving || quiet ? MOVING : 1);
    S.flickerOnly = false;
    if (moving && !S.anim) {
      clearTimeout(S.still);
      S.still = setTimeout(schedule, Math.max(0, S.moveUntil - now) + 20);
    }
    // the pens (rooms.md §3c): the one in the hand at its nib, its tines as wide as its line; the rest
    // where they lie; and the jar
    const drawn = Object.fromEntries(Object.entries(carrying?.penPlaces ?? { pen: penLies }).map(([id, at]) => [id, at ? { place: at } : null]));
    if (penMode && S.pen) drawn[carrying?.penHeld ?? 'pen'] = S.pen;
    S.view.setPens(drawn);
    S.view.setJar(carrying?.jarAt?.() ?? null, carrying?.jarLying?.() ?? null);
    S.view.setStamper(carrying?.stamperAt?.() ?? null, carrying?.stamperLying?.() ?? null); // (the stamper: in the hand, or where it lies)
    S.view.setPendulum(carrying?.pendulumAt?.() ?? null, carrying?.pendulumLying?.() ?? null, carrying?.bobAt?.() ?? null); // (its bob hanging, or swinging)
    S.view.setHands(carrying?.hands?.() ?? []); // (the bare hands reaching in the room: anyone's)
    if (S.outsideSpec && S.pose) S.view.setEyeNear(eyeNow()?.pos ?? null); // (the ground near the eye, fine)
    S.view.render(cam, Math.max(1, Math.round(S.css[0] * k)), Math.max(1, Math.round(S.css[1] * k)));
    S.shown = cam;
    tellSeen(now);
    tellPlace();
    // your head, for the others (room/presence.js sends it when it has moved enough)
    if (onPoseRef.current && head) {
      if (S.pose) onPoseRef.current({ pos: head.pos, yaw: head.yaw, pitch: head.pitch, size: head.size ?? 1, flying: S.pose.mode === 'fly' });
      else if (cam.target) onPoseRef.current({ at: pageToRoom([cam.target[0], cam.target[1], 0], origin()) });
    }
    const low = cam.mode === '3d' && !!(writer || tableWriter) && !canWrite(cam);
    setSteep((was) => (was === low ? was : low));
    if (
      S.anim ||
      S.override ||
      S.back ||
      S.glide ||
      (S.pose && (S.keys.size || (S.pose.mode === 'walk' && S.pose.vz))) ||
      gliding ||
      carrying?.falling?.() ||
      carrying?.swinging?.() ||
      (lift && carrying?.holding)
    )
      schedule(); // moving (or falling; or something let go falling)
    else if (light.settling && !S.settle) {
      // the room's light settling, the eye adapting: a few frames a second
      S.settle = setTimeout(() => {
        S.settle = 0;
        schedule();
      }, SETTLE_MS);
    } else if ((light.night > 0.01 || light.weather?.rain > 0 || S.pane?.beads.length || light.flash || S.lifeShown) && !S.flicker) {
      // only the candles flickering, the rain falling (past the window, down its glass), a flash, the beings out there
      S.flicker = setTimeout(() => {
        S.flicker = 0;
        if (!S.raf) S.flickerOnly = true;
        schedule();
      }, FLICKER_MS);
    }
  }

  // the view and its canvas, once the renderer is chosen (WebGPU starts asynchronously)
  useEffect(() => {
    let alive = true;
    let stop = null;
    engineReady().then((gpu) => {
      if (alive) stop = start(gpu);
    });
    return () => {
      alive = false;
      stop?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function start(gpu) {
    const view = createView(canvasRef.current, { host: wrapRef.current, invalidate: schedule, seeds });
    S.view = view;
    if (paper) view.setPaper(paper);
    const offLight = theLight().onSettled(schedule); // the room's light settled anew: draw it
    const ro = new ResizeObserver(() => {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      S.css = [r.width, r.height];
      schedule();
    });
    ro.observe(wrapRef.current);
    const io = new IntersectionObserver(([e]) => {
      S.hidden = !e.isIntersecting;
      view.setVisible(!S.hidden);
      if (!S.hidden) schedule();
    });
    io.observe(wrapRef.current);
    const tick = setInterval(schedule, 60000); // the clock moves the sun
    setReady(gpu);
    if (world) canvasRef.current?.focus({ preventScroll: true }); // in the world: the keys are yours at once
    return () => {
      ro.disconnect();
      offLight();
      io.disconnect();
      clearInterval(tick);
      clearTimeout(S.liveTimer);
      clearTimeout(S.flicker);
      clearTimeout(S.settle);
      clearTimeout(S.still);
      cancelAnimationFrame(S.raf);
      S.raf = 0;
      for (const a of S.applied.values()) a.unsub?.();
      S.applied.clear();
      view.dispose();
      S.view = null;
    };
  }

  // the sheets
  useEffect(() => {
    S.sheetsNow = sheets;
    S.ground = null;
    const view = S.view;
    if (!view) return;
    const ids = new Set(sheets.map((s) => s.id));
    for (const [id, a] of S.applied) {
      if (!ids.has(id)) {
        a.unsub?.();
        view.removeSheet(id);
        S.applied.delete(id);
      }
    }
    for (const s of sheets) {
      const a = S.applied.get(s.id);
      const placed = a && a.spec.cellPx === s.cellPx && a.spec.origin[0] === s.origin[0] && a.spec.origin[1] === s.origin[1] && a.spec.box.join() === s.box.join();
      if (!placed) {
        a?.unsub?.();
        const [x0, y0, w, h] = s.box;
        view.setSheet(s.id, { x0, y0, w, h, origin: s.origin, cellPx: s.cellPx });
      }
      if (!s.held && (!placed || s.lift !== a.spec.lift)) view.liftSheet(s.id, [0, 0], s.lift ?? 0); // (where it rests: on the floor, below the table)
      if (s.held && !placed) {
        // taken up: in the hand, held by its middle where the pointer is
        const p = S.lastPointer ? pageOf(S.lastPointer) : null;
        view.liftSheet(s.id, p ? [p.x - s.size[0] / 2, p.y - s.size[1] / 2] : [0, 0], HAND_PX);
      }
      const was = placed ? a.spec : {};
      if (s.field && s.field !== was.field) view.setField(s.id, s.field);
      if (s.detail && s.detail !== was.detail) view.setDetail(s.id, s.detail.data, s.detail.box);
      let unsub = placed ? a.unsub : null;
      if (s.live && (!placed || s.live !== was.live)) {
        unsub?.();
        view.setTiles(s.id, s.live.tiles());
        unsub = s.live.onTiles((tiles) => {
          view.setTiles(s.id, tiles);
          liveSoon(); // at most every LIVE_MS
        });
      }
      S.applied.set(s.id, { spec: s, unsub });
    }
    schedule();
  }, [sheets, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // whose room: its surfaces grown from its owner's key (drawn, and in the room's light)
  useEffect(() => {
    if (!S.view) return;
    S.view.setSeeds(seeds);
    theLight().setSeeds(seeds ?? {});
    schedule();
  }, [seeds, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // the ink on its surfaces and the papers lying about, in the room's light (light-waves §4): each patch they
  // lie on refuses what their cells do (scene/inkLight.js), the room's light settled anew
  useEffect(() => {
    const light = theLight();
    const room = light.geom;
    const stamped = (marks ?? []).flatMap((m) => (m.abs ? [m] : m.ink ? [{ ...m, ...m.ink }] : [])); // (as stamped: a live mark's ink beside its guess)
    const inked = markedCurves(room, stamped, (i) => patchCurve(room, i, { seeds: seeds ?? {} }));
    const lying = (sheets ?? []).flatMap((s) => {
      if (s.held || !s.size) return [];
      const [x0, y1, z] = pageToRoom([s.origin[0], s.origin[1], s.lift ?? 0], origin());
      return [{ x0, y0: y1 - s.size[1] / PX_PER_M, x1: x0 + s.size[0] / PX_PER_M, y1, z, cells: s.box[2] * s.box[3], abs: s.field?.abs }];
    });
    light.setInk({ ...inked, ...papersCurves(room, lying, (i) => inked[i] ?? patchCurve(room, i, { seeds: seeds ?? {} }), light.paper) });
  }, [marks, seeds, sheets, page[0], page[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  // What the eye has in view of the papers and the written surfaces (rooms.md §8; cleanup-and-speed.md §5b: what
  // is out of view loads nothing): told now and then, as it changes.
  const SEEN_MS = 300; // (a drawing's: how often it is asked)
  const tellSeen = (now) => {
    if (!onSeen || !S.view || now - (S.seenAt ?? 0) < SEEN_MS) return;
    S.seenAt = now;
    const o = origin();
    const items = [];
    for (const s of S.sheetsNow ?? []) {
      if (!s.paper || !s.size) continue;
      const z = s.lift ?? 0;
      items.push([s.paper, [s.origin[0], -s.origin[1] - s.size[1], z - 20, s.origin[0] + s.size[0], -s.origin[1], z + 20]]);
    }
    // (the house's surfaces: whichever is in view, its ink grows: rooms.md §2)
    for (const id of SURFACE_IDS) {
      const f = surfaceFrame(GEOM, id);
      if (!f) continue;
      const corners = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([a, b]) =>
        roomToPage(
          [0, 1, 2].map((k) => f.origin[k] + f.right[k] * a * f.size[0] + f.down[k] * b * f.size[1]),
          o,
        ),
      );
      const xs = corners.map((c) => c[0]),
        ys = corners.map((c) => -c[1]),
        zs = corners.map((c) => c[2]);
      items.push([`surface:${id}`, [Math.min(...xs), Math.min(...ys), Math.min(...zs) - 20, Math.max(...xs), Math.max(...ys), Math.max(...zs) + 20]]);
    }
    if (!items.length) return;
    const inView = S.view.inView(items.map(([, b]) => b));
    const ids = items.filter((_, k) => inView[k]).map(([id]) => id);
    const key = ids.join();
    if (key === S.seenKey) return;
    S.seenKey = key;
    onSeen(ids);
  };

  // a fire's flames (law/fire.js): its cells alight now, room m
  useEffect(() => {
    if (!S.view) return;
    S.view.setFire(flames ?? []);
    schedule();
  }, [flames, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // ink on the room's surfaces
  const showMarks = () => {
    const view = S.view;
    if (!view) return;
    const list = marks ?? [];
    const ids = new Set(list.map((m) => m.id));
    for (const [id, a] of S.marksOn) {
      if (ids.has(id)) continue;
      a.unsub?.();
      view.removeMark(id);
      S.marksOn.delete(id);
    }
    for (const m of list) {
      const a = S.marksOn.get(m.id);
      const same = a && a.spec.surface === m.surface && a.spec.origin.join() === m.origin.join() && a.spec.cellUnits === m.cellUnits && a.spec.box.join() === m.box.join();
      if (!same) {
        a?.unsub?.();
        view.setMark(m.id, m);
      }
      if (m.abs && (!same || m.abs !== a.spec.abs)) view.putMark(m.id, m.box[0], m.box[1], m.box[2], m.box[3], m.abs);
      let unsub = same ? a.unsub : null;
      if (m.live && (!same || m.live !== a.spec.live)) {
        unsub?.();
        view.setMarkTiles(m.id, m.live.tiles());
        unsub = m.live.onTiles((tiles) => {
          view.setMarkTiles(m.id, tiles);
          liveSoon();
        });
      }
      S.marksOn.set(m.id, { spec: m, unsub });
    }
    schedule();
  };
  useEffect(showMarks, [marks, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  // the pen's face (rooms.md §3c) where the pen lies: the ink on it goes with it
  const penLies = carrying?.penPlaces?.pen ?? penRest();
  useEffect(() => {
    setPenPlace(penLies);
    for (const [id, a] of S.marksOn) {
      if (a.spec.surface !== 'pen') continue;
      a.unsub?.();
      S.view?.removeMark(id);
      S.marksOn.delete(id);
    }
    showMarks();
  }, [penLies.join(), ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // the shelf's books
  useEffect(() => {
    if (!S.view) return;
    S.view.setShelf(shelf?.books ?? null);
    schedule();
  }, [shelf?.books, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Look: the head free in the room, or back to the seat (a glide)
  function look(on) {
    if (fixed) return;
    if (on && !S.pose) {
      const was = poseOfCam(S.shown ?? S.cam);
      S.pose = world ? WK.standUp(GEOM, was) : was; // the world: up from the chair, on your feet
      S.glide = null;
      S.keyT = performance.now();
      setLooking(true);
      setWalking(S.pose.mode === 'walk');
      // (for the checks: the head turned toward a point of the room, e2e/room.mjs)
      globalThis.__sceneLook = {
        aim(p) {
          if (!S.pose) return;
          const d = p.map((v, k) => v - S.pose.pos[k]);
          const len = Math.hypot(...d);
          S.pose = { ...S.pose, yaw: (Math.atan2(d[0], d[1]) * 180) / Math.PI, pitch: (Math.asin(d[2] / len) * 180) / Math.PI };
          schedule();
        },
        at(pos) {
          if (S.pose) S.pose = { ...S.pose, pos: [...pos] };
          schedule();
        },
        pose: () => S.pose,
        eye: () => eyeNow()?.pos ?? null, // (where the eye is: the head's, or zoomed)
        // the sun placed as the light tool drags it ({ az, el }), or back to the time of day (null)
        sun: (place) => {
          S.override = place;
          schedule();
        },
        // what the ray through the middle of the view meets (scene/worldRay.js): its kind, how far
        ahead: () => {
          const c = canvasRef.current?.getBoundingClientRect();
          if (!c) return null;
          const { origin: o, dir } = roomRay({ clientX: c.left + c.width / 2, clientY: c.top + c.height / 2 });
          const h = rayHit(o, dir);
          return h && { kind: h.kind, t: h.t, clear: clearOf(o) }; // (and how clear of matter the eye is)
        },
      };
    } else if (!on && S.pose && !S.glide) {
      S.glide = { from: S.pose, to: { ...poseOfCam(S.home), mode: 'seated' }, t0: performance.now(), ms: 600 };
    }
    schedule();
  }

  // come in through this house's door from outside: standing where you came in, walking
  useEffect(() => {
    if (!ready || !arrive || !world || S.arrived) return;
    S.arrived = true;
    look(true);
    S.pose = { ...S.pose, mode: 'walk', pos: [...arrive.pos], yaw: arrive.yaw, pitch: arrive.pitch, size: arrive.size ?? 1, vz: 0 };
    setWalking(true);
    schedule();
  }, [ready, arrive]); // eslint-disable-line react-hooks/exhaustive-deps

  // the others moved: draw them where they are going
  useEffect(schedule, [beings]); // eslint-disable-line react-hooks/exhaustive-deps

  // the 2D/3D switch: the camera moves, the page under it does not
  useEffect(() => {
    if (S.cam.mode === mode && !S.anim) return;
    const from = S.shown ?? S.cam;
    const to = mode === '3d' ? { ...camera3d(...page), target: from.target } : { ...camera2d(...page), target: from.target, view: from.view };
    S.anim = { from: { ...from, mode: '3d', el: from.mode === '2d' ? 89.9 : from.el }, to, t0: performance.now(), ms: 650 };
    S.cam = to;
    schedule();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(schedule, [frame2d, follow?.offset?.[0], follow?.offset?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!S.view) return;
    S.view.setGround(ground ? page : null);
    schedule();
  }, [ground, page[0], page[1], ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (paper && S.view) {
      S.view.setPaper(paper);
      schedule();
    }
  }, [paper?.join(), ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    camera: () => S.shown ?? S.cam,
    setCamera(cam) {
      if (!cam) return;
      S.anim = { from: S.shown ?? S.cam, to: cam, t0: performance.now(), ms: 300 };
      S.cam = cam;
      schedule();
    },
    invalidate,
    look,
  }));

  // --- pointers ---
  const toNdc = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1), r.width / r.height];
  };
  const pageOf = (e) => {
    const [nx, ny, aspect] = toNdc(e);
    const p = pageAt(S.shown ?? S.cam, nx, ny, aspect);
    return p ? { x: p[0], y: p[1] } : null;
  };
  // The part of the line through a and b that lies on the page (Liang–Barsky), or null.
  const withinPage = (a, b) => {
    const d = [b[0] - a[0], b[1] - a[1]];
    let t0 = -Infinity,
      t1 = Infinity;
    for (let i = 0; i < 2; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        if (a[i] < 0 || a[i] > page[i]) return null;
        continue;
      }
      const u = (0 - a[i]) / d[i],
        v = (page[i] - a[i]) / d[i];
      t0 = Math.max(t0, Math.min(u, v));
      t1 = Math.min(t1, Math.max(u, v));
    }
    if (t1 - t0 < 1e-6) return null;
    const at = (t) => [a[0] + d[0] * t, a[1] + d[1] * t];
    return [at(t0), at(t1)];
  };
  // The ray through a screen point, in the room (m): { origin, dir }.
  const roomRay = (e) => {
    const [nx, ny, aspect] = toNdc(e);
    const r = rayThrough(S.shown ?? S.cam, nx, ny, aspect);
    return { origin: pageToRoom(r.origin, origin()), dir: toRoomDir(r.dir) };
  };
  // One ray for everything (scene/worldRay.js): what a ray meets first, of this house, the others' and the
  // outside; `hand`: as a hand would (the glass stops it).
  const rayHit = (o, dir, opts) => worldHit({ geom: GEOM, opens: S.opensNow, houses: S.outsideSpec?.houses ?? [], spec: S.outsideSpec ?? null, ground: S.outsideWalk?.ground ?? null }, o, dir, opts);
  // How clear of matter the eye is at p (room m): in this house or another's, of its room; out of doors, of
  // the ground.
  const clearOf = (p) => {
    const inHouse = (q) => inBox(GEOM, q) && q[2] >= 0 && q[2] <= GEOM.size[2];
    if (inHouse(p)) return roomCamera.clearance(GEOM, p, groundNow());
    const other = (S.outsideSpec?.houses ?? []).find((h) => inHouse([p[0] - h.at[0], p[1] - h.at[1], p[2] - h.at[2]]));
    if (other) return roomCamera.clearance(GEOM, [p[0] - other.at[0], p[1] - other.at[1], p[2] - other.at[2]]);
    return S.outsideWalk ? p[2] - S.outsideWalk.ground(p[0], p[1]) : Infinity;
  };
  // The nib over a hole it wore through the paper (law 4): there it presses on what the paper lies on, the
  // table's own wood (its own chain), for as long as it is over the hole; the paper's stroke goes on round
  // it. q: where on the paper (its units), or null: off it or lifted.
  const through = (d, ev, q) => {
    const desk = q && wallWriter && tableWriter.wornAt?.(d.on.sheet, q) ? surfaceAt(ev, 'table') : null;
    if (desk) {
      if (d.below) wallWriter.move(desk.p, ev);
      else wallWriter.down('table', desk.p, ev, d.type ?? 'mouse');
      d.below = desk.p;
    } else if (d.below) {
      wallWriter.up(d.below, ev);
      d.below = null;
    }
  };
  // The topmost paper lying on the table under the pointer: { on (tableWriter's), q (its units), at (page px) }
  const paperUnder = (e) => {
    const at = tableWriter ? pageOf(e) : null;
    const on = at && tableWriter.sheets.find((t) => inSheet(t, at));
    return on ? { on, q: { x: at.x - on.origin[0], y: at.y - on.origin[1] }, at } : null;
  };
  // whether a house stands at (x, y) (room m): its floor there, not the ground
  const underHouse = (x, y) => inBox(GEOM, [x, y]) || (S.outsideSpec?.houses ?? []).some((h) => inBox(GEOM, [x - h.at[0], y - h.at[1]]));
  // What the pen points at in the room: a book surface and the point on its page,
  // or null. Writing pauses below the minimum angle, measured from the surface (as on paper).
  const MIN_SIN = Math.sin((MIN_WRITE_EL * Math.PI) / 180);
  const surfaceAt = (e, only = null) => {
    const { origin: o, dir } = roomRay(e);
    let id = only;
    let t;
    if (!only) {
      const h = rayHit(o, dir);
      if (h?.kind !== 'room') return null; // (out through an opening, or the others' houses: nothing of this house)
      id = surfaceOfHit(GEOM, h.surface);
      t = h.t;
      if (!id || (h.patch !== undefined && h.patch === GEOM.page)) return null; // the page itself: the paper's own pen
      // the pen lying in front of it: its top face
      const pf = surfaceFrame(GEOM, 'pen');
      const down = pf && -(dir[0] * pf.normal[0] + dir[1] * pf.normal[1] + dir[2] * pf.normal[2]);
      if (down > 0) {
        const tp = ((o[0] - pf.origin[0]) * pf.normal[0] + (o[1] - pf.origin[1]) * pf.normal[1] + (o[2] - pf.origin[2]) * pf.normal[2]) / down;
        if (
          tp > 0 &&
          tp < t &&
          onSurface(
            pf,
            fromRoom(
              pf,
              o.map((v, k) => v + dir[k] * tp),
            ),
          )
        ) {
          id = 'pen';
          t = tp;
        }
      }
    }
    const f = surfaceFrame(GEOM, id);
    const across = -(dir[0] * f.normal[0] + dir[1] * f.normal[1] + dir[2] * f.normal[2]);
    if (across < MIN_SIN) return null;
    if (t === undefined) {
      const off = (o[0] - f.origin[0]) * f.normal[0] + (o[1] - f.origin[1]) * f.normal[1] + (o[2] - f.origin[2]) * f.normal[2];
      t = off / across;
    }
    const q = fromRoom(
      f,
      o.map((v, k) => v + dir[k] * t),
    );
    return onSurface(f, q) ? { surface: id, p: { x: q.x, y: q.y } } : null;
  };
  // the pen writes only where the ray meets the page (over the desk it lays nothing)
  const onPage = (p) => p && p.x >= 0 && p.y >= 0 && p.x <= page[0] && p.y <= page[1];
  const inSheet = (t, p) => p && p.x >= t.origin[0] && p.y >= t.origin[1] && p.x <= t.origin[0] + t.size[0] && p.y <= t.origin[1] + t.size[1];
  const lightFromPointer = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width,
      fy = (e.clientY - r.top) / r.height;
    return { az: (fx - 0.5) * 220, el: Math.max(2, Math.min(88, (1 - fy) * 90)) };
  };

  // The pen at the nib (page point p, page px), pressing as the event does (rooms.md §3c).
  const penAt = (p, ev, down = true) => {
    if (!p) return;
    const w = writer?.widthAt ?? tableWriter?.widthAt ?? ((q) => lineWidthPx(PLAIN_PEN, q));
    const pressure = down ? Math.round(255 * (ev?.pressure > 0 ? ev.pressure : 0.5)) : 0;
    const nib = pageToRoom([p.x, p.y, 0], origin());
    penHeard(down ? 'on' : 'up', S.drag?.kind === 'table' ? tableWriter : writer, p, nib, ev);
    if (!down) nib[2] += LIFT_M;
    S.pen = { nib, spread: w(pressure) / PX_PER_M, across: (writer?.across ?? tableWriter?.across)?.() ?? 0 };
  };
  // The pen heard (world.md Phase 2): its acts as they come, from the nib (room m), as the writer's
  // ink has it (by.nib(): the pen, the matter, the reservoir, the drops thrown). 'on': down, or on.
  const penHeard = (phase, by, p, nib, ev) => {
    S.penSound ??= penHand(hear);
    const t = ev?.timeStamp ?? performance.now();
    const q = { x: p.x, y: p.y, t, p: ev?.pressure > 0 ? ev.pressure : 0.5 };
    if (phase === 'up') S.penSound.up(q, nib, t / 1000);
    else S.penSound[S.penOn ? 'move' : 'down'](q, nib, t / 1000, by?.nib?.() ?? {});
    S.penOn = phase !== 'up';
  };
  const surfaceNib = (surface, p) => toRoom(surfaceFrame(GEOM, surface), [p.x, p.y]);
  // a dip pen's nib knocking the jar's glass as it goes in
  const dipHeard = () => {
    const foot = carrying?.jarAt?.();
    if (foot) hear(dipTap([foot[0], foot[1], foot[2] + JAR.height], soundNow(), JAR, (S.dips = (S.dips ?? 0) + 1)));
  };
  // the room the ear is in: its size and faces, the window open or shut (world.md Phase 3)
  useEffect(() => spaceIs(space), [space]);
  const windowOpen = !!carrying?.windowOpen;
  // the door and the shutters (outside.md Phase 4): drawn shut or out of the way; what lets the outside
  // in, to the light and to what is grown out there; the being walks out through the open door
  const opens = carrying?.opens ?? null;
  const opensKey = JSON.stringify(opens);
  S.opensNow = opens; // (as they are now, for the frames: the loop's closures are older)
  S.outsideNow = outside;
  S.handsNow = hands;
  S.houseOpensNow = houseOpens;
  S.onEnter = onEnter;
  useEffect(loadOutside, [JSON.stringify(houseOpens)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    S.outsideKey = null; // (what hands have done changed: the outside again)
    loadOutside();
  }, [hands?.facts?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const o = opens ?? { door: false, shutters: true };
    S.view?.setOpens(o);
    theLight().setOpens(o);
    S.outsideWalk = outside?.plot ? { door: !!o.door, ground: outsideGround(GEOM, outside.plot) } : null;
    S.outsideKey = null;
    loadOutside();
  }, [opensKey, outside?.plot?.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const doorOpen = !!carrying?.opens?.door;
  useEffect(() => {
    roomIs(acoustics(GEOM, { open: windowOpen, door: doorOpen })); // (the window, and the door: what they let out and in)
    theLight().setWindow(windowOpen); // (the room's air: what it lets out, world.md 3b; the door: the light's opens)
  }, [windowOpen, doorOpen]);
  // the weather over this space (world.md Phase 4: its seed the space's, so everyone there has the
  // same): heard from its totals; its air the outside the window opens to
  useEffect(() => {
    if (!space) return undefined;
    const tick = () => {
      const ms = worldClock(new Date()).getTime();
      const w = asWeather(weatherAt(space, ms), S.asked, ms / 1000); // (what this viewer called up, easing back)
      weatherIs(w);
      S.weather = w;
      theLight().setWindow(windowOpen, w.temp - AIR.temp);
      theLight().setWeather(w);
      // each strike coming: its flash drawn when it falls, its thunder heard from where it struck
      S.struck ??= new Set();
      const win = GEOM.window;
      const from = [(win.x0 + win.x1) / 2, GEOM.size[1], (win.z0 + win.z1) / 2];
      for (const s of [...w.strikes, ...w.coming]) {
        if (S.struck.has(s.at) || s.at < ms - 10000) continue;
        S.struck.add(s.at);
        hear(thunder(s, from, s.at / 1000 - ms / 1000 + soundNow(), s.at / 1000));
        setTimeout(schedule, Math.max(0, s.at - ms));
      }
      schedule();
    };
    S.weatherTick = tick;
    tick();
    const id = setInterval(tick, 2000); // (the beds follow the ear as it moves; the weather steps every two minutes)
    return () => {
      clearInterval(id);
      weatherIs(null);
    };
  }, [space, windowOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  // the outside grown around the house as it is seen (scene/outside.js): again as the openings change,
  // or the being goes out, or far from where it was grown
  function loadOutside() {
    if (!S.view) return;
    const o = S.opensNow ?? { door: false, shutters: true };
    const outside = S.outsideNow;
    const out = S.pose && !inBox(GEOM, S.pose.pos) ? S.pose.pos : null;
    const facts = S.handsNow?.facts ?? null;
    const day = Math.floor(worldClock(new Date()).getTime() / 86400000) + 719528;
    const key = outside?.plot ? [JSON.stringify(o), out ? out.map((v) => Math.round(v / 10)).join() : 'in', facts?.n ?? 0, day, S.mailN ?? 0, JSON.stringify(S.houseOpensNow ?? {})].join('|') : 'none';
    if (key === S.outsideKey) return;
    S.outsideKey = key;
    // how many letters wait in each house's mailbox (its flag), read before the outside is folded
    const asked = outside?.plot && S.papersNow ? S.papersNow.letters((outside.houses ?? []).map((h) => h.key)).catch(() => null) : Promise.resolve(null);
    asked.then((letters) => {
      if (S.outsideKey !== key) return;
      const spec = outside?.plot
        ? outsideNear(GEOM, outside.plot, { opens: o, at: out, houses: outside.houses ?? [], day, ms: worldClock(new Date()).getTime(), facts, letters, houseOpens: S.houseOpensNow ?? {} })
        : null;
      S.outsideSpec = spec;
      if (S.outsideWalk) S.outsideWalk.houses = (spec?.houses ?? []).map((h) => ({ key: h.key, name: h.name, at: h.at, door: !!h.opens?.door }));
      S.view?.setOutside(spec);
      globalThis.__outsideNow = spec && {
        ways: spec.ways,
        stones: spec.stones.map((x) => ({ id: x.id, at: x.at })),
        trees: spec.trees.map((t) => ({ id: t.id, at: t.at })),
        houses: spec.houses.length,
        others: spec.houses.map((h) => ({ key: h.key, name: h.name, at: h.at, door: h.door, opens: h.opens })),
      }; // (for the checks: e2e/outside.mjs, e2e/oneworld.mjs)
      schedule();
    });
  }
  // (for the checks, e2e/room.mjs: what the hand meets under the pointer: a thing, a paper and the point on it)
  globalThis.__under = () =>
    S.lastPointer ? { thing: pickableAt(S.lastPointer), paper: paperAt(S.lastPointer), met: touchAt(S.lastPointer), pen: penMode, holding: !!carrying?.holding, reach: !!carrying?.reach } : null;
  // (for the checks, e2e/outside.mjs: what is open now, and the opening under the pointer)
  globalThis.__opens = () => ({ opens: carrying?.opens ?? null, under: openingAt(S.lastPointer) });
  globalThis.__eyeNow = () => ({ gaze: gazeOf(), eye: theLight().state.eye });
  // What the hand reaches outside under the pointer (scene/reach.js): through an open opening, or out there.
  // How fast the hand goes at what it works on, `dist` m out (outside.md §3.3: with a stone or a stick in hand
  // the mouse's speed is the arm's): the pointer's ray turning over the last moment, times how far out it is;
  // mm/s, no faster than an arm goes (law/making.js armSpeed).
  const handSpeed = (dist) => {
    const now = performance.now();
    const tr = (S.trail ?? []).filter((p) => now - p.t < TRAIL_MS);
    if (tr.length < 2) return 0;
    const a = roomRay({ clientX: tr[0].x, clientY: tr[0].y }).dir,
      b = roomRay({ clientX: tr.at(-1).x, clientY: tr.at(-1).y }).dir;
    const dt = (tr.at(-1).t - tr[0].t) / 1000;
    return dt > 0 ? Math.round(armSpeed((angleOf(a, b) / dt) * dist) * 1000) : 0;
  };
  function outsideHit(e) {
    if (!e || !S.outsideSpec || !S.outsideWalk || !S.pose) return null;
    const { origin: o, dir } = roomRay(e);
    const h = reachOutside(S.outsideSpec, o, dir, S.outsideWalk.ground, { under: underHouse });
    if (!h) return null;
    const first = rayHit(o, dir, { hand: true });
    return first && first.t < h.t - 1e-6 ? null : h; // (a wall between: this house's, another's)
  }
  // what is in this being's hands outside (law/hands.js things: held, by you: two hands)
  const heldAll = () => {
    const h = S.handsNow;
    if (!h?.facts || !h.me) return [];
    return [...h.facts.things].filter(([, t]) => t.at === null && t.by === h.me).map(([id]) => id);
  };
  const heldOutside = () => heldAll().at(-1) ?? null;
  const madeKind = (id) => S.handsNow?.facts?.made?.get(id) ?? null;
  const worldMm = (p) =>
    frameOf(GEOM, S.outsideNow.plot)
      .toWorld(p)
      .map((v) => Math.round(v * 1000));
  const dayNow = () => Math.floor(worldClock(new Date()).getTime() / 86400000) + 719528;
  // E outside: with a hand free, take up a stone, a stick or a thing made, pick a gall, pull at a
  // branch, or gather a handful of the ground (grass, clay; water into a fired cup in the hand); with
  // both hands full (or Shift), set down what was taken last
  function handsE(e, down = false) {
    const h = S.handsNow;
    if (!h?.act) return false;
    const hit = outsideHit(e);
    const all = heldAll();
    const mine = all.length >= 2 || (down && all.length) ? all.at(-1) : null;
    const act = (a) => h.act(a).catch((err) => console.warn('[hands]', err.message));
    if (hit?.kind === 'door') {
      onHouseDoor?.(hit); // (opened or shut: its house's act, told to the world)
      return true;
    }
    if (hit?.kind === 'mailbox' && S.papersNow) {
      const m = S.papersNow;
      const done = () => {
        S.mailN = (S.mailN ?? 0) + 1; // (its flag read again)
        loadOutside();
      };
      if (m.held)
        m.post(hit.key).then(done); // the paper in the hand, posted: theirs now
      else if (hit.key === h.me) m.takeLetter().then(done); // your own: the oldest letter out, into your hand
      return true;
    }
    if (!mine && hit?.kind === 'ground') {
      act({ act: 'gather', at: worldMm(hit.at).slice(0, 2), day: dayNow() });
      return true;
    }
    if (!mine && hit?.kind === 'gall') {
      act({ act: 'pick', tree: hit.id, tip: hit.tip, laid: hit.laid, day: dayNow() });
      return true;
    }
    if (!mine && hit?.kind === 'hive') {
      act({ act: 'gather', tree: hit.id, day: dayNow() });
      return true;
    }
    if (!mine && hit?.kind === 'feather') {
      act({ act: 'take', thing: hit.id, day: dayNow() });
      return true;
    }
    if (!mine && hit?.kind === 'made') {
      act({ act: 'take', thing: hit.id });
      return true;
    }
    if (mine) {
      if (!hit) return false;
      const on = hit.kind === 'ground' ? hit.at : [hit.at[0], hit.at[1], S.outsideWalk.ground(hit.at[0], hit.at[1])];
      h.act({ act: 'put', thing: mine, to: worldMm(on) }).catch((err) => console.warn('[hands]', err.message));
      return true;
    }
    if (!hit || hit.kind === 'ground') return false;
    const a = hit.kind === 'limb' ? { act: 'break', tree: hit.id, branch: hit.branch, day: dayNow() } : { act: 'take', thing: hit.id };
    if (hit.kind === 'limb' && hit.branch === 0) return false; // (a trunk is not pulled off)
    h.act(a).catch((err) => console.warn('[hands]', err.message));
    return true;
  }
  // A click outside: what is in the hands used on what is in front (outside.md Phase 7: the law decides
  // what comes of it, by the matter). A stone or a stick rubbed (dragged) along wood: carving, or rubbing.
  function handsOn(e) {
    const h = S.handsNow;
    const all = heldAll();
    if (!h?.act || !all.length) return false;
    const hit = outsideHit(e);
    const act = (a) => {
      h.act(a).catch((err) => console.warn('[hands]', err.message));
      return true;
    };
    const [a, b] = all;
    const kinds = all.map((id) => madeKind(id)?.kind ?? (id.startsWith('stone:') ? 'stone' : id.startsWith('stick:') ? 'stick' : id.startsWith('feather:') ? 'feather' : null));
    const has = (k) => all[kinds.indexOf(k)] ?? null;
    if (all.length === 2 && ['fibre', 'string'].includes(kinds[0]) && ['fibre', 'string'].includes(kinds[1])) return act({ act: 'twist', a, b });
    if (has('lump') && !hit) return act({ act: 'form', thing: has('lump') });
    if (!hit) return false;
    // a gall pressed into the ground: a seed (law/hands.js plant: dirt takes it, and it is an oak planted today)
    if (has('gall') && hit.kind === 'ground') return act({ act: 'plant', thing: has('gall'), at: worldMm(hit.at).slice(0, 2), day: dayNow() });
    const there = hit.kind === 'made' ? hit.made : null;
    const stone = has('stone'),
      stick = has('stick'),
      cup = has('cup'),
      string = has('string');
    // a stone or a stick rubbed along wood: carving (the stone), rubbing (a stick: fire, or not)
    if ((stone || stick) && (hit.kind === 'stick' || (hit.kind === 'limb' && hit.branch === 0))) {
      // (as fast and as long as the hand rubs: the ray swept along it, over the time it took)
      S.drag = {
        kind: 'carve',
        tool: stone ?? stick,
        rub: !stone,
        hit,
        lo: hit.at,
        hi: hit.at,
        last: [e.clientX, e.clientY],
        dir: 0,
        strokes: 1,
        t0: performance.now(),
        swept: 0,
        ray: roomRay(e).dir,
      };
      return true;
    }
    if (stone && hit.kind === 'stone') {
      const s = S.outsideSpec?.stones.find((x) => x.id === hit.id);
      return act(s?.matter === 'ore' ? { act: 'crush', tool: stone, thing: hit.id } : { act: 'strike', tool: stone, thing: hit.id, speed: handSpeed(hit.t) });
    }
    // a stick under a stone, over the stone nearest it: pushed down, it tips it over that one or it does not
    // (law/making.js pries); it goes over away from the fulcrum
    if (stick && hit.kind === 'stone') {
      const stones = S.outsideSpec?.stones ?? [];
      const load = stones.find((x) => x.id === hit.id);
      const apart = (x) => Math.hypot(x.at[0] - load.at[0], x.at[1] - load.at[1]);
      const over = load && stones.filter((x) => x.id !== load.id).sort((p, q) => apart(p) - apart(q))[0];
      if (over) {
        const d = [load.at[0] - over.at[0], load.at[1] - over.at[1]];
        const len = Math.hypot(...d) || 1;
        const arm = Math.max(len, load.r + over.r) / 2; // (within the arm the law allows)
        const [x, y] = [load.at[0] + (d[0] / len) * arm, load.at[1] + (d[1] / len) * arm];
        return act({ act: 'pry', stick, over: over.id, thing: load.id, to: worldMm([x, y, S.outsideWalk.ground(x, y)]) });
      }
    }
    if (stone && there?.kind === 'gall') return act({ act: 'crush', tool: stone, thing: hit.id });
    if (cup && there?.kind === 'fire') {
      const c = madeKind(cup);
      return act(c.matter === 'pottery' || c.holding?.wax ? { act: 'melt', cup, fire: hit.id } : { act: 'fire', thing: cup, fire: hit.id });
    }
    if (cup && (there?.kind === 'powder' || there?.kind === 'wax')) return act({ act: 'mix', cup, thing: hit.id });
    if (cup && has('wax')) return act({ act: 'mix', cup, thing: has('wax') });
    // a stone along a feather's quill: its tip cut to a nib (law/hands.js carve, by the matter)
    if (stone && hit.kind === 'feather') return act({ act: 'carve', thing: hit.id, tool: stone, from: 0, to: 20, strokes: 1 });
    if (cup && there?.kind === 'cup' && madeKind(cup)?.holding?.molten) return act({ act: 'pour', cup, into: hit.id });
    if (string && there?.kind === 'cup' && there.holding?.waxMolten) return act({ act: 'dip', string, cup: hit.id });
    if (string && hit.kind === 'stone') {
      // bound to the stick lying by it (Shift: loosely)
      const s = (S.outsideSpec?.sticks ?? []).find((x) => Math.hypot(x.at[0] - hit.at[0], x.at[1] - hit.at[1]) < 0.6);
      if (s) return act({ act: 'bind', stick: s.id, stone: hit.id, string, turns: 3, pull: e.shiftKey ? 30 : 300 });
    }
    if (has('axe') && hit.kind === 'limb')
      return act({ act: 'swing', thing: has('axe'), at: hit.id, to: worldMm([hit.at[0], hit.at[1], S.outsideWalk.ground(hit.at[0], hit.at[1])]), speed: handSpeed(hit.t) });
    return false;
  }
  globalThis.__hands = {
    hit: () => outsideHit(S.lastPointer),
    held: heldOutside,
    facts: () => S.handsNow?.facts && { things: [...S.handsNow.facts.things], broken: [...S.handsNow.facts.broken], cuts: [...S.handsNow.facts.cuts] },
    // (for the checks, e2e/hands.mjs, e2e/life.mjs: the stones, the thin limbs, the galls, hives and feathers out there, room m)
    near: () => ({
      stones: S.outsideSpec?.stones ?? [],
      sticks: S.outsideSpec?.sticks ?? [],
      galls: S.outsideSpec?.galls ?? [],
      hives: S.outsideSpec?.hives ?? [],
      nests: S.outsideSpec?.nests ?? [],
      feathers: S.outsideSpec?.feathers ?? [],
      dead: S.outsideSpec?.dead ?? [],
      mailboxes: S.outsideSpec?.mailboxes ?? [],
      trees: (S.outsideSpec?.trees ?? []).map((t) => ({ id: t.id, at: t.at, limbs: t.limbs.filter((l) => l.branch !== 0) })),
    }),
  };
  // the opening under the pointer: 'door' | 'window' | null (E opens it, or shuts it)
  const openingAt = (e) => {
    if (!e || !carrying?.setOpen) return null;
    const { origin: o, dir } = roomRay(e);
    return rayHit(o, dir)?.opening?.kind ?? null;
  };
  useEffect(
    () =>
      heard?.on(({ origin: o, rec, seed }) => {
        const at = (x, y) => pageToRoom([o[0] + x, o[1] + y, 0], origin());
        for (const e of recordSounds(rec, { at, seed, t0: soundNow() - rec.strokes[0].t[0] / 1000 })) hear(e);
      }),
    [heard], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // The room point the pointer is over on the table's plane (the page's), room m.
  const roomPointOf = (e) => {
    const p = pageOf(e);
    return p ? pageToRoom([p.x, p.y, 0], origin()) : null;
  };
  // The paper under the pointer (the nearest the ray meets, lying flat where it rests), and the point on it
  // (its own units): { paper, q } | null.
  const paperAt = (e) => {
    if (!papers?.lying.length || !e) return null;
    const { origin: o, dir } = roomRay(e);
    let best = null;
    for (const l of papers.lying) {
      const z = pageToRoom([0, 0, l.lift], origin())[2];
      const t = Math.abs(dir[2]) > 1e-9 ? (z - o[2]) / dir[2] : -1;
      if (t <= 0 || (best && t >= best.t)) continue;
      const [x, y] = roomToPage([o[0] + dir[0] * t, o[1] + dir[1] * t, z], origin());
      const q = { x: x - l.origin[0], y: y - l.origin[1] };
      if (q.x >= 0 && q.y >= 0 && q.x <= l.size[0] && q.y <= l.size[1]) best = { t, paper: l.paper, q };
    }
    return best && { paper: best.paper, q: best.q };
  };
  // Where the paper in the hand is let go: the point the pointer meets (room m), out of the house on the
  // ground; in it, on what the ray meets first (the table, the floor; off a wall it falls to the floor).
  const letGoAt = (e) => {
    const { origin: o, dir } = roomRay(e);
    const h = rayHit(o, dir, { hand: true });
    if (!h) return roomPointOf(e);
    if (h.kind === 'room') return h.at; // (in this house: anywhere the pointer meets)
    if (h.t > ARM) return null; // (out of the hand's reach)
    if (h.kind === 'ground' || h.kind === 'house' || h.kind === 'opening' || !S.outsideWalk) return h.at; // (off a wall it falls)
    return [h.at[0], h.at[1], S.outsideWalk.ground(h.at[0], h.at[1])]; // (onto a thing out there: on the ground by it)
  };
  // A thing to pick up under the pointer: the nearest whose upright (its foot up h, r round) the ray passes.
  const pickableAt = (e) => {
    if (!carrying?.pickables?.length) return null;
    const { origin: o, dir } = roomRay(e);
    let best = null;
    for (const t of carrying.pickables) {
      const b = [t.at[0] - t.r, t.at[1] - t.r, t.at[2], t.at[0] + t.r, t.at[1] + t.r, t.at[2] + t.h];
      const d = rayBox(o, dir, b);
      if (d !== null && (!best || d < best.d)) best = { d, id: t.id };
    }
    if (!best) return null;
    const wall = rayHit(o, dir);
    return wall && wall.t < best.d ? null : best.id; // something stands in front of it
  };
  // What the bare hand meets under the pointer: a thing (its upright), or the pendulum's bob; and where (room m).
  const touchAt = (e) => {
    if (!carrying) return null;
    const { origin: o, dir } = roomRay(e);
    let best = null;
    for (const t of carrying.pickables ?? []) {
      const d = rayBox(o, dir, [t.at[0] - t.r, t.at[1] - t.r, t.at[2], t.at[0] + t.r, t.at[1] + t.r, t.at[2] + t.h]);
      if (d !== null && (!best || d < best.d)) best = { d };
    }
    const c = carrying.bobAt?.();
    if (c) {
      const r = carrying.bob.r;
      const oc = c.map((v, k) => o[k] - v);
      const b = oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2];
      const disc = b * b - (oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - r * r);
      const d = disc >= 0 ? -b - Math.sqrt(disc) : -1;
      if (d > 0 && (!best || d < best.d)) best = { d };
    }
    if (!best) return null;
    const wall = rayHit(o, dir);
    if (wall && wall.t < best.d) return null;
    return o.map((v, k) => v + dir[k] * best.d);
  };
  // The bare hand where the pointer is, at the height it first met (its middle there): its front at the
  // pointer, its middle a palm's half width before it, the way the eye looks (room m).
  const handAt = (e, z) => {
    const { origin: o, dir } = roomRay(e);
    if (Math.abs(dir[2]) < 1e-9) return null;
    const t = (z - o[2]) / dir[2];
    if (t <= 0) return null;
    const flat = Math.hypot(dir[0], dir[1]) || 1;
    return [o[0] + dir[0] * t - (dir[0] / flat) * HAND.r, o[1] + dir[1] * t - (dir[1] / flat) * HAND.r, z - HAND.h / 2];
  };
  const onPointerDown = (e) => {
    startSound(); // (a gesture: the page may play sound from now on)
    const c = canvasRef.current;
    c.setPointerCapture(e.pointerId);
    c.focus({ preventScroll: true }); // (the keys: fly, H)
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    S.press = { x: e.clientX, y: e.clientY };
    if (carrying && (e.button === 0 || e.pointerType !== 'mouse')) {
      // the hand: holding something, a click sets it down (the stamper, over a paper, presses
      // into it instead: rooms.md §5); else a click on a thing picks it up
      if (carrying.holding) {
        if (carrying.kind === 'stamper' && tableWriter) {
          const p = pageOf(e);
          const on = p && tableWriter.sheets.find((t) => inSheet(t, p));
          if (on) {
            tableWriter.press?.(on.sheet, { x: p.x - on.origin[0], y: p.y - on.origin[1] }, e.nativeEvent);
            return;
          }
        }
        const at = roomPointOf(e);
        if (at && carrying.down(at)) return;
      } else {
        const id = pickableAt(e);
        if (id === 'jar' && penMode && carrying.penDips) {
          carrying.dip(); // the dip pen's nib into the jar
          dipHeard();
          return;
        }
        const on = id === null && !penMode && !papers?.held ? paperAt(e) : null;
        if (on && papers.touch(on.paper, on.q)) return; // (a bare hand on a seal of yours: its wax cracked)
        // the bare hand (Tabor, 2026-10-25: your own matter): pressed on a thing, it pushes it as it goes (a
        // drag); things are taken up with E
        const met = !penMode && world && carrying.reach ? touchAt(e) : null;
        if (met) {
          S.drag = { kind: 'hand', z: met[2] };
          const at = handAt(e, met[2]);
          if (at) carrying.reach(at);
          return;
        }
        if (id !== null && !penMode && !world) {
          if (carrying.pick(id) === 'pen') setHand(false); // a pen taken up: it is the pen in the hand
          return;
        }
      }
    }
    if (tool === 'light' || e.altKey) {
      S.drag = { kind: 'light' };
      S.override = lightFromPointer(e);
      S.back = null;
      schedule();
      return;
    }
    if (mode !== '3d') return;
    if (tool === 'cut') {
      const p = pageOf(e);
      if (p) S.drag = { kind: 'cut', a: [p.x, p.y], b: [p.x, p.y] };
      return;
    }
    // a double tap flies to the point
    const now = performance.now();
    S.taps = S.taps.filter((t) => now - t < 320);
    S.taps.push(now);
    if (S.taps.length >= 2 && e.pointerType !== 'mouse') {
      const p = pageOf(e);
      if (p) S.anim = { from: S.cam, to: flyTo(S.cam, [p.x, p.y]), t0: now, ms: 500 };
      if (p) S.cam = S.anim.to;
      S.taps = [];
      schedule();
      return;
    }
    if (S.pointers.size >= 2) {
      // two fingers: orbit and pinch
      if (S.drag?.kind === 'write') writer?.cancel();
      if (S.drag?.kind === 'table') tableWriter?.cancel();
      const [a, b] = [...S.pointers.values()];
      S.drag = { kind: 'two', mid: [(a.x + b.x) / 2, (a.y + b.y) / 2], dist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    const leftish = e.button === 0 || e.pointerType === 'pen' || e.pointerType === 'touch';
    if (S.pose && leftish && handsOn(e)) return; // (outside: what is in the hands, on what is in front)
    if (S.pose) {
      // Look: the pen (with a surface to write on) lays ink on what it points at; else drag turns the head
      const at = wallWriter && penMode && leftish && !e.shiftKey && !S.glide ? surfaceAt(e) : null;
      if (at) {
        S.drag = { kind: 'wall', surface: at.surface, last: at.p };
        wallWriter.down(at.surface, at.p, e.nativeEvent, e.pointerType);
        penHeard('on', wallWriter, at.p, surfaceNib(at.surface, at.p), e.nativeEvent);
        return;
      }
      S.drag = { kind: 'turn', x: e.clientX, y: e.clientY };
      return;
    }
    if (tableWriter && penMode && leftish && !e.shiftKey && canWrite(S.shown ?? S.cam)) {
      // the pen on a paper lying on the table: it writes there, in that paper's own units
      const at = pageOf(e);
      const on = at && tableWriter.sheets.find((t) => inSheet(t, at));
      if (on) {
        const q = { x: at.x - on.origin[0], y: at.y - on.origin[1] };
        if (tableWriter.down(on.sheet, q, e.nativeEvent, e.pointerType) !== false) {
          S.drag = { kind: 'table', on, last: q };
          penAt(at, e.nativeEvent);
          return;
        }
      }
    }
    if (writer && penMode && leftish && !e.shiftKey) {
      const can = canWrite(S.shown ?? S.cam);
      const at = can ? pageOf(e) : null;
      if (onPage(at)) {
        writer.penDown?.(S.shown ?? S.cam);
        S.drag = { kind: 'write', last: at };
        writer.down(at, e.nativeEvent, e.pointerType);
        penAt(at, e.nativeEvent);
        return;
      }
      if (can) {
        // the pen down on the desk: it writes on the table (its own wood: one-matter.md), and carries
        // on onto the page where it reaches it; with no table to write on, from where it reaches the page
        const desk = wallWriter ? surfaceAt(e, 'table') : null;
        if (desk) {
          S.drag = { kind: 'wall', surface: 'table', last: desk.p, type: e.pointerType };
          wallWriter.down('table', desk.p, e.nativeEvent, e.pointerType);
          return;
        }
        S.drag = { kind: 'pen-off', type: e.pointerType };
        return;
      }
    }
    if (fixed) return; // the eye cannot look around yet (the lobby): only the pen moves
    // the hand: drag turns, right-drag or shift slides; the pen: right-drag turns, shift slides
    const slide = e.shiftKey || e.button === 1 || (!penMode && e.button === 2);
    S.drag = { kind: slide ? 'pan' : 'orbit', x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e) => {
    const p0 = S.pointers.get(e.pointerId);
    if (p0) S.pointers.set(e.pointerId, { ...p0, x: e.clientX, y: e.clientY });
    S.lastPointer = { clientX: e.clientX, clientY: e.clientY }; // (what E reaches for)
    S.trail = [...(S.trail ?? []).filter((p) => e.timeStamp - p.t < TRAIL_MS), { t: e.timeStamp, x: e.clientX, y: e.clientY }]; // (how fast the hand goes)
    if (S.drag?.kind === 'hand') {
      const at = handAt(e, S.drag.z);
      if (at) carrying.reach(at);
      schedule();
      return;
    }
    if (papers?.held && !S.drag) {
      // the paper in the hand follows it, held by its middle, a hand's height over the table's plane
      const p = pageOf(e);
      if (p) {
        S.view?.liftSheet(papers.held.sheet, [p.x - papers.held.size[0] / 2, p.y - papers.held.size[1] / 2], HAND_PX);
        schedule();
      }
    }
    if (carrying?.holding && !S.drag) {
      // the thing in the hand: E held, the mouse tilts it; else it follows the pointer
      if (S.tilting && S.eDown && e.clientX !== S.handX) S.eDown.tilted = true;
      if (S.tilting) carrying.tiltBy((e.clientX - (S.handX ?? e.clientX)) * 0.4);
      else {
        const at = roomPointOf(e);
        if (at) carrying.hover(at);
      }
      S.handX = e.clientX;
      schedule();
    }
    const d = S.drag;
    if (!d) return;
    if (d.kind === 'light') {
      S.override = lightFromPointer(e);
      schedule();
    } else if (d.kind === 'cut') {
      const p = pageOf(e);
      if (p) d.b = [p.x, p.y];
    } else if (d.kind === 'carve') {
      // each pass along it a stroke: the drag turned back is the next
      const dx = e.clientX - d.last[0],
        dy = e.clientY - d.last[1];
      const ray = roomRay(e).dir;
      d.swept += angleOf(d.ray, ray);
      d.ray = ray;
      if (Math.hypot(dx, dy) > 3) {
        const dir = Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : Math.sign(dy) * 2;
        if (d.dir && dir !== d.dir) d.strokes++;
        d.dir = dir;
        d.last = [e.clientX, e.clientY];
        const hit = outsideHit(e);
        if (hit && hit.id === d.hit.id) {
          const z = (p) => (d.hit.kind === 'stick' ? p[0] : p[2]);
          if (z(hit.at) < z(d.lo)) d.lo = hit.at;
          if (z(hit.at) > z(d.hi)) d.hi = hit.at;
        }
      }
    } else if (d.kind === 'turn' && S.pose) {
      S.pose = roomCamera.turn(S.pose, (e.clientX - d.x) * TURN, -(e.clientY - d.y) * TURN);
      d.x = e.clientX;
      d.y = e.clientY;
      S.moveUntil = performance.now() + STILL_MS;
      schedule();
    } else if (d.kind === 'wall') {
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of evs.length ? evs : [e.nativeEvent]) {
        const onto = d.surface === 'table' && writer && !S.pose ? pageOf(ev) : null;
        if (onPage(onto)) {
          // across the table onto the page: the line goes on, in the paper now
          wallWriter.up(d.last, ev);
          penHeard('up', wallWriter, d.last, surfaceNib(d.surface, d.last), ev);
          writer.penDown?.(S.shown ?? S.cam);
          S.drag = { kind: 'write', last: onto, type: d.type };
          writer.down(onto, ev, d.type);
          penAt(onto, ev);
          break;
        }
        // across the table onto a paper lying on it: no edge between them, the line goes on in the paper
        const paper = d.surface === 'table' ? paperUnder(ev) : null;
        if (paper && tableWriter.down(paper.on.sheet, paper.q, ev, d.type ?? e.pointerType) !== false) {
          wallWriter.up(d.last, ev);
          penHeard('up', wallWriter, d.last, surfaceNib(d.surface, d.last), ev);
          S.drag = { kind: 'table', on: paper.on, last: paper.q, type: d.type };
          penAt(paper.at, ev);
          break;
        }
        const at = surfaceAt(ev, d.surface);
        if (!at) {
          // off the surface (or too grazing): the stroke ends there
          wallWriter.up(d.last, ev);
          penHeard('up', wallWriter, d.last, surfaceNib(d.surface, d.last), ev);
          S.drag = null;
          break;
        }
        wallWriter.move(at.p, ev);
        penHeard('on', wallWriter, at.p, surfaceNib(d.surface, at.p), ev);
        d.last = at.p;
      }
    } else if (d.kind === 'table') {
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of evs.length ? evs : [e.nativeEvent]) {
        const p = pageOf(ev);
        if (!inSheet(d.on, p)) {
          // off the paper's edge: no edge between it and what it lies on: the line goes on there, on
          // another paper, or on the table's own wood (its own chain: one-matter.md Phase 3)
          through(d, ev, null);
          tableWriter.up(d.last, ev);
          penAt({ x: d.last.x + d.on.origin[0], y: d.last.y + d.on.origin[1] }, ev, false);
          const next = paperUnder(ev);
          if (next && tableWriter.down(next.on.sheet, next.q, ev, d.type ?? e.pointerType) !== false) {
            S.drag = { kind: 'table', on: next.on, last: next.q, type: d.type };
            penAt(next.at, ev);
            break;
          }
          const desk = wallWriter ? surfaceAt(ev, 'table') : null;
          S.drag = desk ? { kind: 'wall', surface: 'table', last: desk.p, type: d.type ?? e.pointerType } : null;
          if (desk) {
            wallWriter.down('table', desk.p, ev, d.type ?? e.pointerType);
            penHeard('on', wallWriter, desk.p, surfaceNib('table', desk.p), ev);
          }
          break;
        }
        d.last = { x: p.x - d.on.origin[0], y: p.y - d.on.origin[1] };
        tableWriter.move(d.last, ev);
        through(d, ev, d.last);
        penAt(p, ev);
      }
    } else if (d.kind === 'pen-off') {
      const p = pageOf(e);
      if (onPage(p)) {
        writer.penDown?.(S.shown ?? S.cam);
        S.drag = { kind: 'write', last: p };
        writer.down(p, e.nativeEvent, d.type);
      }
    } else if (d.kind === 'write') {
      const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
      for (const ev of evs.length ? evs : [e.nativeEvent]) {
        const p = pageOf(ev);
        if (!onPage(p)) {
          // off the page's edge: the line goes on onto the table, where the wood drinks it by its own
          // row (one-matter.md Phase 3); with no table to write on, the stroke ends at the edge
          writer.up(d.last, ev);
          penAt(d.last, ev, false);
          const desk = wallWriter ? surfaceAt(ev, 'table') : null;
          S.drag = desk ? { kind: 'wall', surface: 'table', last: desk.p, type: d.type ?? e.pointerType } : null;
          if (desk) {
            wallWriter.down('table', desk.p, ev, d.type ?? e.pointerType);
            penHeard('on', wallWriter, desk.p, surfaceNib('table', desk.p), ev);
          }
          break;
        }
        writer.move(p, ev);
        d.last = p;
        penAt(p, ev);
      }
    } else if (d.kind === 'two' && S.pointers.size >= 2) {
      const [a, b] = [...S.pointers.values()];
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      S.cam = zoomBy(orbit(S.cam, (mid[0] - d.mid[0]) * 0.3, (mid[1] - d.mid[1]) * 0.2), d.dist / Math.max(1, dist));
      d.mid = mid;
      d.dist = dist;
      schedule();
    } else if (d.kind === 'orbit') {
      S.cam = orbit(S.cam, (e.clientX - d.x) * 0.3, (e.clientY - d.y) * 0.25);
      d.x = e.clientX;
      d.y = e.clientY;
      schedule();
    } else if (d.kind === 'pan') {
      S.cam = panBy(S.cam, e.clientX - d.x, e.clientY - d.y, canvasRef.current.getBoundingClientRect().width);
      d.x = e.clientX;
      d.y = e.clientY;
      schedule();
    }
  };

  // A click (no drag) on a book on the shelf pulls it down.
  const pick = (e) => {
    if (!S.press || Math.hypot(e.clientX - S.press.x, e.clientY - S.press.y) > 4) return false;
    if (!shelf?.books?.length) return false;
    const { origin: o, dir } = roomRay(e);
    const { books } = shelfLayout(GEOM, shelf.books.length);
    let best = null;
    books.forEach((b, k) => {
      const t = rayBox(o, dir, b);
      if (t !== null && (!best || t < best.t)) best = { t, k };
    });
    if (!best) return false;
    const wall = rayHit(o, dir);
    if (wall && wall.t < best.t) return false; // something stands in front of it
    shelf.onOpen?.(shelf.books[best.k].id);
    return true;
  };
  const onPointerUp = (e) => {
    S.pointers.delete(e.pointerId);
    if (S.drag?.kind !== 'write' && S.drag?.kind !== 'wall' && S.drag?.kind !== 'table' && pick(e)) {
      S.drag = null;
      return;
    }
    const d = S.drag;
    if (!d) return;
    if (d.kind === 'two' && S.pointers.size) return;
    S.drag = null;
    if (d.kind === 'orbit' || d.kind === 'pan' || d.kind === 'two') {
      S.moveUntil = performance.now() + STILL_MS;
      schedule();
    }
    if (d.kind === 'hand') carrying.reach(null); // (the hand drawn back)
    if (d.kind === 'light') {
      S.back = { from: S.override, t0: performance.now() }; // released: back to the clock
      S.override = null;
      schedule();
    } else if (d.kind === 'cut' && cutSide) {
      const len = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
      const across = len > 2 ? withinPage(d.a, d.b) : null; // the side view is of the paper, not the desk
      if (across) {
        cutSide(...across)
          .then((image) => {
            S.view?.setCut({ line: [d.a, d.b], image });
            schedule();
          })
          .catch((err) => console.warn('[cut]', err.message)); // (the scene stays whole)
      }
    } else if (d.kind === 'table') {
      through(d, e.nativeEvent, null);
      penAt({ x: d.last.x + d.on.origin[0], y: d.last.y + d.on.origin[1] }, null, false); // lifted
      if (e.type === 'pointercancel') tableWriter.cancel();
      else {
        const p = pageOf(e);
        tableWriter.up(inSheet(d.on, p) ? { x: p.x - d.on.origin[0], y: p.y - d.on.origin[1] } : d.last, e.nativeEvent);
      }
    } else if (d.kind === 'carve') {
      const h = S.handsNow;
      const t = d.hit;
      let a;
      if (d.rub) {
        // a stick rubbed along wood: its strokes' work heating the track (fire, or not: law/making.js)
        const ms = Math.max(1, Math.round(performance.now() - d.t0));
        a = { act: 'rub', tool: d.tool, thing: t.id, strokes: d.strokes, at: worldMm(t.at), speed: Math.round(armSpeed((d.swept / (ms / 1000)) * (t.t ?? 1)) * 1000), ms };
        if (t.kind !== 'stick') a = null; // (rubbed on a standing trunk: nothing to light it from yet)
      } else if (t.kind === 'stick') {
        const s = S.outsideSpec?.sticks.find((x) => x.id === t.id);
        const mm = (p) => Math.max(0, Math.round((p[0] - (s?.at[0] ?? p[0])) * 1000)); // (along it, from its foot)
        a = { act: 'carve', thing: t.id, tool: d.tool, from: mm(d.lo), to: Math.max(mm(d.lo), mm(d.hi)), strokes: d.strokes };
      } else {
        const foot = S.outsideSpec?.trees.find((x) => x.id === t.id)?.at ?? t.at;
        const up = (p) => Math.max(0, Math.round((p[2] - foot[2]) * 1000));
        const az = Math.round(((Math.atan2(t.at[0] - foot[0], t.at[1] - foot[1]) * 180) / Math.PI + 360) % 360) % 360;
        a = { act: 'carve', tree: t.id, tool: d.tool, from: up(d.lo), to: Math.max(up(d.lo), up(d.hi)), az, strokes: d.strokes };
      }
      if (a) h?.act(a).catch((err) => console.warn('[hands]', err.message));
    } else if (d.kind === 'wall') {
      penHeard('up', wallWriter, d.last, surfaceNib(d.surface, d.last), e.nativeEvent);
      if (e.type === 'pointercancel') wallWriter.cancel();
      else wallWriter.up(surfaceAt(e, d.surface)?.p ?? d.last, e.nativeEvent);
    } else if (d.kind === 'write') {
      penAt(d.last, null, false); // lifted
      if (e.type === 'pointercancel') writer.cancel();
      else {
        const p = pageOf(e);
        writer.up(onPage(p) ? p : d.last, e.nativeEvent);
      }
    }
  };

  const onWheel = (e) => {
    if (mode !== '3d') return;
    e.preventDefault();
    if (world && S.pose) {
      // the eye's zoom (outside.md §3.4): in, toward the point under the cursor; back, toward the head.
      // Only the eye moves: the body and head stay, and nothing of it is sent
      let next = WK.zoomOut(S.zoom, e.deltaY, S.pose.size ?? 1);
      if (e.deltaY < 0) {
        const { origin: o, dir } = roomRay(e);
        const h = rayHit(o, dir); // (to whatever is there: this house, another's, out of doors)
        next = h && Number.isFinite(h.t) ? WK.zoomIn(S.zoom, dir, h.t, e.deltaY) : S.zoom;
        // never into what the eye is looking at (the page's own heights, as drawn, included)
        for (let n = 0; n < 8 && clearOf(WK.eyeOf(headNow(), next).pos) < roomCamera.GAP; n++) next = next.map((v, k) => (v + S.zoom[k]) / 2);
      }
      S.zoom = next;
      S.moveUntil = performance.now() + STILL_MS;
      schedule();
      return;
    }
    if (S.pose) {
      // Look: the wheel carries the head along its gaze, a share of the way to what is nearest
      S.pose = roomCamera.fly(GEOM, S.pose, { forward: e.deltaY > 0 ? -1 : 1 }, 0.12);
      S.moveUntil = performance.now() + STILL_MS;
      schedule();
      return;
    }
    if (fixed) return;
    const p = pageOf(e);
    S.cam = zoomBy(S.cam, e.deltaY > 0 ? 1.12 : 1 / 1.12, p ? [p.x, p.y] : null);
    S.moveUntil = performance.now() + STILL_MS;
    schedule();
  };
  const onDoubleClick = (e) => {
    if (mode !== '3d') return;
    const p = pageOf(e);
    if (!p) return;
    S.anim = { from: S.cam, to: flyTo(S.cam, [p.x, p.y]), t0: performance.now(), ms: 500 };
    S.cam = S.anim.to;
    schedule();
  };
  // smaller or larger, down to a bead of ink (rooms.md §4): the feet stay where they are
  const resize = (k) => {
    const was = S.pose.size ?? 1;
    const size = Math.max(SIZE_MIN, Math.min(1, was * (k === ']' ? 2 : 0.5)));
    const feet = S.pose.pos[2] - roomCamera.EYE * was;
    S.pose = { ...S.pose, size, pos: S.pose.mode === 'walk' ? [S.pose.pos[0], S.pose.pos[1], feet + roomCamera.EYE * size] : S.pose.pos };
    setSize(size);
    S.keyT = performance.now();
    schedule();
  };
  // The world's keys (scene/keys.js): the keys place the body; E is for what is in front of you.
  const worldKeyDown = (e) => {
    const k = e.key.toLowerCase();
    const now = performance.now();
    if (k === 'e') {
      e.preventDefault();
      if (e.repeat) return;
      if (carrying?.holding) {
        S.tilting = carrying.kind === 'candle'; // held, the mouse tilts a candle in the hand (rooms.md §3b); let go untilted, it is set down
        S.eDown = { t: now, tilted: false };
        return;
      }
      const id = S.lastPointer ? pickableAt(S.lastPointer) : null; // the thing under the pointer, picked up
      if (id === 'jar' && penMode && carrying.penDips) {
        carrying.dip(); // (the pen in the hand into the jar: a carved stick brought in too)
        return dipHeard();
      }
      if (handsE(S.lastPointer, e.shiftKey)) return; // (outside: the hands, outside.md Phase 5; a mailbox)
      if (papers?.held && !openingAt(S.lastPointer)) {
        // the paper in the hand let go where the pointer is: it falls flat until it rests (law/paper.js);
        // (a door or a window under the pointer: the other hand opens it, the paper still held)
        const at = S.lastPointer ? letGoAt(S.lastPointer) : null;
        if (at) papers.put(at);
        return;
      }
      if (id !== null) {
        if (carrying.pick(id) === 'pen') setHand(false);
        return;
      }
      const on = papers && !papers.held ? paperAt(S.lastPointer) : null; // a paper under the pointer, taken up (it is matter: anyone's hand may)
      if (on) papers.take(on.paper);
      else if (openingAt(S.lastPointer) === 'door') carrying.setOpen('door', !carrying.opens.door);
      else if (openingAt(S.lastPointer) === 'window') {
        // the window, round: its sash opened; shut, and its shutters shut; the shutters opened again
        const { window: sash, shutters } = carrying.opens;
        if (!shutters) carrying.setOpen('shutters', true);
        else if (!sash) carrying.setOpen('window', true);
        else {
          carrying.setOpen('window', false);
          carrying.setOpen('shutters', false);
        }
      } else if (S.pose && !S.glide && WK.atChair(GEOM, S.pose)) look(false); // at the chair: sit
      return;
    }
    if (k === 'h' && canPen) {
      setHand(!hand); // the pen into the hand, or set down
      return;
    }
    if (k === 'b' && !e.repeat && papers?.blow && S.lastPointer) {
      // a breath (one-matter.md Phase 4: loose matter is blown): at the paper under the pointer, the way the eye
      // looks along it, from as far as the head is
      const on = paperAt(S.lastPointer);
      const eye = eyeNow()?.pos;
      if (on && eye) {
        const { forward } = roomCamera.look(S.pose ?? poseOfCam(S.shown ?? S.cam));
        const meet = roomPointOf(S.lastPointer);
        const dist = meet ? Math.hypot(...meet.map((v, k2) => v - eye[k2])) * 1000 : 300;
        papers.blow(on.paper, on.q, (Math.atan2(-forward[1], forward[0]) * 180) / Math.PI, dist);
      }
      return;
    }
    if ((k === 'r' || k === 'g') && !e.repeat) {
      // rain, or wind, called up for a while (this viewer's own: world.md, as the light is dragged)
      S.asked = ask(S.asked, k === 'r' ? 'rain' : 'wind', worldClock(new Date()).getTime() / 1000);
      S.weatherTick?.();
      return;
    }
    if (S.pose && (k === '[' || k === ']')) return resize(k);
    if (k === 'q' || k === 'z') {
      // the hand down or up (what it holds, rooms.md §3b): held, it goes on
      if (!S.keys.size) S.keyT = now;
      S.keys.add(k);
      S.liftT = now;
      schedule();
      return;
    }
    if (!(WK.isMoveKey(k) || k === ' ' || k === 'shift')) return;
    e.preventDefault();
    if (!S.pose) {
      if (k === 'shift') return;
      look(true); // up from the chair
    }
    if (WK.isMoveKey(k)) S.zoom = [0, 0, 0]; // walking, attention comes back to the head
    if (k === ' ' && !e.repeat) {
      const press = WK.spacePress(S.spaceAt, now);
      S.spaceAt = press.at;
      if (press.double) {
        S.pose = WK.toggleFly(S.pose);
        setWalking(S.pose.mode === 'walk');
      } else if (S.pose.mode === 'walk') S.pose = WK.jump(GEOM, S.pose, groundNow());
    }
    if (!S.keys.size) S.keyT = now;
    S.keys.add(k);
    schedule();
  };
  const worldKeyUp = (e) => {
    const k = e.key.toLowerCase();
    S.keys.delete(k);
    if (k !== 'e') return schedule(); // (a crouch let go: stand)
    S.tilting = false;
    const tap = S.eDown && !S.eDown.tilted;
    S.eDown = null;
    const at = tap && carrying?.holding && S.lastPointer ? roomPointOf(S.lastPointer) : null;
    if (at) carrying.down(at); // set down where the pointer is, falling onto what is under it
  };

  const onKeyDown = (e) => {
    startSound(); // (a gesture: the page may play sound from now on)
    if (mode !== '3d') return;
    if (world) return worldKeyDown(e);
    const k = e.key.toLowerCase();
    if (k === 'e' && carrying?.holding) {
      // E held: the mouse tilts what the hand holds (rooms.md §3b), and nothing else moves
      e.preventDefault();
      S.tilting = true;
      return;
    }
    if (k === 'l' && !fixed) {
      look(!S.pose);
      return;
    }
    if (S.pose) {
      if (k === 'f') {
        // walk or fly (rooms.md §4): walking, everything falls until it rests
        S.pose = { ...S.pose, mode: S.pose.mode === 'walk' ? 'fly' : 'walk', vz: 0 };
        S.keyT = performance.now();
        setWalking(S.pose.mode === 'walk');
        schedule();
        return;
      }
      if (k === '[' || k === ']') return resize(k);
      if (!FLY_KEYS[k]) return;
      e.preventDefault();
      if (!S.keys.size) S.keyT = performance.now();
      S.keys.add(k);
      schedule();
      return;
    }
    if (fixed) return;
    if (k === 'h' && canPen) {
      setHand(!hand);
      return;
    }
    const step = Math.max(0.01, S.cam.dist * 0.04); // the speed scales with the distance
    const moves = {
      w: [step, 0, 0],
      arrowup: [step, 0, 0],
      s: [-step, 0, 0],
      arrowdown: [-step, 0, 0],
      a: [0, -step, 0],
      arrowleft: [0, -step, 0],
      d: [0, step, 0],
      arrowright: [0, step, 0],
      q: [0, 0, 0.08],
      e: [0, 0, -0.08],
    };
    if (!moves[k]) return;
    e.preventDefault();
    S.cam = fly(S.cam, ...moves[k]);
    S.moveUntil = performance.now() + STILL_MS;
    schedule();
  };

  const onKeyUp = (e) => {
    if (world) return worldKeyUp(e);
    S.keys.delete(e.key.toLowerCase());
    if (e.key.toLowerCase() === 'e') S.tilting = false;
  };

  // wheel listeners must not be passive to stop the page scrolling
  useEffect(() => {
    const c = canvasRef.current;
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  });

  // the moments, banded: one sheet's ({ box, at }) or several ([{ id, box, at }])
  async function showBands() {
    const got = await moments();
    for (const s of sheets) S.view?.setBands(s.id, null);
    let dark = 0,
      timed = 0;
    for (const m of got == null ? [] : Array.isArray(got) ? got : [{ ...got, id: sheets[0].id }]) {
      const bands = new Uint8Array(m.at.length);
      for (let i = 0; i < bands.length; i++) {
        bands[i] = m.at[i] < 0 ? 0 : Math.floor(m.at[i] / BAND_MS) % 2;
        dark += bands[i];
        if (m.at[i] >= 0) timed++;
      }
      S.view?.setBands(m.id, bands, m.box);
    }
    setBanded([dark, timed]);
    schedule();
  }
  async function toggleBands() {
    if (bandsOn) {
      for (const s of sheets) S.view?.setBands(s.id, null);
      setBandsOn(false);
      schedule();
      return;
    }
    await showBands();
    setBandsOn(true);
  }
  useEffect(() => {
    if (bandsOn) showBands();
  }, [momentsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // back to the writing view: a glide
  function toSeat() {
    if (S.pose) {
      look(false);
      return;
    }
    S.anim = { from: S.shown ?? S.cam, to: S.home, t0: performance.now(), ms: 600 };
    S.cam = S.home;
    schedule();
  }
  // the relief, here and remembered (a convenience only)
  useEffect(() => {
    try {
      localStorage.setItem(RELIEF_KEY, String(relief));
    } catch {
      // private mode: not remembered
    }
    if (!S.view) return;
    S.view.setRelief(relief);
    schedule();
  }, [relief, ready]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!S.view) return;
    S.view.setCrisp(crisp);
    schedule();
  }, [crisp, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  const interactive = mode === '3d' || tool === 'light';
  const wrapTools = (el) => (toolsHost ? createPortal(el, toolsHost) : el);
  return (
    <div
      ref={wrapRef}
      className={`scene-view ${mode} ${className}`}
      style={style}
      data-banded={bandsOn ? banded[0] : undefined}
      data-timed={bandsOn ? banded[1] : undefined}
      data-gpu={ready ?? undefined}
    >
      <canvas
        ref={canvasRef}
        className="scene-canvas"
        tabIndex={mode === '3d' ? 0 : -1}
        style={{ pointerEvents: interactive ? 'auto' : 'none', touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={() => S.keys.clear()}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={
          world
            ? 'The world: W A S D to walk, Space to jump, the mouse to turn your head, scroll to look closer, E for what is in front of you'
            : mode === '3d'
              ? penMode
                ? 'The page in 3D, the pen: drag to write, right-drag to turn, wheel to come closer, H for the hand'
                : 'The page in 3D: drag to turn it, right-drag to slide, wheel to come closer, double-click to fly to a spot, keys to fly'
              : 'The page, lit'
        }
      />
      {steep && penMode && <p className="scene-hint">Tilt up to write: below {MIN_WRITE_EL}° a pixel covers too much page.</p>}
      {world && !steep && (
        <p className="scene-hint quiet">
          {looking
            ? `W A S D ${walking ? 'walk' : 'fly'} · Space ${walking ? 'jump, twice to fly' : 'rise, twice to fall'} · Shift ${walking ? 'crouch' : 'lower'} · drag to turn your head · scroll to look closer · E takes up, gathers, picks, pulls at a branch, opens the window and the door, sits at the chair; Shift+E sets down; a click uses what is in your hands on what is in front · R rain, G wind for a while · [ ] size${size < 1 ? ` (${size >= 0.01 ? size.toFixed(2) : size.toExponential(0)})` : ''}`
            : `${penMode ? 'The pen: drag to write · ' : ''}W A S D to stand up · scroll to look closer · E picks up and sets down${canPen ? ` · H ${penMode ? 'sets the pen down' : 'for the pen'}` : ''}`}
        </p>
      )}
      {!world && !fixed && penMode && !steep && mode === '3d' && (
        <p className="scene-hint quiet">
          {(writer || tableWriter) && !looking
            ? `The pen: drag to write${writer ? '' : ' on a paper'} · right-drag to turn · H for the hand`
            : looking
              ? `The pen: write on a wall, the floor, the ceiling · drag the room to turn your head · F to ${walking ? 'fly' : 'walk'} · [ ] size${size < 1 ? ` (${size >= 0.01 ? size.toFixed(2) : size.toExponential(0)})` : ''} · L to sit`
              : 'L to look around and write on the walls · H for the hand'}
        </p>
      )}
      {tools &&
        !world &&
        wrapTools(
          <div className={`scene-tools${toolsHost ? ' hosted' : ''}`} role="group" aria-label="View">
            {canPen && mode === '3d' && (
              <button type="button" aria-pressed={!hand} onClick={() => setHand(!hand)} title="The pen writes (right-drag turns); the hand turns and slides the page (H)">
                {hand ? 'Hand' : 'Pen'}
              </button>
            )}
            {mode === '3d' && !fixed && (
              <button type="button" aria-pressed={looking} onClick={() => look(!looking)} title="Look around the room: drag to turn your head, W A S D Q E to fly, the pen writes on the walls (L)">
                Look
              </button>
            )}
            {mode === '3d' && !fixed && (
              <button type="button" onClick={toSeat} title="Back to the writing view">
                Seat
              </button>
            )}
            <label className="scene-relief" title="How much taller than true the ink and paper are drawn (the scene only)">
              Relief
              <input type="range" min={0} max={100} value={posFrom(relief)} onChange={(e) => setRelief(reliefFrom(Number(e.target.value)))} aria-label={`Relief ${relief}×`} />
            </label>
            <button type="button" aria-pressed={crisp} onClick={() => setCrisp(!crisp)} title="Close up: each cell crisp, or smooth between them">
              Crisp
            </button>
            <button type="button" aria-pressed={tool === 'light'} onClick={() => setTool(tool === 'light' ? null : 'light')} title="Drag to move the light; let go and it returns to the time of day">
              Light
            </button>
            {mode === '3d' && cutSide && (
              <button
                type="button"
                aria-pressed={tool === 'cut'}
                onClick={() => {
                  setTool(tool === 'cut' ? null : 'cut');
                  if (tool === 'cut') {
                    S.view?.setCut(null);
                    schedule();
                  }
                }}
                title="Drag a line across the writing to cut through the paper"
              >
                Cut
              </button>
            )}
            {moments && (
              <button type="button" aria-pressed={bandsOn} onClick={toggleBands} title="Band the ink by when it went down, like tree rings">
                Moments
              </button>
            )}
            {onFlat && (
              <button type="button" onClick={onFlat} title="The flat look: the record's own image">
                Flat
              </button>
            )}
          </div>,
        )}
    </div>
  );
});

export default SceneView;
