// Crash at each write step, restart on the same data, and check that what is on
// disk still holds together and that trying again succeeds.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { client } from './helpers.js';
import { person, register, bookInk, FAMILY, K, R, S, b64url } from './device.js';

const SERVE = fileURLToPath(new URL('./serve.js', import.meta.url));
const FSCK = fileURLToPath(new URL('../scripts/fsck.js', import.meta.url));
const dirs = [];
after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function serve(dir, crash = '') {
  const child = spawn(process.execPath, [SERVE], { env: { ...process.env, DATA_DIR: dir, RENDER_WORKERS: '0', PENPALS_CRASH: crash }, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => {
    err += d;
  });
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  return new Promise((resolve, reject) => {
    child.stdout.on('data', (d) => {
      const m = /port (\d+)/.exec(String(d));
      if (m)
        resolve({
          base: `http://127.0.0.1:${m[1]}`,
          child,
          exited,
          stderr: () => err,
          stop: () => {
            child.kill();
            return exited;
          },
        });
    });
    child.on('exit', (code) => reject(new Error(`server exited ${code} before listening: ${err}`)));
  });
}

const fsck = (dir) => spawnSync(process.execPath, [FSCK, '--json'], { env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8' });

async function crashThenRecover(dir, crash, step) {
  const s1 = await serve(dir, crash);
  const died = step(s1.base).then(
    () => 'answered',
    () => 'no answer',
  );
  const code = await s1.exited;
  assert.equal(code, 137, `the server should have stopped at ${crash}: ${s1.stderr()}`);
  assert.equal(await died, 'no answer');
  const s2 = await serve(dir);
  return s2;
}

test('registration: a crash before account.json leaves nothing behind, and the name can be taken again', async () => {
  for (const crash of ['register:after-chain', 'register:before-account']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-crash-'));
    dirs.push(dir);
    const ana = person(31, 'ana');
    const s = await crashThenRecover(dir, crash, (base) => register(client(base), ana));
    try {
      const c = client(s.base);
      assert.deepEqual((await c.get('/api/auth/name/ana')).data, { valid: true, free: true });
      assert.equal(fs.readdirSync(path.join(dir, 'users')).length, 0, 'the unfinished registration was removed');
      assert.equal((await register(c, person(31, 'ana'))).status, 201);
    } finally {
      await s.stop();
    }
    const report = fsck(dir);
    assert.equal(report.status, 0, report.stdout + report.stderr);
  }
});

test('ink: a crash after the seed or after the line, then the same upload again lands once', async () => {
  for (const crash of ['ink:after-seed', 'ink:after-line']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-crash-'));
    dirs.push(dir);
    const ana = person(32, 'ana');
    let s = await serve(dir);
    let c = client(s.base);
    assert.equal((await register(c, ana)).status, 201);
    const cookie = c.cookieHeader();
    await s.stop();
    const ink = bookInk(ana);
    const place = { page: 'home', x: 10, y: 10, scale: 64 };
    s = await crashThenRecover(dir, crash, (base) => client(base, { cookie }).post('/api/books/me/ink', { line: ink.line, seed: ink.seedText, place }));
    try {
      c = client(s.base, { cookie });
      const again = await c.post('/api/books/me/ink', { line: ink.line, seed: ink.seedText, place });
      assert.ok([200, 201].includes(again.status), JSON.stringify(again.data));
      const book = (await c.get('/api/books/ana')).data.skeleton;
      const placed = book.pages.home.items.filter((it) => it.ink === again.data.ink);
      assert.equal(placed.length, 1, 'placed exactly once');
      const chain = (await c.get('/api/books/ana/ink')).data.toString('utf8').trim().split('\n');
      assert.equal(chain.filter((l) => l.includes(ink.line.ink.sheet)).length, 1, 'one line for the sheet');
      assert.equal((await c.get(`/api/books/ana/look/${again.data.ink}`)).status, 200);
    } finally {
      await s.stop();
    }
    const report = fsck(dir);
    assert.equal(report.status, 0, report.stdout + report.stderr);
  }
});

test('letters: a crash before letter.json leaves no letter, and sending again works', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-crash-'));
  dirs.push(dir);
  const ana = person(33, 'ana');
  let s = await serve(dir);
  const c0 = client(s.base);
  assert.equal((await register(c0, ana)).status, 201);
  const cookie = c0.cookieHeader();
  await s.stop();
  const made = R.makeInk({ sk: ana.sk, pk: ana.pk, sheet: K.newSheetId(), use: 'letter', family: FAMILY, acts: S.write(ana.writer, 'hi', 2) });
  const body = { line: made.line, seed: b64url(made.seed), background: 'plain', page: { width: 800, height: 1100 } };
  s = await crashThenRecover(dir, 'letter:before-meta', (base) => client(base, { cookie }).post('/api/letters', body));
  try {
    assert.equal(fs.readdirSync(path.join(dir, 'letters')).length, 0, 'the unfinished letter folder was swept');
    const c = client(s.base, { cookie });
    const again = await c.post('/api/letters', body);
    assert.equal(again.status, 201, JSON.stringify(again.data));
  } finally {
    await s.stop();
  }
  assert.equal(fsck(dir).status, 0);
});

test('a torn last line in a chain is cut off at start, and the next line lands whole', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-crash-'));
  dirs.push(dir);
  const ana = person(34, 'ana');
  let s = await serve(dir);
  const c0 = client(s.base);
  assert.equal((await register(c0, ana)).status, 201);
  const cookie = c0.cookieHeader();
  await s.stop();
  const [id] = fs.readdirSync(path.join(dir, 'users'));
  const chain = path.join(dir, 'users', id, 'book', 'ink.chain');
  const whole = fs.readFileSync(chain);
  fs.appendFileSync(chain, '{"id":"k_000002","made":"2026-');
  s = await serve(dir);
  try {
    assert.deepEqual(fs.readFileSync(chain), whole, 'the torn tail is gone');
    const w = await client(s.base, { cookie }).post('/api/books/me/ink', { line: bookInk(ana).line, seed: undefined });
    assert.equal(w.status, 400);
    const ink = bookInk(ana);
    const ok = await client(s.base, { cookie }).post('/api/books/me/ink', { line: ink.line, seed: ink.seedText });
    assert.equal(ok.status, 201);
    assert.equal(ok.data.ink, 'k_000002');
  } finally {
    await s.stop();
  }
  assert.equal(fsck(dir).status, 0);
});

test('fsck finds damage: a wrong seed, a changed record, a damaged password backup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-crash-'));
  dirs.push(dir);
  const ana = person(35, 'ana');
  const s = await serve(dir);
  try {
    const c = client(s.base);
    assert.equal((await register(c, ana)).status, 201);
    const ink = bookInk(ana);
    assert.equal((await c.post('/api/books/me/ink', { line: ink.line, seed: ink.seedText })).status, 201);
  } finally {
    await s.stop();
  }
  const clean = fsck(dir);
  assert.equal(clean.status, 0, clean.stdout);
  const deep = spawnSync(process.execPath, [FSCK, '--json', '--regrow'], { env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8' });
  assert.equal(deep.status, 0, deep.stdout);

  const [id] = fs.readdirSync(path.join(dir, 'users'));
  const damage = (file, change) => {
    const f = path.join(dir, 'users', id, file);
    const was = fs.readFileSync(f, 'utf8');
    if (change === null) fs.rmSync(f);
    else fs.writeFileSync(f, change(was));
    const r = fsck(dir);
    fs.writeFileSync(f, was);
    assert.equal(r.status, 1, `fsck missed damage to ${file}`);
    return JSON.parse(r.stdout).problems.join('\n');
  };
  // the seed of another sheet in place of this sheet's
  const other = bookInk(ana);
  assert.match(
    damage('seeds.chain', (t) => t.replace(/"seed":"[^"]+"/, `"seed":"${other.seedText}"`)),
    /seed/,
  );
  // one number in a sealed record changed
  assert.match(
    damage(path.join('book', 'ink.chain'), (t) => t.replace(/"box":\[(\d+)/, (m, n) => `"box":[${Number(n) + 1}`)),
    /seal/,
  );
  // the password backup's file damaged
  assert.match(
    damage('unlock.json', (t) => t.replace('"password"', '"hand"')),
    /unlock/,
  );
  assert.equal(fsck(dir).status, 0, 'and the restored data checks again');
});
