// A handwritten UI label: one word or phrase written on the pad, kept as its
// strokes so it can be drawn crisply at any size, in the text colour, and
// written out again on demand.
//
// File (src/hand/drawn/<name>.json):
//   { v: 1, text, w, h, base, line, dur, s: [[angle, x, y, t, w, dx, dy, dt, dw, ...], ...] }
// w, h: the ink's box in page px; base: the baseline's y in that box; line:
// the ruled line spacing it was written on, which sets its size next to text;
// dur: ms to write it. Per stroke, the first point is absolute and the rest
// are deltas; x, y in half px, w in tenths of a px, t in ms. Optional `scale`:
// how big it shows next to text (1 = as written), set in the studio.

const PAD = 4; // page px of margin around the ink
const MAX_GAP = 120; // ms kept between strokes: labels write without long pauses
const MIN_STEP = 1.5; // page px between kept points
const MIN_WIDTH_STEP = 0.4; // a smaller width change than this doesn't keep a point

// The name a label is stored under: "Save & send" → "save-and-send".
export function handName(text) {
  return text.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// From the pad's strokes ({ rows, strokes: [{ angle, points: [{ x, y, t, w }] }] }).
export function makeHandAsset(data, text) {
  const strokes = data.strokes.filter((s) => s.points.length);
  if (!strokes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let sumY = 0;
  let count = 0;
  for (const s of strokes) {
    for (const p of s.points) {
      const r = p.w / 2;
      minX = Math.min(minX, p.x - r);
      maxX = Math.max(maxX, p.x + r);
      minY = Math.min(minY, p.y - r);
      maxY = Math.max(maxY, p.y + r);
      sumY += p.y;
      count++;
    }
  }
  // The baseline is the first ruled line below the middle of the ink.
  const rows = (data.rows ?? []).slice().sort((a, b) => a - b);
  const line = rows.length > 1 ? rows[1] - rows[0] : Math.max(20, maxY - minY);
  const base = rows.find((r) => r >= sumY / count) ?? maxY;
  const x0 = Math.floor(minX - PAD);
  const y0 = Math.floor(Math.min(minY, base) - PAD);
  const w = Math.ceil(maxX + PAD) - x0;
  const h = Math.ceil(Math.max(maxY, base) + PAD) - y0;

  const out = [];
  let clock = 0;
  let prevEnd = null;
  for (const stroke of strokes) {
    const pts = stroke.points;
    const start = pts[0].t;
    if (prevEnd !== null) clock += Math.min(MAX_GAP, Math.max(0, start - prevEnd));
    const kept = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = kept[kept.length - 1];
      const p = pts[i];
      const last = i === pts.length - 1;
      if (last || Math.hypot(p.x - a.x, p.y - a.y) >= MIN_STEP || Math.abs(p.w - a.w) >= MIN_WIDTH_STEP) kept.push(p);
    }
    const enc = [stroke.angle ?? null];
    let px = 0;
    let py = 0;
    let pt = 0;
    let pw = 0;
    kept.forEach((p, i) => {
      const x = Math.round((p.x - x0) * 2);
      const y = Math.round((p.y - y0) * 2);
      const t = Math.round(clock + p.t - start);
      const wi = Math.round(p.w * 10);
      if (i === 0) enc.push(x, y, t, wi);
      else enc.push(x - px, y - py, t - pt, wi - pw);
      px = x;
      py = y;
      pt = t;
      pw = wi;
    });
    clock += pts[pts.length - 1].t - start;
    prevEnd = pts[pts.length - 1].t;
    out.push(enc);
  }
  return { v: 1, text, w, h, base: Math.round(base - y0), line: Math.round(line), dur: Math.round(clock), s: out };
}

const decoded = new WeakMap();

// The label as strokes in the shared format, in its own box's page px. Cached.
// Book ink (book/ink.js inkAsset) arrives already decoded, as `asset.data`.
export function handStrokes(asset) {
  if (asset.data) return asset.data;
  let data = decoded.get(asset);
  if (data) return data;
  data = {
    width: asset.w,
    height: asset.h,
    strokes: asset.s.map(([angle, ...n]) => {
      const points = [];
      let x = 0;
      let y = 0;
      let t = 0;
      let w = 0;
      for (let i = 0; i + 3 < n.length; i += 4) {
        x += n[i];
        y += n[i + 1];
        t += n[i + 2];
        w += n[i + 3];
        points.push({ x: x / 2, y: y / 2, t, w: w / 10 });
      }
      return { angle, points };
    }),
  };
  decoded.set(asset, data);
  return data;
}
