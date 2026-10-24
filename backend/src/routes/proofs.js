import express, { Router } from 'express';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { httpError, writeAtomic } from '../files.js';
import { requireAuth } from '../auth.js';
import { findByName, getAccount } from '../store/accounts.js';
import { blockedEitherWay } from '../social.js';
import { take } from '../limits.js';
import { confirmFacts, settleOnServer } from '../services.js';
import { createProof, getProof, pendingFor, askedBy, answerProof, bundleOf, proofLookPath } from '../store/proofs.js';
import { keys as K, record as R, fromB64url } from 'penpals-law';

// Live proofs (store/proofs.js). Ask someone; they answer by writing the
// phrase their key and your challenge name, on the sheet those name; you get a
// bundle anyone can check offline.
export const proofsRouter = Router();
const smallJson = express.json({ limit: '8kb' });
const inkJson = express.json({ limit: '256kb' });

const view = (p, me) => ({
  id: p.id,
  from: p.from,
  to: p.to,
  challenge: p.challenge,
  createdAt: p.createdAt,
  expiresAt: p.expiresAt,
  answeredAt: p.answeredAt ?? null,
  mine: p.fromId === me,
});

proofsRouter.post('/', requireAuth, smallJson, async (req, res) => {
  take('proofsUser', req.user.id);
  const to = findByName(String(req.body?.to ?? ''));
  if (!to || blockedEitherWay(req.user.id, to.id)) throw httpError(404, 'no_such_name', 'No such scripter.');
  if (to.id === req.user.id) throw httpError(400, 'self', 'Ask someone else.');
  const p = await createProof({ from: getAccount(req.user.id), to });
  res.status(201).json({ proof: view(p, req.user.id) });
});

// Asks waiting for me: each challenge, from which my device derives the sheet and phrase.
proofsRouter.get('/pending', requireAuth, (req, res) => {
  res.json({ proofs: pendingFor(req.user.id).map((p) => view(p, req.user.id)) });
});

proofsRouter.get('/mine', requireAuth, (req, res) => {
  res.json({ proofs: askedBy(req.user.id).map((p) => view(p, req.user.id)) });
});

// The answer: { line: { ink (use: proof, sheet and phrase from the challenge), seal, open } }.
proofsRouter.post('/:id/answer', requireAuth, inkJson, async (req, res) => {
  const p = getProof(req.params.id);
  if (!p || p.toId !== req.user.id) throw httpError(404, 'gone', 'That proof is gone.');
  if (p.answeredAt) throw httpError(409, 'answered', 'That proof is answered already.');
  const account = getAccount(req.user.id);
  const line = req.body?.line;
  const body = line?.ink;
  R.checkInkBody(body, { maxActsBytes: config.book.maxSignatureActsBytes * 4 });
  if (body.use !== 'proof') throw httpError(400, 'wrong_use', 'That is not a proof.');
  if (body.key !== account.publicKey) throw httpError(403, 'key_mismatch', 'Sealed by another key.');
  const pk = fromB64url(account.publicKey, 32);
  const { sheet, phrase } = K.proofOf(fromB64url(p.challenge, 32), pk);
  if (body.sheet !== sheet || body.proof.challenge !== p.challenge || body.proof.phrase !== phrase) {
    throw httpError(400, 'wrong_proof', 'That is not the sheet and phrase this ask names.');
  }
  const D = R.verifySealed(line, pk);
  const seed = R.verifyOpenFor(body, D, line.open);
  const settled = await confirmFacts(body, seed, { ua: req.get('user-agent') ?? '' });
  const done = await answerProof(p.id, { ink: body, seal: line.seal, open: line.open });
  await writeAtomic(proofLookPath(p.id), Buffer.from(settled.png)).catch(() => {});
  res.json({ proof: view(done, req.user.id) });
});

const mayRead = (p, me) => !!me && (p.fromId === me || p.toId === me);

proofsRouter.get('/:id', requireAuth, (req, res) => {
  const p = getProof(req.params.id);
  if (!p || !mayRead(p, req.user.id)) throw httpError(404, 'gone', 'That proof is gone.');
  const key = getAccount(p.toId)?.publicKey;
  res.set('Cache-Control', 'private, no-cache');
  res.json(bundleOf(p, key));
});

proofsRouter.get('/:id/look', requireAuth, async (req, res) => {
  const p = getProof(req.params.id);
  if (!p || !mayRead(p, req.user.id) || !p.line) throw httpError(404, 'gone', 'No answer to show.');
  let png = await fs.readFile(proofLookPath(p.id)).catch(() => null);
  if (!png) {
    const seed = fromB64url(p.line.open.seed, 64);
    // a proof is read as it was written (fresh): it shows the hand, not the ink's age
    const out = await settleOnServer({ law: p.line.ink.law, acts: fromB64url(p.line.ink.acts), seed, family: p.line.ink.paper, png: true, key: `proof:${p.id}` });
    png = Buffer.from(out.png);
    await writeAtomic(proofLookPath(p.id), png).catch(() => {});
  }
  res.set('Cache-Control', 'private, max-age=3600');
  res.type('png').send(png);
});
