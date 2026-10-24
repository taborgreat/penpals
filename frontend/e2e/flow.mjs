// The whole flow in a real browser, the way a person goes through it: register
// by writing (phrase ×3, name, calibration page) and a password; write in the
// journal; log out; log in by writing the phrase; unlock a new tab; write and
// save a letter; download the book and check it with the law's verifier.
// No shortcuts: every request is the one the site makes.
//   node frontend/e2e/flow.mjs         the built site, served by the backend (run `npm run build -w frontend` first)
//   node frontend/e2e/flow.mjs --dev   through a Vite dev server proxying /api, as `npm run dev` runs it
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-e2e-'));
const PORT = 3123;
let base = `http://localhost:${PORT}`;
const step = (msg) => console.log(`· ${msg}`);

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: path.join(root, 'backend'),
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), RENDER_WORKERS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`server did not start: ${serverLog}`)), 20000);
  server.stdout.on('data', () => { if (serverLog.includes('listening')) { clearTimeout(t); resolve(); } });
});

let vite = null;
if (process.argv.includes('--dev')) {
  process.env.API_URL = base;
  const { createServer } = await import('vite');
  vite = await createServer({ root: path.join(root, 'frontend'), configFile: path.join(root, 'frontend', 'vite.config.js'), logLevel: 'error', server: { port: 5199, host: 'localhost', strictPort: true } });
  await vite.listen();
  base = 'http://localhost:5199';
  console.log('(through the Vite dev server)');
}

// A phrase in a steady hand: a few loops and words, the same every time (with
// the small wobble of a real hand).
function phrase(wobble = 0) {
  const strokes = [];
  for (let w = 0; w < 4; w++) {
    const pts = [];
    const x0 = 0.06 + w * 0.23;
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push([x0 + u * 0.18 + 0.01 * Math.sin(u * 19 + w) + wobble * Math.sin(i * 1.7), 0.5 - 0.22 * Math.abs(Math.sin(u * Math.PI * (2 + (w % 2)))) + wobble * Math.cos(i * 1.3)]);
    }
    strokes.push(pts);
  }
  return strokes;
}
const scribble = (lines, perLine = 5) => {
  const strokes = [];
  for (let l = 0; l < lines; l++) {
    for (let k = 0; k < perLine; k++) {
      const pts = [];
      const x0 = 0.04 + k * (0.92 / perLine);
      const y0 = 0.12 + l * (0.8 / lines);
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        pts.push([x0 + u * (0.8 / perLine), y0 + 0.05 * Math.sin(u * Math.PI * 3 + k)]);
      }
      strokes.push(pts);
    }
  }
  return strokes;
};

// Pointer events stamped like a real device's (evenly, by the hardware), not
// when the test happens to dispatch them: the hand is read from the timing.
const cdps = new WeakMap();
async function draw(page, canvas, strokes, ms = 9) {
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  if (!cdps.has(page)) cdps.set(page, await page.context().newCDPSession(page));
  const cdp = cdps.get(page);
  const send = (type, [x, y], t, buttons) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, timestamp: t / 1000 });
  for (const s of strokes) {
    const at = ([u, v]) => [b.x + u * b.width, b.y + v * b.height];
    let t = Date.now();
    await send('mouseMoved', at(s[0]), t, 0);
    await send('mousePressed', at(s[0]), t, 1);
    for (const p of s.slice(1)) {
      t += ms;
      await send('mouseMoved', at(p), t, 1);
      const lag = t - Date.now();
      if (lag > 0) await page.waitForTimeout(lag); // keep the stamps at most a little ahead of the clock
    }
    t += ms;
    await send('mouseReleased', at(s.at(-1)), t, 0);
    await page.waitForTimeout(Math.max(0, t - Date.now()) + 120);
  }
}
const pad = (page) => page.locator('.pad canvas.ink').first();
const tries = { login: 0, unlock: 0 };

// Write the phrase (and type the password, if the account has one) until it opens (a person tries again too).
async function openByWriting(page, { unlock, done, password = '' }) {
  const submit = () => page.getByRole('button', { name: unlock ? 'Unlock' : /Log in/ }).last().click();
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (!unlock) await page.fill('#in-name', 'tabor');
    await draw(page, pad(page), phrase(0.002));
    await submit();
    tries[unlock ? 'unlock' : 'login']++;
    if (password && await page.getByText('This account also asks for its password.').waitFor({ timeout: 30000 }).then(() => true, () => false)) {
      await page.fill('#in-pw', password); // the writing is kept: only the password was missing
      await submit();
    }
    if (await done().then(() => true, () => false)) return;
    console.log(`  attempt ${attempt}:`, await page.locator('.signin .error').textContent().catch(() => '?'));
  }
  throw new Error(unlock ? 'could not unlock by writing the phrase' : 'could not log in by writing the phrase');
}

const browser = await chromium.launch();
let failed = null;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('  [page error]', err.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`  [console ${m.type()}]`, m.text()); });
  await page.goto(base);

  step('register: a name, and no password (the hand is enough)');
  await page.getByRole('button', { name: /register/i }).first().click();
  await page.fill('#reg-name', 'tabor');
  await page.getByText('free', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('No password: my name and my hand').waitFor();
  await page.getByRole('button', { name: 'Next' }).click();

  step('register: the phrase, three times');
  for (let i = 1; i <= 3; i++) {
    await page.getByText(`Writing ${i} of 3`).waitFor();
    await draw(page, pad(page), phrase(0.002 * i));
    await page.getByRole('button', { name: 'Done' }).click();
  }
  step('register: sign the name');
  await page.getByText('Now sign your name').waitFor({ timeout: 30000 }).catch(async (err) => {
    console.log('  on the page:', await page.locator('.register .error, .register .meta').allTextContents());
    throw err;
  });
  await draw(page, pad(page), scribble(1, 3));
  await page.getByRole('button', { name: 'Done' }).click();
  step('register: the calibration page');
  await page.getByText('Last: copy this out').waitFor({ timeout: 30000 });
  await draw(page, pad(page), scribble(4, 6), 4);
  await page.getByRole('button', { name: 'Make my account' }).click();
  await page.locator('button.logout').waitFor({ timeout: 90000 });
  step('registered and signed in');

  step('profile: the signature is a look');
  await page.goto(`${base}/u/tabor`);
  const sig = page.locator('img.signature-look').first();
  await sig.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('img.signature-look')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });

  step('journal: write and place');
  await page.getByRole('button', { name: /Write/ }).filter({ hasText: '✎' }).click();
  await draw(page, pad(page), scribble(1, 2));
  const lookReply = page.waitForResponse((r) => r.url().includes('/look/') && r.status() === 200, { timeout: 60000 });
  await page.getByRole('button', { name: 'Place on page' }).click();
  await page.locator('.journal-page .ink-item').first().waitFor({ timeout: 60000 });
  await lookReply;

  step('walk back a spot of it');
  await page.getByRole('button', { name: 'Walk back' }).click();
  const art = page.locator('.walk-back-art');
  const ab = await art.boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.3, ab.y + ab.height * 0.5);
  await page.locator('.trace dt', { hasText: 'settled' }).waitFor({ timeout: 60000 });
  console.log('  ', (await page.locator('.trace').innerText()).replace(/\s+/g, ' ').slice(0, 160), '…');
  await page.getByRole('button', { name: 'Close' }).click();

  step('save it being written: video and GIF, grown on this device');
  const saved = async (p, name) => {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), p.getByRole('button', { name, exact: true }).first().click()]);
    const f = path.join(dataDir, d.suggestedFilename());
    await d.saveAs(f);
    return fs.readFileSync(f);
  };
  const webm = await saved(page, 'Video');
  if (!(webm[0] === 0x1a && webm[1] === 0x45 && webm[2] === 0xdf && webm[3] === 0xa3)) throw new Error('the video is not a WebM file');
  const gif = await saved(page, 'GIF');
  if (gif.subarray(0, 6).toString('ascii') !== 'GIF89a') throw new Error('the GIF is not a GIF');
  console.log(`   video ${webm.length} bytes, GIF ${gif.length} bytes`);

  step('log out, then log in by writing the phrase');
  await page.locator('button.logout').click();
  await page.goto(base);
  await page.locator('#in-name').waitFor();
  await openByWriting(page, { unlock: false, done: () => page.locator('button.logout').waitFor({ timeout: 60000 }) });

  step('a new tab is signed in but must unlock to write');
  const tab = await context.newPage();
  await tab.goto(`${base}/write`);
  await tab.getByText('Unlock to write').waitFor({ timeout: 20000 });
  await openByWriting(tab, { unlock: true, done: () => tab.getByRole('button', { name: 'Draw on screen' }).waitFor({ timeout: 60000 }) });

  step('write a letter on the pad and save it');
  await tab.waitForTimeout(500);
  await draw(tab, pad(tab), scribble(2, 3));
  await tab.getByRole('button', { name: 'Save to my profile' }).click();
  await tab.getByText('On your profile').waitFor({ timeout: 60000 });
  await tab.waitForResponse((r) => r.url().includes('/look') && r.status() === 200, { timeout: 60000 }).catch(() => null);
  step('the letter being written, as a video the server films');
  const [ld] = await Promise.all([tab.waitForEvent('download', { timeout: 120000 }), tab.getByRole('button', { name: 'Video', exact: true }).click()]);
  const lf = path.join(dataDir, ld.suggestedFilename());
  await ld.saveAs(lf);
  const lv = fs.readFileSync(lf);
  if (!(lv[0] === 0x1a && lv[1] === 0x45)) throw new Error(`the letter video is not a WebM file (${ld.suggestedFilename()})`);

  step('download the book and check it offline');
  await page.goto(`${base}/u/tabor`);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByText('Download my book').click()]);
  const file = path.join(dataDir, 'tabor.book');
  await dl.saveAs(file);
  const v = spawnSync(process.execPath, [path.join(root, 'law', 'bin', 'verify.js'), file], { encoding: 'utf8' });
  console.log(v.stdout.trim().split('\n').map((l) => `  ${l}`).join('\n'));
  if (v.status !== 0) throw new Error('the downloaded book does not check');

  step('open the .book in the viewer: it checks here too');
  await page.goto(`${base}/book`);
  await page.setInputFiles('.dropzone input[type=file]', file);
  await page.getByText('The book checks.').waitFor({ timeout: 60000 });
  await page.getByText(/And with your key: 1 closed sheet grown again here/).waitFor({ timeout: 60000 });
  step('add a password backup in the account, then log in: it asks for it');
  await page.goto(`${base}/u/tabor`);
  await page.getByRole('button', { name: 'Add one' }).click();
  await draw(page, page.locator('.password-setting .pad canvas.ink').first(), phrase(0.002));
  await page.fill('#pw-next', 'correct horse battery');
  await page.fill('#pw-next2', 'correct horse battery');
  await page.getByRole('button', { name: 'Save' }).click();
  await page.locator('.password-setting strong', { hasText: 'on' }).waitFor({ timeout: 60000 });
  await page.locator('button.logout').click();
  await page.goto(base);
  await page.locator('#in-name').waitFor();
  await openByWriting(page, { unlock: false, password: 'correct horse battery', done: () => page.locator('button.logout').waitFor({ timeout: 60000 }) });
  console.log('\nthe whole flow works');
} catch (err) {
  failed = err;
  console.error('\nFAILED:', err.message);
  console.error(serverLog.split('\n').slice(-20).join('\n'));
} finally {
  await browser.close();
  server.kill();
  await vite?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
