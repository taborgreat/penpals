// What a being does to a room's things (rooms.md §3b, matter-fixes.md §2): lights a
// candle or puts it out, picks a thing up or sets it down, tilts the candle in its hand.
// Each act is sealed by the being's key and stamped by the room (backend
// store/rooms.js); the room's chain holds them, and the law regrows the candles and
// everything they let fall from them alone (law/wax.js).
//
//   act    { v: 2, kind: 'room', room: <owner's key>, by: <key>, k, act, thing, ... }
//            act 'light' | 'out'   thing: a candle
//            act 'place'           thing, to: [x, y, z] (mm, room: where it rests) | null (held: in by's hand)
//            act 'tilt'            thing: the candle in by's hand, pos: [x, y, z] (mm: its foot), deg (0..90, toward +x)
//            act 'open' | 'shut'   thing: the window (its sash: world.md Phase 3, what comes in through it),
//                                  its shutters, or the door (outside.md Phase 4: shut, each is a wall)
//            act 'set'             thing: a pen, set: its settings (its facts: one-world.md, the panel for the pen
//                                  in hand): what its nib is set to, its flow and spatter, its ink, and whether it
//                                  is a dip pen (its line fading until it is dipped in the jar: rooms.md §3c)
//   stamped line  { n, at (ISO: the stamper's clock), act, seal }
// k is the being's own count of its acts in this room: no act is stamped twice.

import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { T, jcs, fromB64url, b64url, utf8, concat } from './tags.js';
import { verify } from './keys.js';
import { MAX_RATE, STEP_M } from './being.js';
import { sunAt } from './sun.js';

// The pens on the table (rooms.md §3c; one-world.md: which pen you pick up is the nib you write
// with): a plain pen, a flex nib and a broad nib, each its own matter with its own settings.
export const PENS = ['pen', 'pen-flex', 'pen-broad'];
export const NIB_OF = Object.freeze({ pen: 'pen', 'pen-flex': 'flex', 'pen-broad': 'broad' });
export const CANDLES = ['candle-0', 'candle-1'];
export const OPENINGS = ['window', 'shutters', 'door'];
// As each is until an act opens or shuts it: the window's sash shut (its glass), its shutters open, the
// door shut. openNow(things, thing): as the room's acts have it now (things: the backend's fold).
export const OPEN_AT_FIRST = Object.freeze({ window: false, shutters: true, door: false });
export const openNow = (things, thing) => things?.[thing]?.open ?? OPEN_AT_FIRST[thing];
export const THINGS = [...CANDLES, ...PENS, 'jar', 'stamper', ...OPENINGS];
export const ACTS = ['light', 'out', 'place', 'tilt', 'set', 'open', 'shut'];
export const TILT_MAX = 90;
export const TILT_STEP = 5; // degrees: a tilt act only past this turn or a step moved (being.js: as the head's)
// One world, one sun, one clock (rooms.md §1b): Pacific. Night is the sun down by it (law/sun.js:
// the one sun, shorter nights in summer); at night a being in a room lights its candles (an act),
// and puts them out by day and as the last one leaves.
export const WORLD_ZONE = 'America/Los_Angeles';
export const isNight = (ms) => sunAt(ms)[2] < 0;
const REACH_MM = [3048, 3353, 2438]; // the room (law/being.js checkPose's), and a metre past it

const bad = (msg) => Object.assign(new Error(msg), { code: 'bad_room_act', status: 400 });
export const roomDigest = (body) => sha256(concat(T('room'), utf8(jcs(body))));
const sealMsg = (D) => concat(T('seal'), D);
const isKey = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
const mm = (v) => Math.round(v * 1000);
const inRoom = (p) => Array.isArray(p) && p.length === 3 && p.every((v, k) => Number.isInteger(v) && v >= -1000 && v <= REACH_MM[k] + 1000);

// An act, made and sealed on the device (positions in room m: made whole millimetres here).
export function makeRoomAct({ sk, pk, room, k, act, thing, to, pos, deg, set }) {
  const body = { v: 2, kind: 'room', room, by: b64url(pk), k, act, thing };
  if (act === 'place') body.to = to === null ? null : to.map(mm);
  if (act === 'set') body.set = set;
  if (act === 'tilt') {
    body.pos = pos.map(mm);
    body.deg = Math.max(0, Math.min(TILT_MAX, Math.round(deg)));
  }
  checkRoomAct(body);
  return { act: body, seal: b64url(ed25519.sign(sealMsg(roomDigest(body)), sk)) };
}

// An act as anyone may check it: its fields, nothing more.
export function checkRoomAct(body) {
  if (!body || typeof body !== 'object') throw bad('no act');
  const want = {
    light: 'act,by,k,kind,room,thing,v',
    out: 'act,by,k,kind,room,thing,v',
    place: 'act,by,k,kind,room,thing,to,v',
    tilt: 'act,by,deg,k,kind,pos,room,thing,v',
    set: 'act,by,k,kind,room,set,thing,v',
    open: 'act,by,k,kind,room,thing,v',
    shut: 'act,by,k,kind,room,thing,v',
  }[body.act];
  if (!want || Object.keys(body).sort().join() !== want) throw bad('not a room act');
  if (body.v !== 2 || body.kind !== 'room' || !isKey(body.room) || !isKey(body.by) || !Number.isInteger(body.k) || body.k < 1) throw bad('a malformed room act');
  if (!THINGS.includes(body.thing)) throw bad('not a thing in a room');
  if ((body.act === 'light' || body.act === 'out' || body.act === 'tilt') && !CANDLES.includes(body.thing)) throw bad('only a candle is lit, put out or tilted');
  if ((body.act === 'open' || body.act === 'shut') !== OPENINGS.includes(body.thing)) throw bad('only a window, its shutters or a door is opened or shut, and they are only opened or shut');
  if (body.act === 'place' && body.to !== null && !inRoom(body.to)) throw bad('not a place in the room');
  if (body.act === 'tilt' && (!inRoom(body.pos) || !Number.isInteger(body.deg) || body.deg < 0 || body.deg > TILT_MAX)) throw bad('a malformed tilt');
  if (body.act === 'set') {
    if (!PENS.includes(body.thing)) throw bad('only a pen is set');
    checkPenSet(NIB_OF[body.thing], body.set);
  }
  return body;
}

// A pen's settings, as its nib takes them: every field, each a plain value in its range.
const PEN_FIELDS = {
  pen: ['color', 'dip', 'flow', 'size', 'spatter'],
  flex: ['color', 'dip', 'flow', 'hairline', 'maxWidth', 'slant', 'spatter', 'swell'],
  broad: ['angle', 'color', 'dip', 'flow', 'size', 'spatter'],
};
// whole numbers (an act is canonical JSON): the hairline in tenths of a pixel, the rest as the panel shows them
const RANGES = { flow: [0, 15], spatter: [0, 15], hairline: [1, 100], maxWidth: [1, 60], swell: [0, 100], slant: [0, 180], angle: [0, 180] };
function checkPenSet(nib, set) {
  if (!set || typeof set !== 'object' || Array.isArray(set) || Object.keys(set).sort().join() !== PEN_FIELDS[nib].join()) throw bad('not the settings of this pen');
  for (const [f, v] of Object.entries(set)) {
    if (f === 'color') {
      if (typeof v !== 'string' || !/^#[0-9a-f]{6}$/.test(v)) throw bad('a pen ink is a colour');
    } else if (f === 'dip') {
      if (typeof v !== 'boolean') throw bad('a pen dips or does not');
    } else if (f === 'size') {
      if (typeof v !== 'string' || !v.length || v.length > 12) throw bad('a pen size is a name');
    } else {
      const [lo, hi] = RANGES[f];
      if (!Number.isInteger(v) || v < lo || v > hi) throw bad(`a pen's ${f} is out of range`);
    }
  }
}
// Each pen's settings now: the last set act for it on the room's chain (lines in order, as stamped),
// else none (it is as it was made: the panel's defaults for its nib).
export function penSettings(lines) {
  const out = {};
  for (const l of lines) if (l.act?.act === 'set' && PENS.includes(l.act.thing)) out[l.act.thing] = l.act.set;
  return out;
}
export const verifyRoomActSeal = (act, seal) => verify(fromB64url(seal, 64), sealMsg(roomDigest(act)), fromB64url(act.by, 32));

// Whether the held candle has tilted or moved enough since the last tilt act (sent at
// `lastAt` ms) to be an act now: { pos (room m), deg }; past a turn, a step, or upright again.
export function isTiltAct(last, lastAt, next, now) {
  if (!last) return true;
  if (now - lastAt < 1000 / MAX_RATE) return false;
  const moved = Math.hypot(...next.pos.map((v, k) => v - last.pos[k]));
  return moved > STEP_M || Math.abs(next.deg - last.deg) >= TILT_STEP || (next.deg === 0) !== (last.deg === 0);
}

// Light is the clock for aging (rooms.md §1b): a room is lit only while a being is in it (the sun
// through its window by day, its candles by night); empty, day or night, it is a tomb and its ink
// rests. → the ms of [from, to] during which at least one being was in the room, read from its
// chain's comings and goings ({ at, by, kind: 'enter' | 'leave' }, in order; other lines pass by).
// Someone still in it at `to` is lit to `to`.
export function litMs(lines, from, to) {
  const here = new Set();
  let since = null;
  let sum = 0;
  const add = (a, b) => {
    const lo = Math.max(a, from),
      hi = Math.min(b, to);
    if (hi > lo) sum += hi - lo;
  };
  for (const l of lines) {
    if (l.kind !== 'enter' && l.kind !== 'leave') continue;
    const t = Date.parse(l.at);
    if (l.kind === 'enter') {
      if (!here.size) since = t;
      here.add(l.by);
    } else if (here.delete(l.by) && !here.size) {
      add(since, t);
      since = null;
    }
  }
  if (here.size) add(since, to);
  return sum;
}
