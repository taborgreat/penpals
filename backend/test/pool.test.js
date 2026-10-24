import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPool } from '../src/render/pool.js';
import { fixtureBytes, testPaperKey } from 'penpals-law/tools/fixtures';

const GOLDENS = JSON.parse(fs.readFileSync(new URL('../../law/fixtures/goldens.json', import.meta.url), 'utf8'));
const family = { grain: 8, weight: 8, tooth: 0 };
const job = (name, scale = 64) => ({ acts: fixtureBytes(name).bytes, paperKey: testPaperKey('golden'), family, scale, png: false });
const base = { queue: { upload: 4, view: 4, warm: 4 }, timeoutMs: { book: 30000, letter: 60000 }, heapMb: 256, maxCells: 4_000_000 };

test('inline and in workers, the pool grows exactly the goldens', async () => {
  for (const workers of [0, 2]) {
    const pool = createPool({ ...base, workers });
    try {
      const names = ['hairline', 'dwell', 'mixWet'];
      const outs = await Promise.all(names.map((n) => pool.run(job(n), { priority: 'upload' })));
      outs.forEach((o, i) => {
        assert.equal(o.facts, GOLDENS.fixtures[`${names[i]}@64`].facts, `${names[i]} with ${workers} workers`);
        assert.deepEqual(o.box, GOLDENS.fixtures[`${names[i]}@64`].box);
      });
      const scaled = await pool.run(job('hairline', 40));
      assert.equal(scaled.facts, GOLDENS.fixtures['hairline@40'].facts);
    } finally {
      await pool.close();
    }
  }
});

test('the same job in flight is run once', async () => {
  const pool = createPool({ ...base, workers: 1 });
  try {
    const a = pool.run(job('hairline'), { key: 'k' });
    const b = pool.run(job('hairline'), { key: 'k' });
    assert.equal(a, b);
    await a;
    assert.equal(pool.stats().inflight, 0);
  } finally {
    await pool.close();
  }
});

test('a full queue answers 503 with a Retry-After; bad acts answer 400', async () => {
  const pool = createPool({ ...base, workers: 1, queue: { upload: 1, view: 1, warm: 1 } });
  try {
    const first = pool.run(job('dwell'), { priority: 'view' }); // taken by the worker at once
    const second = pool.run(job('dwell'), { priority: 'view' }); // waits
    await assert.rejects(pool.run(job('dwell'), { priority: 'view' }), (e) => e.status === 503 && e.code === 'busy' && e.retryAfter >= 1);
    await Promise.all([first, second]);
    const bad = new Uint8Array(job('hairline').acts);
    bad[bad.length - 1] ^= 0x80; // no longer canonical
    await assert.rejects(pool.run({ ...job('hairline'), acts: bad }), (e) => e.status === 400 || e.status === 413);
  } finally {
    await pool.close();
  }
});

test('a job past its time is stopped, its worker replaced, and the next job runs', async () => {
  const pool = createPool({ ...base, workers: 1 });
  try {
    await assert.rejects(pool.run(job('dwell'), { timeout: 1 }), (e) => e.status === 503 && e.code === 'render_timeout');
    const next = await pool.run(job('hairline'));
    assert.equal(next.facts, GOLDENS.fixtures['hairline@64'].facts);
  } finally {
    await pool.close();
  }
});
