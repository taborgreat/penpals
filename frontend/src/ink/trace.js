import { labelComponents } from './util.js';
import { sweepTiming } from './sweep.js';

// Recover pen strokes from an ink mask (a photographed page), so a photo turns
// into the same kind of thing as pad writing: weighted, timed strokes.
//
//   1. binarise; take out ruled lines, remembering where they were
//   2. distance transform: how thick the ink is at every pixel (the weight)
//   3. thin the ink to one-pixel centrelines; prune thinning spurs
//   4. group centrelines into components (words), put them in reading order
//   5. walk each component from its leftmost end, always continuing in the
//      direction that bends least; when stuck, lift the pen and jump to the
//      nearest unwalked end
//   6. simplify, then time the strokes as a reading-order sweep (sweep.js):
//      line by line, left to right, dots and crossbars at the end of their word
//
// Returns { data, fidelity, baselines, tilt, lines, ms }: `data` is the shared
// strokes format (with the page's line geometry), `fidelity` (0-1) how well
// the strokes reproduce the ink.

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function traceStrokes(mask, options = {}) {
  const { inkLevel = 64, tolerance = 0.8 } = options;
  const { width, height, alpha } = mask;
  const n = width * height;
  const started = now();

  const binary = new Uint8Array(n);
  for (let i = 0; i < n; i++) binary[i] = alpha[i] >= inkLevel ? 1 : 0;

  const ruled = removeRuledLines(binary, width, height);
  const dist = distanceTransform(binary, width, height);
  const skeleton = thin(binary, width, height);
  minimize(skeleton, width, height);
  pruneSpurs(skeleton, dist, width, height);

  const components = findComponents(skeleton, width);
  const lines = assignLines(components, ruled, width, height);
  const ordered = orderComponents(components, width);

  const visited = new Uint8Array(n);
  const strokes = [];
  for (const comp of ordered) {
    for (const points of walkComponent(comp, skeleton, visited, dist, width, height)) {
      strokes.push({ angle: null, points: simplify(smoothPoints(points), tolerance) });
    }
  }

  const data = sweepTiming({ width, height, tilt: ruled.tan, rows: ruled.rows, strokes });
  const fidelity = compare(rasterize(data), binary, width, height);
  const baselines = ruled.rows.map((r) => r + (width / 2) * ruled.tan); // y at the middle of the page
  return { data, fidelity, baselines, tilt: ruled.tan, lines, ms: now() - started };
}

// ---------------------------------------------------------------- ruled lines

// Ruled lines are thin ink that lines up across the whole page at one angle.
// Writing makes long horizontal runs too (cursive is joined up), so instead of
// looking at runs we find the tilt that stacks thin pixels into rows, take
// rows that hold a big share of the page width as lines, and erase only their
// thin pixels. Writing that crosses or sits on a line is taller than the line
// there, so it stays. Returns the lines as sheared rows (y - x * tan) and the tilt.
const MAX_LINE_THICKNESS = 4;
function removeRuledLines(binary, width, height) {
  const n = width * height;
  const none = { rows: [], tan: 0 };

  // Vertical extent of the ink at every pixel.
  const ext = new Uint8Array(n);
  for (let x = 0; x < width; x++) {
    let y = 0;
    while (y < height) {
      if (!binary[y * width + x]) {
        y++;
        continue;
      }
      let y1 = y;
      while (y1 < height && binary[y1 * width + x]) y1++;
      const len = Math.min(255, y1 - y);
      for (let yy = y; yy < y1; yy++) ext[yy * width + x] = len;
      y = y1;
    }
  }
  const thinIdx = [];
  for (let i = 0; i < n; i++) if (ext[i] && ext[i] <= MAX_LINE_THICKNESS) thinIdx.push(i);
  if (thinIdx.length < width * 0.3) return none;

  // The tilt (within ±2.5°) that concentrates thin pixels into the fewest rows.
  const margin = Math.ceil(width * 0.05);
  const bins = new Float64Array(height + 2 * margin);
  let bestTan = 0;
  let bestScore = -1;
  for (let deg = -2.5; deg <= 2.5001; deg += 0.1) {
    const tan = Math.tan((deg * Math.PI) / 180);
    bins.fill(0);
    for (const i of thinIdx) {
      const x = i % width;
      bins[Math.round((i - x) / width - x * tan) + margin]++;
    }
    let score = 0;
    for (let k = 0; k < bins.length; k++) score += bins[k] * bins[k];
    if (score > bestScore) {
      bestScore = score;
      bestTan = tan;
    }
  }

  // Rows at that tilt: how many thin pixels, and how much of the width they span.
  const count = new Int32Array(bins.length);
  const minX = new Int32Array(bins.length).fill(width);
  const maxX = new Int32Array(bins.length).fill(-1);
  for (const i of thinIdx) {
    const x = i % width;
    const b = Math.round((i - x) / width - x * bestTan) + margin;
    count[b]++;
    if (x < minX[b]) minX[b] = x;
    if (x > maxX[b]) maxX[b] = x;
  }
  const groups = [];
  for (let b = 0; b < bins.length; b++) {
    if (count[b] < width * 0.3 || maxX[b] - minX[b] < width * 0.6) continue;
    const last = groups[groups.length - 1];
    if (last && b - last.b1 <= 2) last.b1 = b;
    else groups.push({ b0: b, b1: b });
  }
  const lines = groups.filter((g) => g.b1 - g.b0 + 1 <= MAX_LINE_THICKNESS + 2);
  if (!lines.length || (lines.length === 1 && count[lines[0].b0] < width * 0.6)) return none;

  // Erase the lines' own thin pixels only.
  for (let i = 0; i < n; i++) {
    if (!ext[i]) continue;
    const x = i % width;
    const b = Math.round((i - x) / width - x * bestTan) + margin;
    for (const g of lines) {
      if (b < g.b0 - 1 || b > g.b1 + 1) continue;
      if (ext[i] <= g.b1 - g.b0 + 2) binary[i] = 0;
      break;
    }
  }
  return { rows: lines.map((g) => (g.b0 + g.b1) / 2 - margin), tan: bestTan };
}

// ---------------------------------------------------------------- distance transform

// Euclidean distance from every ink pixel to the nearest paper pixel
// (Felzenszwalb & Huttenlocher, separable in two passes).
function distanceTransform(binary, width, height) {
  const INF = 1e12;
  const n = width * height;
  const f = new Float64Array(n);
  for (let i = 0; i < n; i++) f[i] = binary[i] ? INF : 0;
  const size = Math.max(width, height);
  const line = new Float64Array(size);
  const out = new Float64Array(size);
  const v = new Int32Array(size);
  const z = new Float64Array(size + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) line[y] = f[y * width + x];
    edt1d(line, height, out, v, z);
    for (let y = 0; y < height; y++) f[y * width + x] = out[y];
  }
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) line[x] = f[row + x];
    edt1d(line, width, out, v, z);
    for (let x = 0; x < width; x++) f[row + x] = out[x];
  }
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = Math.sqrt(f[i]);
  return dist;
}

function edt1d(f, n, d, v, z) {
  const INF = 1e20;
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

// ---------------------------------------------------------------- thinning

// Zhang-Suen thinning to one-pixel centrelines.
function thin(binary, width, height) {
  const img = Uint8Array.from(binary);
  let minX = width,
    maxX = -1,
    minY = height,
    maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!img[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return img;
  minX = Math.max(1, minX - 1);
  maxX = Math.min(width - 2, maxX + 1);
  minY = Math.max(1, minY - 1);
  maxY = Math.min(height - 2, maxY + 1);
  const gone = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (let step = 0; step < 2; step++) {
      gone.length = 0;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const i = y * width + x;
          if (!img[i]) continue;
          const p2 = img[i - width],
            p3 = img[i - width + 1],
            p4 = img[i + 1],
            p5 = img[i + width + 1];
          const p6 = img[i + width],
            p7 = img[i + width - 1],
            p8 = img[i - 1],
            p9 = img[i - width - 1];
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          let a = 0;
          if (!p2 && p3) a++;
          if (!p3 && p4) a++;
          if (!p4 && p5) a++;
          if (!p5 && p6) a++;
          if (!p6 && p7) a++;
          if (!p7 && p8) a++;
          if (!p8 && p9) a++;
          if (!p9 && p2) a++;
          if (a !== 1) continue;
          if (step === 0 ? p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0 : p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          gone.push(i);
        }
      }
      for (const i of gone) img[i] = 0;
      if (gone.length) changed = true;
    }
  }
  return img;
}

// Zhang-Suen leaves redundant corner pixels on diagonals (staircases). Drop
// every pixel whose neighbours are already connected to each other without it,
// so the skeleton becomes a clean 8-connected line of single pixels.
const RING = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];
function minimize(skel, width, height) {
  const parent = new Int32Array(8);
  const find = (a) => (parent[a] === a ? a : (parent[a] = find(parent[a])));
  const ring = new Uint8Array(8);
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (!skel[i]) continue;
        let count = 0;
        for (let k = 0; k < 8; k++) {
          ring[k] = skel[(y + RING[k][1]) * width + x + RING[k][0]] ? 1 : 0;
          count += ring[k];
        }
        if (count < 2) continue;
        // Neighbours are adjacent to each other around the ring, and the four
        // edge neighbours (odd positions) touch diagonally two steps apart.
        for (let k = 0; k < 8; k++) parent[k] = k;
        let groups = count;
        const join = (a, b) => {
          if (!ring[a] || !ring[b]) return;
          const ra = find(a);
          const rb = find(b);
          if (ra !== rb) {
            parent[ra] = rb;
            groups--;
          }
        };
        for (let k = 0; k < 8; k++) join(k, (k + 1) % 8);
        for (let k = 1; k < 8; k += 2) join(k, (k + 2) % 8);
        if (groups === 1) {
          skel[i] = 0;
          changed = true;
        }
      }
    }
  }
}

function neighbours(skel, i, width, height) {
  const x = i % width;
  const y = (i - x) / width;
  const out = [];
  for (let dy = -1; dy <= 1; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= height) continue;
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = x + dx;
      if (xx < 0 || xx >= width) continue;
      const j = yy * width + xx;
      if (skel[j]) out.push(j);
    }
  }
  return out;
}

// Short branches hanging off a junction are thinning artefacts, not strokes.
function pruneSpurs(skel, dist, width, height) {
  const n = width * height;
  for (let start = 0; start < n; start++) {
    if (!skel[start] || neighbours(skel, start, width, height).length !== 1) continue;
    const path = [start];
    let prev = -1;
    let cur = start;
    let junction = -1;
    while (true) {
      const nb = neighbours(skel, cur, width, height).filter((j) => j !== prev && !path.includes(j));
      if (nb.length === 0) break; // reached another end: a real segment
      if (nb.length > 1 || neighbours(skel, nb[0], width, height).length > 2) {
        junction = nb.length > 1 ? cur : nb[0];
        break;
      }
      prev = cur;
      cur = nb[0];
      path.push(cur);
      if (path.length > 64) break;
    }
    if (junction >= 0 && path.length <= dist[junction] * 1.5 + 2) {
      for (const i of path) if (i !== junction) skel[i] = 0;
    }
  }
}

// ---------------------------------------------------------------- components and order

// Components are labelled on a slightly fattened skeleton so a hairline broken
// by a few pixels (say where a ruled line was removed) still counts as one piece.
function findComponents(skeleton, width) {
  const height = skeleton.length / width;
  const bridged = dilate(dilate(skeleton, width, height), width, height);
  const { labels, areas } = labelComponents(bridged, width, height, true);
  const comps = [];
  for (let k = 1; k < areas.length; k++) comps.push({ pixels: [], minX: Infinity, maxX: -1, minY: Infinity, maxY: -1, sumX: 0, sumY: 0 });
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (!l || !skeleton[i]) continue;
    const c = comps[l - 1];
    const x = i % width;
    const y = (i - x) / width;
    c.pixels.push(i);
    if (x < c.minX) c.minX = x;
    if (x > c.maxX) c.maxX = x;
    if (y < c.minY) c.minY = y;
    if (y > c.maxY) c.maxY = y;
    c.sumX += x;
    c.sumY += y;
  }
  const real = comps.filter((c) => c.pixels.length);
  for (const c of real) {
    c.cx = c.sumX / c.pixels.length;
    c.cy = c.sumY / c.pixels.length;
  }
  return real;
}

// Which text line each component sits on: above which ruled line (in the
// lines' own tilted rows), or, without ruled lines, which band of ink in the
// row profile.
function assignLines(comps, ruled, width, height) {
  if (ruled.rows.length >= 2) {
    for (const c of comps) {
      const r = c.cy - c.cx * ruled.tan;
      let k = 0;
      while (k < ruled.rows.length && ruled.rows[k] < r - 2) k++;
      c.line = k;
    }
    return ruled.rows.length + 1;
  }
  const profile = new Float32Array(height);
  for (const c of comps) for (const i of c.pixels) profile[(i - (i % width)) / width]++;
  const radius = Math.max(4, Math.round(width * 0.008));
  const smooth = new Float32Array(height);
  let peak = 0;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = y + k;
      if (yy >= 0 && yy < height) sum += profile[yy];
    }
    smooth[y] = sum;
    if (sum > peak) peak = sum;
  }
  const bands = [];
  let inBand = false;
  for (let y = 0; y <= height; y++) {
    const on = y < height && smooth[y] > peak * 0.08;
    if (on && !inBand) {
      bands.push({ y0: y, y1: y });
      inBand = true;
    } else if (on) bands[bands.length - 1].y1 = y;
    else inBand = false;
  }
  for (const c of comps) {
    let best = 0;
    let bestD = Infinity;
    bands.forEach((b, k) => {
      const d = c.cy < b.y0 ? b.y0 - c.cy : c.cy > b.y1 ? c.cy - b.y1 : 0;
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    c.line = best;
  }
  return bands.length;
}

// Reading order: line by line, left to right. Small pieces (i-dots, t-bars,
// commas) are written right after the word they belong to.
function orderComponents(comps, width) {
  const small = (c) => c.maxX - c.minX < width * 0.05 && c.maxY - c.minY < width * 0.03;
  const items = comps.filter((c) => !small(c)).map((c) => ({ comp: c, sats: [] }));
  for (const s of comps.filter(small)) {
    let best = null;
    let bestScore = -Infinity;
    for (const item of items) {
      const h = item.comp;
      if (h.line !== s.line) continue;
      const overlap = Math.min(h.maxX, s.maxX) - Math.max(h.minX, s.minX);
      const score = overlap >= 0 ? 1e6 + overlap : -Math.min(Math.abs(h.minX - s.maxX), Math.abs(s.minX - h.maxX));
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
    if (best && bestScore > -width * 0.05) best.sats.push(s);
    else items.push({ comp: s, sats: [] });
  }
  items.sort((a, b) => a.comp.line - b.comp.line || a.comp.minX - b.comp.minX);
  const ordered = [];
  for (const item of items) {
    ordered.push(item.comp);
    item.sats.sort((a, b) => a.minX - b.minX);
    ordered.push(...item.sats);
  }
  return ordered;
}

// ---------------------------------------------------------------- walking

function walkComponent(comp, skeleton, visited, dist, width, height) {
  const open = (i) => neighbours(skeleton, i, width, height).filter((j) => !visited[j]);
  const isEnd = (i) => open(i).length <= 1;
  const point = (i) => {
    const x = i % width;
    return { x: x + 0.5, y: (i - x) / width + 0.5, w: Math.max(0.8, 2 * dist[i] - 1) };
  };
  let remaining = comp.pixels.length;
  let cur = -1;
  let bestX = Infinity;
  for (const i of comp.pixels) {
    const x = i % width;
    if (x < bestX && isEnd(i)) {
      bestX = x;
      cur = i;
    }
  }
  if (cur < 0) {
    for (const i of comp.pixels) {
      const x = i % width;
      if (x < bestX) {
        bestX = x;
        cur = i;
      }
    }
  }

  const GAP = 4; // px: a break this small is a broken hairline, not a pen lift
  const strokes = [];
  let points = null;
  while (cur >= 0 && remaining > 0) {
    if (!points) {
      points = [];
      strokes.push(points);
    }
    let i = cur;
    let dx = 0;
    let dy = 0;
    visited[i] = 1;
    remaining--;
    points.push(point(i));
    while (true) {
      const cands = open(i);
      if (!cands.length) break;
      let next = cands[0];
      if (cands.length > 1) {
        let bestDot = -Infinity;
        const x = i % width;
        const y = (i - x) / width;
        for (const c of cands) {
          const cx = c % width;
          const sx = cx - x;
          const sy = (c - cx) / width - y;
          const len = Math.hypot(sx, sy);
          const dot = (dx * sx + dy * sy) / len - (len > 1 ? 0.01 : 0); // straight on, 4-neighbours first
          if (dot > bestDot) {
            bestDot = dot;
            next = c;
          }
        }
      }
      const x = i % width;
      const nx = next % width;
      const ny = (next - nx) / width;
      // A candidate touching both this pixel and the next is a corner the ribbon
      // covers anyway; take it along rather than leave a one-pixel stroke behind.
      for (const c of cands) {
        if (c === next) continue;
        const cx = c % width;
        if (Math.abs(cx - nx) <= 1 && Math.abs((c - cx) / width - ny) <= 1) {
          visited[c] = 1;
          remaining--;
        }
      }
      const sx = nx - x;
      const sy = ny - (i - x) / width;
      const len = Math.hypot(sx, sy) || 1;
      dx = dx * 0.6 + (sx / len) * 0.4;
      dy = dy * 0.6 + (sy / len) * 0.4;
      const m = Math.hypot(dx, dy) || 1;
      dx /= m;
      dy /= m;
      i = next;
      visited[i] = 1;
      remaining--;
      points.push(point(i));
    }
    if (remaining <= 0) break;

    // Pen lift: the nearest unwalked end, or failing that the nearest unwalked pixel.
    const lx = i % width;
    const ly = (i - lx) / width;
    let best = -1;
    let bestD = Infinity;
    let bestEnd = -1;
    let bestEndD = Infinity;
    for (const p of comp.pixels) {
      if (visited[p]) continue;
      const px = p % width;
      const py = (p - px) / width;
      const d = (px - lx) ** 2 + (py - ly) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
      if (d < bestEndD && isEnd(p)) {
        bestEndD = d;
        bestEnd = p;
      }
    }
    cur = bestEnd >= 0 ? bestEnd : best;
    // Across a tiny gap the same stroke carries on; otherwise the pen lifts.
    if (!(bestEnd >= 0 && bestEndD <= GAP * GAP)) points = null;
  }
  return strokes;
}

// Pixel staircases become curves: two passes of a 3-tap average on position,
// one on width.
function smoothPoints(points) {
  if (points.length < 3) return points;
  let pts = points;
  for (let pass = 0; pass < 2; pass++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1],
        b = pts[i],
        c = pts[i + 1];
      out.push({ x: (a.x + 2 * b.x + c.x) / 4, y: (a.y + 2 * b.y + c.y) / 4, w: pass ? b.w : (a.w + 2 * b.w + c.w) / 4 });
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

// Ramer-Douglas-Peucker over (x, y, w/2) so width changes survive too.
function simplify(points, tol) {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const A = points[a];
    const B = points[b];
    const vx = B.x - A.x,
      vy = B.y - A.y,
      vw = (B.w - A.w) / 2;
    const len2 = vx * vx + vy * vy + vw * vw || 1;
    let worst = -1;
    let worstD = tol * tol;
    for (let i = a + 1; i < b; i++) {
      const P = points[i];
      const px = P.x - A.x,
        py = P.y - A.y,
        pw = (P.w - A.w) / 2;
      const t = Math.max(0, Math.min(1, (px * vx + py * vy + pw * vw) / len2));
      const d = (px - vx * t) ** 2 + (py - vy * t) ** 2 + (pw - vw * t) ** 2;
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------- fidelity

// Paint the strokes into a mask (round stamps), DOM-free.
export function rasterize(data) {
  const { width, height } = data;
  const out = new Uint8Array(width * height);
  const disc = (cx, cy, r) => {
    const y0 = Math.max(0, Math.floor(cy - r)),
      y1 = Math.min(height - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      const half = Math.sqrt(Math.max(0, r * r - dy * dy));
      const x0 = Math.max(0, Math.round(cx - half)),
        x1 = Math.min(width - 1, Math.round(cx + half) - 1);
      for (let x = x0; x <= x1; x++) out[y * width + x] = 1;
    }
  };
  for (const s of data.strokes) {
    const pts = s.points;
    if (pts.length === 1) disc(pts[0].x, pts[0].y, Math.max(0.5, pts[0].w / 2));
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1],
        b = pts[i];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const steps = Math.max(1, Math.ceil(len / 0.5));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        disc(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, Math.max(0.5, (a.w + (b.w - a.w) * t) / 2));
      }
    }
  }
  return out;
}

function dilate(mask, width, height) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < width) out[yy * width + xx] = 1;
        }
      }
    }
  }
  return out;
}

// Intersection over union of the two masks, each grown by a pixel so a
// hair's difference at the edges is forgiven.
function compare(a, b, width, height) {
  const A = dilate(a, width, height);
  const B = dilate(b, width, height);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < A.length; i++) {
    if (A[i] && B[i]) inter++;
    if (A[i] || B[i]) union++;
  }
  return union ? inter / union : 1;
}
