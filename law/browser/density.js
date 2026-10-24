// The phone density check (plan: "if the look reads as blur, raise
// CELLS_PER_UNIT before freezing"): /law-check opened as phones would open
// it (real device pixel ratios), each fixture's look captured in device
// pixels at 1, 2 and 4 device pixels per cell, the range the site shows a
// sheet at on a phone (journal at fit ≈ 0.6, the chase ≈ 3.8).
//   node law/browser/density.js   → law/lab/density/<phone>-<fixture>.png
// Emulation renders the true device pixels; whether the ink reads as ink is
// then for an eye on the pictures (and, finally, on a real phone).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from '../tools/fixtures.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(here, '..', '..', 'frontend');
const out = path.join(here, '..', 'lab', 'density');
const SHOW = ['hairline', 'dwell', 'mixWet', 'cursive', 'broad'];
const PHONES = [['chromium', 'Pixel 7'], ['webkit', 'iPhone 13']];

const { createServer } = await import('vite');
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const pw = await import('playwright');
fs.mkdirSync(out, { recursive: true });
try {
  for (const [engine, phone] of PHONES) {
    const browser = await pw[engine].launch();
    const context = await browser.newContext({ ...pw.devices[phone] });
    const page = await context.newPage();
    await page.goto(`${url}/law-check`);
    await page.waitForFunction((n) => document.querySelectorAll('section[data-facts]:not([data-facts=""])').length >= n, Object.keys(FIXTURES).length, { timeout: 180000 });
    const dpr = await page.evaluate(() => window.devicePixelRatio);
    for (const name of SHOW) {
      const el = page.locator(`section[data-fixture="${name}"]`);
      const file = path.join(out, `${phone.replace(/\s+/g, '-').toLowerCase()}-${name}.png`);
      // Clip in page coordinates (element screenshots drift under mobile emulation in Chromium).
      const clip = await el.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height };
      });
      await page.screenshot({ path: file, fullPage: true, clip });
      console.log(`${phone} (${engine}, dpr ${dpr}): ${path.relative(process.cwd(), file)}`);
    }
    await browser.close();
  }
} finally {
  await server.close();
}
