import express, { Router } from 'express';
import { requireAuth } from '../auth.js';
import { httpError } from '../files.js';
import { findByName, findByKey, getAccount } from '../store/accounts.js';
import { canSeeProfile, hasBlocked } from '../social.js';
import { join, part, move, beingsIn, act } from '../store/rooms.js';
import { createShared, stamp, sheetOf, onTable, viewOf, onShared, ownedBy } from '../store/shared.js';
import { being as B } from 'penpals-law';

// Rooms and writing together (rooms.md §4, §5, §6).
//   GET  /api/rooms/:name/stream       the room, live (server-sent events): who is here and
//                                       how they move ('here', 'being'), the shared sheets on
//                                       its owner's table and their acts as stamped ('table', 'shared'),
//                                       and the lines its drips are regrown from ('here', 'room')
//   POST /api/rooms/:name/motion       { pose }: a coarse motion act (light/roomCamera, law/being.js)
//   POST /api/rooms/:name/act          { act, seal }: what you do to its things, sealed by your key
//                                       (law/room.js: light, out, place, tilt)
//   GET  /api/rooms/:name/table        the shared sheets lying on its owner's table
//   POST /api/shared                   { birth, seal, open }: a new shared sheet, on your table
//   GET  /api/shared/mine              your shared sheets, wherever they lie
//   GET  /api/shared/:sheet            a shared sheet: its birth and its stamped acts
//   POST /api/shared/:sheet/acts       { act, seal }: an act, stamped (201 { line }) or refused
// Who can come in follows the profile's privacy and block rules.
export const roomsRouter = Router();
export const sharedRouter = Router();
const json = express.json({ limit: '1mb' });

// The room's owner, if this viewer may come in.
function roomOf(req) {
  const owner = findByName(req.params.name);
  if (!owner) throw httpError(404, 'not_found', 'No such room.');
  const me = req.user?.id ?? null;
  if (me && me !== owner.id && (hasBlocked(owner, me) || hasBlocked(getAccount(me), owner.id))) throw httpError(404, 'not_found', 'No such room.');
  if (!canSeeProfile(me, owner)) throw httpError(403, 'private', 'This room is private.');
  return owner;
}
// May this viewer see this shared sheet: its owner's room or the room it lies in.
function maySee(req, s) {
  const me = req.user?.id ?? null;
  const owner = getAccount(s.ownerId);
  if (owner && canSeeProfile(me, owner)) return true;
  const holder = findByKey(s.state.table);
  return !!holder && canSeeProfile(me, holder);
}

roomsRouter.get('/:name/stream', (req, res) => {
  const owner = roomOf(req);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': the room\n\n');
  const client = { res, userId: req.user?.id ?? null, name: req.user?.username ?? null };
  // the shared sheets on this room's table: as they are, then each act as it is stamped
  const lying = new Set(onTable(owner.publicKey).map((s) => s.sheet));
  res.write(
    `event: table\ndata: ${JSON.stringify({
      sheets: onTable(owner.publicKey)
        .filter((s) => maySee(req, s))
        .map(viewOf),
    })}\n\n`,
  );
  const off = onShared((e) => {
    if (e.kind === 'table' && e.key === owner.publicKey) {
      const s = sheetOf(e.sheet);
      if (e.on) lying.add(e.sheet);
      else lying.delete(e.sheet);
      res.write(`event: table\ndata: ${JSON.stringify({ arrived: e.on ? viewOf(s) : null, left: e.on ? null : e.sheet })}\n\n`);
    } else if (e.kind === 'shared' && lying.has(e.sheet)) res.write(`event: shared\ndata: ${JSON.stringify({ sheet: e.sheet, line: e.line, names: viewOf(sheetOf(e.sheet)).names })}\n\n`);
  });
  const beat = setInterval(() => res.write(': still here\n\n'), 25000);
  join(owner.id, client).catch(() => {});
  req.on('close', () => {
    clearInterval(beat);
    off();
    part(owner.id, client).catch(() => {});
  });
});

roomsRouter.post('/:name/motion', requireAuth, json, async (req, res) => {
  const owner = roomOf(req);
  const pose = req.body?.pose;
  if (!B.checkPose(pose)) throw httpError(400, 'bad_pose', 'That is not a pose in this room.');
  const line = await move(owner.id, req.user.id, pose);
  res.json({ stamped: !!line, n: line?.n ?? null });
});

roomsRouter.post('/:name/act', requireAuth, json, async (req, res) => {
  const owner = roomOf(req);
  const out = await act(owner.id, req.user.id, owner, req.body ?? {});
  if (out.why) throw httpError(out.status, 'room_act', out.why);
  res.json({ n: out.line.n });
});

roomsRouter.get('/:name/table', (req, res) => {
  const owner = roomOf(req);
  res.json({
    sheets: onTable(owner.publicKey)
      .filter((s) => maySee(req, s))
      .map(viewOf),
    beings: beingsIn(owner.id),
  });
});

sharedRouter.post('/', requireAuth, json, async (req, res) => {
  const s = await createShared(req.user.id, req.body ?? {});
  res.status(201).json(s);
});

sharedRouter.get('/mine', requireAuth, (req, res) => {
  res.json({ sheets: ownedBy(req.user.id).map(viewOf) });
});

sharedRouter.get('/:sheet', (req, res) => {
  const s = sheetOf(req.params.sheet);
  if (!s || !maySee(req, s)) throw httpError(404, 'not_found', 'No such sheet.');
  res.json(viewOf(s));
});

sharedRouter.post('/:sheet/acts', requireAuth, json, async (req, res) => {
  const { act, seal } = req.body ?? {};
  if (act?.sheet !== req.params.sheet) throw httpError(400, 'bad_shared', 'That act is for another sheet.');
  const line = await stamp(req.user.id, { act, seal });
  res.status(201).json({ line });
});

// (a stamped act reaches the rooms watching its table through onShared; rooms with no one in them hear nothing)
