// Ink grown on this device, outside a writing session: checking a .book and
// the looks of its open sheets (anyone can grow those: their seeds are public).
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

const looks = new Map(); // `${sheet}@${scale}` → Promise<object URL>
export function growLook(body, seed, scale) {
  const k = `${body.sheet}@${scale}`;
  if (!looks.has(k)) {
    looks.set(k, ask({ type: 'look', body, seed, scale }).then(async ({ box, rgba }) => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, box[2]);
      c.height = Math.max(1, box[3]);
      if (box[2] && box[3]) c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba.buffer), box[2], box[3]), 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      return URL.createObjectURL(blob);
    }));
  }
  return looks.get(k);
}
