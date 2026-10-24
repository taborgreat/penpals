// A minute of continuous writing, live: the work per tick must stay flat. A
// tick walks only wet tiles; a tile whose water is gone snaps to fixed and
// leaves the active set until ink lands on it again. So the active set is the
// stroke's still-wet trail: it grows only until the oldest ink of the stroke has
// dried (about a second at the default flow, a few seconds at the heaviest),
// then stays flat however long the stroke goes on. The work is counted (tiles
// walked per tick, tiles handed to the screen per frame), not timed, so the
// test does not depend on the machine; the times are printed alongside.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLive } from '../v1/live.js';
import { testPaperKey } from '../tools/fixtures.js';

const family = { grain: 8, weight: 8, tooth: 0 };
const paperKey = testPaperKey('bench');

// A minute of cursive-like writing at 120 Hz, line after line across a page.
function minute() {
  const pts = [];
  for (let i = 0; i <= 60000 / 8; i++) {
    const t = i * 8;
    const u = t / 1000;
    const along = (u * 40) % 1300;
    const line = Math.floor((u * 40) / 1300);
    pts.push({ x: 2000 + Math.round(10 * (along + 6 * Math.sin(u * 9))), y: 2000 + Math.round(10 * (40 * Math.abs(Math.sin(u * 6)) + 120 * line)), t, p: null });
  }
  return pts;
}

function run(flow) {
  const pts = minute();
  const live = createLive({ paperKey, family });
  live.down(pts[0], { nib: 0, size: 30, flex: 0, flow, rgb: [20, 20, 20], angle: 0 }, false);
  let i = 1;
  const seconds = [];
  for (let sec = 0; sec < 60; sec++) {
    const t0 = performance.now();
    let active = 0;
    let sent = 0;
    const frames = Math.round(1000 / 16);
    for (let f = 0; f < frames; f++) {
      const until = sec * 1000 + (f + 1) * 16;
      while (i < pts.length && pts[i].t <= until) live.point(pts[i++]);
      active += live.activeTiles;
      sent += live.changed().length;
    }
    seconds.push({ ms: performance.now() - t0, active: active / frames, sent: sent / frames });
  }
  return seconds;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

for (const [flow, settledBy] of [[7, 2], [15, 10]]) {
  test(`a minute-long stroke at flow ${flow}: flat work once its oldest ink has dried`, () => {
    const s = run(flow);
    const early = s.slice(settledBy, settledBy + 10);
    const late = s.slice(50, 60);
    console.log(`flow ${flow}: per second of writing ${s.filter((_, k) => k % 10 === 0 || k === 59).map((x) => `${x.ms.toFixed(0)} ms / ${x.active.toFixed(0)} active / ${x.sent.toFixed(0)} sent`).join(' · ')}`);
    assert.ok(mean(late.map((x) => x.active)) <= 1.15 * mean(early.map((x) => x.active)), 'tiles walked per tick keep growing');
    assert.ok(mean(late.map((x) => x.sent)) <= 1.15 * mean(early.map((x) => x.sent)) + 1, 'tiles sent per frame keep growing');
    assert.ok(Math.max(...late.map((x) => x.active)) < 200, 'the active set stays a trail, not the page');
  });
}
