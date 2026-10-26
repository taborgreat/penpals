import express, { Router } from 'express';
import { requireAuth } from '../auth.js';
import { httpError } from '../files.js';
import { findByKey } from '../store/accounts.js';
import { canSeeProfile } from '../social.js';
import { allHouses, stampWorld, worldLines } from '../store/world.js';
import { worldBeings, watchWorld, houseOpenings } from '../store/rooms.js';
import { world as W } from 'penpals-law';

// The world (one-world.md): the houses standing in the one shared outside.
//   GET  /api/world          the houses, in the order their house acts landed: { plotM, start,
//                            houses: [{ key, name, plot, at: [x, y] (m), k, n }] }; the same for
//                            every viewer, except that a name stays hidden where its profile is
//   GET  /api/world/chain    every stamped act, to regrow the houses (law/world.js grow)
//   POST /api/world/acts     { act, seal }: your house placed, or moved (201 { line })
//   GET  /api/world/beings   the world, live (server-sent events): every being where it is (world m) and
//                            the house it came by ('beings', then 'being': enter, move, leave), and every
//                            house's door and windows, open or shut ('opens')
export const worldRouter = Router();
const json = express.json({ limit: '4kb' });

worldRouter.get('/', (req, res) => {
  const me = req.user?.id ?? null;
  const houses = allHouses().map((h) => {
    const owner = findByKey(h.key);
    return { key: h.key, name: owner && canSeeProfile(me, owner) ? owner.username : null, plot: h.plot, at: W.centreOf(h.plot), k: h.k, n: h.n };
  });
  res.json({ plotM: W.PLOT_M, start: W.START, houses });
});

worldRouter.get('/chain', (req, res) => {
  res.json({ lines: worldLines() });
});

worldRouter.post('/acts', requireAuth, json, async (req, res) => {
  const { act, seal } = req.body ?? {};
  if (act?.key !== req.user.publicKey) throw httpError(403, 'not_yours', 'You can only place or move your own house.');
  const line = await stampWorld(act, seal);
  res.status(201).json({ line });
});

worldRouter.get('/beings', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('beings', { beings: worldBeings(), opens: await houseOpenings() });
  const off = watchWorld((e) => send(e.kind === 'opens' ? 'opens' : 'being', e));
  const beat = setInterval(() => res.write(': still here\n\n'), 25000);
  req.on('close', () => {
    clearInterval(beat);
    off();
  });
});
