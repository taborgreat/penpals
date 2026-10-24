// A sheet being written, live: capture (ink/capture.js) on the main thread,
// the law's sim in the ink worker, and a canvas of the sheet's cells that the
// worker's tiles are painted onto. What it shows is what will be sealed:
// capture feeds the worker exactly the acts it will encode (capture.test.js).
//
//   const ink = createLiveInk({ paperKey, family, size: { width, height }, pen, law? })   (law: the current one)
//   ink.capture        hand to Pad / WriteMode: down / move / up / cancel
//   ink.canvas         the sheet, CELLS cells per page px; ink.onChange(fn) when it changes
//   ink.setPen(pen)    the law pen for what is written next (ink/pens.js)
//   ink.undo(), ink.clear(), ink.strokes (count)
//   ink.settle()       → { acts, facts, box, rgba, law }: the finished record grown in one go, for sealing
//   ink.cut(x0, y0, x1, y1) → { width, height, rgba }: a side view through the sheet as it is now (law 2)
//   ink.moments()      → { box, at } | null: when each cell's ink went down, as written so far (law 2)
//   ink.scene(on)      tiles carry their height field (the scene); ink.onTiles(fn) gets each batch,
//                      ink.tiles() all tiles so far: [{ tx, ty, rgba, hf? }]
//   ink.play(canvas)   → { duration, play(onDone), stop() }: the sheet written out again, physics and all
//   ink.destroy()

import { createCapture } from './capture.js';
import { CURRENT } from 'penpals-law/laws';

export const CELLS = 2; // law cells per ink unit (= page px)
const TILE = 16;
const ADVANCE_MS = 40; // how often the sheet is dried while the pen is up

export function createLiveInk({ paperKey, family, size, pen, law = CURRENT }) {
  const capture = createCapture({ pen, live: true });
  const worker = new Worker(new URL('./inkWorker.js', import.meta.url), { type: 'module' });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(size.width * CELLS);
  canvas.height = Math.ceil(size.height * CELLS);
  const ctx = canvas.getContext('2d');
  const listeners = new Set();
  const tileListeners = new Set();
  const tileStore = new Map(); // `tx,ty` → the latest { tx, ty, rgba, hf? }
  let sceneWanted = false;
  const pending = new Map(); // id → { resolve, reject }
  let nextId = 1;
  let raf = 0;
  let advancing = false;
  let queued = []; // what capture made final, waiting for the worker to take the last batch
  let opsInFlight = false;
  let lastAdvance = -1;
  let lastAdvanceAt = 0;
  let dead = false;
  let error = null;

  const notify = () => { for (const fn of listeners) fn(); };
  const paint = (c, tiles) => {
    for (const t of tiles) c.putImageData(new ImageData(new Uint8ClampedArray(t.rgba.buffer), TILE, TILE), t.tx * TILE, t.ty * TILE);
  };
  const ask = (msg, transfer = []) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id }, transfer);
  });

  const players = new Map(); // id → frame handler
  worker.onmessage = ({ data: m }) => {
    if (m.type === 'tiles') {
      if (m.ack) opsInFlight = false;
      if (m.tiles.length) {
        paint(ctx, m.tiles);
        for (const t of m.tiles) tileStore.set(`${t.tx},${t.ty}`, t);
        for (const fn of tileListeners) fn(m.tiles);
        notify();
      }
    } else if (m.type === 'reset') {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cleared = [...tileStore.values()].map((t) => ({ tx: t.tx, ty: t.ty, rgba: new Uint8ClampedArray(1024), hf: new Int16Array(1024) }));
      tileStore.clear();
      for (const fn of tileListeners) fn(cleared);
      notify();
    } else if (m.type === 'advanced') {
      advancing = false;
    } else if (m.type === 'frame') {
      players.get(m.id)?.(m);
    } else if (m.type === 'error' && m.id == null) {
      opsInFlight = false; // the batch was answered, with an error
      advancing = false;
      error = m; // the sheet can no longer follow (too much ink): say so where it is used
      notify();
    } else if (m.id != null && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.type === 'error') p.reject(Object.assign(new Error(m.message), { code: m.code, law: m.law }));
      else p.resolve(m);
    }
  };
  worker.postMessage({ type: 'begin', paperKey, family, law });

  // Every frame: send what became final; while the pen is up, dry the sheet up
  // to the moment a new stroke could start (capture promises nothing earlier).
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const ops = capture.drain();
    if (ops.length) {
      queued.push(...ops);
      if (ops.some((o) => o.op === 'undo' || o.op === 'clear')) notify();
    }
    // One batch in flight: if the worker is still busy, this frame's acts wait
    // and go with the next. Messages never queue up behind a slow sheet.
    if (queued.length && !opsInFlight) {
      worker.postMessage({ type: 'ops', ops: queued });
      queued = [];
      opsInFlight = true;
    }
    if (!advancing && !opsInFlight && !queued.length && now - lastAdvanceAt >= ADVANCE_MS) {
      const h = capture.promise();
      if (h !== null && h > lastAdvance) {
        advancing = true;
        lastAdvance = h;
        lastAdvanceAt = now;
        worker.postMessage({ type: 'advance', ms: h });
      }
    }
  };
  raf = requestAnimationFrame(frame);

  return {
    capture,
    canvas,
    get strokes() { return capture.strokes.length; },
    get error() { return error; },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    setPen(p) { capture.setPen(p); },
    undo() {
      const s = capture.undo();
      if (s) lastAdvance = -1;
      notify();
      return s;
    },
    clear() {
      capture.clear();
      lastAdvance = -1;
      error = null;
      notify();
    },
    acts: () => capture.acts(),
    async settle() {
      const acts = capture.acts();
      if (!acts) return null;
      const out = await ask({ type: 'settle', acts });
      return { acts, facts: out.facts, box: out.box, rgba: out.rgba, law: out.law };
    },
    law,
    cut: (x0, y0, x1, y1) => ask({ type: 'cut', x0, y0, x1, y1 }),
    moments() {
      const acts = capture.acts();
      return acts ? ask({ type: 'liveMoments', acts }) : Promise.resolve(null);
    },
    scene(on) {
      if (sceneWanted === !!on) return;
      sceneWanted = !!on;
      worker.postMessage({ type: 'scene', on: sceneWanted });
    },
    onTiles(fn) {
      tileListeners.add(fn);
      return () => tileListeners.delete(fn);
    },
    tiles: () => [...tileStore.values()],
    // The sheet written out again on `target` (a canvas sized like ink.canvas).
    play(target, { speed = 1 } = {}) {
      const acts = capture.acts();
      if (!acts) return null;
      const tctx = target.getContext('2d');
      tctx.clearRect(0, 0, target.width, target.height);
      let id = 0;
      let stopped = false;
      let timer = 0;
      const stop = () => {
        stopped = true;
        cancelAnimationFrame(timer);
        if (id) {
          players.delete(id);
          worker.postMessage({ type: 'stop', id });
        }
      };
      return {
        stop,
        async play(onDone) {
          const started = await ask({ type: 'play', acts, paperKey, family, law });
          if (stopped) return;
          id = started.id;
          const end = started.duration + 1500; // a moment for the last of it to dry
          const t0 = performance.now();
          let inFlight = false;
          players.set(id, (m) => {
            inFlight = false;
            paint(tctx, m.tiles);
            if (m.ms === Infinity) {
              stop();
              onDone?.();
            }
          });
          const step = (now) => {
            if (stopped) return;
            timer = requestAnimationFrame(step);
            if (inFlight) return;
            const ms = (now - t0) * speed;
            inFlight = true;
            worker.postMessage({ type: 'frame', id, ms: ms >= end ? Infinity : ms });
            if (ms >= end) cancelAnimationFrame(timer);
          };
          timer = requestAnimationFrame(step);
        },
      };
    },
    destroy() {
      if (dead) return;
      dead = true;
      cancelAnimationFrame(raf);
      capture.cancel();
      worker.terminate();
      for (const p of pending.values()) p.reject(new Error('closed'));
      pending.clear();
      listeners.clear();
      tileListeners.clear();
    },
  };
}
