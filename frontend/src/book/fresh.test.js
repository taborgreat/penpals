import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetPen, placeOf, SIZES } from './fresh.js';
import { CELLS } from '../ink/live.js';

// A fresh sheet on the table: the pen writes on it in its own units, and its ink is laid in the book where it lies.
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

test('the pen writes on the sheet where it lies, in the sheet’s own units', () => {
  const { calls, ink } = fake();
  const paper = { size: SIZES.half, origin: [0, 700] };
  const w = sheetPen(() => ({ ink, paper }), pen);
  w.down({ x: 100, y: 800 }, null, 'mouse');
  w.move({ x: 120, y: 810 }, null);
  w.up({ x: 130, y: 820 }, null);
  assert.deepEqual(calls, [
    ['down', { x: 100, y: 100 }],
    ['move', { x: 120, y: 110 }],
    ['up', { x: 130, y: 120 }],
  ]);
});

test('a stroke begun off the sheet lays nothing; one that leaves it ends at its edge', () => {
  const { calls, ink } = fake();
  const paper = { size: SIZES.half, origin: [0, 0] };
  const w = sheetPen(() => ({ ink, paper }), pen);
  w.down({ x: 50, y: 900 }, null, 'mouse'); // below the half sheet
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

test('no sheet on the table: the pen lays nothing', () => {
  const { calls, ink } = fake();
  const w = sheetPen(() => ({ ink, paper: null }), pen);
  w.down({ x: 1, y: 1 }, null, 'mouse');
  w.up({ x: 1, y: 1 }, null);
  assert.deepEqual(calls, []);
});

test('sealed, its ink is laid on the page exactly where it was written', () => {
  assert.deepEqual(placeOf([0, 700], [10 * CELLS, 4 * CELLS, 300, 200]), { x: 10, y: 704 });
});
