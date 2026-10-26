// The ink worker: the law's sim, off the main thread, for writing live
// (ink/live.js) and for playing a sheet back. Every sheet grows under its law:
// new writing under the current one, a record under the law it carries.
// Messages in:
//   { type: 'begin', paperKey, family, law?, scene? }  a sheet to write on (law: the current one; scene: tiles carry heights)
//   { type: 'ops', ops }                          what capture made final (down/point/pen/up/undo/clear)
//   { type: 'advance', ms }                       the pen is up; dry until then
//   { type: 'settle', id, acts }                  the finished record grown in one go: facts, box, look, law
//   { type: 'cut', id, x0, y0, x1, y1 }          the sheet being written, cut through (side view, law 2): RGBA
//   { type: 'play', id, acts, paperKey, family, law? }  start playing a record back
//   { type: 'frame', id, ms }                     playback forward to ms
//   { type: 'verify', id, text }                  check a .book here (law/verify.js), regrowing open sheets
//   { type: 'look', id, body, seed, scale, view? }  an open sheet's look, grown here: RGBA and its box
//   { type: 'scene', on }                         the sheet being written: tiles carry heights from now on
//   { type: 'liveMoments', id, acts }             the sheet being written, its moments (law 2): when each cell's ink went down
// Out: { type: 'tiles', tiles: [{ tx, ty, rgba, hf?, abs? }], nib? } (and 'reset'), replies by id. With the scene on,
// each tile's heights (hf) and its ink by its absorbances (abs: law/v2/live.js absTile), as half floats. nib (with each
// batch's answer): { reservoir (what is left in a dipped nib, of its fill), drops, W (thrown so far) }.
import { lawOf, CURRENT } from 'penpals-law/laws';
import { halves } from '../scene/half.js';
import { verify as V, keys as K, record as R, fromB64url } from 'penpals-law';

let sheet = null; // { paperKey, family, law }
let live = null;
const SIDE_PX = 3;

// A record's facts, grown here on the paper of `seed` under its law.
function growBody(body, seed, scale = 64) {
  const L = lawOf(body.law);
  const acts = fromB64url(body.acts);
  const res = L.grow(L.decodeCanonical(acts), { paperKey: K.paperKeyOf(fromB64url(seed, 64)), family: R.familyOf(body), scale });
  const cells = L.settledCells(res.tiles);
  return { L, cells, box: L.boxOf(cells) };
}
const plays = new Map();

// Tiles out: RGBA, and the heights and the ink's absorbances (when the scene is on) as half floats, the
// renderer's own format; the buffers handed over, not copied.
function out(tiles) {
  for (const t of tiles) {
    if (t.hf) t.hf = halves(t.hf, new Uint16Array(t.hf.buffer, t.hf.byteOffset, t.hf.length)); // in place: each value read before it is written
    if (t.abs) t.abs = halves(t.abs);
  }
  return tiles;
}
const handed = (tiles) => tiles.flatMap((t) => [t.rgba.buffer, ...(t.hf ? [t.hf.buffer] : []), ...(t.abs ? [t.abs.buffer] : [])]);
const postTiles = (tiles, extra = {}) => {
  if (tiles.length || extra.type) postMessage({ type: 'tiles', tiles: out(tiles), ...extra }, handed(tiles));
};

function apply(o) {
  if (o.op === 'down') live.down(o.pt, o.pen, o.hasP);
  else if (o.op === 'point') live.point(o.pt);
  else if (o.op === 'pen') live.pen(o.pen);
  else if (o.op === 'up') live.up();
  else if (o.op === 'undo') live.undo();
  else if (o.op === 'clear') {
    live = lawOf(sheet.law).createLive(sheet);
    postMessage({ type: 'reset' });
  }
}

onmessage = ({ data: m }) => {
  try {
    if (m.type === 'begin') {
      sheet = { paperKey: m.paperKey, family: m.family, law: m.law ?? CURRENT, scene: !!m.scene };
      live = lawOf(sheet.law).createLive(sheet);
    } else if (m.type === 'ops') {
      for (const o of m.ops) apply(o);
      const tiles = out(live.changed({ heights: sheet.scene }));
      const nib = { reservoir: live.reservoir ?? 1, drops: live.splat?.drops ?? 0, W: live.splat?.W ?? 0 }; // (law 1 has neither)
      postMessage({ type: 'tiles', tiles, ack: true, nib }, handed(tiles)); // always answered: the main thread sends the next batch only then
    } else if (m.type === 'advance') {
      live.advanceTo(m.ms);
      postTiles(live.changed({ heights: sheet.scene }));
      postMessage({ type: 'advanced', ms: m.ms, wet: live.wet });
    } else if (m.type === 'settle') {
      const L = lawOf(sheet.law);
      const res = L.grow(L.decodeCanonical(m.acts), { paperKey: sheet.paperKey, family: sheet.family });
      const cells = L.settledCells(res.tiles);
      const box = L.boxOf(cells);
      const facts = L.factsDigest({ cells, box, actsBytes: m.acts, family: sheet.family, scale: 64 });
      const rgba = box[2] && box[3] ? L.lookRGBA(L.lookRGB(cells, box), box) : new Uint8Array(0);
      postMessage({ type: 'settled', id: m.id, facts, box, rgba, law: sheet.law }, [rgba.buffer]);
    } else if (m.type === 'cut') {
      const L = lawOf(sheet.law);
      if (!L.sideView || !live.cut) throw new Error('this law has no depth');
      const pic = L.sideView(live.cut(m.x0, m.y0, m.x1, m.y1), m, { px: SIDE_PX });
      postMessage({ type: 'cut', id: m.id, width: pic.width, height: pic.height, rgba: pic.rgba }, [pic.rgba.buffer]);
    } else if (m.type === 'play') {
      const L = lawOf(m.law ?? CURRENT);
      plays.set(m.id, L.createPlayback({ actsBytes: m.acts, rec: L.decodeCanonical(m.acts), paperKey: m.paperKey, family: m.family }));
      postMessage({ type: 'playing', id: m.id, duration: plays.get(m.id).duration });
    } else if (m.type === 'frame') {
      const p = plays.get(m.id);
      if (!p) return;
      if (m.ms === Infinity) p.finish();
      else p.advanceTo(m.ms);
      const tiles = p.changed();
      postMessage(
        { type: 'frame', id: m.id, ms: m.ms, tiles },
        tiles.map((t) => t.rgba.buffer),
      );
    } else if (m.type === 'verify') {
      postMessage({ type: 'verified', id: m.id, report: V.verifyBook(m.text, { regrowOpen: true }) });
    } else if (m.type === 'look') {
      const { L, cells, box } = growBody(m.body, m.seed, m.scale);
      const rgba = box[2] && box[3] ? L.lookRGBA(L.lookRGB(cells, box, m.view ?? {}), box) : new Uint8Array(4);
      postMessage({ type: 'look', id: m.id, box, rgba }, [rgba.buffer]);
    } else if (m.type === 'scene') {
      sheet.scene = !!m.on;
      if (m.on && live.resend) {
        live.resend(); // every tile shown so far, again, with its heights
        postTiles(live.changed({ heights: true }));
      }
    } else if (m.type === 'liveMoments') {
      // show the moments of the sheet being written (yours, on its own paper), as written so far
      const L = lawOf(sheet.law);
      if (!L.momentsOf) throw new Error('ink written before depth (law 1) has no moments to show');
      const rec = L.decodeCanonical(m.acts);
      const on = { paperKey: sheet.paperKey, family: sheet.family };
      const mo = L.momentsOf(rec, on, L.boxOf(L.settledCells(L.grow(rec, on).tiles)));
      postMessage({ type: 'moments', id: m.id, box: mo.box, at: mo.at }, [mo.at.buffer]);
    } else if (m.type === 'stop') {
      plays.delete(m.id);
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id ?? null, message: err.message, code: err.code ?? null, law: !!err.law });
  }
};
