// The room's things block the light (matter-fixes §4), in a real browser on this
// machine's GPU: at night, a hand held over the page between a candle and the paper
// casts a shadow on it from that candle, and moving the candle moves the shadow (the
// old place is lit again, the new one dark). Each is measured on the screen: the
// page where the shadow must fall, against the same place without the hand (as a
// share of a place nothing shades, so the flames' flicker cancels).
// It builds the site with the dev pages in (VITE_LABS=1) and looks at /pad-check.
//
//   node frontend/e2e/shadows.mjs            WebGL2, then WebGPU
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(here, '..');
const root = path.join(frontend, '..');
const pathToUrl = (p) => `file:///${p.replace(/\\/g, '/')}`;
const { build, preview } = await import(pathToUrl(path.join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')));
const { chromium } = await import(pathToUrl(path.join(root, 'node_modules', 'playwright', 'index.mjs')));

const PORT = 5302;
const shotsTo = process.argv.find((a) => a.startsWith('--shots='))?.slice(8); // (a picture of each state, the places marked)
const outDir = path.join(os.tmpdir(), 'penpals-shadows-dist');
process.env.VITE_LABS = '1';
await build({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', build: { outDir, emptyOutDir: true } });
const server = await preview({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', build: { outDir }, preview: { port: PORT, host: '127.0.0.1', strictPort: true } });
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] });

// A candle's own wax top shades the table straight below its flame: within the angle its
// rim makes from the flame (light/candle.js: its radius, the flame's height over the wax; and a little).
const { candleState, DIAMETER } = await import(pathToUrl(path.join(frontend, 'src', 'scene', 'light', 'candle.js')));
const lit = candleState(600000, 0, { which: 0 });
const OWN_DEG = (Math.atan2(DIAMETER / 2, lit.flameAt - lit.height) * 180) / Math.PI + 3;
const fromDown = (F, X) => (Math.atan2(Math.hypot(X[0] - F[0], X[1] - F[1]), F[2] - X[2]) * 180) / Math.PI;
const CLEAR_M = 0.015; // the rest of the being stays this far off every line that matters (past a shadow's soft edge)
const sub = (a, b) => a.map((v, i) => v - b[i]);
const add = (a, b) => a.map((v, i) => v + b[i]);
const mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((t, v, i) => t + v * b[i], 0);
// how far the segment a → b passes outside part o (a sphere, or an ellipsoid zr tall)
const past = (a, b, o) => {
  const k = o.zr ? o.r / o.zr : 1;
  const z = (p) => [p[0], p[1], p[2] * k];
  return reach(z(a), z(b), z(o.c)) - o.r;
};
// how close the segment a → b comes to c
const reach = (a, b, c) => {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(c, a), ab) / dot(ab, ab)));
  return Math.hypot(...sub(add(a, mul(ab, t)), c));
};
// A being's parts (engine.js setBeings), as spheres (room m): its head at `at`, facing `yaw`°, size s.
function partsOf(at, yaw, s) {
  const by = (yaw * Math.PI) / 180;
  const ahead = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];
  const [x, y, z] = at;
  const hand = (i) => {
    const [ax, ay] = ahead(by, 0.22 * s),
      [sx, sy] = ahead(by + (i ? 1 : -1) * (Math.PI / 2), 0.16 * s);
    return { c: [x + ax + sx, y + ay + sy, z - 0.38 * s], r: 0.045 * s };
  };
  const [px, py] = ahead(by, 0.24 * s),
    [qx, qy] = ahead(by + Math.PI / 2, 0.16 * s);
  return {
    hand: hand(0),
    others: [
      { c: [x, y, z], r: 0.1 * s },
      { c: [x, y, z - 0.42 * s], r: 0.2 * s, zr: 0.26 * s }, // (the body: taller than wide)
      hand(1),
      { c: [x + px + qx, y + py + qy, z - 0.33 * s], r: 0.07 * s },
    ],
  };
}
// The head's place for the hand at H (room m).
const headFor = (H, yaw, s) => {
  const p = partsOf([0, 0, 0], yaw, s).hand.c;
  return sub(H, p);
};

let failed = 0;
try {
  for (const gpu of ['webgl2', 'webgpu']) {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.on('pageerror', (e) => console.log(`  [${gpu} page error]`, e.message));
    page.on('console', (m) => m.type() === 'error' && console.log(`  [${gpu} console]`, m.text().slice(0, 300)));
    await page.goto(`http://127.0.0.1:${PORT}/pad-check?hour=22${gpu === 'webgl2' ? '&gpu=webgl2' : ''}`);
    await page.locator('.pad-scene .scene-view[data-gpu]').first().waitFor({ timeout: 60000 });
    const drawn = await page.locator('.pad-scene .scene-view[data-gpu]').first().getAttribute('data-gpu');
    const scene = page.locator('.pad-scene canvas.scene-canvas').first();
    await scene.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(4000); // (the light settled, the candles burning)
    const now = () =>
      page.evaluate(() => {
        const v = [...globalThis.__sceneViews][0];
        const c = v.camera;
        return { ...v.sources(), eye: c.position.toArray(), view: [...c.matrixWorldInverse.elements], proj: [...c.projectionMatrix.elements] };
      });
    let w = await now();
    const toRoom = (p) => p.map((v, i) => (v - w.room.at[i]) / w.room.scale);
    const toWorld = (p) => p.map((v, i) => v * w.room.scale + w.room.at[i]);
    const sheet = w.sheets[0];
    const onPage = (q) => q[0] > sheet.x0 + 20 && q[0] < sheet.x0 + sheet.w - 20 && -q[1] > sheet.y0 + 20 && -q[1] < sheet.y0 + sheet.h - 20;
    // world → the element's pixels
    const box = await scene.boundingBox();
    const toScreen = (p) => {
      const m = (e, q) => [0, 1, 2, 3].map((r) => e[r] * q[0] + e[4 + r] * q[1] + e[8 + r] * q[2] + e[12 + r] * q[3]);
      const c = m(w.proj, m(w.view, [...p, 1]));
      return [box.x + ((c[0] / c[3] + 1) / 2) * box.width, box.y + ((1 - c[1] / c[3]) / 2) * box.height];
    };
    // the page under the line from a flame through H (world)
    const under = (F, H) => add(F, mul(sub(H, F), F[2] / (F[2] - H[2])));
    // A hand over the page between flame 1 and the paper (t of the way down from the flame),
    // the rest of its being clear of every line that matters: flame 1 to where the shadow
    // falls, the eye to it, and a place nothing shades (Q: from either flame, and seen).
    const F = w.flames[0];
    const want = [sheet.x0 + sheet.w * 0.5, -(sheet.y0 + sheet.h * 0.5), 0];
    const grid = [];
    for (const fx of [0.1, 0.3, 0.7, 0.9]) for (const fy of [0.2, 0.5, 0.8]) grid.push([sheet.x0 + sheet.w * fx, -(sheet.y0 + sheet.h * fy), 0]);
    let pick = null;
    for (const s of [0.16, 0.22, 0.3, 0.45])
      for (const t of [0.55, 0.65])
        for (let yaw = 0; yaw < 360 && !pick; yaw += 15) {
          const H = toRoom(add(F, mul(sub(want, F), t)));
          const head = headFor(H, yaw, s);
          const parts = partsOf(head, yaw, s);
          const clear = (a, b) => parts.others.every((o) => past(toRoom(a), toRoom(b), o) > CLEAR_M);
          const free = (a, b) => clear(a, b) && past(toRoom(a), toRoom(b), parts.hand) > 0.008;
          if (!(clear(F, want) && free(w.eye, want) && clear(w.flames[1], want))) continue;
          const Q = grid.find((q) => free(F, q) && free(w.flames[1], q) && free(w.eye, q) && Math.hypot(q[0] - want[0], q[1] - want[1]) > 150);
          if (Q) pick = { s, t, yaw, head, H, P: want, Q };
        }
    if (!pick) throw new Error(`${gpu}: no place for the hand clear of the rest of the being (sheet ${JSON.stringify(sheet)}, flames ${JSON.stringify(w.flames.map((f) => f.map(Math.round)))})`);
    const being = (on) =>
      page.evaluate(
        ({ on, pick }) => {
          const v = [...globalThis.__sceneViews][0];
          v.setBeings(on ? [{ name: 'shade', pose: { pos: pick.head, yaw: pick.yaw, pitch: 0, size: pick.s } }] : null);
          v.invalidate();
        },
        { on, pick },
      );
    // the share P keeps of Q's light, over a few frames (the flicker cancels in the share)
    const lumAt = async (pts) => {
      const shots = [];
      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => [...globalThis.__sceneViews][0].invalidate());
        await page.waitForTimeout(250);
        shots.push((await page.screenshot({ timeout: 90000 })).toString('base64')); // (the viewport: the canvas is at box)
      }
      return page.evaluate(
        async ({ shots, pts }) => {
          const sums = pts.map(() => 0);
          for (const b64 of shots) {
            const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
            const c = new OffscreenCanvas(img.width, img.height);
            const g = c.getContext('2d');
            g.drawImage(img, 0, 0);
            pts.forEach(([x, y], k) => {
              const d = g.getImageData(Math.round(x) - 3, Math.round(y) - 3, 7, 7).data;
              let t = 0;
              for (let i = 0; i < d.length; i += 4) t += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
              sums[k] += t / (d.length / 4);
            });
          }
          return sums.map((v) => v / shots.length);
        },
        { shots, pts },
      );
    };
    const snap = async (name, pts) => {
      if (!shotsTo) return;
      await page.evaluate((pts) => {
        for (const el of document.querySelectorAll('.e2e-mark')) el.remove();
        for (const [x, y] of pts) {
          const d = document.createElement('div');
          d.className = 'e2e-mark';
          Object.assign(d.style, { position: 'fixed', left: `${x - 4}px`, top: `${y - 4}px`, width: '8px', height: '8px', border: '1px solid #0f0', zIndex: 99, pointerEvents: 'none' });
          document.body.append(d);
        }
      }, pts);
      await page.screenshot({ path: path.join(shotsTo, `shadows-${gpu}-${name}.png`), timeout: 90000 });
      await page.evaluate(() => document.querySelectorAll('.e2e-mark').forEach((el) => el.remove()));
    };
    const share = async (P, Q) => {
      const [p, q] = await lumAt([toScreen(P), toScreen(Q)]);
      return p / q;
    };
    await being(false);
    const bare = await share(pick.P, pick.Q);
    await snap('bare', [toScreen(pick.P), toScreen(pick.Q)]);
    await being(true);
    const shaded = await share(pick.P, pick.Q);
    await snap('shaded', [toScreen(pick.P), toScreen(pick.Q)]);
    const drop = 1 - shaded / bare;
    console.log(`${gpu} (drawn with ${drawn}): a hand ${(pick.s * 9).toFixed(1)} cm across over the page; where its shadow falls the page keeps ${(100 * (1 - drop)).toFixed(0)}% of its light`);
    if (!(drop > 0.12)) {
      failed++;
      console.log('  FAILED: the hand casts no shadow from the candle');
    }
    // The candle moved: the old place lit again, the new place in the shadow. It moves away
    // from the page, as far as moves the shadow a little more than its own width (a sphere's,
    // t of the way down: 1/t as wide). (Toward the page, the new place would come into the
    // candle's own shade: its wax top, 2 cm under the flame, shades the table around its foot.)
    const r = partsOf(pick.head, pick.yaw, pick.s).hand.r;
    const move = (3 * r * (1 - pick.t)) / (pick.t * pick.t);
    const away = sub(F, pick.P).slice(0, 2);
    const k = move / Math.hypot(...away);
    const foot = toRoom([F[0], F[1], 0]);
    await page.evaluate((at) => globalThis.__sceneLight.placeCandle(0, at, 0), add(foot, [away[0] * k, away[1] * k, 0]));
    await page.waitForTimeout(2500);
    w = await now();
    const P2 = under(w.flames[0], toWorld(pick.H));
    if (!onPage(P2)) throw new Error(`${gpu}: the moved shadow is off the page (${P2.map(Math.round)})`);
    for (const [a, b, what] of [
      [F, pick.P, 'the first place'],
      [w.flames[0], P2, 'the new place'],
    ])
      if (fromDown(a, b) < OWN_DEG) throw new Error(`${gpu}: ${what} is in the candle's own shade`);
    const parts = partsOf(pick.head, pick.yaw, pick.s);
    for (const [a, b, what] of [
      [w.flames[0], P2, 'flame 1 to the new place'],
      [w.flames[1], P2, 'flame 2 to the new place'],
      [w.eye, P2, 'the eye to the new place'],
      [w.flames[0], pick.Q, 'flame 1 to the bare place'],
    ])
      if (!parts.others.every((o) => past(toRoom(a), toRoom(b), o) > CLEAR_M)) throw new Error(`${gpu}: the being is in the way of ${what}`);
    await being(false);
    const bareOld = await share(pick.P, pick.Q),
      bareNew = await share(P2, pick.Q);
    await snap('moved-bare', [toScreen(pick.P), toScreen(P2), toScreen(pick.Q)]);
    await being(true);
    const nowOld = await share(pick.P, pick.Q),
      nowNew = await share(P2, pick.Q);
    await snap('moved', [toScreen(pick.P), toScreen(P2), toScreen(pick.Q)]);
    console.log('  flame 1 before', F.map(Math.round), 'after', w.flames[0].map(Math.round), 'P', pick.P.map(Math.round), 'P2', P2.map(Math.round));
    const oldDrop = 1 - nowOld / bareOld,
      newDrop = 1 - nowNew / bareNew;
    console.log(`  the candle moved ${(move * 100).toFixed(1)} cm: the shadow's old place keeps ${(100 * (1 - oldDrop)).toFixed(0)}%, its new place ${(100 * (1 - newDrop)).toFixed(0)}%`);
    if (!(newDrop > 0.12 && oldDrop < 0.06)) {
      failed++;
      console.log('  FAILED: the shadow did not move with the candle');
    }
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(failed ? `FAILED (${failed})` : 'ok: the things block the light; the shadows go where the candle sends them');
process.exit(failed ? 1 : 0);
