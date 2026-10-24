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
//   { type: 'trace', id, body, seed, cell }       walk one cell back (law/v*/trace.js)
//   { type: 'look', id, body, seed, scale, view? }  an open sheet's look, grown here: RGBA and its box
//   { type: 'depth', id, body, seed, mode, cut?, view? }  side ('side', cut [x0,y0,x1,y1]): RGBA; or 'scene': the
//                                                 scene's field (law/v2/scene.js) and the paper's own detail
//   { type: 'scene', on }                         the sheet being written: tiles carry heights from now on
// Out: { type: 'tiles', tiles: [{ tx, ty, rgba }] } (and 'reset'), replies by id.
import { lawOf, CURRENT } from 'penpals-law/laws';
import { paperDetail } from 'penpals-law/v2/scene';
import { verify as V, keys as K, record as R, fromB64url, b64url } from 'penpals-law';

let sheet = null; // { paperKey, family, law }
let live = null;
const SIDE_PX = 3;

// A record's facts, grown here on the paper of `seed` under its law.
function growBody(body, seed, scale = 64) {
  const L = lawOf(body.law);
  const acts = fromB64url(body.acts);
  const res = L.grow(L.decodeCanonical(acts), { paperKey: K.paperKeyOf(fromB64url(seed, 64)), family: body.paper, scale });
  const cells = L.settledCells(res.tiles);
  return { L, cells, box: L.boxOf(cells) };
}
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
      const tiles = live.changed({ heights: sheet.scene });
      postMessage({ type: 'tiles', tiles, ack: true }, tiles.map((t) => t.rgba.buffer)); // always answered: the main thread sends the next batch only then
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
      postMessage({ type: 'frame', id: m.id, ms: m.ms, tiles }, tiles.map((t) => t.rgba.buffer));
    } else if (m.type === 'verify') {
      postMessage({ type: 'verified', id: m.id, report: V.verifyBook(m.text, { regrowOpen: true }) });
    } else if (m.type === 'verifyProof') {
      postMessage({ type: 'verified', id: m.id, report: V.verifyProof(m.bundle, { regrowOpen: true }) });
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
    } else if (m.type === 'depth') {
      const { L, cells, box } = growBody(m.body, m.seed);
      if (!L.sideView) throw new Error('ink written before depth (law 1) has no side view or scene');
      if (m.mode === 'scene') {
        const f = L.sceneField(cells, box, m.view ?? {});
        const detail = paperDetail(K.paperKeyOf(fromB64url(m.seed, 64)), m.body.paper, box);
        postMessage({ type: 'depth', id: m.id, field: f, detail }, [f.surface.buffer, f.above.buffer, f.depth.buffer, f.rgba.buffer, f.flags.buffer, detail.buffer]);
      } else {
        const pic = L.sideView(cells, { x0: m.cut[0], y0: m.cut[1], x1: m.cut[2], y1: m.cut[3] }, { px: SIDE_PX, ...(m.view ?? {}) });
        postMessage({ type: 'depth', id: m.id, width: pic.width, height: pic.height, rgba: pic.rgba, box }, [pic.rgba.buffer]);
      }
    } else if (m.type === 'moments') {
      // show the moments (own and open sheets): when each cell's ink went down
      const L = lawOf(m.body.law);
      if (!L.momentsOf) throw new Error('ink written before depth (law 1) has no moments to show');
      const rec = L.decodeCanonical(fromB64url(m.body.acts));
      const mo = L.momentsOf(rec, { paperKey: K.paperKeyOf(fromB64url(m.seed, 64)), family: m.body.paper }, m.body.box);
      postMessage({ type: 'moments', id: m.id, box: mo.box, at: mo.at }, [mo.at.buffer]);
    } else if (m.type === 'regrow') {
      // A closed sheet grown again by its writer (the seed made with their key, here).
      const seed = fromB64url(m.seed, 64);
      const ok = K.verifySeed(fromB64url(m.body.key, 32), m.body.sheet, seed) && b64url(K.commitOf(seed)) === m.body.commit && R.regrow(m.body, seed).ok;
      postMessage({ type: 'regrown', id: m.id, ok });
    } else if (m.type === 'trace') {
      const L = lawOf(m.body.law);
      const rec = L.decodeCanonical(fromB64url(m.body.acts));
      postMessage({ type: 'traced', id: m.id, trace: L.trace(rec, { paperKey: K.paperKeyOf(fromB64url(m.seed, 64)), family: m.body.paper }, m.cell) });
    } else if (m.type === 'stop') {
      plays.delete(m.id);
    }
  } catch (err) {
    postMessage({ type: 'error', id: m.id ?? null, message: err.message, code: err.code ?? null, law: !!err.law });
  }
};
