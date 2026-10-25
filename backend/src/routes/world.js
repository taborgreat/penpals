import express, { Router } from 'express';
import { requireAuth } from '../auth.js';
import { httpError } from '../files.js';
import { findByKey } from '../store/accounts.js';
import { canSeeProfile } from '../social.js';
import { allHouses, stampWorld, worldLines } from '../store/world.js';
import { PLOT_M, START, centreOf } from '../world.js';

// The world (one-world.md): the houses standing in the one shared outside.
//   GET  /api/world          the houses, in the order their house acts landed: { plotM, start,
//                            houses: [{ key, name, plot, at: [x, y] (m), k, n }] }; the same for
//                            every viewer, except that a name stays hidden where its profile is
//   GET  /api/world/chain    every stamped act, to regrow the houses (world.js grow)
//   POST /api/world/acts     { act, seal }: your house placed, or moved (201 { line })
export const worldRouter = Router();
const json = express.json({ limit: '4kb' });

worldRouter.get('/', (req, res) => {
  const me = req.user?.id ?? null;
  const houses = allHouses().map((h) => {
    const owner = findByKey(h.key);
    return { key: h.key, name: owner && canSeeProfile(me, owner) ? owner.username : null, plot: h.plot, at: centreOf(h.plot), k: h.k, n: h.n };
  });
  res.json({ plotM: PLOT_M, start: START, houses });
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
