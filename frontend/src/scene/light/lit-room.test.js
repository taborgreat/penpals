// The modules together, as the integration will run them (cleanup-and-speed
// §7): the baked room (public/room, from scripts/room.mjs) lit by the real sun,
// sky and candles, each patch drinking by its own matter, settled by the bounce,
// seen by the eye.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { N } from './axis.js';
import { sunLight, toward, sunPlace, NOON_EL } from './air.js';
import { outsideAt } from './outside.js';
import { CMF, MATTER } from './curves.js';
import { xyzOf, LUMENS } from './color.js';
import { paperCurve, grownCurve, patchAbsorption, pageCurve } from './matter.js';
import { candleState, flameLight, NEW_CANDLE } from './candle.js';
import { settledOn, toScreen } from './eye.js';
import { decodeRoom, roomGeometry, formFactors, encodeRoom, ROOM } from './room.js';
import { directLight, sunAperture } from './direct.js';
import { solve, heatOf } from './bounce.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const baked = path.join(here, '..', '..', '..', 'public', 'room');
// the site's own bake when it is there (npm run room), else one made here
const room = fs.existsSync(path.join(baked, 'room.ff'))
  ? decodeRoom(fs.readFileSync(path.join(baked, 'room.json'), 'utf8'), new Uint8Array(fs.readFileSync(path.join(baked, 'room.ff'))))
  : (() => {
    const g = roomGeometry(ROOM);
    const { json, bin } = encodeRoom(g, formFactors(g, { positions: 4, directions: 16 }));
    return decodeRoom(json, bin);
  })();
const PLAIN = [0xf7, 0xf3, 0xea];
const paper = paperCurve(PLAIN);
const curveOf = (page) => (p) => (p.matter === 'paper' ? page : p.matter === 'plaster' ? grownCurve('plaster', 96) : grownCurve(p.matter, 128));
const absorption = (page = paper) => patchAbsorption(room.patches, curveOf(page));
const of = (light, i) => light.slice(i * N, (i + 1) * N);
const lum = (s) => xyzOf(s, CMF, LUMENS)[1];
const radiance = (E, R) => E.map((v, b) => (v * R[b]) / Math.PI);

function day(hour) {
  const { az, el } = sunPlace(new Date(2026, 5, 21, hour));
  const sunDir = toward(az, el);
  return { sunDir, sun: sunLight(el), outside: outsideAt(sunDir), glass: MATTER.glass };
}
const flames = (t = 0) => room.candles.map((c, which) => {
  const s = candleState(NEW_CANDLE, t, { which });
  return { pos: [c[0], c[1], c[2] + s.flameAt], intensity: flameLight(s) };
});
const settle = (sources, page) => solve(room.patches, room.F, absorption(page), directLight(room, sources));

test('the lit room: noon fills the page with daylight, night leaves it to the candles, warm', () => {
  const noon = settle(day(12));
  const night = settle({ flames: flames() });
  assert.ok(noon.converged && night.converged, `passes ${noon.passes}, ${night.passes}`);
  const page = (r) => lum(radiance(of(r.light, room.page), paper));
  assert.ok(page(noon) > 300, `noon page ${page(noon).toFixed(0)} cd/m²`);
  assert.ok(page(night) > 0.5 && page(night) < 30, `night page ${page(night).toFixed(2)} cd/m²`);
  assert.ok(page(noon) > 100 * page(night));
  // seen: the noon page white, the candlelit page warm
  const seenNoon = toScreen(radiance(of(noon.light, room.page), paper), settledOn(radiance(of(noon.light, room.page), paper)));
  const nightLook = radiance(of(night.light, room.page), paper);
  const seenNight = toScreen(nightLook, settledOn(nightLook));
  assert.ok(seenNoon.every((v) => v > 0.9), `noon ${seenNoon.map((v) => v.toFixed(2))}`);
  assert.ok(seenNight[0] > 1.3 * seenNight[2], `night ${seenNight.map((v) => v.toFixed(2))}`);
  // the light the page drinks becomes its heat
  assert.ok(heatOf(noon.light, absorption(), room.patches)[room.page] > heatOf(night.light, absorption(), room.patches)[room.page]);
});

test('the lit room: ink on the page changes the room\'s light (absorption is a runtime input)', () => {
  const cells = 1000;
  const ink = Array.from({ length: 600 }, () => ({ abs: [0x900, 0x700, 0x300] })); // a dense blue, most of the page
  const inked = pageCurve(paper, ink, cells);
  const clean = settle({ flames: flames() });
  const dark = settle({ flames: flames() }, inked);
  const ceiling = room.patches.findIndex((p) => p.kind === 'ceiling' && Math.abs(p.center[0] - room.size[0] / 2) < 0.6 && p.center[1] > room.size[1] - 1.2);
  assert.ok(ceiling >= 0);
  assert.ok(lum(of(dark.light, ceiling)) < lum(of(clean.light, ceiling)), 'the ceiling over a darkened page gets less back');
  // and the colour of what the page gives back shifts toward the ink's
  const back = (r, R) => radiance(of(r.light, room.page), R);
  const ratio = (s) => xyzOf(s, CMF)[2] / xyzOf(s, CMF)[0];
  assert.ok(ratio(back(dark, inked)) > ratio(back(clean, paper)));
});

test('the lit room: the window\'s patch of sun moves across the table through the day, soft-edged', () => {
  const top = room.table.top + 1e-4;
  const pts = [];
  for (let x = room.size[0] / 2 - 0.7; x <= room.size[0] / 2 + 0.7; x += 0.02) {
    for (let y = room.size[1] - 0.77; y <= room.size[1] - 0.02; y += 0.02) pts.push([x, y, top]);
  }
  const centroid = (hour) => {
    const { sunDir } = day(hour);
    let s = 0, sx = 0, soft = 0;
    for (const p of pts) {
      const a = sunAperture(room, p, sunDir);
      s += a;
      sx += a * p[0];
      if (a > 0.02 && a < 0.98) soft++;
    }
    return { x: sx / Math.max(1e-9, s), lit: s, soft };
  };
  const [m, n, a] = [9, 12, 15].map(centroid);
  assert.ok(m.lit > 0 && n.lit > 0 && a.lit > 0, 'on the table all day');
  assert.ok(m.x > n.x && n.x > a.x, `from right to left: ${m.x.toFixed(2)}, ${n.x.toFixed(2)}, ${a.x.toFixed(2)}`);
  assert.ok(n.soft > 0, 'the sun is a disk: the edges are soft');
  assert.equal(centroid(23).lit, 0, 'none at night');
});
