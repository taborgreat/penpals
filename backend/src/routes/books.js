import express, { Router } from 'express';
import { config } from '../config.js';
import { httpError } from '../files.js';
import { requireAuth } from '../auth.js';
import { findByName, getAccount } from '../store/accounts.js';
import { bookBytes, chainBytes, signatureOf, familyOf, openSeed, landSignature } from '../store/books.js';
import { readCached, writeCached, lookPath, lookName } from '../store/cache.js';
import { countView } from '../store/exposure.js';
import { litHours } from '../store/rooms.js';
import { canSeeProfile } from '../social.js';
import { take, ipKey } from '../limits.js';
import { confirmFacts, settleOnServer, viewOf } from '../services.js';
import { keys as K, record as R, fromB64url, b64url } from 'penpals-law';

// Books (books.md, keys.md; Tabor, 2026-10-25): a person's book is their chain: their signature and everything
// they made of paper (store/books.js). Anyone who may see the profile gets the chain; its owner downloads it
// as a .book, and signs their name again.
//   GET /api/books/:name           { name, key, fingerprint, law, family (their signature's paper), signature }
//   GET /api/books/:name/ink       the chain, as it is
//   GET /api/books/:name/download  the .book: a head line, then the chain
//   PUT /api/books/me/signature    { line: { ink, seal, open } }: sign again
export const booksRouter = Router();

const inkJson = express.json({ limit: '2mb' });

// The book's owner for `:name` ("me" = you), if this viewer may see it.
function owner(req) {
  const name = req.params.name;
  const account = name === 'me' ? getAccount(req.user?.id) : findByName(name);
  if (!account) throw name === 'me' ? httpError(401, 'signed_out', 'Please sign in.') : httpError(404, 'no_such_name', 'No such scripter.');
  const me = req.user?.id ?? null;
  if (!canSeeProfile(me, account)) throw httpError(403, 'private', 'This book is private.');
  return account;
}

booksRouter.get('/:name', async (req, res) => {
  const account = owner(req);
  res.set('Cache-Control', 'private, no-cache');
  res.json({
    name: account.username,
    key: account.publicKey,
    fingerprint: K.fingerprint(fromB64url(account.publicKey, 32)),
    law: config.law.current,
    family: await familyOf(account.id),
    signature: (await signatureOf(account.id))?.id ?? null,
  });
});

// The chain as-is: JSON lines, complete lines only. Strokes are public; every paper is open from birth.
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

// The look of a signature (routes/signatures.js): a PNG of its settled ink (colour to alpha), one pixel per
// cell, as it is now: aged since it was signed (oak gall darkens) and faded by how often it has been seen;
// each viewer counts once a day.
export async function sendLook(req, res, account, line, scale, { cacheControl = 'private, max-age=300' } = {}) {
  const law = line.ink.law;
  const views = law >= 2 ? await countView('user', account.id, line.id, req.user?.id ?? ipKey(req)) : 0;
  const view = viewOf(line.ink, await litHours(account.id, Date.parse(line.made)), views);
  const etag = `"${lookName(line.id, scale, law, view)}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', cacheControl);
  res.set('Vary', 'Cookie');
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  const p = lookPath(account.id, line.id, scale, law, view);
  let png = await readCached(p);
  if (!png) {
    take('lookMissViewer', req.user?.id ?? ipKey(req));
    const seedText = await openSeed(account.id, line.ink.sheet);
    if (!seedText) throw httpError(410, 'seed_missing', "This sheet's paper is not open.");
    const seed = fromB64url(seedText, 64);
    if (b64url(K.commitOf(seed)) !== line.ink.commit) throw httpError(500, 'seed_mismatch', "This sheet's seed does not match its record.");
    const out = await settleOnServer({ law, acts: fromB64url(line.ink.acts), seed, family: R.familyOf(line.ink), scale, png: true, view, priority: 'view', key: `look:${account.id}:${etag}` });
    png = Buffer.from(out.png);
    await writeCached(p, png).catch((err) => console.warn('[cache]', err.message));
  }
  res.type('png').send(png);
}

// What a new signature looks like: just signed, not yet seen.
const FRESH = { ageH: 0, views: 0 };

// Sign again: { line: { ink, seal, open: { seed, by } } }. A signature is open from birth (anyone can check
// it offline) and becomes the profile's signature.
booksRouter.put('/me/signature', requireAuth, inkJson, async (req, res) => {
  take('inkUser', req.user.id);
  const { line } = req.body ?? {};
  const account = getAccount(req.user.id);
  const body = line?.ink;
  R.checkInkBody(body, { maxActsBytes: config.book.maxSignatureActsBytes });
  if (body.use !== 'signature') throw httpError(400, 'wrong_use', `This is a ${body.use} record, not a signature.`);
  if (body.key !== account.publicKey) throw httpError(403, 'key_mismatch', 'Sealed by another key.');
  if (body.sheet === K.SHEET_ZERO) throw httpError(400, 'bad_sheet', 'Sheet 0 is the registration signature.');
  if (body.name !== account.username) throw httpError(400, 'bad_signature', 'A signature is your own name.');
  const D = R.verifySealed(line, fromB64url(account.publicKey, 32));
  const seed = R.verifyOpenFor(body, D, line.open);
  const settled = await confirmFacts(body, seed, { ua: req.get('user-agent') ?? '' });
  const out = await landSignature(account.id, { line: { ink: body, seal: line.seal, open: line.open }, D });
  await writeCached(lookPath(account.id, out.ink, 64, body.law, FRESH), Buffer.from(settled.png)).catch(() => {});
  res.status(out.replay ? 200 : 201).json(out);
});
