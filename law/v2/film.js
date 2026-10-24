// A v2 sheet being written, as frames (PNKF v1, the format of v1/film.js; the
// frames are the v2 preview: gall at its fresh tint, water as a faint wash).
// Reading and painting films is the same for every law: v1/film.js.

import { createPlayback } from './live.js';
import { TILE } from './constants.js';
import { readFilm, paintFrame, msPerFrame, FPS, MAX_FRAMES, DRY_TAIL_MS } from '../v1/film.js';

export { readFilm, paintFrame, msPerFrame, FPS, MAX_FRAMES, DRY_TAIL_MS };

const MAGIC = [0x50, 0x4e, 0x4b, 0x46];
const TILE_BYTES = TILE * TILE * 4;

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
  for (const v of box) {
    dv.setInt32(o, v, true);
    o += 4;
  }
  dv.setUint16(o, FPS, true);
  o += 2;
  dv.setUint32(o, step, true);
  o += 4;
  dv.setUint32(o, frames.length, true);
  o += 4;
  for (const tiles of frames) {
    dv.setUint32(o, tiles.length, true);
    o += 4;
    for (const t of tiles) {
      dv.setInt32(o, t.tx, true);
      dv.setInt32(o + 4, t.ty, true);
      out.set(t.rgba, o + 8);
      o += 8 + TILE_BYTES;
    }
  }
  return out;
}
