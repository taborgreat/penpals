// The pen's sound (world.md Phase 2): made from the acts, as the ink is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BANDS } from './bands.js';
import { createEar } from './ear.js';
import { grain } from './grain.js';
import { strokeSounds, dipTap, shellRing, recordSounds, soundPen, penHand, penVoice } from './pen.js';
import { encodeActs, decodeActs } from 'penpals-law/v2/acts';

// a stroke: n points across the page at `speed` px a ms, pressed `p`
const stroke = (speed, p = 0.6, n = 40) => Array.from({ length: n }, (_, i) => ({ x: 100 + i * speed * 8, y: 200, t: i * 8, p }));
const scratches = (evs) => evs.filter((e) => e.kind === 'pen-scratch');
const energy = (evs) => scratches(evs).reduce((s, e) => s + e.bands.reduce((a, x) => a + x, 0), 0);
// where a sound's energy lies: its bands' mean frequency (log), Hz
const centre = (evs) => {
  let w = 0,
    s = 0;
  for (const e of scratches(evs)) e.bands.forEach((x, b) => ((w += x * Math.log2(BANDS[b])), (s += x)));
  return 2 ** (w / s);
};

test('the same acts make the same sound: playing a stroke back plays its very scratching, at any speed', () => {
  const pts = stroke(0.3);
  const a = strokeSounds(pts, { pen: { nib: 'flex', hairline: 1.4 }, seed: 9 });
  const b = strokeSounds(pts, { pen: { nib: 'flex', hairline: 1.4 }, seed: 9 });
  assert.deepEqual(a, b);
  assert.deepEqual([...grain(a[5])], [...grain(b[5])], 'grain for grain');
  const fast = strokeSounds(pts, { pen: { nib: 'flex', hairline: 1.4 }, seed: 9, speed: 2 });
  assert.equal(fast.length, a.length);
  assert.ok(Math.abs(fast[10].t - a[10].t / 2) < 1e-12, 'played twice as fast: the same events, twice as close');
  assert.deepEqual(fast[10].bands, a[10].bands);
  assert.equal(a[0].kind, 'pen-down');
  assert.equal(a.at(-1).kind, 'pen-lift');
});

test('a fast stroke sounds higher and brighter than a slow one; a brush is quieter than a flexible nib; a broad nib hisses wider', () => {
  const flex = { nib: 'flex', hairline: 1.4 };
  const slow = strokeSounds(stroke(0.05), { pen: flex }),
    fast = strokeSounds(stroke(0.4), { pen: flex });
  assert.ok(centre(fast) > 2 * centre(slow), `${centre(slow).toFixed(0)} Hz slow, ${centre(fast).toFixed(0)} Hz fast`);
  assert.ok(energy(fast) / scratches(fast).length > energy(slow) / scratches(slow).length, 'and louder: the rubbing does more work');
  const brush = strokeSounds(stroke(0.3), { pen: { nib: 'brush', size: 8 } }),
    nib = strokeSounds(stroke(0.3), { pen: flex });
  assert.ok(energy(brush) < energy(nib) / 10, 'hair on paper barely whispers');
  const width = (evs) => {
    const e = scratches(evs)[10].bands;
    const top = Math.max(...e);
    return e.filter((x) => x > top / 4).length; // bands within 6 dB of its loudest
  };
  assert.ok(width(strokeSounds(stroke(0.3), { pen: { nib: 'broad', size: 16 } })) > width(nib), 'a broad edge spreads its sound wide');
});

test('ink: a well-wetted nib glides quieter; one running dry rasps (louder, brighter)', () => {
  const pen = { nib: 'pen', size: 5 };
  const wet = strokeSounds(stroke(0.3), { pen, wet: 1 }),
    dry = strokeSounds(stroke(0.3), { pen, wet: 0 });
  assert.ok(energy(dry) > 2 * energy(wet));
  assert.ok(centre(dry) > centre(wet));
});

test("a dip at the jar: a knock, and the glass ringing at its shell's pitch (from the glass row and the jar)", () => {
  const r = shellRing('glass', 0.025, 0.003);
  assert.ok(r.f > 1000 && r.f < 8000 && r.q >= 500, `${r.f.toFixed(0)} Hz, Q ${r.q}`);
  assert.ok(shellRing('glass', 0.05, 0.003).f < r.f / 3, 'a jar twice as wide rings two octaves down');
  const tap = dipTap([1.8, 2.7, 0.8], 0, { radius: 0.025, wall: 0.003 });
  assert.equal(tap.ring.f, r.f);
});

test('the pen is heard at once: from an act to its sound in well under 20 ms of work, played when it happened', () => {
  const played = [];
  const ear = createEar({ out: { voice: (g, at, pos) => played.push({ at, pos }) } });
  const head = { pos: [1.5, 2.2, 1.25], yaw: 0, pitch: -50 };
  ear.head(head);
  const pts = stroke(0.3, 0.6, 3);
  const t0 = performance.now();
  for (const e of strokeSounds(pts, { pen: { nib: 'flex', hairline: 1.4 }, at: () => [1.5, 2.6, 0.75], t0: 10 })) ear.hear(e);
  ear.frame(10, 0.03);
  const ms = performance.now() - t0;
  assert.ok(ms < 20, `${ms.toFixed(2)} ms`);
  assert.ok(played.length >= 2);
  assert.ok(played[0].at - 10 < 0.02, `played ${((played[0].at - 10) * 1000).toFixed(1)} ms after it happened (the sound's way from the nib to the ear)`);
});

test('playback: a sealed record plays back the very scratching the hand made, pen and all', () => {
  const pts = stroke(0.3, 0.6, 30).map((q) => ({ ...q, x: q.x / 1, y: q.y }));
  const lp = { nib: 1, size: 14, flex: 120, flow: 7, rgb: [20, 20, 20], angle: 30 };
  const rec = decodeActs(
    encodeActs({
      orgX: 0,
      orgY: 0,
      strokes: [
        {
          hasP: true,
          kind: 2,
          synthP: false,
          x: pts.map((q) => Math.round(q.x * 10)),
          y: pts.map((q) => Math.round(q.y * 10)),
          t: pts.map((q) => q.t),
          p: pts.map((q) => Math.round(q.p * 255)),
          pens: [{ at: 0, ...lp }],
        },
      ],
    }),
  );
  const played = recordSounds(rec, { seed: 3 });
  const hand = strokeSounds(
    pts.map((q) => ({ ...q, p: Math.round(q.p * 255) / 255 })),
    { pen: soundPen(lp), seed: 3 * 256 },
  );
  assert.deepEqual(played, hand);
  assert.ok(soundPen({ ...lp, rgb: [255, 255, 255] }).nib === 'brush', 'the water brush is hair');
});

test("a drop thrown lands as a patter: harder the faster it flew and the more water it was; the hand hears the ink's reservoir", () => {
  const heardEvs = [];
  const hand = penHand((e) => heardEvs.push(e), 5);
  const pos = [1.5, 2.6, 0.75];
  const pt = (i, t = i * 8) => ({ x: 100 + i * 3, y: 100, t, p: 0.6 });
  hand.down(pt(0), pos, 0, { reservoir: 1, drops: 0, W: 0 });
  hand.move(pt(1), pos, 0.008, { reservoir: 1, drops: 0, W: 0 });
  hand.move(pt(2), pos, 0.016, { reservoir: 1, drops: 2, W: 400 });
  const pat = heardEvs.filter((e) => e.kind === 'pen-patter');
  assert.equal(pat.length, 2, 'each drop its own');
  const sum = (e) => e.bands.reduce((a, x) => a + x, 0);
  const v = penVoice({ seed: 1 });
  v.down(pt(0), pos, 0);
  v.move(pt(1), pos, 0);
  const slow = v.patter(pos, 0, 200)[0];
  const v2 = penVoice({ seed: 1 });
  v2.down(pt(0), pos, 0);
  v2.move(pt(1, 4), pos, 0); // twice as fast
  assert.ok(sum(v2.patter(pos, 0, 200)[0]) > sum(slow) * 2);
  assert.ok(sum(v.patter(pos, 0, 800)[0]) > sum(slow), 'more water, a harder knock');
  // a dip pen running dry: louder as its reservoir empties
  const loud = (r) => {
    const got = [];
    const h = penHand((e) => got.push(e), 7);
    h.down(pt(0), pos, 0, { reservoir: r });
    h.move(pt(1), pos, 0.008, { reservoir: r });
    return energy(got);
  };
  assert.ok(loud(0.05) > 2 * loud(1));
});
