// Films to files, off the main thread: a sheet being written (law/v1/film.js),
// frame by frame, laid on its paper colour and encoded to WebM (WebCodecs, the
// default) or GIF (the fallback, and for anywhere a GIF is wanted).
//   { film: Uint8Array (PNKF) }                    a film the server made (a closed sheet)
//   { local: { actsBytes, paperKey, family, box, law } } or one made here (your own, or an open sheet), under its law
//   + { format: 'webm' | 'gif', background: '#rrggbb' | null (GIF only: transparent) }
// Replies { progress } as it goes, then { done: Blob, format } or { error }.
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { readFilm, paintFrame } from 'penpals-law/v1/film';
import { lawOf } from 'penpals-law/laws';
import { muxWebm } from './webm.js';

const CODECS = [['vp09.00.10.08', 'V_VP9'], ['vp8', 'V_VP8']];

const hex = (c) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c ?? '');
  return m ? [1, 2, 3].map((i) => parseInt(m[i], 16)) : null;
};

// The frame over its paper: ink is colour-to-alpha, so laid on any colour it shows true.
function onPaper(pixels, w, h, W, H, bg) {
  const out = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[4 * i] = bg[0];
    out[4 * i + 1] = bg[1];
    out[4 * i + 2] = bg[2];
    out[4 * i + 3] = 255;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const a = pixels[s + 3];
      if (!a) continue;
      const d = (y * W + x) * 4;
      for (let c = 0; c < 3; c++) out[d + c] = Math.round((pixels[s + c] * a + out[d + c] * (255 - a)) / 255);
    }
  }
  return out;
}

async function webmSupport(width, height) {
  if (typeof VideoEncoder === 'undefined') return null;
  for (const [codec, id] of CODECS) {
    const s = await VideoEncoder.isConfigSupported({ codec, width, height, bitrate: 2_000_000, framerate: 30 }).catch(() => null);
    if (s?.supported) return { codec, id };
  }
  return null;
}

async function toWebm(film, bg, progress) {
  const [, , w, h] = film.box;
  const W = w + (w % 2);
  const H = h + (h % 2);
  const support = await webmSupport(W, H);
  if (!support) return null;
  const chunks = [];
  let failed = null;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ data, timestamp: chunk.timestamp, key: chunk.type === 'key' });
    },
    error: (e) => { failed = e; },
  });
  encoder.configure({ codec: support.codec, width: W, height: H, bitrate: Math.min(8_000_000, W * H * 6), framerate: film.fps });
  const pixels = new Uint8ClampedArray(w * h * 4);
  const frameUs = Math.round(1_000_000 / film.fps);
  for (let f = 0; f < film.frames.length; f++) {
    paintFrame(pixels, film.box, film.frames[f]);
    const frame = new VideoFrame(onPaper(pixels, w, h, W, H, bg), { format: 'RGBA', codedWidth: W, codedHeight: H, timestamp: f * frameUs });
    encoder.encode(frame, { keyFrame: f % 90 === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
    if (f % 15 === 0) progress(f / film.frames.length);
    if (failed) throw failed;
  }
  await encoder.flush();
  encoder.close();
  if (failed) throw failed;
  const bytes = muxWebm({ codec: support.id, width: W, height: H, chunks, durationMs: (film.frames.length * 1000) / film.fps });
  return new Blob([bytes], { type: 'video/webm' });
}

function toGif(film, bg, progress) {
  const [, , w, h] = film.box;
  // One palette for the whole film, from the finished look (the darkest frame), so colours hold still.
  const pixels = new Uint8ClampedArray(w * h * 4);
  const frames = [];
  for (const tiles of film.frames) {
    paintFrame(pixels, film.box, tiles);
    frames.push(bg ? onPaper(pixels, w, h, w, h, bg) : pixels.slice());
  }
  const format = bg ? 'rgb565' : 'rgba4444';
  const palette = quantize(frames.at(-1), 256, bg ? { format } : { format, oneBitAlpha: true });
  const transparentIndex = bg ? -1 : palette.findIndex((p) => p[3] === 0);
  const transparent = transparentIndex >= 0;
  const gif = GIFEncoder();
  const delay = Math.round(1000 / film.fps);
  frames.forEach((rgba, i) => {
    gif.writeFrame(applyPalette(rgba, palette, format), w, h, {
      palette: i === 0 ? palette : undefined,
      delay: i === frames.length - 1 ? 3000 : delay,
      transparent,
      transparentIndex: Math.max(0, transparentIndex),
      dispose: transparent ? 2 : -1, // every frame is whole: clear the last one first
    });
    if (i % 15 === 0) progress(i / frames.length);
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}

onmessage = async ({ data: m }) => {
  try {
    const progress = (p) => postMessage({ progress: p });
    let bytes = m.film;
    if (m.local) {
      const { actsBytes, paperKey, family, box, law = 1 } = m.local;
      const L = lawOf(law);
      bytes = L.makeFilm({ actsBytes, rec: L.decodeCanonical(actsBytes), paperKey, family, box });
    }
    const film = readFilm(bytes);
    if (!film.box[2] || !film.box[3]) throw new Error('There is no ink to film.');
    const bg = hex(m.background);
    let blob = null;
    let format = m.format;
    if (format === 'webm') blob = await toWebm(film, bg ?? [255, 255, 255], progress);
    if (!blob) {
      format = 'gif';
      blob = toGif(film, bg, progress);
    }
    postMessage({ done: blob, format });
  } catch (err) {
    postMessage({ error: err.message });
  }
};
