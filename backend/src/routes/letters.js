import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { config } from '../config.js';
import { requireAuth } from '../auth.js';
import { findByName, getAccount, updateAccount } from '../store/accounts.js';
import {
  allLetters, at, createLetter, deleteLetter, getLetter, inMail, inkPath, savedCount, strokesPath, updateLetter,
} from '../store/letters.js';
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
  const me = viewer?.id ?? null;
  return {
    id: l.id,
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
    kept: l.savedBy.length > 0,
    saveCount: l.savedBy.length,
    savedByMe: !!me && l.savedBy.some((s) => s.userId === me),
    isMine: !!me && l.senderId === me,
    upvotes: l.upvotes.length,
    upvotedByMe: !!me && l.upvotes.includes(me),
    inkUrl: `/api/letters/${l.id}/ink`,
    strokesUrl: l.hasStrokes ? `/api/letters/${l.id}/strokes` : null,
  };
}

// Who may see a letter: its recipient while it is in the mail, its sender while
// they keep it, and anyone who can see the profile of somebody keeping it.
// Blocks hide letters both ways.
function canView(letter, user, now = Date.now()) {
  const me = user?.id ?? null;
  if (me && letter.recipientId === me && at(letter.expiresAt) > now) return true;
  if (me && letter.senderId === me && letter.savedBy.some((s) => s.userId === me)) return true;
  if (!letter.savedBy.length) return false;
  if (me && letter.senderId !== me && blockedEitherWay(me, letter.senderId)) return false;
  return letter.savedBy.some((s) => {
    const keeper = getAccount(s.userId);
    return keeper && canSeeProfile(me, keeper);
  });
}

function findLetter(req, res) {
  const letter = getLetter(req.params.id);
  if (!letter) res.status(404).json({ error: 'That letter is gone.' });
  return letter;
}

// Nobody keeps it and it is not in the mail: it goes now, not at the next cleanup.
async function deleteIfOrphan(id) {
  const l = getLetter(id);
  if (!l || l.savedBy.length || inMail(l)) return;
  await deleteLetter(id);
}

// Why `me` may not write to `recipient`, or null when they may.
function sendRefusal(me, recipient) {
  if (recipient.id === me.id) return { status: 400, error: 'You cannot write to yourself.' };
  if (hasBlocked(getAccount(me.id), recipient.id)) return { status: 403, error: 'You have blocked this scripter.' };
  if (hasBlocked(recipient, me.id)) return { status: 404, error: 'No such scripter.' };
  if (recipient.private && relation(me.id, recipient.id) !== 'friends') {
    return { status: 403, error: 'Only their friends can write to them.' };
  }
  return null;
}

// Two letters per rolling hour. Returns the 429 body, or null.
function rateLimit(meId, now) {
  const since = now - config.sendLimit.windowMs;
  const recent = allLetters()
    .filter((l) => l.senderId === meId && at(l.sentAt) > since)
    .map((l) => at(l.sentAt))
    .sort((a, b) => a - b);
  if (recent.length < config.sendLimit.count) return null;
  return {
    error: `You can only send ${config.sendLimit.count} letters an hour.`,
    retryAt: new Date(recent[0] + config.sendLimit.windowMs).toISOString(),
  };
}

const delivery = (recipient, now) => ({
  recipientId: recipient.id,
  to: recipient.username,
  sentAt: new Date(now).toISOString(),
  expiresAt: new Date(now + config.unopenedTtlMs).toISOString(),
});

const countSent = (userId) => updateAccount(userId, (a) => { a.lettersSent = (a.lettersSent ?? 0) + 1; });

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

  const now = Date.now();
  let recipient = null;
  if (String(to).trim()) {
    recipient = findByName(String(to).trim());
    if (!recipient) return res.status(404).json({ error: 'No such scripter.' });
    const refusal = sendRefusal(req.user, recipient);
    if (refusal) return res.status(refusal.status).json({ error: refusal.error });
    const limited = rateLimit(req.user.id, now);
    if (limited) return res.status(429).json(limited);
  }
  const room = savedCount(req.user.id) < config.maxSavedPerUser;
  if (!recipient && !room) {
    return res.status(400).json({ error: `Your profile already holds ${config.maxSavedPerUser} letters. Remove one first.` });
  }

  const stamp = new Date(now).toISOString();
  const letter = await createLetter({
    id: crypto.randomBytes(12).toString('base64url'),
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
    createdAt: stamp,
    savedBy: room ? [{ userId: req.user.id, at: stamp }] : [],
    upvotes: [],
    openedAt: null,
    ...(recipient ? delivery(recipient, now) : { recipientId: null, to: null, sentAt: null, expiresAt: null }),
  }, inkFile.buffer, strokesFile?.buffer);
  if (recipient) await countSent(req.user.id);
  res.status(201).json({ letter: letterJson(letter, req.user), kept: room });
});

// Letters waiting for me (unopened, or opened and still within their 24 h).
lettersRouter.get('/inbox', requireAuth, (req, res) => {
  const hidden = new Set(blockedIds(req.user.id));
  const list = allLetters()
    .filter((l) => l.recipientId === req.user.id && !hidden.has(l.senderId) && inMail(l))
    .sort((a, b) => at(b.sentAt) - at(a.sentAt));
  res.json({ letters: list.map((l) => letterJson(l, req.user)) });
});

// What I have sent lately (status only; the ink belongs to the recipient now).
lettersRouter.get('/sent', requireAuth, (req, res) => {
  const list = allLetters()
    .filter((l) => l.senderId === req.user.id && l.sentAt)
    .sort((a, b) => at(b.sentAt) - at(a.sentAt))
    .slice(0, 20);
  res.json({ letters: list.map((l) => letterJson(l, req.user)) });
});

// Most upvoted kept letters that this viewer may see.
lettersRouter.get('/top', (req, res) => {
  const list = allLetters()
    .filter((l) => l.savedBy.length && l.upvotes.length)
    .sort((a, b) => b.upvotes.length - a.upvotes.length || at(b.createdAt) - at(a.createdAt))
    .filter((l) => canView(l, req.user))
    .slice(0, 10);
  res.json({ letters: list.map((l) => letterJson(l, req.user)) });
});

lettersRouter.get('/:id', (req, res) => {
  const letter = findLetter(req, res);
  if (!letter) return;
  if (!canView(letter, req.user)) return res.status(403).json({ error: 'Not your letter.' });
  res.json({ letter: letterJson(letter, req.user) });
});

// Send one of my letters to one person. A letter is sent once, ever.
lettersRouter.post('/:id/send', requireAuth, async (req, res) => {
  const letter = findLetter(req, res);
  if (!letter) return;
  if (letter.senderId !== req.user.id) return res.status(403).json({ error: 'Not your letter.' });
  if (letter.recipientId) return res.status(400).json({ error: 'This letter has already been sent.' });
  const recipient = findByName(req.body?.to ?? '');
  if (!recipient) return res.status(404).json({ error: 'No such scripter.' });
  const refusal = sendRefusal(req.user, recipient);
  if (refusal) return res.status(refusal.status).json({ error: refusal.error });
  const now = Date.now();
  const limited = rateLimit(req.user.id, now);
  if (limited) return res.status(429).json(limited);

  let sent = false;
  const updated = await updateLetter(letter.id, (l) => {
    if (l.recipientId) return false;
    Object.assign(l, delivery(recipient, now));
    sent = true;
    return true;
  });
  if (!sent) return res.status(409).json({ error: 'This letter has already been sent.' });
  await countSent(req.user.id);
  res.json({ letter: letterJson(updated, req.user) });
});

// Opening starts the 24 h clock.
lettersRouter.post('/:id/open', requireAuth, async (req, res) => {
  const letter = findLetter(req, res);
  if (!letter) return;
  if (letter.recipientId !== req.user.id) return res.status(403).json({ error: 'Not your letter.' });
  const now = Date.now();
  if (at(letter.expiresAt) <= now) return res.status(410).json({ error: 'This letter has expired.' });
  const updated = await updateLetter(letter.id, (l) => {
    if (l.openedAt) return false;
    l.openedAt = new Date(now).toISOString();
    l.expiresAt = new Date(Math.min(at(l.expiresAt), now + config.openedTtlMs)).toISOString();
    return true;
  });
  res.json({ letter: letterJson(updated, req.user) });
});

// The ink itself: a PNG whose alpha channel is the writing.
lettersRouter.get('/:id/ink', (req, res) => {
  const letter = findLetter(req, res);
  if (!letter) return;
  if (!canView(letter, req.user)) return res.status(403).json({ error: 'Not your letter.' });
  res.set('Cache-Control', 'private, max-age=300');
  res.type('png');
  res.sendFile(inkPath(letter.id));
});

// The strokes: weighted, timed pen paths (deflated binary).
lettersRouter.get('/:id/strokes', (req, res) => {
  const letter = findLetter(req, res);
  if (!letter) return;
  if (!letter.hasStrokes) return res.status(404).json({ error: 'This letter has no strokes.' });
  if (!canView(letter, req.user)) return res.status(403).json({ error: 'Not your letter.' });
  res.set('Cache-Control', 'private, max-age=300');
  res.type('application/octet-stream');
  res.sendFile(strokesPath(letter.id));
});

// Keep a letter on my profile forever (sender or recipient, max 10).
lettersRouter.post('/:id/save', requireAuth, async (req, res) => {
  const letter = findLetter(req, res);
  if (!letter) return;
  const me = req.user.id;
  const isRecipient = letter.recipientId === me;
  const isSender = letter.senderId === me;
  const now = Date.now();
  if (!isRecipient && !isSender) return res.status(403).json({ error: 'Not your letter.' });
  if (isRecipient && !letter.openedAt) return res.status(400).json({ error: 'Open the letter first.' });
  if (isRecipient && at(letter.expiresAt) <= now) return res.status(410).json({ error: 'This letter has expired.' });
  if (!letter.savedBy.some((s) => s.userId === me)) {
    if (savedCount(me) >= config.maxSavedPerUser) {
      return res.status(400).json({ error: `Your profile already holds ${config.maxSavedPerUser} letters. Remove one first.` });
    }
    await updateLetter(letter.id, (l) => {
      if (l.savedBy.some((s) => s.userId === me)) return false;
      l.savedBy.push({ userId: me, at: new Date(now).toISOString() });
      return true;
    });
  }
  res.json({ ok: true, savedCount: savedCount(me) });
});

lettersRouter.delete('/:id/save', requireAuth, async (req, res) => {
  const me = req.user.id;
  await updateLetter(req.params.id, (l) => {
    const before = l.savedBy.length;
    l.savedBy = l.savedBy.filter((s) => s.userId !== me);
    return l.savedBy.length !== before;
  });
  await deleteIfOrphan(req.params.id);
  res.json({ ok: true, savedCount: savedCount(me) });
});

// Upvote a kept letter (toggles). Not your own.
lettersRouter.post('/:id/upvote', requireAuth, async (req, res) => {
  const letter = findLetter(req, res);
  if (!letter) return;
  const me = req.user.id;
  if (letter.senderId === me) return res.status(400).json({ error: 'You cannot upvote your own letter.' });
  if (!letter.savedBy.length) return res.status(400).json({ error: 'Only letters kept on a profile can be upvoted.' });
  if (!canView(letter, req.user)) return res.status(403).json({ error: 'Not your letter.' });
  const updated = await updateLetter(letter.id, (l) => {
    l.upvotes = l.upvotes.includes(me) ? l.upvotes.filter((id) => id !== me) : [...l.upvotes, me];
  });
  res.json({ upvotes: updated.upvotes.length, upvotedByMe: updated.upvotes.includes(me) });
});
