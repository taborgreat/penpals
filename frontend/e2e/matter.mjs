// Free matter (Tabor, 2026-10-25; law/bodies.js), in a real browser on this machine's GPU: nothing is glued to
// a place. A candle taken up (E) and carried along the table into the stamper pushes it out of its way; the
// stamper taken up and carried past the table's edge, let go (a click) in the air there, falls, and lies on
// the floor. The bare hand (nothing in it: your own matter) pressed on the pendulum's bob pushes it aside,
// and drawn back the bob swings. Gone and come back, each is where it came to rest.
//   node frontend/e2e/matter.mjs      the built site (npm run build -w frontend first)
import * as W from './world.mjs';
import { roomGeometry, ROOM, stamperRestOf } from '../src/scene/light/room.js';

const { step, panel } = W;
const srv = await W.serve(3131, 'penpals-matter-');
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
// E with the pointer on it: the hand takes it up (a press is the bare hand pushing)
const takeUp = async (p, at) => {
  await p.mouse.move(at[0] + 1, at[1]);
  await p.mouse.move(...at);
  await canvas(p).focus();
  await p.keyboard.press('e');
};
const geom = roomGeometry(ROOM);
const at = (p, thing) => p.evaluate((t) => globalThis.__things.at(t), thing);
const until = async (p, fn, what, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error(`waited for ${what}`);
    await p.waitForTimeout(250);
  }
};
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(srv.base);
  await W.register(page, 'max');
  await page.waitForURL(/\/u\/max$/, { timeout: 90000 });
  const { view } = await W.worldView(page);
  await page.waitForTimeout(3000);
  const mid = [view.x + view.width / 2, view.y + view.height / 2];
  await canvas(page).focus();
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  // the head over a point (room m) and the pointer at the view's middle: what the hand reaches
  const aim = async (p, from = null) => {
    if (from) {
      await page.evaluate((q) => globalThis.__sceneLook.at(q), from);
      await page.waitForTimeout(500); // (the walking eye comes to its height)
    }
    await page.evaluate((q) => globalThis.__sceneLook.aim(q), p);
    await page.mouse.move(mid[0] + 1, mid[1]);
    await page.mouse.move(...mid);
    await page.waitForTimeout(250);
  };

  step('a candle taken up and carried along the table into the stamper: it pushes it out of its way');
  const stamper0 = stamperRestOf(geom);
  const near = geom.candles.reduce((a, c) => (Math.hypot(c[0] - stamper0[0], c[1] - stamper0[1]) < Math.hypot(a[0] - stamper0[0], a[1] - stamper0[1]) ? c : a));
  const which = geom.candles.indexOf(near);
  const stand = [near[0], near[1] - 0.9, 1.6];
  for (let tries = 0; ; tries++) {
    await aim([near[0], near[1], near[2] + 0.1], stand);
    await takeUp(page, mid); // (E: the hand takes it up)
    if (
      await panel(page, 'A candle in your hand')
        .waitFor({ timeout: 4000 })
        .then(
          () => true,
          () => false,
        )
    )
      break;
    if (tries === 3) throw new Error('the candle was not taken up');
  }
  // along the table from the candle through where the stamper stands, and on past it
  const way = [stamper0[0] - near[0], stamper0[1] - near[1]];
  const len = Math.hypot(...way);
  for (let k = 1; k <= 24; k++) {
    const f = ((k / 24) * (len + 0.08)) / len;
    await aim([near[0] + way[0] * f, near[1] + way[1] * f, geom.table.top]);
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(600);
  const pushed = await at(page, 'stamper');
  const moved = Math.hypot(pushed[0] - stamper0[0], pushed[1] - stamper0[1]);
  console.log(`   the stamper pushed ${(moved * 100).toFixed(1)} cm (it stood at ${stamper0.map((v) => v.toFixed(2)).join(', ')})`);
  if (moved < 0.03) throw new Error('the candle passed through the stamper');
  await page.mouse.click(...mid); // (let go: it stands where the hand had it)
  await panel(page, 'A candle in your hand').waitFor({ state: 'detached', timeout: 10000 });

  step("the stamper taken up and carried past the table's edge; let go in the air there, it falls to the floor");
  const s = await at(page, 'stamper');
  for (let tries = 0; ; tries++) {
    await aim([s[0], s[1], s[2] + 0.03], [s[0], s[1] - 0.6, 1.5]);
    await takeUp(page, mid); // (E: the hand takes it up)
    if (
      await panel(page, 'The stamper in your hand')
        .waitFor({ timeout: 4000 })
        .then(
          () => true,
          () => false,
        )
    )
      break;
    if (tries === 3) throw new Error('the stamper was not taken up');
  }
  // out over the table's near edge toward the writer, and past it (the hand keeps its height over the floor)
  const edgeY = geom.table.y0;
  for (let k = 1; k <= 12; k++) {
    await aim([s[0], s[1] + (edgeY - 0.12 - s[1]) * (k / 12), geom.table.top], [s[0], s[1] - 1.0, 1.5]);
    await page.waitForTimeout(120);
  }
  await page.mouse.click(...mid); // let go
  const heights = [];
  for (let k = 0; k < 8; k++) {
    heights.push((await at(page, 'stamper'))[2]);
    await page.waitForTimeout(40);
  }
  await until(page, async () => (await at(page, 'stamper'))[2] === 0, 'the stamper on the floor', 10000);
  console.log(`   falling: ${heights.map((z) => z.toFixed(2)).join(' → ')} → 0 (on the floor)`);
  if (!heights.some((z) => z > 0.05 && z < geom.table.top + 0.02)) console.log('   (its fall was over between looks)');

  step("the bare hand: pressed on the pendulum's bob and moved, it pushes it aside; drawn back, the bob swings");
  const rest = await page.evaluate(() => globalThis.__things.bob());
  await aim(rest, [rest[0] - 0.05, rest[1] - 0.55, rest[2] + 0.35]);
  console.log(`   under the hand: ${JSON.stringify(await page.evaluate(() => globalThis.__under?.()))} (the bob at ${rest.map((v) => v.toFixed(3)).join(', ')})`);
  const reaches = [];
  page.on('response', (r) => r.url().endsWith('/act') && r.request().postData()?.includes('"reach"') && reaches.push(r.status()));
  await page.mouse.down();
  await page.mouse.move(mid[0], mid[1] - 60, { steps: 12 }); // (the hand on into it: away from the eye)
  await page.waitForTimeout(400);
  await page.mouse.up();
  await page.waitForTimeout(1500);
  console.log(`   reach acts: ${reaches.join(', ') || 'none'}`);
  await until(page, async () => !!(await page.evaluate(() => globalThis.__things.bodies().pendulum?.bob?.swing)), 'the bob pushed', 10000);
  // along the way it was pushed: out that way, back through where it hung, out the other way
  const from = await page.evaluate(() => globalThis.__things.bodies().pendulum.bob.swing.from);
  const aside = Math.hypot(from[0], from[1]);
  const xs = [];
  for (let k = 0; k < 30; k++) {
    const b = await page.evaluate(() => globalThis.__things.bob());
    xs.push(((b[0] - rest[0]) * from[0] + (b[1] - rest[1]) * from[1]) / aside);
    await page.waitForTimeout(50);
  }
  console.log(`   pushed ${(aside * 100).toFixed(1)} cm aside; across its swing: ${Math.min(...xs).toFixed(3)} .. ${Math.max(...xs).toFixed(3)} m from where it hung`);
  if (!(Math.max(...xs) > 0.005 && Math.min(...xs) < -0.005)) throw new Error('the bob did not swing');

  step('gone and come back: each where it came to rest');
  const before = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(globalThis.__things.bodies()).map(([k, b]) => [k, [b.at.map((v) => +v.toFixed(3)), b.lying]]))));
  await page.reload();
  await W.worldView(page);
  await until(page, async () => (await page.evaluate(() => !!globalThis.__things)) && (await at(page, 'stamper'))[2] === 0, 'the room regrown', 20000);
  const after = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(globalThis.__things.bodies()).map(([k, b]) => [k, [b.at.map((v) => +v.toFixed(3)), b.lying]]))));
  if (after !== before) throw new Error(`not as it was:\n${before}\n${after}`);
  console.log(`   all as it was (candle ${which} where it was let go, the stamper on the floor)`);
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
console.log("ok: a carried candle pushed the stamper; the stamper let go past the table's edge fell to the floor; the same on return");
