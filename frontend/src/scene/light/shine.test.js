// Shine comes from the surface (matter-fixes §5): no gloss of its own, no wet flag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROUGH, F0, glint, beckmann, sourceM2, scatterOf, f0OfKind, slopeVariance, PAPER_SUB } from './shine.js';
import { BRASS, BOARD, PLASTER, WAX, cellFace, DROP_PX, CELL_PX } from './surface.js';

const unit = (a) => {
  const l = Math.hypot(...a);
  return a.map((v) => v / l);
};
const rad = (deg) => (deg * Math.PI) / 180;
// The eye above a flat surface looking at the flame's mirror image, turned `off` degrees from it.
function seen(m2, f0, off = 0, flame = { r: 0.0175, d: 0.3 }) {
  const n = [0, 0, 1];
  const l = unit([Math.sin(rad(40)), 0, Math.cos(rad(40))]);
  const v = unit([-Math.sin(rad(40 + off)), 0, Math.cos(rad(40 + off))]);
  return glint(n, v, l, m2 + sourceM2(flame.r, flame.d), f0);
}
const halfWidth = (m2, f0) => {
  const peak = seen(m2, f0, 0);
  let a = 0;
  while (a < 80 && seen(m2, f0, a) > peak / 2) a += 0.1;
  return a;
};

test('under one candle, brass shows a small bright highlight and wood a broad faint one', () => {
  const brass = ROUGH[BRASS].m2,
    wood = ROUGH[BOARD].m2;
  assert.equal(f0OfKind(BRASS), null, 'brass is a metal: what it turns back is its colour');
  const brassPeak = seen(brass, 0.6), // (its colour's reflectance, about)
    woodPeak = seen(wood, f0OfKind(BOARD));
  assert.ok(brassPeak > 20 * woodPeak, `brass ${brassPeak.toFixed(2)}, wood ${woodPeak.toFixed(3)}`);
  assert.ok(halfWidth(brass, 0.6) < halfWidth(wood, f0OfKind(BOARD)) / 2, `half widths ${halfWidth(brass, 0.6).toFixed(1)}°, ${halfWidth(wood, 0.04).toFixed(1)}°`);
  // troweled plaster: nothing to see
  assert.ok(seen(ROUGH[PLASTER].m2, F0.plaster) < woodPeak, 'plaster is matter-of-fact matte');
  // the faces' scatter is read from each kind's own grower: polished brass, then poured wax, grown wood, troweled plaster
  assert.ok(ROUGH[BRASS].m2 < ROUGH[WAX].m2 && ROUGH[WAX].m2 < ROUGH[BOARD].m2 && ROUGH[BOARD].m2 < ROUGH[PLASTER].m2);
});

test('a wet bead glints and its glint fades as it dries, by its heights alone (no flag)', () => {
  const w = 5;
  const n = w * w;
  // the paper's fibers: rough relief, cell to cell (page px)
  const detail = Float64Array.from({ length: n }, (_, k) => 0.35 * (0.2 + 0.4 * (((k * 7919) % 13) / 13)));
  const flat = new Float64Array(n);
  // wet: a bead's water standing high over the fibers, a smooth dome
  const bead = Float64Array.from({ length: n }, (_, k) => 400 - 4 * (((k % w) - 2) ** 2 + (Math.floor(k / w) - 2) ** 2));
  const wet = scatterOf(flat, bead, detail, w);
  // dry: what is left on top is a thin film, lower than the fibers
  const film = new Float64Array(n).fill(3);
  const dry = scatterOf(flat, film, detail, w);
  assert.ok(wet < dry / 5, `wet ${wet.toFixed(4)}, dry ${dry.toFixed(4)}`);
  assert.ok(seen(wet, F0.paper) > 5 * seen(dry, F0.paper), 'the bead glints; dried into the fibers, it is matte');
  assert.ok(dry >= PAPER_SUB, 'dry, the fibers are the top: their own scatter below a cell is there too');
});

test('a lobe turns back the same share however wide (zoomed out, no shimmer and no highlight popping)', () => {
  // Beckmann's faces cover the surface once: ∫ D(h) (n·h) dω = 1, for any scatter
  for (const m2 of [0.002, 0.02, 0.2, 1]) {
    let sum = 0;
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const th = ((i + 0.5) / N) * (Math.PI / 2);
      sum += beckmann(Math.cos(th), m2) * Math.cos(th) * Math.sin(th) * 2 * Math.PI * (Math.PI / 2 / N);
    }
    assert.ok(Math.abs(sum - 1) < 0.02, `m² ${m2}: ${sum.toFixed(3)}`);
  }
  // up close each cell is its own face; far away its faces widen the lobe: the mean of the first
  // over many cells is the second (within what sampling gives)
  const k = DROP_PX / CELL_PX;
  const faces = [];
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++) {
      const [du, dv] = cellFace(BOARD, 0x5eed, 1000 + x, 1000 + y);
      faces.push(unit([-du * k, -dv * k, 1]));
    }
  const own = slopeVariance(Float64Array.from(faces, (f) => f[0]), 48); // (a check that the faces do vary)
  assert.ok(own > 0);
  const near = (off) => faces.reduce((t, n) => t + glint(n, unit([-Math.sin(rad(40 + off)), 0, Math.cos(rad(40 + off))]), unit([Math.sin(rad(40)), 0, Math.cos(rad(40))]), ROUGH[BOARD].sub + sourceM2(0.0175, 0.3), 0.045), 0) / faces.length;
  for (const off of [0, 5, 15]) {
    const far = seen(ROUGH[BOARD].m2, 0.045, off);
    assert.ok(Math.abs(near(off) - far) < 0.25 * far + 1e-3, `${off}°: near ${near(off).toFixed(4)}, far ${far.toFixed(4)}`);
  }
});
