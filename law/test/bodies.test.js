// The room's things as bodies: let go anywhere, a thing falls until it rests; past an edge it topples off;
// carried into another, it pushes it (low: it slides; high: it falls over); nothing is glued to a place.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bodiesOf as asState, bodyAt, bobAt } from '../bodies.js';

const bodiesOf = (lines, ctx) => new Map(Object.entries(asState(lines, ctx)));

const room = { table: { x0: 1, x1: 2.4, y0: 2, y1: 2.75, top: 0.74, matter: 'wood' }, floor: 'wood', size: [3, 3.3] };
const shapes = { candle: { r: 0.045, h: 0.265, matter: 'metal' }, stamper: { r: 0.02, h: 0.085, matter: 'wood' } };
const start = { candle: [1.5, 2.4, 0.74], stamper: [1.7, 2.4, 0.74] };
let t = Date.UTC(2026, 9, 25, 12);
const act = (a) => ({ at: new Date((t += 1000)).toISOString(), act: { kind: 'room', by: 'ana', ...a } });
const mm = (p) => p.map((v) => Math.round(v * 1000));
const take = (thing) => act({ act: 'place', thing, to: null });
const letGo = (thing, p) => act({ act: 'place', thing, to: mm(p) });
const carry = (thing, p) => act({ act: 'carry', thing, pos: mm(p) });
const near = (a, b, e = 1e-6) => a.every((v, k) => Math.abs(v - b[k]) < e);

test('let go anywhere, it falls until it rests: on the table, on the floor', () => {
  const B = bodiesOf([take('candle'), letGo('candle', [1.2, 2.1, 1.1])], { room, shapes, start });
  assert.ok(near(B.get('candle').at, [1.2, 2.1, 0.74]), 'onto the table under it');
  assert.ok(
    near(bodyAt(B.get('candle'), Date.parse(B.get('candle').fell.ms ? new Date(B.get('candle').fell.ms + 100).toISOString() : 0)), [1.2, 2.1, 1.1 - 0.5 * 9.81 * 0.01]),
    'a tenth of a second after: falling',
  );
  const F = bodiesOf([take('candle'), letGo('candle', [0.5, 1.0, 1.4])], { room, shapes, start });
  assert.deepEqual([F.get('candle').at, F.get('candle').lying], [[0.5, 1.0, 0], null], 'well off the table: to the floor, standing');
});

test("its middle past the table's edge, its foot over it: the edge catches it and it topples off onto the floor", () => {
  const B = bodiesOf([take('candle'), letGo('candle', [2.43, 2.4, 0.9])], { room, shapes, start });
  const c = B.get('candle');
  assert.equal(c.at[2], 0, 'on the floor');
  assert.deepEqual(c.lying, [1, 0], 'lying the way it went over: off the table');
  const S = bodiesOf([take('candle'), letGo('candle', [2.38, 2.4, 0.9])], { room, shapes, start });
  assert.deepEqual([S.get('candle').at[2], S.get('candle').lying], [0.74, null], 'its middle over the table: it stands, its foot over the edge');
});

test('carried into the stamper low, it slides it along; into a standing candle high, it knocks it over', () => {
  // the stamper's foot is 2 cm wide: the candle's holder meets it low (at its foot), and it slides
  const lines = [take('candle'), carry('candle', [1.5, 2.4, 0.74]), carry('candle', [1.62, 2.4, 0.74]), carry('candle', [1.75, 2.4, 0.74])];
  const B = bodiesOf(lines, { room, shapes, start });
  const s = B.get('stamper');
  assert.ok(s.at[0] > 1.7 + 0.05, `the stamper pushed along: ${s.at[0].toFixed(3)}`);
  assert.equal(s.lying, null, 'met low: it slides, standing');
  assert.ok(Math.abs(s.at[0] - 1.75 - (0.045 + 0.02)) < 0.02, 'no further than they touch');
  // the stamper carried in high against the candle: met above where its friction holds it, it falls over
  const H = bodiesOf([take('stamper'), carry('stamper', [1.6, 2.4, 0.9]), carry('stamper', [1.46, 2.4, 0.9])], { room, shapes, start });
  const c = H.get('candle');
  assert.ok(c.lying && c.lying[0] < -0.99, `knocked over, the way it was pushed: ${JSON.stringify(c.lying)}`);
  assert.equal(c.at[2], 0.74, 'lying on the table');
});

test('pushed past the edge of what holds it, it falls; the same acts, the same places', () => {
  const lines = [
    take('candle'),
    carry('candle', [2.0, 2.4, 0.74]),
    carry('candle', [2.3, 2.4, 0.74]),
    letGo('candle', [2.3, 2.4, 0.74]),
    take('stamper'),
    carry('stamper', [2.36, 2.4, 1.1]),
    carry('stamper', [2.2, 2.4, 1.1]),
    carry('stamper', [2.2, 2.4, 0.74]),
    carry('stamper', [2.42, 2.4, 0.74]),
  ]; // (lifted over the candle, down behind it, and into it)
  const B = bodiesOf(lines, { room, shapes, start });
  assert.equal(B.get('candle').at[2], 0, 'off the table onto the floor');
  assert.deepEqual(JSON.stringify([...bodiesOf(lines, { room, shapes, start })]), JSON.stringify([...B]));
});

test("a bare hand is the being's own matter: moved through the room it pushes what it meets, as a thing carried does; drawn back, it is gone", () => {
  const ctx = { room, shapes: { ...shapes, hand: { r: 0.045, h: 0.03, matter: 'skin' } }, start };
  const reach = (p) => act({ act: 'reach', thing: 'hand', pos: p === null ? null : mm(p) });
  const B = bodiesOf([reach([1.6, 2.4, 0.75]), reach([1.66, 2.4, 0.75])], ctx);
  assert.ok(B.get('stamper').at[0] > 1.7 + 1e-3, `the stamper pushed along: ${B.get('stamper').at}`);
  assert.ok(B.has('hand:ana'), 'the hand, in the room');
  const G = bodiesOf([reach([1.6, 2.4, 0.75]), reach(null)], ctx);
  assert.ok(!G.has('hand:ana'), 'drawn back');
});

test('a pendulum: its bob hangs still from its arm; pushed aside by a hand, it swings back through where it hung and comes to rest there', () => {
  const bob = { arm: [0.1, 0, 0.3], len: 0.2, r: 0.02, matter: 'metal', string: 'fiber' };
  const ctx = { room, shapes: { ...shapes, hand: { r: 0.045, h: 0.03, matter: 'skin' }, pendulum: { r: 0.05, h: 0.32, matter: 'wood', bob } }, start: { ...start, pendulum: [1.2, 2.2, 0.74] } };
  const tied = [1.3, 2.2, 1.04];
  const still = bodiesOf([], ctx).get('pendulum');
  assert.ok(near(bobAt(still, ctx.shapes.pendulum, t), [tied[0], tied[1], tied[2] - bob.len]), 'hanging under its arm');
  // the hand comes from in front at the bob's height (clear of the stand) and pushes it 5 cm aside, then is drawn back
  const z = tied[2] - bob.len;
  const reach = (p) => act({ act: 'reach', thing: 'hand', pos: p === null ? null : mm(p) });
  const lines = [reach([1.3, 2.1, z - 0.01]), reach([1.3, 2.2 + 0.05 - 0.065, z - 0.01]), reach(null)];
  const B = bodiesOf(lines, ctx).get('pendulum');
  const from = B.bob.swing.from;
  assert.ok(from[1] > 0.04 && from[1] <= 0.051 && Math.abs(Math.hypot(...from) - bob.len) < 1e-9, `pushed aside on its string: ${from}`);
  const at = (ms) => bobAt(B, ctx.shapes.pendulum, B.bob.swing.ms + ms);
  const ys = Array.from({ length: 60 }, (_, i) => at(i * 25)[1] - tied[1]);
  assert.ok(Math.min(...ys) < -0.02, `it swings through to the other side: ${Math.min(...ys).toFixed(3)}`);
  assert.ok(Math.abs(at(600000)[1] - tied[1]) < 1e-3, 'and comes to rest under its arm');
  assert.ok(near(bodiesOf(lines, ctx).get('pendulum').at, [1.2, 2.2, 0.74]), 'its stand where it stood');
});
