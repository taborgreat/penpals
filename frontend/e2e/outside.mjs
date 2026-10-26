// The outside (outside.md Phase 4), in a real browser on this machine's GPU: in your house, shut up
// (the shutters and the door shut) nothing outside is grown and the candles light; the door opened,
// only what lies beyond it is; out through it, onto the dirt; the eye's zoom goes to a stone, a tree and
// the ground out there (one ray for everything: scene/worldRay.js), each close up its own grown cells;
// gone and come back, the same ground.
//   node frontend/e2e/outside.mjs      the built site (npm run build -w frontend first)
import os from 'node:os';
import path from 'node:path';
import * as W from './world.mjs';

const { step } = W;
const srv = await W.serve(3126, 'penpals-outside-');
const browser = await W.launch();
let failed = null;
const shot = (p, name) => p.screenshot({ path: path.join(process.env.OUTSIDE_SHOTS ?? os.tmpdir(), `penpals-outside-${name}.png`) });
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
const now = (p) => p.evaluate(() => globalThis.__outsideNow ?? null);
// the fine grain of a picture: each pixel's distance from the mean of its eight neighbours, as a share of the light
const grain = (d, w, h) => {
  const lum = (x, y) => d[4 * (y * w + x)] + d[4 * (y * w + x) + 1] + d[4 * (y * w + x) + 2];
  let off = 0,
    all = 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      let around = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (i || j) around += lum(x + i, y + j);
      off += Math.abs(lum(x, y) - around / 8);
      all += lum(x, y);
    }
  return off / Math.max(1, all);
};
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
  const v = await p.locator('.house-scene canvas.scene-canvas').boundingBox();
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

  step("the eye's zoom out of doors: scrolled in on a stone, a tree and the ground, it goes to each (no arm limits the eye)");
  const box = await canvas(page).boundingBox();
  const mid = [box.x + box.width / 2, box.y + box.height / 2];
  const me = await page.evaluate(() => globalThis.__sceneLook.pose().pos);
  const off = (q) => Math.hypot(q[0] - me[0], q[1] - me[1]);
  const nearest = (list) => list.filter((x) => off(x.at) > 2.5 && off(x.at) < 25).sort((a, b) => off(a.at) - off(b.at))[0];
  const stone = nearest(out.stones);
  const tree = nearest(out.trees);
  const targets = [...(stone ? [['a stone', stone.at]] : []), ...(tree ? [['a tree', [tree.at[0], tree.at[1], tree.at[2] + 1.2]]] : []), ['the ground', [me[0] + 1, me[1] - 7, me[2] - 1.6]]];
  if (targets.length < 3) console.log(`   (no ${stone ? 'tree' : 'stone'} between 2.5 and 25 m: ${targets.length} of 3)`);
  // (by day, as the light tool would have it: at night nothing out there is lit enough to show its cells)
  await page.evaluate(() => globalThis.__sceneLook.sun({ az: 0, el: 45 }));
  await page.waitForTimeout(6000); // (the eye comes to the daylight)
  const KIND = { 'a stone': 'stone', 'a tree': 'limb', 'the ground': 'ground' };
  const flat = [];
  for (const [what, q] of targets) {
    await page.evaluate((p) => globalThis.__sceneLook.aim(p), q);
    await page.mouse.move(mid[0] + 1, mid[1]);
    await page.mouse.move(...mid);
    await page.waitForTimeout(300);
    const eye0 = await page.evaluate(() => globalThis.__sceneLook.eye());
    const met = await page.evaluate(() => globalThis.__sceneLook.ahead());
    if (met?.kind !== KIND[what]) throw new Error(`the eye's ray meets ${JSON.stringify(met)}, not ${what}`);
    // in close: the eye a few cm from it, a cell of its grain a pixel or more (as the table shows its own)
    for (let k = 0; k < 24 && (await page.evaluate(() => globalThis.__sceneLook.ahead()?.t ?? 0)) > 0.03; k++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(60);
    }
    const eye1 = await page.evaluate(() => globalThis.__sceneLook.eye());
    const near = await page.evaluate(() => globalThis.__sceneLook.ahead());
    const went = Math.hypot(...eye1.map((v, k) => v - eye0[k]));
    await page.waitForTimeout(600);
    // its own cells: the light's fine grain at the middle (each pixel against its eight neighbours: smooth
    // light leaves none), a share of the light there (by day or night alike)
    const cells = await W.onScreen(page, { x: mid[0] - 60, y: mid[1] - 60, width: 120, height: 120 }, grain);
    console.log(
      `   ${what}, ${met.t.toFixed(1)} m off: the eye went ${went.toFixed(1)} m to it (${(near.t * 100).toFixed(1)} cm left: ${near.kind}, the eye ${(near.clear * 100).toFixed(1)} cm clear); its grain ${(cells * 100).toFixed(2)}% of its light`,
    );
    await shot(page, `close-${KIND[what]}`);
    if (!(near.t < 0.05) || near.kind !== KIND[what]) throw new Error(`the eye did not go to ${what}`);
    if (cells < 0.002) flat.push(`${what} (${(cells * 100).toFixed(2)}%)`);
    for (let k = 0; k < 30; k++) await page.mouse.wheel(0, 240); // (back to the head)
    await page.waitForTimeout(200);
  }
  await page.evaluate(() => globalThis.__sceneLook.sun(null));
  if (flat.length) throw new Error(`no cells of its own: ${flat.join(', ')}`);
  await shot(page, 'zoomed');

  step('gone and come back: the same ground');
  await page.reload();
  await W.worldView(page);
  await canvas(page).focus();
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
