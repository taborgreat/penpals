import { test } from 'node:test';
import assert from 'node:assert/strict';
import { padPen } from './padPen.js';

// The pen on a pad: it writes on it in the pad's own units.
const HALF = { width: 1000, height: 700 };
const fake = () => {
  const calls = [];
  const capture = new Proxy(
    {},
    {
      get:
        (_, k) =>
        (...a) =>
          calls.push([k, a[0]]),
    },
  );
  return { calls, ink: { law: 2, capture } };
};
const pen = { nib: 'flex', angle: 0, widthAt: () => () => 3 };

test('the pen writes on the pad where it lies, in the pad’s own units', () => {
  const { calls, ink } = fake();
  const paper = { size: HALF, origin: [0, 700] };
  const w = padPen(() => ({ ink, paper }), pen);
  w.down({ x: 100, y: 800 }, null, 'mouse');
  w.move({ x: 120, y: 810 }, null);
  w.up({ x: 130, y: 820 }, null);
  assert.deepEqual(calls, [
    ['down', { x: 100, y: 100 }],
    ['move', { x: 120, y: 110 }],
    ['up', { x: 130, y: 120 }],
  ]);
});

test('a stroke begun off the pad lays nothing; one that leaves it ends at its edge', () => {
  const { calls, ink } = fake();
  const paper = { size: HALF, origin: [0, 0] };
  const w = padPen(() => ({ ink, paper }), pen);
  w.down({ x: 50, y: 900 }, null, 'mouse'); // below the half pad
  w.move({ x: 60, y: 600 }, null);
  w.up({ x: 60, y: 600 }, null);
  assert.deepEqual(calls, []);
  w.down({ x: 50, y: 650 }, null, 'mouse');
  w.move({ x: 50, y: 750 }, null); // off its bottom
  w.move({ x: 50, y: 760 }, null);
  assert.deepEqual(calls, [
    ['down', { x: 50, y: 650 }],
    ['up', { x: 50, y: 700 }],
  ]);
});

test('no pad on the table: the pen lays nothing', () => {
  const { calls, ink } = fake();
  const w = padPen(() => ({ ink, paper: null }), pen);
  w.down({ x: 1, y: 1 }, null, 'mouse');
  w.up({ x: 1, y: 1 }, null);
  assert.deepEqual(calls, []);
});
