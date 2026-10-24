// What a pen does to the ink, end to end: pointer events through capture into
// acts, grown by the law. Starts and flex nibs, as the writer sees them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapture } from './capture.js';
import { lawPen } from './pens.js';
import { decodeActs } from 'penpals-law/v2/acts';
import { settle } from 'penpals-law/record';

const FAMILY = { grain: 8, weight: 8, tooth: 0 };
const SEED = new Uint8Array(64).map((_, i) => (i * 29 + 3) & 255);
const ev = (timeStamp, pointerType = 'mouse') => ({ timeStamp, pressure: 0.5, pointerType });

// The settled ink in rows or columns of sheet cells (2 per page unit): per line,
// how much ink and how many cells are inked.
function profile(acts, axis) {
  const { cells } = settle(acts, SEED, FAMILY);
  const lines = new Map();
  for (const [y, x, f0, f1, f2] of cells) {
    const k = axis === 'x' ? x : y;
    const o = axis === 'x' ? y : x;
    const l = lines.get(k) ?? { ink: 0, cells: [] };
    const v = f0 + f1 + f2;
    l.ink += v;
    if (v > 120) l.cells.push(o);
    lines.set(k, l);
  }
  return lines;
}

// A straight fast stroke along +x from page (100, 100), 300 units a second, 8 ms samples.
function straight(cap, t0, { latency = 35, samples = 60 } = {}) {
  cap.down({ x: 100, y: 100 }, ev(t0));
  cap.move({ x: 100, y: 100 }, ev(t0 + 5)); // the pointer reports where it landed: not an act
  for (let i = 1; i <= samples; i++) cap.move({ x: 100 + i * 2.4, y: 100 }, ev(t0 + latency + (i - 1) * 8));
  cap.up(null, ev(t0 + latency + (samples - 1) * 8 + 40)); // the button comes up 40 ms after the last motion
}

function startVsMiddle(acts) {
  const cols = profile(acts, 'x');
  const xs = [...cols.keys()].sort((a, b) => a - b);
  const width = (x) => cols.get(x)?.cells.length ?? 0;
  const ink = (x) => cols.get(x)?.ink ?? 0;
  const start = xs.slice(0, 14);
  const mid = xs.slice(Math.floor(xs.length / 2) - 7, Math.floor(xs.length / 2) + 7);
  const end = xs.slice(-14);
  return {
    start: { ink: Math.max(...start.map(ink)), width: Math.max(...start.map(width)) },
    middle: { ink: Math.max(...mid.map(ink)), width: Math.max(...mid.map(width)) },
    end: { ink: Math.max(...end.map(ink)), width: Math.max(...end.map(width)) },
  };
}

test('a fast stroke starts as it goes on: the click before the first move is not a dwell', () => {
  let clock = 1000;
  const cap = createCapture({ now: () => clock, pen: lawPen({ nib: 'pen', size: 5 }, '#202020') });
  straight(cap, 1000);
  cap.cancel();
  const acts = cap.acts();
  const s = decodeActs(acts).strokes[0];
  assert.notEqual(s.x[1], s.x[0], 'the pen-down and a move at the same spot are one act, not two');
  assert.ok(s.t[1] - s.t[0] <= 8, `the first motion has a sample's interval, not the click's (${s.t[1] - s.t[0]} ms)`);
  const r = startVsMiddle(acts);
  console.log('fast stroke', JSON.stringify(r));
  assert.ok(r.start.ink <= r.middle.ink, 'the start is darker than the middle: a dot');
  assert.ok(r.start.width <= r.middle.width, 'the start is wider than the middle: a dot');
  // (a cell of spreading is the ink standing a moment before it sinks: law 2's wet front; a dot is darker too)
  assert.ok(r.end.ink <= r.middle.ink && r.end.width <= r.middle.width + 1, 'the release left a dot at the end');
  void clock;
});

test('a pen held still before writing beads where it was held', async () => {
  const cap = createCapture({ pen: lawPen({ nib: 'pen', size: 5 }, '#202020') }); // the real clock: hold samples come from timers
  const t0 = performance.now();
  cap.down({ x: 100, y: 100 }, ev(t0));
  await new Promise((r) => setTimeout(r, 300));
  const t1 = performance.now();
  for (let i = 1; i <= 60; i++) cap.move({ x: 100 + i * 2.4, y: 100 }, ev(t1 + (i - 1) * 8));
  cap.up(null, ev(t1 + 480));
  const r = startVsMiddle(cap.acts());
  console.log('held, then fast', JSON.stringify(r));
  assert.ok(r.start.ink > 1.3 * r.middle.ink, 'a 300 ms hold leaves a bead');
  assert.ok(r.start.width > r.middle.width);
});

test('a flex nib under a mouse: synthetic pressure in the acts, thick going down the slant, hairline going up', () => {
  const cap = createCapture({ now: () => 0, pen: lawPen({ nib: 'flex', hairline: 1.4, maxWidth: 14 }, '#202020') });
  cap.setFlex({ slant: 55, swell: 25 });
  // a hairpin: up and to the right (an upstroke), then straight down the 55° slant (a downstroke)
  const th = (55 * Math.PI) / 180;
  const pts = [];
  for (let i = 0; i <= 80; i++) pts.push({ x: 40 + (110 * i) / 80, y: 110 - (100 * i) / 80 });
  for (let i = 1; i <= 80; i++) pts.push({ x: 150 - ((100 / Math.tan(th)) * i) / 80, y: 10 + (100 * i) / 80 });
  let t = 1000;
  cap.down(pts[0], ev(t));
  for (const p of pts.slice(1)) cap.move(p, ev((t += 8)));
  cap.up(null, ev((t += 8)));
  const acts = cap.acts();
  const s = decodeActs(acts).strokes[0];
  assert.equal(s.hasP, true);
  assert.equal(s.synthP, true, 'synthP marks the pressure as synthetic');
  const p = [...s.p];
  console.log('synthetic p, every 10th act:', p.filter((_, i) => i % 10 === 0).join(' '));
  assert.ok(Math.max(...p.slice(0, 80)) < 40, 'the upstroke stays light');
  assert.ok(Math.max(...p.slice(110)) > 180, 'the downstroke presses');
  // widths in the settled ink, row by row through the middle of the hairpin
  const rows = profile(acts, 'y');
  const up = [];
  const down = [];
  for (let y = 70; y <= 90; y++) { // page units → cells ×2: rows 140..180
    const row = rows.get(2 * y);
    if (!row) continue;
    const xs = row.cells.sort((a, b) => a - b);
    const runs = [];
    for (const x of xs) {
      if (runs.length && x - runs.at(-1).end <= 1) runs.at(-1).end = x;
      else runs.push({ start: x, end: x });
    }
    if (runs.length !== 2) continue; // where the strokes meet, there is nothing to tell apart
    const [left, right] = runs; // the upstroke runs left of the downstroke here
    up.push(left.end - left.start + 1);
    down.push(right.end - right.start + 1);
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`row widths (cells): upstroke ${mean(up).toFixed(1)}, downstroke ${mean(down).toFixed(1)} over ${up.length} rows`);
  assert.ok(up.length >= 10, 'enough rows to compare');
  assert.ok(mean(down) >= 2 * mean(up), 'the downstroke is at least twice the upstroke');
});
