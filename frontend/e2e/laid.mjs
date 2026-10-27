// A written paper set down on the bare table (rooms.md §5: a paper is matter, anyone's hand may move it), in a real
// browser on this machine's GPU: seated, a stroke on it; up from the chair, the paper taken up (E) and let go (E)
// on the table's wood further along. Its ink lies on it where it was written, over the table's wood and never
// through it: looked at close, the ink is drawn where the paper lies, at the paper's height.
//   node frontend/e2e/laid.mjs      the built site (npm run build -w frontend first)
//   LAID_SHOT: pictures of it (…-seated.png, …-laid.png, …-close.png)
import * as W from './world.mjs';

const { step, panel } = W;
const srv = await W.serve(3136, 'penpals-laid-');
const base = srv.base;
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
const lyingOn = (p) => p.evaluate(() => globalThis.__papers?.lying() ?? []);
const until = async (p, fn, what, ms = 30000) => {
  let got;
  for (const end = Date.now() + ms; Date.now() < end; await p.waitForTimeout(250)) if ((got = await fn())) return got;
  throw new Error(`waited for ${what}`);
};
const shot = (page, name) => (process.env.LAID_SHOT ? page.screenshot({ path: process.env.LAID_SHOT.replace(/\.png$/, `-${name}.png`) }) : null);
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(base);
  await W.register(page, 'lay');
  await page.waitForURL(/\/u\/lay$/, { timeout: 90000 });
  const { view: v } = await W.worldView(page);
  const [paper] = await until(page, async () => ((ps) => ps.length && ps)(await lyingOn(page)), 'the paper before the chair');

  step('seated: a stroke on the paper');
  await canvas(page).focus();
  await page.keyboard.press('h');
  await panel(page, 'The pen in your hand').waitFor({ timeout: 10000 });
  // (from the paper's middle on off its edge: its last part ink on the table's wood: one-matter.md Phase 3)
  await W.strokesIn(page, { x: v.x + v.width / 2, y: v.y + v.height / 2 - 10, width: v.width * 0.42, height: 20 }, W.across([0, 0.5], [1, 0.5], 60), 12);
  await until(page, async () => (await lyingOn(page)).find((x) => x.paper === paper.paper && x.lines > 0), 'the stroke stamped');
  await page.waitForTimeout(2500);
  await shot(page, 'seated');
  if (process.env.LAID_SHOT) {
    // (close, seated: the eye's zoom toward where the stroke left the paper)
    const edge = { x: v.x + v.width / 2 + v.width * 0.3, y: v.y + v.height / 2 };
    await page.mouse.move(edge.x, edge.y);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(2000);
    await shot(page, 'edge');
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1000);
  }
  await page.keyboard.press('h');

  step('up from the chair: the paper taken up and let go on the table further along');
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  const mid = [v.x + v.width / 2, v.y + v.height / 2];
  const aim = async (p, from) => {
    await page.evaluate((q) => globalThis.__sceneLook.at(q), from);
    await page.waitForTimeout(500);
    await page.evaluate((q) => globalThis.__sceneLook.aim(q), p);
    await page.mouse.move(mid[0] + 1, mid[1]);
    await page.mouse.move(...mid);
    await page.waitForTimeout(300);
  };
  const lies = (await lyingOn(page)).find((x) => x.paper === paper.paper);
  const top = lies.at[2];
  for (let tries = 0; (await page.evaluate(() => globalThis.__papers.held())) !== paper.paper; tries++) {
    if (tries === 4) throw new Error('the paper was not taken up');
    await aim([lies.at[0] + 0.03, lies.at[1] - 0.05, top], [lies.at[0] + 0.03, lies.at[1] - 0.6, 1.5]);
    await page.keyboard.press('e');
    await page.waitForTimeout(1500);
  }
  const to = [lies.at[0] + Number(process.env.LAID_DX ?? 0.12), lies.at[1], top]; // (over the table's ink, by default)
  await aim(to, [to[0], to[1] - 0.6, 1.5]);
  await page.keyboard.press('e');
  const laid = await until(page, async () => (await lyingOn(page)).find((x) => x.paper === paper.paper && Math.abs(x.at[0] - lies.at[0]) > 0.05), 'the paper let go further along');
  console.log(`   from ${lies.at.map((x) => x.toFixed(3)).join(', ')} to ${laid.at.map((x) => x.toFixed(3)).join(', ')}`);
  await page.waitForTimeout(3000);
  await shot(page, 'laid');

  step('looked at close: its ink where it lies');
  await aim([laid.at[0] + 0.05, laid.at[1], laid.at[2]], [laid.at[0] + 0.05, laid.at[1] - 0.35, laid.at[2] + 0.2]);
  await page.waitForTimeout(3000);
  await shot(page, 'close');
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
console.log('ok: a written paper set down on the table elsewhere, its ink with it');
