// The ink worker: the law's sim, off the main thread, for writing live
// (ink/live.js) and for playing a sheet back. Messages in:
//   { type: 'begin', paperKey, family }          a sheet to write on
//   { type: 'ops', ops }                          what capture made final (down/point/pen/up/undo/clear)
//   { type: 'advance', ms }                       the pen is up; dry until then
//   { type: 'settle', id, acts }                  the finished record grown in one go: facts, box, look
//   { type: 'play', id, acts, paperKey, family }  start playing a record back
//   { type: 'frame', id, ms }                     playback forward to ms
//   { type: 'verify', id, text }                  check a .book here (law/verify.js), regrowing open sheets
//   { type: 'trace', id, body, seed, cell }       walk one cell back (law/v1/trace.js)
//   { type: 'look', id, body, seed, scale }       an open sheet's look, grown here: RGBA and its box
// Out: { type: 'tiles', tiles: [{ tx, ty, rgba }] } (and 'reset'), replies by id.
import { createLive, createPlayback } from 'penpals-law/v1/live';
import { decodeCanonical } from 'penpals-law/v1/acts';
import { grow } from 'penpals-law/v1/sim';
import { trace } from 'penpals-law/v1/trace';
import { settledCells, boxOf, factsDigest, lookRGB, lookRGBA } from 'penpals-law/v1/look';
import { verify as V, keys as K, record as R, fromB64url, b64url } from 'penpals-law';

let sheet = null; // { paperKey, family }
let live = null;
const plays = new Map();

const postTiles = (tiles, extra = {}) => {
  if (tiles.length || extra.type) postMessage({ type: 'tiles', tiles, ...extra }, tiles.map((t) => t.rgba.buffer));
};

function apply(o) {
  if (o.op === 'down') live.down(o.pt, o.pen, o.hasP);
  else if (o.op === 'point') live.point(o.pt);
  else if (o.op === 'pen') live.pen(o.pen);
  else if (o.op === 'up') live.up();
  else if (o.op === 'undo') live.undo();
  else if (o.op === 'clear') {
    live = createLive(sheet);
    postMessage({ type: 'reset' });
  }
}

onmessage = ({ data: m }) => {
  try {
    if (m.type === 'begin') {
      sheet = { paperKey: m.paperKey, family: m.family };
      live = createLive(sheet);
    } else if (m.type === 'ops') {
      for (const o of m.ops) apply(o);
      const tiles = live.changed();
      postMessage({ type: 'tiles', tiles, ack: true }, tiles.map((t) => t.rgba.buffer)); // always answered: the main thread sends the next batch only then
    } else if (m.type === 'advance') {
      live.advanceTo(m.ms);
      postTiles(live.changed());
      postMessage({ type: 'advanced', ms: m.ms, wet: live.wet });
    } else if (m.type === 'settle') {
      const res = grow(decodeCanonical(m.acts), { paperKey: sheet.paperKey, family: sheet.family });
      const cells = settledCells(res.tiles);
      const box = boxOf(cells);
      const facts = factsDigest({ cells, box, actsBytes: m.acts, family: sheet.family });
      const rgba = box[2] && box[3] ? lookRGBA(lookRGB(cells, box), box) : new Uint8Array(0);
      postMessage({ type: 'settled', id: m.id, facts, box, rgba }, [rgba.buffer]);
    } else if (m.type === 'play') {
      const rec = decodeCanonical(m.acts);
      plays.set(m.id, createPlayback({ actsBytes: m.acts, rec, paperKey: m.paperKey, family: m.family }));
      postMessage({ type: 'playing', id: m.id, duration: plays.get(m.id).duration });
    } else if (m.type === 'frame') {
      const p = plays.get(m.id);
      if (!p) return;
      if (m.ms === Infinity) p.finish();
      else p.advanceTo(m.ms);
      const tiles = p.changed();
      postMessage({ type: 'frame', id: m.id, ms: m.ms, tiles }, tiles.map((t) => t.rgba.buffer));
    } else if (m.type === 'verify') {
      postMessage({ type: 'verified', id: m.id, report: V.verifyBook(m.text, { regrowOpen: true }) });
    } else if (m.type === 'verifyProof') {
      postMessage({ type: 'verified', id: m.id, report: V.verifyProof(m.bundle, { regrowOpen: true }) });
    } else if (m.type === 'look') {
      const acts = fromB64url(m.body.acts);
      const res = grow(decodeCanonical(acts), { paperKey: K.paperKeyOf(fromB64url(m.seed, 64)), family: m.body.paper, scale: m.scale });
      const cells = settledCells(res.tiles);
      const box = boxOf(cells);
      const rgba = box[2] && box[3] ? lookRGBA(lookRGB(cells, box), box) : new Uint8Array(4);
      postMessage({ type: 'look', id: m.id, box, rgba }, [rgba.buffer]);
    } else if (m.type === 'regrow') {
      // A closed sheet grown again by its writer (the seed made with their key, here).
      const seed = fromB64url(m.seed, 64);
      const ok = K.verifySeed(fromB64url(m.body.key, 32), m.body.sheet, seed) && b64url(K.commitOf(seed)) === m.body.commit && R.regrow(m.body, seed).ok;
      postMessage({ type: 'regrown', id: m.id, ok });
    } else if (m.type === 'trace') {
      const rec = decodeCanonical(fromB64url(m.body.acts));
      postMessage({ type: 'traced', id: m.id, trace: trace(rec, { paperKey: K.paperKeyOf(fromB64url(m.seed, 64)), family: m.body.paper }, m.cell) });
    } else if (m.type === 'stop') {
      plays.delete(m.id);
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id ?? null, message: err.message, code: err.code ?? null, law: !!err.law });
  }
};
