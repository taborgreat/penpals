// The outside (outside.md Phase 4), in a real browser on this machine's GPU: in your house, shut up
// (the shutters and the door shut) nothing outside is grown and the candles light; the door opened,
// only what lies beyond it is; out through it, onto the dirt; gone and come back, the same ground.
//   node frontend/e2e/outside.mjs      the built site (npm run build -w frontend first)
import os from 'node:os';
import path from 'node:path';
import * as W from './world.mjs';

const { step } = W;
const srv = await W.serve(3126, 'penpals-outside-');
const browser = await W.launch();
let failed = null;
const shot = (p, name) => p.screenshot({ path: path.join(process.env.OUTSIDE_SHOTS ?? os.tmpdir(), `penpals-outside-${name}.png`) });
const canvas = (p) => p.locator('.journal-scene canvas.scene-canvas');
const now = (p) => p.evaluate(() => globalThis.__outsideNow ?? null);
const until = async (p, fn, what, ms = 30000) => {
  const t0 = Date.now();
  for (;;) {
    const v = await now(p);
    if (fn(v)) return v;
    if (Date.now() - t0 > ms) throw new Error(`waited for ${what}: ${JSON.stringify(v)?.slice(0, 200)}`);
    await p.waitForTimeout(250);
  }
};
// the head turned to a point of the room, then E (what is in front of you)
const eAt = async (p, at, kind) => {
  await p.evaluate((q) => globalThis.__sceneLook.aim(q), at);
  const v = await p.locator('.journal-scene canvas.scene-canvas').boundingBox();
  await p.mouse.move(v.x + v.width / 2 + 1, v.y + v.height / 2);
  await p.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
  await p.waitForFunction((k) => globalThis.__opens?.()?.under === k, kind, { timeout: 10000 }); // (the view turned there)
  const before = JSON.stringify((await p.evaluate(() => globalThis.__opens?.()))?.opens);
  await p.keyboard.press('e');
  // (the room's word on the act, back before the next: what is open, changed)
  await p.waitForFunction((was) => JSON.stringify(globalThis.__opens?.()?.opens) !== was, before, { timeout: 10000 });
  await p.waitForTimeout(300);
};
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(srv.base);
  await W.register(page, 'oki');
  await page.waitForURL(/\/u\/oki$/, { timeout: 90000 });
  await W.worldView(page);
  await page.waitForTimeout(3000);
  await canvas(page).focus();
  await page.keyboard.press('h');
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  await page.waitForTimeout(1500);
  await page.evaluate(() => globalThis.__sceneLook.at([1.5, 1.6, 1.6]));
  await page.waitForTimeout(800);

  step('as the house is made: the window lets the outside in, the door shut: only what is beyond the window is grown');
  const first = await until(page, (v) => v?.ways?.window && !v.ways.door, 'the outside through the window');
  if (![...first.stones, ...first.trees].every((t) => t.at[1] > 3.353)) throw new Error('something grown that the window does not see');
  console.log(`   through the window: ${first.trees.length} trees, ${first.stones.length} stones, all beyond it`);

  step('shut up: the sash opened and shut again with the shutters (E at the window, twice): nothing outside, the candles light');
  await eAt(page, [1.524, 3.353, 1.5], 'window');
  await eAt(page, [1.524, 3.353, 1.5], 'window');
  await until(page, (v) => v === null, 'nothing grown outside');
  await page.waitForFunction(() => globalThis.__candles?.candle(0)?.lit, null, { timeout: 30000 });
  await shot(page, 'shut');
  console.log('   nothing outside is grown; the candles are lit');

  step('the door opened (E at it): only what lies beyond the door is grown');
  await eAt(page, [0.8, 0, 1.0], 'door');
  const door = await until(page, (v) => v?.ways?.door, 'the outside through the door');
  if (![...door.stones, ...door.trees].every((t) => t.at[1] < 0)) throw new Error('something grown that the door does not see');
  console.log(`   through the door: ${door.trees.length} trees, ${door.stones.length} stones, all beyond it`);
  await page.evaluate(() => globalThis.__sceneLook.aim([0.8, -5, 1.4]));
  await page.waitForTimeout(1500);
  await shot(page, 'door');

  step('out through the door, onto the dirt');
  await page.evaluate(() => globalThis.__sceneLook.at([0.8, 0.6, 1.6]));
  await page.evaluate(() => globalThis.__sceneLook.aim([0.8, -5, 1.6]));
  await page.keyboard.down('w');
  await page.waitForFunction(() => globalThis.__sceneLook.pose().pos[1] < -2, null, { timeout: 20000 });
  await page.keyboard.up('w');
  const out = await until(page, (v) => v?.ways?.around, 'the outside all around');
  await page.waitForTimeout(8000); // (the eye comes to the daylight: it is slow)
  if (process.env.OUTSIDE_DEBUG) console.log('   eye:', JSON.stringify(await page.evaluate(() => globalThis.__eyeNow?.())));
  await shot(page, 'out');
  console.log(`   outside: ${out.trees.length} trees and ${out.stones.length} stones about, ${out.houses} other houses`);

  step('gone and come back: the same ground');
  await page.reload();
  await W.worldView(page);
  await canvas(page).focus();
  await page.keyboard.press('h');
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  await page.evaluate(() => globalThis.__sceneLook.at([1.5, 1.6, 1.6]));
  const back = await until(page, (v) => v?.ways?.door, 'the outside through the door, again');
  if (JSON.stringify(back.trees) !== JSON.stringify(door.trees) || JSON.stringify(back.stones) !== JSON.stringify(door.stones)) throw new Error('the ground is not as it was');
  console.log('   the same trees and stones where they were');
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
console.log('ok: shut up, nothing outside and the candles lit; the door opened, its side grown; out and back, the same ground');
