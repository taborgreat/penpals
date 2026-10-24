// One render job: grow a sheet's acts on its paper and report what settled.
// Runs inside a worker thread (render/worker.js), or inline when RENDER_WORKERS=0.
// The job carries the paperKey (derived from the seed), never the seed itself.
import { decodeCanonical, precheck } from 'penpals-law/v1/acts';
import { grow } from 'penpals-law/v1/sim';
import { settledCells, boxOf, lookRGB, lookRGBA, factsDigest } from 'penpals-law/v1/look';
import { LawError } from 'penpals-law/v1/int';
import { hex } from 'penpals-law/tags';
import { encodePng } from 'penpals-law/tools/png';
import { makeFilm } from 'penpals-law/v1/film';
import zlib from 'node:zlib';

// job: { acts: Uint8Array, paperKey: Uint8Array, family, scale, png: boolean, maxCells }
//   or { film: true, acts, paperKey, family, box }: the sheet being written, frame by
//   frame (law/v1/film.js), deflated
export function runJob(job) {
  if (job.film) return runFilm(job);
  const { acts, paperKey, family, scale, png, maxCells } = job;
  const rec = decodeCanonical(acts);
  precheck(rec, scale);
  const res = grow(rec, { paperKey, family, scale });
  const cells = settledCells(res.tiles);
  const box = boxOf(cells);
  if (box[2] * box[3] > maxCells) throw new LawError('cost', 'this look is too big to render');
  const facts = hex(factsDigest({ cells, box, actsBytes: acts, family, scale }));
  let pngBytes = null;
  if (png) {
    pngBytes = box[2] && box[3]
      ? new Uint8Array(encodePng(box[2], box[3], lookRGBA(lookRGB(cells, box), box), 4))
      : new Uint8Array(encodePng(1, 1, new Uint8Array(4), 4));
  }
  return { facts, box, png: pngBytes, ticks: res.ticks, work: res.work };
}

function runFilm({ acts, paperKey, family, box, maxCells }) {
  if (box[2] * box[3] > maxCells) throw new LawError('cost', 'this film is too big to make');
  const rec = decodeCanonical(acts);
  precheck(rec, 64);
  const film = zlib.deflateRawSync(makeFilm({ actsBytes: acts, rec, paperKey, family, box }), { level: 6 });
  return { film: new Uint8Array(film.buffer, film.byteOffset, film.byteLength) };
}
