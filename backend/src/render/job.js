// One render job: grow a sheet's acts on its paper, under the law its record
// carries, and report what settled. Runs inside a worker thread
// (render/worker.js), or inline when RENDER_WORKERS=0. The job carries the
// paperKey (derived from the seed), never the seed itself.
import { LawError } from 'penpals-law/v1/int';
import { lawOf } from 'penpals-law/laws';
import { hex } from 'penpals-law/tags';
import { encodePng } from 'penpals-law/tools/png';
import { encodeScene } from 'penpals-law/v2/scene';
import zlib from 'node:zlib';

const SIDE_PX = 3; // pixels per cell along a side-view cut

// job: { law, acts: Uint8Array, paperKey: Uint8Array, family, scale, png: boolean, maxCells,
//        view?: { ageH, views } (the look at a moment: law 2 ages and fades; facts never do),
//        mode?: 'side' | 'scene', cut?: [x0, y0, x1, y1] (sheet cells, for 'side') }
//   'scene' answers { scene: deflated PNKS } (law/v2/scene.js): heights and colours, never the paper
//   or { film: true, law, acts, paperKey, family, box }: the sheet being written, frame by
//   frame (law/v1/film.js format), deflated
export function runJob(job) {
  if (job.film) return runFilm(job);
  const { acts, paperKey, family, scale, png, maxCells, view = {}, mode = null, cut = null } = job;
  const L = lawOf(job.law ?? 1);
  const rec = L.decodeCanonical(acts);
  L.precheck(rec, scale);
  const res = L.grow(rec, { paperKey, family, scale });
  const cells = L.settledCells(res.tiles);
  const box = L.boxOf(cells);
  if (box[2] * box[3] > maxCells) throw new LawError('cost', 'this look is too big to render');
  const facts = hex(L.factsDigest({ cells, box, actsBytes: acts, family, scale }));
  let pngBytes = null;
  if (mode === 'scene') {
    if (!L.sceneField) throw new LawError('law', 'ink of this law has no depth to show');
    const scene = zlib.deflateRawSync(encodeScene(L.sceneField(cells, box, view)), { level: 6 });
    return { facts, box, scene: new Uint8Array(scene.buffer, scene.byteOffset, scene.byteLength), ticks: res.ticks, work: res.work };
  }
  if (mode === 'side') {
    if (!L.sideView) throw new LawError('law', 'ink of this law has no depth to show');
    const pic = L.sideView(cells, { x0: cut[0], y0: cut[1], x1: cut[2], y1: cut[3] }, { px: SIDE_PX, ...view });
    pngBytes = pic.width && pic.height ? new Uint8Array(encodePng(pic.width, pic.height, pic.rgba, 4)) : blank();
  } else if (png) {
    pngBytes = box[2] && box[3] ? new Uint8Array(encodePng(box[2], box[3], L.lookRGBA(L.lookRGB(cells, box, view), box), 4)) : blank();
  }
  return { facts, box, png: pngBytes, ticks: res.ticks, work: res.work };
}

const blank = () => new Uint8Array(encodePng(1, 1, new Uint8Array(4), 4));

function runFilm({ law, acts, paperKey, family, box, maxCells }) {
  if (box[2] * box[3] > maxCells) throw new LawError('cost', 'this film is too big to make');
  const L = lawOf(law ?? 1);
  const rec = L.decodeCanonical(acts);
  L.precheck(rec, 64);
  const film = zlib.deflateRawSync(L.makeFilm({ actsBytes: acts, rec, paperKey, family, box }), { level: 6 });
  return { film: new Uint8Array(film.buffer, film.byteOffset, film.byteLength) };
}
