import express, { Router } from 'express';
import { config } from '../config.js';
import { requireAuth } from '../auth.js';
import { findByName, getAccount } from '../store/accounts.js';
import { addInk, bookBytes, chainBytes, cleanInk, edit, getSkeleton } from '../store/books.js';
import { canSeeProfile, hasBlocked } from '../social.js';

// Books (books.md): visitors get the files, skeleton first (its version is the
// cache tag), then the ink. The owner sends micro edits, one at a time, each
// against the version they had. The server never renders a page.
export const booksRouter = Router();

const smallJson = express.json({ limit: '64kb' });
const bigJson = express.json({ limit: '2mb' }); // new ink can be bigger than an edit

// The book's owner for `:name` ("me" = you), if this viewer may see it.
function owner(req, res) {
  const name = req.params.name;
  const account = name === 'me' ? getAccount(req.user?.id) : findByName(name);
  if (!account) {
    res.status(name === 'me' ? 401 : 404).json({ error: name === 'me' ? 'Please log in.' : 'No such scripter.' });
    return null;
  }
  const me = req.user?.id ?? null;
  if (me && me !== account.id && hasBlocked(account, me)) {
    res.status(404).json({ error: 'No such scripter.' });
    return null;
  }
  if (!canSeeProfile(me, account)) {
    res.status(403).json({ error: 'This book is private. Only their friends can see it.' });
    return null;
  }
  return account;
}

const tag = (version) => `W/"v${version}"`;

// The skeleton: pages, items, links, backgrounds, signature ref.
booksRouter.get('/:name', async (req, res) => {
  const account = owner(req, res);
  if (!account) return;
  const skeleton = await getSkeleton(account.id);
  res.set('ETag', tag(skeleton.version));
  res.set('Cache-Control', 'no-cache');
  if (req.get('If-None-Match') === tag(skeleton.version)) return res.status(304).end();
  res.json({ name: account.username, page: { width: config.book.pageWidth, height: config.book.pageHeight }, skeleton });
});

// The ink chain as-is: JSON lines, complete lines only.
booksRouter.get('/:name/ink', async (req, res) => {
  const account = owner(req, res);
  if (!account) return;
  res.set('Cache-Control', 'no-cache');
  res.type('application/x-ndjson');
  res.send(await chainBytes(account.id));
});

// The whole book as one file: <name>.book (skeleton line, then the chain).
// Only the owner downloads it (a ruling in books.md; config.book.visitorsCanDownload).
booksRouter.get('/:name/download', async (req, res) => {
  const account = owner(req, res);
  if (!account) return;
  if (account.id !== req.user?.id && !config.book.visitorsCanDownload) {
    return res.status(403).json({ error: 'Only its owner can download a book.' });
  }
  res.set('Content-Disposition', `attachment; filename="${account.username}.book"`);
  res.type('text/plain; charset=utf-8');
  res.send(await bookBytes(account.id, account.username));
});

const editReply = (res, err) => {
  if (err.stale) return res.status(409).json({ error: err.message, stale: true, version: err.version });
  throw err;
};

// One micro edit: { op, ...fields, base }. Replies { version, ... } or 409 stale.
booksRouter.post('/me/edit', requireAuth, smallJson, async (req, res) => {
  const { base, ...op } = req.body ?? {};
  try {
    res.json(await edit(req.user.id, op, typeof base === 'number' ? base : null));
  } catch (err) {
    editReply(res, err);
  }
});

// New ink: { ink: { strokes, bounds }, place?: { op: 'add', page, x, y, scale, color }, base }.
// The ink is appended to the chain first, then placed by an edit.
booksRouter.post('/me/ink', requireAuth, bigJson, async (req, res) => {
  const ink = cleanInk(req.body?.ink);
  if (typeof ink === 'string') return res.status(400).json({ error: ink });
  const place = req.body?.place ? { ...req.body.place, op: 'add' } : null;
  const base = typeof req.body?.base === 'number' ? req.body.base : null;
  try {
    res.status(201).json(await addInk(req.user.id, ink, place, base));
  } catch (err) {
    editReply(res, err);
  }
});

// Signatures, which are book ink like any other: the skeleton holds a ref.
// PUT /api/books/me/signature { ink, color } signs (new ink + a 'signature' edit).
booksRouter.put('/me/signature', requireAuth, bigJson, async (req, res) => {
  const ink = cleanInk(req.body?.ink);
  if (typeof ink === 'string') return res.status(400).json({ error: ink });
  const color = config.signatureColors.includes(req.body?.color) ? req.body.color : undefined;
  const out = await addInk(req.user.id, ink, { op: 'signature', color }, null);
  res.json(out);
});
