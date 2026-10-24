// "Reborn": paint a letter in its ink colour onto paper, and write it out over
// time. Drawn letters are painted from their strokes. Photographed letters are
// painted from their ink PNG, and on playback the PNG is revealed in reading
// order, steered by the traced strokes (sweep.js), so the picture stays the scan.

import { decodeStrokes, renderStrokes, strokesDuration } from './strokes.js';
import { layoutStrokes, scheduleSweep } from './sweep.js';
import { PAPERS, paintPaper } from './paper.js';

export { PAPERS };

// Decode an ink PNG (URL or Blob) into an <img> drawImage can use.
export function loadInk(src) {
  const url = src instanceof Blob ? URL.createObjectURL(src) : src;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (src instanceof Blob) URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (src instanceof Blob) URL.revokeObjectURL(url);
      reject(new Error('could not decode ink'));
    };
    img.src = url;
  });
}

// Strokes from a URL, a Blob, or an already decoded object.
export async function loadStrokes(src) {
  if (src && typeof src === 'object' && Array.isArray(src.strokes)) return src;
  if (src instanceof Blob) return decodeStrokes(src);
  const res = await fetch(src);
  if (!res.ok) throw new Error(`could not load strokes (${res.status})`);
  return decodeStrokes(await res.blob());
}

function makeCanvas(width, height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

function tinted(width, height, draw, inkColor) {
  const scratch = makeCanvas(width, height);
  const ctx = scratch.getContext('2d');
  draw(ctx);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = inkColor;
  ctx.fillRect(0, 0, width, height);
  return scratch;
}

// `paper` null = no paper: the ink alone on a transparent background.
function compose(canvas, width, height, inkLayer, paper) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (paper === null) {
    ctx.drawImage(inkLayer, 0, 0);
    return;
  }
  paintPaper(ctx, paper, width, height);
  ctx.globalCompositeOperation = 'multiply'; // like real ink on paper
  ctx.drawImage(inkLayer, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
}

// Ink PNG onto paper.
export function paintLetter(canvas, ink, { inkColor = '#1a1a1a', paper = 'plain' } = {}) {
  const width = ink.naturalWidth || ink.width;
  const height = ink.naturalHeight || ink.height;
  compose(
    canvas,
    width,
    height,
    tinted(width, height, (ctx) => ctx.drawImage(ink, 0, 0), inkColor),
    paper,
  );
}

// Strokes onto paper, optionally only what was written by `until` ms.
export function paintStrokes(canvas, data, { inkColor = '#1a1a1a', paper = 'plain', until = Infinity } = {}) {
  compose(
    canvas,
    data.width,
    data.height,
    tinted(data.width, data.height, (ctx) => renderStrokes(ctx, data, { until }), inkColor),
    paper,
  );
}

const lastT = (s) => s.points[s.points.length - 1].t;
const FAT = 6; // px added around a stroke when it is used to uncover the scan

// Watch a letter being written. Without `ink` (a drawn letter) the strokes are
// drawn with their recorded timing. With `ink` (a photographed letter) the
// scan is uncovered in reading order: a front sweeps left to right across
// each line, showing the ink under that line's words as it passes, dots and
// crossbars drop in at the end of their word, finished words are filled in
// whole, and at the end everything shows. Stroke times and directions play no
// part in that, so any trace, old or new, reads top-left to bottom-right.
// `getSpeed()` is read every frame, so a speed control can change it live.
// Letters longer than 40 s are sped up to fit. `reset()` + `drawAt(t)` with
// rising t paint single moments, for exporting the playback frame by frame.
export function createPlayer(canvas, { data, ink = null }, { inkColor = '#1a1a1a', paper = 'plain', getSpeed = () => 1 } = {}) {
  const { width, height } = data;
  const plan = ink ? scheduleSweep(layoutStrokes(data)) : null;
  const duration = ink ? plan.duration : strokesDuration(data);
  const base = Math.max(1, duration / 40000);
  const done = makeCanvas(width, height);
  const dctx = done.getContext('2d');
  const inkLayer = ink ? tinted(width, height, (ctx) => ctx.drawImage(ink, 0, 0), inkColor) : null;
  const fatten = (s) => ({ angle: s.angle, points: s.points.map((p) => ({ ...p, w: p.w + FAT })) });
  const fattened = (i) => ({ width, height, strokes: [fatten(data.strokes[i])] });
  let doneCount = 0;
  let raf = 0;
  let elapsed = 0;
  let last = 0;

  const frameStrokes = (until) => {
    while (doneCount < data.strokes.length && lastT(data.strokes[doneCount]) <= until) {
      renderStrokes(dctx, { width, height, strokes: [data.strokes[doneCount]] });
      doneCount++;
    }
    const layer = tinted(
      width,
      height,
      (ctx) => {
        ctx.drawImage(done, 0, 0);
        if (doneCount < data.strokes.length) renderStrokes(ctx, { width, height, strokes: [data.strokes[doneCount]] }, { until });
      },
      inkColor,
    );
    compose(canvas, width, height, layer, paper);
  };

  const frameReveal = (until) => {
    const { items } = plan;
    while (doneCount < items.length && items[doneCount].end <= until) {
      const w = items[doneCount].word;
      dctx.fillRect(w.minX - FAT, w.minY - FAT, w.maxX - w.minX + 2 * FAT, w.maxY - w.minY + 2 * FAT);
      doneCount++;
    }
    const reveal = makeCanvas(width, height);
    const r = reveal.getContext('2d');
    r.drawImage(done, 0, 0);
    if (until >= duration) {
      r.fillRect(0, 0, width, height);
    } else if (doneCount < items.length && until >= items[doneCount].t0) {
      const item = items[doneCount];
      const front = item.word.minX + ((until - item.t0) / 1000) * plan.speed;
      r.save();
      r.beginPath();
      r.rect(0, 0, front, height);
      r.clip();
      for (const i of item.word.strokes) renderStrokes(r, fattened(i));
      r.restore();
      for (const sat of item.satellites) if (until >= sat.at) renderStrokes(r, fattened(sat.i));
    }
    r.globalCompositeOperation = 'source-in';
    r.drawImage(inkLayer, 0, 0);
    compose(canvas, width, height, reveal, paper);
  };

  const frame = ink ? frameReveal : frameStrokes;
  const reset = () => {
    dctx.clearRect(0, 0, width, height);
    doneCount = 0;
  };

  return {
    duration,
    reset,
    drawAt: frame,
    play(onDone) {
      this.stop();
      reset();
      elapsed = 0;
      last = performance.now();
      const tick = () => {
        const now = performance.now();
        elapsed += (now - last) * base * getSpeed();
        last = now;
        frame(elapsed);
        if (elapsed < duration) raf = requestAnimationFrame(tick);
        else {
          raf = 0;
          onDone?.();
        }
      };
      raf = requestAnimationFrame(tick);
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
