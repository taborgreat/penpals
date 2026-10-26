// The pens on the table as the panel and the writers take them (components/PenPanel.jsx): each pen's
// settings are its facts, in the law's terms (law/room.js), and its strokes carry them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { room as R, keys as K, b64url } from 'penpals-law';
import { penFrom, stickPen, PEN_MADE, DIP_WELL } from './pens.js';
import { matter } from 'penpals-law';
import { PX_PER_M } from '../scene/light/room.js';
import { FLEX_PRESETS } from '../ink/nibs.js';
import { lawPen } from '../ink/pens.js';
import * as v2 from 'penpals-law/v2/constants';

const sk = K.skFromK(new Uint8Array(32).fill(3));
const pk = K.publicKeyOf(sk);
const setAct = (thing, set) => R.makeRoomAct({ sk, pk, room: b64url(pk), k: 1, act: 'set', thing, set });

test('each pen as it was made is a pen the law takes; its nib is which pen it is', () => {
  for (const id of R.PENS) {
    const s = PEN_MADE[R.NIB_OF[id]];
    assert.doesNotThrow(() => setAct(id, s), id);
    const pen = penFrom(id, s);
    assert.equal(pen.nib, R.NIB_OF[id]);
    assert.equal(pen.fixedNib, true);
    assert.equal(pen.settings().nib, pen.nib);
  }
});

test("a change in the panel is an act the law takes: the flex nib's preset, whole numbers", () => {
  let next = null;
  const pen = penFrom('pen-flex', PEN_MADE.flex, (patch) => (next = { ...PEN_MADE.flex, ...patch }));
  pen.set.flex({ ...FLEX_PRESETS.spencerian });
  assert.equal(next.hairline, Math.round(FLEX_PRESETS.spencerian.hairline * 10));
  assert.doesNotThrow(() => setAct('pen-flex', next));
  const again = penFrom('pen-flex', next);
  assert.equal(again.flex.hairline, FLEX_PRESETS.spencerian.hairline, 'and back: the pen writes with it');
  pen.set.color('#22336A');
  assert.equal(next.color, '#22336a', 'a colour as the law spells it');
});

test("a dip pen's strokes carry its well under law 3 (and a new dip is a new pen act); a fountain pen's never", () => {
  const dipping = penFrom('pen', { ...PEN_MADE.pen, dip: true }, () => {}, 0);
  assert.equal(dipping.lawPen(3).well, DIP_WELL);
  assert.equal(dipping.lawPen(2).well, undefined, 'a law-2 sheet has no well');
  assert.notEqual(penFrom('pen', { ...PEN_MADE.pen, dip: true }, () => {}, 1).lawPen(3).dip, dipping.lawPen(3).dip, 'dipped again: another pen act');
  assert.equal(penFrom('pen', PEN_MADE.pen).lawPen(3).well, undefined);
});

test('the oak gall swatch: from law 5 an ink with no pigment and all oak gall; before, the colour its law reads', () => {
  const gallHex = '#' + v2.OAK_GALL.map((c) => c.toString(16).padStart(2, '0')).join('');
  const five = lawPen({ nib: 'pen' }, gallHex, 7, undefined, null, 5);
  assert.deepEqual(five.rgb, [...v2.WATER]);
  assert.equal(five.gall, 255);
  const four = lawPen({ nib: 'pen' }, gallHex, 7, undefined, null, 4);
  assert.deepEqual(four.rgb, [...v2.OAK_GALL]);
  assert.equal(four.gall, undefined);
  assert.equal(lawPen({ nib: 'pen' }, '#203040', 7, undefined, null, 5).gall, undefined, 'a coloured ink holds no gall');
});

test("a carved stick as a pen: as wide as its tip, its wood the nib; dry until dipped, then the jar's oak gall ink", () => {
  const tip = { r: 0.0005, length: 0.6, matter: 'wood' }; // (a millimetre across)
  const dry = stickPen(tip, 0).lawPen(5);
  assert.equal(dry.nib, 0);
  assert.equal(dry.size, Math.round(2 * tip.r * PX_PER_M * 10), 'its tip, in tenths of a page px');
  assert.equal(dry.matter, matter.idOf('wood'));
  assert.equal(dry.flow, 0, 'dry: it scratches');
  assert.equal(dry.well, undefined);
  const dipped = stickPen(tip, 1).lawPen(5);
  assert.equal(dipped.well, DIP_WELL, 'dipped: a reservoir full');
  assert.ok(dipped.flow > 0);
  assert.equal(dipped.gall, 255, 'the jar holds oak gall ink');
  assert.deepEqual(dipped.rgb, [...v2.WATER]);
  assert.ok(stickPen({ ...tip, r: 0.003 }, 1).lawPen(5).size > dipped.size, 'a blunt stick writes wide');
});
