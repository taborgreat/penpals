import { toGray, labelComponents, rgbToHex } from './util.js';

// Turn a flattened page photo into an ink mask: alpha 0 = paper, 255 = solid ink.
//
// The trick is to estimate the paper brightness under every pixel first, so
// shadows, vignetting and yellow lamplight cancel out, and then measure how
// much darker each pixel is than the paper around it. That darkness is mapped
// through a soft ramp instead of a hard cut, so hairlines fade instead of
// breaking into dots.
//
//   threshold  darkness (0-1) below which a pixel is paper texture, not ink
//   softness   darkness range over which alpha ramps 0 → 1 (bigger = softer, lighter strokes)
//   despeckle  blobs smaller than this many pixels are dropped (dust, JPEG noise)
//   edgeTrim   fraction of the width cleared along the border (hides the desk edge)
export function extractInk(page, options = {}) {
  const { threshold = 0.08, softness = 0.3, despeckle = 6, edgeTrim = 0.01 } = options;
  const { width, height, data } = page;
  const n = width * height;
  const gray = toGray(page);

  // 1. Paper brightness: a wide local mean, then again using only the pixels
  //    that are clearly paper so dense writing doesn't drag the estimate down.
  const radius = Math.max(6, Math.round(width / 40));
  const rough = boxMean(gray, width, height, radius);
  const paper = new Uint8Array(n);
  for (let i = 0; i < n; i++) paper[i] = gray[i] >= 0.9 * rough[i] ? 1 : 0;
  const background = boxMean(gray, width, height, radius * 2, paper, rough);

  // 2. Relative darkness → soft alpha.
  const alpha = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    const darkness = 1 - gray[i] / Math.max(background[i], 1);
    const a = (darkness - threshold) / softness;
    alpha[i] = a <= 0 ? 0 : a >= 1 ? 255 : a * 255;
  }

  // 3. Nothing along the border.
  const trim = Math.round(edgeTrim * width);
  if (trim > 0) {
    for (let y = 0; y < height; y++) {
      const edgeRow = y < trim || y >= height - trim;
      for (let x = 0; x < width; x++) {
        if (edgeRow || x < trim || x >= width - trim) alpha[y * width + x] = 0;
      }
    }
  }

  // 4. Drop specks.
  if (despeckle > 0) removeSpecks(alpha, width, height, despeckle);

  return {
    mask: { width, height, alpha },
    inkColor: estimateInkColor(data, gray, background, alpha, paper),
  };
}

// Summed-area table so any box sum costs four lookups regardless of radius.
// With `mask`, only masked pixels are added.
function integral(values, width, height, mask) {
  const W = width + 1;
  const table = new Uint32Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let run = 0;
    const above = y * W;
    const row = (y + 1) * W;
    const src = y * width;
    for (let x = 0; x < width; x++) {
      const i = src + x;
      run += mask ? (mask[i] ? values[i] : 0) : values[i];
      table[row + x + 1] = table[above + x + 1] + run;
    }
  }
  return table;
}

// Mean of `values` in a (2r+1)^2 window around each pixel. With `mask`, only
// masked pixels count, and windows with too few of them use `fallback`.
function boxMean(values, width, height, r, mask, fallback) {
  const W = width + 1;
  const sums = integral(values, width, height, mask);
  const counts = mask ? integral(mask, width, height) : null;
  const out = new Float32Array(width * height);
  const minCount = 0.05 * (2 * r + 1) ** 2;
  for (let y = 0; y < height; y++) {
    const ry0 = Math.max(0, y - r);
    const ry1 = Math.min(height, y + r + 1);
    const y0 = ry0 * W;
    const y1 = ry1 * W;
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width, x + r + 1);
      const sum = sums[y1 + x1] - sums[y0 + x1] - sums[y1 + x0] + sums[y0 + x0];
      const count = counts
        ? counts[y1 + x1] - counts[y0 + x1] - counts[y1 + x0] + counts[y0 + x0]
        : (x1 - x0) * (ry1 - ry0);
      const i = y * width + x;
      out[i] = counts && count < minCount ? fallback[i] : sum / count;
    }
  }
  return out;
}

// Remove connected blobs of ink smaller than minArea pixels.
function removeSpecks(alpha, width, height, minArea) {
  const n = width * height;
  const inked = new Uint8Array(n);
  for (let i = 0; i < n; i++) inked[i] = alpha[i] > 0 ? 1 : 0;
  const { labels, areas } = labelComponents(inked, width, height, true);
  for (let i = 0; i < n; i++) if (labels[i] && areas[labels[i]] < minArea) alpha[i] = 0;
}

// Average colour of the darkest strokes, white-balanced against the paper.
function estimateInkColor(data, gray, background, alpha, paper) {
  const n = alpha.length;
  const isCore = (i) => alpha[i] === 255 && gray[i] < 0.45 * background[i];
  let core = 0;
  for (let i = 0; i < n; i++) if (isCore(i)) core++;
  const useCore = core >= 200;

  let ir = 0, ig = 0, ib = 0, ic = 0;
  let pr = 0, pg = 0, pb = 0, pc = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (alpha[i] === 255 && (!useCore || isCore(i))) {
      ir += data[p];
      ig += data[p + 1];
      ib += data[p + 2];
      ic++;
    } else if (paper[i] && alpha[i] === 0 && (i & 15) === 0) {
      pr += data[p];
      pg += data[p + 1];
      pb += data[p + 2];
      pc++;
    }
  }
  if (ic < 20 || pc < 20) return '#1a1a1a';
  const balance = (ink, pap) => (255 * (ink / ic)) / Math.max(1, pap / pc);
  return rgbToHex(balance(ir, pr), balance(ig, pg), balance(ib, pb));
}
