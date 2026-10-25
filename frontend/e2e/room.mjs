// Your house and another's (rooms.md; one-world.md), in two real browsers on this machine's GPU,
// the way two people go: the lobby (in black and white, by day); registering at its table; the eye
// opening in your house, where colour comes in; standing up, the book down from the shelf; writing on
// the wall under the shelf, sealed there; a door in it into another's house. Then a visitor: bo reads
// the wall, takes the book down, goes through the door. Then together: a shared sheet laid on bo's
// table, both writing on it, one stamper, both screens growing it to the same facts; a lift; taken
// back. Then seals: a candle lit, picked up, carried over the sheet and tilted (each a signed act; its
// drips the law's), the stamper taken up and given bo's face, pressed into the warm wax, bo writing by
// it, the seal broken.
//   node frontend/e2e/room.mjs      the built site (npm run build -w frontend first), on the GPU
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { roomGeometry, ROOM, stamperRestOf } from '../src/scene/light/room.js';
import { originIn, slotOf, SHARED_PAGE } from '../src/room/table.js';
import { candle as C, shared as SH, b64url as b64 } from 'penpals-law';
import * as W from './world.mjs';

const { step, panel, onScreen, pixels, darkened, colourOf } = W;
const PX_PER_M = 1400 / 0.2159;
const srv = await W.serve(3124, 'penpals-room-');
const base = srv.base;
const browser = await W.launch();
let browser2 = null; // the other person: their own browser (two people, two machines)
let failed = null;
const shot = (p, name) => p.screenshot({ path: path.join(os.tmpdir(), `penpals-e2e-${name}.png`) });
const scene = '.journal-scene';
const canvas = (p) => p.locator(`${scene} canvas.scene-canvas`);
const bar = (p, title) => panel(p, title).locator('.together');
// standing up (S): the head is free, and the checks may turn it (scene/SceneView.jsx __sceneLook)
async function standUp(p) {
  await canvas(p).focus();
  await p.keyboard.down('s');
  await p.waitForFunction(() => globalThis.__sceneLook?.pose()?.mode === 'walk', null, { timeout: 10000 });
  await p.keyboard.up('s');
}
try {
  const { page } = await W.personIn(browser);
  W.watch(page);
  await page.goto(base);
  const sun = await W.sunNow();
  const byDay = sun > 8; // (colour is judged by daylight: at dusk, dawn or night the room is too dark to tell)

  step('the lobby: the room everyone comes in by, seen in black and white');
  await page.locator('.lobby-scene[data-gpu]').waitFor({ timeout: 60000 });
  const lv = await page.locator('.lobby-scene canvas.scene-canvas').boundingBox();
  const lobbyNow = () => onScreen(page, { x: lv.x, y: lv.y, width: lv.width * 0.55, height: lv.height }, colourOf); // (left of the panel)
  // its first frames wait on its shaders (a fresh browser compiles them all); then the light settles, the eye on it
  for (const end = Date.now() + 60000; Date.now() < end && (await lobbyNow()).lum < 1;) await page.waitForTimeout(1000);
  await page.waitForTimeout(2500);
  const lobby = await lobbyNow();
  console.log(`   colour spread ${lobby.spread.toFixed(1)}, brightness ${lobby.lum.toFixed(0)} (the sun ${sun.toFixed(0)}° up${byDay ? '' : ': too dark to judge its colour'})`);
  if (byDay && lobby.spread > 2.5) throw new Error(`the lobby is not in black and white (spread ${lobby.spread.toFixed(1)})`);
  if (byDay && lobby.lum < 4) throw new Error('the lobby is dark by day');

  step('register at its table: sign three times on its slip, the name, keep the key');
  await W.register(page, 'tabor');

  step('the eye closes, and opens in your own house: colour comes in');
  await page.waitForURL(/\/u\/tabor$/, { timeout: 90000 });
  const { view, clear } = await W.worldView(page);
  await page.waitForTimeout(4000); // colour comes in as the eye adapts
  const house = await onScreen(page, clear, colourOf);
  console.log(`   colour spread ${house.spread.toFixed(1)} (the lobby's ${lobby.spread.toFixed(1)})`);
  if (byDay && house.spread < lobby.spread + 3) throw new Error('colour did not come in');
  const mid = [view.x + view.width / 2, view.y + view.height / 2];

  step('stand up (S), turn to the shelf on the left wall, and take your book down');
  await canvas(page).focus();
  await page.keyboard.press('h'); // (the pen he came in with, set down: the hand is free)
  await standUp(page);
  await page.evaluate(() => {
    globalThis.__sceneLook.at([1.2, 2.0, 1.6]);
    globalThis.__sceneLook.aim([0.0875, 2.31, 1.5175]); // the book on the shelf (scene/shelf.js)
  });
  await page.waitForTimeout(500);
  await page.mouse.click(...mid);
  const open = panel(page, 'The book, open in your hands');
  await open.waitFor({ timeout: 10000 });
  console.log('   the book, open: ' + (await open.locator('.journal-pages button').allTextContents()).join(' · '));
  await open.getByRole('button', { name: 'Put it back' }).click();

  step('write on the wall under the shelf (the pen in hand: H), and seal it there');
  await page.evaluate(() => {
    globalThis.__sceneLook.at([0.4, 2.0, 1.15]);
    globalThis.__sceneLook.aim([0, 2.0, 1.15]);
  });
  await page.waitForTimeout(1200);
  const bare = await onScreen(page, scene, pixels);
  await canvas(page).focus();
  await page.keyboard.press('h');
  await panel(page, 'The pen in your hand').waitFor({ timeout: 10000 });
  await W.strokesIn(page, { x: mid[0] - 70, y: mid[1] - 20, width: 140, height: 40 }, W.signature(0.001));
  const wallSheet = panel(page, 'The pen in your hand').locator('.wall-sheet');
  await wallSheet.waitFor({ timeout: 10000 });
  let live = 0;
  for (let i = 0; i < 20 && live < 150; i++) {
    await page.waitForTimeout(300);
    live = darkened(bare, await onScreen(page, scene, pixels));
  }
  await shot(page, 'wall');
  console.log(`   ${live} pixels of the wall darkened by the ink as it is written (${await wallSheet.locator('.meta').textContent()})`);
  if (live < 150) throw new Error('the ink does not show on the wall');
  const placed = page.waitForResponse((r) => r.url().endsWith('/api/books/me/ink') && r.request().method() === 'POST', { timeout: 60000 });
  await wallSheet.getByRole('button', { name: 'Seal it there' }).click();
  const res = await placed;
  if (res.status() !== 201) throw new Error(`sealing it on the wall: ${res.status()} ${await res.text()}`);
  const book = await (await page.request.get(`${base}/api/books/me`)).json();
  const onWall = Object.entries(book.skeleton.surfaces).filter(([, f]) => f.items.length);
  if (onWall.length !== 1 || onWall[0][0] !== 'wall-left') throw new Error(`the writing is not on the left wall: ${JSON.stringify(onWall.map(([id, f]) => [id, f.items.length]))}`);
  console.log(`   on the ${onWall[0][0]}: ${JSON.stringify(onWall[0][1].items[0])}`);
  await wallSheet.waitFor({ state: 'detached', timeout: 30000 });
  let after = 0;
  for (const end = Date.now() + 30000; Date.now() < end && after < 150;) {
    await page.waitForTimeout(500);
    after = darkened(bare, await onScreen(page, scene, pixels));
  }
  console.log(`   sealed: ${after} pixels darker than the bare wall`);
  if (after < 150) throw new Error('the sealed writing does not show on the wall');

  step("a door: the writing on the wall made a way into someone else's house");
  browser2 = await W.launch();
  const { context: other, page: guest } = await W.personIn(browser2);
  W.watch(guest, 'guest ');
  await guest.goto(base);
  await W.register(guest, 'bo');
  await guest.waitForURL(/\/u\/bo$/, { timeout: 90000 });
  const item = onWall[0][1].items[0];
  const linked = await page.request.post(`${base}/api/books/me/edit`, { headers: { origin: base }, data: { op: 'link', surface: 'wall-left', item: item.id, target_room: 'bo' } });
  if (linked.status() !== 200) throw new Error(`making the door: ${linked.status()} ${await linked.text()}`);

  step("visiting: bo comes into tabor's house, reads the wall, takes the book down, and goes through the door");
  await guest.goto(`${base}/u/tabor`);
  const g = await W.worldView(guest);
  const gmid = [g.view.x + g.view.width / 2, g.view.y + g.view.height / 2];
  await standUp(guest);
  const lines = (await (await guest.request.get(`${base}/api/books/tabor/ink`)).text())
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l));
  const box = lines.find((l) => l.id === item.ink).ink.box;
  const [cx, cy] = [item.x + box[2] / 4, item.y + box[3] / 4]; // its middle (two cells a unit)
  const markAt = [0, cx / PX_PER_M, 2.438 - cy / PX_PER_M];
  const facing = (p) =>
    guest.evaluate((q) => {
      globalThis.__sceneLook.at([0.4, q[1], q[2]]);
      globalThis.__sceneLook.aim(q);
    }, p);
  await facing(markAt);
  // dark marks in the middle of the view: pixels well under its median brightness
  const marksIn = (d, w, h) => {
    const lum = [];
    for (let y = Math.floor(h * 0.35); y < h * 0.65; y++) for (let x = Math.floor(w * 0.35); x < w * 0.65; x++) lum.push((d[(y * w + x) * 4] + d[(y * w + x) * 4 + 1] + d[(y * w + x) * 4 + 2]) / 3);
    const median = [...lum].sort((a, b) => a - b)[lum.length >> 1];
    return lum.filter((v) => v < median - 25).length;
  };
  let seen = 0;
  for (const end = Date.now() + 40000; Date.now() < end && seen < 150;) {
    await guest.waitForTimeout(500);
    seen = await onScreen(guest, scene, marksIn);
  }
  await shot(guest, 'guest');
  console.log(`   the wall, as a visitor reads it: ${seen} pixels of ink`);
  if (seen < 150) throw new Error('the visitor does not see the writing on the wall');
  await guest.evaluate(() => {
    globalThis.__sceneLook.at([0.9, 2.31, 1.52]);
    globalThis.__sceneLook.aim([0.0875, 2.31, 1.5175]);
  });
  await guest.waitForTimeout(600);
  await guest.mouse.click(...gmid);
  const theirs = panel(guest, 'The book, open in your hands');
  await theirs.waitFor({ timeout: 10000 });
  console.log('   the book, taken down by a visitor: ' + (await theirs.locator('.journal-pages button').allTextContents()).join(' · '));
  await theirs.getByRole('button', { name: 'Put it back' }).click();
  await facing(markAt);
  await guest.waitForTimeout(600);
  await guest.mouse.click(...gmid);
  await guest.waitForURL(/\/u\/bo$/, { timeout: 15000 });
  console.log("   through the door: into bo's house");

  step("together: tabor makes a shared sheet on his table and lays it on bo's");
  await page.goto(`${base}/u/tabor`); // (back in his chair)
  await W.worldView(page);
  await canvas(page).focus();
  await page.keyboard.press('h'); // (the pen he came in with, set down: the table's panel)
  await bar(page, 'At your table').getByRole('button', { name: '+ A shared sheet' }).click();
  const made = bar(page, 'At your table').locator('.shared-sheet').first();
  await made.waitFor({ timeout: 15000 });
  const sheetId = await made.getAttribute('data-sheet');
  page.once('dialog', (d) => d.accept('bo'));
  await made.getByRole('button', { name: 'Lay it on…' }).click();
  await bar(page, 'At your table').locator(`.shared-sheet.away[data-sheet="${sheetId}"]`).waitFor({ timeout: 15000 });
  console.log(`   ${await bar(page, 'At your table').locator('.shared-sheet.away .meta').first().textContent()}`);

  const stampedOn = (p) => p.waitForResponse((r) => r.url().endsWith(`/api/shared/${sheetId}/acts`) && r.request().method() === 'POST', { timeout: 30000 });
  // write on it: the eye goes to it (Write on it), the pen in hand (H), a line, the pen down again
  async function writeOnSheet(p, title, at, strokes) {
    const v = (await W.worldView(p)).view;
    await bar(p, title).locator(`.shared-sheet[data-sheet="${sheetId}"]`).getByRole('button', { name: 'Write on it' }).click();
    await p.waitForTimeout(1200); // the eye goes to it
    await canvas(p).focus();
    await p.keyboard.press('h');
    await panel(p, 'The pen in your hand').waitFor({ timeout: 10000 });
    const [stamped] = await Promise.all([stampedOn(p), W.strokesIn(p, { x: v.x + v.width / 2 - 90 + at[0], y: v.y + v.height / 2 - 40 + at[1], width: 180, height: 80 }, strokes, 12)]);
    if (stamped.status() !== 201) throw new Error(`a stroke on the shared sheet: ${stamped.status()} ${await stamped.text()}`);
    await p.keyboard.press('h');
    await panel(p, title).waitFor({ timeout: 10000 });
    return (await stamped.json()).line.n;
  }

  step('bo writes on it, in his own house: his ink shows at once, and as stamped');
  await W.worldView(guest);
  await canvas(guest).focus();
  await guest.keyboard.press('h'); // (his pen set down: his table's panel)
  await bar(guest, 'At your table').locator(`.shared-sheet[data-sheet="${sheetId}"]`).waitFor({ timeout: 15000 });
  const boN = await writeOnSheet(guest, 'At your table', [0, 0], W.across([0, 0.5], [1, 0.5]));
  console.log(`   bo's stroke stamped: place ${boN}`);
  await bar(guest, 'At your table').locator(`.shared-sheet[data-sheet="${sheetId}"][data-grown="2"][data-facts]`).waitFor({ timeout: 30000 });

  step("tabor comes into bo's house and writes across it: one sheet, two writers, one stamper");
  await page.goto(`${base}/u/bo`);
  await W.worldView(page);
  await canvas(page).focus();
  if (await panel(page, 'The pen in your hand').isVisible()) await page.keyboard.press('h'); // (the hand free: the table's panel)
  await bar(page, 'At their table').locator(`.shared-sheet[data-sheet="${sheetId}"]`).waitFor({ timeout: 15000 });
  await bar(guest, 'At your table').locator('.here').filter({ hasText: '@tabor' }).waitFor({ timeout: 15000 });
  console.log(`   bo's house: ${await bar(guest, 'At your table').locator('.here').textContent()}`);
  const taborN = await writeOnSheet(page, 'At their table', [0, 0], W.across([0.5, 0], [0.5, 1]));
  console.log(`   tabor's stroke stamped: place ${taborN}`);
  const factsNow = async () => {
    const v = await (await page.request.get(`${base}/api/shared/${sheetId}`)).json();
    const born = SH.checkBirth(v.birth, v);
    return { lines: v.lines.length, facts: b64(SH.growShared(v.lines, { seed: born.seed, family: born.family }).facts) };
  };
  const agree = async (n, mine = 'At their table', theirs = 'At your table') => {
    let a, b;
    for (const end = Date.now() + 30000; Date.now() < end;) {
      const sel = `.shared-sheet[data-sheet="${sheetId}"][data-grown="${n}"]`;
      a = await bar(page, mine)
        .locator(sel)
        .getAttribute('data-facts', { timeout: 500 })
        .catch(() => null);
      b = await bar(guest, theirs)
        .locator(sel)
        .getAttribute('data-facts', { timeout: 500 })
        .catch(() => null);
      if (a && b) break;
      await page.waitForTimeout(300);
    }
    const truth = await factsNow();
    if (truth.lines !== n || a !== truth.facts || b !== truth.facts) throw new Error(`the screens do not agree with the stamper: ${a} · ${b} · ${JSON.stringify(truth)}`);
    return truth.facts;
  };
  const both = await agree(3);
  console.log(`   both screens grew it to the stamper's facts: ${both}`);
  const visitor = (await (await page.request.get(`${base}/api/rooms/bo/table`)).json()).beings.find((b) => b.name === 'tabor');
  if (!visitor?.pose) throw new Error(`tabor is not a being in bo's house: ${JSON.stringify(visitor)}`);
  console.log(`   tabor, a being in bo's house: head at ${visitor.pose.pos.join(', ')} m, turned ${visitor.pose.yaw}°`);
  await shot(page, 'together');

  step('bo lifts his stroke: a forward act; his pigment goes, the sheet grows anew on both screens');
  const lifted = stampedOn(guest);
  await bar(guest, 'At your table').locator(`.shared-sheet[data-sheet="${sheetId}"]`).getByRole('button', { name: 'Lift my last stroke' }).click();
  if ((await lifted).status() !== 201) throw new Error('the lift was not stamped');
  const after2 = await agree(4);
  if (after2 === both) throw new Error('the lift changed nothing');
  console.log(`   lifted, both screens: ${after2}`);

  step("tabor takes it back: it leaves bo's table, and bo can no longer write on it");
  await bar(page, 'At their table').locator(`.shared-sheet[data-sheet="${sheetId}"]`).getByRole('button', { name: 'Take it back' }).click();
  await bar(guest, 'At your table').locator(`.shared-sheet[data-sheet="${sheetId}"]`).waitFor({ state: 'detached', timeout: 15000 });
  const home = (await (await page.request.get(`${base}/api/shared/mine`)).json()).sheets.find((s) => s.sheet === sheetId);
  if (home?.on !== 'tabor') throw new Error(`the sheet is not home: ${home?.on}`);
  console.log("   back on tabor's table; gone from bo's");

  step("seals: tabor's candle burns; he carries it over the sheet and tilts it, and its wax drips (the law's); he presses bo's seal in; bo writes on it at tabor's table; tabor breaks it");
  await page.goto(`${base}/u/tabor`);
  await W.worldView(page);
  await page.waitForFunction(() => !!globalThis.__candles, null, { timeout: 20000 });
  const lighting = page.waitForResponse((r) => r.url().endsWith('/api/rooms/tabor/act') && r.request().postData()?.includes('"light"'), { timeout: 20000 });
  await page.evaluate(() => globalThis.__candles.light(0)); // (his act: by hand here, whatever the world's clock says)
  if (![200, 409].includes((await lighting).status())) throw new Error('the candle was not lit');
  const entered = Date.now();
  await canvas(page).focus();
  await page.keyboard.press('h'); // (his pen set down: the table's panel)
  const mineHere = bar(page, 'At your table').locator(`.shared-sheet[data-sheet="${sheetId}"]`);
  await mineHere.waitFor({ timeout: 15000 });
  await mineHere.getByRole('button', { name: 'Write on it' }).click();
  await page.waitForTimeout(1200);
  const plain = await onScreen(page, scene, pixels);
  // the candle has been burning since he lit it: its pool melts (law/candle.js)
  const melting = 130000 - (Date.now() - entered);
  if (melting > 0) await page.waitForTimeout(melting);
  // where things are (room m): the candle's foot; the sheet's middle on the table (its slot); the rim of
  // a candle tilted 60° stands beyond its foot toward +x (law/candle.js rimPoint), so the hand holds it
  // short of the middle by that much
  const geom = roomGeometry(ROOM);
  const o = originIn(geom, [1000, 1400]);
  const [sx, sy] = slotOf(0, 1000);
  const middleM = [o[0] + (sx + SHARED_PAGE.width / 2) / PX_PER_M, o[1] - (sy + SHARED_PAGE.height / 2) / PX_PER_M, o[2]];
  const rim = C.rimPoint(await page.evaluate(() => globalThis.__candles.candle(0).cd), [0, 0, o[2]], 60);
  const handM = [middleM[0] - rim[0], middleM[1] - rim[1], o[2]];
  const foot = geom.candles[0];
  // standing, the head turned to the candle: a click takes it up; turned to where the hand holds it over the sheet
  await standUp(page);
  await page.evaluate((p) => globalThis.__sceneLook.at([p[0] - 0.3, p[1] - 0.4, 1.4]), foot);
  await page.evaluate((p) => globalThis.__sceneLook.aim(p), [foot[0], foot[1], foot[2] + 0.1]);
  await page.waitForTimeout(800);
  await page.mouse.click(...mid);
  await panel(page, 'A candle in your hand').waitFor({ timeout: 10000 });
  await page.evaluate((p) => globalThis.__sceneLook.aim(p), handM);
  await page.waitForTimeout(800);
  await page.mouse.move(mid[0] + 2, mid[1]);
  await page.mouse.move(...mid);
  await page.waitForTimeout(400);
  // E held, the mouse to the right: tilted 60° (SceneView: 0.4° a pixel), held there, then upright
  const tilts = [];
  page.on('response', (r) => r.url().endsWith('/api/rooms/tabor/act') && r.request().postData()?.includes('"tilt"') && tilts.push(r.status()));
  await page.keyboard.down('e');
  await page.mouse.move(mid[0] + 150, mid[1], { steps: 10 });
  await page.waitForTimeout(3000); // (it pours at once, then drips as the flame melts more)
  await page.mouse.move(...mid, { steps: 10 });
  await page.waitForTimeout(400);
  await page.keyboard.up('e');
  console.log(`   tilted and back upright: ${tilts.length} tilt acts (${[...new Set(tilts)].join(', ')})`);
  if (!tilts.length || tilts.some((x) => x !== 200)) throw new Error("the tilt was not sent as the being's act");
  // set down off the sheet (a click: it falls onto what is under it)
  await page.mouse.click(mid[0] - 120, mid[1]);
  await panel(page, 'A candle in your hand').waitFor({ state: 'detached', timeout: 10000 });
  // no one wrote a drip: the wax is the law's
  if ((await (await page.request.get(`${base}/api/shared/${sheetId}`)).json()).lines.some((l) => l.act.act === 'drip')) throw new Error('a drip was written as an act');
  // the stamper: taken up from where it lies, given bo's face, pressed into the middle of the pool while it is warm
  const sr = stamperRestOf(geom);
  await page.evaluate((p) => globalThis.__sceneLook.aim(p), [sr[0], sr[1], sr[2] + 0.03]);
  await page.waitForTimeout(800);
  await page.mouse.click(...mid);
  const stamper = panel(page, 'The stamper in your hand');
  await stamper.waitFor({ timeout: 10000 });
  await stamper.getByLabel('Whose seal').fill('bo');
  await stamper.getByRole('button', { name: 'Set its face' }).click();
  await stamper.getByText("@bo's signature", { exact: false }).waitFor({ timeout: 15000 });
  const pressedRes = page.waitForResponse((r) => r.url().endsWith(`/api/shared/${sheetId}/acts`) && r.request().method() === 'POST' && r.request().postData()?.includes('"press"'), { timeout: 20000 });
  await page.evaluate((p) => globalThis.__sceneLook.aim(p), middleM);
  await page.waitForTimeout(800);
  await page.mouse.click(...mid);
  const pr = await pressedRes;
  if (pr.status() !== 201) throw new Error(`the press: ${pr.status()} ${await pr.text()}`);
  await page.evaluate((p) => globalThis.__sceneLook.aim([p[0], p[1] - 0.25, p[2]]), middleM); // (off the sheet, toward the writer)
  await page.waitForTimeout(500);
  await page.mouse.move(...mid);
  await page.keyboard.press('e'); // (the stamper set down there)
  // back in his chair, the eye on the sheet as before: the wax and its impression, where it was bare
  await page.goto(`${base}/u/tabor`);
  await W.worldView(page);
  await canvas(page).focus();
  await page.keyboard.press('h');
  await mineHere.getByRole('button', { name: 'Write on it' }).click();
  let waxSeen = 0;
  for (const end = Date.now() + 20000; Date.now() < end && waxSeen < 150;) {
    await page.waitForTimeout(500);
    waxSeen = darkened(plain, await onScreen(page, scene, pixels), 0.4, 6);
  }
  await shot(page, 'seal');
  console.log(`   the wax and its impression on tabor's screen, from his chair: ${waxSeen} pixels`);
  if (waxSeen < 150) throw new Error('the wax does not show');
  // bo comes into tabor's house: the sheet lies on its owner's table with his seal in it
  await guest.goto(`${base}/u/tabor`);
  await W.worldView(guest);
  await canvas(guest).focus();
  await guest.keyboard.press('h');
  const sealedForBo = bar(guest, 'At their table').locator(`.shared-sheet[data-sheet="${sheetId}"]`);
  await sealedForBo.getByRole('button', { name: 'Write on it' }).waitFor({ timeout: 30000 });
  const boOnSeal = await writeOnSheet(guest, 'At their table', [0, 60], W.across([0.1, 0.5], [0.9, 0.5]));
  console.log(`   bo writes on tabor's sheet by his seal: place ${boOnSeal}`);
  // broken: he may no longer write on it
  await page.goto(`${base}/u/tabor`);
  await W.worldView(page);
  await canvas(page).focus();
  await page.keyboard.press('h');
  await bar(page, 'At your table').locator(`.shared-sheet[data-sheet="${sheetId}"] .seal`).getByRole('button', { name: 'Break' }).click();
  await bar(guest, 'At their table').locator(`.shared-sheet[data-sheet="${sheetId}"] .seal[data-broken="true"]`).waitFor({ timeout: 20000 });
  await sealedForBo.getByRole('button', { name: 'Look at it' }).waitFor({ timeout: 20000 });
  console.log("   broken: bo's pen is off it");
  await other.close();
  console.log('ok: the lobby, your house, the shelf, a wall written on; visiting, a door into another house; writing together on one shared sheet; a seal in wax');
} catch (err) {
  failed = err;
} finally {
  await browser.close();
  await browser2?.close();
  srv.stop();
  if (failed) console.error('(the data kept: ' + srv.dataDir + ')');
  else fs.rmSync(srv.dataDir, { recursive: true, force: true });
}
if (failed) {
  console.error('FAILED:', failed.message);
  if (srv.log().includes('Error')) console.error(srv.log().slice(-2000));
  process.exit(1);
}
