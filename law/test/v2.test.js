// Law v2 (depth-water-gall): the behaviour the spec asks for, one test each.
// Positions: the fixtures place a path's smallest x and y at cell 30, two cells
// per ink unit, so a point (u, v) in the fixture lands on cell
// (30 + 2·(u − minX), 30 + 2·(v − minY)).
import test from 'node:test';
import assert from 'node:assert/strict';
import { grow, darkAt, heldE } from '../v2/sim.js';
import { settledCells, boxOf, lookRGB, factsDigest, lookDigest, gallDark, fadeByLight, sideView, heightOf } from '../v2/look.js';
import { sceneField, liveField, encodeScene, decodeScene, paperDetail, sceneWindow } from '../v2/scene.js';
import { momentsOf, bandOf } from '../v2/moments.js';
import { createLive, createPlayback } from '../v2/live.js';
import { trace } from '../v2/trace.js';
import { makeFilm, readFilm } from '../v2/film.js';
import { OX, AIR } from '../v2/tables.js';
import { OX_BASE, AGE_CAP_H, THICK, TORN, TICK_MS, DRY_EVERY, COCKLE_MIN, SOAK_FULL, FILM_Q, FILM_POOL_SHIFT } from '../v2/constants.js';
import { penTimeline } from '../v2/acts.js';
import { splatOdds } from '../v2/splat.js';
import { testPaperKey } from '../tools/fixtures.js';
import { fixtureV2Bytes } from '../tools/fixtures-v2.js';

const family = { grain: 8, weight: 8, tooth: 0 };
const paperKey = testPaperKey('golden');

const cache = new Map();
function grown(name, { strokes = Infinity, gallAgeH = 0 } = {}) {
  const key = `${name}|${strokes}|${gallAgeH}`;
  if (!cache.has(key)) {
    const { bytes, rec } = fixtureV2Bytes(name);
    const r = strokes === Infinity ? rec : { ...rec, strokes: rec.strokes.slice(0, strokes) };
    const res = grow(r, { paperKey, family, gallAgeH });
    const cells = settledCells(res.tiles);
    cache.set(key, { bytes, rec, res, cells, box: boxOf(cells) });
  }
  return cache.get(key);
}
const ink = (c) => c[2] + c[3] + c[4];
const keyOf = (c) => `${c[1]},${c[0]}`;
const byCell = (cells) => new Map(cells.map((c) => [keyOf(c), c]));
const within = (cells, { x0 = -Infinity, x1 = Infinity, y0 = -Infinity, y1 = Infinity }) => cells.filter((c) => c[1] >= x0 && c[1] <= x1 && c[0] >= y0 && c[0] <= y1);
const sum = (xs, f) => xs.reduce((s, c) => s + f(c), 0);
const mean = (xs, f) => (xs.length ? sum(xs, f) / xs.length : NaN);
const lum = (rgb, box, c) => {
  const k = ((c[0] - box[1]) * box[2] + (c[1] - box[0])) * 3;
  return rgb[k] + rgb[k + 1] + rgb[k + 2];
};
const quiet = { tile() {}, wet() {}, deposit() {}, fiber() {}, step() {}, strokeStart() {}, finish() {} };

// --- 1. dents ---

test('dent: a hard slow stroke leaves a deeper dent than a light fast one', () => {
  const { cells } = grown('dents'); // hard slow at v = 0 (row 30), light fast at v = 120 (row 270)
  const hard = within(cells, { y0: 18, y1: 42 });
  const light = within(cells, { y0: 258, y1: 282 });
  const maxDent = (cs) => Math.max(0, ...cs.map((c) => c[6]));
  console.log(`dents: hard max ${maxDent(hard)} sum ${sum(hard, (c) => c[6])} · light max ${maxDent(light)} sum ${sum(light, (c) => c[6])}`);
  assert.ok(maxDent(hard) >= 4, 'the hard stroke dents the paper');
  assert.ok(maxDent(hard) > 2 * maxDent(light), 'deeper');
  assert.ok(sum(hard, (c) => c[6]) > 4 * sum(light, (c) => c[6]), 'and more of it');
});

test('dent: ink laid across a groove pools in it', () => {
  // the cross stroke runs down column 230 (u = 100); the groove is row 130 (v = 50)
  const g = grown('groove');
  const n = grown('grooveNone'); // the same pressing far below, the same cross stroke
  const groove = within(g.cells, { x0: 30, x1: 200, y0: 124, y1: 136 });
  assert.ok(Math.max(...groove.map((c) => c[6])) >= 16, 'the dry nib pressed a groove');
  const region = { x0: 200, x1: 260, y0: 127, y1: 132 };
  const inG = sum(within(g.cells, region), ink);
  const inN = sum(within(n.cells, region), ink);
  const away = { x0: 200, x1: 260, y0: 60, y1: 76 };
  const awayG = sum(within(g.cells, away), ink);
  const awayN = sum(within(n.cells, away), ink);
  console.log(`groove: ink at the crossing ${inG} vs ${inN} without the groove · away from it ${awayG} vs ${awayN}`);
  assert.ok(inG > 1.15 * inN, 'more ink settles where the line crosses the groove');
  assert.ok(Math.abs(awayG - awayN) < 0.05 * awayN + 1, 'and the line elsewhere is the same');
  // on the same sheet: more fixed ink in the dented cells than beside them, along the line
  // (row by row across the line: a dent is a fact even where no ink went)
  const at = byCell(g.cells);
  const rowInk = (y) => sum(within(g.cells, { x0: 200, x1: 260, y0: y, y1: y }), ink);
  const rows = [...Array(60).keys()].map((k) => 100 + k);
  const dentedRows = rows.filter((y) => (at.get(`230,${y}`)?.[6] ?? 0) >= 8);
  const besideRows = rows.filter((y) => dentedRows.every((d) => Math.abs(d - y) >= 6 && Math.abs(d - y) <= 16));
  const perRow = (ys) => sum(ys, rowInk) / ys.length;
  console.log(`groove: ${perRow(dentedRows).toFixed(0)} ink per dented row of the line vs ${perRow(besideRows).toFixed(0)} per row beside it (${dentedRows.length}, ${besideRows.length} rows)`);
  assert.ok(dentedRows.length >= 4 && besideRows.length >= 4);
  assert.ok(perRow(dentedRows) > 1.1 * perRow(besideRows), 'the groove holds more ink than the line beside it');
});

// --- 2. ink in depth ---

test('depth: thirsty cells sink the ink deeper', () => {
  // thirst as the liquid meets it: the cell's and its neighbours' (it wicks sideways), from the paper itself
  const { res } = grown('gallOverBlue');
  const siz = new Map();
  for (const t of res.tiles) for (let i = 0; i < 256; i++) siz.set(`${t.tx * 16 + (i % 16)},${t.ty * 16 + (i >> 4)}`, t.siz[i]);
  const around = (x, y) => {
    let a = 0,
      n = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const v = siz.get(`${x + dx},${y + dy}`);
        if (v !== undefined) {
          a += v;
          n++;
        }
      }
    return a / n;
  };
  const thirsty = [],
    sized = [];
  for (const t of res.tiles) {
    for (let i = 0; i < 256; i++) {
      if (t.F[3 * i] + t.F[3 * i + 1] + t.F[3 * i + 2] + (t.FG ? t.FG[i] : 0) < 200) continue;
      const d = t.depthA[i];
      const th = around(t.tx * 16 + (i % 16), t.ty * 16 + (i >> 4));
      if (th >= 9) thirsty.push(d);
      else if (th <= 6) sized.push(d);
    }
  }
  const m = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  console.log(`depth: thirsty ${m(thirsty).toFixed(0)} (${thirsty.length} cells) · well sized ${m(sized).toFixed(0)} (${sized.length})`);
  assert.ok(thirsty.length > 20 && sized.length > 20);
  assert.ok(m(thirsty) > 1.2 * m(sized));
});

// The height field (the scene, §0; the wet front, cleanup §2): a bead stands on
// top while wet; as the front takes it in the height above falls and what is in
// the paper (and gone to the air) rises, their sum the water put down; dry, only
// a thin film stands, the ring a little higher. Never the peak.
test('height field: a bead falls as it sinks, the total kept; dry, a thin film with the ring higher at the edge', () => {
  const { rec } = fixtureV2Bytes('bead');
  const lift = Math.floor(rec.strokes[0].t.at(-1) / TICK_MS);
  const tiles = [];
  let put = 0;
  let beadTop = 0;
  const seen = [];
  const res = grow(rec, {
    paperKey,
    family,
    instrument: {
      ...quiet,
      tile(t) {
        tiles.push(t);
      },
      deposit(t, i, g) {
        put += g;
      },
      step(k) {
        if (k < lift - 20 || (k - lift) % 10) return;
        let above = 0,
          below = 0;
        for (const t of tiles) {
          for (let i = 0; i < 256; i++) {
            const held = heldE(t, i);
            above += Math.max(0, t.W[i] - held);
            below += Math.min(t.W[i], held) + t.drainA[i];
            beadTop = Math.max(beadTop, t.W[i] - held);
          }
        }
        if (k >= lift) seen.push([k, above, below]);
        assert.equal(above + below, put, `at ${k * TICK_MS} ms the bead and what sank add up to the water put down`);
      },
    },
  });
  console.log(
    `height field: after the lift ${seen
      .slice(0, 6)
      .map(([k, a, b]) => `${k * TICK_MS}ms ${a}/${b}`)
      .join(' · ')}`,
  );
  assert.ok(seen[0][1] > 1000, 'a bead stood when the pen lifted');
  for (let n = 1; n < seen.length; n++) {
    assert.ok(seen[n][1] <= seen[n - 1][1], 'the height above only falls');
    assert.ok(seen[n][2] >= seen[n - 1][2], 'the depth below only rises');
  }
  assert.equal(seen.at(-1)[1], 0, 'and the bead is gone');
  const cells = settledCells(res.tiles).filter((c) => ink(c) > 50);
  const cx = mean(cells, (c) => c[1]),
    cy = mean(cells, (c) => c[0]);
  const r = (c) => Math.hypot(c[1] - cx, c[0] - cy);
  const R = Math.max(...cells.map(r));
  const edge = cells.filter((c) => r(c) > 0.75 * R),
    middle = cells.filter((c) => r(c) < 0.5 * R);
  const filmTop = Math.max(...cells.map((c) => heightOf(c).above));
  console.log(
    `height field: dry film ${mean(edge, (c) => c[13]).toFixed(1)} at the ring vs ${mean(middle, (c) => c[13]).toFixed(1)} in the middle; at most ${filmTop} drops high where the bead stood ${beadTop}`,
  );
  assert.ok(filmTop * 4 < beadTop, 'dry, it is a film, not a dome');
  assert.ok(mean(edge, (c) => c[13]) > 1.15 * mean(middle, (c) => c[13]), 'the ring stands a little higher');
  // the side view, dry: no dome above the surface; while wet (live), the bead stands
  const row = Math.round(cy);
  // what stands on the paper's surface (wherever a dent put it): a bead, or the film (the paper itself is opaque)
  const above = (img) => {
    let n = 0;
    for (let k = 3; k < img.rgba.length; k += 4) if (img.rgba[k] > 0 && img.rgba[k] < 255) n++;
    return n;
  };
  const dry = sideView(cells, { x0: Math.round(cx - R - 4), y0: row, x1: Math.round(cx + R + 4), y1: row }, { px: 3 });
  const live = createLive({ paperKey, family });
  const s0 = rec.strokes[0];
  const pens = penTimeline(rec)[0];
  const pt = (i) => ({ x: s0.x[i] + 10 * rec.orgX, y: s0.y[i] + 10 * rec.orgY, t: s0.t[i], p: null });
  live.down(pt(0), pens[0][1], false);
  for (let i = 1; i < s0.x.length; i++) live.point(pt(i));
  live.up();
  const wet = sideView(live.cut(Math.round(cx - R - 4), row, Math.round(cx + R + 4), row), { x0: Math.round(cx - R - 4), y0: row, x1: Math.round(cx + R + 4), y1: row }, { px: 3 });
  console.log(`side view: ${above(wet)} pixels stand above the paper while wet, ${above(dry)} once dry`);
  assert.ok(above(wet) > 4 * above(dry) + 20, 'the bead stands while wet, and is gone when dry');
});

// --- the wet front (cleanup-and-speed.md §2) ---

// Grow a fixture with every cell's thirst set (0: sized, 15: thirsty), watching
// each tick: on top, in the paper, gone to the air, the water put down, the front.
function watched(name, thirst, look = () => {}) {
  const { rec } = fixtureV2Bytes(name);
  const tiles = [];
  let put = 0;
  const res = grow(rec, {
    paperKey,
    family,
    instrument: {
      ...quiet,
      tile(t) {
        t.siz = new Uint8Array(256).fill(thirst);
        tiles.push(t);
      },
      deposit(t, i, g) {
        put += g;
      },
      step(k) {
        let top = 0,
          pores = 0,
          aired = 0,
          front = 0,
          wet = 0,
          W = 0;
        for (const t of tiles) {
          for (let i = 0; i < 256; i++) {
            const held = heldE(t, i);
            top += Math.max(0, t.W[i] - held);
            pores += Math.min(t.W[i], held);
            aired += t.drainA[i];
            front += t.depthA[i];
            W += t.W[i];
            if (t.W[i] > 0) wet++;
          }
        }
        look({ k, tiles, top, pores, aired, front, wet, W, put });
      },
    },
  });
  return { res, put, cells: settledCells(res.tiles) };
}

test('wet front: a dwell stands on top first; the front takes it in while the water on top shrinks; every drop accounted for', () => {
  let first = null;
  let peakTop = 0;
  let prev = null;
  const { res } = watched('bead', 8, (w) => {
    assert.equal(w.top + w.pores + w.aired, w.put, `at ${w.k * TICK_MS} ms the water on top, in the paper and gone to the air add up to the water put down`);
    if (!first && w.W > 0) first = w;
    peakTop = Math.max(peakTop, w.top);
    if (prev) assert.ok(w.front >= prev.front, 'the front never goes back up');
    prev = w;
  });
  console.log(`wet front: first tick ${first.top} on top of ${first.W}; at most ${peakTop} on top; the front at the end ${prev.front}`);
  assert.ok(first.top >= 0.9 * first.W, 'the ink lands on top');
  assert.ok(prev.front > 0 && res.lost.W === 0, 'it sank in, and nothing was lost');
});

test('wet front: the same drop sinks sooner on thirsty paper and spreads less; on sized paper it beads and spreads first', () => {
  const run = (thirst) => {
    let starts = null,
      wetAtStart = 0,
      wetMax = 0;
    const r = watched('bead', thirst, (w) => {
      wetMax = Math.max(wetMax, w.wet);
      if (starts === null && w.front > 0) {
        starts = w.k;
        wetAtStart = w.wet;
      }
    });
    const inked = r.cells.filter((c) => ink(c) > 50).length;
    return { starts, wetAtStart, wetMax, inked };
  };
  const sized = run(1),
    thirsty = run(14);
  console.log(
    `wet front: sized paper starts at ${sized.starts * TICK_MS} ms over ${sized.wetAtStart} cells, ${sized.inked} inked · thirsty at ${thirsty.starts * TICK_MS} ms over ${thirsty.wetAtStart}, ${thirsty.inked} inked`,
  );
  assert.ok(thirsty.starts < sized.starts, 'thirsty paper lets it in sooner');
  assert.ok(sized.wetAtStart > thirsty.wetAtStart, 'on sized paper the water spreads before the front starts');
  assert.ok(thirsty.inked < sized.inked, 'and the thirsty paper keeps the drop smaller');
});

test('wet front: once a cell takes no more water, what stands on it never rises; dry, only the film stands', () => {
  const last = new Map();
  let checked = 0;
  watched('beadLong', 8, (w) => {
    for (const t of w.tiles) {
      for (let i = 0; i < 256; i++) {
        const key = t.tx * 65536 + t.ty * 256 + i;
        const top = Math.max(0, t.W[i] - heldE(t, i));
        const was = last.get(key);
        if (was && t.W[i] <= was.W) {
          assert.ok(top <= was.top, `a cell's water on top rose (${was.top} → ${top}) without water coming in`);
          checked++;
        }
        last.set(key, { W: t.W[i], top });
      }
    }
  });
  const { cells } = grown('beadLong');
  for (const c of cells) assert.equal(heightOf(c).above, c[13] * FILM_Q, 'dry, only the film stands on top');
  assert.ok(checked > 1000);
});

test('height field: the depth below varies smoothly from cell to cell', () => {
  for (const name of ['gallLine', 'dents']) {
    const m = byCell(grown(name).cells);
    // a spike: a cell standing alone, deeper (or shallower) than all four of its neighbours by more than 2 levels
    let spikes = 0,
      cells = 0;
    for (const c of grown(name).cells) {
      if (!ink(c) && !c[5]) continue;
      const nb = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].map(([dx, dy]) => m.get(`${c[1] + dx},${c[0] + dy}`)?.[7] ?? 0);
      cells++;
      if (c[7] > Math.max(...nb) + 2 || c[7] < Math.min(...nb) - 2) spikes++;
    }
    console.log(`height field: ${name}: ${spikes} spikes in ${cells} inked cells`);
    assert.ok(spikes < 0.005 * cells, `${name}: no spikes`);
  }
});

test('scene field: from the facts alone, the same as the look; it encodes and decodes exactly', () => {
  const { cells, box, rec } = grown('tearThenInk');
  const view = { ageH: 30, views: 16 };
  const f = sceneField(cells, box, view);
  const rgb = lookRGB(cells, box, view);
  for (let k = 0; k < box[2] * box[3]; k += 97) {
    const a = f.rgba[4 * k + 3];
    if (!a) continue;
    for (let ch = 0; ch < 3; ch++) assert.ok(Math.abs(255 - Math.round(((255 - f.rgba[4 * k + ch]) * a) / 255) - rgb[3 * k + ch]) <= 1, 'the scene shows the look');
  }
  assert.ok(
    f.flags.some((v) => v & 1),
    'holes where it tore',
  );
  assert.ok(f.above.some((v) => v > 0) && f.depth.some((v) => v > 0) && f.surface.some((v) => v !== 0));
  const back = decodeScene(encodeScene(f));
  for (const k of ['surface', 'above', 'depth', 'rgba', 'flags']) assert.deepEqual(back[k], f[k], k);
  assert.deepEqual(back.box, f.box);
  // no seed, no paper: the field holds only what the facts say (the paper's detail is separate, own and open only)
  const detail = paperDetail(paperKey, family, box);
  assert.equal(detail.length, box[2] * box[3]);
  const live = createLive({ paperKey, family });
  const s0 = rec.strokes[1];
  const pens = penTimeline(rec)[1];
  live.down({ x: s0.x[0] + 10 * rec.orgX, y: s0.y[0] + 10 * rec.orgY, t: 0, p: null }, pens[0][1], false);
  for (let i = 1; i < 20; i++) live.point({ x: s0.x[i] + 10 * rec.orgX, y: s0.y[i] + 10 * rec.orgY, t: s0.t[i] - s0.t[0], p: null });
  const lf = liveField(live.cut(box[0], box[1], box[0] + box[2] - 1, box[1] + box[3] - 1), box);
  assert.ok(
    lf.flags.some((v) => v & 2),
    'wet beads, live',
  );
});

test('show the moments: each cell knows when the nib put its ink down; a pause is one thick band', () => {
  const { rec, box } = grown('gallHairPool');
  const m = momentsOf(rec, { paperKey, family }, box);
  const inked = m.at.filter((v) => v >= 0);
  assert.ok(inked.length > 100);
  const bands = new Set([...inked].map((v) => Math.floor(v / 40)));
  console.log(`moments: ${inked.length} cells laid down over ${bands.size} bands`);
  assert.ok(bands.size > 10, 'the stroke reads as rings');
  assert.ok(bandOf(-1) === -1 && bandOf(0) === 0 && bandOf(40) === 1);
  // the facts are those of grow(): the moments only watched
  assert.equal(JSON.stringify(settledCells(grow(rec, { paperKey, family }).tiles)), JSON.stringify(grown('gallHairPool').cells));
});

// --- 7. flex tips (the scene, §7) and 8. the nib's supply (§8) ---

const axisOf = (name) => {
  const { rec } = fixtureV2Bytes(name);
  const s = rec.strokes[0];
  const cell = (i) => [Math.floor((20 * rec.orgX + 2 * s.x[i]) / 10), Math.floor((20 * rec.orgY + 2 * s.y[i]) / 10)];
  const A = cell(0),
    B = cell(s.x.length - 1);
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const d = [(B[0] - A[0]) / L, (B[1] - A[1]) / L];
  const pts = grown(name)
    .cells.filter((c) => ink(c) >= 300)
    .map((c) => {
      const v = [c[1] - A[0], c[0] - A[1]];
      return [v[0] * d[0] + v[1] * d[1], -v[0] * d[1] + v[1] * d[0]];
    });
  const width = (a0, a1) => {
    const across = pts.filter(([al]) => al >= a0 && al <= a1).map(([, ac]) => ac);
    return across.length ? Math.max(...across) - Math.min(...across) + 1 : 0;
  };
  return { L, width, before: Math.max(0, ...pts.map(([al]) => -al)), after: Math.max(0, ...pts.map(([al]) => al - L)) };
};

test('flex tips: hold then pull gives a square top, stop-hold-lift a square end; a quick touch is a point; upstrokes stay hairline', () => {
  const sq = axisOf('flexSquare');
  const pt = axisOf('flexPointed');
  const full = sq.width(sq.L / 3, (2 * sq.L) / 3);
  const shape = (o) => `start ${o.width(0.5, 2.5).toFixed(1)}, end ${o.width(o.L - 2.5, o.L - 0.5).toFixed(1)}, past the ends ${o.before.toFixed(1)}/${o.after.toFixed(1)}`;
  console.log(`flex tips: full width ${full.toFixed(1)} · held: ${shape(sq)} · not held: ${shape(pt)}`);
  assert.ok(sq.width(0.5, 2.5) > 0.8 * full, 'held: full width right from the top');
  assert.ok(sq.width(sq.L - 2.5, sq.L - 0.5) > 0.8 * full, 'stop, hold, lift: full width to the end');
  // a round cap would run on half the width past each end (and its pool around that)
  assert.ok(sq.before < 0.5 * (full / 2) && sq.after < 0.5 * (full / 2), 'square, not round: the ink stops close to the ends');
  assert.ok(pt.width(0.5, 2.5) < 0.35 * full && pt.width(pt.L - 2.5, pt.L - 0.5) < 0.35 * full, 'without the holds: pointed');
  const touch = axisOf('flexTouch');
  assert.ok(touch.width(-10, 10) <= 4, 'a quick touch is a point');
  const up = axisOf('flexUp');
  assert.ok(up.width(up.L / 3, (2 * up.L) / 3) < 0.25 * full, 'an upstroke stays hairline');
});

test('supply: an even S has no blots at its turns; a dwell beads to a capped size however long it is held', () => {
  const { cells } = grown('sCurve');
  const ix = byCell(cells);
  // the ink around a point of the path, over a disc wide enough for the whole line (a blot is extra ink)
  const near = (x, y) => {
    let a = 0;
    for (let dy = -18; dy <= 18; dy++) for (let dx = -18; dx <= 18; dx++) if (dx * dx + dy * dy <= 324) a += ink(ix.get(`${x + dx},${y + dy}`) ?? [0, 0, 0, 0, 0]);
    return a;
  };
  for (const [row, label] of [
    [0, 'round nib'],
    [320, 'flex, mouse'],
  ]) {
    const at = (u) => [30 + Math.round(2 * 300 * u), 30 + 80 + row + Math.round(2 * 40 * Math.sin(u * 2 * Math.PI))];
    const turns = [0.25, 0.75].map((u) => near(...at(u)));
    const straight = [0.42, 0.5, 0.58].map((u) => near(...at(u)));
    const ratio = Math.max(...turns) / (straight.reduce((a, b) => a + b, 0) / straight.length);
    console.log(`supply: ${label}: ink at the turns ${ratio.toFixed(2)}× the straight parts`);
    assert.ok(ratio < 1.3, `${label}: no blots at the turns`);
  }
  const short = grown('bead'),
    long = grown('beadLong');
  const total = (cs) => sum(cs, ink);
  console.log(`supply: a 1.5 s dwell ${total(short.cells)}, a 4 s dwell ${total(long.cells)}`);
  assert.ok(total(long.cells) < 1.05 * total(short.cells), 'a longer dwell is no bigger');
});

// --- 3. the water brush ---

test('water: over dried ink it re-wets and bleeds past the old edge; the tiles wake and sleep', () => {
  const before = grown('waterOverInk', { strokes: 1 });
  const after = grown('waterOverInk');
  const { rec } = after;
  // the water brush covers u 60..160 → columns 150..350
  const zone = { x0: 150, x1: 350 };
  const was = byCell(before.cells);
  const past = within(after.cells, zone).filter((c) => ink(c) >= 4 && !(was.get(keyOf(c)) && ink(was.get(keyOf(c))) >= 4));
  const outside = after.cells.filter((c) => (c[1] < 130 || c[1] > 370) && ink(c) !== (was.get(keyOf(c)) ? ink(was.get(keyOf(c))) : 0));

  // While the water is on it: fixed ink goes down, wet ink appears. Between the
  // strokes nothing runs; the water wakes the tiles; when it has dried they sleep.
  const waterAt = Math.floor(rec.strokes[1].t[0] / TICK_MS);
  const tiles = [];
  const steps = [];
  let fixedBefore = null,
    fixedLeast = Infinity,
    maxP = 0;
  const fixed = () => {
    let f = 0;
    for (const t of tiles) for (let i = 0; i < 768; i++) f += t.F[i];
    return f;
  };
  const res = grow(rec, {
    paperKey,
    family,
    instrument: {
      ...quiet,
      tile(t) {
        tiles.push(t);
      },
      step(k, wetTiles) {
        steps.push(k);
        if (k < waterAt || k % DRY_EVERY) return;
        fixedBefore ??= fixed();
        fixedLeast = Math.min(fixedLeast, fixed());
        for (const t of wetTiles) for (let i = 0; i < 768; i++) maxP = Math.max(maxP, t.P[i]);
      },
    },
  });
  const firstDry = steps.findIndex((k, i) => i > 0 && k !== steps[i - 1] + 1);
  const sleptFrom = steps[firstDry - 1];
  console.log(
    `water: fixed ink ${fixedBefore} → ${fixedLeast} under the water, wet pigment up to ${maxP}; ${past.length} cells inked past the old edge, ${outside.length} changed far outside; the first ink went quiet at ${sleptFrom * TICK_MS} ms, the water woke it at ${steps[firstDry] * TICK_MS} ms`,
  );
  assert.ok(fixedLeast < 0.9 * fixedBefore, 'fixed ink decreases under the water');
  assert.ok(maxP > 0, 'and turns wet again');
  assert.ok(past.length > 50, 'the ink spreads past the old edge');
  assert.equal(outside.length, 0, 'away from the water nothing changes');
  assert.ok(sleptFrom < waterAt - 50, 'the sheet slept before the water came');
  assert.ok(steps[firstDry] >= waterAt, 'and nothing ran until it did');
  assert.ok(steps.at(-1) < res.ticks, 'and it sleeps again once the water has dried');
});

test('water: darkened oak gall barely moves', () => {
  const moved = (ageH) => {
    const b = byCell(grown('waterOverGall', { strokes: 1, gallAgeH: ageH }).cells);
    const a = grown('waterOverGall', { gallAgeH: ageH }).cells;
    let m = 0;
    for (const c of a) m += Math.abs(c[5] - (b.get(keyOf(c))?.[5] ?? 0));
    for (const [k, c] of b) if (!a.some((x) => keyOf(x) === k)) m += c[5];
    return m;
  };
  const fresh = moved(0),
    old = moved(AGE_CAP_H);
  console.log(`gall under water: moved ${fresh} fresh, ${old} after ${AGE_CAP_H} h`);
  assert.ok(fresh > 1000, 'fresh gall is carried off like any ink');
  assert.ok(old < fresh / 5, 'darkened gall barely moves');
});

// --- 4. oak gall ---

test('oak gall over blue: only where gall reached darkens; the blue is unchanged', () => {
  const { cells, box } = grown('gallOverBlue');
  const fresh = lookRGB(cells, box, { ageH: 0 });
  const aged = lookRGB(cells, box, { ageH: AGE_CAP_H });
  let changed = 0,
    wrong = 0,
    lighter = 0,
    blue = 0;
  for (const c of cells) {
    const k = ((c[0] - box[1]) * box[2] + (c[1] - box[0])) * 3;
    if (k < 0 || k >= fresh.length) continue;
    const diff = fresh[k] !== aged[k] || fresh[k + 1] !== aged[k + 1] || fresh[k + 2] !== aged[k + 2];
    if (c[5] === 0 && ink(c) > 0) blue++;
    if (!diff) continue;
    changed++;
    if (c[5] === 0) wrong++;
    if (aged[k] > fresh[k] || aged[k + 1] > fresh[k + 1] || aged[k + 2] > fresh[k + 2]) lighter++;
  }
  console.log(`gall over blue: ${changed} pixels darkened, ${blue} blue-only cells`);
  assert.ok(blue > 200 && changed > 200);
  assert.equal(wrong, 0, 'no pixel without gall changes');
  assert.equal(lighter, 0, 'age only darkens');
});

test('uneven darkening: at a day the hairline is further along than the pool; at the cap the pool is darkest', () => {
  const { cells, box } = grown('gallHairPool');
  const hair = within(cells, { y0: 26, y1: 34 }).filter((c) => c[5] > 100);
  const pool = cells.filter((c) => c[5] > 0 && c[8] >= 60);
  assert.ok(hair.length > 50 && pool.length > 5);
  const day = { hair: mean(hair, (c) => gallDark(c, 24)), pool: mean(pool, (c) => gallDark(c, 24)) };
  const cap = { hair: mean(hair, (c) => gallDark(c, AGE_CAP_H)), pool: mean(pool, (c) => gallDark(c, AGE_CAP_H)) };
  const L = lookRGB(cells, box, { ageH: AGE_CAP_H });
  const shade = { hair: mean(hair, (c) => lum(L, box, c)), pool: mean(pool, (c) => lum(L, box, c)) };
  console.log(
    `darkness at 1 day: hairline ${day.hair.toFixed(0)}/256, pool ${day.pool.toFixed(0)} · at ${AGE_CAP_H} h: ${cap.hair.toFixed(0)}, ${cap.pool.toFixed(0)} · shown ${shade.hair.toFixed(0)} vs ${shade.pool.toFixed(0)}`,
  );
  assert.ok(day.hair > 1.3 * day.pool, 'air reaches the hairline first');
  assert.ok(cap.pool > 0.85 * 256, 'the pool gets there in the end');
  assert.ok(shade.pool < shade.hair, 'and ends darkest');
});

test('lazy darkening: the look at 0, 1, 7, 30 days follows the table; 400 days is the cap; the facts never change', () => {
  const { cells, box, bytes } = grown('gallHairPool');
  const facts = factsDigest({ cells, box, actsBytes: bytes, family });
  const copy = JSON.stringify(cells);
  const looks = new Set();
  for (const days of [0, 1, 7, 30]) {
    for (const c of cells.filter((x) => x[5] > 0).slice(0, 400)) {
      const air = AIR[Math.min(THICK, c[7]) * 16 + Math.min(15, c[13] >> FILM_POOL_SHIFT)];
      assert.equal(gallDark(c, days * 24), OX[Math.min(OX.length - 1, Math.floor((days * 24 * OX_BASE * air) / 65536))]);
    }
    looks.add(Buffer.from(lookDigest(lookRGB(cells, box, { ageH: days * 24 }), box)).toString('hex'));
  }
  assert.equal(looks.size, 4, 'each age looks different');
  assert.deepEqual(lookRGB(cells, box, { ageH: 400 * 24 }), lookRGB(cells, box, { ageH: AGE_CAP_H }));
  assert.equal(JSON.stringify(cells), copy, 'looking changes no fact');
  assert.deepEqual(factsDigest({ cells, box, actsBytes: bytes, family }), facts);
  assert.equal(darkAt(0, 0, 0), 0, 'and inside a record (minutes old) the gall has not darkened');
});

// --- 5. fading ---

test('fading: no exposure is the fresh look; much exposure fades surface ink more than sunk ink; facts unchanged', () => {
  const { cells, box, bytes } = grown('dents');
  const facts = factsDigest({ cells, box, actsBytes: bytes, family });
  const fresh = lookRGB(cells, box);
  assert.deepEqual(lookRGB(cells, box, { views: 0 }), fresh);
  assert.deepEqual(lookRGB(cells, box, { views: 7 }), fresh, 'views count in buckets of 8');
  const inked = cells.filter((c) => ink(c) > 0);
  const surface = inked.filter((c) => c[7] <= 2);
  const sunk = inked.filter((c) => c[7] >= 12);
  const s = mean(surface, (c) => fadeByLight(4000, c[7])[0]),
    d = mean(sunk, (c) => fadeByLight(4000, c[7])[0]);
  console.log(`fading at 4000 views: surface ink keeps ${s.toFixed(0)}/256 (${surface.length} cells), sunk ink ${d.toFixed(0)} (${sunk.length})`);
  assert.ok(surface.length > 20 && sunk.length > 20);
  assert.ok(s < d - 20, 'light takes the surface first');
  // and each channel by what it drinks (light-waves §8): the red channel's curve drinks more daylight than the blue's
  const [r, , b, gall] = fadeByLight(4000, 0);
  assert.ok(r < b && gall < r, `channels fade by what they absorb: ${fadeByLight(4000, 0)}`);
  assert.deepEqual(fadeByLight(0, 0), [256, 256, 256, 256], 'unseen: nothing fades');
  const faded = lookRGB(cells, box, { views: 4000 });
  assert.ok(sum([...faded], (v) => v) > sum([...fresh], (v) => v), 'faded is lighter');
  assert.deepEqual(factsDigest({ cells, box, actsBytes: bytes, family }), facts);
});

// --- 6. paper remembers water ---

test('soak: ink over a washed and dried area spreads wider', () => {
  const { cells } = grown('washThenWrite');
  // ink at v = 45 over the wash (row 120); the same at v = 245 on fresh paper (row 520); u 10..100 → columns 50..230
  const washed = within(cells, { x0: 60, x1: 220, y0: 90, y1: 150 });
  const fresh = within(cells, { x0: 60, x1: 220, y0: 490, y1: 550 });
  const wide = (cs) => cs.filter((c) => ink(c) >= 4).length;
  console.log(`soak: inked cells over the wash ${wide(washed)} vs fresh ${wide(fresh)} · soak there ${Math.max(...washed.map((c) => c[9]))} vs ${Math.max(0, ...fresh.map((c) => c[9]))}`);
  assert.ok(Math.max(...washed.map((c) => c[9])) >= SOAK_FULL, 'the wash washed the sizing out');
  assert.ok(wide(washed) > 1.08 * wide(fresh));
});

test('soak never decreases', () => {
  for (const name of ['waterOverInk', 'scrub']) {
    const { rec } = fixtureV2Bytes(name);
    const seen = new Map();
    let checks = 0;
    grow(rec, {
      paperKey,
      family,
      instrument: {
        ...quiet,
        step(k, wetTiles) {
          for (const t of wetTiles) {
            const prev = seen.get(t);
            if (prev) for (let i = 0; i < 256; i++) if (t.soakA[i] < prev[i]) assert.fail(`${name}: soak went down at tick ${k}`);
            seen.set(t, t.soakA.slice());
            checks++;
          }
        },
      },
    });
    assert.ok(checks > 100);
  }
});

test('tear: scrubbing a wet spot tears it; the same strokes dry do not; a torn cell holds nothing and ink pools at its rim', () => {
  const wet = grown('scrub').cells;
  const dry = grown('scrubDry').cells;
  const torn = (cs) => cs.filter((c) => c[11] & TORN);
  console.log(`tear: ${torn(wet).length} cells torn wet, ${torn(dry).length} dry (dry dent ${Math.max(...dry.map((c) => c[6]))}, wear ${Math.max(0, ...dry.map((c) => c[10]))})`);
  assert.ok(torn(wet).length > 20);
  assert.equal(torn(dry).length, 0);
  assert.equal(Math.max(0, ...dry.map((c) => c[10])), 0, 'a dry nib does not wear the paper');

  const { cells, res } = grown('tearThenInk');
  const holes = torn(cells);
  assert.ok(holes.length > 20);
  for (const c of holes) assert.equal(ink(c) + c[5], 0, 'a torn cell holds no ink');
  assert.ok(res.lost.W > 0, 'what the tear took is accounted');
  const m = byCell(cells);
  const isRim = (c) => !(c[11] & TORN) && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => (m.get(`${c[1] + dx},${c[0] + dy}`)?.[11] ?? 0) & TORN));
  // the ink line runs along row 30 through the hole; compare rim cells with soaked, untorn cells further off
  const line = within(cells, { y0: 14, y1: 46 }).filter((c) => !(c[11] & TORN) && c[9] > 0);
  const rim = line.filter(isRim);
  const off = line.filter((c) => !isRim(c));
  const near = (c) => holes.some((h) => Math.abs(h[1] - c[1]) <= 6 && Math.abs(h[0] - c[0]) <= 6);
  const offNear = off.filter(near);
  console.log(`tear: ink at the rim ${mean(rim, ink).toFixed(0)} per cell (${rim.length}) vs nearby ${mean(offNear, ink).toFixed(0)} (${offNear.length})`);
  assert.ok(rim.length > 10 && offNear.length > 10);
  assert.ok(mean(rim, ink) > 1.2 * mean(offNear, ink), 'ink pools at the torn rim');
});

test('cockle: a soaked region dries in ridges, and later wet ink runs into the valleys', () => {
  // The ridges as they stood when the ink came (its own water soaks and buckles the cells it wets again).
  const washed = grown('cockle', { strokes: 1 }).cells;
  const full = washed.filter((c) => c[9] >= SOAK_FULL);
  const values = full.map((c) => c[12]);
  const mu = values.reduce((s, v) => s + v, 0) / values.length;
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mu) ** 2, 0) / values.length);
  console.log(`cockle: ${full.length} fully soaked cells, ridge height mean ${mu.toFixed(1)} sd ${sd.toFixed(1)} max ${Math.max(...values)}`);
  assert.ok(full.length > 1000 && sd > 20, 'ridges and valleys, not a flat lift');
  assert.equal(washed.filter((c) => c[9] < COCKLE_MIN && c[12] > 0).length, 0, 'paper barely wetted dries flat');

  // The broad stroke over it, on paper washed out everywhere it goes (the same
  // thirst and wicking), so only the ridge height differs: where does it stand?
  const { rec } = fixtureV2Bytes('cockle');
  const ridges = byCell(washed);
  const endK = Math.floor(rec.strokes[1].t.at(-1) / TICK_MS);
  const tiles = [];
  const water = new Map();
  const cells = settledCells(
    grow(rec, {
      paperKey,
      family,
      instrument: {
        ...quiet,
        tile(t) {
          tiles.push(t);
        },
        step(k) {
          if (k !== endK) return;
          for (const t of tiles) for (let i = 0; i < 256; i++) if (t.W[i] > 0) water.set(`${t.tx * 16 + (i % 16)},${t.ty * 16 + (i >> 4)}`, t.W[i]);
        },
      },
    }).tiles,
  );
  const under = cells.filter((c) => ink(c) >= 4 && (ridges.get(keyOf(c))?.[9] ?? 0) >= SOAK_FULL);
  under.sort((a, b) => ridges.get(keyOf(a))[12] - ridges.get(keyOf(b))[12]);
  const valleys = under.slice(0, under.length >> 1),
    tops = under.slice(under.length >> 1);
  const standing = (cs) => mean(cs, (c) => water.get(keyOf(c)) ?? 0);
  console.log(
    `cockle: water standing as the stroke ends ${standing(valleys).toFixed(0)} in the valleys vs ${standing(tops).toFixed(0)} on the ridges; settled ink ${mean(valleys, ink).toFixed(0)} vs ${mean(tops, ink).toFixed(0)} (${under.length} cells)`,
  );
  assert.ok(under.length > 2000);
  assert.ok(standing(valleys) > 1.1 * standing(tops), 'the wet ink runs into the valleys');
});

// --- 7. splatter ---

// Which acts threw ink, and their drops (a passive hook: it changes nothing).
function splatsOf(name, key = paperKey) {
  const { rec } = fixtureV2Bytes(name);
  const events = [];
  let deposited = 0;
  const res = grow(rec, {
    paperKey: key,
    family,
    instrument: {
      ...quiet,
      deposit(t, i, g) {
        deposited += g;
      },
      splat(si, i, drops) {
        events.push([si, i, drops.length]);
      },
    },
  });
  return { res, events, deposited, cells: settledCells(res.tiles) };
}

test('splatter: spatter 0 never throws ink; fast flicks throw more than a slow curve', () => {
  const flicks = splatsOf('flicks');
  const slow = splatsOf('slowCurve');
  const dry = splatsOf('flicksDry');
  console.log(
    `splatter: flicks ${flicks.events.length} acts threw ${flicks.res.splat.drops} drops (${flicks.res.splat.W} water) · slow curve ${slow.res.splat.drops} · spatter 0 ${dry.res.splat.drops}`,
  );
  assert.equal(dry.res.splat.drops, 0, 'spatter 0 never splatters');
  assert.equal(dry.events.length, 0);
  assert.ok(flicks.res.splat.drops > 5, 'fast flicks splatter');
  assert.ok(flicks.res.splat.drops > 4 * slow.res.splat.drops + 4, 'more than a slow curve');
  // the odds themselves: the same move, faster and turning sharper, is likelier to throw
  const odds = (v, turn) => splatOdds({ x0: 0, y0: 0, x1: v, y1: 0, pdx: turn ? 0 : v, pdy: turn ? v : 0, dt: 8, p: 153, flow: 9, spatter: 4, tooth: 60, i: 5 }).P;
  assert.ok(odds(200, true) > odds(40, true) && odds(200, true) > odds(200, false));
  assert.equal(splatOdds({ x0: 0, y0: 0, x1: 200, y1: 0, pdx: 0, pdy: 200, dt: 8, p: 153, flow: 9, spatter: 0, tooth: 60, i: 5 }).P, 0);
});

test('splatter: the same strokes on the same paper splatter the same; on other paper, differently', () => {
  const a = splatsOf('flicks');
  const b = splatsOf('flicks');
  assert.deepEqual(b.events, a.events);
  assert.equal(JSON.stringify(b.cells), JSON.stringify(a.cells));
  const other = splatsOf('flicks', testPaperKey('someone else'));
  console.log(`splatter: this paper fired at ${a.events.map((e) => e.slice(0, 2).join('.')).join(' ')} · another at ${other.events.map((e) => e.slice(0, 2).join('.')).join(' ')}`);
  assert.ok(other.events.length > 0);
  assert.notDeepEqual(other.events, a.events, 'another sheet throws its own drops');
});

test('splatter: undo takes a stroke and its drops; every drop is in the accounts', () => {
  const { rec, bytes } = fixtureV2Bytes('flicks');
  const pens = penTimeline(rec);
  const pt = (s, i) => ({ x: s.x[i] + 10 * rec.orgX, y: s.y[i] + 10 * rec.orgY, t: s.t[i], p: null });
  const live = createLive({ paperKey, family });
  const write = (si, shift = 0) => {
    const s = rec.strokes[si];
    live.down({ ...pt(s, 0), t: s.t[0] + shift }, pens[si][0][1], false);
    for (let i = 1; i < s.x.length; i++) live.point({ ...pt(s, i), t: s.t[i] + shift });
    live.up();
  };
  write(0);
  write(1);
  assert.ok(live.undo(), 'the second stroke, splatter and all, goes');
  const alone = grow({ ...rec, strokes: rec.strokes.slice(0, 1) }, { paperKey, family });
  const out = live.finish(bytes);
  assert.equal(JSON.stringify(out.cells), JSON.stringify(settledCells(alone.tiles)));

  const all = splatsOf('flicks');
  assert.ok(all.res.put.drops > 0);
  assert.equal(all.res.put.drops, all.res.splat.W, 'what the drops put down');
  assert.equal(all.deposited, all.res.put.nib + all.res.put.drops, "every drop of water put down is the nib's or a thrown drop's");
});

// --- the sleep rule, live writing, and the tools ---

test('sleep rule: a minute-long pressed stroke (dents, depth, soak) costs the same per tick at the end as near the start', () => {
  const live = createLive({ paperKey: testPaperKey('bench'), family });
  const pen = { nib: 0, size: 30, flex: 0, flow: 7, rgb: [20, 20, 20], angle: 0 };
  const pts = [];
  for (let i = 0; i <= 60000 / 8; i++) {
    const t = i * 8;
    const u = t / 1000;
    const along = (u * 40) % 1300;
    const row = Math.floor((u * 40) / 1300);
    pts.push({ x: 2000 + Math.round(10 * (along + 6 * Math.sin(u * 9))), y: 2000 + Math.round(10 * (40 * Math.abs(Math.sin(u * 6)) + 120 * row)), t, p: 150 + Math.round(90 * Math.sin(u * 5)) });
  }
  live.down(pts[0], pen, true);
  let i = 1;
  const seconds = [];
  for (let sec = 0; sec < 60; sec++) {
    let active = 0;
    let sent = 0;
    const frames = 62;
    for (let f = 0; f < frames; f++) {
      const until = sec * 1000 + (f + 1) * 16;
      while (i < pts.length && pts[i].t <= until) live.point(pts[i++]);
      active += live.activeTiles;
      sent += live.changed().length;
    }
    seconds.push({ active: active / frames, sent: sent / frames });
  }
  const m = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;
  const early = seconds.slice(2, 12),
    late = seconds.slice(50, 60);
  console.log(`v2 sleep rule: active tiles ${m(early, 'active').toFixed(1)} early, ${m(late, 'active').toFixed(1)} late; sent ${m(early, 'sent').toFixed(1)} → ${m(late, 'sent').toFixed(1)}`);
  assert.ok(m(late, 'active') <= 1.15 * m(early, 'active'));
  assert.ok(m(late, 'sent') <= 1.15 * m(early, 'sent') + 1);
  live.up();
  const done = live.finish(new Uint8Array(0));
  assert.ok(done.cells.some((c) => c[6] > 0) && done.cells.some((c) => c[7] > 0) && done.cells.some((c) => c[9] > 0), 'the stroke dented, sank and soaked');
});

test('live writing (with undo) and playback settle exactly as grow()', () => {
  for (const name of ['gallOverBlue', 'tearThenInk']) {
    const { bytes, rec, cells } = grown(name);
    const play = createPlayback({ actsBytes: bytes, rec, paperKey, family });
    for (let t = 0; t < play.duration; t += 137) {
      play.advanceTo(t);
      play.changed();
    }
    const out = play.finish();
    assert.equal(JSON.stringify(out.cells), JSON.stringify(cells), `${name}: playback`);
    assert.deepEqual(out.facts, factsDigest({ cells, box: boxOf(cells), actsBytes: bytes, family }));
  }
  // a stroke written and undone leaves no trace
  const { rec, bytes } = grown('gallOverBlue');
  const strokes = rec.strokes.map((s, si) => ({ s, pens: penTimeline(rec)[si] }));
  const pt = (s, i) => ({ x: s.x[i] + 10 * rec.orgX, y: s.y[i] + 10 * rec.orgY, t: s.t[i], p: null });
  const live = createLive({ paperKey, family });
  const write = ({ s, pens }, shift = 0) => {
    live.down({ ...pt(s, 0), t: s.t[0] + shift }, pens[0][1], false);
    for (let i = 1; i < s.x.length; i++) live.point({ ...pt(s, i), t: s.t[i] + shift });
    live.up();
  };
  write(strokes[0]);
  live.advanceTo(strokes[1].s.t[0] - 1000);
  write({ s: strokes[0].s, pens: [[0, { ...strokes[1].pens[0][1] }]] }, strokes[1].s.t[0] - 1000 - strokes[0].s.t[0]);
  assert.ok(live.undo());
  write(strokes[1]);
  const out = live.finish(bytes);
  assert.equal(JSON.stringify(out.cells), JSON.stringify(grown('gallOverBlue').cells));
  const cut = createLive({ paperKey, family });
  cut.down(pt(strokes[1].s, 0), strokes[1].pens[0][1], false);
  for (let i = 1; i < 30; i++) cut.point(pt(strokes[1].s, i));
  const rows = cut.cut(0, 0, 2000, 2000);
  assert.ok(
    rows.some((r) => r[5] > 0 && r[8] > 0),
    'a wet gall cell shows its bead in the live cut',
  );
});

test('walk-back and film read v2 sheets without changing them', () => {
  const { bytes, rec, cells, box } = grown('gallHairPool');
  const pool = cells.reduce((a, c) => (c[8] > a[8] ? c : a));
  const w = trace(rec, { paperKey, family }, [pool[1], pool[0]]);
  assert.equal(w.settled.gall, pool[5]);
  assert.deepEqual([w.depth.dent, w.depth.depth, w.depth.peak, w.depth.soak, w.depth.cockle], [pool[6], pool[7], pool[8], pool[9], pool[12]]);
  assert.ok(w.water.standing > 0 && w.deposits.length > 0);
  const film = readFilm(makeFilm({ actsBytes: bytes, rec, paperKey, family, box }));
  assert.ok(film.frames.length > 10);
});

test('scene payload (PNKS 2): only the cells that hold anything, the surface in a byte when it fits; PNKS 1 still reads', () => {
  const { cells, box } = grown('gallHairPool');
  const f = sceneField(cells, box, {});
  const two = encodeScene(f);
  assert.equal(two[4], 2);
  const back = decodeScene(two);
  for (const k of ['surface', 'above', 'depth', 'rgba', 'flags']) assert.deepEqual(back[k], f[k], k);
  assert.ok(two.length < 0.6 * (21 + box[2] * box[3] * 10), `smaller: ${two.length} bytes against ${21 + box[2] * box[3] * 10}`);
  // a surface past a byte: two bytes a cell
  const tall = { ...f, surface: f.surface.map((v, k) => (k % 7 === 0 ? 300 : v)) };
  const t2 = encodeScene(tall);
  assert.equal(t2[21], 0);
  assert.deepEqual(decodeScene(t2).surface, tall.surface);
  // PNKS 1, every cell of the box
  const n = box[2] * box[3];
  const one = new Uint8Array(21 + n * 10);
  const dv = new DataView(one.buffer);
  one.set([0x50, 0x4e, 0x4b, 0x53, 1]);
  box.forEach((v, i) => dv.setInt32(5 + 4 * i, v, true));
  for (let k = 0; k < n; k++) {
    const o = 21 + 10 * k;
    dv.setInt16(o, f.surface[k], true);
    dv.setUint16(o + 2, f.above[k], true);
    one[o + 4] = f.depth[k];
    one.set(f.rgba.subarray(4 * k, 4 * k + 4), o + 5);
    one[o + 9] = f.flags[k];
  }
  const old = decodeScene(one);
  for (const k of ['surface', 'above', 'depth', 'rgba', 'flags']) assert.deepEqual(old[k], f[k], k);
  assert.throws(() => decodeScene(two.subarray(0, two.length - 3)), /scene/);
});

// --- load by the senses (cleanup-and-speed.md §5b) ---

test('load by the senses: a window of the scene is its cells; a coarser level mixes blocks; PNKS carries the level', () => {
  const { cells, box } = grown('gallHairPool');
  const f = sceneField(cells, box, {});
  const same = sceneWindow(f);
  for (const k of ['surface', 'above', 'depth', 'rgba', 'flags']) assert.deepEqual(same[k], f[k], k);
  // a window: exactly those cells (clipped to the box)
  const at = [box[0] + 7, box[1] + 3, 40, box[3] + 99];
  const w = sceneWindow(f, at);
  assert.deepEqual(w.box, [at[0], at[1], 40, box[3] - 3]);
  for (let y = 0; y < w.box[3]; y++) {
    for (let x = 0; x < w.box[2]; x++) {
      const k = y * w.box[2] + x,
        o = (y + 3) * box[2] + (x + 7);
      assert.equal(w.surface[k], f.surface[o]);
      assert.equal(w.above[k], f.above[o]);
      assert.equal(w.depth[k], f.depth[o]);
      assert.equal(w.flags[k], f.flags[o]);
      assert.deepEqual([...w.rgba.subarray(4 * k, 4 * k + 4)], [...f.rgba.subarray(4 * o, 4 * o + 4)]);
    }
  }
  assert.deepEqual(sceneWindow(f, [box[0] - 500, box[1], 10, 10]).box.slice(2), [0, 0], 'nothing in view: nothing');
  // level 2: blocks of 4 × 4, the same ink over a sixteenth of the cells
  const c = sceneWindow(f, null, 2);
  assert.equal(c.lod, 2);
  assert.deepEqual(c.box, [Math.floor(box[0] / 4), Math.floor(box[1] / 4), Math.ceil((box[0] + box[2]) / 4) - Math.floor(box[0] / 4), Math.ceil((box[1] + box[3]) / 4) - Math.floor(box[1] / 4)]);
  const ink = (g, n) => g.rgba.reduce((a, v, i) => (i % 4 === 3 ? a + v * n : a), 0);
  assert.ok(Math.abs(ink(c, 16) - ink(f, 1)) < 0.01 * ink(f, 1) + 8 * c.box[2] * c.box[3], 'the ink is all there, spread over its block');
  const deepest = (g) => g.depth.reduce((a, v) => Math.max(a, v), 0);
  assert.equal(deepest(c), deepest(f));
  assert.equal(
    c.flags.reduce((a, v) => a | v, 0),
    f.flags.reduce((a, v) => a | v, 0),
  );
  const back = decodeScene(encodeScene(c));
  assert.equal(back.lod, 2);
  for (const k of ['surface', 'above', 'depth', 'rgba', 'flags']) assert.deepEqual(back[k], c[k], k);
  assert.equal(decodeScene(encodeScene(f)).lod, 0);
  assert.throws(() => sceneWindow(f, null, 4), /level/);
  assert.throws(() => sceneWindow(c, null, 1), /level/, 'a coarse field is not coarsened again');
});

test('load by the senses: a sheet that leaves the view while wet keeps settling, and ends as one watched the whole time', () => {
  const { rec, bytes } = grown('gallOverBlue');
  const strokes = rec.strokes.map((s, si) => ({ s, pens: penTimeline(rec)[si] }));
  const pt = (s, i) => ({ x: s.x[i] + 10 * rec.orgX, y: s.y[i] + 10 * rec.orgY, t: s.t[i], p: null });
  const end = strokes.at(-1).s.t.at(-1) + 3000;
  // watching(t): whether anyone sees the sheet at t (only then are its tiles drawn)
  const run = (watching) => {
    const live = createLive({ paperKey, family });
    const shown = new Map();
    let looks = 0;
    const look = () => {
      looks++;
      for (const t of live.changed({ heights: true })) shown.set(`${t.tx},${t.ty}`, `${t.rgba.join()}|${t.hf.join()}`);
    };
    strokes.forEach(({ s, pens }, si) => {
      live.down(pt(s, 0), pens[0][1], false);
      for (let i = 1; i < s.x.length; i++) {
        live.point(pt(s, i));
        if (i % 8 === 0 && watching(s.t[i])) look();
      }
      live.up();
      const next = si + 1 < strokes.length ? strokes[si + 1].s.t[0] : end;
      for (let t = s.t.at(-1) + 40; t < next; t += 40) {
        live.advanceTo(t); // the worker steps whether or not anyone looks
        if (watching(t)) look();
      }
    });
    look(); // back in view
    return { out: live.finish(bytes), shown, looks };
  };
  const watched = run(() => true);
  const leaves = strokes[0].s.t[Math.floor(strokes[0].s.x.length / 2)]; // mid-stroke, wet
  const away = run((t) => t < leaves);
  assert.ok(away.looks < watched.looks / 4, `away: ${away.looks} looks against ${watched.looks}`);
  assert.deepEqual(away.out.facts, watched.out.facts);
  assert.equal(JSON.stringify(away.out.cells), JSON.stringify(watched.out.cells));
  assert.deepEqual([...away.shown.keys()].sort(), [...watched.shown.keys()].sort());
  for (const [k, v] of watched.shown) assert.equal(away.shown.get(k), v, `tile ${k}: on its return it shows what the watcher saw`);
});
