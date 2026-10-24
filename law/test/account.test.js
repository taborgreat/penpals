// The account key (accounts-change.md): fresh randomness and three signatures,
// settled by the law on a provisional paper, make the key; the 24 words and
// the private key are it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../keys.js';
import { accountKey, settleOn, SIGNING_FAMILY } from '../record.js';
import { createLive } from '../v2/live.js';
import { decodeActs, penTimeline } from '../v2/acts.js';
import { hex } from '../tags.js';
import * as S from '../lab/synth.js';

const writer = S.makeWriter(21);
const sigs = [1, 2, 3].map((s) => S.write(writer, 'ana', s));
const r32 = Uint8Array.from({ length: 32 }, (_, i) => (i * 29 + 7) & 255);

test('account key: the same randomness and signatures make the same key, by the canonical law', () => {
  const a = accountKey(r32, sigs);
  const b = accountKey(r32, sigs);
  assert.equal(hex(a.K), hex(b.K), 'run twice: the same key');
  assert.equal(a.K.length, 32);
  // each signature's facts are the law's settled facts on paper₀ (grown, never the live preview)
  const paper0 = K.provisionalPaperKey(r32);
  sigs.forEach((acts, i) => assert.equal(hex(a.facts[i]), hex(settleOn(acts, paper0, SIGNING_FAMILY).facts)));
  // and the live sheet the writer signs on settles to the same facts
  const rec = decodeActs(sigs[0]);
  const live = createLive({ paperKey: paper0, family: SIGNING_FAMILY });
  const pens = penTimeline(rec);
  rec.strokes.forEach((s, si) => {
    const pt = (i) => ({ x: s.x[i] + 10 * rec.orgX, y: s.y[i] + 10 * rec.orgY, t: s.t[i], p: s.p ? s.p[i] : null });
    live.down(pt(0), pens[si][0][1], !!s.p);
    for (let i = 1; i < s.x.length; i++) live.point(pt(i));
    live.up();
  });
  assert.equal(hex(live.finish(sigs[0]).facts), hex(a.facts[0]), 'the live sheet and the grown one agree');
});

test('account key: other signatures with the same randomness, or the same signatures with other randomness, make other keys', () => {
  const base = accountKey(r32, sigs);
  const other = [sigs[0], sigs[1], S.write(writer, 'ana', 9)];
  assert.notEqual(hex(accountKey(r32, other).K), hex(base.K), 'a different signature: a different key');
  const reordered = [sigs[1], sigs[0], sigs[2]];
  assert.notEqual(hex(accountKey(r32, reordered).K), hex(base.K), 'the order is part of it');
  const r2 = r32.slice();
  r2[0] ^= 1;
  const moved = accountKey(r2, sigs);
  assert.notEqual(hex(moved.K), hex(base.K), 'other randomness: a different key');
  assert.notEqual(hex(moved.facts[0]), hex(base.facts[0]), 'and different facts: paper₀ differs');
  assert.throws(() => accountKey(r32, sigs.slice(0, 2)), /3 signatures/);
  assert.throws(() => K.masterOf(r32.subarray(0, 16), sigs, base.facts), /32 bytes/);
});

test('account key: the 24 words and the private key are the key, both ways', () => {
  const { K: key } = accountKey(r32, sigs);
  const words = K.wordsOf(key);
  assert.equal(words.split(' ').length, 24);
  assert.equal(hex(K.keyFromWords(words)), hex(key));
  assert.equal(hex(K.keyFromWords(`  ${words.toUpperCase().split(' ').join('   ')} \n`)), hex(key), 'spacing and case do not matter');
  const swapped = words.split(' ');
  [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  assert.throws(() => K.keyFromWords(swapped.join(' ')), /24 words/, 'the checksum catches a slip');
  assert.throws(() => K.keyFromWords(words.split(' ').slice(0, 12).join(' ')), /24 words/);
  const text = K.privateKeyText(key);
  assert.ok(text.startsWith(K.PRIVATE_KEY_PREFIX));
  assert.equal(hex(K.keyFromPrivate(` ${text}\n`)), hex(key));
  for (const bad of ['', 'penpals-key-1:abc', text.slice(K.PRIVATE_KEY_PREFIX.length), words]) assert.throws(() => K.keyFromPrivate(bad), /private key/);
  // the key signs as an account key: sk from it, and the provisional paper is no sheet of the account
  const sk = K.skFromK(key);
  assert.equal(K.publicKeyOf(sk).length, 32);
  assert.notEqual(hex(K.provisionalPaperKey(r32)), hex(K.paperKeyOf(K.sheetSeed(sk, K.SHEET_ZERO))));
});
