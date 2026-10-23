// The shared letter format. Whatever made the marks, a photographed page or
// the pad, a letter is strokes of weighted points:
//   { width, height, tilt, rows, strokes: [{ angle, points: [{ x, y, t, w }] }] }
// x, y in page pixels, t in ms from the start of the letter, w the ink width
// in px at that point. `angle` is null except for broad-nib strokes, where it
// is the nib edge angle and w is the nib width. `tilt` and `rows` are the
// page's line geometry (see sweep.js); empty for the pad.
//
// On disk: 'PNPS', version, size, geometry, then per stroke the first point
// absolute and the rest as deltas (quarter px, ms, fifth px), deflated.
// A few bytes a point. A stroke's first time is relative to the previous
// stroke's start (strokes are stored in start order and may overlap in time);
// later points are relative to the point before. Version 1 files have no
// geometry and time every point from the one before it.

const MAGIC = [0x50, 0x4e, 0x50, 0x53];
const VERSION = 2;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function encodeStrokesRaw({ width, height, tilt = 0, rows = [], strokes }) {
  let count = 0;
  for (const s of strokes) count += s.points.length;
  const buf = new ArrayBuffer(17 + rows.length * 2 + strokes.length * 7 + count * 7);
  const v = new DataView(buf);
  let o = 0;
  for (const b of MAGIC) v.setUint8(o++, b);
  v.setUint8(o++, VERSION);
  v.setUint16(o, width, true); o += 2;
  v.setUint16(o, height, true); o += 2;
  v.setUint32(o, strokes.length, true); o += 4;
  v.setInt16(o, clamp(Math.round(tilt * 10000), -32768, 32767), true); o += 2;
  v.setUint16(o, rows.length, true); o += 2;
  for (const r of rows) { v.setInt16(o, clamp(Math.round(r * 4), -32768, 32767), true); o += 2; }
  let prevStart = 0;
  for (const s of strokes) {
    const hasAngle = s.angle != null;
    v.setUint8(o++, hasAngle ? 1 : 0);
    if (hasAngle) { v.setUint16(o, clamp(Math.round(s.angle * 10), 0, 65535), true); o += 2; }
    v.setUint32(o, s.points.length, true); o += 4;
    let px = 0;
    let py = 0;
    let prevT = prevStart;
    for (let i = 0; i < s.points.length; i++) {
      const p = s.points[i];
      const x = clamp(Math.round(p.x * 4), 0, 65535);
      const y = clamp(Math.round(p.y * 4), 0, 65535);
      if (i === 0) {
        v.setUint16(o, x, true);
        v.setUint16(o + 2, y, true);
      } else {
        v.setInt16(o, clamp(x - px, -32768, 32767), true);
        v.setInt16(o + 2, clamp(y - py, -32768, 32767), true);
      }
      o += 4;
      const dt = clamp(Math.round((p.t || 0) - prevT), 0, 65535);
      v.setUint16(o, dt, true); o += 2;
      v.setUint8(o++, clamp(Math.round(p.w * 5), 1, 255));
      px = x;
      py = y;
      prevT += dt; // accumulate the stored value so rounding never drifts
      if (i === 0) prevStart = prevT;
    }
  }
  return new Uint8Array(buf, 0, o);
}

export function decodeStrokesRaw(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 0;
  for (const b of MAGIC) if (v.getUint8(o++) !== b) throw new Error('not a penpals strokes file');
  const version = v.getUint8(o++);
  if (version !== 1 && version !== 2) throw new Error(`unsupported strokes version ${version}`);
  const width = v.getUint16(o, true); o += 2;
  const height = v.getUint16(o, true); o += 2;
  const count = v.getUint32(o, true); o += 4;
  let tilt = 0;
  const rows = [];
  if (version >= 2) {
    tilt = v.getInt16(o, true) / 10000; o += 2;
    const rowCount = v.getUint16(o, true); o += 2;
    for (let i = 0; i < rowCount; i++) { rows.push(v.getInt16(o, true) / 4); o += 2; }
  }
  const strokes = [];
  let t = 0;
  let strokeStart = 0;
  for (let k = 0; k < count; k++) {
    const flags = v.getUint8(o++);
    let angle = null;
    if (flags & 1) { angle = v.getUint16(o, true) / 10; o += 2; }
    const n = v.getUint32(o, true); o += 4;
    const points = new Array(n);
    let x = 0;
    let y = 0;
    if (version >= 2) t = strokeStart;
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        x = v.getUint16(o, true);
        y = v.getUint16(o + 2, true);
      } else {
        x += v.getInt16(o, true);
        y += v.getInt16(o + 2, true);
      }
      o += 4;
      t += v.getUint16(o, true); o += 2;
      const w = v.getUint8(o++) / 5;
      points[i] = { x: x / 4, y: y / 4, t, w };
      if (i === 0) strokeStart = t;
    }
    strokes.push({ angle, points });
  }
  return { width, height, tilt, rows, strokes };
}

export async function encodeStrokes(data) {
  return new Blob([await deflate(encodeStrokesRaw(data))], { type: 'application/octet-stream' });
}

// Accepts a Blob, an ArrayBuffer or a Uint8Array of the deflated file.
export async function decodeStrokes(source) {
  const bytes = source instanceof Blob ? new Uint8Array(await source.arrayBuffer())
    : source instanceof ArrayBuffer ? new Uint8Array(source) : source;
  return decodeStrokesRaw(await inflate(bytes));
}

async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function strokesDuration(data) {
  let end = 0;
  for (const s of data.strokes) if (s.points.length) end = Math.max(end, s.points[s.points.length - 1].t);
  return end;
}

export function countPoints(data) {
  let n = 0;
  for (const s of data.strokes) n += s.points.length;
  return n;
}

// Draw the strokes as black ink on `ctx`. With `until`, only what has been
// written by that time (the stroke in progress is cut mid-segment).
// `minWidth` (in the data's px) keeps thin strokes visible when drawn small;
// `grow` widens every stroke, e.g. for an outline drawn underneath.
export function renderStrokes(ctx, data, { until = Infinity, minWidth = 0, grow = 0 } = {}) {
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of data.strokes) {
    const pts = until === Infinity ? stroke.points : clipStroke(stroke.points, until);
    if (!pts.length) continue;
    ctx.beginPath();
    if (stroke.angle != null) {
      broadPath(ctx, pts, Math.max(pts[0].w, minWidth) + grow, stroke.angle);
      ctx.fill();
      ctx.lineWidth = Math.max(0.8, minWidth) + grow;
      ctx.stroke();
    } else {
      stampPath(ctx, pts, pts.map((p) => Math.max(p.w, minWidth) + grow));
      ctx.fill();
    }
  }
  ctx.restore();
}

function clipStroke(points, until) {
  if (!points.length || points[0].t > until) return [];
  let last = 0;
  while (last + 1 < points.length && points[last + 1].t <= until) last++;
  const out = points.slice(0, last + 1);
  if (last + 1 < points.length) {
    const a = points[last];
    const b = points[last + 1];
    const f = b.t > a.t ? (until - a.t) / (b.t - a.t) : 1;
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: until, w: a.w + (b.w - a.w) * f });
  }
  return out;
}

// Dense round stamps along the path in one fill: the union is a smooth ribbon
// whose width follows `widths`.
export function stampPath(ctx, pts, widths) {
  const stamp = (x, y, w) => {
    ctx.moveTo(x + w / 2, y);
    ctx.arc(x, y, w / 2, 0, Math.PI * 2);
  };
  if (pts.length === 1) {
    stamp(pts[0].x, pts[0].y, widths[0]);
    return;
  }
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    let s = carry;
    while (s <= len) {
      const t = s / len;
      const w = widths[i - 1] + (widths[i] - widths[i - 1]) * t;
      stamp(a.x + dx * t, a.y + dy * t, w);
      s += Math.min(1.5, Math.max(0.35, w * 0.25));
    }
    carry = s - len;
  }
}

// The nib edge swept along the path: one parallelogram per segment, all wound
// the same way so overlaps don't cancel under nonzero fill.
export function broadPath(ctx, points, width, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const ex = (Math.cos(a) * width) / 2;
  const ey = (-Math.sin(a) * width) / 2;
  const pts = points.length === 1 ? [points[0], { ...points[0], x: points[0].x + 0.01 }] : points;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1];
    const q = pts[i];
    let quad = [
      { x: p.x + ex, y: p.y + ey },
      { x: q.x + ex, y: q.y + ey },
      { x: q.x - ex, y: q.y - ey },
      { x: p.x - ex, y: p.y - ey },
    ];
    let area = 0;
    for (let k = 0; k < 4; k++) area += quad[k].x * quad[(k + 1) % 4].y - quad[(k + 1) % 4].x * quad[k].y;
    if (area < 0) quad = quad.reverse();
    ctx.moveTo(quad[0].x, quad[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(quad[k].x, quad[k].y);
    ctx.closePath();
  }
}
