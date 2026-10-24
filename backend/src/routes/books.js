import express, { Router } from 'express';
import { config } from '../config.js';
import { httpError } from '../files.js';
import { requireAuth } from '../auth.js';
import { findByName, getAccount } from '../store/accounts.js';
import {
  bookBytes, chainBytes, edit, getSkeleton, inkLine, sheetLine, openSeed, digestOf, landInk, landOpen, dryRunEdit, NEW_INK,
} from '../store/books.js';
import { CLIENT_OPS, SCALE } from '../store/ops.js';
import { seedOf } from '../store/seeds.js';
import { sheetUsedInLetters } from '../store/letters.js';
import { readCached, writeCached, lookPath, filmPath } from '../store/cache.js';
import fs from 'node:fs/promises';
import { writeAtomic } from '../files.js';
import { canSeeProfile, hasBlocked } from '../social.js';
import { take, ipKey } from '../limits.js';
import { confirmFacts, settleOnServer, filmOnServer, decodeField } from '../services.js';
import { keys as K, record as R, fromB64url, b64url } from 'penpals-law';

// Books (books.md, keys.md): visitors get the skeleton, the chain, and looks
// (the settled ink, rendered by the server from the sheet's private seed). The
// owner sends layout edits with the cookie; every mark also carries a seal by
// the account's key.
export const booksRouter = Router();

const smallJson = express.json({ limit: '64kb' });
const inkJson = express.json({ limit: '2mb' });

// The book's owner for `:name` ("me" = you), if this viewer may see it.
function owner(req) {
  const name = req.params.name;
  const account = name === 'me' ? getAccount(req.user?.id) : findByName(name);
  if (!account) throw name === 'me' ? httpError(401, 'signed_out', 'Please sign in.') : httpError(404, 'no_such_name', 'No such scripter.');
  const me = req.user?.id ?? null;
  if (me && me !== account.id && hasBlocked(account, me)) throw httpError(404, 'no_such_name', 'No such scripter.');
  if (!canSeeProfile(me, account)) throw httpError(403, 'private', 'This book is private. Only their friends can see it.');
  return account;
}

const tag = (version) => `W/"v${version}"`;

booksRouter.get('/:name', async (req, res) => {
  const account = owner(req);
  const skeleton = await getSkeleton(account.id);
  res.set('ETag', tag(skeleton.version));
  res.set('Cache-Control', 'private, no-cache');
  if (req.get('If-None-Match') === tag(skeleton.version)) return res.status(304).end();
  res.json({
    name: account.username,
    key: account.publicKey,
    fingerprint: K.fingerprint(fromB64url(account.publicKey, 32)),
    law: config.law.current,
    page: { width: config.book.pageWidth, height: config.book.pageHeight },
    skeleton,
  });
});

// The chain as-is: JSON lines, complete lines only. Strokes are public; seeds of
// closed sheets are never in it.
booksRouter.get('/:name/ink', async (req, res) => {
  const account = owner(req);
  res.set('Cache-Control', 'private, no-cache');
  res.type('application/x-ndjson');
  res.send(await chainBytes(account.id));
});

booksRouter.get('/:name/download', async (req, res) => {
  const account = owner(req);
  if (account.id !== req.user?.id && !config.book.visitorsCanDownload) throw httpError(403, 'owner_only', 'Only its owner can download a book.');
  res.set('Content-Disposition', `attachment; filename="${account.username}.book"`);
  res.type('text/plain; charset=utf-8');
  res.send(await bookBytes(account.id, account));
});

// The look of one piece of ink at one size: a PNG of the settled ink (colour to
// alpha), one pixel per cell. Visibility is checked before anything is served
// from the cache. Visitors only get looks of ink that is on a page at that size,
// or of the signature.
booksRouter.get('/:name/look/:inkId', async (req, res) => {
  const account = owner(req);
  const inkId = req.params.inkId;
  const s = req.query.s;
  const scale = s === undefined ? SCALE.one : typeof s === 'string' && /^[1-9]\d{0,3}$/.test(s) ? Number(s) : NaN;
  if (!/^k_\d{6}$/.test(inkId) || !Number.isInteger(scale) || scale < SCALE.min || scale > SCALE.max) throw httpError(400, 'bad_look', 'Bad look request.');
  const line = await inkLine(account.id, inkId);
  if (!line || line.ink.kind !== 'ink') throw httpError(404, 'no_ink', 'No such ink.');
  const skeleton = await getSkeleton(account.id);
  if (req.user?.id !== account.id) {
    const shown = (skeleton.signature === inkId && scale === SCALE.one)
      || Object.values(skeleton.pages).some((p) => p.items.some((it) => it.ink === inkId && it.scale === scale));
    if (!shown) throw httpError(404, 'no_ink', 'No such ink.');
  }
  await sendLook(req, res, account, line, scale);
});

// The film of one piece of ink (law/v1/film.js): it being written, frame by
// frame, as anyone who may see its look may see it. Made by the render pool
// from the sheet's seed; deflated; the device turns it into a video or GIF.
booksRouter.get('/:name/film/:inkId', async (req, res) => {
  const account = owner(req);
  const inkId = req.params.inkId;
  if (!/^k_\d{6}$/.test(inkId)) throw httpError(400, 'bad_film', 'Bad film request.');
  const line = await inkLine(account.id, inkId);
  if (!line || line.ink.kind !== 'ink') throw httpError(404, 'no_ink', 'No such ink.');
  if (req.user?.id !== account.id) {
    const skeleton = await getSkeleton(account.id);
    const shown = skeleton.signature === inkId || Object.values(skeleton.pages).some((p) => p.items.some((it) => it.ink === inkId));
    if (!shown) throw httpError(404, 'no_ink', 'No such ink.');
  }
  await sendFilm(req, res, filmPath(account.id, inkId), line.ink, async () => (await openSeed(account.id, line.ink.sheet)) ?? (await seedOf(account.id, line.ink.sheet)), `film:${account.id}:${inkId}`);
});

export async function sendFilm(req, res, file, body, seedText, key, keep = () => true) {
  res.set('Cache-Control', 'private, max-age=3600');
  res.set('Vary', 'Cookie');
  let film = await fs.readFile(file).catch(() => null);
  if (!film) {
    take('filmViewer', req.user?.id ?? ipKey(req));
    const text = await seedText();
    if (!text) throw httpError(410, 'seed_missing', 'The paper of this sheet is not on the server.');
    const seed = fromB64url(text, 64);
    if (b64url(K.commitOf(seed)) !== body.commit) throw httpError(500, 'seed_mismatch', 'The seed of this sheet does not match its record.');
    const out = await filmOnServer({ acts: fromB64url(body.acts), seed, family: body.paper, box: body.box, key });
    film = Buffer.from(out.film);
    if (keep()) await writeAtomic(file, film).catch((err) => console.warn('[film]', err.message));
  }
  res.type('application/octet-stream').send(film);
}

export async function sendLook(req, res, account, line, scale, { cacheControl = 'private, max-age=300' } = {}) {
  const etag = `"L${config.law.current}-r${config.render.rev}-${line.id}-${scale}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', cacheControl);
  res.set('Vary', 'Cookie');
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  const p = lookPath(account.id, line.id, scale);
  let png = await readCached(p);
  if (!png) {
    take('lookMissViewer', req.user?.id ?? ipKey(req));
    const seedText = (await openSeed(account.id, line.ink.sheet)) ?? (await seedOf(account.id, line.ink.sheet));
    if (!seedText) throw httpError(410, 'seed_missing', 'This sheet\'s paper is not on the server.');
    const seed = fromB64url(seedText, 64);
    if (b64url(K.commitOf(seed)) !== line.ink.commit) throw httpError(500, 'seed_mismatch', 'This sheet\'s seed does not match its record.');
    const out = await settleOnServer({ acts: fromB64url(line.ink.acts), seed, family: line.ink.paper, scale, png: true, priority: 'view', key: `look:${account.id}:${line.id}:${scale}` });
    png = Buffer.from(out.png);
    await writeCached(p, png).catch((err) => console.warn('[cache]', err.message));
  }
  res.type('png').send(png);
}

const editReply = (res, err) => {
  if (err.stale) return res.status(409).json({ error: err.message, code: 'stale', stale: true, version: err.version });
  throw err;
};

// One micro edit: { op, ...fields, base }. Replies { version, ... } or 409 stale.
booksRouter.post('/me/edit', requireAuth, smallJson, async (req, res) => {
  const { base, ...op } = req.body ?? {};
  if (!CLIENT_OPS.has(op.op)) throw httpError(400, 'bad_edit', `Unknown edit "${op.op}".`);
  try {
    res.json(await edit(req.user.id, op, typeof base === 'number' ? base : null));
  } catch (err) {
    editReply(res, err);
  }
});

// Checks shared by everything that lands a sheet of writing from this account.
async function checkSheetFromMe(req, line, use, maxActsBytes) {
  const account = getAccount(req.user.id);
  const body = line?.ink;
  R.checkInkBody(body, { maxActsBytes });
  if (body.use !== use) throw httpError(400, 'wrong_use', `This is a ${body.use} record, not ${use}.`);
  if (body.key !== account.publicKey) throw httpError(403, 'key_mismatch', 'Sealed by another key.');
  if (body.sheet === K.SHEET_ZERO) throw httpError(400, 'bad_sheet', 'Sheet 0 is the registration signature.');
  const pk = fromB64url(account.publicKey, 32);
  const D = R.verifySealed(line, pk);
  return { account, body, D };
}

// New ink: { line: { ink, seal }, seed, place?: { page, x, y, scale }, base? }.
booksRouter.post('/me/ink', requireAuth, inkJson, async (req, res) => {
  take('inkUser', req.user.id);
  const { line, place = null } = req.body ?? {};
  const base = typeof req.body?.base === 'number' ? req.body.base : null;
  const { account, body, D } = await checkSheetFromMe(req, line, 'book', config.book.maxActsBytes);
  const skeleton = await getSkeleton(account.id);
  if (JSON.stringify(body.paper) !== JSON.stringify(skeleton.paperFamily)) throw httpError(400, 'wrong_paper', 'Write on your own paper family.');
  const seed = decodeField(req.body.seed, 64, 'seed');
  R.verifySeedFor(body, seed);
  if (sheetUsedInLetters(account.id, body.sheet)) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
  const existing = await sheetLine(account.id, body.sheet);
  if (existing && !Buffer.from(await digestOf(account.id, existing)).equals(Buffer.from(D))) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
  const then = place ? { ...place, op: 'add' } : null;
  if (then && !existing) await dryRunEdit(account.id, { ...then, ink: NEW_INK }, body);
  const settled = existing ? null : await confirmFacts(body, seed, { ua: req.get('user-agent') ?? '' });
  try {
    const out = await landInk(account.id, { line: { ink: body, seal: line.seal }, D, seed: b64url(seed), then, base });
    if (settled?.png) await writeCached(lookPath(account.id, out.ink, 64), Buffer.from(settled.png)).catch(() => {});
    res.status(out.replay ? 200 : 201).json(out);
  } catch (err) {
    editReply(res, err);
  }
});

// Sign again: { line: { ink, seal, open: { seed, by } } }. A signature is open
// from birth (anyone can check it offline) and becomes the profile's signature.
booksRouter.put('/me/signature', requireAuth, inkJson, async (req, res) => {
  take('inkUser', req.user.id);
  const { line } = req.body ?? {};
  const { account, body, D } = await checkSheetFromMe(req, line, 'signature', config.book.maxSignatureActsBytes);
  if (body.name !== account.username) throw httpError(400, 'bad_signature', 'A signature is your own name.');
  const seed = R.verifyOpenFor(body, D, line.open);
  if (sheetUsedInLetters(account.id, body.sheet)) throw httpError(409, 'sheet_used', 'That sheet already holds other writing.');
  const settled = await confirmFacts(body, seed, { ua: req.get('user-agent') ?? '' });
  const out = await landInk(account.id, { line: { ink: body, seal: line.seal, open: line.open }, D, seed: null, then: { op: 'signature' } });
  await writeCached(lookPath(account.id, out.ink, 64), Buffer.from(settled.png)).catch(() => {});
  res.status(out.replay ? 200 : 201).json(out);
});

// Open a sheet: publish its seed, signed open by the key. { sheet, by, seed? }
// (the seed is on the server already for closed book sheets; a device may send it).
booksRouter.post('/me/open', requireAuth, smallJson, async (req, res) => {
  take('openUser', req.user.id);
  const account = getAccount(req.user.id);
  const { sheet, by } = req.body ?? {};
  if (!K.isSheetId(sheet)) throw httpError(400, 'bad_sheet', 'Bad sheet id.');
  const line = await sheetLine(account.id, sheet);
  if (!line) throw httpError(404, 'no_sheet', 'That sheet is not in your book.');
  if (await openSeed(account.id, sheet)) return res.json({ open: true, already: true });
  const seedText = req.body.seed ?? (await seedOf(account.id, sheet));
  if (!seedText) throw httpError(410, 'seed_missing', 'Send the seed: the server does not have it.');
  const D = await digestOf(account.id, line);
  R.verifyOpenFor(line.ink, D, { seed: seedText, by });
  const out = await landOpen(account.id, { sheet, seed: seedText, by });
  res.status(201).json({ open: true, id: out.id });
});
