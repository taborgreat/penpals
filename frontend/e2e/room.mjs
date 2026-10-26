// Your house and another's (rooms.md; one-world.md), in two real browsers on this machine's GPU,
// the way two people go: the lobby (in black and white, by day); registering at its table; the eye
// opening in your house, where colour comes in; standing up, the book down from the shelf; writing on
// the wall under the shelf: ink on its plaster, each stroke an act on the wall's own chain. Then a
// visitor: bo reads the wall, takes the book down, goes home. Then together (law/paper.js): tabor takes up the
// paper on his table and carries it into bo's house, lets it go on bo's table; both write on it, one
// stamper, both screens growing it to the same facts; a lift; tabor takes it home again. Then seals: a
// candle lit, picked up, carried over the paper and tilted (each a signed act; its drips the law's), the
// stamper taken up and given bo's face, pressed into the warm wax, bo writing by it at tabor's table, the
// seal cracked by tabor's bare hand.
//   node frontend/e2e/room.mjs      the built site (npm run build -w frontend first), on the GPU
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { roomGeometry, ROOM, stamperRestOf } from '../src/scene/light/room.js';
import { candle as C, paper as P, b64url as b64 } from 'penpals-law';
import * as W from './world.mjs';

const { step, panel, onScreen, pixels, darkened, colourOf } = W;
const PX_PER_M = 1400 / 0.2159;
const srv = await W.serve(3124, 'penpals-room-');
const base = srv.base;
const browser = await W.launch();
let browser2 = null; // the other person: their own browser (two people, two machines)
let failed = null;
const shot = (p, name) => p.screenshot({ path: path.join(os.tmpdir(), `penpals-e2e-${name}.png`) });
const scene = '.house-scene';
const canvas = (p) => p.locator(`${scene} canvas.scene-canvas`);
// E with the pointer on it: the hand takes it up (a press is the bare hand pushing)
const takeUp = async (p, at) => {
  await p.mouse.move(at[0] + 1, at[1]);
  await p.mouse.move(...at);
  await canvas(p).focus();
  await p.keyboard.press('e');
};
// the papers lying in the house each screen is in (room/together.js __papers), and the one in its hand
const lyingOn = (p) => p.evaluate(() => globalThis.__papers?.lying() ?? []);
const heldBy = (p) => p.evaluate(() => globalThis.__papers?.held() ?? null);
const until = async (p, fn, what, ms = 30000) => {
  let got = null;
  for (const end = Date.now() + ms; Date.now() < end; await p.waitForTimeout(250)) if ((got = await fn())) return got;
  throw new Error(`waited for ${what}`);
};
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
  await standUp(page);
  await page.evaluate(() => {
    globalThis.__sceneLook.at([1.2, 2.0, 1.6]);
    globalThis.__sceneLook.aim([0.0875, 2.31, 1.5175]); // the book on the shelf (scene/shelf.js)
  });
  await page.waitForTimeout(500);
  await page.mouse.click(...mid);
  const open = panel(page, 'Your book, open in your hands');
  await open.waitFor({ timeout: 10000 });
  console.log(`   the book, open: ${(await open.locator('.book-paper').count()) || 'nothing'} in it`);
  await open.getByRole('button', { name: 'Put it back' }).click();

  step('write on the wall under the shelf (the pen in hand: H): ink on its plaster, each stroke an act on its chain');
  const wallAt = [0, 2.0, 1.15];
  await page.evaluate((w) => {
    globalThis.__sceneLook.at([0.4, w[1], w[2]]);
    globalThis.__sceneLook.aim(w);
  }, wallAt);
  await page.waitForTimeout(1200);
  const bare = await onScreen(page, scene, pixels);
  await canvas(page).focus();
  await page.keyboard.press('h');
  await panel(page, 'The pen in your hand').waitFor({ timeout: 10000 });
  await W.strokesIn(page, { x: mid[0] - 70, y: mid[1] - 20, width: 140, height: 40 }, W.signature(0.001));
  let live = 0;
  for (let i = 0; i < 20 && live < 150; i++) {
    await page.waitForTimeout(300);
    live = darkened(bare, await onScreen(page, scene, pixels));
  }
  await shot(page, 'wall');
  console.log(`   ${live} pixels of the wall darkened by the ink as it is written`);
  if (live < 150) throw new Error('the ink does not show on the wall');
  const taborKey = (await (await page.request.get(`${base}/api/users/tabor`)).json()).user.publicKey;
  const onWall = async () => (await (await page.request.get(`${base}/api/papers/in/${taborKey}`)).json()).papers.find((v) => v.where.surface === 'wall-left');
  for (const end = Date.now() + 30000; Date.now() < end && !((await onWall())?.lines.length >= 4);) await page.waitForTimeout(500);
  const wall = await onWall();
  if (!(wall?.lines.length >= 4) || wall.lines.some((l) => l.act.act !== 'stroke'))
    throw new Error(`the strokes are not on the left wall's chain: ${JSON.stringify(wall && { lines: wall.lines.length, where: wall.where })}`);
  console.log(`   the left wall, matter with its own chain: ${wall.lines.length} strokes stamped on it (${wall.birth.family.matter}, law 4)`);
  let after = 0;
  for (const end = Date.now() + 30000; Date.now() < end && after < 150;) {
    await page.waitForTimeout(500);
    after = darkened(bare, await onScreen(page, scene, pixels));
  }
  console.log(`   grown as stamped: ${after} pixels darker than the bare wall`);
  if (after < 150) throw new Error('the stamped writing does not show on the wall');
  // and in the room's light: the patch the ink lies on drinks what its cells do (light-waves §4), the light settled anew
  const inLight = await until(
    page,
    async () => ((s) => (s?.ink?.length && s.parts && s.asked === s.parts.key ? s : null))(await page.evaluate(() => globalThis.__sceneLight?.state)),
    "the wall's ink in the room's light",
  );
  console.log(`   in the room's light: ${inLight.ink.length} patch(es) of the wall take the ink's own curves`);
  await canvas(page).focus();
  await page.keyboard.press('h'); // (the pen let go: it falls to the floor under the wall)
  await panel(page, 'The pen in your hand').waitFor({ state: 'detached', timeout: 10000 });

  step('someone else: bo registers, his own house');
  browser2 = await W.launch();
  const { context: other, page: guest } = await W.personIn(browser2);
  W.watch(guest, 'guest ');
  await guest.goto(base);
  await W.register(guest, 'bo');
  await guest.waitForURL(/\/u\/bo$/, { timeout: 90000 });

  step("visiting: bo comes into tabor's house, reads the wall, takes the book down, and goes home");
  await guest.goto(`${base}/u/tabor`);
  const g = await W.worldView(guest);
  const gmid = [g.view.x + g.view.width / 2, g.view.y + g.view.height / 2];
  await standUp(guest);
  const markAt = wallAt;
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
  const theirs = panel(guest, 'A book, in your hands');
  await theirs.waitFor({ timeout: 10000 });
  console.log(`   the book, taken down by a visitor: ${await theirs.locator('.meta').first().textContent()}`);
  await theirs.getByRole('button', { name: 'Put it back' }).click();
  await guest.goto(`${base}/u/bo`);
  await W.worldView(guest);
  console.log('   home again');

  // seated in a house (the eye at its chair, turned to the table's middle), hands free; the pointer on the view's middle
  async function seated(p, name) {
    await p.goto(`${base}/u/${name}`);
    const v = (await W.worldView(p)).view;
    await p.waitForFunction(() => !!globalThis.__papers, null, { timeout: 30000 });
    await p.mouse.move(v.x + v.width / 2, v.y + v.height / 2);
    await canvas(p).focus();
    return v;
  }
  // write on the paper before you: the pen taken up (H), a line, the pen let go on the bare table (H)
  const stampedOn = (p, paper) => p.waitForResponse((r) => r.url().endsWith(`/api/papers/${paper}/acts`) && r.request().method() === 'POST', { timeout: 30000 });
  async function writeOn(p, paper, at, strokes) {
    const v = (await W.worldView(p)).view;
    await canvas(p).focus();
    await p.keyboard.press('h');
    await panel(p, 'The pen in your hand').waitFor({ timeout: 10000 });
    const [stamped] = await Promise.all([
      stampedOn(p, paper).catch(async (err) => {
        await shot(p, 'write-on');
        console.log('   (what this screen has:', JSON.stringify({ lying: await lyingOn(p), pose: await p.evaluate(() => globalThis.__sceneLook?.pose() ?? null), url: p.url() }), ')');
        throw err;
      }),
      W.strokesIn(p, { x: v.x + v.width / 2 - 90 + at[0], y: v.y + v.height / 2 - 40 + at[1], width: 180, height: 80 }, strokes, 12),
    ]);
    if (stamped.status() !== 201) throw new Error(`a stroke on the paper: ${stamped.status()} ${await stamped.text()}`);
    await p.mouse.move(v.x + v.width * 0.04, v.y + v.height * 0.92); // (over the bare table)
    await p.keyboard.press('h');
    await panel(p, 'The pen in your hand').waitFor({ state: 'detached', timeout: 10000 });
    return (await stamped.json()).line.n;
  }

  step("together: tabor takes up the paper on his table (E), carries it into bo's house, and lets it go on bo's table (E)");
  await seated(page, 'tabor');
  const [paper] = await until(page, async () => ((ps) => ps.length && ps)(await lyingOn(page)), 'his paper on his table');
  const id = paper.paper;
  await page.keyboard.press('e');
  await until(page, async () => (await heldBy(page)) === id, 'the paper in his hand');
  await panel(page, 'A paper in your hand').waitFor({ timeout: 10000 });
  await seated(page, 'bo'); // (into bo's house, the paper in his hand: a hand is the being's, wherever it goes)
  await panel(page, 'A paper in your hand').waitFor({ timeout: 15000 });
  await page.keyboard.press('e');
  await until(page, async () => (await lyingOn(page)).some((x) => x.paper === id), "the paper on bo's table");
  const there = await (await page.request.get(`${base}/api/papers/${id}`)).json();
  const boKey = (await (await page.request.get(`${base}/api/users/bo`)).json()).user.publicKey;
  if (there.where.space !== boKey || !P.onTable(there.where)) throw new Error(`not on bo's table: ${JSON.stringify(there.where)}`);
  console.log(`   on bo's table at ${there.where.at.map((v) => (v / 1000).toFixed(3)).join(', ')} m; tabor's still`);

  step('bo writes on it, in his own house, at his table: his ink shows at once, and as stamped');
  await seated(guest, 'bo');
  await until(guest, async () => (await lyingOn(guest)).find((x) => x.paper === id)?.mayWrite, 'his to write on, on his table');
  const boN = await writeOn(guest, id, [0, 0], W.across([0, 0.5], [1, 0.5]));
  console.log(`   bo's stroke stamped: place ${boN}`);

  step("tabor writes across it in bo's house: one paper, two writers, one stamper");
  await until(guest, async () => (await (await guest.request.get(`${base}/api/rooms/bo/here`)).json()).beings.some((b) => b.name === 'tabor'), "tabor a being in bo's house");
  const taborN = await writeOn(page, id, [0, 0], W.across([0.5, 0], [0.5, 1]));
  console.log(`   tabor's stroke stamped: place ${taborN}`);
  const factsNow = async () => {
    const v = await (await page.request.get(`${base}/api/papers/${id}`)).json();
    const born = P.checkBirth(v.birth, v);
    return { lines: v.lines.length, facts: b64(P.growPaper(v.lines, { seed: born.seed, family: born.family }).facts) };
  };
  const agree = async () => {
    const truth = await factsNow();
    const on = async (p) => (await lyingOn(p)).find((x) => x.paper === id);
    let a, b;
    for (const end = Date.now() + 30000; Date.now() < end; await page.waitForTimeout(300)) {
      [a, b] = [await on(page), await on(guest)];
      if (a?.grown === truth.lines && b?.grown === truth.lines) break;
    }
    if (a?.facts !== truth.facts || b?.facts !== truth.facts) throw new Error(`the screens do not agree with the stamper: ${a?.facts} · ${b?.facts} · ${JSON.stringify(truth)}`);
    return truth.facts;
  };
  const both = await agree();
  console.log(`   both screens grew it to the stamper's facts: ${both}`);
  const visitor = (await (await page.request.get(`${base}/api/rooms/bo/here`)).json()).beings.find((b) => b.name === 'tabor');
  if (!visitor?.pose) throw new Error(`tabor is not a being in bo's house: ${JSON.stringify(visitor)}`);
  console.log(`   tabor, a being in bo's house: head at ${visitor.pose.pos.join(', ')} m, turned ${visitor.pose.yaw}°`);
  await shot(page, 'together');

  step('bo lifts his stroke (the pen in his hand): a forward act; his pigment goes, the paper grows anew on both screens');
  await canvas(guest).focus();
  await guest.keyboard.press('h');
  const lifted = stampedOn(guest, id);
  await panel(guest, 'The pen in your hand').getByRole('button', { name: 'Lift my last stroke' }).click();
  if ((await lifted).status() !== 201) throw new Error('the lift was not stamped');
  const g2 = (await W.worldView(guest)).view;
  await guest.mouse.move(g2.x + g2.width * 0.04, g2.y + g2.height * 0.92);
  await guest.keyboard.press('h');
  const after2 = await agree();
  if (after2 === both) throw new Error('the lift changed nothing');
  console.log(`   lifted, both screens: ${after2}`);

  step("tabor takes it home: up from bo's table (E), gone from it; let go on his own (E); bo can no longer write on it");
  await canvas(page).focus();
  const v1 = (await W.worldView(page)).view;
  await page.mouse.move(v1.x + v1.width / 2, v1.y + v1.height / 2);
  await page.keyboard.press('e');
  await until(page, async () => (await heldBy(page)) === id, 'the paper in his hand again');
  await until(guest, async () => !(await lyingOn(guest)).some((x) => x.paper === id), "gone from bo's table");
  await seated(page, 'tabor');
  await panel(page, 'A paper in your hand').waitFor({ timeout: 15000 });
  await page.keyboard.press('e');
  await until(page, async () => (await lyingOn(page)).some((x) => x.paper === id), 'on his own table');
  const home = await (await page.request.get(`${base}/api/papers/${id}`)).json();
  if (home.where.space !== home.ownerKey) throw new Error(`the paper is not home: ${JSON.stringify(home.where)}`);
  console.log("   back on tabor's table; gone from bo's");

  step("seals: tabor's candle burns; he carries it over the paper and tilts it, and its wax drips (the law's); he presses bo's seal in; bo writes on it at tabor's table; tabor's bare hand cracks it");
  await page.waitForFunction(() => !!globalThis.__candles, null, { timeout: 20000 });
  const lighting = page.waitForResponse((r) => r.url().endsWith('/api/rooms/tabor/act') && r.request().postData()?.includes('"light"'), { timeout: 20000 });
  await page.evaluate(() => globalThis.__candles.light(0)); // (his act: by hand here, whatever the world's clock says)
  if (![200, 409].includes((await lighting).status())) throw new Error('the candle was not lit');
  const entered = Date.now();
  await page.waitForTimeout(1200);
  const plain = await onScreen(page, scene, pixels);
  // the candle has been burning since he lit it: its pool melts (law/candle.js)
  const melting = 130000 - (Date.now() - entered);
  if (melting > 0) await page.waitForTimeout(melting);
  // where things are (room m): the candle's foot; the paper's middle, where it rests; the rim of a candle
  // tilted 60° stands beyond its foot toward +x (law/candle.js rimPoint), so the hand holds it short of the
  // middle by that much
  const geom = roomGeometry(ROOM);
  const middleM = (await lyingOn(page)).find((x) => x.paper === id).at;
  const rim = C.rimPoint(await page.evaluate(() => globalThis.__candles.candle(0).cd), [0, 0, middleM[2]], 60);
  const handM = [middleM[0] - rim[0], middleM[1] - rim[1], middleM[2]];
  const foot = geom.candles[0];
  // standing, the head turned to the candle: a click takes it up; turned to where the hand holds it over the paper
  await standUp(page);
  await page.evaluate((p) => globalThis.__sceneLook.at([p[0] - 0.3, p[1] - 0.4, 1.4]), foot);
  // (walking, the body settles under its weight after it is put there: the head is turned to the candle
  // from where it came to rest, again before each try)
  for (let tries = 0; ; tries++) {
    await page.waitForTimeout(800);
    await page.evaluate((p) => globalThis.__sceneLook.aim(p), [foot[0], foot[1], foot[2] + 0.1]);
    await page.waitForTimeout(300);
    await takeUp(page, mid); // (E: the hand takes it up)
    if (
      await panel(page, 'A candle in your hand')
        .waitFor({ timeout: 4000 })
        .then(
          () => true,
          () => false,
        )
    )
      break;
    if (tries === 3) {
      if (process.env.ROOM_SHOT) await page.screenshot({ path: process.env.ROOM_SHOT });
      throw new Error('the candle was not taken up');
    }
    console.log('   (the click took nothing: again)');
  }
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
  // set down off the paper (a click: it falls onto what is under it)
  await page.mouse.click(mid[0] - 120, mid[1]);
  await panel(page, 'A candle in your hand').waitFor({ state: 'detached', timeout: 10000 });
  // no one wrote a drip: the wax is the law's
  if ((await (await page.request.get(`${base}/api/papers/${id}`)).json()).lines.some((l) => l.act.act === 'drip')) throw new Error('a drip was written as an act');
  // the stamper: taken up from where it lies, given bo's face, pressed into the middle of the pool while it is warm
  const sr = stamperRestOf(geom);
  await page.evaluate((p) => globalThis.__sceneLook.aim(p), [sr[0], sr[1], sr[2] + 0.03]);
  await page.waitForTimeout(800);
  await takeUp(page, mid); // (E: the hand takes it up)
  const stamper = panel(page, 'The stamper in your hand');
  await stamper.waitFor({ timeout: 10000 });
  await stamper.getByLabel('Whose seal').fill('bo');
  await stamper.getByRole('button', { name: 'Set its face' }).click();
  await stamper.getByText("@bo's signature", { exact: false }).waitFor({ timeout: 15000 });
  const pressedRes = page.waitForResponse((r) => r.url().endsWith(`/api/papers/${id}/acts`) && r.request().method() === 'POST' && r.request().postData()?.includes('"press"'), { timeout: 20000 });
  await page.evaluate((p) => globalThis.__sceneLook.aim(p), middleM);
  await page.waitForTimeout(800);
  await page.mouse.click(...mid);
  const pr = await pressedRes;
  if (pr.status() !== 201) throw new Error(`the press: ${pr.status()} ${await pr.text()}`);
  await page.evaluate((p) => globalThis.__sceneLook.aim([p[0], p[1] - 0.25, p[2]]), middleM); // (off the paper, toward the writer)
  await page.waitForTimeout(500);
  await page.mouse.move(...mid);
  await page.keyboard.press('e'); // (the stamper set down there)
  // back in his chair, the eye on the paper as before: the wax and its impression, where it was bare
  await seated(page, 'tabor');
  let waxSeen = 0;
  for (const end = Date.now() + 20000; Date.now() < end && waxSeen < 150;) {
    await page.waitForTimeout(500);
    waxSeen = darkened(plain, await onScreen(page, scene, pixels), 0.4, 6);
  }
  await shot(page, 'seal');
  console.log(`   the wax and its impression on tabor's screen, from his chair: ${waxSeen} pixels`);
  if (waxSeen < 150) throw new Error('the wax does not show');
  // bo comes into tabor's house: the paper lies on its owner's table with his name pressed into it
  await seated(guest, 'tabor');
  await until(guest, async () => (await lyingOn(guest)).find((x) => x.paper === id)?.mayWrite, 'his to write on, by his seal');
  const boOnSeal = await writeOn(guest, id, [0, 60], W.across([0.1, 0.5], [0.9, 0.5]));
  console.log(`   bo writes on tabor's paper by his seal: place ${boOnSeal}`);
  // cracked by tabor's bare hand on it: bo may no longer write on it
  const seal = (await lyingOn(page)).find((x) => x.paper === id).seals[0];
  const pm = (await lyingOn(page)).find((x) => x.paper === id);
  const sealM = [pm.at[0] - 500 / PX_PER_M + seal.at.x / PX_PER_M, pm.at[1] + 350 / PX_PER_M - seal.at.y / PX_PER_M, pm.at[2]];
  await standUp(page);
  await page.evaluate((p) => globalThis.__sceneLook.at([p[0], p[1] - 0.3, 1.4]), sealM);
  await page.waitForTimeout(1000); // (the body settles under its weight: then the head is turned to it)
  await page.evaluate((p) => globalThis.__sceneLook.aim(p), sealM);
  await page.waitForTimeout(500);
  await page.mouse.move(mid[0] + 1, mid[1]);
  await page.mouse.move(...mid);
  const under = await page.evaluate(() => globalThis.__under?.());
  console.log(`   under the hand: ${JSON.stringify(under)} (the seal at ${seal.at.x.toFixed(0)}, ${seal.at.y.toFixed(0)})`);
  const broke = page.waitForResponse((r) => r.url().endsWith(`/api/papers/${id}/acts`) && r.request().postData()?.includes('"break"'), { timeout: 20000 });
  await page.mouse.click(...mid);
  if ((await broke).status() !== 201) throw new Error('the seal was not cracked');
  await until(guest, async () => (await lyingOn(guest)).find((x) => x.paper === id)?.seals[0]?.broken, 'the seal broken on his screen');
  await until(guest, async () => (await lyingOn(guest)).find((x) => x.paper === id)?.mayWrite === false, "bo's pen off it");
  console.log("   cracked: bo's pen is off it");
  await other.close();
  console.log('ok: the lobby, your house, the shelf, a wall written on; visiting, a door into another house; a paper carried into it and written on together; a seal in wax');
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
