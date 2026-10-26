// Gravity (rooms.md §3b, Tests): a drip lands on the first surface straight below it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { landing, wickOf, cornerOf } from './drops.js';
import { roomGeometry, ROOM, PX_PER_M } from '../scene/light/index.js';

test('a drip lands on the first surface straight below it: a paper lying there, the table, the floor', () => {
  const geom = roomGeometry(ROOM);
  const t = geom.table;
  // a paper lying on the table, its middle at (mx, my): its units run along +x, and down its face along −y
  const [mx, my] = [(t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2];
  const papers = [{ paper: 'abc', at: [mx, my, t.top].map((v) => Math.round(v * 1000)), size: [800, 600] }];
  const [cx, cy] = cornerOf(papers[0].at, papers[0].size);
  const onPaper = landing(geom, [cx + 400 / PX_PER_M, cy - 360 / PX_PER_M], { papers });
  assert.equal(onPaper.on, 'paper');
  assert.equal(onPaper.paper, 'abc');
  assert.ok(Math.abs(onPaper.q.x - 400) < 1e-6 && Math.abs(onPaper.q.y - 360) < 1e-6, 'at the point under it, on the paper');
  const beside = [t.x0 + 0.01, t.y0 + 0.01];
  assert.deepEqual([landing(geom, beside, { papers }).on, landing(geom, beside, { papers }).z], ['table', t.top]);
  // a paper on the floor catches what falls past the table's edge onto it
  const floorPaper = [{ paper: 'f', at: [300, 300, 0], size: [800, 600] }];
  assert.equal(landing(geom, [0.3, 0.3], { papers: floorPaper }).on, 'paper');
  const off = landing(geom, [0.2, 0.2], { papers });
  assert.deepEqual([off.on, off.z], ['floor', 0]);
  // tilted, the wick leans over: its drips fall from beside the foot
  const w = wickOf([1, 1, 0.74], 0.1, 90);
  assert.ok(Math.abs(w[0] - 1.1) < 1e-9 && Math.abs(w[2] - 0.74) < 1e-9);
});
