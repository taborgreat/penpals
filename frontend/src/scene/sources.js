// Where a piece of writing's scene comes from (the scene spec, "Serving and privacy"):
//   own or open sheets (the seed is on this device): grown here, real fibers and all
//   another's closed sheet: the server's scene field, heights and colours only
//   (never the seed or the paper's fields: a generic paper grain stands in)
//   law 1 ink (no depth): its flat look, lit
// and how much of it (cleanup-and-speed.md §5b, scene/sight.js): far or small, the
// flat look at a level of detail; near, the scene of the chunks in view.
import { decodeScene, sceneWindow } from 'penpals-law/v2/scene';
import { sceneHere, viewAt } from '../ink/grown.js';
import { cropCells } from './sight.js';

const KEEP = 48; // answers kept (the most recently used): a glance back costs nothing
const cache = new Map();
function remember(key, make) {
  if (cache.has(key)) {
    const p = cache.get(key);
    cache.delete(key);
    cache.set(key, p);
    return p;
  }
  const p = make();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  while (cache.size > KEEP) cache.delete(cache.keys().next().value);
  return p;
}

async function inflate(buf) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([buf]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}

async function lookRgba(url, box) {
  const res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`look ${res.status}`);
  const bmp = await createImageBitmap(await res.blob());
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(bmp, 0, 0);
  // (box: where it lies in the sheet's cells, at the level of detail it was asked at)
  return { rgba: ctx.getImageData(0, 0, bmp.width, bmp.height).data, w: bmp.width, h: bmp.height, box: [box[0], box[1], bmp.width, bmp.height] };
}

const sightTag = (want) => (want ? `${want.look ? 'look' : 'field'}:${want.lod}:${want.at?.join(',') ?? 'all'}` : 'whole');

// → Promise<{ field, detail? } | { look: { rgba, w, h, box } }>
//   line: the chain line; seed: b64url or null; lookUrl: the server's flat look (a
//   url, or lod → url: at the size it is shown); sceneUrl: the server's scene; want: what the eye asks
//   for (sight.js wantOf; omitted: all of it, every cell)
export function sceneOf({ line, seed, lookUrl, sceneUrl, views = 0, want = null }) {
  const view = viewAt(line, views);
  const base = `${line.ink.sheet}:${seed ? 'here' : 'served'}:${view.ageH}:${view.views}`;
  if (line.ink.law < 2 || (want?.look && lookUrl && !seed)) {
    if (!lookUrl) return Promise.reject(new Error('no look'));
    const lod = line.ink.law < 2 ? (want?.lod ?? 0) : want.lod;
    const url = typeof lookUrl === 'function' ? lookUrl(lod) : `${lookUrl}${lod ? `${lookUrl.includes('?') ? '&' : '?'}lod=${lod}` : ''}`;
    return remember(`${base}:look:${url}`, async () => ({ look: await lookRgba(url, line.ink.box) }));
  }
  if (seed) {
    // grown here, whole (once), then cut to what is wanted
    const whole = remember(`${base}:whole`, async () => {
      const { field, detail } = await sceneHere(line.ink, seed, view);
      return { field, detail: { data: detail, box: field.box } };
    });
    if (!want || (!want.at && !want.lod)) return whole;
    return remember(`${base}:${sightTag(want)}`, async () => {
      const { field, detail } = await whole;
      const part = sceneWindow(field, want.at, want.lod);
      return { field: part, detail: want.lod ? null : want.at ? cropCells(detail.data, detail.box, want.at) : detail };
    });
  }
  if (!sceneUrl) return Promise.reject(new Error('no scene'));
  return remember(`${base}:${sightTag(want)}`, async () => {
    const q = `${want?.at ? `&at=${want.at.join(',')}` : ''}${want?.lod ? `&lod=${want.lod}` : ''}`;
    const res = await fetch(sceneUrl + q, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`scene ${res.status}`);
    return { field: decodeScene(await inflate(await res.arrayBuffer())) };
  });
}

export const hexRgb = (css, fallback = [246, 241, 231]) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css ?? '');
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : fallback;
};
