// Your room (rooms.md Phases 1 to 3), in a real browser, the way a person goes:
// the lobby, seen in black and white; registering on its paper; the eye closing
// and opening in your own room, where colour comes in; looking around (Look),
// pulling your book down from the shelf, writing on a wall and placing it there,
// where it stays: a sheet of the book, on the wall. Then visiting (another person,
// in their own browser): reading the wall, the book, a door. Then together: a
// shared sheet laid on the other's table, both writing on it, one stamper, both
// screens growing it to the same facts; a lift; taken back.
//   node frontend/e2e/room.mjs                 through a Vite dev server (and a backend on a fresh
//                                              data dir), in the full Chromium on this machine's GPU
//   node frontend/e2e/room.mjs --swiftshader   drawn on the CPU instead (slow: two people's rooms at
//                                              once can take the browser down on SwiftShader)
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

// Register at the lobby's desk: sign three times, the name, keep the key, in.
async function register(page, name) {
  await page
    .getByRole('button', { name: /register/i })
    .first()
    .click();
  for (let i = 1; i <= 3; i++) {
    await page.getByText(`Signature ${i} of 3`).waitFor({ timeout: 30000 });
    await sign(page, signature(0.002 * i + name.length * 0.001));
    await page.getByRole('button', { name: 'Done' }).click();
  }
  await page.locator('#reg-name').waitFor({ timeout: 60000 });
  await page.fill('#reg-name', name);
  await page.getByText('free', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('I have kept my words or my private key').click();
  await page.getByRole('button', { name: 'Make my account' }).click();
}
// Dark marks in the middle of a picture: pixels well under its median brightness.
const marksIn =
  (share = 0.3, by = 25) =>
  (d, w, h) => {
    const lum = [];
    for (let y = Math.floor(h * (0.5 - share / 2)); y < h * (0.5 + share / 2); y++) {
      for (let x = Math.floor(w * (0.5 - share / 2)); x < w * (0.5 + share / 2); x++) {
        const i = (y * w + x) * 4;
        lum.push((d[i] + d[i + 1] + d[i + 2]) / 3);
      }
    }
    const median = [...lum].sort((a, b) => a - b)[lum.length >> 1];
    return lum.filter((v) => v < median - by).length;
  };
const PX_PER_M = 1400 / 0.2159;

const onCpu = process.argv.includes('--swiftshader'); // SwiftShader, on the CPU (else the GPU)
const launch = () =>
  chromium.launch(onCpu ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog'] } : { channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
const browser = await launch();
let browser2 = null; // the other person: their own browser (two people, two machines)
let failed = null;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log('  [page error]', err.message));
  page.on('crash', () => console.log('  [page crashed]'));
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('  [console error]', m.text());
  });
  await page.goto(base);

  step('the lobby: the room everyone comes in by, seen in black and white');
  await page.locator('.lobby-scene[data-gpu]').waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500); // the room's light settles, the eye on it
  await page.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-lobby.png') });
  const lobby = await onScreen(page, '.lobby-scene', colourOf);
  console.log(`   colour spread ${lobby.spread.toFixed(1)}, brightness ${lobby.lum.toFixed(0)}`);
  if (lobby.spread > 2.5) throw new Error(`the lobby is not in black and white (spread ${lobby.spread.toFixed(1)})`);
  if (lobby.lum < 4) throw new Error('the lobby is dark');

  step('register at the desk: sign three times on its paper, the name, keep the key');
  await register(page, 'tabor');

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

  step("a door: the writing on the wall made a way into someone else's room");
  browser2 = await launch();
  const other = await browser2.newContext({ viewport: { width: 1280, height: 1000 } });
  const guest = await other.newPage();
  guest.on('pageerror', (err) => console.log('  [guest page error]', err.message));
  guest.on('crash', () => console.log('  [guest crashed]'));
  guest.on('console', (m) => m.type() === 'error' && console.log('  [guest console]', m.text()));
  await guest.goto(base);
  await guest.locator('.lobby-scene[data-gpu]').waitFor({ timeout: 60000 });
  await register(guest, 'bo');
  await guest.waitForURL(/\/u\/bo$/, { timeout: 90000 });
  const item = onWall[0][1].items[0];
  const linked = await page.request.post(`${base}/api/books/me/edit`, { headers: { origin: base }, data: { op: 'link', surface: 'wall-left', item: item.id, target_room: 'bo' } });
  if (linked.status() !== 200) throw new Error(`making the door: ${linked.status()} ${await linked.text()}`);

  step("visiting: bo comes into tabor's room, reads the wall, takes the book down, and goes through the door");
  await guest.goto(`${base}/u/tabor`);
  const there = '.journal-scene';
  await guest.locator(`${there}[data-gpu]`).waitFor({ timeout: 60000 });
  await guest.locator(there).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await guest.locator(`${there} .scene-tools`).getByRole('button', { name: 'Look' }).click();
  const gcentre = async () => {
    await guest.locator(there).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await guest.waitForTimeout(200);
    const b = await guest.locator(`${there} canvas.scene-canvas`).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  // the wall's writing, from where its writer stood
  const lines = (await (await guest.request.get(`${base}/api/books/tabor/ink`)).text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const box = lines.find((l) => l.id === item.ink).ink.box;
  const [cx, cy] = [item.x + box[2] / 4, item.y + box[3] / 4]; // its middle (two cells a unit)
  const markAt = [0, cx / PX_PER_M, 2.438 - cy / PX_PER_M];
  await guest.evaluate((p) => {
    globalThis.__sceneLook.at([0.4, p[1], p[2]]);
    globalThis.__sceneLook.aim(p);
  }, markAt);
  let seen = 0;
  for (const end = Date.now() + 40000; Date.now() < end && seen < 150;) {
    await guest.waitForTimeout(500);
    await gcentre(); // (the scene's middle on screen, where the head looks)
    seen = await onScreen(guest, there, marksIn());
  }
  await guest.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-guest.png') });
  console.log(`   the wall, as a visitor reads it: ${seen} pixels of ink`);
  if (seen < 150) throw new Error('the visitor does not see the writing on the wall');
  // the book from the shelf
  await guest.evaluate(() => {
    globalThis.__sceneLook.at([0.9, 2.31, 1.52]);
    globalThis.__sceneLook.aim([0.175, 2.31, 1.52]);
  });
  await guest.waitForTimeout(600);
  let gmid = await gcentre();
  await guest.mouse.click(...gmid);
  await guest.locator('.book-open').waitFor({ timeout: 10000 });
  console.log('   the book, taken down by a visitor: ' + (await guest.locator('.book-open button').allTextContents()).join(' · '));
  await guest.getByRole('button', { name: 'Put it back' }).click();
  // through the door
  await guest.evaluate((p) => {
    globalThis.__sceneLook.at([0.4, p[1], p[2]]);
    globalThis.__sceneLook.aim(p);
  }, markAt);
  await guest.waitForTimeout(600);
  gmid = await gcentre();
  await guest.mouse.click(...gmid);
  await guest.waitForURL(/\/u\/bo$/, { timeout: 15000 });
  console.log("   through the door: into bo's room");

  step("together: tabor makes a shared sheet on his table and lays it on bo's");
  const bar = (p) => p.locator('.together');
  await bar(page).getByRole('button', { name: '+ A shared sheet' }).click();
  const made = bar(page).locator('.shared-sheet').first();
  await made.waitFor({ timeout: 15000 });
  const sheetId = await made.getAttribute('data-sheet');
  page.once('dialog', (d) => d.accept('bo'));
  await made.getByRole('button', { name: 'Lay it on…' }).click();
  await bar(page).locator(`.shared-sheet.away[data-sheet="${sheetId}"]`).waitFor({ timeout: 15000 });
  console.log(`   ${await bar(page).locator('.shared-sheet.away .meta').first().textContent()}`);

  // a line across the middle of the view, as a hand writes it
  const across = (a, b, n = 28) => [[...Array(n).keys()].map((i) => [a[0] + ((b[0] - a[0]) * i) / (n - 1), a[1] + ((b[1] - a[1]) * i) / (n - 1)])];
  const stampedOn = (p) => p.waitForResponse((r) => r.url().endsWith(`/api/shared/${sheetId}/acts`) && r.request().method() === 'POST', { timeout: 30000 });
  async function writeOnSheet(p, sel, at, strokes) {
    const on = bar(p).locator(`.shared-sheet[data-sheet="${sheetId}"]`);
    await on.getByRole('button', { name: 'Write on it' }).click();
    await p.waitForTimeout(900); // the eye goes to it
    await p.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(300);
    const b = await p.locator(`${sel} canvas.scene-canvas`).boundingBox();
    const [res] = await Promise.all([stampedOn(p), strokesIn(p, { x: b.x + b.width / 2 - 90 + at[0], y: b.y + b.height / 2 - 40 + at[1], width: 180, height: 80 }, strokes, 12)]);
    if (res.status() !== 201) throw new Error(`a stroke on the shared sheet: ${res.status()} ${await res.text()}`);
    return (await res.json()).line.n;
  }

  step('bo writes on it, in his own room: his ink shows at once, and as stamped');
  await bar(guest).locator(`.shared-sheet[data-sheet="${sheetId}"]`).waitFor({ timeout: 15000 });
  await guest.getByRole('button', { name: 'Preview' }).click(); // (his own room, as it is seen: not the editing page)
  await guest.locator(`${there}[data-gpu]`).waitFor({ timeout: 60000 });
  const bare = await (async () => {
    await bar(guest).locator(`.shared-sheet[data-sheet="${sheetId}"]`).getByRole('button', { name: 'Write on it' }).click();
    await guest.waitForTimeout(1200);
    return gcentre().then(() => onScreen(guest, there, pixels));
  })();
  const boN = await writeOnSheet(guest, there, [0, 0], across([0, 0.5], [1, 0.5]));
  console.log(`   bo's stroke stamped: place ${boN}`);
  // grown from the stamped acts (the guess gone): the ink on the sheet, on his screen
  await bar(guest).locator(`.shared-sheet[data-sheet="${sheetId}"][data-grown="2"][data-facts]`).waitFor({ timeout: 30000 });
  let inkGuest = 0;
  for (const end = Date.now() + 20000; Date.now() < end && inkGuest < 150;) {
    await guest.waitForTimeout(400);
    await gcentre();
    inkGuest = darkened(bare, await onScreen(guest, there, pixels), 0.5);
  }
  console.log(`   on bo's screen: ${inkGuest} pixels of ink on the sheet`);
  if (inkGuest < 150) throw new Error('the ink on the shared sheet does not show');

  step("tabor comes into bo's room and writes across it: one sheet, two writers, one stamper");
  await page.goto(`${base}/u/bo`);
  await page.locator(`${scene}[data-gpu]`).waitFor({ timeout: 60000 });
  await bar(page).locator(`.shared-sheet[data-sheet="${sheetId}"]`).waitFor({ timeout: 15000 });
  await bar(guest).locator('.here').filter({ hasText: '@tabor' }).waitFor({ timeout: 15000 });
  console.log(`   bo's room: ${await bar(guest).locator('.here').textContent()}`);
  const taborN = await writeOnSheet(page, scene, [0, 0], across([0.5, 0], [0.5, 1]));
  console.log(`   tabor's stroke stamped: place ${taborN}`);
  // every screen grows the sheet from the stamper's acts, and they end byte-identical
  const { shared: SH, b64url: b64 } = await import('penpals-law');
  const factsNow = async () => {
    const view = await (await page.request.get(`${base}/api/shared/${sheetId}`)).json();
    const born = SH.checkBirth(view.birth, view);
    return { lines: view.lines.length, facts: b64(SH.growShared(view.lines, { seed: born.seed, family: born.family }).facts) };
  };
  const agree = async (lines) => {
    let a, b;
    for (const end = Date.now() + 30000; Date.now() < end;) {
      const sel = `.shared-sheet[data-sheet="${sheetId}"][data-grown="${lines}"]`;
      a = await bar(page)
        .locator(sel)
        .getAttribute('data-facts', { timeout: 500 })
        .catch(() => null);
      b = await bar(guest)
        .locator(sel)
        .getAttribute('data-facts', { timeout: 500 })
        .catch(() => null);
      if (a && b) break;
      await page.waitForTimeout(300);
    }
    const truth = await factsNow();
    if (truth.lines !== lines || a !== truth.facts || b !== truth.facts) throw new Error(`the screens do not agree with the stamper: ${a} · ${b} · ${JSON.stringify(truth)}`);
    return truth.facts;
  };
  const both = await agree(3);
  console.log(`   both screens grew it to the stamper's facts: ${both}`);
  const visitor = (await (await page.request.get(`${base}/api/rooms/bo/table`)).json()).beings.find((b) => b.name === 'tabor');
  if (!visitor?.pose) throw new Error(`tabor is not a being in bo's room: ${JSON.stringify(visitor)}`);
  console.log(`   tabor, a being in bo's room: head at ${visitor.pose.pos.join(', ')} m, turned ${visitor.pose.yaw}°`);
  await page.waitForTimeout(3000); // (SwiftShader: a picture taken in the burst of growing and drawing can take the tab down)
  await page.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-together.png') });
  await guest.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-together-bo.png') });

  step('bo lifts his stroke: a forward act; his pigment goes, the sheet grows anew on both screens');
  const lifted = stampedOn(guest);
  await bar(guest).locator(`.shared-sheet[data-sheet="${sheetId}"]`).getByRole('button', { name: 'Lift my last stroke' }).click();
  if ((await lifted).status() !== 201) throw new Error('the lift was not stamped');
  const after2 = await agree(4);
  if (after2 === both) throw new Error('the lift changed nothing');
  console.log(`   lifted, both screens: ${after2}`);

  step("tabor takes it back: it leaves bo's table, and bo can no longer write on it");
  await bar(page).locator(`.shared-sheet[data-sheet="${sheetId}"]`).getByRole('button', { name: 'Take it back' }).click();
  await bar(guest).locator(`.shared-sheet[data-sheet="${sheetId}"]`).waitFor({ state: 'detached', timeout: 15000 });
  const home = (await (await page.request.get(`${base}/api/shared/mine`)).json()).sheets.find((s) => s.sheet === sheetId);
  if (home?.on !== 'tabor') throw new Error(`the sheet is not home: ${home?.on}`);
  console.log("   back on tabor's table; gone from bo's");

  step("seals: tabor drips warm wax on it, presses bo's seal in; bo writes on it at tabor's table; tabor breaks it");
  await page.goto(`${base}/u/tabor`);
  await page.getByRole('button', { name: 'Preview' }).click();
  await page.locator(`${scene}[data-gpu]`).waitFor({ timeout: 60000 });
  const mineHere = bar(page).locator(`.shared-sheet[data-sheet="${sheetId}"]`);
  await mineHere.waitFor({ timeout: 15000 });
  await mineHere.getByRole('button', { name: 'Write on it' }).click();
  await page.waitForTimeout(900);
  await page.locator(scene).evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  // the sheet's middle on screen (a click in the bar may have scrolled the page: centred again before each use)
  const middle = async () => {
    await page.locator(scene).evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(250);
    const sb = await page.locator(`${scene} canvas.scene-canvas`).boundingBox();
    return [sb.x + sb.width / 2, sb.y + sb.height / 2];
  };
  let at = await middle();
  const plain = await onScreen(page, scene, pixels);
  // the candle, held down over the sheet: tilted, it drips while held (a small circle: a pool)
  await bar(page).getByRole('button', { name: 'Candle' }).click();
  const dripAnswers = [];
  page.on('response', (r) => r.url().includes('/acts') && r.request().method() === 'POST' && dripAnswers.push(r.status()));
  const linesBefore = (await (await page.request.get(`${base}/api/shared/${sheetId}`)).json()).lines.length;
  at = await middle();
  await page.mouse.move(at[0] + 12, at[1]);
  await page.mouse.down();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * 2 * Math.PI;
    await page.mouse.move(at[0] + 12 * Math.cos(a), at[1] + 12 * Math.sin(a));
    await page.waitForTimeout(80);
  }
  await page.mouse.up();
  let drips = 0;
  for (const end = Date.now() + 10000; Date.now() < end && drips < 6;) {
    await page.waitForTimeout(300);
    drips = (await (await page.request.get(`${base}/api/shared/${sheetId}`)).json()).lines.slice(linesBefore).filter((l) => l.act.act === 'drip').length;
  }
  console.log(`   ${drips} drips of wax`);
  if (drips < 6)
    throw new Error(
      `the candle did not drip (${await bar(page)
        .locator('.notice')
        .textContent({ timeout: 500 })
        .catch(() => 'no notice')}; ${dripAnswers.join(', ')})`,
    );
  // the stamper, set to bo, pressed into the middle of the pool while it is warm
  page.once('dialog', (d) => d.accept('bo'));
  await bar(page).getByRole('button', { name: 'Stamper…' }).click();
  await bar(page).getByRole('button', { name: 'Stamper: @bo' }).waitFor({ timeout: 10000 });
  const pressedRes = page.waitForResponse((r) => r.url().endsWith(`/api/shared/${sheetId}/acts`) && r.request().method() === 'POST' && r.request().postData()?.includes('"press"'), { timeout: 20000 });
  at = await middle();
  await page.mouse.click(...at);
  const pr = await pressedRes;
  if (pr.status() !== 201) throw new Error(`the press: ${pr.status()} ${await pr.text()}`);
  await bar(page).locator(`.shared-sheet[data-sheet="${sheetId}"] .seal[data-took="true"]`).waitFor({ timeout: 30000 });
  console.log(`   ${await bar(page).locator(`.shared-sheet[data-sheet="${sheetId}"] .seal .meta`).first().textContent()}`);
  let waxSeen = 0;
  for (const end = Date.now() + 15000; Date.now() < end && waxSeen < 150;) {
    await page.waitForTimeout(400);
    waxSeen = darkened(plain, await onScreen(page, scene, pixels), 0.4, 6);
  }
  await page.screenshot({ path: path.join(os.tmpdir(), 'penpals-e2e-seal.png') });
  console.log(`   the wax and its impression on tabor's screen: ${waxSeen} pixels`);
  if (waxSeen < 150) throw new Error('the wax does not show');
  // bo comes into tabor's room: the sheet lies on its owner's table with his seal in it
  await guest.goto(`${base}/u/tabor`);
  await guest.locator(`${there}[data-gpu]`).waitFor({ timeout: 60000 });
  const sealedForBo = bar(guest).locator(`.shared-sheet[data-sheet="${sheetId}"]`);
  await sealedForBo.getByRole('button', { name: 'Write on it' }).waitFor({ timeout: 30000 });
  const boOnSeal = await writeOnSheet(guest, there, [0, 60], across([0.1, 0.5], [0.9, 0.5]));
  console.log(`   bo writes on tabor's sheet by his seal: place ${boOnSeal}`);
  // broken: he may no longer write on it
  await bar(page).locator(`.shared-sheet[data-sheet="${sheetId}"] .seal`).getByRole('button', { name: 'Break' }).click();
  await bar(guest).locator(`.shared-sheet[data-sheet="${sheetId}"] .seal[data-broken="true"]`).waitFor({ timeout: 20000 });
  await sealedForBo.getByRole('button', { name: 'Look at it' }).waitFor({ timeout: 20000 });
  console.log("   broken: bo's pen is off it");
  await other.close();
  console.log('ok: the lobby, your room, the shelf, a wall written on; visiting, a door into another room; writing together on one shared sheet');
} catch (err) {
  failed = err;
} finally {
  await browser.close();
  await browser2?.close();
  await vite.close();
  server.kill();
  if (failed) console.error('(the data kept: ' + dataDir + ')');
  else fs.rmSync(dataDir, { recursive: true, force: true });
}
if (failed) {
  console.error('FAILED:', failed.message);
  if (serverLog.includes('Error')) console.error(serverLog.slice(-2000));
  process.exit(1);
}
