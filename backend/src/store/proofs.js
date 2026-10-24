import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { readJson, writeJson, serial, listDirs, httpError } from '../files.js';

// Live proofs (keys.md): someone asks a writer to show, now, that they hold
// their key. The ask is a fresh random challenge; with the writer's key it
// fixes a sheet (p…) and a four-word phrase nobody could know before the ask.
// The writer writes the phrase on that sheet, seals it, and opens it from
// birth; anyone holding the bundle checks it offline (law/verify.js).
//   data/proofs/<id>/proof.json  { id, fromId, toId, from, to, challenge, createdAt, expiresAt, answeredAt?, line? }
//   data/proofs/<id>/look/64.png the answer's look (disposable)

const proofsDir = path.join(config.dataDir, 'proofs');
export const proofDir = (id) => path.join(proofsDir, id);
const proofFile = (id) => path.join(proofDir(id), 'proof.json');
export const proofLookPath = (id) => path.join(proofDir(id), 'look', '64.png');

const index = new Map(); // id → proof.json
const ID = /^[A-Za-z0-9_-]{16}$/;

export async function loadProofs() {
  index.clear();
  for (const id of await listDirs(proofsDir)) {
    const p = await readJson(proofFile(id), null);
    if (!p) {
      await fs.rm(proofDir(id), { recursive: true, force: true }); // never finished
      continue;
    }
    index.set(id, p);
  }
  return index.size;
}

export const getProof = (id) => (ID.test(String(id)) ? index.get(id) ?? null : null);
const live = (p, now) => !p.answeredAt && Date.parse(p.expiresAt) > now;
export const pendingFor = (userId, now = Date.now()) => [...index.values()].filter((p) => p.toId === userId && live(p, now));
export const askedBy = (userId) => [...index.values()].filter((p) => p.fromId === userId);

export async function createProof({ from, to }, now = Date.now()) {
  return serial(`proofs:${to.id}`, async () => {
    if (pendingFor(to.id, now).length >= config.proofs.pendingPerTarget) throw httpError(429, 'too_many_asks', 'They have enough proofs to answer already; ask again later.');
    const id = crypto.randomBytes(12).toString('base64url');
    const p = {
      id,
      fromId: from.id,
      toId: to.id,
      from: from.username,
      to: to.username,
      challenge: crypto.randomBytes(32).toString('base64url'),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + config.proofs.pendingTtlMs).toISOString(),
    };
    await fs.mkdir(proofDir(id), { recursive: true });
    await writeJson(proofFile(id), p);
    index.set(id, p);
    return p;
  });
}

// The answer lands once; `check` runs under the lock, after the expensive checks.
export function answerProof(id, line, now = Date.now()) {
  return serial(`proof:${id}`, async () => {
    const p = index.get(id);
    if (!p) throw httpError(404, 'gone', 'That proof is gone.');
    if (p.answeredAt) throw httpError(409, 'answered', 'That proof is answered already.');
    if (Date.parse(p.expiresAt) <= now) throw httpError(410, 'expired', 'That ask has expired.');
    const next = { ...p, answeredAt: new Date(now).toISOString(), line };
    await writeJson(proofFile(id), next);
    index.set(id, next);
    return next;
  });
}

// Unanswered asks past their time go; answered proofs stay a week.
export async function sweepProofs(now = Date.now()) {
  for (const p of [...index.values()]) {
    const end = p.answeredAt ? Date.parse(p.answeredAt) + config.proofs.answeredTtlMs : Date.parse(p.expiresAt);
    if (end > now) continue;
    index.delete(p.id);
    await fs.rm(proofDir(p.id), { recursive: true, force: true }).catch(() => {});
  }
}

// What anyone checks offline: node law/bin/verify.js proof.json
export const bundleOf = (p, key) => ({ proof: 1, challenge: p.challenge, of: { name: p.to, key }, asked: { by: p.from, at: p.createdAt }, answeredAt: p.answeredAt ?? null, line: p.line ?? null });
