import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageAt } from './routes.js';

// one-world.md: the site is one page, and it is the world.
test('/ and /u/<name> open the world, at that person’s house', () => {
  assert.deepEqual(pageAt('/'), { page: 'world', params: {} });
  assert.deepEqual(pageAt('/u/tabor'), { page: 'world', params: { username: 'tabor' } });
});

test('no route serves the removed pages', () => {
  for (const p of ['/write', '/write/tabor', '/proofs', '/hand', '/inbox', '/u/tabor/home', '/u/tabor/some-page']) assert.equal(pageAt(p).page, 'not-found', p);
});

test('kept outside the world: the .book viewer, the dev pages (dev only)', () => {
  assert.equal(pageAt('/book').page, 'book');
  for (const p of ['/hand-lab', '/law-check', '/scene-check', '/pad-check']) {
    assert.equal(pageAt(p, { labs: true }).page, p.slice(1));
    assert.equal(pageAt(p).page, 'not-found', `${p} without labs`);
  }
});
