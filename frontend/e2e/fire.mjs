// The house fire in the world (matter.md, "The test: start the house on fire"; law/fire.js), in a real browser on
// this machine's GPU: the left candle lit; the right one taken up (E), carried round behind the left one and into it
// toward the page, as the house-fire test's hand does, until it goes over; let go. Nothing else is done. The fallen
// candle is the heat rule's from then: its flame on the table, the paper under it catching as the rule has it, its
// cells burnt away on the paper's record as they go, the same on every screen.
//   node frontend/e2e/fire.mjs      the built site (npm run build -w frontend first)
import * as W from './world.mjs';
import { roomGeometry, ROOM, HOLDER, PX_PER_M } from '../src/scene/light/room.js';
import { candle as Cn } from 'penpals-law';

const { CANDLE } = Cn;

const { step, panel } = W;
const srv = await W.serve(3133, 'penpals-fire-');
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
const geom = roomGeometry(ROOM);
const at = (p, thing) => p.evaluate((t) => globalThis.__things.at(t), thing);
const fires = (p) => p.evaluate(() => globalThis.__candles?.fires?.() ?? null);
const until = async (p, fn, what, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    const got = await fn();
    if (got) return got;
    if (Date.now() - t0 > ms) throw new Error(`waited for ${what}`);
    await p.waitForTimeout(250);
  }
};
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  page.on('console', (m) => m.type() === 'warning' && m.text().startsWith('[fire]') && console.log('  [warn]', m.text())); // (the fire's worker's errors)
  await page.goto(srv.base);
  await W.register(page, 'ash');
  await page.waitForURL(/\/u\/ash$/, { timeout: 90000 });
  const { view } = await W.worldView(page);
  await page.waitForTimeout(3000);
  const mid = [view.x + view.width / 2, view.y + view.height / 2];
  const paper = (await until(page, async () => ((ps) => ps.length && ps)(await page.evaluate(() => globalThis.__papers?.lying() ?? [])), 'the paper on the table'))[0];

  step('the left candle lit; the right one taken up, carried round behind it and into it toward the page');
  await until(page, async () => !!(await page.evaluate(() => globalThis.__candles)), 'the candles');
  await page.evaluate(() => globalThis.__candles.light(0));
  await until(page, async () => (await page.evaluate(() => globalThis.__candles.candle(0).lit)) === true, 'the left candle lit');
  await canvas(page).focus();
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  const aim = async (p, from = null) => {
    if (from) {
      await page.evaluate((q) => globalThis.__sceneLook.at(q), from);
      await page.waitForTimeout(500);
    }
    await page.evaluate((q) => globalThis.__sceneLook.aim(q), p);
    await page.mouse.move(mid[0] + 1, mid[1]);
    await page.mouse.move(...mid);
    await page.waitForTimeout(250);
  };
  const [c0, c1] = [await at(page, 'candle-0'), await at(page, 'candle-1')];
  const top = geom.table.top;
  // the paper slid along the table to where the candle's flame will lie when it goes over (its full length on from
  // its foot: a new candle's): taken up (E) and let go there (E), its middle a little short of the flame
  // (its foot comes to lie at its holder's rim; a new candle's length and its wick on from there)
  const flameAt = [c0[0] + HOLDER.radius + CANDLE.length + CANDLE.wick, c0[1]];
  const target = [flameAt[0] - 0.04, flameAt[1]];
  let placed = paper;
  for (let tries = 0; Math.hypot(placed.at[0] - target[0], placed.at[1] - target[1]) > 0.02; tries++) {
    if (tries === 4) throw new Error(`the paper was not slid under where the flame will lie (it is at ${placed.at.map((v) => v.toFixed(3)).join(', ')})`);
    await aim([placed.at[0], placed.at[1], top], [placed.at[0], placed.at[1] - 0.7, 1.6]);
    await page.keyboard.press('e');
    if (!(await until(page, async () => (await page.evaluate(() => globalThis.__papers?.held())) === paper.paper, 'the paper in the hand', 5000).catch(() => false))) continue;
    await aim([target[0], target[1], top], [target[0], target[1] - 0.7, 1.6]);
    await page.keyboard.press('e');
    placed = await until(page, async () => (await page.evaluate(() => globalThis.__papers?.lying() ?? [])).find((x) => x.paper === paper.paper), 'the paper let go');
  }
  console.log(`   the paper slid to ${placed.at.map((v) => v.toFixed(3)).join(', ')} (the flame will lie at ${flameAt.map((v) => v.toFixed(3)).join(', ')})`);
  for (let tries = 0; ; tries++) {
    await aim([c1[0], c1[1], c1[2] + 0.1], [c1[0], c1[1] - 0.9, 1.6]);
    await page.keyboard.press('e');
    if (
      await panel(page, 'A candle in your hand')
        .waitFor({ timeout: 4000 })
        .then(
          () => true,
          () => false,
        )
    )
      break;
    if (tries === 3) throw new Error('the right candle was not taken up');
  }
  // round behind the left one (toward the far wall), down to it, and on into it toward the page
  const path = [
    [c1[0], 3.05],
    [c0[0] - 0.14, 3.05],
    [c0[0] - 0.14, c0[1]],
    [c0[0] + 0.05, c0[1]],
  ];
  let from = [c1[0], c1[1]];
  for (const to of path) {
    for (let k = 1; k <= 8; k++) {
      const f = k / 8;
      await aim([from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, top]);
      await page.waitForTimeout(200);
    }
    from = to;
  }
  await page.waitForTimeout(800);
  const fell = await page.evaluate(() => globalThis.__things.bodies()['candle-0']);
  console.log(`   the left candle: ${fell.lying ? `over, lying ${JSON.stringify(fell.lying)}` : 'still standing'} at ${fell.at.map((v) => v.toFixed(3)).join(', ')}`);
  if (!fell.lying) throw new Error('the left candle did not go over');

  step('nothing else is done: the fire is the heat rule’s (law/fire.js), grown on this screen from the room’s chain');
  const lit = await until(page, async () => ((f) => f?.kindled && f.alight > 0 && f)(await fires(page)), 'the fallen candle alight on the table', 30000);
  console.log(`   kindled: ${lit.alight} cells alight`);
  const t0 = Date.now();
  let seen = -1;
  const burnt = await until(
    page,
    async () => {
      const f = await fires(page);
      if (f && Math.floor((Date.now() - t0) / 10000) > seen) {
        seen = Math.floor((Date.now() - t0) / 10000);
        console.log(`   (${seen * 10} s: ${f.alight} cells alight, ${f.burnt?.[paper.paper] ?? 0} cm² of the paper burnt)`);
      }
      return (f?.burnt?.[paper.paper] ?? 0) > 0 && f;
    },
    'the paper catching',
    90000,
  );
  console.log(`   the paper catching after ${((Date.now() - t0) / 1000).toFixed(0)} s: ${burnt.burnt[paper.paper]} cm² burnt away so far`);
  await page.waitForTimeout(15000);
  const later = await fires(page);
  console.log(`   15 s on: ${later.alight} cells alight, ${later.flames} flames drawn, ${later.burnt[paper.paper]} cm² of the paper burnt away, ${later.left} cells of ash lying`);
  const give = later.gives[0];
  if (give)
    console.log(
      `   it gives the room ${give.light.toFixed(1)} W of light (its flames at ${give.K.toFixed(0)} K), ${give.heat.toFixed(1)} W of heat and ${(give.smoke * 1000).toFixed(2)} mg/s of smoke into its air`,
    );
  const smoke = await page.evaluate(() => globalThis.__smokeNow?.());
  console.log(`   the room's smoke drawn: ${smoke.cells} of its air's cells, the densest ${(smoke.most * 1e6).toFixed(3)} mg/m³ of soot`);
  if (process.env.FIRE_SHOT_MID) await page.screenshot({ path: process.env.FIRE_SHOT_MID });
  if (!later.flames) throw new Error('no flames');
  if (!smoke.cells) throw new Error('no smoke in the room');
  // and on the paper itself: its cells gone from its record, as it is grown on this screen
  const holes = await until(page, async () => (await page.evaluate(() => globalThis.__papers?.lying() ?? [])).find((x) => x.paper === paper.paper)?.holes, 'the paper grown with its burns', 30000);
  console.log(`   the paper, grown with them: ${holes} of its cells gone`);
  const end = await until(page, async () => ((f) => f?.alight === 0 && f)(await fires(page)), 'the fire over', 240000);
  const hot = Object.entries(end.hottest).filter(([k]) => /holder|table|candle|pen|jar|stamper/.test(k));
  console.log(
    `   over: ${end.left} cells of char and ash lying off the papers (each paper's its own record's); the hottest each got: ${hot.map(([k, v]) => `${k} ${v.toFixed(1)} °C`).join(', ')} (metal melts at 900 °C)`,
  );

  step('the candle in the hand set down; E on where the paper burnt: its ash taken up, a heap in the hand');
  for (let tries = 0; await page.evaluate(() => !!globalThis.__things.bodies()['candle-1']?.held); tries++) {
    if (tries === 4) throw new Error('the candle in the hand was not set down');
    await aim([2.0, 3.1, top], [2.0, 2.3, 1.6]); // (well clear of the paper)
    await page.keyboard.press('e');
    await page.waitForTimeout(1500);
  }
  const lies = (await page.evaluate(() => globalThis.__papers.lying())).find((x) => x.paper === paper.paper);
  const size = (await (await page.request.get(`${srv.base}/api/papers/${paper.paper}`)).json()).birth.size;
  // (where it burnt farthest north: past the fallen candle and the pens, which the hand would take first)
  const spots = end.holes[paper.paper].map((hole) => [lies.at[0] + (hole.x + hole.w / 2 - size[0] / 2) / PX_PER_M, lies.at[1] - (hole.y + hole.h / 2 - size[1] / 2) / PX_PER_M, top]);
  const spot = spots.reduce((a, b) => (b[1] > a[1] ? b : a));
  await aim(spot, [spot[0], spot[1] - 0.05, 1.3]); // (from over it: past nothing else the hand would meet first)
  await page.keyboard.press('e');
  const heap = await until(
    page,
    async () => (await page.evaluate(() => Object.entries(globalThis.__things.bodies()).find(([id, b]) => id.startsWith('heap:') && b.held))) ?? null,
    'a heap of its ash in the hand',
    20000,
  );
  console.log(`   ${heap[0]}: ${heap[1].shape.matter}, a cone ${(heap[1].shape.r * 1000).toFixed(2)} mm round`);
  if (heap[1].shape.matter !== 'ash') throw new Error(`a heap of ${heap[1].shape.matter}, not ash`);
  if (process.env.FIRE_SHOT) await page.screenshot({ path: process.env.FIRE_SHOT });
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
console.log('ok: a lit candle knocked over, nothing else: it burns on the table as the heat rule has it, and the paper with it');
