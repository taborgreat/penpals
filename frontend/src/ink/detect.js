import { labelComponents } from './util.js';

// Guess where the sheet of paper is: the biggest bright blob in a small copy of
// the photo, reduced to the four hull points that matter. Returns
// [TL, TR, BR, BL] in photo pixels, or null when nothing paper-like is found
// (the caller then falls back to defaultCorners and the user drags the handles).
export function detectPageCorners(photo) {
  const small = downsample(photo, 320);
  const threshold = otsu(small.gray);
  const bright = new Uint8Array(small.gray.length);
  for (let i = 0; i < bright.length; i++) bright[i] = small.gray[i] > threshold ? 1 : 0;

  const { labels, areas } = labelComponents(bright, small.width, small.height);
  let biggest = 0;
  for (let l = 1; l < areas.length; l++) if (areas[l] > areas[biggest]) biggest = l;
  if (!biggest || areas[biggest] < 0.1 * small.width * small.height) return null;

  const hull = convexHull(boundaryPoints(labels, biggest, small.width, small.height));
  if (hull.length < 4) return null;
  const quad = hullToQuad(hull);
  if (!quad || !plausible(quad, areas[biggest])) return null;
  return orderCorners(quad).map((p) => ({ x: (p.x + 0.5) * small.scale, y: (p.y + 0.5) * small.scale }));
}

// A rectangle slightly inside the photo edges.
export function defaultCorners({ width, height }, inset = 0.04) {
  const dx = width * inset;
  const dy = height * inset;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

// Box-average the photo down to about `target` px on its long edge, as gray.
function downsample(photo, target) {
  const scale = Math.max(1, Math.ceil(Math.max(photo.width, photo.height) / target));
  const width = Math.floor(photo.width / scale);
  const height = Math.floor(photo.height / scale);
  const gray = new Uint8Array(width * height);
  const { data } = photo;
  const rowStride = photo.width * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let dy = 0; dy < scale; dy++) {
        let p = (y * scale + dy) * rowStride + x * scale * 4;
        for (let dx = 0; dx < scale; dx++, p += 4) sum += data[p] * 77 + data[p + 1] * 151 + data[p + 2] * 28;
      }
      gray[y * width + x] = sum / (scale * scale * 256);
    }
  }
  return { width, height, gray, scale };
}

// Otsu's threshold: splits the histogram into "paper" and "everything darker".
function otsu(gray) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0;
  let weightB = 0;
  let best = -1;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightB += hist[t];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += t * hist[t];
    const meanB = sumB / weightB;
    const meanF = (sumAll - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

function boundaryPoints(labels, label, width, height) {
  const points = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (labels[i] !== label) continue;
      const onEdge =
        x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
        labels[i - 1] !== label || labels[i + 1] !== label ||
        labels[i - width] !== label || labels[i + width] !== label;
      if (onEdge) points.push({ x, y });
    }
  }
  return points;
}

// Andrew's monotone chain convex hull.
function convexHull(points) {
  const sorted = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list) => {
    const hull = [];
    for (const p of list) {
      while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
      hull.push(p);
    }
    hull.pop();
    return hull;
  };
  return half(sorted).concat(half(sorted.slice().reverse()));
}

// Four corners from a convex hull. The two ends of the hull's diameter plus the
// point farthest from that diagonal on either side split the hull into four
// chains; a straight line is fitted through each chain and adjacent lines are
// intersected. Fitting lines (instead of picking vertices) keeps pixel
// staircases and slightly rounded corners from pulling the corners inward.
function hullToQuad(hull) {
  const n = hull.length;
  let a = 0;
  let b = 0;
  let longest = -1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = (hull[i].x - hull[j].x) ** 2 + (hull[i].y - hull[j].y) ** 2;
      if (d > longest) {
        longest = d;
        a = i;
        b = j;
      }
    }
  }
  const side = (p) => (hull[b].x - hull[a].x) * (p.y - hull[a].y) - (hull[b].y - hull[a].y) * (p.x - hull[a].x);
  let c = -1;
  let d = -1;
  let cBest = 0;
  let dBest = 0;
  for (let i = 0; i < n; i++) {
    const s = side(hull[i]);
    if (s > cBest) {
      cBest = s;
      c = i;
    }
    if (s < dBest) {
      dBest = s;
      d = i;
    }
  }
  if (c < 0 || d < 0) return null;

  const ends = [a, b, c, d].sort((x, y) => x - y); // hull order
  const lines = [];
  for (let k = 0; k < 4; k++) {
    const chain = [];
    for (let i = ends[k]; ; i = (i + 1) % n) {
      chain.push(hull[i]);
      if (i === ends[(k + 1) % 4]) break;
    }
    lines.push(fitLine(chain));
  }
  const corners = [];
  for (let k = 0; k < 4; k++) {
    const p = intersect(lines[(k + 3) % 4], lines[k]);
    if (!p) return null;
    corners.push(p);
  }
  return corners;
}

// Total-least-squares line through the middle of a chain of points (the ends
// may belong to a rounded corner, so they are skipped when there are enough).
function fitLine(points) {
  const skip = points.length >= 10 ? Math.floor(points.length * 0.1) : 0;
  const pts = points.slice(skip, points.length - skip);
  let mx = 0;
  let my = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { x: mx, y: my, dx: Math.cos(theta), dy: Math.sin(theta) };
}

function intersect(l1, l2) {
  const det = l1.dx * l2.dy - l1.dy * l2.dx;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / det;
  return { x: l1.x + t * l1.dx, y: l1.y + t * l1.dy };
}

function polygonArea(pts) {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

// The blob should roughly fill its quad, and no corner should be a sliver.
function plausible(quad, blobArea) {
  const area = polygonArea(quad);
  if (area < 0.5 * blobArea || blobArea < 0.5 * area) return false;
  for (let i = 0; i < 4; i++) {
    const a = quad[(i + 3) % 4];
    const b = quad[i];
    const c = quad[(i + 1) % 4];
    const v1x = a.x - b.x, v1y = a.y - b.y, v2x = c.x - b.x, v2y = c.y - b.y;
    const cos = (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1);
    const degrees = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    if (degrees < 30 || degrees > 150) return false;
  }
  return true;
}

// Clockwise on screen starting from the top-left corner.
function orderCorners(quad) {
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = quad.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let start = 0;
  for (let i = 1; i < 4; i++) if (sorted[i].x + sorted[i].y < sorted[start].x + sorted[start].y) start = i;
  return [0, 1, 2, 3].map((i) => sorted[(start + i) % 4]);
}
