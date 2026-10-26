// Versions: a record grows under the law it carries. v1 records settle exactly
// as v1 always did (its goldens, through the registry); new records are v2.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lawOf, CURRENT, ACCEPTED, viewBuckets } from '../laws.js';
import { makeInk, regrow, checkInkBody, settle, lookOf } from '../record.js';
import { skFromK, publicKeyOf, newSheetId } from '../keys.js';
import { FIXTURES, fixtureBytes, testPaperKey } from '../tools/fixtures.js';
import { fixtureV2Bytes } from '../tools/fixtures-v2.js';
import { GOLDENS_FILE } from '../tools/goldens.js';
import { hex } from '../tags.js';

const family = { grain: 8, weight: 8, tooth: 0 };

test('every v1 golden settles identically under law 1 through the registry', () => {
  const recorded = JSON.parse(fs.readFileSync(GOLDENS_FILE, 'utf8'));
  const L = lawOf(1);
  for (const name of Object.keys(FIXTURES)) {
    const { bytes, rec } = fixtureBytes(name);
    const cells = L.settledCells(L.grow(rec, { paperKey: testPaperKey('golden'), family }).tiles);
    const box = L.boxOf(cells);
    assert.equal(hex(L.factsDigest({ cells, box, actsBytes: bytes, family, scale: 64 })), recorded.fixtures[`${name}@64`].facts, name);
    assert.equal(hex(L.lookDigest(L.lookRGB(cells, box, { ageH: 500, views: 999 }), box)), recorded.fixtures[`${name}@64`].look, `${name}: a v1 look never ages or fades`);
  }
});

test('new records are made under the current law; each regrows under its own', () => {
  assert.equal(CURRENT, 2);
  assert.deepEqual([...ACCEPTED], [1, 2, 3, 4, 5]); // (law 4: one matter, written on anything; law 5: an ink is what it holds)
  const sk = skFromK(new Uint8Array(32).fill(7));
  const pk = publicKeyOf(sk);
  const { bytes } = fixtureV2Bytes('gallLine');
  const now = makeInk({ sk, pk, sheet: newSheetId(), use: 'book', family, acts: bytes });
  const old = makeInk({ sk, pk, sheet: newSheetId(), use: 'book', family, acts: bytes, law: 1 });
  assert.equal(now.line.ink.law, 2);
  assert.equal(old.line.ink.law, 1);
  checkInkBody(now.line.ink);
  checkInkBody(old.line.ink);
  assert.ok(regrow(now.line.ink, now.seed).ok);
  assert.ok(regrow(old.line.ink, old.seed).ok);
  assert.notEqual(now.line.ink.facts, old.line.ink.facts, 'the laws settle differently');
  // the same facts claimed under the other law do not regrow
  assert.equal(regrow({ ...now.line.ink, law: 1 }, now.seed).ok, false);
  // a pen that throws ink exists only in law 2: law 1 refuses its acts (PNKA format 2)
  const splashy = makeInk({ sk, pk, sheet: newSheetId(), use: 'book', family, acts: fixtureV2Bytes('flicks').bytes });
  assert.equal(fixtureV2Bytes('flicks').bytes[4], 2, 'spatter is in the acts');
  assert.ok(regrow(splashy.line.ink, splashy.seed).ok);
  assert.throws(() => checkInkBody({ ...splashy.line.ink, law: 1 }), /acts/);
  assert.equal(fixtureV2Bytes('gallLine').bytes[4], 1, 'writing without spatter is law 1 PNKA byte for byte');
  assert.throws(() => checkInkBody({ ...now.line.ink, law: 6 }), /law/); // (a law not known here)
  // the look follows the law: v2 gall ages, v1 never does
  const s2 = settle(bytes, now.seed, family, 64, 2);
  assert.notDeepEqual(lookOf(s2, { ageH: 0 }), lookOf(s2, { ageH: 300 }));
  const s1 = settle(bytes, old.seed, family, 64, 1);
  assert.deepEqual(lookOf(s1, { ageH: 0 }), lookOf(s1, { ageH: 300 }));
});

test('look buckets: law 1 has one; law 2 buckets age (only when gall can age) and views', () => {
  assert.deepEqual(viewBuckets(1, { ageH: 50, views: 77 }), { ageH: 0, views: 0 });
  assert.deepEqual(viewBuckets(2, { ageH: 50.7, views: 77 }), { ageH: 50, views: 72 });
  assert.deepEqual(viewBuckets(2, { ageH: 9000, views: 3 }), { ageH: 720, views: 0 });
  assert.deepEqual(viewBuckets(2, { ageH: 50, views: 77, ages: false }), { ageH: 0, views: 72 });
  const L = lawOf(2);
  assert.equal(L.ages(fixtureV2Bytes('gallLine').rec), true);
  assert.equal(L.ages(fixtureV2Bytes('waterOverInk').rec), false);
});
