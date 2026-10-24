// The goldens that freeze law v1: digests of the tables, of a region of paper,
// and of every fixture's settled facts (at three scales). npm test checks them.
//   node law/tools/goldens.js           print the current values
//   node law/tools/goldens.js --write   record them (only when starting a new law version)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '@noble/hashes/sha2.js';
import * as tables from '../v1/tables.js';
import { makePaper } from '../v1/paper.js';
import { grow } from '../v1/sim.js';
import { settledCells, boxOf, lookRGB, factsDigest, lookDigest } from '../v1/look.js';
import { FIXTURES, fixtureBytes, testPaperKey } from './fixtures.js';
import { hex, utf8 } from '../tags.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const GOLDENS_FILE = path.join(here, '..', 'fixtures', 'goldens.json');
const family = { grain: 8, weight: 8, tooth: 0 };

export function computeGoldens() {
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
    for (const k of ['cap', 'hold', 'siz', 'z', 'link']) {
      const b = new Uint8Array(f[k].length * 2);
      const dv = new DataView(b.buffer);
      f[k].forEach((v, i) => dv.setUint16(i * 2, v, false));
      p.update(b);
    }
  }
  const fixtures = {};
  for (const name of Object.keys(FIXTURES)) {
    const { bytes, rec } = fixtureBytes(name);
    for (const scale of [64, 40, 100]) {
      const cells = settledCells(grow(rec, { paperKey: testPaperKey('golden'), family, scale }).tiles);
      const box = boxOf(cells);
      fixtures[`${name}@${scale}`] = {
        facts: hex(factsDigest({ cells, box, actsBytes: bytes, family, scale })),
        look: hex(lookDigest(lookRGB(cells, box), box)),
        box,
      };
    }
  }
  return { law: 1, tables: hex(t.digest()), paper: hex(p.digest()), fixtures };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const g = computeGoldens();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(GOLDENS_FILE, `${JSON.stringify(g, null, 1)}\n`);
    console.log(`wrote ${GOLDENS_FILE}`);
  } else console.log(JSON.stringify(g, null, 1));
}
