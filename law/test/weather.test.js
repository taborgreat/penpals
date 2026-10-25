// The weather (world.md Phase 4): a few numbers of the air over a place, from the sun and its seed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { weatherAt, STEP } from '../weather.js';

const at = (y, m, d, h) => Date.UTC(y, m, d, h + 8); // (the place's hour: Pacific, standard)

test('the same date and seed, the same weather; another place, another', () => {
  const t = at(2026, 6, 14, 15);
  const a = weatherAt('ana', t);
  weatherAt('ana', t + 5 * 86400000); // (gone on, then asked again: grown anew from its own start)
  assert.deepEqual(weatherAt('ana', t), a);
  const step = weatherAt('ana', t - STEP * 1000);
  assert.deepEqual(weatherAt('ana', t), a, 'stepped there, or come to at once');
  assert.notDeepEqual(step, a);
  let differ = 0;
  for (let d = 1; d < 29; d++) if (JSON.stringify(weatherAt('ana', at(2026, 3, d, 15))) !== JSON.stringify(weatherAt('bo', at(2026, 3, d, 15)))) differ++;
  assert.ok(differ > 20, 'two places, two weathers');
});

test('the seasons and the days: summer warmer than winter, afternoons than dawns; calm nights', () => {
  const mean = (m, h) => {
    let s = 0;
    for (let d = 1; d <= 28; d++) s += weatherAt('cy', at(2026, m, d, h)).temp;
    return s / 28;
  };
  assert.ok(mean(6, 15) > mean(0, 15) + 10, `July ${mean(6, 15).toFixed(1)} °C, January ${mean(0, 15).toFixed(1)} °C`);
  assert.ok(mean(6, 15) > mean(6, 5) + 5, 'afternoon warmer than dawn');
  let calm = 0;
  for (let d = 1; d <= 28; d++) if (weatherAt('cy', at(2026, 9, d, 2)).wind < 0.5) calm++;
  assert.ok(calm > 20, `${calm} of 28 nights calm (no sun, nothing rises)`);
});

test('humid air cooling makes clouds; heavy clouds rain; unstable, charged air strikes', () => {
  let cloudy = 0,
    clear = 0,
    rainy = 0,
    rainNoCloud = 0;
  for (let d = 0; d < 365; d += 1)
    for (const h of [3, 9, 15, 21]) {
      const w = weatherAt('dee', Date.UTC(2026, 0, 1 + d, h + 8));
      if (w.cloud > 0.5) cloudy++;
      if (w.cloud < 0.05) clear++;
      if (w.rain > 0.05) rainy++;
      if (w.rain > 0.05 && w.cloud < 0.3) rainNoCloud++;
      assert.ok(w.humidity <= 1000);
    }
  assert.ok(cloudy > 100 && clear > 300, `${cloudy} cloudy, ${clear} clear of 1460`);
  assert.ok(rainy > 20, `${rainy} rainy`);
  assert.equal(rainNoCloud, 0, 'rain falls only from heavy clouds');
  // a summer of afternoons, step by step: thunder now and then
  let n = 0;
  for (let d = 0; d < 92; d++) for (let m = 0; m < 600; m += STEP / 60) n += weatherAt('dee', Date.UTC(2026, 5, 1 + d, 20) + m * 60000).strikes.length;
  assert.ok(n > 0, `${n} strikes in a summer's afternoons`);
});
