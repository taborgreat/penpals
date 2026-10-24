// Fixtures for law v2: writing that exercises dents, depth, the water brush,
// oak gall, soak, tears and cockling. Built like the v1 fixtures (fixtures.js),
// as records of acts, so they go through the PNKA codec like real writing.
import { encodeActs, decodeActs } from '../v2/acts.js';
import { samplePath, record, PENS } from './fixtures.js';
import { OAK_GALL, WATER } from '../v2/constants.js';

const line = (x0, y0, x1, y1) => (u) => [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
const const_ = (v) => () => v;
const zigzag = (x0, y0, w, h, n) => (u) => {
  const k = u * n;
  const i = Math.floor(k);
  const f = k - i;
  return [x0 + (i % 2 === 0 ? f : 1 - f) * w, y0 + h * u];
};
const back = (x0, y0, x1, y1, passes) => (u) => {
  const k = u * passes;
  const f = k - Math.floor(k);
  const there = Math.floor(k) % 2 === 0 ? f : 1 - f;
  return [x0 + (x1 - x0) * there, y0 + (y1 - y0) * there];
};
const pressed = (p) => () => p;

// A path given as moves: [{ to: [x, y], ms, p0, p1 }] from `from`, sampled at
// 120 Hz, the pressure going from p0 to p1 over each move (a still move holds
// the pen in place: the tines open as the pressure builds).
function moves(from, list) {
  const xs = [from[0]],
    ys = [from[1]],
    ts = [0],
    ps = [list[0].p0 / 255]; // record() takes pressure 0..1
  let [x, y] = from;
  let t = 0;
  for (const m of list) {
    const n = Math.max(1, Math.round((m.ms * 120) / 1000));
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      xs.push(x + (m.to[0] - x) * u);
      ys.push(y + (m.to[1] - y) * u);
      t += m.ms / n;
      ts.push(t);
      ps.push((m.p0 + (m.p1 - m.p0) * u) / 255);
    }
    [x, y] = m.to;
  }
  return { xs, ys, ts, ps };
}
// Copperplate: the slant is 55°, so a downstroke runs down and to the left along
// it, and the tines spread across it (the pen's angle: 35°, the spread's direction).
const SLANT = (55 * Math.PI) / 180;
const DOWN = [-Math.cos(SLANT), Math.sin(SLANT)];
const UP = [Math.cos((40 * Math.PI) / 180), -Math.sin((40 * Math.PI) / 180)];
const at = (o, d, l) => [o[0] + d[0] * l, o[1] + d[1] * l];

export const GALL = { nib: 0, size: 40, flex: 0, flow: 9, rgb: [...OAK_GALL], angle: 0 };
export const GALL_FINE = { ...GALL, size: 12, flow: 6 };
export const BLUE = { ...PENS.heavy, rgb: [30, 50, 190] };
export const WATER_BRUSH = { nib: 2, size: 200, flex: 0, flow: 13, rgb: [...WATER], angle: 30 };
export const COPPERPLATE = { nib: 1, size: 12, flex: 120, flow: 9, rgb: [26, 32, 58], angle: 35 };
export const SPLASHY = { nib: 1, size: 12, flex: 120, flow: 11, rgb: [30, 40, 120], angle: 0, spatter: 10 };
export const WATER_ROUND = { nib: 0, size: 60, flex: 0, flow: 13, rgb: [...WATER], angle: 0 };

export const FIXTURES_V2 = {
  // oak gall: a line
  gallLine: () => record([{ path: samplePath(line(0, 0, 200, 30), const_(160)), start: 0, pen: GALL }]),
  // a gall hairline and a gall pool (a long dwell) on one sheet
  gallHairPool: () =>
    record([
      { path: samplePath(line(0, 0, 260, 0), const_(900)), start: 0, pen: GALL_FINE },
      { path: samplePath(line(0, 80, 120, 80), const_(60), { hold: { at: 0.5, ms: 1600 } }), start: 600, pen: GALL },
    ]),
  // a blue line, dry, then gall across it
  gallOverBlue: () =>
    record([
      { path: samplePath(line(0, 50, 200, 50), const_(150)), start: 0, pen: BLUE },
      { path: samplePath(line(100, 0, 100, 100), const_(150)), start: 4000, pen: GALL },
    ]),
  // ink, dried, then the water brush over it
  waterOverInk: () =>
    record([
      { path: samplePath(line(0, 40, 220, 40), const_(140)), start: 0, pen: PENS.heavy },
      { path: samplePath(zigzag(60, 10, 100, 60, 6), const_(120)), start: 5000, pen: WATER_BRUSH },
    ]),
  // pressing: a hard slow stroke and, far away, a light fast one (real pressure)
  dents: () =>
    record([
      { path: samplePath(line(0, 0, 160, 0), const_(40), { pressure: pressed(1) }), start: 0, pen: PENS.medium, hasP: true },
      { path: samplePath(line(0, 120, 160, 120), const_(600), { pressure: pressed(0.25) }), start: 500, pen: PENS.medium, hasP: true },
    ]),
  // a groove pressed hard and slow with a dry nib (no ink: only the dent), then a wet line across it
  groove: () =>
    record([
      { path: samplePath(line(0, 50, 200, 50), const_(12), { pressure: pressed(1) }), start: 0, pen: { ...PENS.medium, flow: 0 }, hasP: true },
      { path: samplePath(line(100, 0, 100, 100), const_(60), { pressure: pressed(0.4) }), start: 3000, pen: PENS.heavy, hasP: true },
    ]),
  // the control: the same pressing far below the line, so the ink crosses no groove
  grooveNone: () =>
    record([
      { path: samplePath(line(0, 300, 200, 300), const_(12), { pressure: pressed(1) }), start: 0, pen: { ...PENS.medium, flow: 0 }, hasP: true },
      { path: samplePath(line(100, 0, 100, 100), const_(60), { pressure: pressed(0.4) }), start: 3000, pen: PENS.heavy, hasP: true },
    ]),
  // oak gall, dry, then the water brush over it
  waterOverGall: () =>
    record([
      { path: samplePath(line(0, 40, 220, 40), const_(140)), start: 0, pen: GALL },
      { path: samplePath(zigzag(60, 10, 100, 60, 6), const_(120)), start: 5000, pen: WATER_BRUSH },
    ]),
  // a wet spot scrubbed back and forth, hard
  scrub: () => record([{ path: samplePath(back(0, 0, 40, 0, 40), const_(260), { pressure: pressed(1) }), start: 0, pen: WATER_ROUND, hasP: true }]),
  // the same scrubbing with a dry nib: no water, so no wear
  scrubDry: () => record([{ path: samplePath(back(0, 0, 40, 0, 40), const_(260), { pressure: pressed(1) }), start: 0, pen: { ...WATER_ROUND, flow: 0 }, hasP: true }]),
  // a spot scrubbed through, then ink written across the hole
  tearThenInk: () =>
    record([
      { path: samplePath(back(0, 0, 40, 0, 40), const_(260), { pressure: pressed(1) }), start: 0, pen: WATER_ROUND, hasP: true },
      { path: samplePath(line(-40, 0, 80, 0), const_(80)), start: 30000, pen: PENS.heavy },
    ]),
  // a strip washed until the sizing is gone, dried (it cockles), then a broad wet stroke over it
  cockle: () =>
    record([
      { path: samplePath(zigzag(0, 0, 120, 40, 10), const_(150)), start: 0, pen: WATER_BRUSH },
      { path: samplePath(line(0, 20, 120, 20), const_(50)), start: 30000, pen: { ...PENS.broad, flow: 12, angle: 90 } },
    ]),
  // splatter: fast flicks with a pen that throws ink, a slow curve with the same pen, and the flicks with spatter 0
  flicks: () =>
    record([
      { path: samplePath(zigzag(0, 0, 160, 40, 10), const_(420)), start: 0, pen: SPLASHY },
      { path: samplePath(line(0, 80, 160, 70), const_(500)), start: 300, pen: SPLASHY },
    ]),
  slowCurve: () => record([{ path: samplePath((u) => [u * 160, 40 * Math.sin(u * Math.PI)], const_(30)), start: 0, pen: SPLASHY }]),
  flicksDry: () =>
    record([
      { path: samplePath(zigzag(0, 0, 160, 40, 10), const_(420)), start: 0, pen: { ...SPLASHY, spatter: 0 } },
      { path: samplePath(line(0, 80, 160, 70), const_(500)), start: 300, pen: { ...SPLASHY, spatter: 0 } },
    ]),
  // the height field: one bead, held, then left to dry; and held far longer (a capped dwell)
  bead: () => record([{ path: samplePath((u) => [u * 0.5, 0], const_(5), { hold: { at: 0, ms: 1500 } }), start: 0, pen: PENS.heavy }]),
  beadLong: () => record([{ path: samplePath((u) => [u * 0.5, 0], const_(5), { hold: { at: 0, ms: 4000 } }), start: 0, pen: PENS.heavy }]),
  // a steady S at an even speed: the turns no heavier than the straight parts
  sCurve: () =>
    record([
      { path: samplePath((u) => [u * 300, 40 * Math.sin(u * 2 * Math.PI)], const_(250)), start: 0, pen: PENS.medium },
      { path: samplePath((u) => [u * 300, 160 + 40 * Math.sin(u * 2 * Math.PI)], const_(250), { pressure: pressed(0.6) }), start: 400, pen: { ...COPPERPLATE, flow: 7 }, hasP: true },
    ]),
  // flex tips: press and hold so the tines open, pull down, stop, hold, lift: square at both ends
  flexSquare: () =>
    record([
      {
        path: moves(
          [60, 0],
          [
            { to: [60, 0], ms: 400, p0: 30, p1: 255 },
            { to: at([60, 0], DOWN, 80), ms: 700, p0: 255, p1: 255 },
            { to: at([60, 0], DOWN, 80), ms: 400, p0: 255, p1: 255 },
          ],
        ),
        start: 0,
        pen: COPPERPLATE,
        hasP: true,
      },
    ]),
  // the same downstroke without the holds: the pressure builds on the move and eases at the end
  flexPointed: () =>
    record([
      {
        path: moves(
          [60, 0],
          [
            { to: at([60, 0], DOWN, 20), ms: 175, p0: 30, p1: 255 },
            { to: at([60, 0], DOWN, 60), ms: 350, p0: 255, p1: 255 },
            { to: at([60, 0], DOWN, 80), ms: 175, p0: 255, p1: 30 },
          ],
        ),
        start: 0,
        pen: COPPERPLATE,
        hasP: true,
      },
    ]),
  // a quick touch, and a light upstroke
  flexTouch: () => record([{ path: moves([20, 20], [{ to: [20, 20], ms: 30, p0: 40, p1: 40 }]), start: 0, pen: COPPERPLATE, hasP: true }]),
  flexUp: () => record([{ path: moves([0, 60], [{ to: at([0, 60], UP, 80), ms: 400, p0: 40, p1: 40 }]), start: 0, pen: COPPERPLATE, hasP: true }]),
  // a heavy wash, dried, then ink written across it (and the same ink beside it, on fresh paper)
  washThenWrite: () =>
    record([
      { path: samplePath(zigzag(0, 0, 110, 90, 8), const_(110)), start: 0, pen: WATER_BRUSH },
      { path: samplePath(line(10, 45, 100, 45), const_(120)), start: 30000, pen: PENS.medium },
      { path: samplePath(line(10, 245, 100, 245), const_(120)), start: 200, pen: PENS.medium },
    ]),
};

export function fixtureV2Bytes(name) {
  const bytes = encodeActs(FIXTURES_V2[name]());
  return { bytes, rec: decodeActs(bytes) };
}
