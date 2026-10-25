// The hands (outside.md Phase 5), in a real browser on this machine's GPU: out through the door, a stone
// taken up (E) and set down elsewhere; at a tree, a branch pulled (E): it breaks, or it holds; broken,
// the stick it was carved with the stone (rubbed along it); gone and come back, all as it was.
//   node frontend/e2e/hands.mjs      the built site (npm run build -w frontend first)
import * as W from './world.mjs';

const { step } = W;
const srv = await W.serve(3127, 'penpals-hands-');
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.journal-scene canvas.scene-canvas');
const facts = (p) => p.evaluate(() => globalThis.__hands?.facts?.());
const held = (p) => p.evaluate(() => globalThis.__hands?.held?.());
// the head turned to a point (room m), the pointer at the view's middle
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
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(srv.base);
  await W.register(page, 'tam');
  await page.waitForURL(/\/u\/tam$/, { timeout: 90000 });
  await W.worldView(page);
  await page.waitForTimeout(3000);
  await canvas(page).focus();
  await page.keyboard.press('h');
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  await page.evaluate(() => globalThis.__sceneLook.at([0.8, 1.2, 1.6]));
  await page.waitForTimeout(1000);
  await aimAt(page, [0.8, 0, 1.0]);
  await page.keyboard.press('e'); // the door
  await page.waitForFunction(() => globalThis.__opens?.()?.opens?.door, null, { timeout: 10000 });

  step('out through the door; a stone taken up (E) and set down a step off');
  await page.evaluate(() => globalThis.__sceneLook.at([0.8, -1.5, 1.6]));
  await page.waitForFunction(() => globalThis.__outsideNow?.ways?.around, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const { stones } = await page.evaluate(() => globalThis.__hands.near());
  const pose = await page.evaluate(() => globalThis.__sceneLook.pose());
  const stone = stones.filter((s) => s.matter === 'stone').sort((a, b) => Math.hypot(a.at[0] - pose.pos[0], a.at[1] - pose.pos[1]) - Math.hypot(b.at[0] - pose.pos[0], b.at[1] - pose.pos[1]))[0];
  // stand beside it, look down at it
  await page.evaluate((s) => globalThis.__sceneLook.at([s.at[0] - 0.3, s.at[1] - 0.3, s.at[2] + 1.0]), stone);
  await page.waitForTimeout(800);
  await aimAt(page, stone.at);
  await page.keyboard.press('e');
  await until(page, async () => (await held(page)) === stone.id, 'the stone in the hand');
  await aimAt(page, [stone.at[0] + 0.8, stone.at[1] + 0.8, stone.at[2]]);
  await page.keyboard.press('e');
  await until(page, async () => !(await held(page)), 'the stone set down');
  const moved = (await facts(page)).things.find(([id]) => id === stone.id)?.[1];
  if (!moved?.at) throw new Error('the stone is not where it was set down');
  console.log(`   ${stone.id} moved to ${moved.at.map((v) => (v / 1000).toFixed(2)).join(', ')} m`);

  step('at a tree: a thin branch pulled (E): it breaks, or it holds (the law)');
  const { trees } = await page.evaluate(() => globalThis.__hands.near());
  let limb = null,
    trunk = null;
  for (const t of trees) {
    limb = t.limbs.filter((l) => l.r < 0.02 && l.to[2] - t.at[2] < 2.2 && l.from[2] - t.at[2] > 0.5 && Math.hypot(l.to[0] - t.at[0], l.to[1] - t.at[1]) > 0.6).sort((a, b) => a.r - b.r)[0];
    trunk = t.at;
    if (limb) break;
  }
  if (!limb) throw new Error('no thin branch low enough to reach');
  const mid = limb.from.map((v, k) => (v + limb.to[k]) / 2);
  // stand beyond it from the trunk, looking back at it (the trunk behind it, not in the way)
  const out = [mid[0] - trunk[0], mid[1] - trunk[1]];
  const n = Math.hypot(...out) || 1;
  await page.evaluate(([m, o]) => globalThis.__sceneLook.at([m[0] + o[0] * 0.7, m[1] + o[1] * 0.7, m[2] + 0.1]), [mid, out.map((v) => v / n)]);
  await page.waitForTimeout(800);
  await aimAt(page, mid);
  const before = (await facts(page)).broken.length;
  const aimed = await page.evaluate(() => {
    const h = globalThis.__hands.hit();
    return h && { kind: h.kind, id: h.id, branch: h.branch, t: h.t, r: h.limb?.r };
  });
  console.log(`   the hand meets: ${JSON.stringify(aimed)} (aimed at a branch ${limb.branch}, ${(limb.r * 100).toFixed(1)} cm thick)`);
  await page.keyboard.press('e');
  await until(page, async () => (await facts(page)).broken.length > before || (await held(page)), 'the branch broken', 8000).catch(() => {});
  const stick = await held(page);
  console.log(stick ? `   broke off: ${stick}` : '   it held (too thick for a hand)');

  if (stick) {
    step('the stick set down, the stone taken up again, and rubbed along the stick: carved');
    await page.evaluate(() => globalThis.__sceneLook.at([0.8, -1.5, 1.6]));
    await page.waitForTimeout(800);
    await aimAt(page, [0.8, -2.3, 0]);
    await page.keyboard.press('e');
    await until(page, async () => !(await held(page)), 'the stick set down');
    await page.waitForTimeout(1500);
    const placed = (await facts(page)).things.find(([id]) => id === stick)[1].at.map((v) => v / 1000);
    console.log(`   the stick lies at ${placed.map((v) => v.toFixed(2)).join(', ')}`);
    // the stone again: stand by it, take it up
    const st = (await page.evaluate(() => globalThis.__hands.near())).stones.find((x) => x.id === stone.id);
    await page.evaluate((s) => globalThis.__sceneLook.at([s.at[0] - 0.3, s.at[1] - 0.3, s.at[2] + 1.0]), st);
    await page.waitForTimeout(800);
    await aimAt(page, st.at);
    await page.keyboard.press('e');
    await until(page, async () => (await held(page)) === stone.id, 'the stone in the hand again');
    // stand over the stick, and rub along it: down, back and forth, up
    const sk = (await page.evaluate(() => globalThis.__hands.near())).sticks.find((x) => x.id === stick);
    const foot = sk.limbs[0].from;
    await page.evaluate((f) => globalThis.__sceneLook.at([f[0] + 0.05, f[1] - 0.5, f[2] + 1.0]), foot);
    await page.waitForTimeout(800);
    await aimAt(page, [foot[0] + 0.05, foot[1], foot[2]]);
    const v = await canvas(page).boundingBox();
    const cx = v.x + v.width / 2,
      cy = v.y + v.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let k = 0; k < 6; k++) await page.mouse.move(cx + (k % 2 ? -20 : 20), cy, { steps: 6 });
    await page.mouse.up();
    await until(page, async () => (await facts(page)).cuts.some(([id]) => id === stick), 'the stick carved');
    const cut = (await facts(page)).cuts.find(([id]) => id === stick)[1];
    console.log(`   carved: ${JSON.stringify(cut)}`);
  }

  step('gone and come back: the stone where it was set down, the branch as it was');
  const was = await facts(page);
  await page.reload();
  await W.worldView(page);
  await until(page, async () => (await facts(page))?.things?.length === was.things.length, 'the facts read again', 20000);
  const now = await facts(page);
  if (JSON.stringify(now.things) !== JSON.stringify(was.things) || JSON.stringify(now.broken) !== JSON.stringify(was.broken)) throw new Error('the outside is not as it was');
  console.log('   all as it was');
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
console.log('ok: a stone taken and set down; a branch pulled; all as it was after return');
