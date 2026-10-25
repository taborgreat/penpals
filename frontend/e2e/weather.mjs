// The weather you see (world.md Phase 5), in a real browser on this machine's GPU: in your house,
// rain and wind called up (R, G: for a while, as dragging the light), the window looked at: the rain
// falling past it, its glass beading, the clouds over the room's light.
//   node frontend/e2e/weather.mjs      the built site (npm run build -w frontend first)
import os from 'node:os';
import path from 'node:path';
import * as W from './world.mjs';

const { step, onScreen, pixels } = W;
const srv = await W.serve(3125, 'penpals-weather-');
const browser = await W.launch();
let failed = null;
const shot = (p, name) => p.screenshot({ path: path.join(process.env.WEATHER_SHOTS ?? os.tmpdir(), `penpals-weather-${name}.png`) });
const canvas = (p) => p.locator('.journal-scene canvas.scene-canvas');
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(srv.base);
  await W.register(page, 'rae');
  await page.waitForURL(/\/u\/rae$/, { timeout: 90000 });
  const { view } = await W.worldView(page);
  await page.waitForTimeout(4000);

  step('stand up and look out of the window');
  await canvas(page).focus();
  await page.keyboard.press('h');
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  await page.waitForTimeout(1500); // (come to rest)
  await page.evaluate(() => globalThis.__sceneLook.aim([1.524, 3.353, 1.5])); // the window's middle
  await page.waitForTimeout(1500);
  const win = { x: view.x + view.width * 0.3, y: view.y + view.height * 0.25, width: view.width * 0.4, height: view.height * 0.5 };
  const before = await onScreen(page, win, pixels);
  await shot(page, 'before');

  step('call up rain and wind (R, G): the glass beads and streams, the rain falls past, the clouds close in');
  for (const k of ['r', 'r', 'g', 'g']) await page.keyboard.press(k);
  await page.waitForTimeout(12000);
  const after = await onScreen(page, win, pixels);
  await shot(page, 'rain');
  let changed = 0;
  for (let i = 0; i < before.d.length; i += 4) if (Math.abs(before.d[i] - after.d[i]) + Math.abs(before.d[i + 1] - after.d[i + 1]) + Math.abs(before.d[i + 2] - after.d[i + 2]) > 30) changed++;
  const share = changed / (before.d.length / 4);
  console.log(`   ${(100 * share).toFixed(1)}% of the window's pixels changed`);
  if (share < 0.05) throw new Error('the window looks the same in the rain');
} catch (err) {
  failed = err;
} finally {
  await browser.close();
  srv.stop();
}
if (failed) {
  console.error('FAILED:', failed.message);
  process.exit(1);
}
console.log('ok: rain and wind called up; the window sees them');
