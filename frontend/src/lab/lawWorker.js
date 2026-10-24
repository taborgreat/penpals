// Grows law fixtures in a worker (dev page /law-check): the look, its digests,
// and how long it took, so the browser's result can be compared with Node's
// (law/browser/cases.js: the same code on both sides).
import { growCase } from 'penpals-law/browser/cases';

self.onmessage = ({ data }) => {
  const { name, seed = 'tuning' } = data;
  try {
    const t0 = performance.now();
    const r = growCase(name, seed);
    const ms = performance.now() - t0;
    const { box, rgb, ticks } = r;
    const facts = `${r.facts}/${r.viewed}`;
    self.postMessage({ name, box, rgb, facts, ms, ticks }, [rgb.buffer]);
  } catch (err) {
    self.postMessage({ name, error: err.message });
  }
};
