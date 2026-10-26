// A try of law/fire.js on the house-fire test's own scene (dev only): the left candle, alight half an hour,
// lying toward the page; how long it burns, what of the paper burns away, and what it costs.
import { kindle } from '../fire.js';
import * as Cn from '../candle.js';

const top = 0.74;
const cd = Cn.newCandle();
for (let s = 0; s < 1800; s++) Cn.stepCandle(cd, { lit: true });
const U = 1400 / 0.2159;
const page = { paper: 'p', at: [1524, 2823, 740], size: [1000, 1400] };
const t0 = performance.now();
const fire = kindle({
  at: [1.33, 2.86],
  way: [1, 0],
  cd,
  lying: [page],
  ctx: { top, under: 'wood', within: [0.824, 2.583, 2.224, 3.333], holder: { radius: 0.045, height: 0.015 }, units: U },
});
let k = 0;
while (!fire.done && fire.t < 600) {
  fire.step(100);
  if (++k % 10 === 0)
    console.log(`${fire.t.toFixed(0)} s: ${fire.burning().length} cells alight, ${fire.burnt('p').length} of the paper's burnt away; ${((performance.now() - t0) / 1000).toFixed(1)} s spent`);
}
console.log(
  `over at ${fire.t.toFixed(1)} s (${fire.done ? 'nothing can catch' : 'cut short'}); the paper: ${fire.burnt('p').length} cm² burnt away (a cell a square centimetre); ${((performance.now() - t0) / 1000).toFixed(1)} s spent`,
);
