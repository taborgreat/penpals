// What the e2e checks of the world share (flow.mjs, room.mjs): a backend on a fresh data dir
// serving the built site, the full Chromium on this machine's GPU, a hand's strokes stamped like a
// device's, what the screen shows, the world's one panel, and registering at the lobby's table.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const step = (msg) => console.log(`· ${msg}`);

// The backend on `port`, serving the built site (npm run build -w frontend first), its data in a fresh dir.
export async function serve(port, prefix = 'penpals-e2e-') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.join(root, 'backend'),
    env: { ...process.env, DATA_DIR: dataDir, PORT: String(port), RENDER_WORKERS: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`server did not start: ${log}`)), 20000);
    server.stdout.on('data', () => {
      if (log.includes('listening')) {
        clearTimeout(t);
        resolve();
      }
    });
  });
  return { base: `http://localhost:${port}`, dataDir, log: () => log, stop: () => server.kill() };
}

// The full Chromium on the GPU (WebGPU), a battery on the charger (low power would put the world away).
export const launch = () => chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
export async function personIn(browser, { downloads = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: downloads });
  await context.addInitScript(() => {
    const battery = new EventTarget();
    battery.charging = true;
    battery.level = 1;
    Object.defineProperty(navigator, 'getBattery', { value: async () => battery });
  });
  const page = await context.newPage();
  return { context, page };
}
export const watch = (page, who = '') => {
  page.on('pageerror', (err) => console.log(`  [${who}page error]`, err.message));
  page.on('crash', () => console.log(`  [${who}page crashed]`));
  page.on('console', (m) => m.type() === 'error' && console.log(`  [${who}console error]`, m.text()));
};

// A name signed in a steady hand: a few loops, the same every time (with the small wobble of a real hand).
export function signature(wobble = 0) {
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
// a line across a box, as a hand writes it: from a to b (each [u, v] of the box)
export const across = (a, b, n = 28) => [[...Array(n).keys()].map((i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)])];

// Strokes in a box of the screen ({ x, y, width, height }), stamped evenly like a device's (the
// timing is part of the record). The world's first frames wait on its shaders: until they come,
// nothing is drawn.
const cdps = new WeakMap();
export async function strokesIn(page, b, strokes, ms = 9) {
  await page.waitForFunction(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true)))), null, { timeout: 120000, polling: 1000 });
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
      if (lag > 0) await page.waitForTimeout(lag);
    }
    t += ms;
    await send('mouseReleased', at(s.at(-1)), t, 0);
    await page.waitForTimeout(Math.max(0, t - Date.now()) + 120);
  }
}

// What a box of the screen shows ({ x, y, width, height }, or an element's selector): fn(d, w, h)
// over its pixels (the page decodes the picture: the site's CSP allows no eval in it).
export async function onScreen(page, where, fn) {
  const clip = typeof where === 'string' ? await page.locator(where).first().boundingBox() : where;
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
export const colourOf = (d) => {
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
export const pixels = (d, w, h) => ({ d: new Uint8Array(d), w, h });
// how many pixels of the middle (a share of each side) are darker in `b` than in `a` by more than `by`
export const darkened = (a, b, share = 0.3, by = 10) => {
  let n = 0;
  for (let y = Math.floor(a.h * (0.5 - share / 2)); y < a.h * (0.5 + share / 2); y++) {
    for (let x = Math.floor(a.w * (0.5 - share / 2)); x < a.w * (0.5 + share / 2); x++) {
      const i = (y * a.w + x) * 4;
      if ((a.d[i] + a.d[i + 1] + a.d[i + 2]) / 3 - (b.d[i] + b.d[i + 1] + b.d[i + 2]) / 3 > by) n++;
    }
  }
  return n;
};

// The world's one panel, by its title.
export const panel = (page, title) => page.locator(`aside.panel[aria-label="${title}"]`);
// The world's view (the scene filling the window) and the part of it the panel does not cover.
export async function worldView(page, selector = '.house-scene') {
  await page.locator(`${selector}[data-gpu]`).waitFor({ timeout: 60000 });
  const v = await page.locator(`${selector} canvas.scene-canvas`).boundingBox();
  return { view: v, clear: { x: v.x, y: v.y, width: v.width * 0.55, height: v.height } };
}

// Register at the lobby's table: sign the name three times on its slip, the pen in hand; the name;
// keep the key (no password). → { words, privateKey }; the eye opens in your house, your first paper on its table.
export async function register(page, name) {
  await panel(page, 'Come in').waitFor({ timeout: 30000 });
  await page
    .getByRole('button', { name: /register/i })
    .first()
    .click();
  const lobby = page.locator('.lobby-scene canvas.scene-canvas');
  await page.locator('.lobby-scene[data-gpu]').waitFor({ timeout: 60000 });
  const lv = await lobby.boundingBox();
  const slip = { x: lv.x + lv.width * 0.3, y: lv.y + lv.height * 0.4, width: lv.width * 0.28, height: lv.height * 0.2 }; // (on the slip, left of the panel)
  for (let i = 1; i <= 3; i++) {
    await page.getByText(`Signature ${i} of 3`).waitFor({ timeout: 30000 });
    await strokesIn(page, slip, signature(0.002 * i + name.length * 0.001));
    await page.getByRole('button', { name: 'Done' }).click();
  }
  await page.locator('#reg-name').waitFor({ timeout: 60000 });
  await page.fill('#reg-name', name);
  await page.getByText('free', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  const words = (await page.locator('.key-words li').allTextContents()).join(' ');
  const privateKey = await page.locator('#reg-private').inputValue();
  await page.getByText('I have kept my words or my private key').click();
  await page.getByRole('button', { name: 'Make my account' }).click();
  // the eye opens in your house, at your table, your hands free, your first paper lying before you
  await panel(page, 'At your table').waitFor({ timeout: 90000 });
  await page.waitForFunction(() => globalThis.__papers?.lying().some((p) => p.mayWrite), null, { timeout: 90000, polling: 500 });
  return { words, privateKey };
}

// How high the sun stands now at the world's place (degrees): the room's light is the sun's by day.
export async function sunNow() {
  const { sunAt } = await import('penpals-law/sun');
  return (Math.asin(Math.max(-1, Math.min(1, sunAt(Date.now())[2]))) * 180) / Math.PI;
}
