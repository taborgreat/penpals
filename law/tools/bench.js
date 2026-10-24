// Time the law on each fixture: ms per run and ns per wet cell-tick (the unit of work).
//   node law/tools/bench.js [runs]
import { FIXTURES, fixtureBytes, testPaperKey } from './fixtures.js';
import { grow } from '../v1/sim.js';

const runs = Number(process.argv[2] || 3);
const family = { grain: 8, weight: 8, tooth: 0 };
const paperKey = testPaperKey('bench');
let totalWork = 0,
  totalMs = 0;
for (const name of Object.keys(FIXTURES)) {
  const { rec } = fixtureBytes(name);
  grow(rec, { paperKey, family }); // warm
  const t0 = performance.now();
  let work = 0;
  for (let i = 0; i < runs; i++) work = grow(rec, { paperKey, family }).work;
  const ms = (performance.now() - t0) / runs;
  totalWork += work;
  totalMs += ms;
  console.log(`${name.padEnd(13)} ${ms.toFixed(0).padStart(6)} ms  work ${String(work).padStart(9)}  ${((ms * 1e6) / work).toFixed(0).padStart(5)} ns/cell-tick`);
}
console.log(`all           ${totalMs.toFixed(0).padStart(6)} ms  ${((totalMs * 1e6) / totalWork).toFixed(0)} ns/cell-tick`);
