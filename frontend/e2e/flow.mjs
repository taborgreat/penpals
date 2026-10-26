// The whole flow in a real browser, the way a person goes through it, in the
// one world (one-world.md): register in the panel by signing the name three
// times (the key is made from them), choose the name, keep the 24 words and the
// private key; the eye opens in your house, on its plot; at the table, new
// paper, the pen in hand, write on it and seal it into the book; stand up,
// walk, jump, fly, look closer; pick the writing up (E), walk it back, film
// it, set it down elsewhere; pull the book from the shelf and download it;
// your account at the corner (the words, a password backup); a visitor at the
// door; log out; log in with the words; unlock a new tab with the private key;
// check the book with the law's verifier; log in with the password.
// Not here until they exist in the world: letters (a sheet carried to a
// mailbox, one-world.md), the pad's own checks (the write page is gone; the
// pad is in /pad-check), the scene's dev tools (Moments, Cut: /scene-check). Letters are sheets carried to a
// mailbox (e2e/mail.mjs).
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
import { roomGeometry, ROOM, cornerOf } from '../src/scene/light/room.js';

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
server.stdout.on('data', (d) => {
  serverLog += d;
});
server.stderr.on('data', (d) => {
  serverLog += d;
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`server did not start: ${serverLog}`)), 20000);
  server.stdout.on('data', () => {
    if (serverLog.includes('listening')) {
      clearTimeout(t);
      resolve();
    }
  });
});

let vite = null;
if (process.argv.includes('--dev')) {
  process.env.API_URL = base;
  const { createServer } = await import('vite');
  vite = await createServer({
    root: path.join(root, 'frontend'),
    configFile: path.join(root, 'frontend', 'vite.config.js'),
    logLevel: 'error',
    server: { port: 5199, host: 'localhost', strictPort: true },
  });
  await vite.listen();
  base = 'http://localhost:5199';
  console.log('(through the Vite dev server)');
}

// A name signed in a steady hand: a few loops, the same every time (with the
// small wobble of a real hand).
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
// when the test happens to dispatch them: the timing is part of the record.
const cdps = new WeakMap();
// `area`: { x, y, width, height } on screen to write in (the world's scene), else the pad's own.
async function draw(page, canvas, strokes, ms = 9, area = null) {
  // the world's first frames wait on its shaders (a fresh browser compiles them all): until frames come, nothing is drawn
  await page.waitForFunction(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => ok(true)))), null, { timeout: 120000, polling: 1000 });
  await canvas.scrollIntoViewIfNeeded();
  let b = area ?? (await canvas.boundingBox());
  // a pad shown in 3D: write where the page is in the view (its middle), by ray onto the page
  // (with WebGL the pad is always shown in 3D: wait for its scene, which a slow GPU draws late)
  if (webgl && !area) await page.locator('.pad-scene .scene-view[data-gpu]').first().waitFor({ timeout: 60000 });
  const lit = page.locator('.pad-scene canvas.scene-canvas').first();
  if (!area && (await lit.isVisible().catch(() => false))) {
    await lit.evaluate((el) => el.scrollIntoView({ block: 'center' })); // all of it on screen: no stroke falls past the window's edge
    const v = await lit.boundingBox();
    b = { x: v.x + v.width * 0.24, y: v.y + v.height * 0.4, width: v.width * 0.52, height: v.height * 0.22 };
  }
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

// What an element shows on screen (the scene may draw straight into its own
// canvas, which has no 2D picture to read): `fn(d, w, h)` over its pixels, here
// (the page decodes the screenshot; the site's CSP allows no eval in it).
async function onScreen(page, selector, fn) {
  const png = await page.locator(selector).first().screenshot();
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
async function untilOnScreen(page, selector, fn, timeout = 60000) {
  let why = 'not yet';
  for (const end = Date.now() + timeout; ;) {
    if (
      await onScreen(page, selector, fn).catch((err) => {
        why = err.message.split('\n')[0];
        return false;
      })
    )
      return;
    if (Date.now() > end) throw new Error(`${selector} never showed what was looked for (${why})`);
    await page.waitForTimeout(500);
  }
}

// Sign in (or unlock a tab) with the name and one of the password, the 24 words or the private key.
async function openWith(page, { unlock, way, secret, done }) {
  if (!unlock) await page.fill('#in-name', 'tabor');
  await page.getByRole('tab', { name: { password: 'Password', words: '24 words', key: 'Private key' }[way] }).click();
  await page.fill({ password: '#in-pw', words: '#in-words', key: '#in-key' }[way], secret);
  await page
    .getByRole('button', { name: unlock ? 'Unlock' : /Log in/ })
    .last()
    .click();
  await done().catch(async (err) => {
    throw new Error(
      `${err.message} (${await page
        .locator('.signin .error')
        .textContent()
        .catch(() => 'no error shown')})`,
    );
  });
}

const webgl = !process.argv.includes('--no-webgl');
const webgpu = webgl && process.argv.includes('--webgpu');
const browser = await chromium.launch(
  webgpu
    ? { channel: 'chromium', args: ['--enable-unsafe-webgpu'] }
    : { args: webgl ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'] },
);
if (!webgl) console.log('(WebGL off: the flat look everywhere)');
if (webgpu) console.log('(the full Chromium, on the GPU: the scene with WebGPU)');
let failed = null;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
  // a battery on the charger (the Battery Status API): low power would put the scene, the world, away
  const charged = () => {
    const battery = new EventTarget();
    battery.charging = true;
    battery.level = 1;
    window.e2eBattery = battery;
    Object.defineProperty(navigator, 'getBattery', { value: async () => battery });
  };
  await context.addInitScript(charged);
  const page = await context.newPage();
  globalThis.e2ePage = page;
  // --slow: registration on a slow device (the CPU throttled), where each step's new sheet arrives late
  const slow = process.argv.includes('--slow') ? await context.newCDPSession(page) : null;
  if (slow) await slow.send('Emulation.setCPUThrottlingRate', { rate: 8 });
  page.on('pageerror', (err) => console.log('  [page error]', err.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') console.log(`  [console ${m.type()}]`, m.text());
  });
  await page.goto(base);
  const panel = (p, title) => p.locator(`aside.panel[aria-label="${title}"]`);

  step('register: sign the name three times on the paper on the lobby’s table, the pen in hand; the key is made from them');
  await panel(page, 'Come in').waitFor({ timeout: 30000 });
  await page
    .getByRole('button', { name: /register/i })
    .first()
    .click();
  if (!webgl) throw Object.assign(new Error('stopped: with WebGL off there is no world to sign in (the scene is the world)'), { ok: true });
  const lobby = page.locator('.lobby-scene canvas.scene-canvas');
  await page.locator('.lobby-scene[data-gpu]').waitFor({ timeout: 60000 });
  if ((await page.locator('aside.panel canvas.scene-canvas, aside.panel .pad').count()) > 0) throw new Error('the panel holds a scene or a pad of its own: there is one world');
  const lv = await lobby.boundingBox();
  const slip = { x: lv.x + lv.width * 0.3, y: lv.y + lv.height * 0.4, width: lv.width * 0.28, height: lv.height * 0.2 }; // (on the slip, left of the panel)
  for (let i = 1; i <= 3; i++) {
    await page.getByText(`Signature ${i} of 3`).waitFor({ timeout: 30000 });
    await draw(page, lobby, signature(0.002 * i), 9, slip);
    await page.getByRole('button', { name: 'Done' }).click();
  }
  step('register: the name');
  await page.locator('#reg-name').waitFor({ timeout: 60000 });
  await page.fill('#reg-name', 'tabor');
  await page.getByText('free', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  step('register: keep the key (24 words, the private key), no password');
  const words = (await page.locator('.key-words li').allTextContents()).join(' ');
  const privateKey = await page.locator('#reg-private').inputValue();
  if (words.split(' ').length !== 24) throw new Error(`not 24 words: ${words}`);
  if (!privateKey.startsWith('penpals-key-1:')) throw new Error(`not a private key: ${privateKey}`);
  await page.getByText('I have kept my words or my private key').click();
  await page.getByRole('button', { name: 'Make my account' }).click();
  // the eye closes, and opens in your house: seated in the same place at your own table, the pen in your hand, before a fresh sheet
  await panel(page, 'The pen in your hand').locator('.fresh-sheet').waitFor({ timeout: 90000 });
  step('registered: the eye opens in your house, at your table, the pen in hand, a fresh sheet before you');
  if (slow) {
    await slow.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log('(registered on a CPU throttled 8×)');
  }
  if (process.argv.includes('--only-register')) throw Object.assign(new Error('stopped after registering'), { ok: true });

  step('your house stands on the first plot around the start, placed by an act of your key');
  const houses = (await page.evaluate(async () => (await fetch('/api/world')).json())).houses;
  const house = houses.find((h) => h.name === 'tabor');
  if (!house || house.plot.join() !== '1,0' || house.n !== 1) throw new Error(`no house on the first plot: ${JSON.stringify(houses)}`);
  console.log(`   plot [${house.plot}], ${house.at.join(' m, ')} m from the start`);

  const scene = page.locator('.journal-scene canvas.scene-canvas');
  await page.locator('.journal-scene[data-gpu]').waitFor({ timeout: 60000 });
  const drawnBy = await page.locator('.journal-scene').getAttribute('data-gpu');
  if (drawnBy !== (webgpu ? 'webgpu' : 'webgl2')) throw new Error(`the world is drawn with ${drawnBy}`);
  const view = await scene.boundingBox();
  if (view.height < 900) throw new Error(`the world does not fill the window (${Math.round(view.height)} px tall)`);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 2) throw new Error(`the page runs ${wide}px off to the side`);
  console.log(`   the house fills the window, drawn with ${drawnBy === 'webgpu' ? 'WebGPU' : 'WebGL2'}`);
  const middle = { x: view.x + view.width * 0.38, y: view.y + view.height * 0.42, width: view.width * 0.24, height: view.height * 0.16 };
  const onInk = { x: middle.x + middle.width * 0.5, y: middle.y + middle.height * 0.12 }; // (where scribble(1, …) lays its line)
  const pose = () => page.evaluate(() => globalThis.__sceneLook?.pose() ?? null);
  const inkLines = () =>
    page.evaluate(async () =>
      (await (await fetch('/api/books/tabor/ink')).text())
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l)),
    );
  const homeItems = () =>
    page.evaluate(async () => {
      const b = await (await fetch('/api/books/tabor')).json();
      return b.skeleton.pages[b.skeleton.home].items;
    });

  step('the pen set down (H): at the table with nothing in hand, new paper, a whole page, cream and ruled');
  await scene.focus();
  await page.keyboard.press('h');
  await panel(page, 'At your table').waitFor({ timeout: 10000 });
  await panel(page, 'At your table').getByRole('button', { name: 'Cream' }).click();
  await panel(page, 'At your table').getByLabel('Lines').selectOption({ label: 'ruled, 8 mm' });
  await page.waitForFunction(async () => {
    const b = await (await fetch('/api/books/tabor')).json();
    const p = b.skeleton.pages[b.skeleton.home];
    return p.background === '#f2e8d0' && p.rule > 0;
  });
  await panel(page, 'At your table').getByRole('button', { name: 'full' }).click();
  await panel(page, 'At your table').getByRole('button', { name: 'New paper' }).click();
  await panel(page, 'At your table')
    .getByText(/A fresh sheet on the table: 0 strokes/)
    .waitFor({ timeout: 30000 });

  step('the pen in hand (H): oak gall; write on the sheet in the scene, seated');
  await scene.focus();
  await page.keyboard.press('h');
  await panel(page, 'The pen in your hand').waitFor({ timeout: 10000 });
  await panel(page, 'The pen in your hand').getByRole('button', { name: 'Oak gall' }).click();
  await draw(page, scene, scribble(1, 3), 9, middle);
  await panel(page, 'The pen in your hand')
    .getByText(/A fresh sheet on the table: 3 strokes/)
    .waitFor({ timeout: 30000 })
    .catch(async (err) => {
      throw new Error(
        `${err.message} (${await panel(page, 'The pen in your hand')
          .locator('.fresh-sheet')
          .textContent()
          .catch(() => 'no sheet')})`,
      );
    });
  step('the pen set down (H): seal the sheet into the book, where it lies');
  await page.keyboard.press('h');
  await panel(page, 'At your table').getByRole('button', { name: 'Seal it into the book' }).click();
  await panel(page, 'At your table').locator('.fresh-sheet').waitFor({ state: 'detached', timeout: 60000 });
  const placed = (await inkLines()).at(-1).ink;
  if (placed.law !== 2) throw new Error(`new writing should be law 2, not ${placed.law}`);
  const format = Buffer.from(placed.acts, 'base64url')[4];
  if (format !== 2) throw new Error(`the flex nib's spatter should be in the acts (PNKA format 2), got format ${format}`);
  const { decodeActs } = await import('penpals-law/v2/acts');
  const strokesIn = decodeActs(new Uint8Array(Buffer.from(placed.acts, 'base64url'))).strokes.length;
  if (strokesIn !== 3) throw new Error(`the sealed acts hold ${strokesIn} strokes`);
  await untilOnScreen(page, '.journal-scene', (d) => {
    let ink = 0;
    for (let i = 0; i < d.length; i += 4 * 7) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 45) ink++;
    return ink > 20;
  });
  const [item] = await homeItems();
  console.log(`   ${strokesIn} strokes, law ${placed.law}, PNKA format ${format}, on the page at ${item.x}, ${item.y}, shown in the scene`);
  if (process.env.FLOW_SHOT) await page.screenshot({ path: process.env.FLOW_SHOT }); // (to look at the scene by eye)

  // Until `test(pose)` holds: the scene steps at most 50 ms of time a frame, so a slow GPU walks slower in
  // wall-clock time, not shorter. → that pose
  const until = async (test, what, ms = 20000) => {
    let q = null;
    for (const end = Date.now() + ms; Date.now() < end; await page.waitForTimeout(60)) {
      q = await pose();
      if (q && test(q)) return q;
    }
    throw new Error(`${what}: ${JSON.stringify(q)}`);
  };
  step('the keys: S stands you up and walks you back from the table');
  await scene.focus();
  await page.keyboard.down('s');
  const seat = [1.524, 2.383];
  const walked = await until((q) => q.mode === 'walk' && Math.hypot(q.pos[0] - seat[0], q.pos[1] - seat[1]) > 0.4, 'S did not stand you up and walk you');
  await page.keyboard.up('s');
  step('Space jumps, and you land again');
  const floor = walked.pos[2];
  await page.keyboard.press('Space');
  const top = (await until((q) => q.pos[2] > floor + 0.2, 'Space did not jump')).pos[2];
  await until((q) => !q.vz && Math.abs(q.pos[2] - floor) < 1e-3, 'you did not land');
  step('Space twice flies: Space rises, Shift lowers; twice again, you fall to the floor');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  const hover = (await until((q) => q.mode === 'fly', 'Space twice did not fly', 3000)).pos[2];
  await page.keyboard.down('Space');
  const risen = (await until((q) => q.pos[2] > hover + 0.15, 'Space did not rise')).pos[2];
  await page.keyboard.up('Space');
  await page.keyboard.down('Shift');
  await until((q) => q.pos[2] < risen - 0.1, 'Shift did not lower');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  await until((q) => q.mode === 'walk' && !q.vz && Math.abs(q.pos[2] - floor) < 1e-3, 'not back on the floor');
  console.log(`   walked, jumped ${(top - floor).toFixed(2)} m (at least), flew up and down, landed`);

  step('the scroll is the eye’s zoom: the eye goes in and back, the body and its motion acts stay');
  await page.waitForTimeout(1200); // (the last coarse motion acts sent)
  let motions = 0,
    told = 0,
    measuring = false;
  const count = (r) => {
    if (r.url().includes('/motion') && !measuring) motions++; // (the measure below turns the head: its own acts)
    if (/zoom/i.test(r.url() + (r.postData() ?? ''))) told++;
  };
  // what a frame costs where the eye is: the head turned a little at a time, a frame each
  const frameMs = async () => {
    measuring = true;
    const ms = await page.evaluate(async () => {
      const s = globalThis.__sceneStats,
        L = globalThis.__sceneLook,
        p = L.pose();
      const r = Math.PI / 180;
      const f0 = s.frames,
        m0 = s.renderMs;
      for (let k = 1; k <= 15; k++) {
        const yaw = (p.yaw + k * 0.02) * r;
        L.aim([p.pos[0] + Math.sin(yaw) * 2, p.pos[1] + Math.cos(yaw) * 2, p.pos[2] + Math.sin(p.pitch * r) * 2]);
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      }
      return (s.renderMs - m0) / Math.max(1, s.frames - f0);
    });
    await page.waitForTimeout(1200); // (its motion acts gone out)
    measuring = false;
    return ms;
  };
  page.on('request', count);
  const bodyOf = (p) => JSON.stringify({ pos: p.pos, mode: p.mode, size: p.size }); // (where the body is: the checks turn the head)
  const body = bodyOf(await pose());
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 2);
  const shot = async () => onScreen(page, '.journal-scene', (d) => Array.from(d.subarray(0, d.length).filter((_, i) => i % 97 === 0)));
  const far = await shot();
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(800);
  const near = await shot();
  const nearMs = await frameMs();
  for (let i = 0; i < 30; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(1200);
  const farMs = await frameMs();
  page.off('request', count);
  if (told) throw new Error('the zoom went out in a request');
  if (nearMs > 3 * farMs + 4) throw new Error(`a frame close in cost ${nearMs.toFixed(1)} ms, pulled back ${farMs.toFixed(1)} ms`);
  console.log(`   a frame close in ${nearMs.toFixed(1)} ms, pulled back ${farMs.toFixed(1)} ms; the zoom in no request`);
  if (bodyOf(await pose()) !== body) throw new Error('the zoom moved the body');
  if (motions) throw new Error(`the zoom sent ${motions} motion act(s)`);
  const moved = near.filter((v, i) => Math.abs(v - far[i]) > 30).length / near.length;
  if (moved < 0.05) throw new Error(`the zoom did not change the view (${(moved * 100).toFixed(1)}%)`);
  console.log(`   ${(moved * 100).toFixed(0)}% of the view changed going in; the body still, no motion acts`);

  step('your account, at the corner behind the chair: your words, and a password backup');
  await page.evaluate(() => globalThis.__sceneLook.at([3.048 - 0.4, 0.4, 1.6]));
  await panel(page, 'Your account').waitFor({ timeout: 10000 });
  await panel(page, 'Your account').getByRole('button', { name: 'Show your 24 words and private key' }).click();
  const shownWords = (await panel(page, 'Your account').locator('.key-words').textContent()).trim();
  if (shownWords !== words) throw new Error('the account shows other words than registration gave');
  await panel(page, 'Your account').getByRole('button', { name: 'Add one' }).click();
  await page.fill('#pw-next', 'correct horse battery');
  await page.fill('#pw-next2', 'correct horse battery');
  await panel(page, 'Your account').getByRole('button', { name: 'Save' }).click();
  await panel(page, 'Your account').locator('strong', { hasText: 'on' }).waitFor({ timeout: 60000 });
  console.log('   the words shown are yours; the password backup is on');

  step('the book from the shelf: in your hands; download it and check it offline');
  await page.evaluate(() => globalThis.__sceneLook.at([1.2, 2.0, 1.6]));
  await page.evaluate(() => globalThis.__sceneLook.aim([0.0875, 2.31, 1.5175])); // the book on the shelf (scene/shelf.js)
  await page.waitForTimeout(400);
  await page.mouse.click(view.x + view.width / 2, view.y + view.height / 2);
  await panel(page, 'The book, open in your hands').waitFor({ timeout: 10000 });
  const [dl] = await Promise.all([page.waitForEvent('download'), panel(page, 'The book, open in your hands').getByText('Download this book').click()]);
  const file = path.join(dataDir, 'tabor.book');
  await dl.saveAs(file);
  const verified = spawnSync(process.execPath, [path.join(root, 'law', 'bin', 'verify.js'), file], { encoding: 'utf8' });
  console.log(
    verified.stdout
      .trim()
      .split('\n')
      .map((l) => `  ${l}`)
      .join('\n'),
  );
  if (verified.status !== 0) throw new Error('the downloaded book does not check');
  if (/zoom/i.test(fs.readFileSync(file, 'utf8'))) throw new Error('the zoom is in the .book'); // (never recorded: outside.md §3.6)
  await panel(page, 'The book, open in your hands').getByRole('button', { name: 'Put it back' }).click();

  step('back to the chair: E sits you down');
  await page.evaluate(() => {
    globalThis.__sceneLook.at([1.524, 2.383, 1.6]);
    globalThis.__sceneLook.aim([1.524, 1.5, 2.4]); // (looking up: nothing on the page under the pointer)
  });
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 3);
  await scene.focus();
  await page.keyboard.press('e');
  await panel(page, 'At your table').waitFor({ timeout: 10000 });
  await page.waitForTimeout(800); // (the glide to the seat)

  step('E picks up your writing: its panel; walk it back; film it');
  await page.mouse.move(onInk.x, onInk.y);
  await scene.focus();
  await page.keyboard.press('e');
  await panel(page, 'Your writing, in your hand').waitFor({ timeout: 10000 });
  await panel(page, 'Your writing, in your hand').getByRole('button', { name: 'Walk back' }).click();
  const art = page.locator('.walk-back-art');
  const ab = await art.boundingBox();
  await page.mouse.click(ab.x + ab.width * 0.3, ab.y + ab.height * 0.5);
  await page.locator('.trace dt', { hasText: 'settled' }).waitFor({ timeout: 60000 });
  console.log('  ', (await page.locator('.trace').innerText()).replace(/\s+/g, ' ').slice(0, 220), '…');
  await page.getByRole('button', { name: /^Side view/ }).click();
  await page.waitForFunction(
    () => {
      const i = document.querySelector('.depth-view img');
      return i && i.complete && i.naturalWidth > 0;
    },
    null,
    { timeout: 60000 },
  );
  const sideW = await page.locator('.depth-view img').evaluate((i) => `${i.naturalWidth}×${i.naturalHeight}`);
  await page.getByRole('button', { name: 'Scene', exact: true }).click();
  await page.locator('.walk-back-scene canvas.scene-canvas').waitFor({ timeout: 60000 });
  console.log(`   side view ${sideW}; the sheet in its own scene`);
  await page.getByRole('button', { name: 'Close' }).click();
  const saved = async (p, name) => {
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 120000 }), panel(p, 'Your writing, in your hand').getByRole('button', { name, exact: true }).first().click()]);
    const f = path.join(dataDir, d.suggestedFilename());
    await d.saveAs(f);
    return fs.readFileSync(f);
  };
  const webm = await saved(page, 'Video');
  if (!(webm[0] === 0x1a && webm[1] === 0x45 && webm[2] === 0xdf && webm[3] === 0xa3)) throw new Error('the video is not a WebM file');
  const gif = await saved(page, 'GIF');
  if (gif.subarray(0, 6).toString('ascii') !== 'GIF89a') throw new Error('the GIF is not a GIF');
  console.log(`   video ${webm.length} bytes, GIF ${gif.length} bytes`);

  step('E sets it down lower on the page: one move');
  await page.mouse.move(onInk.x, onInk.y + view.height * 0.12, { steps: 8 }); // (the writing in the hand follows it)
  if (process.env.FLOW_SHOT_HELD) await page.waitForTimeout(300).then(() => page.screenshot({ path: process.env.FLOW_SHOT_HELD }));
  await scene.focus();
  await page.keyboard.press('e');
  await panel(page, 'Your writing, in your hand').waitFor({ state: 'detached', timeout: 10000 });
  let after = null;
  for (const end = Date.now() + 20000; Date.now() < end; await page.waitForTimeout(300)) {
    [after] = await homeItems();
    if (after.y > item.y + 20) break;
  }
  if (!(after.y > item.y + 20)) throw new Error(`it did not move down the page: ${item.y} → ${after.y}`);
  console.log(`   from ${item.x}, ${item.y} to ${after.x}, ${after.y}`);

  step('a visitor at the door: the house, its writing, and the panel offering to come in');
  const visitor = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  await visitor.addInitScript(charged);
  try {
    const v = await visitor.newPage();
    await v.goto(`${base}/u/tabor`);
    await panel(v, 'Come in').waitFor({ timeout: 30000 });
    await v
      .locator('.journal-scene[data-gpu]')
      .waitFor({ timeout: 60000 })
      .catch(async (err) => {
        const shot = path.join(os.tmpdir(), 'penpals-e2e-visitor.png');
        await v.screenshot({ path: shot }).catch(() => {});
        const seen = await v.evaluate(() => ({
          scene: document.querySelectorAll('.journal-scene').length,
          page: document.querySelectorAll('.journal-page').length,
          text: document.querySelector('main')?.innerText.slice(0, 200),
        }));
        throw new Error(`${err.message.split('\n')[0]}: the visitor's house shows ${JSON.stringify(seen)} (${shot})`);
      });
    await untilOnScreen(v, '.journal-scene', (d) => {
      let ink = 0;
      for (let i = 0; i < d.length; i += 4 * 7) if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 45) ink++;
      return ink > 20;
    });
    if ((await v.locator('aside.panel').count()) !== 1) throw new Error('more than one panel');
  } finally {
    await visitor.close();
  }

  // signing out on this device: at the key corner of your own house, its panel's "Sign out here" (one-world.md)
  const signOutHere = async () => {
    await page.goto(`${base}/u/tabor`);
    await page.locator('.journal-scene[data-gpu]').waitFor({ timeout: 60000 });
    await page.locator('.journal-scene canvas.scene-canvas').focus();
    await page.waitForTimeout(1500);
    if (await panel(page, 'The pen in your hand').count()) await page.keyboard.press('h'); // (the pen set down: the hand free)
    await page.keyboard.down('s');
    await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 15000 });
    await page.keyboard.up('s');
    const [cx, cy] = cornerOf(roomGeometry(ROOM));
    await page.evaluate(([x, y]) => globalThis.__sceneLook.at([x - 0.25, y + 0.25, 1.6]), [cx, cy]);
    await panel(page, 'Your account').waitFor({ timeout: 20000 });
    await panel(page, 'Your account').locator('button.logout').click();
  };

  step('sign out here (at the key corner of your house), then log in with the 24 words');
  await signOutHere();
  await page.goto(base);
  await page.locator('#in-name').waitFor();
  await openWith(page, { unlock: false, way: 'words', secret: words, done: () => panel(page, 'The pen in your hand').waitFor({ timeout: 60000 }) }); // (the eye opens as it did when you registered)

  step('a new tab is signed in but must unlock to write: the private key, in the table’s panel');
  const tab = await context.newPage();
  await tab.goto(`${base}/u/tabor`);
  await tab.getByText('Unlock to write').waitFor({ timeout: 20000 });
  await openWith(tab, { unlock: true, way: 'key', secret: privateKey, done: () => panel(tab, 'The pen in your hand').waitFor({ timeout: 60000 }) }); // (unlocked, the pen is in your hand)
  await tab.close();

  step('open the .book in the viewer: it checks here too');
  await page.goto(`${base}/book`);
  await page.setInputFiles('.dropzone input[type=file]', file);
  await page.getByText('The book checks.').waitFor({ timeout: 60000 });
  await page.getByText(/And with your key: 1 closed sheet grown again here/).waitFor({ timeout: 60000 });

  step('sign out here again, then log in with the password backup');
  await signOutHere();
  await page.goto(base);
  await page.locator('#in-name').waitFor();
  await openWith(page, { unlock: false, way: 'password', secret: 'correct horse battery', done: () => panel(page, 'The pen in your hand').waitFor({ timeout: 60000 }) });
  console.log('\nthe whole flow works');
} catch (err) {
  if (err.ok) {
    console.log(`\n${err.message}`);
  } else {
    failed = err;
    console.error('\nFAILED:', err.message);
    const shot = path.join(os.tmpdir(), 'penpals-e2e-failed.png');
    await globalThis.e2ePage
      ?.screenshot({ path: shot, fullPage: true })
      .then(() => console.error('screenshot:', shot))
      .catch(() => {});
    console.error(
      'on the page:',
      await globalThis.e2ePage
        ?.locator('.error')
        .allTextContents()
        .catch(() => []),
    );
    console.error(serverLog.split('\n').slice(-20).join('\n'));
  }
} finally {
  await browser.close();
  server.kill();
  await vite?.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
