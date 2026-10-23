import { Router } from 'express';
import { users } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';

// Signatures: each scripter can sign their name once on their profile, and it
// stands in for their @name around the site. A signature is the same small
// stroke format as the site's handwritten labels (frontend/src/hand/asset.js):
//   { v: 1, w, h, base, line, dur, s: [[angle, x, y, t, w, dx, dy, dt, dw, ...], ...], color }
// where color is one of config.signatureColors.
export const signaturesRouter = Router();

const MAX_NAMES = 100; // per lookup
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

const cleanColor = (c) => (config.signatureColors.includes(c) ? c : config.signatureColors[0]);

// A clean copy of a signature, or null if it isn't one.
export function cleanSignature(sig) {
  if (!sig || typeof sig !== 'object' || sig.v !== 1) return null;
  const { w, h, base, line, dur, s } = sig;
  if (!int(w, 1, 4000) || !int(h, 1, 2000) || !int(base, -2000, 4000) || !int(line, 1, 1000) || !int(dur, 0, 600000)) return null;
  if (!Array.isArray(s) || s.length === 0 || s.length > config.signature.maxStrokes) return null;
  let numbers = 0;
  for (const stroke of s) {
    if (!Array.isArray(stroke) || stroke.length < 5 || (stroke.length - 1) % 4 !== 0) return null;
    if (stroke[0] !== null && !(typeof stroke[0] === 'number' && Number.isFinite(stroke[0]))) return null;
    for (let i = 1; i < stroke.length; i++) if (!int(stroke[i], -100000, 100000)) return null;
    numbers += stroke.length;
  }
  if (numbers > config.signature.maxNumbers) return null;
  return { v: 1, w, h, base, line, dur, s, color: cleanColor(sig.color) };
}

// Signatures for a list of names: ?names=ana,bo → { signatures: { ana: {...}, bo: null } }.
// Keyed by the names as asked for; unknown or unsigned names come back null.
signaturesRouter.get('/', async (req, res) => {
  const asked = String(req.query.names ?? '').split(',').map((n) => n.trim()).filter(Boolean).slice(0, MAX_NAMES);
  const found = asked.length
    ? await users.find(
      { usernameLower: { $in: asked.map((n) => n.toLowerCase()) }, signature: { $exists: true } },
      { projection: { usernameLower: 1, signature: 1 } },
    ).toArray()
    : [];
  const byName = new Map(found.map((u) => [u.usernameLower, u.signature]));
  res.json({ signatures: Object.fromEntries(asked.map((n) => [n, byName.get(n.toLowerCase()) ?? null])) });
});

signaturesRouter.put('/me', requireAuth, async (req, res) => {
  const signature = cleanSignature(req.body?.signature);
  if (!signature) return res.status(400).json({ error: 'That is not a signature.' });
  if (JSON.stringify(signature).length > config.signature.maxBytes) {
    return res.status(413).json({ error: 'That signature is too long. Try signing a little more simply.' });
  }
  await users.updateOne({ _id: req.user.id }, { $set: { signature, signedAt: new Date() } });
  res.json({ signature });
});

// Change the colour without signing again.
signaturesRouter.put('/me/color', requireAuth, async (req, res) => {
  const color = req.body?.color;
  if (!config.signatureColors.includes(color)) return res.status(400).json({ error: 'Pick one of the signature colours.' });
  const { matchedCount } = await users.updateOne({ _id: req.user.id, signature: { $exists: true } }, { $set: { 'signature.color': color } });
  if (!matchedCount) return res.status(404).json({ error: 'Sign your name first.' });
  res.json({ color });
});

signaturesRouter.delete('/me', requireAuth, async (req, res) => {
  await users.updateOne({ _id: req.user.id }, { $unset: { signature: '', signedAt: '' } });
  res.json({ ok: true });
});
