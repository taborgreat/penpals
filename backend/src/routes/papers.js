import express, { Router } from 'express';
import { requireAuth } from '../auth.js';
import { httpError } from '../files.js';
import { findByKey } from '../store/accounts.js';
import { canSeeProfile } from '../social.js';
import { bornPaper, stampPaper, paperOf, viewOf, lyingIn, heldBy, mailboxOf, bookOf, madeBy, isKey } from '../store/papers.js';

// Papers (law/paper.js, store/papers.js): thin rectangles of paper matter, each its owner's, its whole life
// on its own chain.
//   POST /api/papers                 { birth, seal, open }: a new paper of yours, on your own table
//   POST /api/papers/:paper/acts     { act, seal }: a mark on it, or a move of it (law/paper.js)
//   GET  /api/papers/:paper          the paper as anyone sees it: its chain, where it is, whose it is
//   GET  /api/papers/in/:space       those lying in a space (a house, by its owner's key; or 'outside')
//   GET  /api/papers/held            yours in your hand        GET /api/papers/book   yours in your book
//   GET  /api/papers/made            how many papers you have made (none yet: your first lies on your table)
//   GET  /api/papers/mailbox         the letters in your mailbox, the oldest first (the next to come out)
//   GET  /api/papers/mailbox/:key    how many wait in that mailbox, as it is seen at its door (its flag)
export const papersRouter = Router();
const json = express.json({ limit: '1mb' });

// may this viewer see what lies in a space: outside, anyone; a house, as its door lets them in (rooms.md §4)
function maySee(req, space) {
  if (space === 'outside') return true;
  const owner = findByKey(space);
  return !!owner && canSeeProfile(req.user?.id ?? null, owner);
}

papersRouter.post('/', requireAuth, json, async (req, res) => {
  res.status(201).json(await bornPaper(req.user.id, req.body ?? {}));
});
papersRouter.get('/held', requireAuth, (req, res) => res.json({ papers: heldBy(req.user.publicKey).map(viewOf) }));
papersRouter.get('/book', requireAuth, (req, res) => res.json({ papers: bookOf(req.user.publicKey).map(viewOf) }));
papersRouter.get('/made', requireAuth, (req, res) => res.json({ made: madeBy(req.user.id).length }));
papersRouter.get('/mailbox', requireAuth, (req, res) => res.json({ papers: mailboxOf(req.user.publicKey).map(viewOf) }));
papersRouter.get('/mailbox/:key', (req, res) => {
  if (!isKey(req.params.key)) throw httpError(400, 'bad_key', 'A mailbox is named by its key.');
  res.json({ letters: mailboxOf(req.params.key).length });
});
papersRouter.get('/in/:space', (req, res) => {
  const { space } = req.params;
  if (space !== 'outside' && !isKey(space)) throw httpError(400, 'bad_space', 'A space is a house, by its key, or the outside.');
  if (!maySee(req, space)) throw httpError(403, 'private', 'This house is private.');
  res.json({ papers: lyingIn(space).map(viewOf) });
});
papersRouter.get('/:paper', (req, res) => {
  const p = paperOf(req.params.paper);
  const where = p?.state.where;
  if (!p || (where.space && !maySee(req, where.space))) throw httpError(404, 'not_found', 'No such paper.');
  res.json(viewOf(p));
});
papersRouter.post('/:paper/acts', requireAuth, json, async (req, res) => {
  const { act, seal } = req.body ?? {};
  if (act?.paper !== req.params.paper) throw httpError(400, 'bad_paper', 'That act is for another paper.');
  const line = await stampPaper(req.user.id, { act, seal });
  res.status(201).json({ line });
});
