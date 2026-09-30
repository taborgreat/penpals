import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { users, letters } from '../db.js';
import { config } from '../config.js';
import { requireAuth } from '../auth.js';
import { inkPath, strokesPath, writeInk, writeStrokes, deleteInk } from '../storage.js';
import { blockedEitherWay, blockedIds, canSeeProfile, hasBlocked, relation } from '../social.js';

export const lettersRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxInkBytes, files: 2 },
}).fields([{ name: 'ink', maxCount: 1 }, { name: 'strokes', maxCount: 1 }]);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Read width/height straight from the PNG header instead of trusting the client.
function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// A strokes file is deflated 'PNPS' + version + size + count. It must describe
// the same page as the PNG.
function strokesInfo(buf, size) {
  let raw;
  try {
    raw = zlib.inflateSync(buf);
  } catch {
    return null;
  }
  if (raw.length < 13 || raw.toString('ascii', 0, 4) !== 'PNPS' || (raw[4] !== 1 && raw[4] !== 2)) return null;
  if (raw.readUInt16LE(5) !== size.width || raw.readUInt16LE(7) !== size.height) return null;
  return { count: raw.readUInt32LE(9) };
}

export function letterJson(l, viewer) {
  const savedBy = l.savedBy ?? [];
  const upvotes = l.upvotes ?? [];
  return {
    id: l._id,
    from: l.from,
    to: l.to ?? null,
    width: l.width,
    height: l.height,
    bytes: l.bytes,
    strokesBytes: l.strokesBytes ?? 0,
    strokeCount: l.strokeCount ?? 0,
    display: l.display ?? 'mask',
    playable: l.playable ?? !!l.hasStrokes,
    inkColor: l.inkColor,
    paper: l.paper,
    source: l.source,
    createdAt: l.createdAt,
    sentAt: l.sentAt ?? null,
    openedAt: l.openedAt ?? null,
    expiresAt: l.expiresAt ?? null,
    kept: savedBy.length > 0,
    saveCount: savedBy.length,
    savedByMe: !!viewer && savedBy.some((s) => s.userId.equals(viewer.id)),
    isMine: !!viewer && l.senderId.equals(viewer.id),
    upvotes: upvotes.length,
    upvotedByMe: !!viewer && upvotes.some((id) => id.equals(viewer.id)),
    inkUrl: `/api/letters/${l._id}/ink`,
    strokesUrl: l.hasStrokes ? `/api/letters/${l._id}/strokes` : null,
  };
}

const savedCount = (userId) => letters.countDocuments({ 'savedBy.userId': userId, inkDeleted: false });

// Who may see a letter: its recipient while it is in the mail, its sender while
// they keep it, and anyone who can see the profile of somebody keeping it.
// Blocks hide letters both ways.
async function canView(letter, user, now = new Date()) {
  const me = user?.id ?? null;
  if (me && letter.recipientId?.equals(me) && letter.expiresAt > now) return true;
  if (me && letter.senderId.equals(me) && letter.savedBy.some((s) => s.userId.equals(me))) return true;
  if (!letter.savedBy.length) return false;
  if (me && !letter.senderId.equals(me) && (await blockedEitherWay(me, letter.senderId))) return false;
  const keepers = await users
    .find({ _id: { $in: letter.savedBy.map((s) => s.userId) } }, { projection: { private: 1, blocked: 1 } })
    .toArray();
  for (const keeper of keepers) if (await canSeeProfile(me, keeper)) return true;
  return false;
}

async function findLetter(req, res) {
  const letter = await letters.findOne({ _id: req.params.id });
  if (!letter || letter.inkDeleted) {
    res.status(404).json({ error: 'That letter is gone.' });
    return null;
  }
  return letter;
}

// Nobody keeps it and it is not in the mail: the ink goes now, not at the next cleanup.
async function deleteIfOrphan(id) {
  const l = await letters.findOne({ _id: id });
  if (!l || l.inkDeleted || l.savedBy.length || (l.recipientId && l.expiresAt > new Date())) return;
  await deleteInk(id);
  await letters.updateOne({ _id: id }, { $set: { inkDeleted: true } });
}

const findRecipient = (name) =>
  users.findOne({ usernameLower: String(name).toLowerCase() }, { projection: { username: 1, private: 1, blocked: 1 } });

// Why `me` may not write to `recipient`, or null when they may.
async function sendRefusal(me, recipient) {
  if (recipient._id.equals(me.id)) return { status: 400, error: 'You cannot write to yourself.' };
  const meDoc = await users.findOne({ _id: me.id }, { projection: { blocked: 1 } });
  if (hasBlocked(meDoc, recipient._id)) return { status: 403, error: 'You have blocked this scripter.' };
  if (hasBlocked(recipient, me.id)) return { status: 404, error: 'No such scripter.' };
  if (recipient.private && (await relation(me.id, recipient._id)) !== 'friends') {
    return { status: 403, error: 'Only their friends can write to them.' };
  }
  return null;
}

// Two letters per rolling hour. Returns the 429 body, or null.
async function rateLimit(meId, now) {
  const since = new Date(now.getTime() - config.sendLimit.windowMs);
  const recent = await letters
    .find({ senderId: meId, sentAt: { $gt: since } }, { projection: { sentAt: 1 } })
    .sort({ sentAt: 1 })
    .toArray();
  if (recent.length < config.sendLimit.count) return null;
  return {
    error: `You can only send ${config.sendLimit.count} letters an hour.`,
    retryAt: new Date(recent[0].sentAt.getTime() + config.sendLimit.windowMs),
  };
}

const delivery = (recipient, now) => ({
  recipientId: recipient._id,
  to: recipient.username,
  sentAt: now,
  expiresAt: new Date(now.getTime() + config.unopenedTtlMs),
});

// Upload: multipart `ink` (PNG whose alpha is the writing), optional `strokes`
// (the shared strokes file for the same page), `inkColor`, `paper`, `source`,
// `display`, optional `to`. Without `to` the letter lands on your profile (which
// must have room). With `to` it is sent right away and kept only if there is room.
lettersRouter.post('/', requireAuth, upload, async (req, res) => {
  const { inkColor = '#1a1a1a', paper = 'plain', source = 'photo', to = '' } = req.body;
  const inkFile = req.files?.ink?.[0];
  const strokesFile = req.files?.strokes?.[0];
  if (!inkFile) return res.status(400).json({ error: 'Missing ink file.' });
  const size = pngSize(inkFile.buffer);
  if (!size) return res.status(400).json({ error: 'Ink must be a PNG.' });
  const strokes = strokesFile ? strokesInfo(strokesFile.buffer, size) : null;
  if (strokesFile && !strokes) return res.status(400).json({ error: 'Bad strokes file.' });
  if (!/^#[0-9a-f]{6}$/i.test(inkColor)) return res.status(400).json({ error: 'Bad ink color.' });
  if (!config.papers.includes(paper)) return res.status(400).json({ error: 'Unknown paper.' });
  if (!config.sources.includes(source)) return res.status(400).json({ error: 'Unknown source.' });
  const display = strokes ? (config.displays.includes(req.body.display) ? req.body.display : 'strokes') : 'mask';
  const playable = !!strokes && req.body.playable !== '0' && req.body.playable !== 'false';

  const now = new Date();
  let recipient = null;
  if (String(to).trim()) {
    recipient = await findRecipient(String(to).trim());
    if (!recipient) return res.status(404).json({ error: 'No such scripter.' });
    const refusal = await sendRefusal(req.user, recipient);
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });
    const limited = await rateLimit(req.user.id, now);
    if (limited) return res.status(429).json(limited);
  }
  const room = (await savedCount(req.user.id)) < config.maxSavedPerUser;
  if (!recipient && !room) {
    return res.status(400).json({ error: `Your profile already holds ${config.maxSavedPerUser} letters. Remove one first.` });
  }

  const letter = {
    _id: crypto.randomBytes(12).toString('base64url'),
    senderId: req.user.id,
    from: req.user.username,
    width: size.width,
    height: size.height,
    bytes: inkFile.size,
    hasStrokes: !!strokes,
    strokeCount: strokes?.count ?? 0,
    strokesBytes: strokesFile?.size ?? 0,
    display,
    playable,
    inkColor: inkColor.toLowerCase(),
    paper,
    source,
    createdAt: now,
    inkDeleted: false,
    savedBy: room ? [{ userId: req.user.id, at: now }] : [],
    upvotes: [],
    upvoteCount: 0,
    openedAt: null,
    ...(recipient ? delivery(recipient, now) : { recipientId: null, to: null, sentAt: null, expiresAt: null }),
  };

  await writeInk(letter._id, inkFile.buffer);
  if (strokesFile) await writeStrokes(letter._id, strokesFile.buffer);
  try {
    await letters.insertOne(letter);
  } catch (err) {
    await deleteInk(letter._id);
    throw err;
  }
  res.status(201).json({ letter: letterJson(letter, req.user), kept: room });
});

// Letters waiting for me (unopened, or opened and still within their 24 h).
lettersRouter.get('/inbox', requireAuth, async (req, res) => {
  const hidden = await blockedIds(req.user.id);
  const list = await letters
    .find({ recipientId: req.user.id, senderId: { $nin: hidden }, expiresAt: { $gt: new Date() }, inkDeleted: false })
    .sort({ sentAt: -1 })
    .toArray();
  res.json({ letters: list.map((l) => letterJson(l, req.user)) });
});

// What I have sent lately (status only; the ink belongs to the recipient now).
lettersRouter.get('/sent', requireAuth, async (req, res) => {
  const list = await letters
    .find({ senderId: req.user.id, sentAt: { $ne: null } })
    .sort({ sentAt: -1 })
    .limit(20)
    .toArray();
  res.json({ letters: list.map((l) => letterJson(l, req.user)) });
});

// Most upvoted kept letters that this viewer may see.
lettersRouter.get('/top', async (req, res) => {
  const rows = await letters
    .find({ inkDeleted: false, 'savedBy.0': { $exists: true }, upvoteCount: { $gt: 0 } })
    .sort({ upvoteCount: -1, createdAt: -1 })
    .limit(30)
    .toArray();
  const visible = [];
  for (const l of rows) {
    if (visible.length >= 10) break;
    if (await canView(l, req.user)) visible.push(l);
  }
  res.json({ letters: visible.map((l) => letterJson(l, req.user)) });
});

lettersRouter.get('/:id', async (req, res) => {
  const letter = await findLetter(req, res);
  if (!letter) return;
  if (!(await canView(letter, req.user))) return res.status(403).json({ error: 'Not your letter.' });
  res.json({ letter: letterJson(letter, req.user) });
});

// Send one of my letters to one person. A letter is sent once, ever.
lettersRouter.post('/:id/send', requireAuth, async (req, res) => {
  const letter = await findLetter(req, res);
  if (!letter) return;
  if (!letter.senderId.equals(req.user.id)) return res.status(403).json({ error: 'Not your letter.' });
  if (letter.recipientId) return res.status(400).json({ error: 'This letter has already been sent.' });

  const recipient = await findRecipient(req.body?.to ?? '');
  if (!recipient) return res.status(404).json({ error: 'No such scripter.' });
  const refusal = await sendRefusal(req.user, recipient);
  if (refusal) return res.status(refusal.status).json({ error: refusal.error });
  const now = new Date();
  const limited = await rateLimit(req.user.id, now);
  if (limited) return res.status(429).json(limited);

  const fields = delivery(recipient, now);
  const result = await letters.updateOne({ _id: letter._id, recipientId: null }, { $set: fields });
  if (!result.modifiedCount) return res.status(409).json({ error: 'This letter has already been sent.' });
  res.json({ letter: letterJson({ ...letter, ...fields }, req.user) });
});

// Opening starts the 24 h clock.
lettersRouter.post('/:id/open', requireAuth, async (req, res) => {
  const letter = await findLetter(req, res);
  if (!letter) return;
  if (!letter.recipientId?.equals(req.user.id)) return res.status(403).json({ error: 'Not your letter.' });
  const now = new Date();
  if (letter.expiresAt <= now) return res.status(410).json({ error: 'This letter has expired.' });
  if (!letter.openedAt) {
    const expiresAt = new Date(Math.min(letter.expiresAt.getTime(), now.getTime() + config.openedTtlMs));
    await letters.updateOne({ _id: letter._id, openedAt: null }, { $set: { openedAt: now, expiresAt } });
  }
  res.json({ letter: letterJson(await letters.findOne({ _id: letter._id }), req.user) });
});

// The ink itself: a PNG whose alpha channel is the writing.
lettersRouter.get('/:id/ink', async (req, res) => {
  const letter = await findLetter(req, res);
  if (!letter) return;
  if (!(await canView(letter, req.user))) return res.status(403).json({ error: 'Not your letter.' });
  res.set('Cache-Control', 'private, max-age=300');
  res.type('png');
  res.sendFile(inkPath(letter._id));
});

// The strokes: weighted, timed pen paths (deflated binary).
lettersRouter.get('/:id/strokes', async (req, res) => {
  const letter = await findLetter(req, res);
  if (!letter) return;
  if (!letter.hasStrokes) return res.status(404).json({ error: 'This letter has no strokes.' });
  if (!(await canView(letter, req.user))) return res.status(403).json({ error: 'Not your letter.' });
  res.set('Cache-Control', 'private, max-age=300');
  res.type('application/octet-stream');
  res.sendFile(strokesPath(letter._id));
});

// Keep a letter on my profile forever (sender or recipient, max 10).
lettersRouter.post('/:id/save', requireAuth, async (req, res) => {
  const letter = await findLetter(req, res);
  if (!letter) return;
  const me = req.user.id;
  const isRecipient = !!letter.recipientId && letter.recipientId.equals(me);
  const isSender = letter.senderId.equals(me);
  const now = new Date();
  if (!isRecipient && !isSender) return res.status(403).json({ error: 'Not your letter.' });
  if (isRecipient && !letter.openedAt) return res.status(400).json({ error: 'Open the letter first.' });
  if (isRecipient && letter.expiresAt <= now) return res.status(410).json({ error: 'This letter has expired.' });

  if (!letter.savedBy.some((s) => s.userId.equals(me))) {
    if ((await savedCount(me)) >= config.maxSavedPerUser) {
      return res.status(400).json({ error: `Your profile already holds ${config.maxSavedPerUser} letters. Remove one first.` });
    }
    await letters.updateOne({ _id: letter._id }, { $push: { savedBy: { userId: me, at: now } } });
  }
  res.json({ ok: true, savedCount: await savedCount(me) });
});

lettersRouter.delete('/:id/save', requireAuth, async (req, res) => {
  await letters.updateOne({ _id: req.params.id }, { $pull: { savedBy: { userId: req.user.id } } });
  await deleteIfOrphan(req.params.id);
  res.json({ ok: true, savedCount: await savedCount(req.user.id) });
});

// Upvote a kept letter (toggles). Not your own.
lettersRouter.post('/:id/upvote', requireAuth, async (req, res) => {
  const letter = await findLetter(req, res);
  if (!letter) return;
  const me = req.user.id;
  if (letter.senderId.equals(me)) return res.status(400).json({ error: 'You cannot upvote your own letter.' });
  if (!letter.savedBy.length) return res.status(400).json({ error: 'Only letters kept on a profile can be upvoted.' });
  if (!(await canView(letter, req.user))) return res.status(403).json({ error: 'Not your letter.' });

  const added = await letters.updateOne(
    { _id: letter._id, upvotes: { $ne: me } },
    { $push: { upvotes: me }, $inc: { upvoteCount: 1 } },
  );
  if (!added.modifiedCount) {
    await letters.updateOne({ _id: letter._id, upvotes: me }, { $pull: { upvotes: me }, $inc: { upvoteCount: -1 } });
  }
  const fresh = await letters.findOne({ _id: letter._id }, { projection: { upvotes: 1, upvoteCount: 1 } });
  res.json({ upvotes: fresh.upvoteCount ?? 0, upvotedByMe: (fresh.upvotes ?? []).some((id) => id.equals(me)) });
});
