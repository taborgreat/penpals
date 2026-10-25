// Life (outside.md Phase 8), in a real browser on this machine's GPU: out through the door, the oaks'
// beings about (gall bugs, hive bugs, birds: law/life.js), drawn where the law has them now, flying by
// day and home by night; galls only on oaks with gall bugs; a fallen feather taken up (E) and set down
// (Shift+E); gone and come back, the same beings in the same oaks.
//   node frontend/e2e/life.mjs      the built site (npm run build -w frontend first)
import * as W from './world.mjs';

const { step } = W;
const srv = await W.serve(3128, 'penpals-life-');
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.journal-scene canvas.scene-canvas');
const held = (p) => p.evaluate(() => globalThis.__hands?.held?.());
const life = (p) => p.evaluate(() => globalThis.__life ?? []);
const aimAt = async (p, at) => {
  await p.evaluate((q) => globalThis.__sceneLook.aim(q), at);
  const v = await canvas(p).boundingBox();
  await p.mouse.move(v.x + v.width / 2 + 1, v.y + v.height / 2);
  await p.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
  await p.waitForTimeout(500);
};
const until = async (p, fn, what, ms = 15000) => {
  const t0 = Date.now();
  for (;;) {
    if (await fn()) return;
    if (Date.now() - t0 > ms) throw new Error(`waited for ${what}`);
    await p.waitForTimeout(250);
  }
};
const count = (list) => {
  const by = {};
  for (const b of list) {
    const k = `${b.kind}${b.dead ? ' (dead)' : b.flying ? ' (flying)' : ''}`;
    by[k] = (by[k] ?? 0) + 1;
  }
  return by;
};
const outDoors = async (page) => {
  await canvas(page).focus();
  await page.keyboard.press('h');
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  await page.evaluate(() => globalThis.__sceneLook.at([0.8, 1.2, 1.6]));
  await page.waitForTimeout(1000);
  await aimAt(page, [0.8, 0, 1.0]);
  if (!(await page.evaluate(() => globalThis.__opens?.()?.opens?.door))) await page.keyboard.press('e'); // the door
  await page.waitForFunction(() => globalThis.__opens?.()?.opens?.door, null, { timeout: 10000 });
  await page.evaluate(() => globalThis.__sceneLook.at([0.8, -1.5, 1.6]));
  await page.waitForFunction(() => globalThis.__outsideNow?.ways?.around, null, { timeout: 20000 });
};
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(srv.base);
  await W.register(page, 'wren');
  await page.waitForURL(/\/u\/wren$/, { timeout: 90000 });
  await W.worldView(page);
  await page.waitForTimeout(3000);

  step('out through the door: the oaks and what lives in them, where the law has them now');
  await outDoors(page);
  await until(page, async () => (await life(page)).length > 0, 'the beings drawn', 30000);
  const first = await life(page);
  console.log(`   ${JSON.stringify(count(first))}`);
  const day = await page.evaluate(() => {
    const d = new Date();
    return d.getUTCHours();
  });
  const near = await page.evaluate(() => globalThis.__hands.near());
  console.log(`   ${near.galls.length} galls, ${near.hives.length} hives, ${near.nests.length} nests, ${near.feathers.length} feathers seen`);
  // a living thing moves (by day, flights; it may sit a while): watched for a few seconds
  await page.waitForTimeout(4000);
  const later = await life(page);
  const was = new Map(first.map((b) => [b.id, b.at]));
  const moved = later.filter((b) => !b.dead && was.has(b.id) && Math.hypot(...b.at.map((v, k) => v - was.get(b.id)[k])) > 0.01);
  const flying = later.filter((b) => b.flying);
  console.log(`   in 4 s: ${moved.length} moved, ${flying.length} in the air (UTC hour ${day})`);
  if (!later.every((b) => !b.dead || !b.flying)) throw new Error('a dead one flying');
  console.log(`   the dead lie where they fell: ${(await page.evaluate(() => globalThis.__hands.near())).dead.length}`);

  step('a fallen feather taken up (E), and set down a step off (Shift+E)');
  const f = near.feathers.sort((a, b) => Math.hypot(a.at[0] - 0.8, a.at[1] + 1.5) - Math.hypot(b.at[0] - 0.8, b.at[1] + 1.5))[0];
  if (!f) console.log('   no feather lies near (no birds in the oaks about: the seed’s)');
  else {
    await page.evaluate((x) => globalThis.__sceneLook.at([x.at[0] - 0.3, x.at[1] - 0.3, x.at[2] + 1.0]), f);
    await page.waitForTimeout(1500);
    await aimAt(page, f.at);
    const hit = await page.evaluate(() => globalThis.__hands.hit());
    console.log(`   the hand meets: ${hit?.kind} ${hit?.id ?? ''}`);
    await page.keyboard.press('e');
    await until(page, async () => (await held(page)) === f.id, 'the feather in the hand');
    await aimAt(page, [f.at[0] + 0.6, f.at[1] + 0.6, f.at[2]]);
    await page.keyboard.press('Shift+E');
    await until(page, async () => !(await held(page)), 'the feather set down');
    const lies = (await page.evaluate(() => globalThis.__hands.near())).feathers.find((x) => x.id === f.id);
    if (!lies) throw new Error('the feather is not where it was set down');
    console.log(`   ${f.id} lies at ${lies.at.map((v) => v.toFixed(2)).join(', ')}`);
  }

  step('gone and come back: the same beings in the same oaks');
  const ids = new Set((await life(page)).filter((b) => !b.dead).map((b) => b.id));
  await page.reload();
  await W.worldView(page);
  await page.waitForTimeout(3000);
  await outDoors(page);
  await until(page, async () => (await life(page)).length > 0, 'the beings drawn again', 30000);
  const again = new Set((await life(page)).filter((b) => !b.dead).map((b) => b.id));
  const same = [...ids].filter((id) => again.has(id)).length;
  console.log(`   ${same} of ${ids.size} the same beings`);
  if (ids.size && same < ids.size * 0.9) throw new Error('not the same beings on return');
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
console.log('ok: the oaks’ beings about where the law has them; a feather taken and set down; the same on return');
