// The hands (outside.md Phase 5), in a real browser on this machine's GPU: out through the door, a stone
// taken up (E) and set down elsewhere (Shift+E); at a tree, a branch pulled (E): it breaks, or it holds; broken,
// the stick it was carved with the stone (rubbed along it); gone and come back, all as it was.
//   node frontend/e2e/hands.mjs      the built site (npm run build -w frontend first)
import * as W from './world.mjs';
import { roomGeometry, ROOM, jarRestOf } from '../src/scene/light/room.js';
import { seat } from '../src/scene/light/roomCamera.js';
import { lawOf } from 'penpals-law/laws';
import { matter as M, fromB64url } from 'penpals-law';

const { step } = W;
const srv = await W.serve(3127, 'penpals-hands-');
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
const facts = (p) => p.evaluate(() => globalThis.__hands?.facts?.());
const held = (p) => p.evaluate(() => globalThis.__hands?.held?.());
const lyingOn = (p) => p.evaluate(() => globalThis.__papers?.lying() ?? []);
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
  await page.keyboard.press('Shift+E');
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
    await page.keyboard.press('Shift+E');
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

    step('the stick taken home: dipped in the jar, it writes on the paper (outside.md §2.5: a pen is a stick sharpened)');
    await aimAt(page, [foot[0] + 0.05, foot[1] - 0.35, foot[2]]); // (off the stick: the stone set down beside it)
    await page.keyboard.press('Shift+E');
    await until(page, async () => !(await held(page)), 'the stone set down again');
    await aimAt(page, [foot[0] + 0.15, foot[1], foot[2]]);
    await page.keyboard.press('e');
    await until(page, async () => (await held(page)) === stick, 'the stick in the hand');
    await page.goto(`${srv.base}/u/tam`);
    await W.worldView(page);
    await page.waitForFunction(() => !!globalThis.__papers, null, { timeout: 30000 });
    const [paper] = await (async () => {
      for (let i = 0; i < 60; i++, await page.waitForTimeout(250)) {
        const ps = await lyingOn(page);
        if (ps.length) return ps;
      }
      throw new Error('no paper on the table');
    })();
    await canvas(page).focus();
    await page.keyboard.down('s');
    await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
    await page.keyboard.up('s');
    const jar = (await page.evaluate(() => globalThis.__things?.at('jar'))) ?? jarRestOf(roomGeometry(ROOM)); // (where its body is now)
    await page.evaluate((j) => globalThis.__sceneLook.at([j[0] - 0.2, j[1] - 0.45, 1.3]), jar);
    await page.waitForTimeout(1000);
    await aimAt(page, [jar[0], jar[1], jar[2] + 0.04]);
    await page.keyboard.press('h'); // (the stick is the pen: the house's stay where they lie)
    await W.panel(page, 'A carved stick in your hand').waitFor({ timeout: 10000 });
    await page.keyboard.press('e'); // its tip into the jar
    await page.getByText("It holds the jar's ink.").waitFor({ timeout: 10000 });
    // to the chair (rooms.md §4: writing happens from the seat): E where nothing else is, and sat
    const chair = seat(roomGeometry(ROOM)).pos;
    await page.evaluate((c) => globalThis.__sceneLook.at([c[0], c[1] - 0.1, c[2]]), chair);
    await page.waitForTimeout(800);
    await aimAt(page, [chair[0], chair[1] - 1, 0]); // (the floor behind)
    await page.keyboard.press('e');
    await page.waitForFunction(() => globalThis.__sceneLook?.pose() === null || globalThis.__sceneLook?.pose()?.mode === 'seated', null, { timeout: 10000 });
    await page.waitForTimeout(1000);
    const v2 = await canvas(page).boundingBox();
    const [stamped] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(`/api/papers/${paper.paper}/acts`) && r.request().method() === 'POST', { timeout: 30000 }),
      W.strokesIn(page, { x: v2.x + v2.width / 2 - 60, y: v2.y + v2.height / 2 - 10, width: 120, height: 20 }, W.across([0, 0.5], [1, 0.5]), 12),
    ]);
    if (stamped.status() !== 201) throw new Error(`the stick's stroke: ${stamped.status()} ${await stamped.text()}`);
    const lines = (await (await page.request.get(`${srv.base}/api/papers/${paper.paper}`)).json()).lines;
    const rec = lawOf(5).decodeCanonical(fromB64url(lines.findLast((l) => l.act.act === 'stroke').act.stroke));
    const pen = rec.strokes[0].pens[0];
    console.log(`   its stroke: a nib of ${M.ORDER[pen.matter]}, ${pen.size / 10} px across, dipped (well ${pen.well}), oak gall ${pen.gall}`);
    if (M.ORDER[pen.matter] !== 'wood' || !pen.well || pen.gall !== 255) throw new Error("the stroke was not the stick's");
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
