// Ink grown on this device, outside a writing session: checking a .book and
// the looks of its open sheets (anyone can grow those: their seeds are public).
import { laws } from 'penpals-law';
let worker = null;
const waiting = new Map();
let nextId = 1;

function ask(msg) {
  if (!worker) {
    worker = new Worker(new URL('./inkWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = waiting.get(data.id);
      if (!p) return;
      waiting.delete(data.id);
      if (data.type === 'error') p.reject(new Error(data.message));
      else p.resolve(data);
    };
  }
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}

export const verifyBookHere = (text) => ask({ type: 'verify', text }).then((d) => d.report);
export const verifyProofHere = (bundle) => ask({ type: 'verifyProof', bundle }).then((d) => d.report);
export const regrowHere = (body, seed) => ask({ type: 'regrow', body, seed }).then((d) => d.ok);
export const traceHere = (body, seed, cell) => ask({ type: 'trace', body, seed, cell }).then((d) => d.trace);
// The scene's field of a record grown here (law 2), with the paper's own fibers: own and open sheets.
export const sceneHere = (body, seed, view) => ask({ type: 'depth', body, seed, mode: 'scene', view }).then(({ field, detail }) => ({ field, detail }));
// When each cell's ink went down (show the moments): own and open sheets.
export const momentsHere = (body, seed) => ask({ type: 'moments', body, seed }).then(({ box, at }) => ({ box, at }));

const urlOf = async (w, h, rgba) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  if (w && h) c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), w, h), 0, 0);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return URL.createObjectURL(blob);
};

// The moment a record is drawn at here: the hours since it was made (oak gall
// darkens, law 2) and `views` (a .book carries no exposure: 0, the fresh look).
export const viewAt = (line, views = 0) => {
  const ageH = Math.max(0, (Date.now() - Date.parse(line.made)) / 3600000);
  return laws.viewBuckets(line.ink.law, { ageH: Number.isFinite(ageH) ? ageH : 0, views });
};

const looks = new Map(); // `${sheet}@${scale}:${age}:${views}` → Promise<object URL>
export function growLook(body, seed, scale, view = { ageH: 0, views: 0 }) {
  const k = `${body.sheet}@${scale}:${view.ageH}:${view.views}`;
  if (!looks.has(k)) looks.set(k, ask({ type: 'look', body, seed, scale, view }).then(({ box, rgba }) => urlOf(box[2], box[3], rgba)));
  return looks.get(k);
}

// Into the paper (law 2): mode 'side' cuts along cut = [x0, y0, x1, y1] (sheet
// cells); 'relief' lights the top. → { url, width, height }
export async function depthHere(body, seed, { mode, cut = null, view = { ageH: 0, views: 0 } }) {
  const d = await ask({ type: 'depth', body, seed, mode, cut, view });
  return { url: await urlOf(d.width, d.height, d.rgba), width: d.width, height: d.height };
}
