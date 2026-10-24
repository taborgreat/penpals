// Grows law fixtures in a worker (dev page /law-check): the look, its digest,
// and how long it took, so the browser's result can be compared with Node's.
import { fixtureBytes, testPaperKey } from 'penpals-law/tools/fixtures';
import { grow } from 'penpals-law/v1/sim';
import { settledCells, boxOf, lookRGB, factsDigest } from 'penpals-law/v1/look';
import { hex } from 'penpals-law/tags';

const family = { grain: 8, weight: 8, tooth: 0 };

self.onmessage = ({ data }) => {
  const { name, seed = 'tuning' } = data;
  try {
    const { bytes, rec } = fixtureBytes(name);
    const t0 = performance.now();
    const res = grow(rec, { paperKey: testPaperKey(seed), family });
    const ms = performance.now() - t0;
    const cells = settledCells(res.tiles);
    const box = boxOf(cells);
    const rgb = lookRGB(cells, box);
    const facts = hex(factsDigest({ cells, box, actsBytes: bytes, family }));
    self.postMessage({ name, box, rgb, facts, ms, ticks: res.ticks }, [rgb.buffer]);
  } catch (err) {
    self.postMessage({ name, error: err.message });
  }
};
