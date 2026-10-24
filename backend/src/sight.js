// What the eye asks for (cleanup-and-speed.md §5b): of a sheet's scene field, a
// window (?at=x0,y0,w,h, in the sheet's cells: the chunks in view) at a level of
// detail (?lod=0..3: each cell of the answer 2^lod of the sheet's a side); of its
// flat look, a level of detail. The routes check who may see the sheet first, the
// same as for the whole of it; the whole field is grown once and kept, and every
// window is cut from it.
import zlib from 'node:zlib';
import { httpError } from './files.js';
import { decodeScene, encodeScene, sceneWindow, MAX_LOD } from 'penpals-law/v2/scene';

const AT_RE = /^-?\d{1,6}(,-?\d{1,6}){3}$/;
const MAX_SIDE = 1 << 14;

// → { at: [x0, y0, w, h] | null, lod, tag } (tag: what names this answer among the sheet's)
export function sightOf(query, { window = true } = {}) {
  const { at: atText, lod: lodText } = query;
  let at = null;
  if (atText !== undefined) {
    if (!window) throw httpError(400, 'bad_sight', 'Only the scene comes in windows.');
    if (typeof atText !== 'string' || !AT_RE.test(atText)) throw httpError(400, 'bad_sight', 'A window is x0,y0,w,h in cells.');
    at = atText.split(',').map(Number);
    if (at[2] < 1 || at[3] < 1 || at[2] > MAX_SIDE || at[3] > MAX_SIDE) throw httpError(400, 'bad_sight', 'That window is too big.');
  }
  let lod = 0;
  if (lodText !== undefined) {
    if (typeof lodText !== 'string' || !/^\d$/.test(lodText) || Number(lodText) > MAX_LOD) throw httpError(400, 'bad_sight', `A level of detail is 0 to ${MAX_LOD}.`);
    lod = Number(lodText);
  }
  return { at, lod, tag: `${at ? `-w${at.join('_')}` : ''}${lod ? `-l${lod}` : ''}` };
}

// The whole field (deflated PNKS) cut to what was asked: the same bytes when that is all of it.
export function windowed(whole, { at, lod }) {
  if (!at && !lod) return whole;
  const f = decodeScene(new Uint8Array(zlib.inflateRawSync(whole)));
  return zlib.deflateRawSync(encodeScene(sceneWindow(f, at, lod)), { level: 6 });
}
