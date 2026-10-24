// Print fixed-pigment profiles through the darkest cell of a fixture, to read
// structure the eye can't (a ring inside a saturated blob, a gradient band).
//   node law/tools/profile.js <fixture> [--channel 0|1|2] [--radius 30]
import { renderOne, testPaperKey } from './render.js';

const args = process.argv.slice(2);
const name = args[0] || 'dwellLight';
const opt = (k, d) => (args.includes(`--${k}`) ? Number(args[args.indexOf(`--${k}`) + 1]) : d);
const ch = opt('channel', 0);
const rad = opt('radius', 30);

const r = renderOne(name, { paperKey: testPaperKey('tuning'), family: { grain: 8, weight: 8, tooth: 0 } });
const map = new Map(r.cells.map((c) => [`${c[0]},${c[1]}`, c]));
let best = null;
for (const c of r.cells) {
  const s = c[2] + c[3] + c[4];
  if (!best || s > best.s) best = { y: c[0], x: c[1], s };
}
const f = (y, x) => map.get(`${y},${x}`)?.[2 + ch] ?? 0;
console.log(`${name}: darkest cell (${best.x}, ${best.y}); channel ${ch} fixed pigment (1/1024 absorbance)`);
const row = [];
const col = [];
for (let d = -rad; d <= rad; d++) {
  row.push(f(best.y, best.x + d));
  col.push(f(best.y + d, best.x));
}
console.log('across:', row.join(' '));
console.log('down:  ', col.join(' '));
