// Render fixtures through the law and write PNGs to look at (build-order step 1:
// make it look right before anything else).
//
//   node law/tools/render.js [fixture ...] [--out DIR] [--zoom 3] [--family 8,8] [--seed text]
//
// Each fixture is grown on a test paper, composited (multiply) over a paper tint
// for viewing, and enlarged `zoom`× with nearest neighbour so cells are visible.
// A contact sheet of all fixtures is written as sheet.png.

import fs from 'node:fs';
import path from 'node:path';
import { FIXTURES, fixtureBytes, testPaperKey } from './fixtures.js';
import { grow } from '../v1/sim.js';
import { settledCells, boxOf, lookRGB, factsDigest } from '../v1/look.js';
import { encodePng } from './png.js';
import { hex } from '../tags.js';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const names = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const out = opt('out', path.join(process.cwd(), 'law-renders'));
const zoom = Number(opt('zoom', 3));
const [grain, weight] = opt('family', '8,8').split(',').map(Number);
const family = { grain, weight, tooth: 0 };
const seedText = opt('seed', 'tuning');

export { testPaperKey };

const PAPER = [246, 241, 231];

export function renderOne(name, { paperKey, family, scale = 64 }) {
  const { bytes, rec } = fixtureBytes(name);
  const t0 = performance.now();
  const res = grow(rec, { paperKey, family, scale });
  const ms = performance.now() - t0;
  const cells = settledCells(res.tiles);
  const box = boxOf(cells);
  const rgb = lookRGB(cells, box);
  const digest = hex(factsDigest({ cells, box, actsBytes: bytes, family, scale }));
  return { name, bytes, rec, res, ms, cells, box, rgb, digest };
}

function view(rgb, box, k) {
  const [, , w, h] = box;
  const W = w * k,
    H = h * k;
  const px = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = (Math.floor(y / k) * w + Math.floor(x / k)) * 3;
      const d = (y * W + x) * 3;
      for (let c = 0; c < 3; c++) px[d + c] = Math.round((PAPER[c] * rgb[s + c]) / 255);
    }
  }
  return { W, H, px };
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join('tools', 'render.js'))) {
  fs.mkdirSync(out, { recursive: true });
  const paperKey = testPaperKey(seedText);
  const list = names.length ? names : Object.keys(FIXTURES);
  const views = [];
  for (const name of list) {
    const r = renderOne(name, { paperKey, family });
    const v = view(r.rgb, r.box, zoom);
    fs.writeFileSync(path.join(out, `${name}.png`), encodePng(v.W, v.H, v.px, 3));
    views.push({ name, ...v });
    const acts = r.rec.acts;
    console.log(
      `${name.padEnd(13)} acts ${String(acts).padStart(5)}  ${String(r.res.ticks).padStart(5)} ticks  work ${String(r.res.work).padStart(9)}  ${r.ms.toFixed(0).padStart(6)} ms  box ${r.box[2]}×${r.box[3]}  bytes ${r.bytes.length}  facts ${r.digest.slice(0, 16)}`,
    );
  }
  // contact sheet: fixtures stacked vertically with a gap
  const gap = 12;
  const W = Math.max(...views.map((v) => v.W));
  const H = views.reduce((s, v) => s + v.H + gap, gap);
  const sheet = new Uint8Array(W * H * 3).fill(255);
  let oy = gap;
  for (const v of views) {
    for (let y = 0; y < v.H; y++) sheet.set(v.px.subarray(y * v.W * 3, (y + 1) * v.W * 3), (oy + y) * W * 3);
    oy += v.H + gap;
  }
  fs.writeFileSync(path.join(out, 'sheet.png'), encodePng(W, H, sheet, 3));
  console.log(`wrote ${out}`);
}
