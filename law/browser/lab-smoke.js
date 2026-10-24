// Drive the hand lab in a real browser (dev check, not part of npm test):
// a desktop sample on the lab pad and a phone sample through write mode with
// the chase, both saved through the dev server, then read back and measured.
//   node law/browser/lab-smoke.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readHand } from '../v1/hand.js';
import { decodeCanonical } from '../v1/acts.js';
import { fromB64url } from '../tags.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(here, '..', '..', 'frontend');
const samplesDir = path.join(here, '..', 'lab', 'samples', 'zz-smoke');
fs.rmSync(samplesDir, { recursive: true, force: true });

const { createServer } = await import('vite');
const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const url = server.resolvedUrls.local[0].replace(/\/$/, '');
const { chromium } = await import('playwright');
const browser = await chromium.launch();

async function scribble(page, box, { strokes = 3 } = {}) {
  for (let s = 0; s < strokes; s++) {
    const x0 = box.x + box.width * (0.15 + 0.25 * s);
    const y0 = box.y + box.height * 0.5;
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    for (let i = 1; i <= 25; i++) {
      await page.mouse.move(x0 + i * 4, y0 + 20 * Math.sin(i / 3));
      await page.waitForTimeout(8);
    }
    await page.waitForTimeout(150); // a dwell before lifting
    await page.mouse.up();
    await page.waitForTimeout(60);
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${url}/hand-lab`);
  await page.fill('input[placeholder="e.g. tabor"]', 'zz-smoke');
  await page.selectOption('select', 'desktop');
  await page.fill('input[placeholder="a short phrase only they would write"]', 'amber river lamp');
  await page.click('text=A: a fresh phrase');
  const pad = page.locator('.lab-pad canvas');
  await scribble(page, await pad.boundingBox());
  await page.click('.lab-pad button.primary');
  await page.waitForSelector('text=Saved zz-smoke/desktop-s01-A.json');

  // phone: write mode with the chase
  await page.selectOption('select', 'phone');
  await page.click('text=B: your phrase');
  await page.waitForSelector('.monk canvas.monk-ink');
  const ink = page.locator('.monk canvas.monk-ink');
  await scribble(page, await ink.boundingBox(), { strokes: 2 });
  await page.click('.monk-bar button.primary');
  await page.waitForSelector('text=Saved zz-smoke/phone-s01-B.json');
  if (errors.length) throw new Error(`page errors: ${errors.join('; ')}`);

  for (const file of fs.readdirSync(samplesDir)) {
    const s = JSON.parse(fs.readFileSync(path.join(samplesDir, file), 'utf8'));
    const rec = decodeCanonical(fromB64url(s.acts));
    const r = readHand(fromB64url(s.acts), { zones: 8 });
    const holds = rec.strokes.reduce((n, st) => n + [...st.x].filter((x, i) => i > 0 && x === st.x[i - 1] && st.y[i] === st.y[i - 1]).length, 0);
    console.log(`${file}: ${rec.strokes.length} strokes, ${rec.acts} acts (${holds} still), ${rec.duration} ms, kind ${rec.strokes[0].kind}; reading global ${[...r.global].join(',')}`);
  }
  console.log('lab smoke: ok');
} finally {
  await browser.close();
  await server.close();
  fs.rmSync(samplesDir, { recursive: true, force: true });
}
