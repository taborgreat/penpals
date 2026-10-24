import express, { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from '../config.js';
import { httpError } from '../files.js';
import { requireAuth } from '../auth.js';
import { findByName, getAccount, updateAccount } from '../store/accounts.js';
import { sheetUsedInBook } from '../store/books.js';
import {
  allLetters, at, createLetter, deleteLetter, getLetter, inMail, inkPath, savedCount, strokesPath, updateLetter,
  readLine, readSeed, lookDir, exists, sheetUsedInLetters,
} from '../store/letters.js';
import { blockedEitherWay, blockedIds, canSeeProfile, hasBlocked, relation } from '../social.js';
import { take } from '../limits.js';
import { confirmFacts, settleOnServer, decodeField } from '../services.js';
import { sendFilm } from './books.js';
import { writeAtomic } from '../files.js';
import { keys as K, record as R, fromB64url, hex } from 'penpals-law';

export const lettersRouter = Router();
const letterJson = express.json({ limit: '3mb' });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxInkBytes, files: 2, fields: 10 },
}).fields([{ name: 'ink', maxCount: 1 }, { name: 'strokes', maxCount: 1 }]);

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Read width/height straight from the PNG header instead of trusting the client.
function pngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// A traced strokes file (photo letters): deflated 'PNPS' + version + size + count.
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

export function letterJsonOf(l, viewer) {
  const me = viewer?.id ?? null;
  return {
    id: l.id,
    kind: l.kind,
    from: l.from,
    to: l.to ?? null,
    sheet: l.sheet,
    page: l.page ?? null,
    box: l.box ?? null,
    width: l.width,
    height: l.height,
    bytes: l.bytes,
    strokesBytes: l.strokesBytes ?? 0,
    strokeCount: l.strokeCount ?? 0,
    display: l.display ?? (l.kind === 'pad' ? 'look' : 'mask'),
    playable: l.playable !== false,
    inkColor: l.inkColor ?? null,
    background: l.background,
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
    lineUrl: `/api/letters/${l.id}/line`,
    lookUrl: l.kind === 'pad' ? `/api/letters/${l.id}/look` : null,
    inkUrl: l.kind === 'photo' ? `/api/letters/${l.id}/ink` : null,
    strokesUrl: l.kind === 'photo' && l.hasStrokes ? `/api/letters/${l.id}/strokes` : null,
  };
}
export { letterJsonOf as letterJson };

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

function findLetter(req) {
  const letter = getLetter(req.params.id);
  if (!letter) throw httpError(404, 'gone', 'That letter is gone.');
  return letter;
}

async function deleteIfOrphan(id) {
  const l = getLetter(id);
  if (!l || l.savedBy.length || inMail(l)) return;
  await deleteLetter(id);
}

function sendRefusal(me, recipient) {
  if (recipient.id === me.id) return httpError(400, 'self', 'You cannot write to yourself.');
  if (hasBlocked(getAccount(me.id), recipient.id)) return httpError(403, 'blocked', 'You have blocked this scripter.');
  if (hasBlocked(recipient, me.id)) return httpError(404, 'no_such_name', 'No such scripter.');
  if (recipient.private && relation(me.id, recipient.id) !== 'friends') return httpError(403, 'friends_only', 'Only their friends can write to them.');
  return null;
}

function rateLimit(meId, now) {
  const since = now - config.sendLimit.windowMs;
  const recent = allLetters().filter((l) => l.senderId === meId && at(l.sentAt) > since).map((l) => at(l.sentAt)).sort((a, b) => a - b);
  if (recent.length < config.sendLimit.count) return null;
  return Object.assign(httpError(429, 'send_limit', `You can only send ${config.sendLimit.count} letters an hour.`), { retryAt: new Date(recent[0] + config.sendLimit.windowMs).toISOString() });
}

const delivery = (recipient, now) => ({
  recipientId: recipient.id,
  to: recipient.username,
  sentAt: new Date(now).toISOString(),
  expiresAt: new Date(now + config.unopenedTtlMs).toISOString(),
});

const countSent = (userId) => updateAccount(userId, (a) => { a.lettersSent = (a.lettersSent ?? 0) + 1; });

// Where it goes (if anywhere) and whether the sender's profile has room.
function addressing(req, to, now) {
  let recipient = null;
  if (String(to ?? '').trim()) {
    recipient = findByName(String(to).trim());
    if (!recipient) throw httpError(404, 'no_such_name', 'No such scripter.');
    const refusal = sendRefusal(req.user, recipient);
    if (refusal) throw refusal;
    const limited = rateLimit(req.user.id, now);
    if (limited) throw limited;
  }
  const room = savedCount(req.user.id) < config.maxSavedPerUser;
  if (!recipient && !room) throw httpError(400, 'profile_full', `Your profile already holds ${config.maxSavedPerUser} letters. Remove one first.`);
  return { recipient, room };
}

function baseMeta(req, { kind, sheet, recipient, room, now, background, playable }) {
  if (!config.letterBackgrounds.includes(background)) throw httpError(400, 'bad_background', 'Unknown paper.');
  const stamp = new Date(now).toISOString();
  return {
    id: crypto.randomBytes(12).toString('base64url'),
    kind,
    senderId: req.user.id,
    from: req.user.username,
    sheet,
    background,
    playable: playable !== false && playable !== '0' && playable !== 'false',
    createdAt: stamp,
    savedBy: room ? [{ userId: req.user.id, at: stamp }] : [],
    upvotes: [],
    openedAt: null,
    ...(recipient ? delivery(recipient, now) : { recipientId: null, to: null, sentAt: null, expiresAt: null }),
  };
}

// A letter written on the pad: { line: { ink (use: letter), seal }, seed, background, page: { width, height }, to?, playable? }.
lettersRouter.post('/', requireAuth, letterJson, async (req, res) => {
  take('lettersUser', req.user.id);
  const account = getAccount(req.user.id);
  const { line, background = 'plain', page = null, to = '', playable } = req.body ?? {};
  const body = line?.ink;
  R.checkInkBody(body, { maxActsBytes: config.book.maxLetterActsBytes });
  if (body.use !== 'letter') throw httpError(400, 'wrong_use', `This is a ${body.use} record, not a letter.`);
  if (body.key !== account.publicKey) throw httpError(403, 'key_mismatch', 'Sealed by another key.');
  const D = R.verifySealed(line, fromB64url(account.publicKey, 32));
  const seed = decodeField(req.body.seed, 64, 'seed');
  R.verifySeedFor(body, seed);
  if (sheetUsedInLetters(account.id, body.sheet) || await sheetUsedInBook(account.id, body.sheet)) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
  const now = Date.now();
  const { recipient, room } = addressing(req, to, now);
  if (!page || !Number.isInteger(page.width) || !Number.isInteger(page.height) || page.width < 100 || page.width > 4000 || page.height < 100 || page.height > 6000) {
    throw httpError(400, 'bad_page', 'A letter names its page size.');
  }
  const settled = await confirmFacts(body, seed, { timeout: config.render.timeoutMs.letter, ua: req.get('user-agent') ?? '' });
  const meta = {
    ...baseMeta(req, { kind: 'pad', sheet: body.sheet, recipient, room, now, background, playable }),
    source: 'pad',
    page,
    box: body.box,
    width: page.width,
    height: page.height,
    bytes: fromB64url(body.acts).length,
    digest: hex(D),
  };
  const letter = await createLetter(meta, { line: { ink: body, seal: line.seal }, seed: K.keyText(seed) });
  await writeAtomic(path.join(lookDir(letter.id), '64.png'), Buffer.from(settled.png)).catch(() => {});
  if (recipient) await countSent(req.user.id);
  res.status(201).json({ letter: letterJsonOf(letter, req.user), kept: room });
});

// A photographed letter: multipart `ink` (the scan as a PNG), optional `strokes`
// (the traced strokes), and `line` (JSON: a photo body sealed by the key, whose
// hashes name exactly these files). The scan is the ink; no paper is grown.
lettersRouter.post('/photo', requireAuth, upload, async (req, res) => {
  take('lettersUser', req.user.id);
  const account = getAccount(req.user.id);
  const inkFile = req.files?.ink?.[0];
  const strokesFile = req.files?.strokes?.[0];
  if (!inkFile) throw httpError(400, 'no_ink', 'Missing ink file.');
  const size = pngSize(inkFile.buffer);
  if (!size) throw httpError(400, 'bad_png', 'Ink must be a PNG.');
  const strokes = strokesFile ? strokesInfo(strokesFile.buffer, size) : null;
  if (strokesFile && !strokes) throw httpError(400, 'bad_strokes', 'Bad strokes file.');
  let line;
  try {
    line = JSON.parse(req.body.line ?? '');
  } catch {
    throw httpError(400, 'bad_record', 'Missing sealed line.');
  }
  R.checkPhotoBody(line?.ink);
  const body = line.ink;
  if (body.key !== account.publicKey) throw httpError(403, 'key_mismatch', 'Sealed by another key.');
  R.verifySealed(line, fromB64url(account.publicKey, 32));
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  if (body.png !== sha(inkFile.buffer) || body.strokes !== (strokesFile ? sha(strokesFile.buffer) : null)) throw httpError(400, 'bad_hash', 'The sealed record names other files.');
  if (body.size[0] !== size.width || body.size[1] !== size.height) throw httpError(400, 'bad_size', 'The sealed size is not the scan\'s size.');
  if (sheetUsedInLetters(account.id, body.sheet) || await sheetUsedInBook(account.id, body.sheet)) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
  const { inkColor = '#1a1a1a', background = 'plain', display = 'mask', playable, to = '' } = req.body;
  if (!/^#[0-9a-f]{6}$/i.test(inkColor)) throw httpError(400, 'bad_color', 'Bad ink color.');
  const now = Date.now();
  const { recipient, room } = addressing(req, to, now);
  const meta = {
    ...baseMeta(req, { kind: 'photo', sheet: body.sheet, recipient, room, now, background, playable }),
    source: 'photo',
    width: size.width,
    height: size.height,
    bytes: inkFile.size,
    hasStrokes: !!strokes,
    strokeCount: strokes?.count ?? 0,
    strokesBytes: strokesFile?.size ?? 0,
    display: strokes && display === 'strokes' ? 'strokes' : 'mask',
    inkColor: inkColor.toLowerCase(),
  };
  const letter = await createLetter(meta, { line, png: inkFile.buffer, strokes: strokesFile?.buffer });
  if (recipient) await countSent(req.user.id);
  res.status(201).json({ letter: letterJsonOf(letter, req.user), kept: room });
});

lettersRouter.get('/inbox', requireAuth, (req, res) => {
  const hidden = new Set(blockedIds(req.user.id));
  const list = allLetters()
    .filter((l) => l.recipientId === req.user.id && !hidden.has(l.senderId) && inMail(l))
    .sort((a, b) => at(b.sentAt) - at(a.sentAt));
  res.json({ letters: list.map((l) => letterJsonOf(l, req.user)) });
});

lettersRouter.get('/sent', requireAuth, (req, res) => {
  const list = allLetters()
    .filter((l) => l.senderId === req.user.id && l.sentAt)
    .sort((a, b) => at(b.sentAt) - at(a.sentAt))
    .slice(0, 20);
  res.json({ letters: list.map((l) => letterJsonOf(l, req.user)) });
});

lettersRouter.get('/top', (req, res) => {
  const list = allLetters()
    .filter((l) => l.savedBy.length && l.upvotes.length)
    .sort((a, b) => b.upvotes.length - a.upvotes.length || at(b.createdAt) - at(a.createdAt))
    .filter((l) => canView(l, req.user))
    .slice(0, 10);
  res.json({ letters: list.map((l) => letterJsonOf(l, req.user)) });
});

lettersRouter.get('/:id', (req, res) => {
  const letter = findLetter(req);
  if (!canView(letter, req.user)) throw httpError(403, 'not_yours', 'Not your letter.');
  res.json({ letter: letterJsonOf(letter, req.user) });
});

// The sealed record: the acts (public to whoever may read the letter) and its seal.
lettersRouter.get('/:id/line', async (req, res) => {
  const letter = findLetter(req);
  if (!canView(letter, req.user)) throw httpError(403, 'not_yours', 'Not your letter.');
  res.set('Cache-Control', 'private, max-age=300');
  res.json({ line: await readLine(letter.id) });
});

// The look of a pad letter, grown from its private seed (cached in the letter's folder).
lettersRouter.get('/:id/look', async (req, res) => {
  const letter = findLetter(req);
  if (letter.kind !== 'pad') throw httpError(404, 'no_look', 'This letter is a photograph.');
  if (!canView(letter, req.user)) throw httpError(403, 'not_yours', 'Not your letter.');
  res.set('Cache-Control', 'private, max-age=300');
  res.set('Vary', 'Cookie');
  const p = path.join(lookDir(letter.id), '64.png');
  let png = await fs.readFile(p).catch(() => null);
  if (!png) {
    const line = await readLine(letter.id);
    const seedText = await readSeed(letter.id);
    if (!line || !seedText) throw httpError(410, 'gone', 'That letter is gone.');
    const seed = fromB64url(seedText, 64);
    if (K.keyText(K.commitOf(seed)) !== line.ink.commit) throw httpError(500, 'seed_mismatch', 'This letter\'s seed does not match its record.');
    const out = await settleOnServer({ acts: fromB64url(line.ink.acts), seed, family: line.ink.paper, png: true, key: `letter:${letter.id}`, timeout: config.render.timeoutMs.letter });
    png = Buffer.from(out.png);
    if (exists(letter.id)) await writeAtomic(p, png).catch(() => {}); // never recreate a deleted letter's folder
  }
  res.type('png').send(png);
});

// The film of a pad letter: it being written (see books.js sendFilm).
lettersRouter.get('/:id/film', async (req, res) => {
  const letter = findLetter(req);
  if (letter.kind !== 'pad') throw httpError(404, 'no_film', 'This letter is a photograph.');
  if (!canView(letter, req.user)) throw httpError(403, 'not_yours', 'Not your letter.');
  const line = await readLine(letter.id);
  if (!line) throw httpError(410, 'gone', 'That letter is gone.');
  // kept in the letter's own folder: it goes when the letter does (never recreated after)
  await sendFilm(req, res, path.join(lookDir(letter.id), 'film.pnkf'), line.ink, () => readSeed(letter.id), `letter-film:${letter.id}`, () => exists(letter.id));
});

lettersRouter.post('/:id/send', requireAuth, express.json({ limit: '4kb' }), async (req, res) => {
  const letter = findLetter(req);
  if (letter.senderId !== req.user.id) throw httpError(403, 'not_yours', 'Not your letter.');
  if (letter.recipientId) throw httpError(400, 'already_sent', 'This letter has already been sent.');
  const recipient = findByName(req.body?.to ?? '');
  if (!recipient) throw httpError(404, 'no_such_name', 'No such scripter.');
  const refusal = sendRefusal(req.user, recipient);
  if (refusal) throw refusal;
  const now = Date.now();
  const limited = rateLimit(req.user.id, now);
  if (limited) throw limited;
  let sent = false;
  const updated = await updateLetter(letter.id, (l) => {
    if (l.recipientId) return false;
    Object.assign(l, delivery(recipient, now));
    sent = true;
    return true;
  });
  if (!sent) throw httpError(409, 'already_sent', 'This letter has already been sent.');
  await countSent(req.user.id);
  res.json({ letter: letterJsonOf(updated, req.user) });
});

lettersRouter.post('/:id/open', requireAuth, async (req, res) => {
  const letter = findLetter(req);
  if (letter.recipientId !== req.user.id) throw httpError(403, 'not_yours', 'Not your letter.');
  const now = Date.now();
  if (at(letter.expiresAt) <= now) throw httpError(410, 'expired', 'This letter has expired.');
  const updated = await updateLetter(letter.id, (l) => {
    if (l.openedAt) return false;
    l.openedAt = new Date(now).toISOString();
    l.expiresAt = new Date(Math.min(at(l.expiresAt), now + config.openedTtlMs)).toISOString();
    return true;
  });
  res.json({ letter: letterJsonOf(updated, req.user) });
});

// A photographed letter's scan.
lettersRouter.get('/:id/ink', (req, res) => {
  const letter = findLetter(req);
  if (letter.kind !== 'photo') throw httpError(404, 'no_ink', 'This letter has no scan.');
  if (!canView(letter, req.user)) throw httpError(403, 'not_yours', 'Not your letter.');
  res.set('Cache-Control', 'private, max-age=300');
  res.type('png');
  res.sendFile(inkPath(letter.id));
});

lettersRouter.get('/:id/strokes', (req, res) => {
  const letter = findLetter(req);
  if (letter.kind !== 'photo' || !letter.hasStrokes) throw httpError(404, 'no_strokes', 'This letter has no traced strokes.');
  if (!canView(letter, req.user)) throw httpError(403, 'not_yours', 'Not your letter.');
  res.set('Cache-Control', 'private, max-age=300');
  res.type('application/octet-stream');
  res.sendFile(strokesPath(letter.id));
});

lettersRouter.post('/:id/save', requireAuth, async (req, res) => {
  const letter = findLetter(req);
  const me = req.user.id;
  const isRecipient = letter.recipientId === me;
  const isSender = letter.senderId === me;
  const now = Date.now();
  if (!isRecipient && !isSender) throw httpError(403, 'not_yours', 'Not your letter.');
  if (isRecipient && !letter.openedAt) throw httpError(400, 'not_opened', 'Open the letter first.');
  if (isRecipient && at(letter.expiresAt) <= now) throw httpError(410, 'expired', 'This letter has expired.');
  if (!letter.savedBy.some((s) => s.userId === me)) {
    if (savedCount(me) >= config.maxSavedPerUser) throw httpError(400, 'profile_full', `Your profile already holds ${config.maxSavedPerUser} letters. Remove one first.`);
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

lettersRouter.post('/:id/upvote', requireAuth, async (req, res) => {
  const letter = findLetter(req);
  const me = req.user.id;
  if (letter.senderId === me) throw httpError(400, 'own_letter', 'You cannot upvote your own letter.');
  if (!letter.savedBy.length) throw httpError(400, 'not_kept', 'Only letters kept on a profile can be upvoted.');
  if (!canView(letter, req.user)) throw httpError(403, 'not_yours', 'Not your letter.');
  const updated = await updateLetter(letter.id, (l) => {
    l.upvotes = l.upvotes.includes(me) ? l.upvotes.filter((id) => id !== me) : [...l.upvotes, me];
  });
  res.json({ upvotes: updated.upvotes.length, upvotedByMe: updated.upvotes.includes(me) });
});
