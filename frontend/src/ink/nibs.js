import { stampPath, broadPath } from './strokes.js';
import { paintPaper } from './paper.js';

// Nib models for the drawing pad. Pad strokes are recorded in page pixels
// (1400 across a letter-width page, about 6.5 px per mm) as
//   { nib: 'pen',   size, points }
//   { nib: 'flex',  hairline, maxWidth, swell, slant, points }
//   { nib: 'broad', size, angle, points }
// with points [{ x, y, t, p, pen }]: t the timestamp, p pointer pressure, pen
// true for a stylus. toSharedStroke() turns one into the shared letter format.
//
// pen    constant width.
// flex   a pointed flexible nib. Upstrokes are the hairline. A downstroke along
//        the slant swells over `swell` px towards `maxWidth` and thins again
//        before release. A pressure pen drives the width directly instead.
// broad  a flat edge of width `size` held at `angle`; thick and thin come from
//        the direction of travel, like an italic or gothic pen.

export const NIBS = {
  pen: { name: 'Plain pen' },
  flex: { name: 'Flex nib' },
  broad: { name: 'Broad nib (italic / gothic)' },
};

export const PX_PER_MM = 1400 / 215.9; // pad pages are 1400 px across a letter-width page
const MAX_PAUSE = 1500; // ms of thinking time kept between strokes on playback

export const PEN_SIZES = { fine: 3, medium: 5, broad: 8 };
export const BROAD_SIZES = { '1.5 mm': 10, '2.4 mm': 16, '3.8 mm': 25, '6.0 mm': 39 };
export const FLEX_PRESETS = {
  copperplate: { name: 'Copperplate (lots of spread)', hairline: 1.4, maxWidth: 14, swell: 25, slant: 55, lineMm: 14 },
  spencerian: { name: 'Spencerian (little spread)', hairline: 1.2, maxWidth: 6, swell: 40, slant: 52 },
};

// Guide line sets as ascender : x-height : descender. [] = baselines only.
export const GUIDES = {
  none: null,
  plain: [],
  '1:2:1': [1, 2, 1],
  '2:3:2': [2, 3, 2],
  '3:2:3': [3, 2, 3],
  '1:1:1': [1, 1, 1],
};

// `live` = the stroke is still being drawn, so its last shade has no end yet.
export function renderStroke(ctx, stroke, live = false) {
  const pts = smooth(stroke.points);
  if (!pts.length) return;
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (stroke.nib === 'pen') {
    ctx.lineWidth = stroke.size;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y); // a dot
    ctx.stroke();
  } else if (stroke.nib === 'broad') {
    broadPath(ctx, pts, stroke.size, stroke.angle ?? 35);
    ctx.fill();
    ctx.lineWidth = 0.8; // keeps the hairline when moving along the nib's edge
    ctx.stroke();
  } else {
    stampPath(ctx, pts, flexWidths(pts, stroke, live));
    ctx.fill();
  }
  ctx.restore();
}

// A pad stroke as the shared format: the same smoothed geometry the pad drew,
// the nib's width at every point, the recorded times.
export function toSharedStroke(stroke) {
  const pts = smooth(stroke.points);
  let widths;
  if (stroke.nib === 'flex') widths = flexWidths(pts, stroke, false);
  else widths = pts.map(() => stroke.size);
  return {
    angle: stroke.nib === 'broad' ? stroke.angle ?? 35 : null,
    points: pts.map((p, i) => ({ x: p.x, y: p.y, t: p.t ?? 0, w: widths[i] })),
  };
}

// Recorded pad strokes as the shared format, with real timing (long pauses capped).
export function timedStrokes(recorded) {
  const out = [];
  let clock = 0;
  let prevEnd = null;
  for (const stroke of recorded) {
    const s = toSharedStroke(stroke);
    if (!s.points.length) continue;
    const rawStart = s.points[0].t;
    clock += prevEnd == null ? 0 : Math.min(MAX_PAUSE, Math.max(0, rawStart - prevEnd));
    const base = clock;
    for (const p of s.points) p.t = base + Math.max(0, p.t - rawStart);
    clock = s.points[s.points.length - 1].t;
    prevEnd = stroke.points[stroke.points.length - 1].t;
    out.push(s);
  }
  return out;
}

// Paper with guide lines. Drawn on its own canvas so it never becomes ink.
// A ratio guide such as 2:3:2 is ascender : x-height : descender, and one set
// is `spacing` px tall: a dashed ascender line, the waist line, a dark
// baseline, and the dashed descender line, which is the next set's ascender
// line. The x-height band is lightly shaded so the ratio reads at a glance.
//
// `width`/`height` are page pixels; the canvas is `scale` times that, sized to
// the screen. Lines are placed in screen pixels, `lineWidth` device px wide, so
// they stay crisp at any zoom instead of aliasing when CSS scales the canvas.
export function drawGuides(ctx, width, height, { guide = 'plain', spacing = 56, slant = 0, paper = 'plain', scale = 1, lineWidth = 1 } = {}) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  paintPaper(ctx, paper, width, height);
  const ratio = GUIDES[guide];
  if (!ratio) {
    ctx.restore();
    return;
  }
  const lw = Math.max(1, Math.round(lineWidth));
  const snap = (y) => Math.round(y * scale) + (lw % 2 ? 0.5 : 0);
  const dash = Math.max(3, Math.round(7 * scale));
  ctx.lineWidth = lw;
  const line = (color, y, dashed = false) => {
    const yy = snap(y);
    ctx.strokeStyle = color;
    ctx.setLineDash(dashed ? [dash, dash] : []);
    ctx.beginPath();
    ctx.moveTo(0, yy);
    ctx.lineTo(W, yy);
    ctx.stroke();
  };
  if (ratio.length === 0) {
    for (let y = spacing; y < height; y += spacing) line('#8fa2bd', y);
  } else {
    const [asc, xh, desc] = ratio;
    const unit = spacing / (asc + xh + desc);
    ctx.fillStyle = 'rgba(120, 150, 200, 0.07)';
    for (let top = 0; top < height; top += spacing) {
      const waist = Math.round((top + asc * unit) * scale);
      const base = Math.round((top + (asc + xh) * unit) * scale);
      ctx.fillRect(0, waist, W, base - waist);
    }
    for (let top = 0; top < height; top += spacing) {
      line('#b9c4d4', top, true); // ascender line (the previous set's descender line)
      line('#9cabc2', top + asc * unit); // waist line
      line('#5b7096', top + (asc + xh) * unit); // baseline
    }
  }
  ctx.setLineDash([]);
  if (slant) {
    ctx.lineWidth = Math.max(1, lw * 0.75);
    ctx.strokeStyle = 'rgba(70, 90, 130, 0.13)'; // faint on any paper
    const run = height / Math.tan((slant * Math.PI) / 180);
    for (let x = -run; x < width; x += spacing * 2) {
      ctx.beginPath();
      ctx.moveTo(x * scale, H);
      ctx.lineTo((x + run) * scale, 0);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// The baselines a guide puts on the page, as rows for the strokes file.
export function guideRows(guide, spacing, height) {
  const ratio = GUIDES[guide];
  if (!ratio) return [];
  const rows = [];
  if (ratio.length === 0) {
    for (let y = spacing; y < height; y += spacing) rows.push(y);
  } else {
    const [asc, xh, desc] = ratio;
    const unit = spacing / (asc + xh + desc);
    for (let top = 0; top < height; top += spacing) rows.push(top + (asc + xh) * unit);
  }
  return rows;
}

// Width at every point of a flex stroke.
function flexWidths(pts, nib, live) {
  const n = pts.length;
  const widths = new Float32Array(n);
  const range = Math.max(0, nib.maxWidth - nib.hairline);

  if (pts[0].pen) {
    for (let i = 0; i < n; i++) widths[i] = nib.hairline + range * Math.min(1, pts[i].p * 1.6);
    return widths;
  }

  const a = (nib.slant * Math.PI) / 180;
  const down = { x: -Math.cos(a), y: Math.sin(a) };
  const arc = new Float32Array(n);
  const shade = new Float32Array(n);
  let dx = 0;
  let dy = 0;
  for (let i = 1; i < n; i++) {
    const sx = pts[i].x - pts[i - 1].x;
    const sy = pts[i].y - pts[i - 1].y;
    const ds = Math.hypot(sx, sy);
    arc[i] = arc[i - 1] + ds;
    if (ds > 0) {
      const k = 1 - Math.exp(-ds / 6);
      dx += (sx / ds - dx) * k;
      dy += (sy / ds - dy) * k;
    }
    const m = Math.hypot(dx, dy) || 1;
    shade[i] = Math.max(0, (dx * down.x + dy * down.y) / m) ** 1.5;
  }

  let i = 0;
  while (i < n) {
    if (shade[i] <= 0.1) {
      widths[i] = nib.hairline;
      i++;
      continue;
    }
    let j = i;
    while (j < n && shade[j] > 0.1) j++;
    const start = arc[i];
    const end = arc[j - 1];
    const open = live && j === n;
    for (let k = i; k < j; k++) {
      let env = (arc[k] - start) / nib.swell;
      if (!open) env = Math.min(env, (end - arc[k]) / nib.swell);
      env = Math.sin(Math.min(1, Math.max(0, env)) * (Math.PI / 2));
      widths[k] = nib.hairline + range * shade[k] * env;
    }
    i = j;
  }
  return widths;
}

// Light 3-tap smoothing of the raw pointer positions.
function smooth(points) {
  if (points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1];
    const b = points[i];
    const c = points[i + 1];
    out.push({ ...b, x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4 });
  }
  out.push(points[points.length - 1]);
  return out;
}
