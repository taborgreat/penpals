import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeActs, decodeActs, decodeCanonical, penTimeline, precheck } from '../v1/acts.js';
import { FIXTURES } from '../tools/fixtures.js';

const pen = { nib: 0, size: 50, flex: 0, flow: 7, rgb: [20, 30, 40], angle: 0 };
const simple = () => ({
  orgX: 3,
  orgY: 4,
  strokes: [
    { hasP: false, kind: 0, synthP: false, x: [10, 20, 35], y: [5, 5, 9], t: [0, 8, 16], p: null, pens: [{ at: 0, ...pen }] },
    { hasP: true, kind: 2, synthP: false, x: [40, 41], y: [9, 30], t: [100, 110], p: [120, 200], pens: [{ at: 1, flow: 9 }] },
  ],
});

test('round trip: decode(encode(rec)) gives back the acts', () => {
  const bytes = encodeActs(simple());
  const rec = decodeActs(bytes);
  assert.equal(rec.orgX, 3);
  assert.equal(rec.strokes.length, 2);
  assert.deepEqual([...rec.strokes[0].x], [10, 20, 35]);
  assert.deepEqual([...rec.strokes[1].t], [100, 110]);
  assert.deepEqual([...rec.strokes[1].p], [120, 200]);
  assert.equal(rec.strokes[1].pens[0].flow, 9);
  assert.deepEqual(decodeCanonical(bytes).strokes[0].pens[0].rgb, [20, 30, 40]);
});

test('every fixture is canonical', () => {
  for (const [name, make] of Object.entries(FIXTURES)) {
    const bytes = encodeActs(make());
    assert.doesNotThrow(() => decodeCanonical(bytes), name);
  }
});

test('pen timeline carries the pen across strokes and applies later pen acts', () => {
  const rec = decodeActs(encodeActs(simple()));
  const tl = penTimeline(rec);
  assert.equal(tl[0][0][1].flow, 7);
  assert.equal(tl[1][0][1].flow, 7); // segment 0→1 of stroke 2 still uses the old pen
  assert.equal(tl[1][1][0], 1);
  assert.equal(tl[1][1][1].flow, 9);
  assert.equal(tl[1][1][1].size, 50);
});

test('rejects what is not canonical or out of range', () => {
  const good = encodeActs(simple());
  const mutate = (fn) => {
    const b = good.slice();
    fn(b);
    return b;
  };
  assert.throws(
    () =>
      decodeActs(
        mutate((b) => {
          b[0] = 0;
        }),
      ),
    /PNKA/,
  );
  assert.throws(() => decodeActs(good.slice(0, good.length - 1)), /truncated|range/);
  assert.throws(() => decodeActs(new Uint8Array([...good, 0])), /trailing/);
  // a non-minimal varint for orgX (3 as 0x83 0x00) decodes but is not canonical
  const nonMin = new Uint8Array([...good.slice(0, 5), 0x83, 0x00, ...good.slice(6)]);
  assert.throws(() => decodeCanonical(nonMin), /canonical/);
  // time must move forward inside a stroke
  const r = simple();
  r.strokes[0].t = [0, 8, 8];
  assert.throws(() => encodeActs(r), /dt/);
  // the first act needs a full pen
  const r2 = simple();
  r2.strokes[0].pens = [{ at: 0, flow: 7 }];
  assert.throws(() => encodeActs(r2), /full pen/);
  // pressure 0 is not a reading
  const r3 = simple();
  r3.strokes[1].p = [0, 10];
  assert.throws(() => encodeActs(r3), /pressure/);
});

test('precheck refuses absurdly heavy writing', () => {
  const r = simple();
  r.strokes[0] = { ...r.strokes[0], x: [0, 199999], y: [0, 199999], t: [0, 60000], pens: [{ at: 0, ...pen, size: 400 }] };
  r.strokes.pop();
  const rec = decodeActs(encodeActs(r));
  assert.throws(() => precheck(rec, 640), /heavy/);
});
