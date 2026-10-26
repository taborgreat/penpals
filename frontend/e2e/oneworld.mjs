// One world (one-world.md: one space), in two real browsers on this machine's GPU: ana and bo, each in
// their own house. Both walk out of their doors and see each other out there, where each is; every house is
// the same house, standing where its room is. Ana walks to bo's house and in through his open door: she is in
// his house, standing where she came in, a being there; bo sees her in his house.
//   node frontend/e2e/oneworld.mjs      the built site (npm run build -w frontend first)
import * as W from './world.mjs';
import { roomGeometry, ROOM } from '../src/scene/light/room.js';

const { step } = W;
const geom = roomGeometry(ROOM);
const srv = await W.serve(3132, 'penpals-oneworld-');
const base = srv.base;
const browser = await W.launch();
const browser2 = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
const until = async (p, fn, what, ms = 30000) => {
  let got = null;
  for (const end = Date.now() + ms; Date.now() < end; await p.waitForTimeout(250)) if ((got = await fn())) return got;
  throw new Error(`waited for ${what}`);
};
const aimAt = async (p, at) => {
  await p.evaluate((q) => globalThis.__sceneLook.aim(q), at);
  const v = await canvas(p).boundingBox();
  await p.mouse.move(v.x + v.width / 2 + 1, v.y + v.height / 2);
  await p.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
  await p.waitForTimeout(500);
};
const doorMid = (geom.door.x0 + geom.door.x1) / 2;
// standing, out through the door (E on it, opened), a step out in front of the house
async function outDoors(p) {
  await canvas(p).focus();
  await p.keyboard.down('s');
  await p.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await p.keyboard.up('s');
  await p.evaluate((x) => globalThis.__sceneLook.at([x, 1.2, 1.6]), doorMid);
  await p.waitForTimeout(1000);
  await aimAt(p, [doorMid, 0, 1.0]);
  if (!(await p.evaluate(() => globalThis.__opens?.()?.opens?.door))) await p.keyboard.press('e');
  await p.waitForFunction(() => globalThis.__opens?.()?.opens?.door, null, { timeout: 10000 });
  await p.evaluate((x) => globalThis.__sceneLook.at([x, -1.5, 1.6]), doorMid);
  await p.waitForFunction(() => globalThis.__outsideNow?.ways?.around, null, { timeout: 20000 });
}
try {
  const { page: ana } = await W.personIn(browser);
  W.watch(ana, 'ana ');
  await ana.goto(base);
  await W.register(ana, 'ana');
  await ana.waitForURL(/\/u\/ana$/, { timeout: 90000 });
  const { page: bo } = await W.personIn(browser2);
  W.watch(bo, 'bo ');
  await bo.goto(base);
  await W.register(bo, 'bo');
  await bo.waitForURL(/\/u\/bo$/, { timeout: 90000 });
  await ana.reload(); // (the world now has bo's house in it too)
  await W.worldView(ana);
  await W.worldView(bo);
  await ana.waitForTimeout(2000);

  step('both walk out of their doors');
  await outDoors(ana);
  await outDoors(bo);

  step('each sees the other out there, where each is; the other house is the same house, where its room stands');
  const boSeen = await until(ana, async () => (await ana.evaluate(() => globalThis.__world.seen())).find((b) => b.name === 'bo' && b.at), "bo, as ana's screen sees him");
  const anaSeen = await until(bo, async () => (await bo.evaluate(() => globalThis.__world.seen())).find((b) => b.name === 'ana' && b.at), "ana, as bo's screen sees her");
  const his = await until(ana, async () => (await ana.evaluate(() => globalThis.__outsideNow?.others ?? [])).find((h) => h.name === 'bo'), "bo's house, from ana's");
  // bo stands a step and a half out of his door: in ana's frame, his house's corner and that step from it
  const want = [his.at[0] + doorMid, his.at[1] - 1.5];
  if (Math.hypot(boSeen.at[0] - want[0], boSeen.at[1] - want[1]) > 0.3) throw new Error(`bo is not where he stands: ${JSON.stringify(boSeen.at)} (his door's step: ${JSON.stringify(want)})`);
  console.log(`   ana sees bo at ${boSeen.at.map((v) => v.toFixed(2)).join(', ')} m (her frame), by his house at ${his.at.map((v) => v.toFixed(2)).join(', ')}`);
  console.log(`   bo sees ana at ${anaSeen.at.map((v) => v.toFixed(2)).join(', ')} m (his frame)`);
  if (!his.opens?.door) throw new Error(`his door, open, as ana's screen has it: ${JSON.stringify(his.opens)}`);

  step("ana walks to bo's house and in through his open door: into his house, standing where she came in");
  await ana.evaluate(([x, y, z]) => globalThis.__sceneLook.at([x, y, z]), [his.at[0] + doorMid, his.at[1] - 0.8, his.at[2] + 1.6]);
  await ana.evaluate(([x, y, z]) => globalThis.__sceneLook.aim([x, y, z]), [his.at[0] + doorMid, his.at[1] + 2, his.at[2] + 1.4]);
  await canvas(ana).focus();
  await ana.keyboard.down('w');
  await ana.waitForURL(/\/u\/bo$/, { timeout: 20000 });
  await ana.keyboard.up('w');
  await W.worldView(ana);
  const inside = await until(ana, async () => ((p) => p?.mode === 'walk' && p)(await ana.evaluate(() => globalThis.__sceneLook?.pose())), 'ana standing in his house');
  if (!(inside.pos[1] >= 0 && inside.pos[1] < 1.5 && Math.abs(inside.pos[0] - doorMid) < 0.5)) throw new Error(`not just inside his door: ${JSON.stringify(inside.pos)}`);
  console.log(`   in bo's house at ${inside.pos.map((v) => v.toFixed(2)).join(', ')} m, by his door`);
  await until(bo, async () => (await (await fetch(`${base}/api/rooms/bo/here`)).json()).beings.some((b) => b.name === 'ana'), "ana a being in bo's house");
  const inHis = await until(
    bo,
    async () => (await bo.evaluate(() => globalThis.__world.seen())).find((b) => b.name === 'ana' && b.at && b.at[1] > 0 && b.at[1] < geom.size[1]),
    'bo sees ana in his house',
  );
  console.log(`   bo sees ana in his house at ${inHis.at.map((v) => v.toFixed(2)).join(', ')} m`);
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
console.log('ok: two beings out of doors see each other where they are; every house the same house; in through his door, into his house');
