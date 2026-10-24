// What the scene costs (cleanup-and-speed.md §1's report, §5's benches): idle
// at night, writing a line, orbiting, and a letter's scene payload. It builds
// the site in production mode with the dev pages in (VITE_LABS=1), serves it,
// and measures in the full Chromium on this machine's GPU.
//
//   node frontend/e2e/perf.mjs              WebGL2
//   node frontend/e2e/perf.mjs --webgpu     WebGPU (where the GPU has it)
//   --dpr=2                                 device pixel ratio (default 2: a laptop's screen)
//   --json=file                             also write the numbers as JSON
//
// Per scenario, over its window: the main thread's busy share (Chrome's
// TaskDuration, as the Performance panel's total), the scene's frames a second
// and the time each took to draw (its copies included), the page's frame
// intervals (p50 / p95 / worst), and texture bytes uploaded a second.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(here, '..');
const root = path.join(frontend, '..');
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const webgpu = process.argv.includes('--webgpu');
const dpr = Number(arg('dpr', 2));
const only = arg('only', null); // one scenario: idle, writing, orbiting

const { build, preview } = await import(pathToUrl(path.join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')));
const { chromium } = await import(pathToUrl(path.join(root, 'node_modules', 'playwright', 'index.mjs')));
function pathToUrl(p) { return `file:///${p.replace(/\\/g, '/')}`; }

const outDir = path.join(os.tmpdir(), 'penpals-perf-dist');
process.env.VITE_LABS = '1';
await build({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', build: { outDir }, preview: { port: 5299, host: '127.0.0.1', strictPort: true } });
const base = 'http://127.0.0.1:5299';

const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'] });
const results = {};
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: dpr });
  await context.addInitScript(() => { globalThis.__sceneSync = true; }); // draw times include the GPU's (WebGL2)
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('  [page error]', e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  const gpu = webgpu ? '' : '&gpu=webgl2';

  async function measure(name, act) {
    const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
    await page.evaluate(() => {
      window.__raf = [];
      const tick = (t) => { window.__raf.push(t); window.__rafId = requestAnimationFrame(tick); };
      window.__rafId = requestAnimationFrame(tick);
    });
    const m0 = await metrics();
    const s0 = await page.evaluate(() => ({ ...(globalThis.__sceneStats ?? {}) }));
    const t0 = Date.now();
    await act();
    const wall = (Date.now() - t0) / 1000;
    const m1 = await metrics();
    const s1 = await page.evaluate(() => ({ ...(globalThis.__sceneStats ?? {}) }));
    const raf = await page.evaluate(() => { cancelAnimationFrame(window.__rafId); return window.__raf; });
    const gaps = raf.slice(1).map((t, i) => t - raf[i]).sort((a, b) => a - b);
    const q = (p) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] : 0);
    const frames = (s1.frames ?? 0) - (s0.frames ?? 0);
    const r = {
      seconds: +wall.toFixed(1),
      mainBusy: +(((m1.TaskDuration - m0.TaskDuration) / wall) * 100).toFixed(1),
      script: +(((m1.ScriptDuration - m0.ScriptDuration) / wall) * 100).toFixed(1),
      sceneFps: +(frames / wall).toFixed(1),
      drawMs: frames ? +(((s1.renderMs - s0.renderMs) / frames)).toFixed(2) : 0,
      frameP50: +q(0.5).toFixed(1),
      frameP95: +q(0.95).toFixed(1),
      frameWorst: +(gaps.at(-1) ?? 0).toFixed(1),
      uploadKBs: +((((s1.uploadBytes ?? 0) - (s0.uploadBytes ?? 0)) / 1024) / wall).toFixed(0),
      prepareMs: frames ? +((s1.prepareMs - s0.prepareMs) / frames).toFixed(2) : 0,
      mainMs: frames ? +((s1.mainMs - s0.mainMs) / frames).toFixed(2) : 0,
      bakes: (s1.bakes ?? 0) - (s0.bakes ?? 0),
      chunksMade: (s1.chunks ?? 0) - (s0.chunks ?? 0),
    };
    results[name] = r;
    console.log(`${name.padEnd(16)} main ${String(r.mainBusy).padStart(5)}%  (script ${String(r.script).padStart(5)}%)  scene ${String(r.sceneFps).padStart(5)} fps × ${String(r.drawMs).padStart(6)} ms  frames p50 ${r.frameP50} p95 ${r.frameP95} worst ${r.frameWorst} ms  uploads ${r.uploadKBs} KB/s  (prepare ${r.prepareMs} ms, main pass ${r.mainMs} ms, ${r.bakes} bakes, ${r.chunksMade} chunks made)`);
  }

  // idle at night: nothing moves but the candles
  if (!only || only === 'idle') {
  await page.goto(`${base}/scene-check?hour=23${gpu}`);
  await page.waitForSelector('[data-ready="yes"]', { timeout: 120000 });
  await page.waitForTimeout(4000); // (the page's drawn labels write themselves in first)
  const drawnWith = await page.locator('.scene-view').first().getAttribute('data-gpu');
  console.log(`(${drawnWith}, device pixel ratio ${dpr})`);
  await measure('idle at night', () => page.waitForTimeout(5000));
  }

  // writing a line at night: a two-second stroke, sampled at 120 Hz, then a second of settling
  if (!only || only === 'writing') {
  await page.goto(`${base}/pad-check?hour=23${gpu}`);
  await page.locator('.pad-scene canvas.scene-canvas').waitFor({ timeout: 60000 });
  await page.waitForTimeout(4000); // (the page's drawn labels write themselves in first)
  const pad = await page.locator('.pad-page canvas.ink').first().boundingBox();
  await measure('writing a line', async () => {
    await page.mouse.move(pad.x + pad.width * 0.15, pad.y + pad.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 240; i++) {
      await page.mouse.move(pad.x + pad.width * (0.15 + i * 0.0028), pad.y + pad.height * (0.5 + Math.sin(i / 12) * 0.12));
      await page.waitForTimeout(8);
    }
    await page.mouse.up();
    await page.waitForTimeout(1000);
  });
  }

  // orbiting in 3D, by day: three seconds of dragging
  if (!only || only === 'orbiting') {
  await page.goto(`${base}/scene-check?mode=3d&hour=12${gpu}`);
  await page.waitForSelector('[data-ready="yes"]', { timeout: 120000 });
  await page.waitForTimeout(4000); // (the page's drawn labels write themselves in first)
  const sc = await page.locator('.scene-view canvas').first().boundingBox();
  await measure('orbiting', async () => {
    await page.mouse.move(sc.x + sc.width * 0.3, sc.y + sc.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 180; i++) {
      await page.mouse.move(sc.x + sc.width * (0.3 + Math.sin(i / 30) * 0.2), sc.y + sc.height * (0.5 + Math.cos(i / 40) * 0.1));
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  });
  }
} finally {
  await browser.close();
  await server.close();
}

// a typical letter's scene payload (the server's /look?mode=scene, deflated)
const { grow } = await import(pathToUrl(path.join(root, 'law', 'v2', 'sim.js')));
const L = await import(pathToUrl(path.join(root, 'law', 'v2', 'index.js')));
const { fixtureV2Bytes } = await import(pathToUrl(path.join(root, 'law', 'tools', 'fixtures-v2.js')));
const { testPaperKey } = await import(pathToUrl(path.join(root, 'law', 'tools', 'fixtures.js')));
const { deflateRawSync } = await import('node:zlib');
const res = grow(fixtureV2Bytes('flicks').rec, { paperKey: testPaperKey('golden'), family: { grain: 8, weight: 8, tooth: 0 } });
const cells = L.settledCells(res.tiles);
const box = L.boxOf(cells);
const field = L.encodeScene(L.sceneField(cells, box, {}));
results.payload = { cells: box[2] * box[3], raw: field.length, deflated: deflateRawSync(field).length };
console.log(`scene payload    ${box[2]}×${box[3]} cells: ${field.length} bytes, ${results.payload.deflated} deflated`);

if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(results, null, 2));
