// No edge between matter (Tabor, 2026-10-25), in a real browser on this machine's GPU: seated at your
// table, one stroke from the paper before you on off its edge goes on onto the table under it, the paper's
// half on the paper's chain and the rest on the table's own (its wood), each grown by its own matter; a
// hard scrape back and forth over one place wears the paper through (its fibres loose) and, through the
// hole, cuts the table's wood (its shavings loose). A new paper, a full page ruled: its lines are ink, ruled
// stroke by stroke as it is made.
//   node frontend/e2e/edges.mjs      the built site (npm run build -w frontend first)
import { paper as P } from 'penpals-law';
import * as W from './world.mjs';

const { step, panel } = W;
const srv = await W.serve(3132, 'penpals-edges-');
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
// what a chain grew (law/paper.js): its ink's box, and what it is made of
const grown = (v) => {
  const born = P.checkBirth(v.birth, v);
  const g = P.growPaper(v.lines, { seed: born.seed, family: born.family });
  return { inked: g ? g.box[2] * g.box[3] : 0, matter: born.family.matter ?? 'paper', g };
};
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(base);
  await W.register(page, 'eda');
  await page.waitForURL(/\/u\/eda$/, { timeout: 90000 });
  const { view: v } = await W.worldView(page);
  const key = (await (await page.request.get(`${base}/api/users/eda`)).json()).user.publicKey;
  const [paper] = await until(page, async () => ((ps) => ps.length && ps)(await lyingOn(page)), 'the paper before the chair');

  step('one stroke from the paper on off its edge, onto the table it lies on');
  await canvas(page).focus();
  await page.keyboard.press('h');
  await panel(page, 'The pen in your hand').waitFor({ timeout: 10000 });
  const posted = [];
  page.on('response', (r) => /\/api\/papers\/[^/]+\/acts$/.test(r.url()) && r.request().method() === 'POST' && posted.push([r.url().split('/').at(-2), r.status()]));
  // from the paper's middle, to the right, on past where it ends (the table runs on there)
  await W.strokesIn(page, { x: v.x + v.width / 2, y: v.y + v.height / 2 - 10, width: v.width * 0.42, height: 20 }, W.across([0, 0.5], [1, 0.5], 60), 12);
  await until(page, async () => posted.length >= 2, 'a stroke on each chain', 20000);
  await page.waitForTimeout(1000);
  console.log(`   stamped: ${posted.map(([id, s]) => `${id === paper.paper ? 'the paper' : id} ${s}`).join(', ')}`);
  const all = (await (await page.request.get(`${base}/api/papers/in/${key}`)).json()).papers;
  const table = all.find((x) => x.where.surface === 'table');
  if (!table) throw new Error('nothing went onto the table');
  const onPaper = grown(await (await page.request.get(`${base}/api/papers/${paper.paper}`)).json());
  const onTable = grown(await (await page.request.get(`${base}/api/papers/${table.paper}`)).json());
  console.log(`   the paper: ${onPaper.inked} cells inked, on ${onPaper.matter}; the table: ${onTable.inked} cells inked, on ${onTable.matter}`);
  if (!onPaper.inked || !onTable.inked) throw new Error('the stroke did not go on across the edge');
  if (onTable.matter !== 'wood') throw new Error(`the table's half is on ${onTable.matter}`);

  step('a hard scrape back and forth over one place on the paper: it wears through, and goes on into the table');
  const before = posted.length;
  const zigzag = [[...Array(401).keys()].map((i) => [Math.abs(((i / 10) % 2) - 1), 0.5])]; // (forty passes)
  await W.strokesIn(page, { x: v.x + v.width / 2 - 140, y: v.y + v.height / 2 + 30, width: 40, height: 4 }, zigzag, 12, { pressure: 1 });
  await until(page, async () => posted.length >= before + 2, 'the scrape stamped on the paper and on the table', 30000);
  await page.waitForTimeout(1500);
  const paperNow = grown(await (await page.request.get(`${base}/api/papers/${paper.paper}`)).json());
  const tableNow = grown(await (await page.request.get(`${base}/api/papers/${table.paper}`)).json());
  const torn = paperNow.g.cells.filter((c) => c[11] & 1).length; // (law/v2/constants.js TORN)
  const fluff = paperNow.g.cuts?.byMatter?.[0] ?? 0; // (law/matter.js: paper is matter 0, wood 1)
  const shavings = (tableNow.g.cuts?.byMatter?.[1] ?? 0) - (onTable.g.cuts?.byMatter?.[1] ?? 0); // (the scrape's: the line before it shaved some too)
  console.log(
    `   the paper: ${torn} cells worn through, ${(fluff / 1e6).toFixed(2)} mg of its fibres loose; the table, through the hole: ${(shavings / 1e6).toFixed(2)} mg more of its wood shaved off, loose`,
  );
  if (!torn) throw new Error('the scrape did not wear the paper through');
  if (!(shavings > 0)) throw new Error('the scrape did not go on into the table');

  step('at the table, nothing in hand: a new paper, a full page, ruled 8 mm apart: its lines ruled in ink as it is made');
  await canvas(page).focus();
  await page.keyboard.press('h'); // (the pen let go: hands free at the table)
  const atTable = panel(page, 'At your table');
  await atTable.waitFor({ timeout: 15000 });
  await atTable.locator('select').nth(2).selectOption('full');
  await atTable.locator('select').nth(3).selectOption('8');
  const had = new Set((await lyingOn(page)).map((x) => x.paper));
  await atTable.getByRole('button', { name: 'New paper' }).click();
  const fresh = await until(page, async () => (await lyingOn(page)).find((x) => !had.has(x.paper)), 'the new paper on the table', 30000);
  const ruled = await until(page, async () => ((v) => (v.lines.length >= 20 ? v : null))(await (await page.request.get(`${base}/api/papers/${fresh.paper}`)).json()), 'its lines ruled', 60000);
  const g = grown(ruled);
  console.log(`   a ${ruled.birth.size.join(' × ')} paper, ${ruled.lines.length} lines ruled on it in ink (${g.inked} cells)`);
  if (ruled.birth.size[1] !== 1400) throw new Error('not a full page');
  if (!ruled.lines.every((l) => l.act.act === 'stroke')) throw new Error('its lines are not strokes');
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
console.log('ok: one stroke from the paper onto the table, each half inked on its own matter; a scrape through the paper into the wood');
