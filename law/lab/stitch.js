// The stitcher: the attacker who decides design B. They know the secret
// phrase (assume the worst) and hold the person's public writing: every letter
// of the alphabet in that person's hand, with its real timing and pressure.
// They compose the phrase digitally from those letterforms, letter by letter,
// spaced as the person spaces, with pauses taken from the person's own
// pangram, and submit it as acts. Lab only.
//
// letters: { a: actsBytes, ... } each written alone in the same box frame (so
// the baseline lines up); pangram: actsBytes of ordinary writing.

import { decodeCanonical, encodeActs, penTimeline } from '../v1/acts.js';

function absStrokes(bytes) {
  const rec = decodeCanonical(bytes);
  const pens = penTimeline(rec);
  return rec.strokes.map((s, i) => ({
    x: [...s.x].map((v) => v + rec.orgX * 10), y: [...s.y].map((v) => v + rec.orgY * 10),
    t: [...s.t], p: s.p ? [...s.p] : null, hasP: s.hasP, kind: s.kind, pen: pens[i][0][1],
  }));
}

// Gaps between strokes in ordinary writing: the letter gap (median of the short
// ones) and the word gap (the long ones).
export function rhythmOf(pangramBytes) {
  const strokes = absStrokes(pangramBytes);
  const gaps = [];
  for (let i = 1; i < strokes.length; i++) gaps.push(strokes[i].t[0] - strokes[i - 1].t[strokes[i - 1].t.length - 1]);
  gaps.sort((a, b) => a - b);
  const q = (f) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * f))] : null);
  return { letterGap: q(0.3) ?? 120, wordGap: q(0.85) ?? 500 };
}

export function stitch(letters, pangramBytes, phrase) {
  const { letterGap, wordGap } = rhythmOf(pangramBytes);
  const glyphs = {};
  let heights = [];
  for (const [ch, bytes] of Object.entries(letters)) {
    const strokes = absStrokes(bytes);
    const xs = strokes.flatMap((s) => s.x), ys = strokes.flatMap((s) => s.y);
    glyphs[ch] = { strokes, x0: Math.min(...xs), x1: Math.max(...xs) };
    heights.push(Math.max(...ys) - Math.min(...ys));
  }
  heights = heights.sort((a, b) => a - b);
  const space = Math.round((heights[Math.floor(heights.length / 2)] || 300) * 0.15);
  const out = [];
  let cursor = 0;
  let clock = 0;
  let pendingGap = 0;
  for (const ch of phrase.toLowerCase()) {
    if (ch === ' ') {
      cursor += space * 4;
      pendingGap = wordGap;
      continue;
    }
    const g = glyphs[ch];
    if (!g) continue;
    const dx = cursor - g.x0;
    for (const s of g.strokes) {
      const t0 = s.t[0];
      const start = out.length ? clock + (pendingGap || letterGap) : 0;
      pendingGap = 0;
      out.push({ ...s, x: s.x.map((v) => v + dx), t: s.t.map((v) => v - t0 + start) });
      clock = out[out.length - 1].t[s.t.length - 1];
    }
    cursor += g.x1 - g.x0 + space;
  }
  const xs = out.flatMap((s) => s.x), ys = out.flatMap((s) => s.y);
  const orgX = Math.floor(Math.max(0, Math.min(...xs)) / 10), orgY = Math.floor(Math.max(0, Math.min(...ys)) / 10);
  return encodeActs({
    orgX, orgY,
    strokes: out.map((s, i) => ({
      hasP: s.hasP, kind: s.kind, synthP: false, x: s.x.map((v) => Math.max(0, v - orgX * 10)), y: s.y.map((v) => Math.max(0, v - orgY * 10)),
      t: s.t, p: s.p, pens: i === 0 ? [{ at: 0, ...s.pen }] : [],
    })),
  });
}
