// A candle burning as its law has it, in a real browser on this machine's GPU (matter-fixes.md §2; rooms.md §3b):
// the left candle lit and left alone for some minutes. Its top is the law's (law/candle.js shapeOf): a rim standing
// over the pool about its wick, the pool molten; what runs over its rim falls into its holder's dish and sets there,
// drawn as deep as its mass makes it. Then it is carried over the bare table and leant (E held, the mouse): what
// spills falls on the table, which has no chain, and lies there as wax.
//   node frontend/e2e/candles.mjs      the built site (npm run build -w frontend first)
//   CANDLE_MIN (default 4): minutes to let it burn; CANDLE_SHOT: a picture of it
import * as W from './world.mjs';
import { candle as Cn } from 'penpals-law';

const { step } = W;
const MIN = Number(process.env.CANDLE_MIN ?? 4);
const srv = await W.serve(3134, 'penpals-candles-');
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(srv.base);
  await W.register(page, 'wick');
  await page.waitForURL(/\/u\/wick$/, { timeout: 90000 });
  const { view } = await W.worldView(page);
  await page.waitForFunction(() => !!globalThis.__candles, null, { timeout: 30000 });

  step(`the left candle lit and left alone ${MIN} minutes`);
  await page.evaluate(() => globalThis.__candles.light(0));
  await page.waitForFunction(() => globalThis.__candles.candle(0).lit === true, null, { timeout: 15000 });
  const t0 = Date.now();
  let seen = -1;
  while (Date.now() - t0 < MIN * 60000) {
    await page.waitForTimeout(5000);
    const m = Math.floor((Date.now() - t0) / 60000);
    if (m > seen) {
      seen = m;
      const s = await page.evaluate(() => {
        const c = globalThis.__candles.candle(0);
        return { cd: c.cd, wax: globalThis.__candles.wax() };
      });
      console.log(
        `   ${m} min: ${(Cn.heightOf(s.cd) * 1000).toFixed(1)} mm tall, its pool ${(Cn.liquidOf(s.cd) / 1000).toFixed(0)} mg, ${(s.cd.dripped / 1000).toFixed(0)} mg run over its rim; its dish ${(s.wax.dish[0] * 1000).toFixed(2)} mm deep`,
      );
    }
  }
  const end = await page.evaluate(() => ({ cd: globalThis.__candles.candle(0).cd, wax: globalThis.__candles.wax() }));
  const shape = Cn.shapeOf(end.cd);
  const rim = Math.max(...shape.map((s) => s.top)),
    well = Math.min(...shape.map((s) => s.top));
  console.log(
    `   its top: the rim at ${(rim * 1000).toFixed(1)} mm, the pool by its wick ${((rim - well) * 1000).toFixed(1)} mm down, molten ${shape.filter((s) => s.liquid > 0).length} of its ${shape.length} rings`,
  );
  if (!(Cn.liquidOf(end.cd) > 0)) throw new Error('no pool: nothing molten at its top');
  if (end.cd.dripped > 0 && !(end.wax.dish[0] > 0)) throw new Error('wax ran over its rim but none lies in its dish');

  step('looked at close');
  await canvas(page).focus();
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  const c0 = await page.evaluate(() => globalThis.__things.at('candle-0'));
  await page.evaluate((c) => globalThis.__sceneLook.at([c[0] - 0.12, c[1] - 0.3, c[2] + 0.4]), c0);
  await page.waitForTimeout(800);
  await page.evaluate((c) => globalThis.__sceneLook.aim([c[0], c[1], c[2] + 0.1]), c0);
  await page.mouse.move(view.x + view.width / 2 + 1, view.y + view.height / 2);
  await page.waitForTimeout(1500);
  if (process.env.CANDLE_SHOT) await page.screenshot({ path: process.env.CANDLE_SHOT });
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
console.log('ok: a candle as its law has it: its pool in its cup, what runs over its rim set in its dish');
