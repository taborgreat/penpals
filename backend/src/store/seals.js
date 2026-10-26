// A person's seal (rooms.md §3b): the face a stamper set to them takes, from their public signature
// (open from birth): the panel's stamper shows it, and presses it. → { w, h, face: b64url } | null (not
// signed yet). Pressing someone's name into wax on a paper is what lets them mark it (law/paper.js): the
// act names them; nothing here checks the face against it.

import { signatureOf, openSeed } from './books.js';
import { record as R, seal as SEAL, keys as K, fromB64url, b64url } from 'penpals-law';
import { lawOf } from 'penpals-law/laws';

const faces = new Map(); // userId → { sig (their signature's ink), face }
export async function sealFaceOf(account) {
  const line = await signatureOf(account.id);
  if (!line) return null;
  const id = line.id;
  const was = faces.get(account.id);
  if (was?.sig === id) return was.face;
  const seed = line && (await openSeed(account.id, line.ink.sheet));
  let face = null;
  if (seed) {
    const L = lawOf(line.ink.law ?? 1);
    const res = L.grow(L.decodeCanonical(fromB64url(line.ink.acts)), { paperKey: K.paperKeyOf(fromB64url(seed, 64)), family: R.familyOf(line.ink), scale: 64 });
    const cells = L.settledCells(res.tiles);
    const f = SEAL.faceOf(cells, L.boxOf(cells));
    face = f && { w: f.w, h: f.h, face: b64url(f.face) };
  }
  faces.set(account.id, { sig: id, face });
  return face;
}
