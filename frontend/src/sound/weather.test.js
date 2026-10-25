// The weather heard (world.md Phase 4): from its totals only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { rainBed, windBed, weatherBeds } from './weather.js';
import { acoustics } from './room.js';
import { roomGeometry, ROOM } from '../scene/light/room.js';

const sum = (b) => b.reduce((a, x) => a + x, 0);

test("rain's hiss rises with its rate; the wind's with its speed; calm weather is near silent", () => {
  const light = sum(rainBed(1)),
    heavy = sum(rainBed(20));
  assert.ok(heavy > light * 10, `${(heavy / light).toFixed(0)}× as loud at 20 mm/h as at 1`);
  assert.ok(sum(windBed(10)) > sum(windBed(2)) * 1000, 'as the sixth power of its speed');
  assert.equal(sum(rainBed(0)) + sum(windBed(0)), 0, 'calm, dry: silence');
  assert.ok(sum(weatherBeds({ rain: 0, wind: 0.2 }, { pos: [5, 9, 1.6] }).wind) < sum(windBed(2)) * 1e-5, 'a breath of wind barely heard');
  // higher wind, higher pitch (eddies shed faster)
  const centre = (b) => b.reduce((a, x, k) => a + x * k, 0) / sum(b);
  assert.ok(centre(windBed(12)) > centre(windBed(3)));
});

test('indoors the weather comes through the window: shut, the glass drinks its hiss; open, it is crisp', () => {
  const geom = roomGeometry(ROOM);
  const head = { pos: [1.5, 1.6, 1.2], yaw: 0, pitch: 0 };
  const w = { rain: 8, wind: 6 };
  const out = weatherBeds(w, { pos: [1.5, 6, 1.6] });
  const shut = weatherBeds(w, head, acoustics(geom));
  const open = weatherBeds(w, head, acoustics(geom, { open: true }));
  assert.ok(sum(open.rain) < sum(out.rain), 'quieter inside than out');
  assert.ok(open.rain[8] > shut.rain[8] * 100, 'the highs come in only open');
});
