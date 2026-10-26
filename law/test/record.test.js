import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInk, makeOpen, checkInkBody, verifySealed, verifySeedFor, regrow } from '../record.js';
import { verifyBook, verifyProof } from '../verify.js';
import { makePaper, makePaperAct } from '../paper.js';
import { skFromK, publicKeyOf, newSheetId, sheetSeed, proofOf, SHEET_ZERO } from '../keys.js';
import { b64url, jcs } from '../tags.js';
import { fixtureBytes } from '../tools/fixtures.js';

const sk = skFromK(new Uint8Array(32).fill(1));
const pk = publicKeyOf(sk);
const sk2 = skFromK(new Uint8Array(32).fill(2));
const family = { grain: 6, weight: 9, tooth: 0 };
const acts = fixtureBytes('hairline').bytes;

test('a sealed record checks, and any change to it does not', () => {
  const sheet = newSheetId();
  const { line, seed, D } = makeInk({ sk, pk, sheet, use: 'book', family, acts });
  checkInkBody(line.ink);
  assert.deepEqual([...verifySealed(line, pk)], [...D]);
  verifySeedFor(line.ink, seed);
  // tamper with the facts, the use, the paper, the box: the seal breaks
  for (const change of [{ facts: b64url(new Uint8Array(32)) }, { use: 'letter' }, { paper: { grain: 7, weight: 9, tooth: 0 } }, { box: [0, 0, 1, 1] }]) {
    assert.throws(() => verifySealed({ ...line, ink: { ...line.ink, ...change } }, pk), /seal/);
  }
  // another key cannot claim it
  assert.throws(() => verifySealed({ ...line, ink: { ...line.ink, key: b64url(publicKeyOf(sk2)) } }, publicKeyOf(sk2)), /seal/);
  // a seed for another sheet, or another valid-looking seed, is refused
  assert.throws(() => verifySeedFor(line.ink, sheetSeed(sk, newSheetId())), /seed/);
  assert.throws(() => verifySeedFor(line.ink, sheetSeed(sk2, sheet)), /seed/);
});

test("the paper is the key's: regrowing with the seed gives exactly the sealed facts", () => {
  const sheet = newSheetId();
  const { line, seed } = makeInk({ sk, pk, sheet, use: 'book', family, acts });
  assert.equal(regrow(line.ink, seed).ok, true);
  // the same strokes on another key's paper settle differently
  const forged = makeInk({ sk: sk2, pk: publicKeyOf(sk2), sheet, use: 'book', family, acts });
  assert.notEqual(forged.line.ink.facts, line.ink.facts);
});

test('shape rules: uses, sheets, names, unknown fields', () => {
  const sig = makeInk({ sk, pk, sheet: SHEET_ZERO, use: 'signature', family, acts, name: 'ana' });
  checkInkBody(sig.line.ink);
  assert.throws(() => checkInkBody({ ...sig.line.ink, name: undefined }), /name|fields/);
  assert.throws(() => checkInkBody({ ...sig.line.ink, use: 'book' }), /name|sheet/);
  assert.throws(() => checkInkBody({ ...sig.line.ink, extra: 1 }), /fields/);
  const book = makeInk({ sk, pk, sheet: newSheetId(), use: 'book', family, acts });
  assert.throws(() => checkInkBody({ ...book.line.ink, sheet: proofOf(new Uint8Array(32), pk).sheet }), /sheet/);
  assert.throws(() => checkInkBody({ ...book.line.ink, law: 5 }), /law/); // (a law not known here)
  assert.throws(() => checkInkBody({ ...book.line.ink, matter: 'wood' }), /law 4/); // (other matter only under law 4)
  assert.throws(() => checkInkBody({ ...book.line.ink, law: 4, matter: 'air' }), /matter/); // (matter that takes ink)
  assert.throws(() => checkInkBody({ ...book.line.ink, acts: b64url(new Uint8Array([1, 2, 3])) }), /acts/);
  // the canonical body is integers and ASCII only
  assert.doesNotThrow(() => jcs(book.line.ink));
});

test('a .book verifies offline: its chain alone (the signature, a paper and its acts), sealed, regrown, and tampering caught', () => {
  const name = 'ana';
  const sig = makeInk({ sk, pk, sheet: SHEET_ZERO, use: 'signature', family, acts, name });
  const sigLine = { id: 'k_000001', made: '2026-10-23T00:00:00.000Z', ...sig.line, open: makeOpen(sk, sig.D, SHEET_ZERO, sig.seed) };
  const paper = newSheetId();
  const born = makePaper({ sk, pk, paper, family, at: [1.5, 2.4, 0.74] });
  const paperLine = { id: 'k_000002', made: '2026-10-23T00:00:01.000Z', paper: born };
  const take = makePaperAct({ sk, pk, paper, k: 1, act: 'take' });
  const put = makePaperAct({ sk, pk, paper, k: 2, act: 'put', space: b64url(pk), at: [0.5, 0.5, 1] });
  const acts1 = { id: 'k_000003', made: '2026-10-23T00:00:02.000Z', on: paper, n: 1, at: 1000, ...take };
  const acts2 = { id: 'k_000004', made: '2026-10-23T00:00:03.000Z', on: paper, n: 2, at: 2000, ...put };
  const head = { book: 3, name, key: b64url(pk), law: 2 };
  const book = (...lines) => `${[head, ...lines].map((l) => JSON.stringify(l)).join('\n')}\n`;
  const report = verifyBook(book(sigLine, paperLine, acts1, acts2));
  assert.equal(report.ok, true, JSON.stringify(report.problems.concat(report.results.filter((r) => r.error).map((r) => r.error))));
  assert.deepEqual(
    report.results.map((r) => [r.kind, r.sealed, r.open, r.regrown]),
    [
      ['ink', true, true, true],
      ['paper', true, true, true],
      ['paper-act', true, false, null],
      ['paper-act', true, false, null],
    ],
  );
  // an act changed after it was sealed: the paper does not replay, the book does not check
  assert.equal(verifyBook(book(sigLine, paperLine, acts1, { ...acts2, act: { ...acts2.act, at: [900, 500, 1000] } })).ok, false);
  // a removed line is noticed
  assert.equal(verifyBook(book(sigLine, acts1, acts2)).ok, false);
  // a book of before (a layout of pages) is not this kind
  assert.equal(verifyBook(book(sigLine).replace('"book":3', '"book":2')).ok, false);
});

test('a proof bundle verifies from the challenge and the key alone', () => {
  const challenge = new Uint8Array(32).fill(5);
  const { sheet, phrase } = proofOf(challenge, pk);
  const p = makeInk({ sk, pk, sheet, use: 'proof', family, acts, proof: { challenge: b64url(challenge), phrase } });
  const bundle = { proof: 1, id: 'x', of: { name: 'ana', key: b64url(pk) }, challenge: b64url(challenge), line: { ...p.line, open: makeOpen(sk, p.D, sheet, p.seed) } };
  assert.equal(verifyProof(bundle).ok, true);
  assert.equal(verifyProof({ ...bundle, challenge: b64url(new Uint8Array(32).fill(6)) }).ok, false);
});
