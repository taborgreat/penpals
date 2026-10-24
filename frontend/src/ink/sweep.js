// Reading order for playback: line by line, left to right, the way a hand
// crosses a page. Dots and crossbars wait until the end of their word, and the
// pen pauses between words and lines.
//
// Works on the shared strokes format plus the page's line geometry, `tilt`
// and `rows` (the sheared y = y - x * tilt of the boundaries between text
// lines), found at trace time. Files without geometry get it derived here
// from the strokes themselves.

const shear = (p, tilt) => p.y - p.x * tilt;

function measure(stroke, tilt) {
  const pts = stroke.points;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    sumR = 0,
    length = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    sumR += shear(p, tilt);
    if (i) length += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
  }
  return { minX, maxX, minY, maxY, r: sumR / pts.length, length };
}

const median = (arr) => {
  const s = arr.slice().sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

function boxSmooth(src, radius) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      if (j >= 0 && j < src.length) sum += src[j];
    }
    out[i] = sum;
  }
  return out;
}

// Geometry from the strokes alone: the tilt (within ±3°) that stacks the ink
// into the clearest rows, then the valleys between the text-line peaks of
// that profile. A valley only counts when it is clearly emptier than the
// lines either side, so ascenders don't split a line in two.
function geometryFromStrokes(data) {
  const pts = [];
  for (const s of data.strokes) for (let i = 0; i < s.points.length; i += 2) pts.push(s.points[i]);
  if (pts.length < 4) return { tilt: 0, rows: [] };
  const margin = Math.ceil(data.width * 0.06);
  const size = data.height + 2 * margin;
  const bins = new Float32Array(size);
  const radius = Math.max(3, Math.round(data.height * 0.006));
  let best = null;
  for (let deg = -3; deg <= 3.001; deg += 0.25) {
    const tan = Math.tan((deg * Math.PI) / 180);
    bins.fill(0);
    for (const p of pts) {
      const b = Math.round(shear(p, tan)) + margin;
      if (b >= 0 && b < size) bins[b]++;
    }
    let score = 0;
    for (let k = 0; k < size; k++) score += bins[k] * bins[k];
    if (!best || score > best.score) best = { score, tan, profile: boxSmooth(bins, radius) };
  }
  const { profile, tan } = best;
  let peak = 0;
  for (let k = 0; k < size; k++) if (profile[k] > peak) peak = profile[k];
  const minGap = Math.max(12, Math.round(data.height * 0.01));
  const peaks = [];
  for (let k = 1; k < size - 1; k++) {
    if (profile[k] < peak * 0.12 || profile[k] < profile[k - 1] || profile[k] < profile[k + 1]) continue;
    const last = peaks[peaks.length - 1];
    if (last !== undefined && k - last < minGap) {
      if (profile[k] > profile[last]) peaks[peaks.length - 1] = k;
    } else {
      peaks.push(k);
    }
  }
  const rows = [];
  for (let i = 1; i < peaks.length; i++) {
    let low = peaks[i - 1];
    for (let k = peaks[i - 1]; k <= peaks[i]; k++) if (profile[k] < profile[low]) low = k;
    if (profile[low] < 0.5 * Math.min(profile[peaks[i - 1]], profile[peaks[i]])) rows.push(low - margin);
  }
  // Lines come at a fairly even pitch; a row much closer than that to its
  // neighbours splits one line (dots above a word, say) and goes.
  while (rows.length >= 3) {
    const gaps = rows.slice(1).map((r, i) => r - rows[i]);
    const pitch = median(gaps);
    let worst = -1;
    let worstGap = Infinity;
    for (let i = 0; i < gaps.length; i++)
      if (gaps[i] < worstGap) {
        worstGap = gaps[i];
        worst = i;
      }
    if (worstGap >= 0.55 * pitch) break;
    // drop whichever end of the small gap has the shallower valley
    const a = rows[worst] + margin;
    const b = rows[worst + 1] + margin;
    rows.splice(profile[a] > profile[b] ? worst : worst + 1, 1);
  }
  return { tilt: tan, rows };
}

// Lines → words → strokes, with the small pieces (dots, crossbars) attached to
// the word they sit over. Returns { tilt, rows, spacing, stats, bands }, where
// stats[i] describes data.strokes[i] and every word lists stroke indexes.
export function layoutStrokes(data) {
  const geometry = data.rows?.length ? { tilt: data.tilt ?? 0, rows: data.rows } : geometryFromStrokes(data);
  const { tilt, rows } = geometry;
  const stats = data.strokes.map((s) => measure(s, tilt));
  const spacing = rows.length >= 2 ? median(rows.slice(1).map((r, i) => r - rows[i])) : Math.max(24, 2 * median(stats.map((s) => s.maxY - s.minY)));

  const bands = Array.from({ length: rows.length + 1 }, () => ({ items: [], words: [] }));
  stats.forEach((s, i) => {
    let k = 0;
    while (k < rows.length && rows[k] < s.r - 2) k++;
    bands[k].items.push(i);
  });

  const isSmall = (s) => s.maxY - s.minY < 0.2 * spacing && s.maxX - s.minX < 0.5 * spacing;
  const gap = 0.3 * spacing;
  const grow = (w, s) => {
    w.minX = Math.min(w.minX, s.minX);
    w.maxX = Math.max(w.maxX, s.maxX);
    w.minY = Math.min(w.minY, s.minY);
    w.maxY = Math.max(w.maxY, s.maxY);
  };
  for (const band of bands) {
    const main = band.items.filter((i) => !isSmall(stats[i])).sort((a, b) => stats[a].minX - stats[b].minX);
    let word = null;
    for (const i of main) {
      const s = stats[i];
      if (!word || s.minX - word.maxX > gap) {
        word = { minX: s.minX, maxX: s.maxX, minY: s.minY, maxY: s.maxY, strokes: [], satellites: [] };
        band.words.push(word);
      }
      word.strokes.push(i);
      grow(word, s);
    }
    for (const i of band.items.filter((i) => isSmall(stats[i]))) {
      const s = stats[i];
      const cx = (s.minX + s.maxX) / 2;
      let best = null;
      let bestD = Infinity;
      for (const w of band.words) {
        const d = cx < w.minX ? w.minX - cx : cx > w.maxX ? cx - w.maxX : 0;
        if (d < bestD) {
          bestD = d;
          best = w;
        }
      }
      if (best && bestD <= spacing) {
        best.satellites.push(i);
        grow(best, s);
      } else {
        band.words.push({ minX: s.minX, maxX: s.maxX, minY: s.minY, maxY: s.maxY, strokes: [i], satellites: [] });
      }
    }
    band.words.sort((a, b) => a.minX - b.minX);
    for (const w of band.words) w.satellites.sort((a, b) => stats[a].minX - stats[b].minX);
  }
  return { tilt, rows, spacing, stats, bands: bands.filter((b) => b.words.length) };
}

// The playback plan for a page: one item per word in reading order, with the
// time the sweep enters it, reaches its right edge, and when each dot or
// crossbar drops in. `speed` is the sweep's pace in page px/s.
export function scheduleSweep(layout, { speed = 500 } = {}) {
  const items = [];
  let t = 0;
  for (const band of layout.bands) {
    for (const word of band.words) {
      const t0 = t;
      const t1 = t0 + (Math.max(1, word.maxX - word.minX) / speed) * 1000 + 80;
      const satellites = word.satellites.map((i, k) => ({ i, at: t1 + k * 100 }));
      t = t1 + satellites.length * 100 + 120;
      items.push({ word, t0, t1, satellites, end: t });
    }
    t += 350;
  }
  return { items, duration: t, speed };
}

// Give every point a time from the same plan, so a strokes file carries a
// sensible order: a stroke is written while the sweep passes its x range.
// Strokes are reordered by their start time.
export function sweepTiming(data, options = {}) {
  const layout = layoutStrokes(data);
  const { stats } = layout;
  const { items, speed } = scheduleSweep(layout, options);
  const time = (i, start, end) => {
    const pts = data.strokes[i].points;
    const len = stats[i].length || 1;
    let acc = 0;
    for (let k = 0; k < pts.length; k++) {
      if (k) acc += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      pts[k].t = start + (end - start) * (acc / len);
    }
  };
  for (const item of items) {
    const { word } = item;
    for (const i of word.strokes) {
      const s = stats[i];
      const start = item.t0 + ((s.minX - word.minX) / speed) * 1000;
      const end = Math.max(start + 80, item.t0 + ((s.maxX - word.minX) / speed) * 1000);
      time(i, start, end);
    }
    for (const sat of item.satellites) time(sat.i, sat.at, sat.at + 80);
  }
  data.strokes.sort((a, b) => a.points[0].t - b.points[0].t);
  return data;
}
