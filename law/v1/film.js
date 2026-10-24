// A sheet being written, as frames: the playback engine (live.js) run forward
// 1/30 s of film at a time, each frame the tiles that changed since the last.
// The server makes films of closed sheets (only it holds their seeds); a
// writer's device makes films of its own and of open sheets. The film is
// pictures only: the same looks anyone who may see the sheet can see, frame
// by frame. Encoding to a video or GIF happens on the device.
//
// PNKF v1, little-endian:
//   'PNKF' u8 1 | i32 x0 y0 w h (the frame, sheet cells) | u16 fps | u32 msPerFrame | u32 frames
//   per frame: u32 tiles | per tile: i32 tx, i32 ty, 1024 bytes RGBA (16×16)

import { createPlayback } from './live.js';
import { TILE } from './constants.js';

export const FPS = 30;
export const MAX_FRAMES = 1800; // a minute of film; longer writing plays faster
export const DRY_TAIL_MS = 1500; // after the last act, a moment for the ink to settle

const MAGIC = [0x50, 0x4e, 0x4b, 0x46];
const TILE_BYTES = TILE * TILE * 4;

// How much recorded time each frame covers: real time when it fits in a minute.
export const msPerFrame = (duration) => Math.max(Math.ceil(1000 / FPS), Math.ceil((duration + DRY_TAIL_MS) / MAX_FRAMES));

// Grow the film of a record. `box` frames it (the sealed box, sheet cells).
export function makeFilm({ actsBytes, rec, paperKey, family, box }) {
  const play = createPlayback({ actsBytes, rec, paperKey, family });
  const step = msPerFrame(play.duration);
  const frames = [];
  let size = 0;
  const end = play.duration + DRY_TAIL_MS;
  for (let t = step; ; t += step) {
    const last = t >= end;
    if (last) play.finish();
    else play.advanceTo(t);
    const tiles = play.changed();
    frames.push(tiles);
    size += 4 + tiles.length * (8 + TILE_BYTES);
    if (last) break;
  }
  const out = new Uint8Array(4 + 1 + 16 + 2 + 4 + 4 + size);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  out[4] = 1;
  let o = 5;
  for (const v of box) { dv.setInt32(o, v, true); o += 4; }
  dv.setUint16(o, FPS, true); o += 2;
  dv.setUint32(o, step, true); o += 4;
  dv.setUint32(o, frames.length, true); o += 4;
  for (const tiles of frames) {
    dv.setUint32(o, tiles.length, true); o += 4;
    for (const t of tiles) {
      dv.setInt32(o, t.tx, true);
      dv.setInt32(o + 4, t.ty, true);
      out.set(t.rgba, o + 8);
      o += 8 + TILE_BYTES;
    }
  }
  return out;
}

// → { box, fps, msPerFrame, frames: [[{ tx, ty, rgba }]] } (rgba views into `bytes`)
export function readFilm(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!MAGIC.every((b, i) => bytes[i] === b) || bytes[4] !== 1) throw new Error('not a film');
  let o = 5;
  const box = [0, 1, 2, 3].map((i) => dv.getInt32(o + 4 * i, true));
  o += 16;
  const fps = dv.getUint16(o, true); o += 2;
  const step = dv.getUint32(o, true); o += 4;
  const n = dv.getUint32(o, true); o += 4;
  const frames = [];
  for (let f = 0; f < n; f++) {
    const count = dv.getUint32(o, true); o += 4;
    const tiles = [];
    for (let k = 0; k < count; k++) {
      tiles.push({ tx: dv.getInt32(o, true), ty: dv.getInt32(o + 4, true), rgba: bytes.subarray(o + 8, o + 8 + TILE_BYTES) });
      o += 8 + TILE_BYTES;
    }
    frames.push(tiles);
  }
  return { box, fps, msPerFrame: step, frames };
}

// Paint a frame's tiles into an RGBA picture of the box (w × h × 4), in place.
export function paintFrame(pixels, box, tiles) {
  const [x0, y0, w, h] = box;
  for (const { tx, ty, rgba } of tiles) {
    for (let r = 0; r < TILE; r++) {
      const y = ty * TILE + r - y0;
      if (y < 0 || y >= h) continue;
      for (let c = 0; c < TILE; c++) {
        const x = tx * TILE + c - x0;
        if (x < 0 || x >= w) continue;
        const s = (r * TILE + c) * 4;
        const d = (y * w + x) * 4;
        pixels[d] = rgba[s];
        pixels[d + 1] = rgba[s + 1];
        pixels[d + 2] = rgba[s + 2];
        pixels[d + 3] = rgba[s + 3];
      }
    }
  }
  return pixels;
}
