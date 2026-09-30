import { dist } from './util.js';

const SHAPES = { letter: 11 / 8.5, a4: 297 / 210 };

// Output size of the flattened page for a given width.
// shape: 'auto' (estimate from the corners) | 'letter' | 'a4'.
export function pageSize(corners, outWidth, shape = 'auto') {
  const [tl, tr, br, bl] = corners;
  const w = (dist(tl, tr) + dist(bl, br)) / 2;
  const h = (dist(tl, bl) + dist(tr, br)) / 2;
  let ratio = SHAPES[shape] ?? h / w; // height / width
  if (SHAPES[shape] && w > h) ratio = 1 / ratio; // landscape sheet
  ratio = Math.min(3, Math.max(1 / 3, ratio || 1));
  return { width: outWidth, height: Math.round(outWidth * ratio) };
}

// 3x3 homography (row-major, h8 = 1) mapping points in `from` onto points in `to`.
export function homography(from, to) {
  const A = [];
  const b = [];
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = from[i];
    const { x, y } = to[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    b.push(y);
  }
  return [...solve(A, b), 1];
}

// Gauss-Jordan elimination with partial pivoting.
function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const p = M[col][col];
    if (Math.abs(p) < 1e-12) throw new Error('Corners are degenerate');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / p;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Resample the quadrilateral `corners` ([TL, TR, BR, BL]) of `photo` into an
// upright outWidth x outHeight RGBA page. Bilinear, with 2x2 supersampling
// when shrinking so hairline strokes don't alias away. `rotate` turns the
// page by that many degrees, zooming in just enough that no outside shows.
export function warpPage(photo, corners, outWidth, outHeight, { rotate = 0 } = {}) {
  const dst = [
    { x: 0, y: 0 },
    { x: outWidth, y: 0 },
    { x: outWidth, y: outHeight },
    { x: 0, y: outHeight },
  ];
  const H = homography(dst, corners); // page pixel → photo pixel
  const { data: src, width: sw, height: sh } = photo;
  const out = new Uint8ClampedArray(outWidth * outHeight * 4);
  const shrink = (dist(corners[0], corners[1]) + dist(corners[3], corners[2])) / 2 / outWidth;
  const offsets = shrink > 1.4 ? [0.25, 0.75] : [0.5];
  const norm = 1 / (offsets.length * offsets.length);
  const maxX = sw - 1;
  const maxY = sh - 1;
  const a = (rotate * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const zoom = Math.max(
    (outWidth * Math.abs(cos) + outHeight * Math.abs(sin)) / outWidth,
    (outWidth * Math.abs(sin) + outHeight * Math.abs(cos)) / outHeight,
  );
  const cx = outWidth / 2;
  const cy = outHeight / 2;
  let o = 0;
  for (let v = 0; v < outHeight; v++) {
    for (let u = 0; u < outWidth; u++, o += 4) {
      let r = 0, g = 0, b = 0;
      for (let j = 0; j < offsets.length; j++) {
        const V0 = v + offsets[j];
        for (let k = 0; k < offsets.length; k++) {
          const U0 = u + offsets[k];
          const qx = U0 - cx;
          const qy = V0 - cy;
          const U = cx + (cos * qx + sin * qy) / zoom;
          const V = cy + (-sin * qx + cos * qy) / zoom;
          const w = H[6] * U + H[7] * V + H[8];
          let x = (H[0] * U + H[1] * V + H[2]) / w - 0.5;
          let y = (H[3] * U + H[4] * V + H[5]) / w - 0.5;
          x = x < 0 ? 0 : x > maxX ? maxX : x;
          y = y < 0 ? 0 : y > maxY ? maxY : y;
          const x0 = x | 0;
          const y0 = y | 0;
          const x1 = x0 < maxX ? x0 + 1 : x0;
          const y1 = y0 < maxY ? y0 + 1 : y0;
          const tx = x - x0;
          const ty = y - y0;
          const i00 = (y0 * sw + x0) * 4;
          const i01 = (y0 * sw + x1) * 4;
          const i10 = (y1 * sw + x0) * 4;
          const i11 = (y1 * sw + x1) * 4;
          const w00 = (1 - tx) * (1 - ty);
          const w01 = tx * (1 - ty);
          const w10 = (1 - tx) * ty;
          const w11 = tx * ty;
          r += src[i00] * w00 + src[i01] * w01 + src[i10] * w10 + src[i11] * w11;
          g += src[i00 + 1] * w00 + src[i01 + 1] * w01 + src[i10 + 1] * w10 + src[i11 + 1] * w11;
          b += src[i00 + 2] * w00 + src[i01 + 2] * w01 + src[i10 + 2] * w10 + src[i11 + 2] * w11;
        }
      }
      out[o] = r * norm;
      out[o + 1] = g * norm;
      out[o + 2] = b * norm;
      out[o + 3] = 255;
    }
  }
  return { width: outWidth, height: outHeight, data: out };
}
