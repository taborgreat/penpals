// Your room (rooms.md Phase 1), in a real browser, the way a person goes:
// the lobby, seen in black and white; registering on its paper; the eye closing
// and opening in your own room, where colour comes in; looking around (Look),
// pulling your book down from the shelf, writing on a wall and placing it there,
// where it stays: a sheet of the book, on the wall.
//   node frontend/e2e/room.mjs            through a Vite dev server (and a backend on a fresh data dir)
//   node frontend/e2e/room.mjs --webgpu   in the full Chromium on this machine's GPU
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'penpals-room-'));
const PORT = 3124;
const step = (msg) => console.log(`· ${msg}`);

const server = spawn(process.execPath, ['src/server.js'], {
  cwd: path.join(root, 'backend'),
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), RENDER_WORKERS: '1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => (serverLog += d));
server.stderr.on('data', (d) => (serverLog += d));
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`server did not start: ${serverLog}`)), 20000);
  server.stdout.on('data', () => {
    if (serverLog.includes('listening')) {
      clearTimeout(t);
      resolve();
    }
  });
});
process.env.API_URL = `http://localhost:${PORT}`;
const { createServer } = await import('vite');
const vite = await createServer({
  root: path.join(root, 'frontend'),
  configFile: path.join(root, 'frontend', 'vite.config.js'),
  logLevel: 'error',
  server: { port: 5198, host: 'localhost', strictPort: true },
});
await vite.listen();
const base = 'http://localhost:5198';

function signature(wobble = 0) {
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
const cdps = new WeakMap();
async function cdpOf(page) {
  if (!cdps.has(page)) cdps.set(page, await page.context().newCDPSession(page));
  return cdps.get(page);
}
// strokes in a box of the screen ({ x, y, width, height }), stamped like a device's
async function strokesIn(page, b, strokes, ms = 9) {
  const cdp = await cdpOf(page);
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
      if (lag > 0) await page.waitForTimeout(lag);
    }
    t += ms;
    await send('mouseReleased', at(s.at(-1)), t, 0);
    await page.waitForTimeout(Math.max(0, t - Date.now()) + 120);
  }
}
// sign on the pad, as the flow does (in 3D: where the page is in the view)
async function sign(page, strokes) {
  await page
    .locator('.pad')
    .first()
    .evaluate((el) => el.scrollIntoView({ block: 'center' })); // the desk is under the room: the pad into view
  await page.locator('.pad-scene .scene-view[data-gpu]').first().waitFor({ timeout: 60000 });
  const lit = page.locator('.pad-scene canvas.scene-canvas').first();
  await lit.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const v = await lit.boundingBox();
  await strokesIn(page, { x: v.x + v.width * 0.24, y: v.y + v.height * 0.4, width: v.width * 0.52, height: v.height * 0.22 }, strokes);
}
// a drag of the mouse (the hand turning the head)
async function drag(page, from, by, steps = 20) {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(from[0] + (by[0] * i) / steps, from[1] + (by[1] * i) / steps);
  await page.mouse.up();
}
// what an element shows (the scene may draw straight into its canvas): fn(d, w, h) over its pixels
async function onScreen(page, selector, fn) {
  // (the page, cut to the element as it is on screen: no waiting for it to hold still)
  const b = await page.locator(selector).first().boundingBox();
  const vw = page.viewportSize();
  const clip = { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(vw.width, b.x + b.width) - Math.max(0, b.x), height: Math.min(vw.height, b.y + b.height) - Math.max(0, b.y) };
  const png = await page.screenshot({ clip });
  const { w, h, b64 } = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    let s = '';
    for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return { w: img.width, h: img.height, b64: btoa(s) };
  }, png.toString('base64'));
  return fn(new Uint8Array(Buffer.from(b64, 'base64')), w, h);
}
// colour in a picture: the mean spread of r, g, b, and its mean brightness (0..255)
const colourOf = (d) => {
  let spread = 0,
    lum = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 16) {
    spread += Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    lum += (d[i] + d[i + 1] + d[i + 2]) / 3;
    n++;
  }
  return { spread: spread / n, lum: lum / n };
};
// the picture's pixels, kept (to compare two moments of the same view)
const pixels = (d, w, h) => ({ d: new Uint8Array(d), w, h });
// how many pixels of the middle (share of each side) are darker in `b` than in `a` by more than `by`
const darkened = (a, b, share = 0.3, by = 10) => {
  let n = 0;
  for (let y = Math.floor(a.h * (0.5 - share / 2)); y < a.h * (0.5 + share / 2); y++) {
    for (let x = Math.floor(a.w * (0.5 - share / 2)); x < a.w * (0.5 + share / 2); x++) {
      const i = (y * a.w + x) * 4;
      if ((a.d[i] + a.d[i + 1] + a.d[i + 2]) / 3 - (b.d[i] + b.d[i + 1] + b.d[i + 2]) / 3 > by) n++;
    }
  }
  return n;
};

const webgpu = process.argv.includes('--webgpu');
const browser = await chromium.launch(webgpu ? { channel: 'chromium', args: ['--enable-unsafe-webgpu'] } : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = null;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('  [page error]', err.message));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console error]', m.text());
  });
  await page.goto(base);

  step('the lobby: the room everyone comes in by, seen in black and white');
  await page.locator('.lobby-scene[data-gpu]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500); // the room's light settles, the eye on it
  const lobby = await onScreen(page, '.lobby-scene', colourOf);
  console.log(`   colour spread ${lobby.spread.toFixed(1)}, brightness ${lobby.lum.toFixed(0)}`);
  if (lobby.spread > 2.5) throw new Error(`the lobby is not in black and white (spread ${lobby.spread.toFixed(1)})`);
  if (lobby.lum < 4) throw new Error('the lobby is dark');

  step('register at the desk: sign three times on its paper, the name, keep the key');
  await page
    .getByRole('button', { name: /register/i })
    .first()
    .click();
  for (let i = 1; i <= 3; i++) {
    await page.getByText(`Signature ${i} of 3`).waitFor({ timeout: 30000 });
    await sign(page, signature(0.002 * i));
    await page.getByRole('button', { name: 'Done' }).click();
  }
  await page.locator('#reg-name').waitFor({ timeout: 60000 });
  await page.fill('#reg-name', 'tabor');
  await page.getByText('free', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('I have kept my words or my private key').click();
  await page.getByRole('button', { name: 'Make my account' }).click();

  step('the eye closes, and opens in your own room');
  await page.waitForURL(/\/u\/tabor$/, { timeout: 90000 });
  const me = await (await page.request.get(`${base}/api/users/tabor`)).json();
  if (!me.user.timeZone) throw new Error('the room has no clock');
  console.log(`   the room keeps its own time: ${me.user.timeZone}`);
  await page.getByRole('button', { name: 'Preview' }).click();
  const scene = '.journal-scene';
  await page.locator(`${scene}[data-gpu]`).waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000); // colour comes in as the eye adapts
  const room = await onScreen(page, scene, colourOf);
  console.log(`   colour spread ${room.spread.toFixed(1)} (the lobby's ${lobby.spread.toFixed(1)})`);
  if (room.spread < lobby.spread + 3) throw new Error('colour did not come in');

  step('Look: turn to the left wall, where the shelf is, and pull your book down');
  await page.locator(scene).evaluate((el) => el.scrollIntoView({ block: 'center' })); // its middle on screen: the head turns about it
  await page.waitForTimeout(400);
  await page.locator(`${scene} .scene-tools`).getByRole('button', { name: 'Look' }).click();
  await page.locator(`${scene} .scene-tools`).getByRole('button', { name: 'Pen' }).click(); // the hand turns the head
  // the scene's middle on screen (clicking its tools may have scrolled it)
  const centre = async () => {
    await page.locator(scene).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(200);
    const b = await page.locator(`${scene} canvas.scene-canvas`).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  let mid = await centre();
  await drag(page, mid, [-360, 0]); // the head turns: 90° to the left
  const turned = await page.evaluate(() => globalThis.__sceneLook?.pose()?.yaw);
  if (!(turned < -60)) throw new Error(`the head did not turn (${turned})`);
  // the first book's spine (scene/shelf.js: the board on the left wall, the books on it)
  await page.evaluate(() => globalThis.__sceneLook.aim([0.175, 2.31, 1.52]));
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-look.png') });
  await page.mouse.click(...mid);
  await page.locator('.book-open').waitFor({ timeout: 10000 });
  console.log('   the book, open: ' + (await page.locator('.book-open button').allTextContents()).join(' · '));
  await page.getByRole('button', { name: 'Put it back' }).click();
  mid = await centre();

  step('write on the wall below the shelf, and place it there');
  // come up close to the bare plaster under the shelf, as one does to write on a wall
  await page.evaluate(() => {
    globalThis.__sceneLook.at([0.4, 2.0, 1.15]);
    globalThis.__sceneLook.aim([0, 2.0, 1.15]);
  });
  await page.waitForTimeout(600);
  await page.waitForTimeout(600);
  const before = await onScreen(page, scene, pixels);
  await page.locator(`${scene} .scene-tools`).getByRole('button', { name: 'Hand' }).click(); // the pen again
  mid = await centre();
  const w = 140;
  await strokesIn(page, { x: mid[0] - w / 2, y: mid[1] - 20, width: w, height: 40 }, signature(0.001));
  await page.locator('.wall-tools').waitFor({ timeout: 10000 });
  // the ink as it is written (the worker's tiles come a moment after the pen)
  let live = 0;
  for (let i = 0; i < 20 && live < 150; i++) {
    await page.waitForTimeout(300);
    live = darkened(before, await onScreen(page, scene, pixels));
  }
  await page.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-wall.png') });
  console.log(`   ${live} pixels of the wall darkened by the ink as it is written`);
  if (live < 150) throw new Error('the ink does not show on the wall');
  const placed = page.waitForResponse((r) => r.url().endsWith('/api/books/me/ink') && r.request().method() === 'POST', { timeout: 60000 });
  await page.getByRole('button', { name: 'Place it there' }).click();
  const res = await placed;
  if (res.status() !== 201) throw new Error(`placing on the wall: ${res.status()} ${await res.text()}`);
  const book = await (await page.request.get(`${base}/api/books/me`)).json();
  const onWall = Object.entries(book.skeleton.surfaces).filter(([, f]) => f.items.length);
  if (onWall.length !== 1 || onWall[0][0] !== 'wall-left') throw new Error(`the writing is not on the left wall: ${JSON.stringify(onWall.map(([id, f]) => [id, f.items.length]))}`);
  console.log(`   on the ${onWall[0][0]}: ${JSON.stringify(onWall[0][1].items[0])}`);
  await page.locator('.wall-tools').waitFor({ state: 'detached', timeout: 30000 });
  mid = await centre(); // (the page moved when the tools went: the same framing as before)
  // its look comes back from the book: grown again here from its seed, laid on the wall
  let after = 0;
  for (const end = Date.now() + 30000; Date.now() < end && after < 150;) {
    await page.waitForTimeout(500);
    after = darkened(before, await onScreen(page, scene, pixels));
  }
  console.log(`   placed: ${after} pixels darker than the bare wall`);
  if (after < 150) throw new Error('the placed writing does not show on the wall');
  await page.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-room.png') });
  console.log(`   (a picture: ${path.join(os.tmpdir(), 'penpals-e2e-room.png')})`);
  console.log('ok: the lobby, your room, the shelf, a wall written on');
} catch (err) {
  failed = err;
} finally {
  await browser.close();
  await vite.close();
  server.kill();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
if (failed) {
  console.error('FAILED:', failed.message);
  if (serverLog.includes('Error')) console.error(serverLog.slice(-2000));
  process.exit(1);
}
