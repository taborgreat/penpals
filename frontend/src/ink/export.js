// Letters as files to share: a PNG of the finished page, or an animated GIF of
// it being written. Either can be on its paper or transparent (ink only), and
// cropped to the ink, for using a letter as an image elsewhere.

import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { paintLetter, paintStrokes, createPlayer } from './render.js';
import { isTextured } from './paper.js';

const CROP_PAD = 16; // px of margin kept around the ink when cropping

function makeCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

// The finished letter. `asset` is { img, data } as LetterView loads it; `paper` null = transparent.
function paintFinished({ img, data }, inkColor, paper) {
  const c = document.createElement('canvas');
  if (img) paintLetter(c, img, { inkColor, paper });
  else paintStrokes(c, data, { inkColor, paper });
  return c;
}

// The part of the page with ink on it, plus a margin; the whole page if blank.
function inkBounds(asset, inkColor) {
  const c = paintFinished(asset, inkColor, null);
  const { width, height } = c;
  const a = c.getContext('2d').getImageData(0, 0, width, height).data;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0, i = 3; y < height; y++) {
    for (let x = 0; x < width; x++, i += 4) {
      if (a[i] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: width, h: height };
  const x = Math.max(0, minX - CROP_PAD);
  const y = Math.max(0, minY - CROP_PAD);
  return { x, y, w: Math.min(width, maxX + CROP_PAD + 1) - x, h: Math.min(height, maxY + CROP_PAD + 1) - y };
}

export async function letterPng(asset, { inkColor, paper, crop = false }) {
  const full = paintFinished(asset, inkColor, paper);
  const r = crop ? inkBounds(asset, inkColor) : { x: 0, y: 0, w: full.width, h: full.height };
  const out = makeCanvas(r.w, r.h);
  out.getContext('2d').drawImage(full, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return new Promise((resolve) => out.toBlob(resolve, 'image/png'));
}

// The playback as a looping GIF: at most `maxSeconds` long (sped up to fit),
// then the finished letter held for `hold` ms. GIF transparency is on/off per
// pixel, so a transparent GIF has harder edges than a transparent PNG.
export async function letterGif(asset, { inkColor, paper, crop = false, maxWidth = 720, fps = 12, maxSeconds = 12, hold = 2500, onProgress }) {
  const { data, img } = asset;
  const big = document.createElement('canvas');
  const player = createPlayer(big, { data, ink: img }, { inkColor, paper });
  const r = crop ? inkBounds(asset, inkColor) : { x: 0, y: 0, w: data.width, h: data.height };
  const s = Math.min(1, maxWidth / r.w);
  const w = Math.max(1, Math.round(r.w * s));
  const h = Math.max(1, Math.round(r.h * s));
  const small = makeCanvas(w, h);
  const sctx = small.getContext('2d', { willReadFrequently: true });
  const grab = () => {
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(big, r.x, r.y, r.w, r.h, 0, 0, w, h);
    return sctx.getImageData(0, 0, w, h).data;
  };

  // One palette for every frame, from the finished letter: playback only adds ink.
  const clear = paper === null;
  const format = clear ? 'rgba4444' : 'rgb565';
  player.reset();
  player.drawAt(player.duration);
  const palette = quantize(grab(), clear || isTextured(paper) ? 128 : 64, clear ? { format, oneBitAlpha: true } : { format });
  const transparentIndex = clear ? palette.findIndex((p) => p[3] === 0) : -1;
  const transparent = transparentIndex >= 0;

  const step = (1000 / fps) * Math.max(1, player.duration / (maxSeconds * 1000));
  const frames = Math.max(1, Math.ceil(player.duration / step));
  const gif = GIFEncoder();
  player.reset();
  for (let i = 0; i <= frames; i++) {
    player.drawAt(Math.min(player.duration, i * step));
    gif.writeFrame(applyPalette(grab(), palette, format), w, h, {
      palette: i === 0 ? palette : undefined,
      delay: i === frames ? hold : Math.round(1000 / fps),
      transparent,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: transparent ? 2 : -1, // every frame is whole, so clear the last one first
    });
    if (i % 4 === 0) {
      onProgress?.(i / frames);
      await new Promise((resolve) => setTimeout(resolve, 0)); // keep the page responsive
    }
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
