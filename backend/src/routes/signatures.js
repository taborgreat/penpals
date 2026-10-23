import express, { Router } from 'express';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { findByName } from '../store/accounts.js';
import { addInk, cleanInk, edit, getSkeleton, inkById } from '../store/books.js';

// Signatures: each scripter signs their name once on their profile, and it
// stands in for their @name around the site. A signature is ink in the
// signer's book like anything else; the skeleton holds `signature` (an ink
// ref) and `signatureColor` (one of config.signatureColors).
export const signaturesRouter = Router();
const smallJson = express.json({ limit: '64kb' });

const MAX_NAMES = 100; // per lookup

// Signatures for a list of names: ?names=ana,bo → { signatures: { ana: { ink, color }, bo: null } }.
// Keyed by the names as asked for; unknown or unsigned names come back null.
signaturesRouter.get('/', async (req, res) => {
  const asked = String(req.query.names ?? '').split(',').map((n) => n.trim()).filter(Boolean).slice(0, MAX_NAMES);
  const out = {};
  for (const name of asked) {
    const account = findByName(name);
    const skeleton = account && (await getSkeleton(account.id));
    const ink = skeleton?.signature ? await inkById(account.id, skeleton.signature) : null;
    out[name] = ink ? { ink, color: skeleton.signatureColor } : null;
  }
  res.json({ signatures: out });
});

// Sign: { ink: { strokes, bounds }, color }. The ink is appended to your book,
// then the skeleton points at it.
signaturesRouter.put('/me', requireAuth, express.json({ limit: '2mb' }), async (req, res) => {
  const ink = cleanInk(req.body?.ink);
  if (typeof ink === 'string') return res.status(400).json({ error: ink });
  const color = config.signatureColors.includes(req.body?.color) ? req.body.color : undefined;
  const out = await addInk(req.user.id, ink, { op: 'signature', color }, null);
  const skeleton = await getSkeleton(req.user.id);
  res.json({ ...out, signature: { ink: await inkById(req.user.id, out.ink), color: skeleton.signatureColor } });
});

// Change the colour without signing again.
signaturesRouter.put('/me/color', requireAuth, smallJson, async (req, res) => {
  const color = req.body?.color;
  if (!config.signatureColors.includes(color)) return res.status(400).json({ error: 'Pick one of the signature colours.' });
  await edit(req.user.id, { op: 'signature_color', color }, null);
  res.json({ color });
});

// Unsign: the skeleton stops pointing at the ink (the ink line stays in the chain).
signaturesRouter.delete('/me', requireAuth, async (req, res) => {
  await edit(req.user.id, { op: 'signature', ink: null }, null);
  res.json({ ok: true });
});
