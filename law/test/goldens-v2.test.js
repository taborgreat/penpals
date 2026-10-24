import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { computeGoldensV2, GOLDENS_V2_FILE } from '../tools/goldens-v2.js';

// Law v2 settles exactly as recorded. A change here is a new law (v3), never an
// edit to v2, once v2 writing exists.
test('law v2 still settles and looks exactly as recorded (goldens)', () => {
  const recorded = JSON.parse(fs.readFileSync(GOLDENS_V2_FILE, 'utf8'));
  const now = computeGoldensV2();
  assert.equal(now.tables, recorded.tables, 'tables changed');
  assert.equal(now.paper, recorded.paper, 'the paper function changed');
  assert.deepEqual(Object.keys(now.fixtures).sort(), Object.keys(recorded.fixtures).sort());
  for (const [key, g] of Object.entries(recorded.fixtures)) {
    assert.deepEqual(now.fixtures[key], g, `${key} settles differently: the law changed`);
  }
});

test('the committed v2 tables are what the generator makes', () => {
  const gen = fileURLToPath(new URL('../tools/gen-tables-v2.js', import.meta.url));
  execFileSync(process.execPath, [gen, '--check'], { stdio: 'pipe' });
});
