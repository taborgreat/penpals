// Who is in a room (rooms.md §4, §1b). A room is a space: it wakes when someone
// enters and sleeps when the last person leaves (nothing here is kept for an
// empty room). Each signed-in person in it is one being; their coming and
// going and their coarse motion are acts, stamped here in arrival order and
// appended to the room's own chain (data/users/<owner>/room.chain):
//   { n, at, by: <username>, kind: 'enter' | 'leave' } | { n, at, by, kind: 'move', d } (d: the pose less the
//   being's last on this chain since it came in, a few bytes: law/being.js encodeMove)
// What a being does to the room's things (rooms.md §3b, §3c; matter-fixes §2: light a
// candle or put it out, pick a thing up or set it down, tilt the candle in its hand)
// is an act sealed by its key (law/room.js), stamped here as it came:
//   { n, at, act, seal }
// Where each thing is, and which candles burn, are read from them; the law regrows the
// candles and every drip from them alone (law/wax.js). Where papers lie in the
// house is written here as they come to rest and leave (store/papers.js): { kind: 'lay', paper,
// rest: [x, y, z] mm (where it rests: its middle), size: [w, h] (its units) | rest null (it left) }, so
// what is under a falling drip is read from the chain too.
// The eye's own state is never sent, so never kept. What the room's people see of each
// other comes to them on the room's stream (routes/rooms.js).
// The world is one space (one-world.md): a house's room is a place in it (law/outside.js frameOf), so each
// being's last pose is also kept in world m, with the house whose room it came by, and told to everyone
// watching the world (routes/world.js /beings): beings in different houses, and out of doors, see each
// other where they are. And each house's door and windows, open or shut, as its room's acts left them:
// every house is drawn the same from outside, open as it is.

import path from 'node:path';
import { appendLine, readLines, serial } from '../files.js';
import { userDir, findByKey, getAccount } from './accounts.js';
import { houseOf, allHouses } from './world.js';
import { being as B, room as R, outside as O } from 'penpals-law';
import { now as clock } from '../clock.js';

export const MAX_BEINGS = 8; // how many may be in a room at once (Tabor's to set)
// A being stays this long after its last stream closes, so the acts it sent as it went (the
// candles put out by the last to leave, room/together.js) still find it in the room.
export const LINGER_MS = 2000;
const rooms = new Map(); // ownerId → { clients: Set(client), beings: Map(userId → { name, pose, at, links }), things, lit, counted, n }
const nameOf = (key) => findByKey(key)?.username ?? null;
const metres = (mm) => mm.map((v) => v / 1000);
// What the room's signed acts have made so: where each thing is ({ at (room m) | null: held, by }) and
// what each pen is set to (set: its settings), which candles burn, and each being's counts stamped
// ('<key>.<k>').
function stateOf(lines) {
  const things = {},
    lit = R.litOf(lines), // (the last one out puts them out: law/room.js)
    counted = new Set();
  for (const l of lines) {
    const a = l.act;
    if (a?.kind !== 'room') continue;
    counted.add(`${a.by}.${a.k}`);
    if (a.act === 'place') things[a.thing] = { ...things[a.thing], at: a.to === null ? null : metres(a.to), by: nameOf(a.by) };
    if (a.act === 'set') things[a.thing] = { ...things[a.thing], set: a.set };
    if (a.act === 'open' || a.act === 'shut') things[a.thing] = { ...things[a.thing], open: a.act === 'open' };
  }
  return { things, lit, counted };
}
const roomFile = (ownerId) => path.join(userDir(ownerId), 'room.chain');

async function roomOf(ownerId) {
  let r = rooms.get(ownerId);
  if (!r) {
    const lines = (await readLines(roomFile(ownerId))).map((l) => JSON.parse(l));
    const last = lines.length ? lines[lines.length - 1] : null;
    r = { clients: new Set(), beings: new Map(), ...stateOf(lines), n: last?.n ?? 0 };
    rooms.set(ownerId, r);
  }
  return r;
}

const send = (client, event, data) => client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

// --- the world's beings, and its houses' openings ---
const world = new Map(); // name → { name, house (the key of the room it came by), pose (world m) | null }
const watchers = new Set();
const tellWorld = (e) => {
  for (const fn of watchers) fn(e);
};
export const watchWorld = (fn) => {
  watchers.add(fn);
  return () => watchers.delete(fn);
};
export const worldBeings = () => [...world.values()];
// a pose in a house's room, in the world (m): through its house's frame
function worldPose(ownerId, pose) {
  const plot = houseOf(getAccount(ownerId)?.publicKey)?.plot;
  if (!plot || !pose) return null;
  return {
    ...pose,
    pos: O.frameOf(plot)
      .toWorld(pose.pos)
      .map((v) => Math.round(v * 1000) / 1000),
  };
}
const opens = new Map(); // a house's key → { door, window, shutters } (open or shut, by its room's acts)
async function opensOf(ownerId) {
  const key = getAccount(ownerId)?.publicKey;
  if (!opens.has(key)) {
    const { things } = rooms.get(ownerId) ?? stateOf((await readLines(roomFile(ownerId))).map((l) => JSON.parse(l)));
    opens.set(key, Object.fromEntries(R.OPENINGS.map((t) => [t, R.openNow(things, t)])));
  }
  return opens.get(key);
}
// every house's openings (for a new watcher of the world)
export async function houseOpenings() {
  const out = {};
  for (const h of allHouses()) {
    const owner = findByKey(h.key);
    if (owner) out[h.key] = await opensOf(owner.id);
  }
  return out;
}
const tellAll = (r, event, data, except = null) => {
  for (const c of r.clients) if (c !== except) send(c, event, data);
};

// The lines a room's drips are regrown from (law/wax.js): who came and went, the things'
// signed acts, the sheets laid on the table. (Not motion.)
const waxy = (l) => l.kind === 'enter' || l.kind === 'leave' || l.kind === 'lay' || l.act?.kind === 'room';

function record(ownerId, r, line) {
  return serial(`room:${ownerId}`, async () => {
    r.n += 1;
    const out = { n: r.n, at: new Date().toISOString(), ...line };
    await appendLine(roomFile(ownerId), JSON.stringify(out));
    if (out.kind === 'enter' || out.kind === 'leave') goings.get(ownerId)?.push(goingOf(out));
    if (waxy(out)) tellAll(r, 'room', out);
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
      r.beings.set(client.userId, { name: client.name, pose: null, at: Date.now(), links: 1, lastMove: 0, lastTilt: 0 });
      body = true;
      await record(ownerId, r, { by: client.name, kind: 'enter' });
      tellAll(r, 'being', { kind: 'enter', name: client.name }, client);
      const house = getAccount(ownerId)?.publicKey;
      world.set(client.name, { name: client.name, house, pose: world.get(client.name)?.pose ?? null });
      tellWorld({ kind: 'enter', name: client.name, house });
    }
  }
  client.body = body;
  // what is here now, and the lines its drips are regrown from
  const lines = (await roomLines(ownerId)).filter(waxy);
  send(client, 'here', { beings: [...r.beings.values()].filter((b) => b.name !== client.name).map((b) => ({ name: b.name, pose: b.pose })), body, things: r.things, lines });
  return r;
}

// They close it (and, after a moment, are gone unless they came back). The last one out: the room sleeps.
export async function part(ownerId, client) {
  const r = rooms.get(ownerId);
  if (!r) return;
  r.clients.delete(client);
  const b = client.body ? r.beings.get(client.userId) : null;
  if (b && --b.links <= 0) {
    await new Promise((ok) => setTimeout(ok, LINGER_MS));
    if (b.links <= 0 && r.beings.get(client.userId) === b) {
      r.beings.delete(client.userId);
      await record(ownerId, r, { by: client.name, kind: 'leave' });
      if (!r.beings.size) for (const c of R.CANDLES) r.lit[c] = false; // (the last one out: the candles out, law/room.js litOf)
      tellAll(r, 'being', { kind: 'leave', name: client.name });
      if (world.get(client.name)?.house === getAccount(ownerId)?.publicKey) {
        world.delete(client.name);
        tellWorld({ kind: 'leave', name: client.name });
      }
    }
  }
  if (!r.clients.size && !r.beings.size && rooms.get(ownerId) === r) rooms.delete(ownerId); // asleep: nothing kept
}

// A being moved (a coarse act, the neck law applied). → the stamped act, or null (too soon, or not in the room).
export async function move(ownerId, userId, pose) {
  const r = rooms.get(ownerId);
  const b = r?.beings.get(userId);
  if (!b) return null;
  const now = Date.now();
  if (now - b.lastMove < 1000 / B.MAX_RATE) return null; // at most five a second
  b.lastMove = now;
  const last = b.pose;
  b.pose = B.quantize(pose);
  const line = await record(ownerId, r, { by: b.name, kind: 'move', d: B.encodeMove(last, b.pose) });
  tellAll(r, 'being', { kind: 'move', name: b.name, pose: b.pose });
  const at = { name: b.name, house: getAccount(ownerId)?.publicKey, pose: worldPose(ownerId, b.pose) };
  world.set(b.name, at);
  tellWorld({ kind: 'move', ...at });
  return line;
}

// A being's act on the room's things, sealed by its key (law/room.js): checked against the
// chain (in the room, its count not stamped before, who holds what, lit or out), stamped, told.
// (What it makes so is taken at once, before the stamping waits: an act right behind it is
// checked against it.)
// → { line } | { why, status }
export async function act(ownerId, userId, owner, { act: a, seal } = {}) {
  // a house's door is reached from outside too: anyone out in the world may open it or shut it (how near
  // they must stand: Tabor's to rule)
  const atDoor = a?.thing === 'door' && (a.act === 'open' || a.act === 'shut') && !!world.get(getAccount(userId)?.username)?.pose;
  const r = rooms.get(ownerId) ?? (atDoor ? await roomOf(ownerId) : null);
  const b = r?.beings.get(userId) ?? (atDoor ? { name: getAccount(userId).username } : null);
  if (!b) return { why: 'You are not in the room.', status: 409 };
  try {
    R.checkRoomAct(a);
  } catch (err) {
    return { why: err.message, status: 400 };
  }
  if (a.room !== owner.publicKey || a.by !== getAccount(userId)?.publicKey) return { why: 'That act is not yours, or not for this room.', status: 400 };
  if (typeof seal !== 'string' || !R.verifyRoomActSeal(a, seal)) return { why: 'That act is not sealed by your key.', status: 401 };
  const count = `${a.by}.${a.k}`;
  if (r.counted.has(count)) return { why: 'That act was stamped already.', status: 409 };
  const held = r.things[a.thing];
  const holding = held && held.at === null && held.by !== b.name && [...r.beings.values()].some((x) => x.name === held.by); // (one gone: it is anyone's)
  if (a.act === 'place' && holding) return { why: 'Someone else is holding it.', status: 409 };
  if (a.act === 'tilt') {
    if (!held || held.at !== null || held.by !== b.name) return { why: 'Only the one holding a candle tilts it.', status: 409 };
    const now = Date.now();
    if (now - b.lastTilt < 1000 / B.MAX_RATE) return { why: 'Too soon: a tilt is coarse.', status: 429 }; // at most five a second
    b.lastTilt = now;
  }
  if (a.act === 'set' && (!held || held.at !== null || held.by !== b.name)) return { why: 'Only the one holding it sets it.', status: 409 };
  if (a.act === 'light' && r.lit[a.thing]) return { why: 'It is lit already.', status: 409 };
  if (a.act === 'out' && !r.lit[a.thing]) return { why: 'It is out already.', status: 409 };
  if ((a.act === 'open' || a.act === 'shut') && R.openNow(r.things, a.thing) === (a.act === 'open')) return { why: a.act === 'open' ? 'It is open already.' : 'It is shut already.', status: 409 };
  r.counted.add(count);
  if (a.act === 'place') r.things[a.thing] = { ...r.things[a.thing], at: a.to === null ? null : metres(a.to), by: b.name };
  if (a.act === 'set') r.things[a.thing] = { ...r.things[a.thing], set: a.set };
  if (a.act === 'open' || a.act === 'shut') r.things[a.thing] = { ...r.things[a.thing], open: a.act === 'open' };
  if (a.act === 'light' || a.act === 'out') r.lit[a.thing] = a.act === 'light';
  const line = await record(ownerId, r, { act: a, seal });
  if (a.act === 'place' || a.act === 'set' || a.act === 'open' || a.act === 'shut') tellAll(r, 'thing', { thing: a.thing, ...r.things[a.thing] });
  if (a.act === 'open' || a.act === 'shut') {
    const now = { ...(await opensOf(ownerId)), [a.thing]: a.act === 'open' };
    opens.set(owner.publicKey, now);
    tellWorld({ kind: 'opens', house: owner.publicKey, opens: now });
  }
  return { line };
}

// A paper came to rest in this house, at `rest` (mm: its middle), or left it (null).
export function lay(ownerId, paper, rest, size = null) {
  return serial(`room:${ownerId}`, async () => {
    const lines = (await readLines(roomFile(ownerId))).map((l) => JSON.parse(l));
    const r = rooms.get(ownerId);
    const n = (lines.at(-1)?.n ?? 0) + 1;
    if (r) r.n = n;
    const out = { n, at: new Date().toISOString(), kind: 'lay', paper, ...(rest ? { rest, size } : { rest: null }) };
    await appendLine(roomFile(ownerId), JSON.stringify(out));
    if (r) tellAll(r, 'room', out);
    return out;
  });
}

// Anything for everyone watching a room (a paper's act, a paper come to rest in it).
export function tellRoom(ownerId, event, data) {
  const r = rooms.get(ownerId);
  if (r) tellAll(r, event, data);
}
export const awake = (ownerId) => rooms.has(ownerId);
export const beingsIn = (ownerId) => [...(rooms.get(ownerId)?.beings.values() ?? [])].map((b) => ({ name: b.name, pose: b.pose }));
export const roomLines = (ownerId) => readLines(roomFile(ownerId)).then((ls) => ls.map((l) => JSON.parse(l)));

// Light is the clock for aging (rooms.md §1b; law/room.js litMs): the hours of [from, to] (ms) a
// house was lit, that is, had a being in it. Its comings and goings are read once and kept as
// they are stamped.
const goings = new Map(); // ownerId → [{ at, by, kind }]
const goingOf = ({ at, by, kind }) => ({ at, by, kind });
const goingsOf = (ownerId) =>
  goings.get(ownerId) ??
  serial(`room:${ownerId}`, async () => {
    if (!goings.has(ownerId)) goings.set(ownerId, (await roomLines(ownerId)).filter((l) => l.kind === 'enter' || l.kind === 'leave').map(goingOf));
    return goings.get(ownerId);
  });
export const litHours = async (ownerId, from, to = clock()) => (ownerId && Number.isFinite(from) ? R.litMs(await goingsOf(ownerId), from, to) / 3600000 : 0);
