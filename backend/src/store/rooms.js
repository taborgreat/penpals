// Who is in a room (rooms.md §4, §1b). A room is a space: it wakes when someone
// enters and sleeps when the last person leaves (nothing here is kept for an
// empty room). Each signed-in person in it is one being; their coming and
// going and their coarse motion are acts, stamped here in arrival order and
// appended to the room's own chain (data/users/<owner>/room.chain):
//   { n, at, by: <username>, kind: 'enter' | 'leave' | 'move', pose? }
// Picking up and setting down the room's things (rooms.md §3b, §3c: the candles,
// the pen) are acts too: { by, kind: 'place', thing, to: [x, y, z] (room m: where it
// rests) | null (held, by `by`) }; where each is now is read from the chain. Tilting a
// held candle is the holder's act (matter-fixes §2, law/wax.js): { by, kind: 'tilt',
// thing, pos (where it is held), deg }, coarse like motion; the law regrows its drips
// from the chain. Where shared sheets lie on the table is written here as they come
// and go (store/shared.js): { kind: 'lay', sheet, slot } (slot null: it left), so what
// is under a falling drip is read from the chain too.
// The eye's own state is never sent, so never kept. What the room's people see
// of each other comes to them on the room's stream (routes/rooms.js).

import path from 'node:path';
import { appendLine, readLines, serial } from '../files.js';
import { userDir } from './accounts.js';
import { being as B, wax as WX } from 'penpals-law';
import { lyingOn, freeSlot } from '../../../frontend/src/room/table.js';

export const MAX_BEINGS = 8; // how many may be in a room at once (Tabor's to set)
export const THINGS = ['candle-0', 'candle-1', 'pen']; // what can be picked up and set down
const ROOM_M = [3.048, 3.353, 2.438]; // (law/being.js checkPose's room)
const rooms = new Map(); // ownerId → { clients: Set(client), beings: Map(userId → { name, pose, at, links }), things, n }
// Where each thing is, from the room's chain: { [thing]: { at, by } } (at null: held by `by`).
const thingsOf = (lines) => {
  const out = {};
  for (const l of lines) if (l.kind === 'place') out[l.thing] = { at: l.to, by: l.by };
  return out;
};
const roomFile = (ownerId) => path.join(userDir(ownerId), 'room.chain');

async function roomOf(ownerId) {
  let r = rooms.get(ownerId);
  if (!r) {
    const lines = (await readLines(roomFile(ownerId))).map((l) => JSON.parse(l));
    const last = lines.length ? lines[lines.length - 1] : null;
    r = { clients: new Set(), beings: new Map(), things: thingsOf(lines), n: last?.n ?? 0 };
    rooms.set(ownerId, r);
  }
  return r;
}

const send = (client, event, data) => client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const tellAll = (r, event, data, except = null) => {
  for (const c of r.clients) if (c !== except) send(c, event, data);
};

// The lines a room's drips are regrown from (law/wax.js): who came and went, the things
// picked up, set down and tilted, the sheets laid on the table. (Not motion.)
const WAXY = new Set(['enter', 'leave', 'place', 'tilt', 'lay']);

function record(ownerId, r, line) {
  return serial(`room:${ownerId}`, async () => {
    r.n += 1;
    const out = { n: r.n, at: new Date().toISOString(), ...line };
    await appendLine(roomFile(ownerId), JSON.stringify(out));
    if (WAXY.has(out.kind)) tellAll(r, 'room', out);
    return out;
  });
}

// Someone opens the room's stream: they watch, and (signed in, room for one more) they are a being in it.
export async function join(ownerId, client) {
  const r = await roomOf(ownerId);
  r.clients.add(client);
  let body = false;
  if (client.userId) {
    const b = r.beings.get(client.userId);
    if (b) {
      b.links++; // another tab of the same being
      body = true;
    } else if (r.beings.size < MAX_BEINGS) {
      r.beings.set(client.userId, { name: client.name, pose: null, at: Date.now(), links: 1, lastMove: 0 });
      body = true;
      await record(ownerId, r, { by: client.name, kind: 'enter' });
      tellAll(r, 'being', { kind: 'enter', name: client.name }, client);
    }
  }
  client.body = body;
  // what is here now, and the lines its drips are regrown from
  const lines = (await roomLines(ownerId)).filter((l) => WAXY.has(l.kind));
  send(client, 'here', { beings: [...r.beings.values()].filter((b) => b.name !== client.name).map((b) => ({ name: b.name, pose: b.pose })), body, things: r.things, lines });
  return r;
}

// They close it. The last one out: the room sleeps.
export async function part(ownerId, client) {
  const r = rooms.get(ownerId);
  if (!r) return;
  r.clients.delete(client);
  if (client.body) {
    const b = r.beings.get(client.userId);
    if (b && --b.links <= 0) {
      r.beings.delete(client.userId);
      await record(ownerId, r, { by: client.name, kind: 'leave' });
      tellAll(r, 'being', { kind: 'leave', name: client.name });
    }
  }
  if (!r.clients.size) rooms.delete(ownerId); // asleep: nothing kept
}

// A being moved (a coarse act, the neck law applied). → the stamped act, or null (too soon, or not in the room).
export async function move(ownerId, userId, pose) {
  const r = rooms.get(ownerId);
  const b = r?.beings.get(userId);
  if (!b) return null;
  const now = Date.now();
  if (now - b.lastMove < 1000 / B.MAX_RATE) return null; // at most five a second
  b.lastMove = now;
  b.pose = B.quantize(pose);
  const line = await record(ownerId, r, { by: b.name, kind: 'move', pose: b.pose });
  tellAll(r, 'being', { kind: 'move', name: b.name, pose: b.pose });
  return line;
}

// A being picks a thing up (at null) or sets it down where it comes to rest (at: [x, y, z],
// room m). → the stamped act, or null (not in the room).
export async function place(ownerId, userId, { thing, at }) {
  const r = rooms.get(ownerId);
  const b = r?.beings.get(userId);
  if (!b) return null;
  const was = r.things[thing];
  if (was && was.at === null && was.by !== b.name) return null; // someone else is holding it
  const where = at === null ? null : at.map((v) => Math.round(v * 1000) / 1000);
  const line = await record(ownerId, r, { by: b.name, kind: 'place', thing, to: where });
  r.things[thing] = { at: where, by: b.name };
  tellAll(r, 'thing', { thing, at: where, by: b.name });
  return line;
}
// The one holding a candle tilts it (a coarse act: law/wax.js isTiltAct, at most MAX_RATE a
// second). → the stamped act, or null (too soon, not in the room, or not holding it).
export async function tilt(ownerId, userId, act) {
  const r = rooms.get(ownerId);
  const b = r?.beings.get(userId);
  if (!b) return null;
  const held = r.things[act.thing];
  if (!held || held.at !== null || held.by !== b.name) return null;
  const now = Date.now();
  if (now - (b.lastTilt ?? 0) < 1000 / B.MAX_RATE) return null;
  b.lastTilt = now;
  const { thing, pos, deg } = WX.quantizeTilt(act);
  return record(ownerId, r, { by: b.name, kind: 'tilt', thing, pos, deg });
}

// A shared sheet came to lie on this room's table (in the first free slot), or left it.
export function lay(ownerId, sheet, on) {
  return serial(`room:${ownerId}`, async () => {
    const lines = (await readLines(roomFile(ownerId))).map((l) => JSON.parse(l));
    const lying = lyingOn(lines);
    if (on === lying.some((s) => s.sheet === sheet)) return null; // (already so)
    const r = rooms.get(ownerId);
    const n = (lines.at(-1)?.n ?? 0) + 1;
    if (r) r.n = n;
    const out = { n, at: new Date().toISOString(), kind: 'lay', sheet, slot: on ? freeSlot(lying) : null };
    await appendLine(roomFile(ownerId), JSON.stringify(out));
    if (r) tellAll(r, 'room', out);
    return out;
  });
}

export const checkThing = (thing, at) =>
  THINGS.includes(thing) && (at === null || (Array.isArray(at) && at.length === 3 && at.every((v, k) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= ROOM_M[k] * 2)));

// Anything for everyone watching a room (a shared sheet's act, a sheet laid on its table).
export function tellRoom(ownerId, event, data) {
  const r = rooms.get(ownerId);
  if (r) tellAll(r, event, data);
}
export const awake = (ownerId) => rooms.has(ownerId);
export const beingsIn = (ownerId) => [...(rooms.get(ownerId)?.beings.values() ?? [])].map((b) => ({ name: b.name, pose: b.pose }));
export const roomLines = (ownerId) => readLines(roomFile(ownerId)).then((ls) => ls.map((l) => JSON.parse(l)));
