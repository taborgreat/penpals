import express, { Router } from 'express';
import { requireAuth } from '../auth.js';
import { httpError } from '../files.js';
import { outsideNow, outsideLines, stampOutside } from '../store/outside.js';

// The outside's facts (outside.md Phase 5): what beings' hands have done to it.
//   GET  /api/outside          as it is now: { n, things: [{ id, at | null, by }], broken: [{ tree, list }],
//                              cuts: [{ id, list }], marks: [{ tree, list }], made: [{ id, kind, matter, ... }] (what
//                              hands made: law/making.js), edges: [stone], picked: ['tree/tip'], k: { [key]: its last count } }
//   GET  /api/outside/chain    every stamped act, to regrow it (law/hands.js grow)
//   POST /api/outside/acts     { act, seal }: a stone taken or put, a branch broken, a stick or a tree carved, and
//                              the creation tree's makings (law/hands.js, law/making.js)
export const outsideRouter = Router();
const json = express.json({ limit: '4kb' });

outsideRouter.get('/', (req, res) => res.json(outsideNow()));
outsideRouter.get('/chain', (req, res) => res.json({ lines: outsideLines() }));
outsideRouter.post('/acts', requireAuth, json, async (req, res) => {
  const { act, seal } = req.body ?? {};
  if (act?.by !== req.user.publicKey) throw httpError(403, 'not_yours', 'Your hands are your own.');
  const line = await stampOutside(act, seal);
  res.status(201).json({ line });
});
