// Loose matter picked up (one-matter.md Phase 4; Tabor, 2026-10-26: loose matter off a paper is a heap in the room),
// in a real browser on this machine's GPU: seated at your table, a hard dry scrape back and forth on the paper
// leaves its fibres lying loose on it. The pen set down, E with the pointer on the scrape: a fingertip takes up
// what lies under it (a pinch on the paper's chain), and it is a heap in your hand (a heap act on the room's). Let go
// (E again), it falls onto what is under it and lies there, a cone of fluff, for everyone after a reload.
//   node frontend/e2e/heaps.mjs      the built site (npm run build -w frontend first)
//   HEAPS_SHOT: a picture of the heap lying
import { paper as P } from 'penpals-law';
import * as W from './world.mjs';
import { PX_PER_M } from '../src/scene/light/room.js';
import { CELLS_PER_UNIT } from 'penpals-law/v1/constants';

const { step, panel } = W;
const srv = await W.serve(3135, 'penpals-heaps-');
const base = srv.base;
const browser = await W.launch();
let failed = null;
const canvas = (p) => p.locator('.house-scene canvas.scene-canvas');
const lyingOn = (p) => p.evaluate(() => globalThis.__papers?.lying() ?? []);
const heaps = (p) => p.evaluate(() => Object.entries(globalThis.__things?.bodies() ?? {}).filter(([id]) => id.startsWith('heap:')));
const until = async (p, fn, what, ms = 30000) => {
  let got;
  for (const end = Date.now() + ms; Date.now() < end; await p.waitForTimeout(250)) if ((got = await fn())) return got;
  throw new Error(`waited for ${what}`);
};
const grownOf = (v) => {
  const born = P.checkBirth(v.birth, v);
  return P.growPaper(v.lines, { seed: born.seed, family: born.family, law: P.lawFor(v.birth) });
};
const loose = (v) => grownOf(v)?.cells.reduce((n, c) => n + (c[19] ?? 0), 0) ?? 0;
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(base);
  await W.register(page, 'pip');
  await page.waitForURL(/\/u\/pip$/, { timeout: 90000 });
  const { view: v } = await W.worldView(page);
  const [paper] = await until(page, async () => ((ps) => ps.length && ps)(await lyingOn(page)), 'the paper before the chair');

  step('a hard dry scrape back and forth on the paper: its fibres lie loose on it');
  await canvas(page).focus();
  await page.keyboard.press('h');
  await panel(page, 'The pen in your hand').waitFor({ timeout: 10000 });
  const posted = [];
  page.on('response', (r) => /\/api\/papers\/[^/]+\/acts$/.test(r.url()) && r.request().method() === 'POST' && posted.push([r.url().split('/').at(-2), r.status()]));
  const spot = { x: v.x + v.width / 2 - 60, y: v.y + v.height / 2 + 30 };
  const zigzag = [[...Array(201).keys()].map((i) => [Math.abs(((i / 10) % 2) - 1), 0.5])]; // (twenty passes)
  await W.strokesIn(page, { x: spot.x - 10, y: spot.y - 2, width: 20, height: 4 }, zigzag, 12, { pressure: 1 });
  await until(page, async () => posted.length >= 1, 'the scrape stamped', 30000);
  await page.waitForTimeout(1500);
  const before = loose(await (await page.request.get(`${base}/api/papers/${paper.paper}`)).json());
  console.log(`   ${(before / 1e6).toFixed(3)} mg of its fibres lie loose on it`);
  if (!(before > 0)) throw new Error('nothing lies loose after the scrape');

  step('the pen set down, up from the chair; E with the pointer on the scrape: a pinch, and a heap in the hand');
  await page.keyboard.press('h');
  // where the most of it lies (room m): its cell on the paper, the paper where it lies
  const now = await (await page.request.get(`${base}/api/papers/${paper.paper}`)).json();
  const cells = grownOf(now).cells.filter((c) => c[19] > 0);
  const most = cells.reduce((m, c) => (c[19] > m[19] ? c : m));
  const lies = (await lyingOn(page)).find((x) => x.paper === paper.paper);
  const [w, h] = now.birth.size;
  const q = [most[1] / CELLS_PER_UNIT, most[0] / CELLS_PER_UNIT]; // (a settled cell: [y, x, ...])
  const target = [lies.at[0] + (q[0] - w / 2) / PX_PER_M, lies.at[1] - (q[1] - h / 2) / PX_PER_M, lies.at[2]];
  await page.keyboard.down('s');
  await page.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await page.keyboard.up('s');
  await page.evaluate((t) => globalThis.__sceneLook.at([t[0], t[1] - 0.5, 1.4]), target);
  await page.waitForTimeout(600);
  await page.evaluate((t) => globalThis.__sceneLook.aim(t), target);
  const mid = [v.x + v.width / 2, v.y + v.height / 2];
  await page.mouse.move(mid[0] + 1, mid[1]);
  await page.mouse.move(...mid);
  await page.waitForTimeout(300);
  // (the pen lies at its rest over the scrape: on top, the hand takes it first; then the fibres under it)
  const penOnTop = await page.evaluate(() => !globalThis.__things.bodies().pen?.held);
  await page.keyboard.press('e');
  if (penOnTop) {
    await page.waitForFunction(() => !!globalThis.__things.bodies().pen?.held, null, { timeout: 10000 });
    await page.waitForTimeout(500);
    await page.keyboard.press('e');
  }
  const [[heap, body]] = await until(page, async () => ((h) => h.length && h)(await heaps(page)), 'a heap in the room', 20000);
  const { after } = await until(
    page,
    async () => ((n) => (n < before ? { after: n } : null))(loose(await (await page.request.get(`${base}/api/papers/${paper.paper}`)).json())),
    'the pinch on the paper',
    20000,
  );
  console.log(`   ${heap}: ${body.shape.matter}, ${((before - after) / 1e6).toFixed(3)} mg taken up (a cone ${(body.shape.r * 1000).toFixed(2)} mm round), held: ${!!body.held}`);
  if (!body.held) throw new Error('the heap is not in the hand');
  if (body.shape.matter !== 'paper') throw new Error(`a heap of ${body.shape.matter}`);

  step('let go (E): it falls onto what is under it and lies there');
  await page.evaluate((t) => globalThis.__sceneLook.aim([t[0] + 0.06, t[1], t[2]]), target);
  await page.mouse.move(mid[0] + 1, mid[1]);
  await page.mouse.move(...mid);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  const lying = await until(page, async () => ((h) => h.find(([id, b]) => id === heap && !b.held))(await heaps(page)), 'the heap let go', 20000);
  console.log(`   lying at ${lying[1].at.map((x) => x.toFixed(3)).join(', ')}`);
  await page.waitForTimeout(1500);
  if (process.env.HEAPS_SHOT) await page.screenshot({ path: process.env.HEAPS_SHOT });

  step('after a reload: the heap where it was let go');
  await page.reload();
  await W.worldView(page);
  const again = await until(page, async () => ((h) => h.find(([id]) => id === heap))(await heaps(page)), 'the heap after a reload', 30000);
  if (again[1].held || again[1].at.some((x, k) => Math.abs(x - lying[1].at[k]) > 1e-6)) throw new Error('the heap is not where it was let go');
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
console.log('ok: loose fibres pinched off a paper: a heap in the hand, let go, lying where it fell');
