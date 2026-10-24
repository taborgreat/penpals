import { Router } from 'express';
import { httpError } from '../files.js';
import { findByName, getAccount } from '../store/accounts.js';
import { getSkeleton, inkLine } from '../store/books.js';
import { hasBlocked } from '../social.js';
import { take, ipKey } from '../limits.js';
import { sendLook } from './books.js';

// Signatures: each scripter's name in their own hand, open from birth (anyone
// can check it offline), standing in for @name around the site. Shown to
// everyone except across a block (either way): a private profile still has a
// signed name.
export const signaturesRouter = Router();
const MAX_NAMES = 100;

function visibleTo(viewerId, account) {
  if (!viewerId || viewerId === account.id) return true;
  return !hasBlocked(account, viewerId) && !hasBlocked(getAccount(viewerId), account.id);
}

// ?names=ana,bo → { signatures: { ana: { ink, line, box, look } | null, bo: null } }
signaturesRouter.get('/', async (req, res) => {
  take('signaturesIp', ipKey(req));
  const asked = String(req.query.names ?? '').split(',').map((n) => n.trim()).filter(Boolean).slice(0, MAX_NAMES);
  const out = {};
  for (const name of asked) {
    const account = findByName(name);
    if (!account || !visibleTo(req.user?.id ?? null, account)) {
      out[name] = null;
      continue;
    }
    const skeleton = await getSkeleton(account.id);
    const line = skeleton?.signature ? await inkLine(account.id, skeleton.signature) : null;
    out[name] = line ? { ink: line.id, line, box: line.ink.box, look: `/api/signatures/${encodeURIComponent(account.username)}/look?v=${line.id}` } : null;
  }
  res.set('Cache-Control', 'private, max-age=60');
  res.json({ signatures: out });
});

signaturesRouter.get('/:name/look', async (req, res) => {
  const account = findByName(req.params.name);
  if (!account || !visibleTo(req.user?.id ?? null, account)) throw httpError(404, 'no_such_name', 'No such signature.');
  const skeleton = await getSkeleton(account.id);
  const line = skeleton?.signature ? await inkLine(account.id, skeleton.signature) : null;
  if (!line) throw httpError(404, 'no_signature', 'They have not signed.');
  await sendLook(req, res, account, line, 64, { cacheControl: 'private, max-age=3600' });
});
