// Records: the sealed bodies that hold a sheet of writing, and the checks every
// reader (server, BookViewer, the CLI) applies to them.
//
// ink body (sealed: D = sha256(T("ink") ‖ JCS(body)), seal = sign(sk, T("seal") ‖ D))
//   { v: 2, kind: "ink", law, use, sheet, key, name?, proof?, paper: {grain, weight, tooth},
//     acts: b64url(PNKA), box: [x0, y0, w, h], commit: b64url(H(seed)), facts: b64url(factsDigest) }
// photo body  { v: 2, kind: "photo", use: "letter", sheet, key, size: [w, h], png: hex, strokes: hex | null }
// login body  { v: 2, kind: "login", law, key, nonce, sketch, measure, acts: hex }   (the acts stay on the device)
//
// The body is integers and printable ASCII only, so its canonical JSON is the
// same everywhere. The seal covers the facts digest (what the ink settled to),
// the use, and for a signature the name: a record cannot be replayed into
// another context or attached to another sheet's paper.

import { sha256 } from '@noble/hashes/sha2.js';
import { checkFamily } from './v1/paper.js';
import { LAW as HAND_LAW } from './v1/constants.js';
import { lawOf, CURRENT, ACCEPTED } from './laws.js';
import {
  sheetSeed, commitOf, paperKeyOf, recordDigest, sealOf, verifySeal, verifySeed, openBy, verifyOpen, isSheetId,
  isGoodPublicKey, KEY_BYTES, SIG_BYTES,
} from './keys.js';
import { b64url, fromB64url, hex, equalBytes } from './tags.js';

export const USES = ['book', 'signature', 'letter', 'proof'];
export const NAME_RE = /^[a-z0-9_]{2,20}$/i;
export const LAWS_ACCEPTED = ACCEPTED;
export { CURRENT as LAW_CURRENT };
const HEX64 = /^[0-9a-f]{64}$/;

export class RecordError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    // a seal or an open that does not verify is a signature that is not this key's
    this.status = code === 'bad_seal' || code === 'bad_open' ? 401 : 400;
  }
}
const bad = (code, msg) => new RecordError(code, msg);

// --- settling a record on its paper ---

// The facts of acts grown under `law` on the paper of `seed` with `family`, at `scale` (64 = 1×).
export function settle(actsBytes, seed, family, scale = 64, law = CURRENT) {
  const L = lawOf(law);
  const rec = L.decodeCanonical(actsBytes);
  const res = L.grow(rec, { paperKey: paperKeyOf(seed), family, scale });
  const cells = L.settledCells(res.tiles);
  const box = L.boxOf(cells);
  return { law, cells, box, facts: L.factsDigest({ cells, box, actsBytes, family, scale }), rec, ticks: res.ticks, work: res.work };
}
// The look of settled facts at a view ({ ageH, views }; law 1 ignores it).
export const lookOf = (settled, view = {}) => lawOf(settled.law).lookRGB(settled.cells, settled.box, view);

// --- making (the writer's device) ---

export function makeInk({ sk, pk, sheet, use, family, acts, name, proof, law = CURRENT }) {
  if (!USES.includes(use) || !isSheetId(sheet)) throw bad('bad_record', 'bad use or sheet');
  const seed = sheetSeed(sk, sheet);
  const s = settle(acts, seed, family, 64, law);
  return { ...sealSettled({ sk, pk, sheet, use, family, acts, seed, box: s.box, facts: s.facts, name, proof, law }), seed, settled: s };
}

// The same record from facts already grown (the writer's device grows them in
// its ink worker, off the main thread). The server grows them again and refuses
// the record if they differ.
export function sealSettled({ sk, pk, sheet, use, family, acts, seed, box, facts, name, proof, law = CURRENT }) {
  if (!USES.includes(use) || !isSheetId(sheet)) throw bad('bad_record', 'bad use or sheet');
  if (!ACCEPTED.includes(law)) throw bad('law_unknown', 'this law version is not accepted');
  const body = {
    v: 2, kind: 'ink', law, use, sheet, key: b64url(pk), paper: { grain: family.grain, weight: family.weight, tooth: family.tooth },
    acts: b64url(acts), box: [...box], commit: b64url(commitOf(seed)), facts: b64url(facts),
  };
  if (name !== undefined) body.name = name;
  if (proof !== undefined) body.proof = proof;
  const D = recordDigest(body);
  return { line: { ink: body, seal: b64url(sealOf(sk, D)) }, D };
}

export const makeOpen = (sk, D, sheet, seed) => ({ seed: b64url(seed), by: b64url(openBy(sk, D, sheet)) });

export function makePhoto({ sk, pk, sheet, size, png, strokes }) {
  const body = { v: 2, kind: 'photo', use: 'letter', sheet, key: b64url(pk), size, png: hex(sha256(png)), strokes: strokes ? hex(sha256(strokes)) : null };
  const D = recordDigest(body);
  return { line: { ink: body, seal: b64url(sealOf(sk, D)) }, D };
}

export function makeLogin({ sk, pk, nonce, sketch, measure, acts }) {
  const body = { v: 2, kind: 'login', law: HAND_LAW, key: b64url(pk), nonce: b64url(nonce), sketch, measure, acts: hex(sha256(acts)) };
  const D = recordDigest(body);
  return { body, seal: b64url(sealOf(sk, D)), D };
}

// --- checking shape (no keys needed) ---

const isInt = (v) => Number.isSafeInteger(v);
const keysExactly = (o, required, optional = []) => {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return false;
  const ks = Object.keys(o);
  return required.every((k) => ks.includes(k)) && ks.every((k) => required.includes(k) || optional.includes(k));
};
const b64Len = (s, n) => {
  try {
    return typeof s === 'string' && fromB64url(s).length === n;
  } catch {
    return false;
  }
};

// Returns { acts (bytes), rec (decoded acts) } for a well-formed ink body, or throws.
export function checkInkBody(body, { maxActsBytes = 1 << 20 } = {}) {
  if (!keysExactly(body, ['v', 'kind', 'law', 'use', 'sheet', 'key', 'paper', 'acts', 'box', 'commit', 'facts'], ['name', 'proof'])) throw bad('bad_record', 'unexpected or missing fields');
  if (body.v !== 2 || body.kind !== 'ink') throw bad('bad_record', 'not an ink record');
  if (!LAWS_ACCEPTED.includes(body.law)) throw bad('law_unknown', 'this law version is not accepted');
  if (!USES.includes(body.use)) throw bad('bad_record', 'bad use');
  if (!isSheetId(body.sheet)) throw bad('bad_record', 'bad sheet id');
  if (body.use === 'proof' ? !body.sheet.startsWith('p') : body.sheet.startsWith('p')) throw bad('bad_record', 'sheet id does not match its use');
  if (body.sheet === '0' && body.use !== 'signature') throw bad('bad_record', 'sheet 0 is the registration signature');
  if (!b64Len(body.key, KEY_BYTES) || !isGoodPublicKey(fromB64url(body.key))) throw bad('bad_key', 'bad key');
  if ((body.use === 'signature') !== (body.name !== undefined)) throw bad('bad_record', 'a signature carries the name, nothing else does');
  if (body.name !== undefined && (typeof body.name !== 'string' || !NAME_RE.test(body.name))) throw bad('bad_record', 'bad name');
  if ((body.use === 'proof') !== (body.proof !== undefined)) throw bad('bad_record', 'a proof carries its challenge');
  if (body.proof !== undefined && (!keysExactly(body.proof, ['challenge', 'phrase']) || !b64Len(body.proof.challenge, 32) || typeof body.proof.phrase !== 'string' || !/^[a-z]+( [a-z]+){3}$/.test(body.proof.phrase))) throw bad('bad_record', 'bad proof');
  if (!keysExactly(body.paper, ['grain', 'weight', 'tooth'])) throw bad('bad_record', 'bad paper family');
  checkFamily(body.paper);
  if (!Array.isArray(body.box) || body.box.length !== 4 || !body.box.every(isInt)) throw bad('bad_record', 'bad box');
  if (!b64Len(body.commit, 32) || !b64Len(body.facts, 32)) throw bad('bad_record', 'bad commit or facts');
  let acts;
  try {
    acts = fromB64url(body.acts);
  } catch {
    throw bad('bad_record', 'acts are base64url');
  }
  if (acts.length > maxActsBytes) throw bad('too_much_ink', 'that is too much writing for one sheet');
  let rec;
  try {
    rec = lawOf(body.law).decodeCanonical(acts);
  } catch (err) {
    throw bad('bad_acts', `acts: ${err.message}`);
  }
  return { acts, rec };
}

export function checkPhotoBody(body) {
  if (!keysExactly(body, ['v', 'kind', 'use', 'sheet', 'key', 'size', 'png', 'strokes'])) throw bad('bad_record', 'unexpected or missing fields');
  if (body.v !== 2 || body.kind !== 'photo' || body.use !== 'letter' || !isSheetId(body.sheet) || !body.sheet.startsWith('s')) throw bad('bad_record', 'not a photo letter');
  if (!b64Len(body.key, KEY_BYTES) || !isGoodPublicKey(fromB64url(body.key))) throw bad('bad_key', 'bad key');
  if (!Array.isArray(body.size) || body.size.length !== 2 || !body.size.every((v) => isInt(v) && v > 0 && v < 20000)) throw bad('bad_record', 'bad size');
  if (!HEX64.test(body.png) || !(body.strokes === null || HEX64.test(body.strokes))) throw bad('bad_record', 'bad hashes');
}

export function checkLoginBody(body) {
  if (!keysExactly(body, ['v', 'kind', 'law', 'key', 'nonce', 'sketch', 'measure', 'acts'])) throw bad('bad_record', 'unexpected or missing fields');
  if (body.v !== 2 || body.kind !== 'login' || !LAWS_ACCEPTED.includes(body.law)) throw bad('bad_record', 'not a login record');
  if (!b64Len(body.key, KEY_BYTES) || !b64Len(body.nonce, 32) || typeof body.sketch !== 'string' || !/^[A-Za-z0-9_-]{12}$/.test(body.sketch)) throw bad('bad_record', 'bad login record');
  if (!isInt(body.measure) || !HEX64.test(body.acts)) throw bad('bad_record', 'bad login record');
}

// --- verifying (keys, no secrets) ---

// The seal of a line under `key` (bytes). Returns D.
export function verifySealed(line, key) {
  if (!line || typeof line.seal !== 'string' || !b64Len(line.seal, SIG_BYTES)) throw bad('bad_seal', 'no seal');
  const D = recordDigest(line.ink);
  if (!equalBytes(fromB64url(line.ink.key), key)) throw bad('key_mismatch', 'sealed by another key');
  if (!verifySeal(key, D, fromB64url(line.seal))) throw bad('bad_seal', 'the seal does not verify');
  return D;
}

// A seed for this record's sheet: it is the key's, and it is the one the record committed to.
export function verifySeedFor(body, seed) {
  const key = fromB64url(body.key);
  if (!(seed instanceof Uint8Array) || seed.length !== SIG_BYTES || !verifySeed(key, body.sheet, seed)) throw bad('bad_seed', 'the seed is not this key\'s seed for this sheet');
  if (b64url(commitOf(seed)) !== body.commit) throw bad('bad_commit', 'the seed is not the one this record committed to');
}

export function verifyOpenFor(body, D, open) {
  if (!open || !b64Len(open.seed, SIG_BYTES) || !b64Len(open.by, SIG_BYTES)) throw bad('bad_open', 'bad open');
  const seed = fromB64url(open.seed);
  verifySeedFor(body, seed);
  if (!verifyOpen(fromB64url(body.key), D, body.sheet, fromB64url(open.by))) throw bad('bad_open', 'the open is not signed by the key');
  return seed;
}

// Regrow the ink from the seed and compare with what the record sealed.
export function regrow(body, seed) {
  const s = settle(fromB64url(body.acts), seed, body.paper, 64, body.law);
  const ok = b64url(s.facts) === body.facts && JSON.stringify(s.box) === JSON.stringify(body.box);
  return { ok, settled: s };
}
