// A render worker: runs jobs from the pool, one at a time.
import { parentPort } from 'node:worker_threads';
import { runJob } from './job.js';

parentPort.on('message', ({ id, job }) => {
  try {
    const out = runJob(job);
    parentPort.postMessage({ id, ok: true, out }, out.png ? [out.png.buffer] : []);
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: { message: err.message, code: err.code ?? null, law: !!err.law } });
  }
});
