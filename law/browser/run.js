// Determinism across engines: the same fixtures grown in Node and in real
// browsers (Chromium, Firefox, WebKit) must give byte-identical facts.
//   node law/browser/run.js [chromium firefox webkit]
// Starts the frontend's Vite dev server, opens /law-check in each browser
// (headless), reads every fixture's facts digest, and compares with Node.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES, fixtureBytes, testPaperKey } from '../tools/fixtures.js';
import { grow } from '../v1/sim.js';
import { settledCells, boxOf, factsDigest } from '../v1/look.js';
import { hex } from '../tags.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.join(here, '..', '..', 'frontend');
const family = { grain: 8, weight: 8, tooth: 0 };

export function nodeDigests(seed = 'tuning') {
  const out = {};
  for (const name of Object.keys(FIXTURES)) {
    const { bytes, rec } = fixtureBytes(name);
    const res = grow(rec, { paperKey: testPaperKey(seed), family });
    const cells = settledCells(res.tiles);
    out[name] = hex(factsDigest({ cells, box: boxOf(cells), actsBytes: bytes, family }));
  }
  return out;
}

export async function browserDigests(engines = ['chromium', 'firefox', 'webkit']) {
  const { createServer } = await import(path.join(frontend, 'node_modules', 'vite', 'dist', 'node', 'index.js')).catch(() => import('vite'));
  const server = await createServer({ root: frontend, configFile: path.join(frontend, 'vite.config.js'), logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
  await server.listen();
  const url = server.resolvedUrls.local[0].replace(/\/$/, '');
  const pw = await import('playwright');
  const results = {};
  try {
    for (const engine of engines) {
      const browser = await pw[engine].launch();
      const page = await browser.newPage();
      await page.goto(`${url}/law-check`);
      const n = Object.keys(FIXTURES).length;
      await page.waitForFunction((count) => document.querySelectorAll('[data-facts]:not([data-facts=""]), [data-error]:not([data-error=""])').length >= count, n, { timeout: 300000 });
      results[engine] = await page.$$eval('[data-fixture]', (els) => Object.fromEntries(els.map((e) => [e.dataset.fixture, e.dataset.facts || `error: ${e.dataset.error}`])));
      results[engine].userAgent = await page.evaluate(() => navigator.userAgent);
      await browser.close();
    }
  } finally {
    await server.close();
  }
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const engines = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit'];
  const node = nodeDigests();
  const browsers = await browserDigests(engines);
  let ok = true;
  for (const name of Object.keys(FIXTURES)) {
    const row = engines.map((e) => (browsers[e][name] === node[name] ? 'same' : `DIFF ${String(browsers[e][name]).slice(0, 16)}`));
    if (row.some((r) => r !== 'same')) ok = false;
    console.log(`${name.padEnd(13)} node ${node[name].slice(0, 16)}  ${engines.map((e, i) => `${e} ${row[i]}`).join('  ')}`);
  }
  for (const e of engines) console.log(`${e}: ${browsers[e].userAgent}`);
  console.log(ok ? 'all engines byte-identical' : 'ENGINES DISAGREE');
  process.exit(ok ? 0 : 1);
}
