// Write-mode lag over one long continuous stroke, in a real browser: the time
// from the pen reaching fresh paper until its ink is on screen, row after row.
// Uses the dev pad check, a full page with the chase (no account, nothing sent).
//   node frontend/e2e/lag.mjs [http://localhost:5173]
import { chromium } from 'playwright';

const base = process.argv[2] ?? 'http://localhost:5173';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
const send = (type, x, y, buttons, t) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, timestamp: t / 1000 });
await p.goto(`${base}/pad-check?chase`);
await p.locator('.pad canvas.ink').first().waitFor({ state: 'attached', timeout: 30000 });
await p.getByRole('button', { name: 'Chase', exact: true }).click();
await p.waitForTimeout(800);

// One stroke: rows left to right, each a little lower, never lifting.
const W = 1280,
  rows = 20,
  rowMs = 1200,
  dt = 8;
let t = Date.now();
let x = 120,
  y = 180;
await send('mouseMoved', x, y, 0, t);
await send('mousePressed', x, y, 1, t);
const lags = [];
for (let r = 0; r < rows; r++) {
  const y0 = 180 + r * 28;
  for (let k = 0; k < rowMs / dt; k++) {
    t += dt;
    x = 120 + ((W - 360) * k) / (rowMs / dt);
    y = y0 + 8 * Math.sin(k / 6);
    await send('mouseMoved', x, y, 1, t);
    const ahead = t - Date.now();
    if (ahead > 0) await new Promise((res) => setTimeout(res, ahead));
  }
  // how long until the ink at (x, y) shows (the stroke goes on: the pen just pauses for the probe)
  const t0 = Date.now();
  const seen = await p
    .waitForFunction(
      ([sx, sy]) => {
        const c = document.querySelector('.monk-ink');
        const dpr = window.devicePixelRatio || 1;
        const d = c.getContext('2d').getImageData(Math.round(sx * dpr) - 3, Math.round(sy * dpr) - 3, 7, 7).data;
        for (let i = 3; i < d.length; i += 4) if (d[i] > 40) return true;
        return false;
      },
      [x, y],
      { timeout: 10000, polling: 'raf' },
    )
    .then(
      () => Date.now() - t0,
      () => null,
    );
  lags.push(seen);
  t = Date.now();
}
await send('mouseReleased', x, y, 0, t + dt);
console.log('ink on screen after the pen, row by row (ms):', lags.join(' '));
await b.close();
