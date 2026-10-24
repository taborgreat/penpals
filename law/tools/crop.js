// Crop and enlarge a region of a fixture's look, for close inspection.
//   node law/tools/crop.js <fixture> <x0> <y0> <w> <h> <zoom> <out.png>   (cells, relative to the box)
import fs from 'node:fs';
import { renderOne, testPaperKey } from './render.js';
import { encodePng } from './png.js';
const [name, x0, y0, w, h, zoom, out] = process.argv.slice(2);
const r = renderOne(name, { paperKey: testPaperKey('tuning'), family: { grain: 8, weight: 8, tooth: 0 } });
const [, , bw] = r.box;
const k = Number(zoom), W = Number(w) * k, H = Number(h) * k;
const px = new Uint8Array(W * H * 3);
const PAPER = [246, 241, 231];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const sx = Number(x0) + Math.floor(x / k), sy = Number(y0) + Math.floor(y / k);
  for (let c = 0; c < 3; c++) px[(y * W + x) * 3 + c] = Math.round(PAPER[c] * r.rgb[(sy * bw + sx) * 3 + c] / 255);
}
fs.writeFileSync(out, encodePng(W, H, px, 3));
console.log('box', r.box);
