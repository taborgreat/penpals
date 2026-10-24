import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapture, strokesToActs } from './capture.js';
import { decodeActs } from 'penpals-law/v2/acts';

const PEN = { nib: 0, size: 40, flex: 0, flow: 7, rgb: [20, 20, 20], angle: 0 };
const ev = (timeStamp, extra = {}) => ({ timeStamp, pressure: 0.5, pointerType: 'mouse', ...extra });

test('every coalesced event keeps its own time, and time only moves forward', () => {
  const cap = createCapture({ now: () => 0 });
  cap.down({ x: 10, y: 10 }, ev(100));
  cap.move({ x: 11, y: 10 }, ev(108));
  cap.move({ x: 12, y: 10 }, ev(108)); // same stamp twice
  cap.move({ x: 13, y: 10 }, ev(105)); // out of order
  cap.up(null, ev(120));
  const ts = cap.strokes[0].points.map((p) => p.t);
  assert.deepEqual(ts, [100, 108, 109, 110], 'lifting where it last moved, 10 ms later, is the release: not an act');
});

test('a held pen keeps adding samples; a late real sample replaces newer hold samples', async () => {
  let clock = 1000;
  const cap = createCapture({ now: () => clock });
  cap.down({ x: 0, y: 0 }, ev(1000));
  // hold still for ~130 ms of wall time (the first 50 are landing: no hold samples yet)
  for (let i = 0; i < 8; i++) {
    clock += 16;
    await new Promise((r) => setTimeout(r, 20));
  }
  const holds = cap.drawing.points.filter((p) => p.hold).length;
  assert.ok(holds >= 3, `holds ${holds}`);
  // a real move stamped earlier than the last hold samples arrives late
  cap.move({ x: 5, y: 0 }, ev(1040));
  const pts = cap.drawing.points;
  assert.ok(pts.every((p, i) => i === 0 || p.t > pts[i - 1].t));
  assert.equal(pts[pts.length - 1].x, 5);
  assert.ok(pts.filter((p) => p.hold).every((p) => p.t < 1040));
  cap.up(null, ev(1200));
  assert.equal(cap.strokes[0].points.at(-1).t, 1200, 'lifting is an act');
});

test('pressure is kept only from a pen', () => {
  const cap = createCapture({ now: () => 0 });
  cap.down({ x: 0, y: 0 }, ev(10, { pointerType: 'pen', pressure: 0.8 }), 'pen');
  cap.move({ x: 1, y: 0 }, ev(20, { pointerType: 'pen', pressure: 0.3 }));
  cap.up(null, ev(30, { pointerType: 'pen', pressure: 0 }));
  cap.down({ x: 0, y: 5 }, ev(100), 'mouse');
  cap.up(null, ev(110));
  const bytes = strokesToActs(cap.strokes, PEN);
  const rec = decodeActs(bytes);
  assert.equal(rec.strokes[0].hasP, true);
  assert.deepEqual([...rec.strokes[0].p], [204, 77]); // 0.8, 0.3 (the release right after is not an act)
  assert.equal(rec.strokes[1].hasP, false);
  assert.equal(rec.strokes[1].kind, 0);
});

test('strokes become canonical acts that keep their place and their pauses', () => {
  const cap = createCapture({ now: () => 0 });
  cap.down({ x: 120.4, y: 80.2 }, ev(5000));
  cap.move({ x: 130.4, y: 81.2 }, ev(5010));
  cap.up(null, ev(5020));
  cap.down({ x: 140, y: 90 }, ev(9000)); // a 3.98 s pause, kept
  cap.up(null, ev(9008));
  const rec = decodeActs(strokesToActs(cap.strokes, PEN));
  assert.equal(rec.orgX, 118);
  assert.equal(rec.orgY, 78);
  assert.deepEqual([...rec.strokes[0].x], [24, 124], 'the release 10 ms after the last move is not an act');
  assert.deepEqual([...rec.strokes[0].t], [0, 8], 'the 10 ms click before the first move is not a dwell: one sample interval');
  assert.equal(rec.strokes[1].t[0], 3998);
  assert.equal(rec.strokes[1].gap, 3990);
});

// --- writing live: the sheet is fed exactly the acts that are encoded ---

import { lawOf, CURRENT } from 'penpals-law/laws';

// the device writes under the current law
const { createLive } = lawOf(CURRENT);
import { settle } from 'penpals-law/record';
import { paperKeyOf } from 'penpals-law/keys';
import { b64url } from 'penpals-law/tags';

const FAMILY = { grain: 8, weight: 8, tooth: 0 };
const SEED = new Uint8Array(64).map((_, i) => (i * 13 + 5) & 255);

function applyOps(live, ops) {
  for (const o of ops) {
    if (o.op === 'down') live.down(o.pt, o.pen, o.hasP);
    else if (o.op === 'point') live.point(o.pt);
    else if (o.op === 'pen') live.pen(o.pen);
    else if (o.op === 'up') live.up();
    else if (o.op === 'undo') live.undo();
  }
}

test('the live sheet, fed as points become final, settles exactly as the encoded acts', () => {
  let clock = 0;
  const cap = createCapture({ now: () => clock, pen: PEN, live: true });
  const live = createLive({ paperKey: paperKeyOf(SEED), family: FAMILY });
  const red = { ...PEN, rgb: [180, 30, 30], size: 30 };
  let t = 1000;
  const stroke = (x0, y0, n, { type = 'mouse', pressure = 0.5, penAt = -1 } = {}) => {
    cap.down({ x: x0, y: y0 }, ev(t, { pointerType: type, pressure }), type);
    for (let i = 1; i <= n; i++) {
      t += 7 + (i % 3);
      clock = t;
      cap.move({ x: x0 + i * 1.37, y: y0 + Math.sin(i / 3) * 4 }, ev(t, { pointerType: type, pressure: 0.2 + (i % 5) / 8 }));
      if (i === penAt) cap.setPen(red);
      if (i % 4 === 0) applyOps(live, cap.drain());
    }
    t += 9;
    cap.up(null, ev(t, { pointerType: type }));
    applyOps(live, cap.drain());
  };
  const pause = (ms) => {
    t += ms;
    clock = t - 1;
    const h = cap.promise(clock);
    if (h !== null) live.advanceTo(h);
  };
  stroke(100, 100, 30);
  pause(400);
  stroke(120, 104, 25, { type: 'pen', penAt: 12 }); // the pen changes mid-stroke
  pause(250);
  stroke(140, 98, 20);
  pause(300);
  assert.ok(cap.undo()); // that one goes
  applyOps(live, cap.drain());
  pause(70000); // a long pause: shortened to a minute in the record
  stroke(150, 110, 18);
  // a stroke the system took back
  cap.down({ x: 160, y: 110 }, ev(t + 100));
  cap.move({ x: 161, y: 111 }, ev(t + 110));
  applyOps(live, cap.drain());
  cap.cancel();
  applyOps(live, cap.drain());
  pause(500);
  stroke(170, 112, 10);

  const acts = cap.acts();
  const rec = decodeActs(acts);
  assert.equal(rec.strokes.length, 4);
  assert.ok(rec.strokes[3].gap <= 60000);
  assert.ok(rec.strokes[1].pens.length === 2 || rec.strokes[1].pens.length === 1);
  const batch = settle(acts, SEED, FAMILY);
  const done = live.finish(acts);
  assert.equal(b64url(done.facts), b64url(batch.facts));
  assert.deepEqual(done.box, batch.box);
});

test('a final point never changes; a promise moves a later pen-down after it', () => {
  let clock = 0;
  const cap = createCapture({ now: () => clock, pen: PEN, live: true });
  cap.down({ x: 0, y: 0 }, ev(100));
  clock = 200;
  cap.move({ x: 1, y: 0 }, ev(200));
  const first = cap.drain().map((o) => o.pt);
  cap.move({ x: 2, y: 0 }, ev(150)); // stamped before a final point: moves after it
  const late = cap.drain()[0].pt;
  assert.ok(late.t > first[1].t);
  cap.up(null, ev(300));
  cap.drain();
  clock = 5000;
  const h = cap.promise(5000);
  assert.equal(h, 4900);
  cap.down({ x: 3, y: 0 }, ev(4000)); // an event stamped before the promise
  assert.equal(cap.drain().length, 0, 'landing: nothing is final until the pen moves');
  cap.move({ x: 4, y: 0 }, ev(4005));
  const down = cap.drain()[0];
  assert.ok(down.pt.t > h, `${down.pt.t} after ${h}`);
  assert.equal(cap.promise(), null, 'no promise while the pen is down');
  cap.cancel(); // stops the hold timer
});

test('a held pen, live: hold samples that became final are kept, later ones give way, and it still settles the same', async () => {
  const cap = createCapture({ pen: PEN, live: true }); // the real clock
  const live = createLive({ paperKey: paperKeyOf(SEED), family: FAMILY });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const at = () => performance.now();
  cap.down({ x: 50, y: 50 }, ev(at()));
  for (let i = 1; i <= 6; i++) {
    await wait(9);
    cap.move({ x: 50 + i, y: 50 }, ev(at()));
  }
  await wait(150); // held still: hold samples, some final by now
  applyOps(live, cap.drain());
  const stamped = at() - 20; // a real sample that arrives late, stamped before the newest holds
  cap.move({ x: 58, y: 51 }, ev(stamped));
  await wait(30);
  cap.up({ x: 60, y: 52 }, ev(at()));
  applyOps(live, cap.drain());
  const acts = cap.acts();
  const rec = decodeActs(acts);
  assert.ok(rec.strokes[0].x.length > 9, 'the dwell left samples');
  assert.equal(b64url(live.finish(acts).facts), b64url(settle(acts, SEED, FAMILY).facts));
});

test('flex nib, mouse: holding still opens the tines (a square start), a stop before the lift holds them; a quick start is a point', async () => {
  const PEN = { nib: 1, size: 12, flex: 120, flow: 7, rgb: [20, 20, 20], angle: 35 };
  const th = (55 * Math.PI) / 180;
  const hold = async (cap, clock, ms) => {
    // the held pen's own samples, every 16 ms of its clock
    for (let k = 0; k < ms / 16; k++) {
      clock.t += 16;
      await new Promise((r) => setTimeout(r, 18));
    }
  };
  const write = async (holdMs, endHoldMs) => {
    const clock = { t: 1000 };
    const cap = createCapture({ now: () => clock.t, pen: PEN });
    cap.setFlex({ slant: 55, swell: 6, hold: true });
    cap.down({ x: 100, y: 100 }, ev(clock.t));
    await hold(cap, clock, holdMs);
    for (let i = 1; i <= 20; i++) {
      // then down the slant
      clock.t += 8;
      cap.move({ x: 100 - Math.cos(th) * i * 1.5, y: 100 + Math.sin(th) * i * 1.5 }, ev(clock.t));
    }
    await hold(cap, clock, endHoldMs);
    cap.up(null, ev(clock.t + 30));
    assert.ok(cap.strokes[0].synthP, 'a mouse on a flex nib writes synthetic pressure');
    return cap.strokes[0].points;
  };
  const held = await write(400, 300);
  const quick = await write(0, 0);
  const firstMove = (pts) => pts.find((p, i) => i > 0 && (p.x !== pts[0].x || p.y !== pts[0].y));
  assert.ok(
    held.some((p) => p.x === held[0].x && p.p > 0.9),
    'held still, the tines open where it landed',
  );
  assert.ok(firstMove(held).p > 0.9, `so the pull starts square (${firstMove(held).p.toFixed(2)})`);
  assert.ok(held.at(-1).p > 0.95, 'a stop before the lift holds them open: a square end');
  assert.ok(firstMove(quick).p < 0.5, `without the hold it starts near a point (${firstMove(quick).p.toFixed(2)})`);
});
