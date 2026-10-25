// The mail (one-world.md), in a real browser on this machine's GPU: two people, two houses. Ana makes a
// shared sheet on her table, takes it up (E), walks out to bo's mailbox by his door and posts it (E): its
// flag goes up. Bo walks out to his own mailbox and takes it out (E): it lies on his table, in his hand.
//   node frontend/e2e/mail.mjs      the built site (npm run build -w frontend first)
import * as W from './world.mjs';

const { step, panel } = W;
const srv = await W.serve(3130, 'penpals-mail-');
const base = srv.base;
const browser = await W.launch();
const browser2 = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.journal-scene canvas.scene-canvas');
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
// stand up from the chair (S)
async function standUp(p) {
  await canvas(p).focus();
  if ((await p.evaluate(() => globalThis.__sceneLook?.pose()?.mode)) === 'walk') return;
  await p.keyboard.down('s');
  await p.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await p.keyboard.up('s');
}
// standing, out through the door (E on it, opened)
async function outDoors(p) {
  await standUp(p);
  await p.evaluate(() => globalThis.__sceneLook.at([0.8, 1.2, 1.6]));
  await p.waitForTimeout(1000);
  await aimAt(p, [0.8, 0, 1.0]);
  if (!(await p.evaluate(() => globalThis.__opens?.()?.opens?.door))) await p.keyboard.press('e');
  await p.waitForFunction(() => globalThis.__opens?.()?.opens?.door, null, { timeout: 10000 });
  await p.evaluate(() => globalThis.__sceneLook.at([0.8, -1.5, 1.6]));
  await p.waitForFunction(() => globalThis.__outsideNow?.ways?.around, null, { timeout: 20000 });
}
// at a mailbox (by its key): stand before it, aim at its box, E
async function atMailbox(p, key) {
  await until(p, async () => (await p.evaluate(() => globalThis.__hands.near().mailboxes)).some((m) => m.key === key), 'the mailbox seen', 20000);
  const m = (await p.evaluate(() => globalThis.__hands.near().mailboxes)).find((x) => x.key === key);
  await p.evaluate((x) => globalThis.__sceneLook.at([x.at[0], x.at[1] - 0.9, x.at[2] + 1.6]), m);
  await p.waitForTimeout(1200);
  await aimAt(p, [m.at[0], m.at[1], m.at[2] + 1.12]);
  const hit = await p.evaluate(() => globalThis.__hands.hit());
  console.log(`   the hand meets: ${hit?.kind}`);
  await p.keyboard.press('e');
  return m;
}
const keyOf = async (name) => (await (await fetch(`${base}/api/users/${name}`)).json()).user.publicKey;
const flagOf = async (key) => (await (await fetch(`${base}/api/shared/mailbox/${key}`)).json()).letters;
try {
  const { page: bo } = await W.personIn(browser2);
  W.watch(bo);
  await bo.goto(base);
  await W.register(bo, 'bo');
  await bo.waitForURL(/\/u\/bo$/, { timeout: 90000 });
  const boKey = await keyOf('bo');

  const { page: ana } = await W.personIn(browser);
  W.watch(ana);
  await ana.goto(base);
  await W.register(ana, 'ana');
  await ana.waitForURL(/\/u\/ana$/, { timeout: 90000 });
  await W.worldView(ana);
  await ana.waitForTimeout(3000);

  step('ana: a shared sheet on her table, taken up (E)');
  await canvas(ana).focus();
  await ana.keyboard.press('h'); // (the pen she came in with, set down: the table's panel)
  await panel(ana, 'At your table').getByRole('button', { name: '+ A shared sheet' }).click();
  await until(ana, async () => (await ana.evaluate(() => globalThis.__mail.sheets())).length > 0, 'the shared sheet on her table');
  const [sheet] = await ana.evaluate(() => globalThis.__mail.sheets());
  await standUp(ana);
  await ana.evaluate((s) => globalThis.__sceneLook.at([s.at[0], s.at[1] - 0.8, 1.6]), sheet); // (by the table, over it)
  await ana.waitForTimeout(800);
  await aimAt(ana, sheet.at);
  await ana.keyboard.press('e');
  await until(ana, async () => (await ana.evaluate(() => globalThis.__mail.letter())) === sheet.sheet, 'the letter in her hand');
  await panel(ana, 'A letter in your hand').waitFor({ timeout: 10000 });
  console.log(`   ${sheet.sheet} in her hand, its panel open`);

  step("ana walks out to bo's mailbox and posts it (E): its flag goes up");
  await outDoors(ana);
  await atMailbox(ana, boKey);
  await until(ana, async () => (await flagOf(boKey)) === 1, 'the letter in his mailbox');
  await until(ana, async () => !(await ana.evaluate(() => globalThis.__mail.letter())), 'her hand empty again');
  await until(ana, async () => (await ana.evaluate(() => globalThis.__hands.near().mailboxes)).find((m) => m.key === boKey)?.letters === 1, 'its flag up');
  console.log('   posted: one letter waits, its flag up');

  step('bo walks out to his own mailbox and takes it out (E): on his table, in his hand');
  await W.worldView(bo);
  await bo.waitForTimeout(3000);
  await outDoors(bo);
  await atMailbox(bo, boKey);
  await until(bo, async () => (await bo.evaluate(() => globalThis.__mail.letter())) === sheet.sheet, 'the letter in his hand');
  const v = await (await fetch(`${base}/api/shared/${sheet.sheet}`)).json();
  if (v.on !== 'bo' || v.box) throw new Error(`the letter is not on his table: ${JSON.stringify({ on: v.on, box: v.box })}`);
  if ((await flagOf(boKey)) !== 0) throw new Error('his mailbox is not empty');
  console.log("   taken out: it lies on bo's table, his mailbox empty");
} catch (err) {
  failed = err;
} finally {
  await browser.close();
  await browser2.close();
  srv.stop();
}
if (failed) {
  console.error('FAILED:', failed.message);
  process.exit(1);
}
console.log("ok: a letter posted into bo's mailbox, its flag up; taken out by bo, onto his table");
