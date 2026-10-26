// Drips come from the candle (matter-fixes.md §2): no set amounts. The candle is matter
// (law/candle.js): its pool is its wax past the melting heat, a drip is whatever liquid
// crosses its rim, and burnt + dripped + left is the wax it was made with. Lighting,
// putting out, carrying and tilting are signed acts (law/room.js); everyone regrows the
// same drips from them alone (law/wax.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../candle.js';
import * as W from '../wax.js';
import * as R from '../room.js';
import { keys as K, b64url } from '../index.js';
import { lawOf } from '../laws.js';
import { testPaperKey } from '../tools/fixtures.js';
import { WAX_MELT } from '../v2/constants.js';

const keyOf = (n) => {
  const sk = K.skFromK(new Uint8Array(32).fill(n));
  return { sk, pk: K.publicKeyOf(sk), id: b64url(K.publicKeyOf(sk)) };
};
const ana = keyOf(81),
  bo = keyOf(82);
const ROOM = ana.id;
const T0 = Date.parse('2026-10-24T20:00:00Z');
// the helpers' contract (frontend room/drops.js): what is under a point: the paper lying with its middle
// at (1.2, 0.65) covers x 1..1.4, y 0.5..0.8 (room m; its units 1000 a metre here), else the table
function landing([x, y], lying) {
  const s = lying.find((o) => o.paper === 'sA');
  if (s && x >= 1 && x <= 1.4 && y >= 0.5 && y <= 0.8) return { on: 'paper', paper: s.paper, q: { x: (x - 1) * 1000, y: (0.8 - y) * 1000 } };
  return { on: 'table', at: [x, y] };
}
// A room's chain: signed acts stamped at their moments (ms from T0), and a paper come to rest on the table.
function chain(acts, { paper = true } = {}) {
  const k = new Map();
  const lines = [];
  if (paper) lines.push({ n: 1, at: new Date(T0).toISOString(), kind: 'lay', paper: 'sA', rest: [1200, 650, 740], size: [400, 300] });
  for (const [ms, who, act, more] of acts) {
    k.set(who, (k.get(who) ?? 0) + 1);
    const made = R.makeRoomAct({ sk: who.sk, pk: who.pk, room: ROOM, k: k.get(who), act, thing: 'candle-0', ...more });
    lines.push({ n: lines.length + 1, at: new Date(T0 + ms).toISOString(), ...made });
  }
  return lines;
}
const held = (ms) => [ms, ana, 'place', { to: null }];
const tilt = (ms, deg, who = ana) => [ms, who, 'tilt', { pos: [0.9, 0.65, 0.92], deg }];
const regrow = (lines, untilMs) => W.dripsOf(lines, { landing, until: T0 + untilMs });
const sum = (ds) => ds.reduce((a, d) => a + d.m, 0);

test('a candle just lit drips nothing at any tilt: nothing falls while none of it is past the melting heat', () => {
  const cd = C.newCandle();
  let melt = 0;
  while (C.liquidOf(cd) === 0) {
    C.stepCandle(cd, { lit: true });
    melt += C.STEP_S * 1000;
  }
  for (let deg = 0; deg <= 90; deg += 15) assert.deepEqual(regrow(chain([[0, ana, 'light'], held(0), tilt(0, deg)]), melt - 1000), [], `at ${deg}°`);
  // never lit, held tipped over for minutes: nothing
  assert.deepEqual(regrow(chain([held(0), tilt(0, 90)]), 300000), []);
});

test('a long-lit candle drips when tilted, more the further, as hot as its pool; its wax adds up', () => {
  const lit = 5 * 60000; // (its pool well melted, still inside its cup)
  const tilted = (deg) => regrow(chain([[0, ana, 'light'], held(lit), tilt(lit + 1000, deg)]), lit + 11000).filter((d) => d.t > T0 + lit);
  const a = tilted(30),
    b = tilted(60);
  assert.ok(a.length > 0 && sum(b) > sum(a), `tilted further, more: ${sum(a)} µg at 30°, ${sum(b)} µg at 60°`);
  for (const d of [...a, ...b]) assert.ok(d.heat >= WAX_MELT, `liquid wax, past its melting heat: ${d.heat}`);
  assert.ok(
    a.some((d) => d.on.on === 'paper'),
    'onto the paper under its rim',
  );
  // burnt + dripped + what is left = the wax it was made with
  const room = W.createRoomWax({ landing });
  room.advance(chain([[0, ana, 'light'], held(lit), tilt(lit + 1000, 60), tilt(lit + 6000, 0), [lit + 7000, ana, 'out']]), T0 + lit + 60000);
  const { cd } = room.candle(0);
  assert.ok(cd.burnt > 0 && cd.dripped > 0);
  assert.equal(cd.burnt + cd.dripped + C.massOf(cd), C.MADE_UG);
});

test('replaying the signed acts alone gives the same drips everywhere and whenever; only the holder tilts', () => {
  const lit = 5 * 60000;
  const lines = chain([[0, ana, 'light'], held(lit), tilt(lit + 1000, 45), tilt(lit + 3000, 70), tilt(lit + 6000, 0)]);
  assert.ok(lines.every((l) => l.kind === 'lay' || (R.checkRoomAct(l.act) && R.verifyRoomActSeal(l.act, l.seal))));
  const once = regrow(lines, lit + 8000);
  assert.ok(once.length > 0);
  assert.deepEqual(regrow(JSON.parse(JSON.stringify(lines)), lit + 8000), once, 'the same chain, as it arrives over the wire');
  const room = W.createRoomWax({ landing });
  room.advance(lines.slice(0, 3), T0 + lit + 2000);
  assert.deepEqual(room.advance(lines, T0 + lit + 8000), once, 'regrown as the acts arrive: the same');
  // run on ahead of the stamper's clock, then a line stamped behind where it had got to: the same
  const ahead = W.createRoomWax({ landing });
  for (let i = 1; i <= lines.length; i++) ahead.advance(lines.slice(0, i), Date.parse(lines[i - 1].at) + 1500);
  assert.deepEqual(ahead.advance(lines, T0 + lit + 8000), once, 'each act arriving after this clock ran past it: the same');
  // a tilt by someone not holding it changes nothing
  const theirs = regrow(chain([[0, ana, 'light'], held(lit), tilt(lit + 1000, 60, bo)]), lit + 8000);
  assert.ok(
    theirs.every((d) => d.on.on === 'dish'),
    'upright in her hand: nothing falls free',
  );
});

test('a drip that landed on a paper is wax on it; upright, what runs over goes down the side into the dish', () => {
  const lit = 5 * 60000;
  const drips = regrow(chain([[0, ana, 'light'], held(lit), tilt(lit + 1000, 60)]), lit + 4000);
  const marks = W.dripsOn(drips, 'sA', T0).map((d) => ({ kind: 'drip', ...d }));
  assert.ok(marks.length > 0);
  const L = lawOf(3);
  const t0 = Math.min(...marks.map((m) => m.t));
  const rec = { orgX: 0, orgY: 0, strokes: [], marks: marks.map((m) => ({ ...m, t: m.t - t0 })) };
  const res = L.grow(L.decodeCanonical(L.encodeActs(rec)), { paperKey: testPaperKey('wax'), family: { grain: 8, weight: 8, tooth: 0 } });
  assert.ok(L.settledCells(res.tiles).filter((c) => c[15] > 0).length > 100, 'wax on the paper');
  // upright the whole while: whatever runs over its rim goes into its dish
  const upright = regrow(chain([[0, ana, 'light']]), 30 * 60000);
  assert.ok(upright.every((d) => d.on.on === 'dish'));
});

test('a room act: sealed by its being, a candle in the room, whole millimetres and degrees; tilts sent coarsely', () => {
  const made = R.makeRoomAct({ sk: ana.sk, pk: ana.pk, room: ROOM, k: 1, act: 'tilt', thing: 'candle-1', pos: [1.23456, 0.5, 0.9], deg: 33.4 });
  assert.deepEqual(made.act.pos, [1235, 500, 900]);
  assert.equal(made.act.deg, 33);
  assert.ok(R.verifyRoomActSeal(made.act, made.seal));
  assert.ok(!R.verifyRoomActSeal({ ...made.act, deg: 34 }, made.seal), 'changed: not its seal');
  assert.throws(() => R.makeRoomAct({ sk: ana.sk, pk: ana.pk, room: ROOM, k: 1, act: 'tilt', thing: 'pen', pos: [1, 1, 1], deg: 3 }), /candle/);
  assert.throws(() => R.checkRoomAct({ ...made.act, act: 'drip' }), /not a room act/);
  const last = { pos: [1, 0.5, 0.9], deg: 10 };
  assert.ok(!R.isTiltAct(last, 0, { pos: [1, 0.5, 0.9], deg: 12 }, 1000), 'a small turn');
  assert.ok(R.isTiltAct(last, 0, { pos: [1, 0.5, 0.9], deg: 15 }, 1000), 'a turn');
  assert.ok(R.isTiltAct(last, 0, { pos: [1, 0.5, 0.9], deg: 0 }, 1000), 'upright again');
  assert.ok(!R.isTiltAct(last, 0, { pos: [1, 0.5, 0.9], deg: 40 }, 100), 'too soon');
});

test('light is the clock for aging: lit only while a being is in the room; empty, a tomb', () => {
  const H = 3600000;
  const ms = (h) => Date.UTC(2026, 9, 1) + h * H;
  const at = (h) => new Date(ms(h)).toISOString();
  const lines = [
    { at: at(1), by: 'ana', kind: 'enter' },
    { at: at(2), by: 'bo', kind: 'enter' },
    { at: at(3), by: 'ana', kind: 'move' },
    { at: at(4), by: 'ana', kind: 'leave' }, // bo still here
    { at: at(5), by: 'bo', kind: 'leave' }, // empty from 5 to 8
    { at: at(8), by: 'ana', kind: 'enter' },
  ];
  assert.equal(R.litMs(lines, ms(0), ms(10)) / H, 4 + 2); // 1 to 5, then 8 to now
  assert.equal(R.litMs(lines, ms(6), ms(8)) / H, 0); // ink made while the room was empty rests
  assert.equal(R.litMs(lines, ms(4.5), ms(9)) / H, 1.5);
});

test('a candle put out cools even after everyone leaves: re-entered the next day, its wax is solid (regrown from the time gone by)', () => {
  const room = W.createRoomWax({ landing });
  const lines = chain(
    [
      [0, ana, 'light'],
      [30 * 60000, ana, 'out'],
    ],
    { paper: false },
  );
  room.advance(lines, T0 + 30 * 60000 + 1000);
  assert.ok(C.liquidOf(room.candle(0).cd) > 0, 'just put out, its pool is liquid');
  room.advance(lines, T0 + 30 * 60000 + 24 * 3600000); // (the next day)
  const { cd } = room.candle(0);
  assert.equal(C.liquidOf(cd), 0, 'set solid');
  assert.equal(cd.burnt + cd.dripped + C.massOf(cd), C.MADE_UG, 'none of it lost');
});
