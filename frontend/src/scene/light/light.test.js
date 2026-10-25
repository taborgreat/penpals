// Light as a range of waves (light-waves.md, Tests): the daylight match, the
// candlelight, the air, the candles, the eye, fading by absorbed light, and the
// record untouched. The room's build, its cells and the bounce have their own
// files (room.test.js, surface.test.js, bounce.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { N, BINS, HEAT, LAMBDA } from './axis.js';
import { blackbody, planck, planckTail } from './blackbody.js';
import { GRANT, BETA, airPath, sunLight, sky, daylight, toward, sunPlace, NOON_EL } from './air.js';
import { outsideAt } from './outside.js';
import { CMF, DAYLIGHT, INK } from './curves.js';
import { xyzOf, xyzToLinear, srgbToLab, hexToSrgb, deltaE, decode, LUMENS, brightness } from './color.js';
import { cellReflectance, paperCurve, inkAbsorbance } from './matter.js';
import { createEye, settledOn, step, toScreen, exposureOf, adaptationOf, screenWeights, tone, encode } from './eye.js';
import { candleLit, candleState, flameLight, NEW_CANDLE } from './candle.js';
import * as C from 'penpals-law/candle';
import { fadeByLight, fadedInk } from './fade.js';
import { solve } from './bounce.js';
import { SIGNATURE_COLORS } from '../../hand/colors.js';
import { PAPERS } from '../../ink/paper.js';
import { createCapture, strokesToActs } from '../../ink/capture.js';
import { settle } from 'penpals-law/record';
import { factsDigest } from 'penpals-law/v2/look';
import { b64url } from 'penpals-law/tags';

const WHITE = new Float64Array(N).fill(1);
const H = 3600e3; // an hour, ms
const swatch = (hex) => hexToSrgb(hex).map((v) => Math.round(v * 255));
const absOf = (rgb) => rgb.map((c) => 1024 * Math.log(255 / Math.max(1, c)));
const lumOf = (s) => xyzOf(s, CMF, LUMENS)[1];
const NOON = daylight(toward(0, NOON_EL));
const pageUnder = (E) => E.map((v) => v / Math.PI); // a white page's radiance under irradiance E
// An eye that has looked at the white page long enough (adaptation by stepping, not set).
function adaptedTo(E, seconds = 60) {
  let eye = createEye({ level: 100 });
  for (let t = 0; t < seconds; t += 0.05) eye = step(eye, pageUnder(E), 0.05);
  return eye;
}
const inkSeen = (E, rgb) => pageUnder(E).map((v, i) => v * cellReflectance(WHITE, absOf(rgb))[i]);
// Two candles by the page, about where candlesAt sets them (a quarter metre off).
const candlelight = () => {
  const I = flameLight(candleState(NEW_CANDLE, 0));
  return I.map((v) => (2 * v) / 0.25 ** 2);
};

test('the axis and black bodies: 16 visible bins and a heat bin; Planck integrated, nothing assigned', () => {
  assert.equal(N, 17);
  assert.equal(LAMBDA[0], 400);
  assert.equal(LAMBDA[BINS - 1], 700);
  const sun = blackbody(5800);
  const sigma = 5.670374419e-8;
  const visible = sun.slice(0, BINS).reduce((t, v) => t + v, 0);
  // the visible bins plus the heat bin plus the ultraviolet below 390 nm make all of σT⁴/π
  const uv = planckTail(10, 5800) - planckTail(390, 5800);
  assert.ok(Math.abs(visible + sun[HEAT] + uv - (sigma * 5800 ** 4) / Math.PI) / ((sigma * 5800 ** 4) / Math.PI) < 1e-3);
  assert.ok(Math.abs(sun[8] / 20 - planck(560, 5800)) / planck(560, 5800) < 1e-2, 'a bin holds its 20 nm');
  const candle = blackbody(1850);
  assert.ok(candle[HEAT] > 30 * candle.slice(0, BINS).reduce((t, v) => t + v, 0), 'a candle is mostly heat');
});

test('daylight match: each palette colour at noon, after adaptation, within ΔE ≤ 2 of its swatch', () => {
  const eye = adaptedTo(NOON);
  assert.ok(adaptationOf(eye) > 0.95, 'noon: almost fully adapted');
  for (const c of SIGNATURE_COLORS) {
    const rgb = swatch(c.light);
    const shown = toScreen(inkSeen(NOON, rgb), eye);
    const e = deltaE(srgbToLab(shown), srgbToLab(rgb.map((v) => v / 255)));
    assert.ok(e <= 2, `${c.name}: ΔE ${e.toFixed(2)}`);
  }
  // the papers too: the picker's colour mapped to a curve
  for (const [id, p] of Object.entries(PAPERS)) {
    const rgb = swatch(p.color);
    const shown = toScreen(pageUnder(NOON).map((v, i) => v * paperCurve(rgb)[i]), eye);
    const e = deltaE(srgbToLab(shown), srgbToLab(rgb.map((v) => v / 255)));
    assert.ok(e <= 2, `${id} paper: ΔE ${e.toFixed(2)}`);
  }
  // the table's reference daylight is this same noon
  for (let i = 0; i < N; i++) assert.ok(Math.abs(DAYLIGHT[i] - NOON[i]) / NOON[i] < 1e-4);
});

test('candlelight: blue ink far darker than red ink; both match their swatches in daylight', () => {
  const blue = swatch(SIGNATURE_COLORS.find((c) => c.id === 'ink').light);
  const red = swatch(SIGNATURE_COLORS.find((c) => c.id === 'wax').light);
  const C = candlelight();
  const ratioCandle = lumOf(inkSeen(C, blue)) / lumOf(inkSeen(C, red));
  const ratioDay = lumOf(inkSeen(NOON, blue)) / lumOf(inkSeen(NOON, red));
  assert.ok(ratioCandle < 0.45, `blue / red by candlelight: ${ratioCandle.toFixed(2)}`);
  assert.ok(ratioCandle < 0.6 * ratioDay, `by day ${ratioDay.toFixed(2)}, by candle ${ratioCandle.toFixed(2)}`);
  // and on the screen, through an eye settled on candlelight
  const eye = adaptedTo(C);
  const y = (rgb) => toScreen(inkSeen(C, rgb), eye).reduce((t, v, i) => t + decode(v) * [0.2126, 0.7152, 0.0722][i], 0); // the screen's own luminance
  assert.ok(y(blue) < 0.5 * y(red), 'seen: the blue goes dark');
  const day = adaptedTo(NOON);
  for (const rgb of [blue, red]) assert.ok(deltaE(srgbToLab(toScreen(inkSeen(NOON, rgb), day)), srgbToLab(rgb.map((v) => v / 255))) <= 2);
});

test('the air: noon sky blue, low sun gold to red, night zero sun. Computed, not assigned', () => {
  const rgb = (s) => xyzToLinear(xyzOf(s, CMF));
  const sunNoon = rgb(sunLight(NOON_EL));
  const zenith = rgb(sky([0, 0, 1], toward(0, NOON_EL)));
  assert.ok(zenith[2] > 1.5 * zenith[0] && zenith[2] > zenith[1], 'the noon sky is blue');
  const chroma = (v) => (Math.max(...v) - Math.min(...v)) / Math.max(...v);
  assert.ok(chroma(sunNoon) < chroma(rgb(sunLight(10))), 'whiter at noon than low');
  const gold = rgb(sunLight(10)), red = rgb(sunLight(1));
  assert.ok(gold[0] > gold[1] && gold[1] > gold[2], 'low: gold');
  assert.ok(red[0] > 3 * red[2] && red[0] / red[1] > gold[0] / gold[1], 'at the horizon: red');
  const horizon = rgb(sky(toward(180, 1), toward(0, NOON_EL)));
  assert.ok(chroma(horizon) < chroma(zenith), 'pale at the horizon');
  for (const el of [-7, -20, -60]) {
    assert.ok(sunLight(el).every((v) => v === 0), 'night: no sun');
    assert.ok(sky([0, 0, 1], toward(0, el)).every((v) => v === 0), 'night: no sky, nothing painted');
  }
  // computed: the sun through the air is the grant times the air's own loss
  const el = 25;
  sunLight(el).forEach((v, i) => assert.ok(Math.abs(v - GRANT[i] * Math.exp(-BETA[i] * airPath(el))) <= 1e-12 * GRANT[i]));
  assert.ok(BETA[0] > 4 * BETA[BINS - 1], 'short waves scatter far more');
  // the sun's disk outside the window dazzles: far brighter than the sky beside it
  const out = outsideAt(toward(0, 40));
  assert.ok(lumOf(out(toward(0, 40))) > 1e5 * lumOf(out(toward(0, 50))));
  assert.ok(lumOf(out([0, 0.7, -0.7])) > 0 && out([0, 0.7, -0.7])[7] > out([0, 0.7, -0.7])[0], 'the field is green-lit ground');
  // placed by the clock
  const at = (h) => sunPlace(new Date(2026, 9, 23, h, 0, 0));
  assert.ok(at(12).el === NOON_EL && at(8).az < 0 && at(17).az > 0 && at(23).el < 0);
});

test('candles: lit at night while a being is present, out when they leave', () => {
  assert.equal(candleLit({ sunEl: -20, present: true }), true);
  assert.equal(candleLit({ sunEl: -20, present: false }), false, 'out when they leave');
  assert.equal(candleLit({ sunEl: 30, present: true }), false, 'none by day');
});

// A law candle (law/candle.js) lit for `steps` seconds, as the room's chain would have it burn.
function burnt(steps, cd = C.newCandle()) {
  for (let k = 0; k < steps; k++) C.stepCandle(cd, { lit: true });
  return cd;
}
const drawn = (cd, lit = true) => ({ lit, height: C.heightOf(cd), ...C.flameOf(cd), spent: C.spent(cd) });

test("candles: what is drawn is the law's candle: its height, its flame as fed as the law burns it; the flicker never moves the wax", () => {
  const fresh = C.newCandle();
  assert.equal(candleState(drawn(fresh)).height, C.heightOf(fresh));
  const cd = burnt(1800); // half an hour lit
  const st = candleState(drawn(cd), 0);
  assert.equal(st.height, C.heightOf(cd), "the height is the law's, nothing of its own");
  assert.ok(st.height < C.heightOf(fresh), 'lit, it has burnt down');
  assert.ok(st.flameAt < candleState(drawn(fresh), 0).flameAt + 0.01, 'the flame sits where the wax is');
  for (const t of [0, 1.7, 99.2]) assert.equal(candleState(drawn(cd), t).height, st.height, 'the flicker never moves the wax');
  // out, it gives nothing; just lit, before its pool melts, its wick starves and its flame is small
  assert.equal(candleState(drawn(cd, false), 0).intensity, 0);
  const starved = { ...drawn(cd), fed: 0.2 };
  assert.ok(candleState(starved, 5).flameSize < candleState(drawn(cd), 5).flameSize, 'a starved flame is smaller');
  assert.equal(candleState({ ...drawn(cd), spent: true }, 0).intensity, 0, 'spent: nothing');
});

test('candles: the smoke it gives is the wax the law burnt; a long wick shivers more; two candles not in step', () => {
  const cd = C.newCandle();
  let smoke = 0; // g, a second at a time
  for (let k = 0; k < 600; k++) {
    C.stepCandle(cd, { lit: true });
    smoke += candleState(drawn(cd), k).smokeRate;
  }
  assert.ok(Math.abs(smoke * 1e6 - cd.burnt) <= 1, `smoke ${(smoke * 1e6).toFixed(0)} µg, burnt ${cd.burnt} µg`);
  assert.equal(candleState(drawn(cd, false), 0).smokeRate, 0, 'out: no smoke');
  const fed = candleState(drawn(cd), 0);
  assert.ok(fed.heatRate > 50 && fed.heatRate < 150, `a candle gives off about 80 W (${fed.heatRate.toFixed(0)})`);
  // the flicker comes from the wick, which grows and trims through its cycles as the candle burns
  const at = (s) => ({ ...drawn(cd), burntS: s, fed: 1 });
  const spread = (s) => {
    const sizes = Array.from({ length: 200 }, (_, k) => candleState(at(s), 1000 + k * 0.05).flameSize);
    return Math.max(...sizes) - Math.min(...sizes);
  };
  const states = Array.from({ length: 60 }, (_, k) => candleState(at(k * 60)));
  const longest = states.reduce((a, x, k) => (x.wick > states[a].wick ? k : a), 0);
  const shortest = states.reduce((a, x, k) => (x.wick < states[a].wick ? k : a), 0);
  assert.ok(spread(longest * 60) > 2 * spread(shortest * 60), 'a long wick is restless');
  assert.deepEqual(candleState(at(5000), 1234.5, { which: 1 }), candleState(at(5000), 1234.5, { which: 1 }));
  assert.notEqual(candleState(at(5000), 1234.5, { which: 0 }).flameSize, candleState(at(5000), 1234.5, { which: 1 }).flameSize, 'two candles, not in step');
});

test('eye: after a step from dark to bright, exposure overshoots then settles within about a second', () => {
  const dark = pageUnder(candlelight()).map((v) => v * 0.01);
  const bright = pageUnder(NOON);
  let eye = settledOn(dark);
  const L = lumOf(bright);
  const level = (e) => (exposureOf(e) * L) / brightness(L); // where the bright page lands, 1 when settled
  const seen = [];
  for (let t = 0; t <= 3; t += 0.01) {
    seen.push([t, level(eye)]);
    eye = step(eye, bright, 0.01);
  }
  assert.ok(seen.find(([t]) => t >= 0.1)[1] > 3, 'a flare');
  assert.ok(seen.filter(([t]) => t >= 1.05).every(([, v]) => Math.abs(v - 1) < 0.05), 'settled within about a second');
  assert.ok(seen.every(([, v], k) => k === 0 || v <= seen[k - 1][1] + 1e-9), 'settling, never under');
  assert.ok(toScreen(bright, settledOn(dark)).every((v) => v > 0.99), 'the first moment is blown white');
  // the other way the pupil takes its time: several seconds to open
  let back = settledOn(bright);
  for (let t = 0; t < 1; t += 0.01) back = step(back, dark, 0.01);
  assert.ok(back.pupil < settledOn(dark).pupil - 1, 'after a second in the dark the pupil is still small');
});

test('eye: candlelight adaptation stays partial; noon reads white', () => {
  const candle = adaptedTo(candlelight());
  const noon = adaptedTo(NOON);
  assert.ok(adaptationOf(candle) < 0.6, `candlelight: ${adaptationOf(candle).toFixed(2)}`);
  const page = toScreen(pageUnder(candlelight()), candle);
  assert.ok(page[0] > 1.3 * page[2], 'the candlelit page stays warm');
  const white = toScreen(pageUnder(NOON), noon);
  assert.ok(Math.max(...white) - Math.min(...white) < 0.02 && white[1] > 0.95, 'the noon page reads white');
  // looking away and back: the warm page slowly tunes in
  let eye = adaptedTo(NOON);
  const warmth = () => {
    const p = toScreen(pageUnder(candlelight()), eye);
    return p[0] / p[2];
  };
  eye = step(eye, pageUnder(candlelight()), 0.5);
  const early = warmth();
  for (let t = 0; t < 20; t += 0.1) eye = step(eye, pageUnder(candlelight()), 0.1);
  assert.ok(warmth() < early, 'it tunes in');
});

test('eye: lids and colour are inputs: closed is dark, luminance only is grey, and the per-band weights agree', () => {
  const eye = adaptedTo(NOON);
  const look = inkSeen(NOON, swatch(SIGNATURE_COLORS[2].light));
  assert.deepEqual(toScreen(look, eye, { lids: 0 }), [0, 0, 0]);
  const grey = toScreen(look, eye, { color: 0 });
  assert.ok(Math.abs(grey[0] - grey[1]) < 1e-9 && Math.abs(grey[1] - grey[2]) < 1e-9, 'black and white');
  // the lids come down over the eye's own steps, and opening onto a bright room flares
  let e = eye;
  for (let t = 0; t < 0.2; t += 0.01) e = step(e, pageUnder(NOON), 0.01, { lids: 0 });
  assert.equal(e.lids, 0);
  for (let t = 0; t < 20; t += 0.1) e = step(e, pageUnder(NOON), 0.1, { lids: 0, color: 0 });
  assert.ok(e.color < 0.01 && e.pupil > eye.pupil + 2, 'behind closed lids the eye goes dark-adapted');
  for (let t = 0; t < 0.35; t += 0.01) e = step(e, pageUnder(NOON), 0.01, { lids: 1, color: 1 });
  assert.equal(e.lids, 1);
  assert.ok(toScreen(pageUnder(NOON), e).every((v) => v > 0.99), 'opening: the flare');
  // the shader's weights give what toScreen gives
  const w = screenWeights(eye);
  const lin = [0, 1, 2].map((c) => look.reduce((t, v, b) => t + v * w[c * N + b], 0));
  toScreen(look, eye).forEach((v, c) => assert.ok(Math.abs(v - encode(tone(lin[c]))) < 1e-6));
});

test('fading: blue and red inks at equal exposure fade by different amounts, matching their absorption', () => {
  const blue = absOf(swatch(SIGNATURE_COLORS.find((c) => c.id === 'ink').light));
  const red = absOf(swatch(SIGNATURE_COLORS.find((c) => c.id === 'wax').light));
  const drinks = (abs) => {
    const A = inkAbsorbance(abs);
    return DAYLIGHT.slice(0, BINS).reduce((t, d, i) => t + d * (1 - Math.exp(-A[i])), 0);
  };
  const loss = (abs, views, depth = 0) => {
    const { abs: after } = fadedInk(abs.map(Math.round), 0, views, depth);
    return 1 - after.reduce((t, v) => t + v, 0) / abs.map(Math.round).reduce((t, v) => t + v, 0);
  };
  const views = 400;
  assert.notEqual(loss(blue, views), loss(red, views));
  assert.equal(drinks(red) > drinks(blue), loss(red, views) > loss(blue, views), 'the one that drinks more fades more');
  assert.ok(Math.abs(loss(red, views) - loss(blue, views)) > 0.01);
  assert.ok(loss(red, views, 0) > loss(red, views, 16), 'surface ink before sunk ink');
  assert.deepEqual(fadeByLight(0, 0), [256, 256, 256, 256], 'unseen: nothing fades');
  assert.deepEqual(fadeByLight(views, 3), fadeByLight(views, 3), 'a pure function');
  // each channel by its own curve: the channel whose curve drinks more of daylight goes sooner
  const unit = INK.map((B) => DAYLIGHT.slice(0, BINS).reduce((t, d, i) => t + d * (1 - Math.exp(-B[i])), 0));
  const f = fadeByLight(views, 0);
  for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) if (unit[a] !== unit[b]) assert.equal(unit[a] > unit[b], f[a] <= f[b]);
});

test('record untouched: facts and digests identical under any light, time, candle state, room, eye state or bin count', () => {
  const cap = createCapture({ now: () => 0 });
  const ev = (timeStamp) => ({ timeStamp, pressure: 0.5, pointerType: 'mouse' });
  const pts = Array.from({ length: 60 }, (_, i) => ({ x: 200 + i * 2.7 + 0.031, y: 300 + 20 * Math.sin(i / 7) + 0.017, t: 1000 + i * 9 }));
  cap.down(pts[0], ev(pts[0].t));
  pts.slice(1, -1).forEach((p) => cap.move(p, ev(p.t)));
  cap.up(pts.at(-1), ev(pts.at(-1).t));
  const pen = { nib: 0, size: 40, flex: 0, flow: 7, rgb: [43, 81, 163], angle: 0, spatter: 1 };
  const acts = strokesToActs(cap.strokes, pen);
  const seed = new Uint8Array(64).map((_, i) => (i * 29 + 3) & 255);
  const family = { grain: 8, weight: 8, tooth: 0 };
  const a = settle(acts, seed, family);
  const cellsBefore = JSON.stringify(a.cells);
  const digest = () => b64url(factsDigest({ cells: a.cells, box: a.box, actsBytes: acts, family }));
  const d0 = digest();
  // everything the light can do, over the very cells
  const inked = a.cells.filter((c) => c[2] || c[3] || c[4]).slice(0, 400);
  for (const h of [0, 5, 7, 12, 17, 19, 23]) {
    const sunDir = toward(sunPlace(new Date(2026, 9, 23, h)).az, sunPlace(new Date(2026, 9, 23, h)).el);
    const E = daylight(sunDir);
    let eye = createEye();
    for (const c of inked) {
      const R = cellReflectance(WHITE, [c[2], c[3], c[4]]);
      eye = step(eye, pageUnder(E).map((v, i) => v * R[i]), 0.1, { lids: h % 2, color: h % 3 ? 1 : 0 });
      toScreen(pageUnder(E), eye);
      fadedInk([c[2], c[3], c[4]], c[5], 1000 * h, c[7]);
    }
    candleState(NEW_CANDLE, h, { lit: h > 18 });
  }
  // a room of any size and any bin count through the general solver
  for (const bins of [N, 8, 3]) {
    const n = 5;
    const F = Float32Array.from({ length: n * n }, (_, k) => (k % (n + 1) === 0 ? 0 : 0.2));
    solve({ n }, F, new Float64Array(n * bins).fill(0.3), new Float64Array(n * bins).fill(1));
  }
  assert.equal(JSON.stringify(a.cells), cellsBefore, 'the cells as they were');
  assert.equal(digest(), d0);
  assert.equal(b64url(a.facts), d0);
});
