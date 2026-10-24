// The whole flow in a real browser, the way a person goes through it: register
// by writing (phrase ×3, name, calibration page) and a password; write in the
// journal; log out; log in by writing the phrase; unlock a new tab; write and
// save a letter; download the book and check it with the law's verifier.
// No shortcuts: every request is the one the site makes.
//   node frontend/e2e/flow.mjs         the built site, served by the backend (run `npm run build -w frontend` first)
//   node frontend/e2e/flow.mjs --dev   through a Vite dev server proxying /api, as `npm run dev` runs it
//   --no-webgl                          with WebGL off: every view shows the flat look, writing works in 2D
//   --webgpu                            in the full Chromium on this machine's GPU, where the scene draws with WebGPU
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

const webgl = !process.argv.includes('--no-webgl');
const webgpu = webgl && process.argv.includes('--webgpu');
const browser = await chromium.launch(webgpu
  ? { channel: 'chromium', args: ['--enable-unsafe-webgpu'] }
  : { args: webgl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] });
if (!webgl) console.log('(WebGL off: the flat look everywhere)');
if (webgpu) console.log('(the full Chromium, on the GPU: the scene with WebGPU)');
let failed = null;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  // a battery the flow can drain (the Battery Status API): low power puts the scene away
  await context.addInitScript(() => {
    const battery = new EventTarget();
    battery.charging = true;
    battery.level = 1;
    window.e2eBattery = battery;
    Object.defineProperty(navigator, 'getBattery', { value: async () => battery });
  });
  const page = await context.newPage();
  globalThis.e2ePage = page;
  // --slow: registration on a slow device (the CPU throttled), where each step's new sheet arrives late
  const slow = process.argv.includes('--slow') ? await context.newCDPSession(page) : null;
  if (slow) await slow.send('Emulation.setCPUThrottlingRate', { rate: 8 });
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
  // A scripted hand under a busy browser can wobble past the sketch radius (the pen's stalls become
  // hold samples): as a person would, keep these three (signing in then retries, as it does).
  const keep = page.getByRole('button', { name: 'Keep these' });
  if (await keep.isVisible().catch(() => false)) {
    console.log('   the three writings wobbled apart: keeping them');
    await keep.click();
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
  if (slow) {
    await slow.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log('(registered on a CPU throttled 8×)');
  }
  if (process.argv.includes('--only-register')) throw Object.assign(new Error('stopped after registering'), { ok: true });

  step('profile: the signature is a look');
  await page.goto(`${base}/u/tabor`);
  const sig = page.locator('img.signature-look').first();
  await sig.waitFor({ timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('img.signature-look')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 });
  if (webgl) {
    // your own signature, in the scene (an open sheet: grown here)
    await page.locator('.signature-scene canvas.scene-canvas').waitFor({ timeout: 60000 });
    console.log('   and your signature in the scene, with its 2D/3D toggle');
  }

  step('journal: write in oak gall, wet part of it with the water brush, and place');
  await page.getByRole('button', { name: /Write/ }).filter({ hasText: '✎' }).click();
  await page.getByRole('button', { name: 'Oak gall' }).click();
  await draw(page, pad(page), scribble(1, 2));
  await page.getByRole('button', { name: 'Water brush' }).click();
  await draw(page, pad(page), scribble(1, 1));
  await page.getByRole('button', { name: 'Into the paper' }).click();
  await page.locator('.depth-view.live figcaption', { hasText: /^Through the paper along/ }).waitFor({ timeout: 30000 });
  console.log(`   live cut through the paper: ${await page.locator('.depth-view.live canvas').evaluate((c) => `${c.width}×${c.height}`)}`);
  await page.getByRole('button', { name: 'Into the paper' }).click();
  if (webgl) {
    // the lit 2D scene lies over the pad; then a stroke written in 3D, by ray onto the page
    const lit = page.locator('.pad-scene canvas.scene-canvas');
    await lit.waitFor({ timeout: 30000 });
    await page.waitForFunction(() => { const c = document.querySelector('.pad-scene canvas.scene-canvas'); return c && c.width > 10; }, null, { timeout: 30000 });
    const drawnBy = await page.locator('.pad-scene .scene-view').getAttribute('data-gpu');
    if (drawnBy !== (webgpu ? 'webgpu' : 'webgl2')) throw new Error(`the scene is drawn with ${drawnBy}`);
    console.log(`   the lit pad, drawn with ${drawnBy === 'webgpu' ? 'WebGPU' : 'WebGL2'}`);
    await page.locator('.scene-tools-host').getByRole('button', { name: '3D' }).click();
    await page.waitForTimeout(900); // the camera's move from straight down
    const sb = await lit.boundingBox();
    await page.mouse.move(sb.x + sb.width * 0.4, sb.y + sb.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 24; i++) await page.mouse.move(sb.x + sb.width * (0.4 + i * 0.006), sb.y + sb.height * (0.5 + Math.sin(i / 4) * 0.03), { steps: 2 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.locator('.scene-tools-host').getByRole('button', { name: '2D' }).click();
    console.log('   wrote a stroke in 3D, then back to 2D');
    // show the moments of your own sheet as it is written: its ink banded by when it went down
    // (counted by the view: the candles flicker, so the pixels are no measure)
    await page.locator('.scene-tools-host').getByRole('button', { name: 'Moments' }).click();
    await page.waitForFunction(() => Number(document.querySelector('.pad-scene .scene-view')?.dataset.banded) > 0, null, { timeout: 60000 });
    const padBands = await page.locator('.pad-scene .scene-view').getAttribute('data-banded');
    await page.locator('.scene-tools-host').getByRole('button', { name: 'Moments' }).click();
    console.log(`   the pad shows the moments of what is written so far (${padBands} cells in dark bands)`);
    // low power: the scene stands down to the flat look, and comes back on the charger
    await page.evaluate(() => { e2eBattery.charging = false; e2eBattery.level = 0.1; e2eBattery.dispatchEvent(new Event('chargingchange')); });
    await page.locator('.pad-scene').waitFor({ state: 'detached', timeout: 30000 });
    await page.evaluate(() => { e2eBattery.charging = true; e2eBattery.dispatchEvent(new Event('chargingchange')); });
    await page.locator('.pad-scene canvas.scene-canvas').waitFor({ timeout: 30000 });
    console.log('   on low battery the pad goes flat; charging, the scene is back');
  } else {
    if (await page.locator('.pad-scene').count()) throw new Error('with WebGL off there should be no scene');
    console.log('   no WebGL: the flat pad, as ever');
  }
  const lookReply = page.waitForResponse((r) => r.url().includes('/look/') && r.status() === 200, { timeout: 60000 });
  await page.getByRole('button', { name: 'Place on page' }).click();
  await page.locator('.journal-page .ink-item').first().waitFor({ timeout: 60000 });
  const look = await lookReply;
  if (!/\.L2-a0-e0-/.test(look.headers().etag ?? '')) throw new Error(`the look is not a fresh law 2 look: ${look.headers().etag}`);
  const placed = await page.evaluate(async () => (await (await fetch('/api/books/tabor/ink')).text()).trim().split('\n').map((l) => JSON.parse(l)).at(-1).ink);
  if (placed.law !== 2) throw new Error(`new writing should be law 2, not ${placed.law}`);
  const format = Buffer.from(placed.acts, 'base64url')[4];
  const { decodeActs } = await import('penpals-law/v2/acts');
  const strokesIn = decodeActs(new Uint8Array(Buffer.from(placed.acts, 'base64url'))).strokes.length;
  if (strokesIn !== (webgl ? 4 : 3)) throw new Error(`the sealed acts hold ${strokesIn} strokes`);
  console.log(`   ${strokesIn} strokes sealed${webgl ? ' (one written in 3D)' : ''}`);
  if (webgl) {
    // the journal, as visitors see it, shows its writing in the scene, lit (pale fresh oak gall: any ink)
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.waitForFunction(() => {
      const c = document.querySelector('.journal-scene canvas');
      if (!c || c.width < 10) return false;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const paper = [d[0], d[1], d[2]];
      let ink = 0;
      for (let i = 0; i < d.length; i += 4 * 7) if (Math.abs(d[i] - paper[0]) + Math.abs(d[i + 1] - paper[1]) + Math.abs(d[i + 2] - paper[2]) > 45) ink++;
      return ink > 20;
    }, null, { timeout: 60000 });
    console.log('   the journal page shows it in the scene');
    // its page lies under its sheets, not the desk: the corners are the page's paper, lit like the sheet
    const sides = await page.evaluate(() => {
      const c = document.querySelector('.journal-scene canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const at = (x, y) => { const k = 4 * (Math.floor(y) * c.width + Math.floor(x)); return [d[k], d[k + 1], d[k + 2]]; };
      return { corner: at(4, 4), far: at(c.width - 5, c.height - 5) };
    });
    if (sides.corner.join() !== sides.far.join() && Math.abs(sides.corner[0] - sides.far[0]) > 30) throw new Error(`the page's corners differ: ${sides.corner} vs ${sides.far}`);
    const deskish = (p) => Math.abs(p[0] - p[1]) < 8 && Math.abs(p[1] - p[2]) < 8 && p[0] < 200;
    if (deskish(sides.corner)) throw new Error(`the journal page shows the desk, not its page: ${sides.corner}`);
    await page.locator('.journal-page').screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-journal.png') });
    // your own sheet on the page: its moments too
    await page.locator('.journal-scene .scene-tools').getByRole('button', { name: 'Moments' }).click();
    await page.waitForFunction(() => Number(document.querySelector('.journal-scene')?.dataset.banded) > 0, null, { timeout: 60000 });
    console.log(`   and its moments, banded (${await page.locator('.journal-scene').getAttribute('data-banded')} cells)`);
    await page.getByRole('button', { name: 'Back to editing' }).click();
    await page.locator('.journal-page .ink-item').first().click(); // selected again, for walking back
  } else if (await page.locator('.journal-scene').count()) throw new Error('with WebGL off the journal shows the flat look');
  if (format !== 2) throw new Error(`the flex nib's spatter should be in the acts (PNKA format 2), got format ${format}`);
  console.log(`   law ${placed.law}, PNKA format ${format} (the pen's spatter), ${placed.acts.length} chars of acts, look ${look.headers().etag}`);

  step('walk back a spot of it, then look into the paper');
  await page.getByRole('button', { name: 'Walk back' }).click();
  const art = page.locator('.walk-back-art');
  const ab = await art.boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.3, ab.y + ab.height * 0.5);
  await page.locator('.trace dt', { hasText: 'settled' }).waitFor({ timeout: 60000 });
  console.log('  ', (await page.locator('.trace').innerText()).replace(/\s+/g, ' ').slice(0, 220), '…');
  await page.getByRole('button', { name: /^Side view/ }).click();
  await page.waitForFunction(() => { const i = document.querySelector('.depth-view img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 60000 });
  const sideW = await page.locator('.depth-view img').evaluate((i) => `${i.naturalWidth}×${i.naturalHeight}`);
  if (webgl) {
    await page.getByRole('button', { name: 'Scene', exact: true }).click();
    await page.locator('.walk-back-scene canvas').waitFor({ timeout: 60000 });
    await page.locator('.walk-back-scene .scene-tools').getByRole('button', { name: 'Moments' }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.walk-back-scene .scene-tools button[aria-pressed="true"]')].some((b) => b.textContent === 'Moments'), null, { timeout: 60000 });
    // cut through it: the far side is cut away, so more of the desk shows (the desk is unlit: the candles do not move it)
    const deskSeen = () => {
      const c = document.querySelector('.walk-back-scene canvas');
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const desk = [d[0], d[1], d[2]];
      let n = 0;
      for (let i = 0; i < d.length; i += 4 * 5) if (Math.abs(d[i] - desk[0]) + Math.abs(d[i + 1] - desk[1]) + Math.abs(d[i + 2] - desk[2]) < 6) n++;
      return n;
    };
    await page.waitForTimeout(800);
    const before = await page.evaluate(deskSeen);
    await page.locator('.walk-back-scene .scene-tools').getByRole('button', { name: 'Cut' }).click();
    const wb = await page.locator('.walk-back-scene canvas').boundingBox();
    await page.mouse.move(wb.x + wb.width * 0.2, wb.y + wb.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(wb.x + wb.width * 0.8, wb.y + wb.height * 0.5, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(`(${deskSeen})() > ${before} * 1.02 + 20`, null, { timeout: 60000 });
    console.log(`   side view ${sideW}; the sheet in the scene, its moments banded, cut through`);
  } else console.log(`   side view ${sideW}`);
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
  if (webgl) {
    await tab.locator('.letter-scene canvas').waitFor({ timeout: 60000 }).catch(() => null);
    await tab.waitForTimeout(1500);
    const lb = await tab.locator('.pad-letter').first().boundingBox().catch(() => null);
    console.log(`   the letter in the scene: ${lb ? `${Math.round(lb.width)}×${Math.round(lb.height)}` : 'not shown'}${await tab.locator('.letter-scene').count() ? ', lit' : ''}`);
    if (!lb || lb.width < 50) throw new Error('the letter has no size');
    await tab.locator('.pad-letter').first().scrollIntoViewIfNeeded();
    await tab.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-letter.png') });
  }
  step('the letter being written, as a video the server films');
  const [ld] = await Promise.all([tab.waitForEvent('download', { timeout: 120000 }), tab.getByRole('button', { name: 'Video', exact: true }).click()]);
  const lf = path.join(dataDir, ld.suggestedFilename());
  await ld.saveAs(lf);
  const lv = fs.readFileSync(lf);
  if (!(lv[0] === 0x1a && lv[1] === 0x45)) throw new Error(`the letter video is not a WebM file (${ld.suggestedFilename()})`);
  await tab.close(); // done with the second tab (a background tab would stop drawing; headless ones do not)

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
  await page.fill('#pw-next', 'correct horse battery');
  await page.fill('#pw-next2', 'correct horse battery');
  for (let attempt = 1; ; attempt++) {
    await draw(page, page.locator('.password-setting .pad canvas.ink').first(), phrase(0.002));
    await page.getByRole('button', { name: 'Save' }).click();
    if (await page.locator('.password-setting strong', { hasText: 'on' }).waitFor({ timeout: 60000 }).then(() => true, () => false)) break;
    const said = await page.locator('.password-setting .error').textContent().catch(() => '?');
    if (attempt === 5) throw new Error(`could not add the password: ${said}`);
    console.log(`  attempt ${attempt}:`, said); // (the pad starts again; the passwords stay)
  }
  await page.locator('button.logout').click();
  await page.goto(base);
  await page.locator('#in-name').waitFor();
  await openByWriting(page, { unlock: false, password: 'correct horse battery', done: () => page.locator('button.logout').waitFor({ timeout: 60000 }) });
  console.log('\nthe whole flow works');
} catch (err) {
  if (err.ok) {
    console.log(`\n${err.message}`);
  } else {
  failed = err;
  console.error('\nFAILED:', err.message);
  const shot = path.join(os.tmpdir(), 'penpals-e2e-failed.png');
  await globalThis.e2ePage?.screenshot({ path: shot, fullPage: true }).then(() => console.error('screenshot:', shot)).catch(() => {});
  console.error('on the page:', await globalThis.e2ePage?.locator('.error').allTextContents().catch(() => []));
  console.error(serverLog.split('\n').slice(-20).join('\n'));
  }
} finally {
  await browser.close();
  server.kill();
  await vite?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
