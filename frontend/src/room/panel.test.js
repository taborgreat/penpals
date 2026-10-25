import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelFor } from './panel.js';
import { GEOM } from '../scene/light.js';
import { cornerOf, atCorner, atChair, standUp } from '../scene/keys.js';

test('not signed in, the panel offers signing in, wherever you are', () => {
  assert.equal(panelFor({ signedIn: false }), 'sign-in');
  assert.equal(panelFor({ signedIn: false, mine: true, seated: true, holding: 'candle' }), 'sign-in');
});

test('it follows the hand: pick something up, its panel; set it down, it closes; pick up another, its panel', () => {
  const at = { signedIn: true, mine: true };
  assert.equal(panelFor({ ...at, holding: 'candle' }), 'candle');
  assert.equal(panelFor({ ...at }), null);
  assert.equal(panelFor({ ...at, pen: true }), 'pen');
  assert.equal(panelFor({ ...at, holding: 'sheet', pen: true }), 'sheet'); // the thing picked up last is in front
});

test('at your table with nothing in hand: new paper; by your corner: your account; neither in someone else’s house', () => {
  assert.equal(panelFor({ signedIn: true, mine: true, seated: true }), 'paper');
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
