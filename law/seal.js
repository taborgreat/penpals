// A stamper's face (rooms.md §3b): set to a person, it takes their signature in
// relief, made from their public signature (their sheet 0, open from birth, so
// anyone can make it and check it). The signature's grown cells, brought down to
// at most FACE_MAX × FACE_MAX: where there is ink the face is raised, as much as
// the ink is dark; mirrored, as a seal's face is, so that its impression in the
// wax reads the right way round.

import { FACE_MAX } from './v2/constants.js';

// cells: the signature's settled cells (lawOf(law).settledCells), box: its box (boxOf).
// → { w, h, face: Uint8Array(w × h) } (row-major, 0..255), or null with no ink.
export function faceOf(cells, box) {
  const [x0, y0, bw, bh] = box;
  if (!bw || !bh) return null;
  const w = bw >= bh ? FACE_MAX : Math.max(1, Math.round((FACE_MAX * bw) / bh));
  const h = bh >= bw ? FACE_MAX : Math.max(1, Math.round((FACE_MAX * bh) / bw));
  const ink = new Float64Array(w * h);
  for (const c of cells) {
    const a = c[2] + c[3] + c[4] + (c[5] ?? 0);
    if (!a) continue;
    const u = Math.min(w - 1, Math.floor(((c[1] - x0) * w) / bw));
    const v = Math.min(h - 1, Math.floor(((c[0] - y0) * h) / bh));
    if (u < 0 || v < 0) continue;
    const k = v * w + (w - 1 - u); // mirrored
    if (a > ink[k]) ink[k] = a;
  }
  let top = 0;
  for (const a of ink) if (a > top) top = a;
  if (!top) return null;
  // the darker half of the ink is the full height: a signature's line, not its faint edges
  const face = new Uint8Array(w * h);
  for (let k = 0; k < face.length; k++) face[k] = Math.min(255, Math.round((ink[k] * 2 * 255) / top));
  return { w, h, face };
}
