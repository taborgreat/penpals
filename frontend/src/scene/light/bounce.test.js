// Light bounces until it stops (light-waves §4 and its tests, "Bounce"): white
// walls give a brighter page than dark walls; it converges within the pass
// limit; corners are darker than the centre; changing one patch's absorption
// changes the result. And the sun's soft-edged patch through the window.
// Flat test spectra only: the real ones come from the other light modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { N } from './axis.js';
import { roomGeometry, formFactors, splitFormFactors } from './room.js';
import { directLight, sunAperture, SUN_RADIUS } from './direct.js';
import { solve, heatOf, MAX_PASSES } from './bounce.js';

const geom = roomGeometry();
const n = geom.patches.length, m = geom.openings.length;
Object.assign(geom, splitFormFactors(formFactors(geom, { positions: 4, directions: 16 }), n, m)); // a light bake: 4096 rays a patch
const [RW, RD, RH] = geom.size;
const ones = new Float64Array(N).fill(1);
const candles = geom.candles.map((c) => ({ pos: [c[0], c[1], c[2] + 0.2], intensity: ones }));
const noon = (() => {
  const el = (68 * Math.PI) / 180;
  return [0, Math.cos(el), Math.sin(el)]; // light.js's noon (az 0), in the room's frame
})();

// absorption per patch by its matter
function absorbing(by) {
  const a = new Float64Array(n * N);
  geom.patches.forEach((p, i) => a.fill(by[p.matter] ?? 0.5, i * N, (i + 1) * N));
  return a;
}
const at = (light, i, b = 5) => light[i * N + b];

test('bounce: white walls give a brighter page than dark walls', () => {
  const src = directLight(geom, { flames: candles });
  const white = solve(geom.patches, geom.F, absorbing({ plaster: 0.15, floor: 0.6, table: 0.6, paper: 0.2 }), src);
  const dark = solve(geom.patches, geom.F, absorbing({ plaster: 0.9, floor: 0.6, table: 0.6, paper: 0.2 }), src);
  assert.ok(at(white.light, geom.page) > at(dark.light, geom.page) * 1.05, `${at(white.light, geom.page)} vs ${at(dark.light, geom.page)}`);
  // the page's direct light is the same; only what came back differs
  assert.equal(src[geom.page * N + 5] > 0, true);
});

test('bounce: converges within the pass limit, white room or dark', () => {
  const src = directLight(geom, { flames: candles });
  for (const a of [0.05, 0.2, 0.5, 0.9]) {
    const r = solve(geom.patches, geom.F, new Float64Array(n * N).fill(a), src);
    assert.ok(r.converged && r.passes < MAX_PASSES, `absorption ${a}: ${r.passes} passes, residual ${r.residual}`);
  }
});

test('bounce: corners darker than the centre (a flame in mid-room), directly and by bounce alone', () => {
  const flame = { pos: [RW / 2, RD / 2, RH / 2], intensity: ones };
  const src = directLight(geom, { flames: [flame] });
  const { light } = solve(geom.patches, geom.F, new Float64Array(n * N).fill(0.3), src);
  // the window's wall is left out: its middle is the opening
  for (const id of ['floor', 'ceiling', 'wall-near', 'wall-left', 'wall-right']) {
    const k = geom.surfaces.findIndex((s) => s.id === id);
    const s = geom.surfaces[k];
    const nu = s.grid.u.length - 1, nv = s.grid.v.length - 1;
    const corners = [[0, 0], [nu - 1, 0], [0, nv - 1], [nu - 1, nv - 1]].map(([u, v]) => s.grid.cells[v * nu + u]);
    const mid = [0, 1, 2].map((q) => s.origin[q] + (s.u[q] * s.size[0]) / 2 + (s.v[q] * s.size[1]) / 2);
    let centre = -1, best = Infinity;
    geom.patches.forEach((p, i) => {
      const d = p.surface === k ? Math.hypot(...p.center.map((v, q) => v - mid[q])) : Infinity;
      if (d < best) [best, centre] = [d, i];
    });
    for (const c of corners) {
      assert.ok(at(light, c) < at(light, centre), `${id}: corner ${c} not darker`);
      assert.ok(at(light, c) - at(src, c) < at(light, centre) - at(src, centre), `${id}: corner ${c} gets more bounce than the centre`);
    }
  }
});

test('bounce: changing one patch\'s absorption changes the result', () => {
  const src = directLight(geom, { flames: candles });
  const abs = absorbing({ plaster: 0.2, floor: 0.6, table: 0.6, paper: 0.2 });
  const before = solve(geom.patches, geom.F, abs, src).light;
  // ink on one patch of the far wall, behind the candles, drinking the reds
  const wall = geom.patches.findIndex((p) => geom.surfaces[p.surface].id === 'wall-far' && p.center[2] < geom.window.z0);
  const inked = Float64Array.from(abs);
  for (let b = 10; b < N; b++) inked[wall * N + b] = 0.95;
  const after = solve(geom.patches, geom.F, inked, src).light;
  assert.ok(at(after, geom.page, 14) < at(before, geom.page, 14), 'the page gets less red');
  assert.ok(Math.abs(at(after, geom.page, 2) - at(before, geom.page, 2)) < 1e-3 * at(before, geom.page, 2), 'and about the same blue');
});

test('bounce: light is conserved: what comes in is drunk or leaves by the window', () => {
  const src = directLight(geom, { flames: candles });
  const abs = absorbing({ plaster: 0.2, floor: 0.6, table: 0.6, paper: 0.2 });
  const { light } = solve(geom.patches, geom.F, abs, src, { threshold: 1e-7 });
  const heat = heatOf(light, abs, geom.patches);
  let input = 0, drunk = 0, out = 0;
  for (let i = 0; i < n; i++) {
    drunk += heat[i];
    for (let b = 0; b < N; b++) {
      input += geom.patches[i].area * src[i * N + b];
      let w = 0;
      for (let k = 0; k < m; k++) w += geom.W[i * m + k];
      out += geom.patches[i].area * (1 - abs[i * N + b]) * light[i * N + b] * w;
    }
  }
  assert.ok(Math.abs(drunk + out - input) / input < 0.02, `in ${input}, drunk ${drunk}, out ${out}`);
});

test('solve is general: any patches and bins, exact for two facing patches', () => {
  // two patches that see each other with factor f: H1 = (E1 + f·ρ2·E2) / (1 − f²·ρ1·ρ2)
  const f = 0.375, bins = 3; // exact in float32
  const F = Float32Array.from([0, f, f, 0]);
  const rho = [0.8, 0.5];
  const absorption = Float64Array.from({ length: 2 * bins }, (_, k) => 1 - rho[Math.floor(k / bins)]);
  const E = Float64Array.from([1, 2, 3, 0, 0, 0]);
  const r = solve(2, F, absorption, E, { threshold: 1e-12 });
  for (let b = 0; b < bins; b++) {
    const h1 = E[b] / (1 - f * f * rho[0] * rho[1]);
    assert.ok(Math.abs(r.light[b] - h1) < 1e-9);
    assert.ok(Math.abs(r.light[bins + b] - f * rho[0] * h1) < 1e-9);
  }
  assert.throws(() => solve(3, F, absorption, E));
  assert.equal(solve(2, F, absorption, new Float64Array(2 * bins)).passes, 0, 'no light, no passes');
});

test('the sun through the window: none at night or from behind the wall; the noon patch lies on the table near the window, soft-edged', () => {
  const [cx] = [RW / 2];
  const onTable = (fromWall) => [cx, RD - fromWall, geom.table.top + 1e-6];
  assert.equal(sunAperture(geom, onTable(0.3), [0, Math.cos(0.3), -Math.sin(0.3)]), 0, 'below the horizon');
  assert.equal(sunAperture(geom, onTable(0.3), [0, -0.5, 0.866]), 0, 'behind the wall');
  assert.ok(sunAperture(geom, onTable(0.3), noon) > 0.999, 'lit near the window');
  assert.equal(sunAperture(geom, onTable(0.7), noon), 0, 'not at the table\'s near edge');
  // across the beam's edge at the window's head the light falls off over a penumbra, not a step
  const head = (geom.window.z1 - geom.table.top) / Math.tan((68 * Math.PI) / 180); // where the head's shadow falls
  const STEP = 0.0005;
  const steps = Array.from({ length: 81 }, (_, k) => sunAperture(geom, onTable(head - 0.02 + k * STEP), noon));
  assert.ok(steps[0] > 0.999 && steps.at(-1) < 0.001, `${steps[0]} … ${steps.at(-1)}`);
  const soft = steps.filter((v) => v > 0.02 && v < 0.98);
  assert.ok(soft.length >= 5, `edge ${soft.length} steps wide`);
  for (let k = 1; k < steps.length; k++) assert.ok(steps[k] <= steps[k - 1] + 1e-12, 'falls off monotonically');
  // the penumbra grows with the distance to the window's head and the sun's size
  const dist = head / Math.cos((68 * Math.PI) / 180);
  assert.ok(soft.length * STEP > dist * SUN_RADIUS && soft.length * STEP < 8 * dist * SUN_RADIUS, `${soft.length * STEP} m for ${dist * SUN_RADIUS}`);
});

test('direct light: the noon sun lands on the table by the window, not under the table; the sky comes in through the openings', () => {
  const sky = (d) => new Float64Array(N).fill(d[2] > 0 ? 1 : 0.2);
  const E = directLight(geom, { sunDir: noon, sun: ones, outside: sky });
  const byWindow = geom.patches.findIndex((p) => p.kind === 'table' && p.normal[2] > 0 && p.center[1] > RD - 0.3 && Math.abs(p.center[0] - RW / 2) < 0.3);
  const underTable = geom.patches.findIndex((p) => p.kind === 'floor' && p.center[1] > geom.table.y0 && Math.abs(p.center[0] - RW / 2) < 0.3);
  assert.ok(byWindow >= 0 && underTable >= 0);
  const sunOnly = directLight(geom, { sunDir: noon, sun: ones });
  assert.ok(at(sunOnly, byWindow) > 0.3, `table by the window: ${at(sunOnly, byWindow)}`);
  assert.equal(at(sunOnly, underTable), 0);
  assert.equal(at(E, underTable), 0, 'the slab hides the window from the floor under the table');
  const inFront = geom.patches.findIndex((p) => p.kind === 'floor' && p.center[1] < geom.table.y0 && p.center[1] > geom.table.y0 - 0.6 && Math.abs(p.center[0] - RW / 2) < 0.3);
  assert.ok(at(E, inFront) > 0 && at(sunOnly, inFront) === 0, 'the floor in front of the table sees the sky, not the noon sun');
  assert.ok(at(E, byWindow) > at(sunOnly, byWindow));
  const night = directLight(geom, { sunDir: [0, 0.5, -0.86], sun: ones });
  assert.ok(night.every((v) => v === 0));
});
