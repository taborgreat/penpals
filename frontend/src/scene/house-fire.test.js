// The house-fire test (one-matter.md Phase 8): knock the lit candle over, nothing else. What follows
// comes only from the table of matter and its rules (law/heat.js): no fire code, no burn timer, no
// special case. The desk is built from the room (scene/light/room.js: the table, the page, the two
// candles in their brass holders), the candles as the candle law has them after half an hour alight
// (law/candle.js: their height, their pools). The one act: the left candle knocked over, by a hand carrying
// the other into it (room acts; where each comes to rest is law/bodies.js's, by their matter and shape):
// the hand takes up the right candle, goes round behind the left one, and pushes it toward the page until
// it goes over; then it sets the right one back in its place. The fallen candle lies the way the law laid
// it, its foot at its holder's rim (the holder stays where it stood); its pool spills where its top was.
//
// Either result passes: if the heat where a holder sits passed metal's melting point, that metal is a
// puddle where it ran; if not, it is still a holder. The test reports the highest heat each reached.
// It runs HOUSE_FIRE_S seconds of the fire (30 by default; the longer runs are for the report).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeat, heatOf } from 'penpals-law/heat';
import { MATTER, AIR } from 'penpals-law/matter';
import * as Cn from 'penpals-law/candle';
import { roomGeometry, ROOM, HOLDER } from './light/room.js';
import { bodiesAfter } from '../room/carry.js';

const DX = 0.01; // m: the heat rule's grain here (a resolution: finer is truer and dearer)
const SECONDS = Number(process.env.HOUSE_FIRE_S ?? 30);

function desk() {
  const { CANDLE } = Cn;
  const g = roomGeometry(ROOM);
  const cd = Cn.newCandle();
  for (let s = 0; s < 1800; s++) Cn.stepCandle(cd, { lit: true });
  const L = Cn.heightOf(cd),
    pool = Cn.liquidOf(cd);
  // the box about the candles and the page, from under the table's top to above the standing flame
  const X0 = 1.28,
    Y0 = 2.72,
    Z0 = g.table.bottom;
  const [nx, ny, nz] = [Math.round(0.5 / DX), Math.round(0.24 / DX), Math.round(0.33 / DX)];
  const at = (i, o) => o + (i + 0.5) * DX;
  const top = g.table.top,
    pg = g.pageRect;
  const [c0, c1] = g.candles;
  const R = CANDLE.radius,
    W = CANDLE.wick;
  const wickFill = (Math.PI * CANDLE.wickRadius ** 2) / (DX * DX);
  // the act: the right candle carried round behind the left, into it toward the page, and back to its place
  const t0 = Date.UTC(2026, 9, 25, 20);
  let k = 0;
  const line = (a) => ({ at: new Date(t0 + ++k * 1000).toISOString(), act: { kind: 'room', by: 'tabor', ...a } });
  const mm = (p) => p.map((v) => Math.round(v * 1000));
  const carry = (p) => line({ act: 'tilt', thing: 'candle-1', pos: mm(p), deg: 0 });
  const hand = top + 0.01;
  const B = bodiesAfter([
    line({ act: 'place', thing: 'candle-1', to: null }),
    ...[
      [c1[0], 3.05],
      [c0[0] - 0.14, 3.05],
      [c0[0] - 0.14, c0[1]],
      [c0[0] + 0.05, c0[1]],
    ].map(([x, y]) => carry([x, y, hand])),
    ...[
      [c0[0] - 0.14, c0[1]],
      [c0[0] - 0.14, 3.05],
      [c1[0], 3.05],
      [c1[0], c1[1]],
    ].map(([x, y]) => carry([x, y, hand])),
    line({ act: 'place', thing: 'candle-1', to: mm([c1[0], c1[1], hand]) }),
  ]);
  const fell = B['candle-0'],
    stood = B['candle-1'];
  assert.ok(fell.lying, 'the left candle went over');
  assert.ok(!stood.lying && Math.abs(stood.at[0] - c1[0]) < 1e-3, 'the right one stands in its place again');
  assert.deepEqual(fell.lying, [1, 0], 'toward the page: the way it was pushed');
  const rim = fell.at[0]; // (its foot, at its holder's rim: the holder stays where it stood)
  const fallen = { x0: rim, x1: rim + L, y: fell.at[1], z: top + DX + R, holder: [rim - HOLDER.radius, fell.at[1]] };
  const standing = { x: stood.at[0], y: stood.at[1], z0: top + HOLDER.height, z1: top + HOLDER.height + L };
  const near = (a, b) => Math.abs(a - b) < DX / 2;
  function cellAt(ix, iy, iz) {
    const x = at(ix, X0),
      y = at(iy, Y0),
      z = at(iz, Z0);
    if (z < top) return 'wood';
    for (const c of [fallen.holder, [standing.x, standing.y]])
      if ((x - c[0]) ** 2 + (y - c[1]) ** 2 <= HOLDER.radius ** 2 && z < top + HOLDER.height) return ['metal', Math.min(1, (top + HOLDER.height - (z - DX / 2)) / DX)];
    if (z < top + DX && x >= pg.x0 && x <= pg.x1 && y >= pg.y0 && y <= pg.y1) return ['paper', MATTER.paper.ink.thickness / 1e6 / DX];
    if (near(y, fallen.y) && near(z, fallen.z) && x >= fallen.x0 && x <= fallen.x1 + W) return ['wick', wickFill];
    if (Math.hypot(y - fallen.y, z - fallen.z) <= R + DX / 2 && x >= fallen.x0 && x <= fallen.x1) return 'wax';
    if (near(x, standing.x) && near(y, standing.y) && z >= standing.z0 && z <= standing.z1 + W) return ['wick', wickFill];
    if (Math.hypot(x - standing.x, y - standing.y) <= R + DX / 2 && z >= standing.z0 && z <= standing.z1) return 'wax';
    return null;
  }
  const h = createHeat({ size: [nx, ny, nz], dx: DX, dt: DX, cellAt, open: true });
  // the wicks waxed (their pores full), their ends alight; each pool molten about its wick's foot
  const ign = (MATTER.wax.heat.burns - AIR.temp) * 1000;
  const melt = (MATTER.wax.heat.melts - AIR.temp) * 1000;
  const holders = [[], []];
  const ends = [];
  for (let iz = 0; iz < nz; iz++)
    for (let iy = 0; iy < ny; iy++)
      for (let ix = 0; ix < nx; ix++) {
        const i = h.index(ix, iy, iz);
        const c = h.at(ix, iy, iz);
        const x = at(ix, X0),
          z = at(iz, Z0);
        if (c.matter === 'metal') holders[Math.abs(x - fallen.holder[0]) < Math.abs(x - standing.x) ? 0 : 1].push(i);
        if (c.matter !== 'wick') continue;
        h.soak(i, 'wax', Math.floor((c.m * MATTER.wick.pores * MATTER.wax.density) / (MATTER.wick.density * 1000)));
        if ((x < standing.x - R && x > fallen.x1) || (Math.abs(x - standing.x) < DX && z > standing.z1)) {
          h.heat(i, Math.round(((c.m * MATTER.wick.heat.holds + h.cells.held[i] * MATTER.wax.heat.holds) * ign) / 1000) - h.cells.E[i]);
          ends.push([ix, iy, iz, x > fallen.x1 && x < standing.x - R]);
        }
      }
  for (const [ex, ey, ez, isFallen] of ends) {
    const [fx, fy, fz] = isFallen ? [ex - 1, ey, ez] : [ex, ey, ez - 1];
    const cells = [];
    for (const [ax, ay, az] of [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ])
      if (h.at(fx + ax, fy + ay, fz + az).matter === 'wax') cells.push(h.index(fx + ax, fy + ay, fz + az));
    for (const i of cells) {
      const m = h.cells.m[i];
      h.heat(i, heatOf(MATTER.wax, m, melt) + Math.min(m, Math.floor(pool / cells.length)) * MATTER.wax.heat.fuses - h.cells.E[i]);
    }
    const f = h.index(fx, fy, fz);
    const c = h.at(fx, fy, fz);
    h.heat(f, Math.round(((c.m * MATTER.wick.heat.holds + c.held * MATTER.wax.heat.holds) * melt) / 1000) - c.E);
  }
  return { h, holders, ends };
}

test('the house fire: the lit candle knocked over, nothing else; the table of matter and its rules decide', { timeout: 3600000 }, () => {
  const { h, holders, ends } = desk();
  const made = h.total();
  const holderMass = holders.map((l) => l.reduce((n, i) => n + h.cells.m[i], 0));
  const steps = Math.round(SECONDS / DX);
  let fallenFor = 0;
  for (let s = 1; s <= steps; s++) {
    h.step();
    if (h.at(...ends.find((e) => e[3]).slice(0, 3)).burning) fallenFor = s * DX;
  }
  const now = h.total();
  // nothing made or lost: what was there is what is there, what went up as smoke, and what rose away
  assert.ok(Math.abs(now.matter + now.smoke + h.vented.smoke - made.matter) <= made.matter * 1e-9, `${now.matter + now.smoke + h.vented.smoke} of ${made.matter} µg`);
  // each holder: past metal's melting point, a puddle; short of it, still a holder, all its metal there
  const meltMK = (MATTER.metal.heat.melts - AIR.temp) * 1000;
  const peaks = holders.map((l) => Math.max(...l.map((i) => h.peak[i])));
  peaks.forEach((p, k) => {
    if (p < meltMK)
      assert.equal(
        holders[k].reduce((n, i) => n + (h.cells.mat[i] === h.cells.mat[holders[k][0]] ? h.cells.m[i] : 0), 0),
        holderMass[k],
        `holder ${k} is still a holder`,
      );
    else assert.ok((now.by.metal ?? 0) > 0, `holder ${k} ran (its metal is a puddle somewhere)`);
  });
  const paper = (now.by.paper ?? 0) / 1e6,
    wood = (made.by.wood - (now.by.wood ?? 0)) / 1e6;
  console.log(
    `house fire, ${SECONDS} s: the fallen candle burnt ${fallenFor.toFixed(1)} s; the page ${paper < 0.001 ? 'burnt to ash' : `${paper.toFixed(3)} g left of ${(made.by.paper / 1e6).toFixed(3)} g`}; the table lost ${wood.toFixed(3)} g; ` +
      `the holders reached ${peaks.map((p) => (p / 1000 + AIR.temp).toFixed(1)).join(' °C and ')} °C (metal melts at ${MATTER.metal.heat.melts} °C)`,
  );
});
