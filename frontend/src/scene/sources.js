// Where a piece of writing's scene comes from (the scene spec, "Serving and privacy"):
//   own or open sheets (the seed is on this device): grown here, real fibers and all
//   another's closed sheet: the server's scene field, heights and colours only
//   (never the seed or the paper's fields: a generic paper grain stands in)
//   law 1 ink (no depth): its flat look, lit
import { decodeScene } from 'penpals-law/v2/scene';
import { sceneHere, viewAt } from '../ink/grown.js';

const cache = new Map();

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
  return { rgba: ctx.getImageData(0, 0, bmp.width, bmp.height).data, box: [box[0], box[1], bmp.width, bmp.height] };
}

// → Promise<{ field, detail? } | { look }>
//   line: the chain line; seed: b64url or null; lookUrl, sceneUrl: the server's
export function sceneOf({ line, seed, lookUrl, sceneUrl, views = 0 }) {
  const view = viewAt(line, views);
  const key = `${line.ink.sheet}:${seed ? 'here' : 'served'}:${view.ageH}:${view.views}`;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    if (line.ink.law < 2) {
      if (!lookUrl) throw new Error('no look');
      return { look: await lookRgba(lookUrl, line.ink.box) };
    }
    if (seed) {
      const { field, detail } = await sceneHere(line.ink, seed, view);
      return { field, detail: { data: detail, box: field.box } };
    }
    if (!sceneUrl) throw new Error('no scene');
    const res = await fetch(sceneUrl, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`scene ${res.status}`);
    return { field: decodeScene(await inflate(await res.arrayBuffer())) };
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
  return p;
}

export const hexRgb = (css, fallback = [246, 241, 231]) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css ?? '');
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : fallback;
};
