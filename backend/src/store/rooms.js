// Who is in a room (rooms.md §4, §1b). A room is a space: it wakes when someone
// enters and sleeps when the last person leaves (nothing here is kept for an
// empty room). Each signed-in person in it is one being; their coming and
// going and their coarse motion are acts, stamped here in arrival order and
// appended to the room's own chain (data/users/<owner>/room.chain):
//   { n, at, by: <username>, kind: 'enter' | 'leave' | 'move', pose? }
// The eye's own state is never sent, so never kept. What the room's people see
// of each other comes to them on the room's stream (routes/rooms.js).

import path from 'node:path';
import { appendLine, readLines, serial } from '../files.js';
import { userDir } from './accounts.js';
import { being as B } from 'penpals-law';

export const MAX_BEINGS = 8; // how many may be in a room at once (Tabor's to set)
const rooms = new Map(); // ownerId → { clients: Set(client), beings: Map(userId → { name, pose, at, links }), n }
const roomFile = (ownerId) => path.join(userDir(ownerId), 'room.chain');

async function roomOf(ownerId) {
  let r = rooms.get(ownerId);
  if (!r) {
    const lines = await readLines(roomFile(ownerId));
    const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    r = { clients: new Set(), beings: new Map(), n: last?.n ?? 0 };
    rooms.set(ownerId, r);
  }
  return r;
}

const send = (client, event, data) => client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
const tellAll = (r, event, data, except = null) => {
  for (const c of r.clients) if (c !== except) send(c, event, data);
};

function record(ownerId, r, line) {
  return serial(`room:${ownerId}`, async () => {
    r.n += 1;
    const out = { n: r.n, at: new Date().toISOString(), ...line };
    await appendLine(roomFile(ownerId), JSON.stringify(out));
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
  // what is here now
  send(client, 'here', { beings: [...r.beings.values()].filter((b) => b.name !== client.name).map((b) => ({ name: b.name, pose: b.pose })), body });
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

// Anything for everyone watching a room (a shared sheet's act, a sheet laid on its table).
export function tellRoom(ownerId, event, data) {
  const r = rooms.get(ownerId);
  if (r) tellAll(r, event, data);
}
export const awake = (ownerId) => rooms.has(ownerId);
export const beingsIn = (ownerId) => [...(rooms.get(ownerId)?.beings.values() ?? [])].map((b) => ({ name: b.name, pose: b.pose }));
export const roomLines = (ownerId) => readLines(roomFile(ownerId)).then((ls) => ls.map((l) => JSON.parse(l)));
