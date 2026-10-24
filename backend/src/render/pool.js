// The render pool (plan Part 3): worker threads that grow sheets, so the ink
// physics never runs on the server's main thread.
//   - three queues, served in order: upload (a writer waiting on their sealed
//     record being checked) > view (a visitor waiting on a look) > warm (cache filling)
//   - identical jobs already in flight are shared, not run twice
//   - each job has a wall-clock limit; a worker past it is terminated and replaced
//   - a full queue answers 503 with a Retry-After, never an unbounded wait
// workers = 0 runs jobs inline on the main thread (tests).
import { Worker } from 'node:worker_threads';
import { runJob } from './job.js';
import { httpError } from '../files.js';

const PRIORITIES = ['upload', 'view', 'warm'];

function lawToHttp(e) {
  if (!e.law) return httpError(500, 'render_failed', 'The ink could not be rendered.');
  if (e.code === 'cost' || e.code === 'domain') return httpError(413, 'too_much_ink', e.message);
  return httpError(400, 'bad_acts', e.message);
}

export function createPool({ workers, queue: caps, timeoutMs, heapMb, maxCells }) {
  const inflight = new Map(); // key → promise
  let avgMs = 300;
  const finish = (ms) => {
    avgMs = avgMs * 0.8 + ms * 0.2;
  };

  if (workers === 0) {
    return {
      run(job, { key } = {}) {
        if (key && inflight.has(key)) return inflight.get(key);
        const t0 = Date.now();
        const p = Promise.resolve().then(() => {
          try {
            return runJob({ ...job, maxCells });
          } catch (err) {
            throw lawToHttp({ law: !!err.law, code: err.code, message: err.message });
          } finally {
            finish(Date.now() - t0);
            if (key) inflight.delete(key);
          }
        });
        if (key) inflight.set(key, p);
        return p;
      },
      stats: () => ({ workers: 0, queued: 0, inflight: inflight.size }),
      close: async () => {},
    };
  }

  const queues = { upload: [], view: [], warm: [] };
  const slots = [];
  let nextId = 1;
  let closed = false;

  function spawn(i) {
    const w = new Worker(new URL('./worker.js', import.meta.url), { resourceLimits: { maxOldGenerationSizeMb: heapMb } });
    const slot = { w, job: null, timer: null };
    w.on('message', (msg) => {
      const job = slot.job;
      if (!job || msg.id !== job.id) return;
      clearTimeout(slot.timer);
      slot.job = null;
      finish(Date.now() - job.started);
      if (msg.ok) job.resolve(msg.out);
      else job.reject(lawToHttp(msg.error));
      pump();
    });
    const lost = (why) => {
      if (slots[i] !== slot) return;
      const job = slot.job;
      clearTimeout(slot.timer);
      slot.job = null;
      if (job) job.reject(httpError(503, 'render_failed', why));
      if (!closed) slots[i] = spawn(i);
      pump();
    };
    w.on('error', (err) => lost(`render worker failed: ${err.message}`));
    w.on('exit', (code) => {
      if (code !== 0 && !closed) lost('render worker stopped');
    });
    w.unref();
    return slot;
  }
  for (let i = 0; i < workers; i++) slots.push(spawn(i));

  function pump() {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot.job) continue;
      const pr = PRIORITIES.find((p) => queues[p].length);
      if (!pr) return;
      const job = queues[pr].shift();
      slot.job = job;
      job.started = Date.now();
      slot.timer = setTimeout(() => {
        // Past its time: kill the worker (the only way to stop a running sim) and replace it.
        const j = slot.job;
        slot.job = null;
        slots[i] = closed ? slot : spawn(i);
        slot.w.terminate().catch(() => {});
        j?.reject(httpError(503, 'render_timeout', 'Rendering took too long; try again later.'));
        pump();
      }, job.timeout);
      slot.w.postMessage({ id: job.id, job: { ...job.payload, maxCells } });
    }
  }

  return {
    run(payload, { key, priority = 'view', timeout = timeoutMs.book } = {}) {
      if (closed) return Promise.reject(httpError(503, 'busy', 'Shutting down.'));
      if (key && inflight.has(key)) return inflight.get(key);
      const q = queues[priority];
      if (q.length >= caps[priority]) {
        const waiting = PRIORITIES.reduce((s, p) => s + queues[p].length, 0);
        const err = httpError(503, 'busy', 'The ink press is busy; try again in a moment.');
        err.retryAfter = Math.max(1, Math.min(10, Math.ceil((waiting * avgMs) / Math.max(1, workers) / 1000)));
        return Promise.reject(err);
      }
      const p = new Promise((resolve, reject) => q.push({ id: nextId++, payload, resolve, reject, timeout }));
      if (key) {
        inflight.set(key, p);
        p.then(
          () => inflight.delete(key),
          () => inflight.delete(key),
        );
      }
      pump();
      return p;
    },
    stats: () => ({ workers, queued: PRIORITIES.reduce((s, p) => s + queues[p].length, 0), inflight: inflight.size }),
    async close() {
      closed = true;
      for (const p of PRIORITIES) for (const j of queues[p].splice(0)) j.reject(httpError(503, 'busy', 'Shutting down.'));
      await Promise.all(slots.map((s) => s.w.terminate().catch(() => {})));
    },
  };
}
