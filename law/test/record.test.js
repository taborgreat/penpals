import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInk, makeOpen, checkInkBody, verifySealed, verifySeedFor, regrow } from '../record.js';
import { verifyBook, verifyProof } from '../verify.js';
import { skFromK, publicKeyOf, newSheetId, sheetSeed, proofOf, SHEET_ZERO } from '../keys.js';
import { b64url, fromB64url, jcs } from '../tags.js';
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
  assert.throws(() => checkInkBody({ ...book.line.ink, law: 3 }), /law/);
  assert.throws(() => checkInkBody({ ...book.line.ink, acts: b64url(new Uint8Array([1, 2, 3])) }), /acts/);
  // the canonical body is integers and ASCII only
  assert.doesNotThrow(() => jcs(book.line.ink));
});

test('a .book verifies offline: sealed lines, an open sheet regrown, and tampering caught', () => {
  const name = 'ana';
  const sig = makeInk({ sk, pk, sheet: SHEET_ZERO, use: 'signature', family, acts, name });
  const sigLine = { id: 'k_000001', made: '2026-10-23T00:00:00.000Z', ...sig.line, open: makeOpen(sk, sig.D, SHEET_ZERO, sig.seed) };
  const page = makeInk({ sk, pk, sheet: newSheetId(), use: 'book', family, acts });
  const pageLine = { id: 'k_000002', made: '2026-10-23T00:00:01.000Z', ...page.line };
  const later = { id: 'k_000003', made: '2026-10-23T00:00:02.000Z', open: page.line.ink.sheet, ref: 'k_000002', ...makeOpen(sk, page.D, page.line.ink.sheet, page.seed) };
  const head = {
    book: 2,
    name,
    key: b64url(pk),
    law: 2,
    version: 3,
    signature: 'k_000001',
    paperFamily: family,
    home: 'home',
    nextItem: 2,
    pages: { home: { background: '#ffffff', items: [{ id: 'i1', ink: 'k_000002', x: 10, y: 10, scale: 64 }] } },
  };
  const text = [head, sigLine, pageLine, later].map((l) => JSON.stringify(l)).join('\n') + '\n';
  const report = verifyBook(text);
  assert.equal(report.ok, true, JSON.stringify(report.problems.concat(report.results.filter((r) => r.error).map((r) => r.error))));
  assert.deepEqual(
    report.results.map((r) => [r.sealed, r.open, r.regrown]),
    [
      [true, true, true],
      [true, true, true],
      [false, true, null],
    ],
  );
  // one changed point in the page's acts: that line fails, the book does not check
  const acts2 = fromB64url(page.line.ink.acts);
  acts2[acts2.length - 1] ^= 1;
  const tampered = text.replace(page.line.ink.acts, b64url(acts2));
  const bad = verifyBook(tampered);
  assert.equal(bad.ok, false);
  // a removed line is noticed
  assert.equal(verifyBook([head, sigLine, later].map((l) => JSON.stringify(l)).join('\n') + '\n').ok, false);
});

test('a proof bundle verifies from the challenge and the key alone', () => {
  const challenge = new Uint8Array(32).fill(5);
  const { sheet, phrase } = proofOf(challenge, pk);
  const p = makeInk({ sk, pk, sheet, use: 'proof', family, acts, proof: { challenge: b64url(challenge), phrase } });
  const bundle = { proof: 1, id: 'x', of: { name: 'ana', key: b64url(pk) }, challenge: b64url(challenge), line: { ...p.line, open: makeOpen(sk, p.D, sheet, p.seed) } };
  assert.equal(verifyProof(bundle).ok, true);
  assert.equal(verifyProof({ ...bundle, challenge: b64url(new Uint8Array(32).fill(6)) }).ok, false);
});
