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
//   stamped line  { n, at (ISO: the stamper's clock), act, seal }
// k is the being's own count of its acts in this room: no act is stamped twice.

import { sha256 } from '@noble/hashes/sha2.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { T, jcs, fromB64url, b64url, utf8, concat } from './tags.js';
import { verify } from './keys.js';
import { MAX_RATE, STEP_M } from './being.js';

export const THINGS = ['candle-0', 'candle-1', 'pen'];
export const CANDLES = ['candle-0', 'candle-1'];
export const ACTS = ['light', 'out', 'place', 'tilt'];
export const TILT_MAX = 90;
export const TILT_STEP = 5; // degrees: a tilt act only past this turn or a step moved (being.js: as the head's)
// One world, one sun, one clock (rooms.md §1b): Pacific. Night is the sun down by it (the light's
// sunPlace: below the horizon before 6:00 and from 18:00); at night a being in a room lights its
// candles (an act), and puts them out by day and as the last one leaves.
export const WORLD_ZONE = 'America/Los_Angeles';
const hourIn = new Intl.DateTimeFormat('en-US', { timeZone: WORLD_ZONE, hour12: false, hour: 'numeric' });
export const isNight = (ms) => {
  const h = Number(hourIn.formatToParts(new Date(ms)).find((p) => p.type === 'hour').value) % 24;
  return h < 6 || h >= 18;
};
const REACH_MM = [3048, 3353, 2438]; // the room (law/being.js checkPose's), and a metre past it

const bad = (msg) => Object.assign(new Error(msg), { code: 'bad_room_act', status: 400 });
export const roomDigest = (body) => sha256(concat(T('room'), utf8(jcs(body))));
const sealMsg = (D) => concat(T('seal'), D);
const isKey = (s) => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
const mm = (v) => Math.round(v * 1000);
const inRoom = (p) => Array.isArray(p) && p.length === 3 && p.every((v, k) => Number.isInteger(v) && v >= -1000 && v <= REACH_MM[k] + 1000);

// An act, made and sealed on the device (positions in room m: made whole millimetres here).
export function makeRoomAct({ sk, pk, room, k, act, thing, to, pos, deg }) {
  const body = { v: 2, kind: 'room', room, by: b64url(pk), k, act, thing };
  if (act === 'place') body.to = to === null ? null : to.map(mm);
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
  const want = { light: 'act,by,k,kind,room,thing,v', out: 'act,by,k,kind,room,thing,v', place: 'act,by,k,kind,room,thing,to,v', tilt: 'act,by,deg,k,kind,pos,room,thing,v' }[body.act];
  if (!want || Object.keys(body).sort().join() !== want) throw bad('not a room act');
  if (body.v !== 2 || body.kind !== 'room' || !isKey(body.room) || !isKey(body.by) || !Number.isInteger(body.k) || body.k < 1) throw bad('a malformed room act');
  if (!THINGS.includes(body.thing)) throw bad('not a thing in a room');
  if ((body.act === 'light' || body.act === 'out' || body.act === 'tilt') && !CANDLES.includes(body.thing)) throw bad('only a candle is lit, put out or tilted');
  if (body.act === 'place' && body.to !== null && !inRoom(body.to)) throw bad('not a place in the room');
  if (body.act === 'tilt' && (!inRoom(body.pos) || !Number.isInteger(body.deg) || body.deg < 0 || body.deg > TILT_MAX)) throw bad('a malformed tilt');
  return body;
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
