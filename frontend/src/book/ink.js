// Ink for books (books.md A4): a stroke collection in its own units, top-left 0,0:
//   { id, made, strokes: [{ pts: [[x, y, w, t], ...], a? }], bounds: [w, h] }
// w is the ink's width at that point, t its time in ms, a the nib angle of a
// broad-nib stroke. This file turns pad strokes into that, and that back into
// what the renderer draws.

const PAD = 3; // units of margin around the ink
const MAX_GAP = 400; // ms kept between strokes; longer pauses are shortened on playback
const MIN_STEP = 1.2; // units between kept points
const MIN_WIDTH_STEP = 0.3;
const r1 = (v) => Math.round(v * 10) / 10;

// From the pad's strokes (the shared format, in page px) to a stroke collection,
// cropped to the ink. Returns null if there is no ink.
export function inkFromStrokes(strokes) {
  const list = strokes.filter((s) => s.points.length);
  if (!list.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of list) {
    for (const p of s.points) {
      const r = p.w / 2;
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    }
  }
  const x0 = minX - PAD;
  const y0 = minY - PAD;
  let clock = 0;
  let prevEnd = null;
  const out = list.map((s) => {
    const pts = s.points;
    const start = pts[0].t ?? 0;
    if (prevEnd !== null) clock += Math.min(MAX_GAP, Math.max(0, start - prevEnd));
    const kept = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = kept[kept.length - 1];
      const p = pts[i];
      if (i === pts.length - 1 || Math.hypot(p.x - a.x, p.y - a.y) >= MIN_STEP || Math.abs(p.w - a.w) >= MIN_WIDTH_STEP) kept.push(p);
    }
    const stroke = { pts: kept.map((p) => [r1(p.x - x0), r1(p.y - y0), r1(p.w), Math.round(clock + (p.t ?? 0) - start)]) };
    if (s.angle != null) stroke.a = Math.round(s.angle);
    clock += (pts[pts.length - 1].t ?? 0) - start;
    prevEnd = pts[pts.length - 1].t ?? 0;
    return stroke;
  });
  return { strokes: out, bounds: [r1(maxX - x0 + PAD), r1(maxY - y0 + PAD)] };
}

const decoded = new WeakMap();

// A stroke collection as the shared format the renderer draws. Cached.
export function inkData(ink) {
  let data = decoded.get(ink);
  if (data) return data;
  let duration = 0;
  data = {
    width: ink.bounds[0],
    height: ink.bounds[1],
    strokes: ink.strokes.map((s) => ({
      angle: s.a ?? null,
      points: s.pts.map(([x, y, w, t]) => {
        if (t > duration) duration = t;
        return { x, y, w, t };
      }),
    })),
  };
  data.duration = duration;
  decoded.set(ink, data);
  return data;
}

// A stroke collection in the shape the handwriting components draw (fit mode).
export function inkAsset(ink, extra = {}) {
  const data = inkData(ink);
  return { w: ink.bounds[0], h: ink.bounds[1], line: ink.bounds[1], base: ink.bounds[1], dur: data.duration, data, ...extra };
}

// Parse JSON lines (a chain, or a .book after its first line), skipping an
// unfinished last line.
export function parseLines(text) {
  const end = text.lastIndexOf('\n');
  const body = end < 0 ? '' : text.slice(0, end);
  const out = [];
  for (const line of body.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch { /* a damaged line is skipped */ }
  }
  return out;
}
