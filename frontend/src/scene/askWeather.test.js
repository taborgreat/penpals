// Asking for weather (world.md): called up for a while, then easing back to the day's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ask, asWeather, cloudFor, ASK } from './askWeather.js';

test("rain or wind called up for a while, then the day's own again; rain comes with its clouds", () => {
  const day = { rain: 0, wind: 1, cloud: 0, temp: 15 };
  const a = ask(null, 'rain', 1000);
  const now = asWeather(day, a, 1010);
  assert.equal(now.rain, ASK.rain);
  assert.ok(now.cloud > 0.9 && now.cloud === cloudFor(ASK.rain), 'a raining deck');
  assert.equal(now.wind, 1);
  const more = ask(a, 'rain', 1020);
  assert.equal(asWeather(day, more, 1030).rain, 2 * ASK.rain, 'again: heavier');
  const easing = asWeather(day, more, 1020 + ASK.holds + ASK.eases / 2);
  assert.ok(easing.rain < 2 * ASK.rain && easing.rain > 0);
  assert.deepEqual(asWeather(day, more, 1020 + ASK.holds + ASK.eases + 1), day, 'back to the day');
  assert.equal(asWeather({ ...day, rain: 30 }, a, 1010).rain, 30, 'a heavier day stays itself');
  assert.equal(asWeather(day, ask(null, 'wind', 0), 5).wind, ASK.wind);
});
