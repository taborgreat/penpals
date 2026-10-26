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
import { person, register, FAMILY, K, R, S } from './device.js';

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

// A signature of p's on a fresh sheet, open from birth (signing again: routes/books.js).
const signatureOf = (p, sheet = K.newSheetId()) => {
  const made = R.makeInk({ sk: p.sk, pk: p.pk, sheet, use: 'signature', family: FAMILY, acts: S.write(p.writer, p.username, 3), name: p.username });
  return { ...made.line, open: R.makeOpen(p.sk, made.D, sheet, made.seed) };
};

test('signing again: a crash after the line, then the same signature again lands once', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-crash-'));
  dirs.push(dir);
  const ana = person(32, 'ana');
  let s = await serve(dir);
  let c = client(s.base);
  assert.equal((await register(c, ana)).status, 201);
  const cookie = c.cookieHeader();
  await s.stop();
  const line = signatureOf(ana);
  s = await crashThenRecover(dir, 'ink:after-line', (base) => client(base, { cookie }).put('/api/books/me/signature', { line }));
  try {
    c = client(s.base, { cookie });
    const again = await c.put('/api/books/me/signature', { line });
    assert.ok([200, 201].includes(again.status), JSON.stringify(again.data));
    const chain = (await c.get('/api/books/ana/ink')).data.toString('utf8').trim().split('\n');
    assert.equal(chain.filter((l) => l.includes(line.ink.sheet)).length, 1, 'one line for the sheet');
    assert.equal((await c.get('/api/books/ana')).data.signature, again.data.ink, 'it is their signature');
  } finally {
    await s.stop();
  }
  const report = fsck(dir);
  assert.equal(report.status, 0, report.stdout + report.stderr);
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
    const ok = await client(s.base, { cookie }).put('/api/books/me/signature', { line: signatureOf(ana) });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.ink, 'k_000002');
  } finally {
    await s.stop();
  }
  assert.equal(fsck(dir).status, 0);
});

test('fsck finds damage: a changed record, a damaged password backup', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-crash-'));
  dirs.push(dir);
  const ana = person(35, 'ana');
  const s = await serve(dir);
  try {
    const c = client(s.base);
    assert.equal((await register(c, ana)).status, 201);
    assert.equal((await c.put('/api/books/me/signature', { line: signatureOf(ana) })).status, 201);
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
