import express, { Router } from 'express';
import { requireAuth } from '../auth.js';
import { httpError } from '../files.js';
import { findByName } from '../store/accounts.js';
import { canSeeProfile } from '../social.js';
import { join, part, move, beingsIn, act } from '../store/rooms.js';
import { lyingIn, viewOf, onPapers, paperOf } from '../store/papers.js';
import { being as B } from 'penpals-law';

// Rooms (rooms.md §4): a house, and who is in it.
//   GET  /api/rooms/:name/stream       the house, live (server-sent events): who is here and how they move
//                                       ('here', 'being'), the papers lying in it and every act on them or
//                                       move of them in or out, as stamped ('papers', 'paper'), and the lines
//                                       its drips are regrown from ('here', 'room')
//   POST /api/rooms/:name/motion       { pose }: a coarse motion act (light/roomCamera, law/being.js)
//   POST /api/rooms/:name/act          { act, seal }: what you do to its things, sealed by your key
//                                       (law/room.js: light, out, place, tilt, carry)
//   GET  /api/rooms/:name/here         who is in it, and the papers lying in it
// Who can come in follows the profile's privacy (there are no blocks: one-world.md).
export const roomsRouter = Router();
const json = express.json({ limit: '1mb' });

// The room's owner, if this viewer may come in.
function roomOf(req) {
  const owner = findByName(req.params.name);
  if (!owner) throw httpError(404, 'not_found', 'No such room.');
  const me = req.user?.id ?? null;
  if (!canSeeProfile(me, owner)) throw httpError(403, 'private', 'This room is private.');
  return owner;
}

roomsRouter.get('/:name/stream', (req, res) => {
  const owner = roomOf(req);
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(': the room\n\n');
  const client = { res, userId: req.user?.id ?? null, name: req.user?.username ?? null };
  // the papers lying in this house: as they are, then each as an act lands on it or it comes or goes
  res.write(`event: papers\ndata: ${JSON.stringify({ papers: lyingIn(owner.publicKey).map(viewOf) })}\n\n`);
  const off = onPapers((e) => {
    if (e.from !== owner.publicKey && e.to !== owner.publicKey) return;
    res.write(`event: paper\ndata: ${JSON.stringify({ paper: viewOf(paperOf(e.paper)), line: e.line })}\n\n`);
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

roomsRouter.get('/:name/here', (req, res) => {
  const owner = roomOf(req);
  res.json({ papers: lyingIn(owner.publicKey).map(viewOf), beings: beingsIn(owner.id) });
});
