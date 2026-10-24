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
//        mode?: 'side' | 'scene', cut?: [x0, y0, x1, y1] (sheet cells, for 'side'),
//        lod?: the png at a level of detail, each pixel 2^lod cells a side (sight.js) }
//   'scene' answers { scene: deflated PNKS } (law/v2/scene.js): heights and colours, never the paper
//   or { film: true, law, acts, paperKey, family, box }: the sheet being written, frame by
//   frame (law/v1/film.js format), deflated
export function runJob(job) {
  if (job.film) return runFilm(job);
  const { acts, paperKey, family, scale, png, maxCells, view = {}, mode = null, cut = null, lod = 0 } = job;
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
    if (!box[2] || !box[3]) pngBytes = blank();
    else {
      const look = shrink(L.lookRGBA(L.lookRGB(cells, box, view), box), box[2], box[3], lod);
      pngBytes = new Uint8Array(encodePng(look.w, look.h, look.rgba, 4));
    }
  }
  return { facts, box, png: pngBytes, ticks: res.ticks, work: res.work };
}

const blank = () => new Uint8Array(encodePng(1, 1, new Uint8Array(4), 4));

// A look at a level of detail: each 2^lod × 2^lod block of pixels one, its
// colour mixed by how much ink each holds (as law/v2/scene.js sceneWindow).
function shrink(rgba, w, h, lod) {
  if (!lod) return { rgba, w, h };
  const n = 1 << lod;
  const W = Math.ceil(w / n),
    H = Math.ceil(h / n);
  const out = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let a = 0,
        r = 0,
        g = 0,
        b = 0;
      for (let y = j * n; y < Math.min(h, (j + 1) * n); y++) {
        for (let x = i * n; x < Math.min(w, (i + 1) * n); x++) {
          const k = 4 * (y * w + x);
          a += rgba[k + 3];
          r += rgba[k] * rgba[k + 3];
          g += rgba[k + 1] * rgba[k + 3];
          b += rgba[k + 2] * rgba[k + 3];
        }
      }
      const o = 4 * (j * W + i);
      if (Math.round(a / (n * n))) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / (n * n));
      }
    }
  }
  return { rgba: out, w: W, h: H };
}

function runFilm({ law, acts, paperKey, family, box, maxCells }) {
  if (box[2] * box[3] > maxCells) throw new LawError('cost', 'this film is too big to make');
  const L = lawOf(law ?? 1);
  const rec = L.decodeCanonical(acts);
  L.precheck(rec, 64);
  const film = zlib.deflateRawSync(L.makeFilm({ actsBytes: acts, rec, paperKey, family, box }), { level: 6 });
  return { film: new Uint8Array(film.buffer, film.byteOffset, film.byteLength) };
}
