import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { computeGoldens, GOLDENS_FILE } from '../tools/goldens.js';

// Law v1 is frozen. If one of these fails, the law changed: that is never an
// edit to v1 but a new law version (law/v2/) with its own goldens.
test('law v1 still settles exactly as recorded (goldens)', () => {
  const recorded = JSON.parse(fs.readFileSync(GOLDENS_FILE, 'utf8'));
  const now = computeGoldens();
  assert.equal(now.tables, recorded.tables, 'tables changed');
  assert.equal(now.paper, recorded.paper, 'the paper function changed');
  for (const [key, g] of Object.entries(recorded.fixtures)) {
    assert.deepEqual(now.fixtures[key], g, `${key} settles differently: the law changed`);
  }
});
