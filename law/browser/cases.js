// The cases /law-check grows in each browser and Node grows to compare: every
// v1 fixture under law 1, and the v2 fixtures (all but the slowest washes)
// under law 2, with the v2 look also taken at an age and an exposure (the
// view-time part of the law). Keys are `<law>:<fixture>`.
import { FIXTURES, fixtureBytes, testPaperKey } from '../tools/fixtures.js';
import { FIXTURES_V2, fixtureV2Bytes } from '../tools/fixtures-v2.js';
import { lawOf } from '../laws.js';
import { hex } from '../tags.js';

const SLOW = ['cockle', 'washThenWrite', 'waterOverGall', 'slowCurve', 'flicksDry'];
export const CASES = [
  ...Object.keys(FIXTURES).map((name) => `1:${name}`),
  ...Object.keys(FIXTURES_V2)
    .filter((n) => !SLOW.includes(n))
    .map((name) => `2:${name}`),
];
const family = { grain: 8, weight: 8, tooth: 0 };
export const VIEW = { ageH: 168, views: 400 };

// → { box, rgb (the canonical look), facts, viewed (digest of the look at VIEW), ticks }
export function growCase(key, seed = 'tuning') {
  const [lawText, name] = key.split(':');
  const law = Number(lawText);
  const L = lawOf(law);
  const { bytes, rec } = law === 1 ? fixtureBytes(name) : fixtureV2Bytes(name);
  const res = L.grow(rec, { paperKey: testPaperKey(seed), family });
  const cells = L.settledCells(res.tiles);
  const box = L.boxOf(cells);
  const rgb = L.lookRGB(cells, box);
  return {
    box,
    rgb,
    facts: hex(L.factsDigest({ cells, box, actsBytes: bytes, family, scale: 64 })),
    viewed: hex(L.lookDigest(L.lookRGB(cells, box, VIEW), box)),
    ticks: res.ticks,
  };
}
