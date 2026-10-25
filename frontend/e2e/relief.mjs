// The relief under its ink: one short "/" on a blank page, and on every chunk
// it touches, at every exaggeration, the paper's relief lies exactly under the
// ink — not mirrored (a ridge beside a level stroke, the opposite slant beside
// a slanted one, a bead's peak as a spike in bare paper), not moved by a cell.
// Each chunk's heights, its baked surface and its ink are read back as the
// chunk samples them (engine.js reliefCheck): the surface must be the heights'
// 3 × 3 mean where it stands (r ≈ 1, best at no move), not when turned over.
// It builds the site with the dev pages in (VITE_LABS=1) and writes on /pad-check.
//
//   node frontend/e2e/relief.mjs            WebGL2
//   node frontend/e2e/relief.mjs --webgpu   WebGPU (where the GPU has it)

import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(here, '..');
const root = path.join(frontend, '..');
const webgpu = process.argv.includes('--webgpu');
const pathToUrl = (p) => `file:///${p.replace(/\\/g, '/')}`;
const { build, preview } = await import(pathToUrl(path.join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')));
const { chromium } = await import(pathToUrl(path.join(root, 'node_modules', 'playwright', 'index.mjs')));

const outDir = path.join(os.tmpdir(), 'penpals-relief-dist');
process.env.VITE_LABS = '1';
await build({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', build: { outDir }, preview: { port: 5300, host: '127.0.0.1', strictPort: true } });
const browser = await chromium.launch(webgpu ? { channel: 'chromium', args: ['--enable-unsafe-webgpu'] } : {});
let failed = false;
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('  [page error]', e.message));
  await page.goto(`http://127.0.0.1:5300/pad-check?hour=12${webgpu ? '' : '&gpu=webgl2'}`);
  const scene = page.locator('.pad-scene canvas.scene-canvas').first();
  await page.locator('.pad-scene .scene-view[data-gpu]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
  await scene.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const b = await scene.boundingBox();
  // a short "/": from low left up to the right, across the page's middle (and so across chunks)
  const from = [b.x + b.width * 0.46, b.y + b.height * 0.62],
    to = [b.x + b.width * 0.54, b.y + b.height * 0.42];
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 30, from[1] + ((to[1] - from[1]) * i) / 30);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await page.waitForTimeout(3000); // dry
  console.log(`· a "/" written, drawn with ${await page.locator('.pad-scene .scene-view').getAttribute('data-gpu')}`);
  for (const x of [1, 20, 200]) {
    await page.evaluate((x) => {
      for (const v of globalThis.__sceneViews) v.setRelief(x);
    }, x);
    await page.waitForTimeout(600);
    const all = await page.evaluate(async () => {
      const out = [];
      for (const v of globalThis.__sceneViews) out.push(...(await v.reliefCheck()));
      return out;
    });
    const inked = all.filter((r) => r.inked > 20);
    const wrong = (r) =>
      r.asIs === null || r.asIs < 0.98 || r.best[0] !== 0 || r.best[1] !== 0 || Math.abs(r.mirrored ?? 0) > 0.5 || (r.ink !== null && Math.abs(r.inkMirrored ?? 0) > Math.abs(r.ink));
    const f = (v) => (v === null ? '—' : v.toFixed(3));
    const bad = inked.filter(wrong);
    if (!inked.length || bad.length) failed = true;
    console.log(`  relief ${x}×: ${inked.length} chunks inked, ${bad.length ? `${bad.length} NOT under the ink` : 'every relief under its ink'}`);
    for (const r of bad.length ? bad : inked.slice(0, 2))
      console.log(`    chunk ${r.cx},${r.cy}: as it stands ${f(r.asIs)}, turned over ${f(r.mirrored)}, best moved ${r.best[0]},${r.best[1]} (${f(r.best[2])}); ink ${f(r.ink)} / ${f(r.inkMirrored)}`);
  }
} finally {
  await browser.close();
  await server.close();
}
if (failed) {
  console.log('FAILED: the relief does not lie under its ink');
  process.exit(1);
}
console.log('ok: the relief lies under its ink, on every chunk, at every exaggeration');
