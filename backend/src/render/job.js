// One render job: grow a sheet's acts on its paper, under the law its record
// carries, and report what settled. Runs inside a worker thread
// (render/worker.js), or inline when RENDER_WORKERS=0. The job carries the
// paperKey (derived from the seed), never the seed itself.
import { LawError } from 'penpals-law/v1/int';
import { lawOf } from 'penpals-law/laws';
import { hex } from 'penpals-law/tags';
import { encodePng } from 'penpals-law/tools/png';

// job: { law, acts: Uint8Array, paperKey: Uint8Array, family, scale, png: boolean, maxCells,
//        view?: { ageH, views } (the look at a moment: law 2 ages and fades; facts never do) }
export function runJob(job) {
  const { acts, paperKey, family, scale, png, maxCells, view = {} } = job;
  const L = lawOf(job.law ?? 1);
  const rec = L.decodeCanonical(acts);
  L.precheck(rec, scale);
  const res = L.grow(rec, { paperKey, family, scale });
  const cells = L.settledCells(res.tiles);
  const box = L.boxOf(cells);
  if (box[2] * box[3] > maxCells) throw new LawError('cost', 'this look is too big to render');
  const facts = hex(L.factsDigest({ cells, box, actsBytes: acts, family, scale }));
  let pngBytes = null;
  if (png) {
    if (!box[2] || !box[3]) pngBytes = blank();
    else {
      pngBytes = new Uint8Array(encodePng(box[2], box[3], L.lookRGBA(L.lookRGB(cells, box, view), box), 4));
    }
  }
  return { facts, box, png: pngBytes, ticks: res.ticks, work: res.work };
}

const blank = () => new Uint8Array(encodePng(1, 1, new Uint8Array(4), 4));
