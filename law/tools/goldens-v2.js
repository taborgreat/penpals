// The goldens that freeze law v2: digests of its tables, of a region of its
// paper (v1's fields and the ridges), of every fixture's settled facts (v1's
// fixtures grown under v2 at three scales, v2's at 1×), and of the looks at a
// few ages and exposures (the view-time part of the law). npm test checks them.
//   node law/tools/goldens-v2.js           print the current values
//   node law/tools/goldens-v2.js --write   record them (only while v2 is not yet frozen)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha2.js';
import * as tables from '../v2/tables.js';
import { makePaper } from '../v2/paper.js';
import { grow } from '../v2/sim.js';
import { settledCells, boxOf, lookRGB, factsDigest, lookDigest, hasGall } from '../v2/look.js';
import { FIXTURES, fixtureBytes, testPaperKey } from './fixtures.js';
import { FIXTURES_V2, fixtureV2Bytes } from './fixtures-v2.js';
import { hex, utf8 } from '../tags.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GOLDENS_V2_FILE = path.join(here, '..', 'fixtures', 'goldens-v2.json');
const family = { grain: 8, weight: 8, tooth: 0 };
const VIEWS = [{ ageH: 24 }, { ageH: 720 }, { views: 400 }, { ageH: 168, views: 4000 }];

function settle(bytes, rec, scale) {
  const cells = settledCells(grow(rec, { paperKey: testPaperKey('golden'), family, scale }).tiles);
  const box = boxOf(cells);
  const out = {
    facts: hex(factsDigest({ cells, box, actsBytes: bytes, family, scale })),
    look: hex(lookDigest(lookRGB(cells, box), box)),
    box,
  };
  if (scale === 64) {
    out.views = VIEWS.filter((v) => hasGall(cells) || !v.ageH || v.views).map((v) => [v, hex(lookDigest(lookRGB(cells, box, v), box))]);
  }
  return out;
}

export function computeGoldensV2() {
  const t = sha256.create();
  for (const name of Object.keys(tables).sort()) {
    t.update(utf8(name));
    const arr = tables[name];
    const b = new Uint8Array(arr.length * 4);
    const dv = new DataView(b.buffer);
    arr.forEach((v, i) => dv.setInt32(i * 4, v, false));
    t.update(b);
  }
  const p = sha256.create();
  const paper = makePaper(testPaperKey('golden'), family);
  for (let ty = -1; ty <= 2; ty++) for (let tx = -1; tx <= 2; tx++) {
    const f = paper.tileFields(tx * 16, ty * 16);
    for (const k of ['cap', 'hold', 'siz', 'z', 'link', 'ridge']) {
      const b = new Uint8Array(f[k].length * 2);
      const dv = new DataView(b.buffer);
      f[k].forEach((v, i) => dv.setUint16(i * 2, v, false));
      p.update(b);
    }
  }
  const fixtures = {};
  for (const name of Object.keys(FIXTURES)) {
    const { bytes, rec } = fixtureBytes(name);
    for (const scale of [64, 40, 100]) fixtures[`v1:${name}@${scale}`] = settle(bytes, rec, scale);
  }
  for (const name of Object.keys(FIXTURES_V2)) {
    const { bytes, rec } = fixtureV2Bytes(name);
    fixtures[`${name}@64`] = settle(bytes, rec, 64);
  }
  return { law: 2, tables: hex(t.digest()), paper: hex(p.digest()), fixtures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const g = computeGoldensV2();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(GOLDENS_V2_FILE, `${JSON.stringify(g, null, 1)}\n`);
    console.log(`wrote ${GOLDENS_V2_FILE}`);
  } else console.log(JSON.stringify(g, null, 1));
}
