import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelFor } from './panel.js';
import { GEOM } from '../scene/light.js';
import { cornerOf, atCorner, atChair, standUp } from '../scene/keys.js';

test('not signed in, the panel offers signing in, wherever you are, unless a book is open in your hands', () => {
  assert.equal(panelFor({ signedIn: false }), 'sign-in');
  assert.equal(panelFor({ signedIn: false, mine: true, seated: true, holding: 'candle' }), 'sign-in');
  assert.equal(panelFor({ signedIn: false, holding: 'book' }), 'book');
});

test('the book pulled down from the shelf, a paper taken up: each its panel', () => {
  assert.equal(panelFor({ signedIn: true, mine: true, seated: true, holding: 'book', pen: true }), 'book');
  assert.equal(panelFor({ signedIn: true, mine: false, holding: 'paper' }), 'paper');
});

test('it follows the hand: pick something up, its panel; set it down, it closes; pick up another, its panel', () => {
  const at = { signedIn: true, mine: true };
  assert.equal(panelFor({ ...at, holding: 'candle' }), 'candle');
  assert.equal(panelFor({ ...at }), null);
  assert.equal(panelFor({ ...at, pen: true }), 'pen');
  assert.equal(panelFor({ ...at, holding: 'paper', pen: true }), 'paper'); // the thing picked up last is in front
});

test('at your own table with nothing in hand, sitting or standing by it: new paper; at another’s, nothing; by your corner: your account, not by another’s', () => {
  assert.equal(panelFor({ signedIn: true, mine: true, seated: true }), 'table');
  assert.equal(panelFor({ signedIn: true, mine: true, atTable: true }), 'table');
  assert.equal(panelFor({ signedIn: true, mine: true, atCorner: true }), 'account');
  assert.equal(panelFor({ signedIn: true, mine: false, seated: true }), null);
  assert.equal(panelFor({ signedIn: true, mine: false, atCorner: true }), null);
});

test('the account corner is a place on the floor, clear of the chair', () => {
  const [x, y] = cornerOf(GEOM);
  const there = { ...standUp(GEOM, { yaw: 0, pitch: 0 }), pos: [x, y, 1.6] };
  assert.ok(atCorner(GEOM, there));
  assert.ok(!atChair(GEOM, there));
  assert.ok(!atCorner(GEOM, standUp(GEOM, { yaw: 0, pitch: 0 })));
  assert.ok(x > 0 && x < GEOM.size[0] && y > 0 && y < GEOM.size[1]);
});

test('out of doors on a free plot, nothing in hand: the plot (your house may stand here); holding something, what you hold', () => {
  assert.equal(panelFor({ signedIn: true, freePlot: [2, -1] }), 'plot');
  assert.equal(panelFor({ signedIn: true, freePlot: [2, -1], holding: 'paper' }), 'paper');
  assert.equal(panelFor({ signedIn: false, freePlot: [2, -1] }), 'sign-in');
  assert.equal(panelFor({ signedIn: true, freePlot: null }), null);
});
