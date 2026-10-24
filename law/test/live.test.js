// Writing live equals growing the finished record: the live sim, fed act by
// act with idle drying between strokes, undos and replays in any order, settles
// to exactly the facts grow() gives the encoded record. Under every law.
import test from 'node:test';
import assert from 'node:assert/strict';
import { livePoints } from '../v1/live.js';
import { readFilm, paintFrame } from '../v1/film.js';
import { decodeActs, penTimeline } from '../v1/acts.js';
import { settle as settleAt } from '../record.js';
import { lawOf } from '../laws.js';
import { paperKeyOf } from '../keys.js';
import { fixtureBytes } from '../tools/fixtures.js';
import * as S from '../lab/synth.js';
import { b64url } from '../tags.js';

function rng(n) {
  let s = n >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const family = { grain: 8, weight: 8, tooth: 0 };
const seed = new Uint8Array(64).map((_, i) => (i * 37 + 11) & 255);
const paperKey = paperKeyOf(seed);

for (const law of [1, 2]) {
const { createLive, createPlayback, trace, grow, settledCells, boxOf, factsDigest, makeFilm, lookRGB, lookRGBA } = lawOf(law);
const settle = (bytes, seed, family) => settleAt(bytes, seed, family, 64, law);
const seen = { advances: 0, mistakes: 0, rewrites: 0, pastDrain: 0 };


// Feed a record live, with random idle drying, mistakes that are undone, and
// strokes undone and written again. Returns the live facts.
function writeLive(bytes, r, { keep = 24, mistakes = true } = {}) {
  const rec = decodeActs(bytes);
  const strokes = livePoints(rec, penTimeline(rec));
  const live = createLive({ paperKey, family, keep });
  const feed = (s) => {
    live.down(s.points[0], s.pens[0][1], s.hasP);
    let k = 0;
    for (let i = 1; i < s.points.length; i++) {
      live.point(s.points[i]);
      while (k + 1 < s.pens.length && s.pens[k + 1][0] <= i) {
        k++;
        live.pen(s.pens[k][1]);
      }
    }
    live.up();
  };
  // idle drying up to (never past) the time the next stroke starts
  const dryUntil = (from, to) => {
    let t = from;
    while (r() < 0.6 && t < to) {
      t = Math.min(to, t + Math.floor(r() * 400));
      live.advanceTo(t);
      seen.advances++;
    }
  };
  strokes.forEach((s, i) => {
    const prevEnd = i ? strokes[i - 1].points.at(-1).t : 0;
    const start = s.points[0].t;
    if (i) dryUntil(prevEnd, start);
    // a mistake in the gap, dried for a while, then undone
    if (mistakes && i && start - prevEnd > 40 && r() < 0.5) {
      const room = start - prevEnd - 2;
      const src = s.points.slice(0, 6);
      const span = Math.max(1, src.at(-1).t - src[0].t);
      const t0 = Math.max(prevEnd + 1, Math.max(prevEnd, live.now) + 1);
      if (t0 + 10 < start) {
        const pts = src.map((p, j) => ({ ...p, x: p.x + 37, t: t0 + Math.floor(((p.t - src[0].t) * Math.min(room / 2, 200)) / span) + j }));
        if (pts.at(-1).t < start) {
          feed({ ...s, points: pts, pens: [s.pens[0]] });
          dryUntil(pts.at(-1).t, start);
          assert.ok(live.undo());
          seen.mistakes++;
        }
      }
    }
    feed(s);
    // sometimes the stroke is undone at once and written again, identically
    if (r() < 0.2) {
      assert.ok(live.undo());
      feed(s);
      seen.rewrites++;
    }
  });
  const end = strokes.at(-1).points.at(-1).t;
  if (r() < 0.7) {
    const to = end + Math.floor(r() * 70000); // even past the drain limit
    live.advanceTo(to);
    if (to > end + 30000) seen.pastDrain++;
  }
  return live.finish(bytes);
}

const records = () => [
  ...['mixWet', 'mixDry', 'dwell', 'cursive', 'flexPressure', 'broad'].map((n) => [n, fixtureBytes(n).bytes]),
  ...[1, 2, 3].map((w) => [`writer ${w}`, S.write(S.makeWriter(w), 'living ink', 1)]),
  ['phone', S.write(S.makeWriter(4), 'held still', 2, 'phone')],
];

test(`law ${law}: live writing settles exactly as the finished record grows`, () => {
  for (const [name, bytes] of records()) {
    const batch = settle(bytes, seed, family);
    for (const k of [1, 2, 3]) {
      const live = writeLive(bytes, rng(k * 7919 + name.length));
      assert.equal(b64url(live.facts), b64url(batch.facts), `${name}, run ${k}`);
      assert.deepEqual(live.box, batch.box);
    }
  }
  for (const [k, n] of Object.entries(seen)) assert.ok(n > 0, `the runs never exercised ${k}`);
});

test(`law ${law}: undo far back replays from the start and still settles the same`, () => {
  for (const [name, bytes] of records().slice(3, 8)) {
    const batch = settle(bytes, seed, family);
    const live = writeLive(bytes, rng(31337), { keep: 1 });
    assert.equal(b64url(live.facts), b64url(batch.facts), name);
  }
});

test(`law ${law}: the live view hands back the tiles ink touched, and only those`, () => {
  const bytes = fixtureBytes('dwell').bytes;
  const rec = decodeActs(bytes);
  const [s] = livePoints(rec, penTimeline(rec));
  const live = createLive({ paperKey, family });
  live.down(s.points[0], s.pens[0][1], s.hasP);
  for (const p of s.points.slice(1)) live.point(p);
  live.up();
  const tiles = live.changed();
  assert.ok(tiles.length > 0);
  assert.ok(tiles.some((t) => t.rgba.some((v, i) => i % 4 === 3 && v > 0)), 'some ink shows');
  assert.equal(live.changed().length, 0, 'nothing changed since');
  live.advanceTo(s.points.at(-1).t + 500);
  assert.ok(live.changed().length > 0, 'drying changes tiles');
  assert.throws(() => { live.down(s.points[0], s.pens[0][1], s.hasP); live.advanceTo(1e9); }, /pen is down/);
});

test(`law ${law}: playback, run forward in any steps, ends exactly where the record settles`, () => {
  for (const [name, bytes] of records().slice(0, 7)) {
    const rec = decodeActs(bytes);
    const batch = settle(bytes, seed, family);
    const r = rng(name.length * 101);
    const play = createPlayback({ actsBytes: bytes, rec, paperKey, family });
    let t = 0;
    let frames = 0;
    while (t < play.duration + 3000) {
      t += Math.floor(r() * 60) + 1;
      play.advanceTo(t);
      if (play.changed().length) frames++;
    }
    assert.ok(frames > 3, `${name}: it moves`);
    assert.equal(b64url(play.finish().facts), b64url(batch.facts), name);
  }
});

test(`law ${law}: walking back a cell reads the sheet without changing it`, () => {
  const bytes = fixtureBytes('dwell').bytes;
  const rec = decodeActs(bytes);
  const plain = settle(bytes, seed, family);
  // the cell under the held pen (consecutive acts at the same spot)
  const st = rec.strokes[0];
  let h = 1;
  while (h < st.x.length && !(st.x[h] === st.x[h - 1] && st.y[h] === st.y[h - 1])) h++;
  const x = Math.floor(2 * rec.orgX + st.x[h] / 5);
  const y = Math.floor(2 * rec.orgY + st.y[h] / 5);
  const t = trace(rec, { paperKey, family }, [x, y]);
  assert.ok(t.deposits.length > 5, 'the nib dwelt here: ink went down tick after tick');
  assert.ok(t.water.standing > 0, 'a bead stood here');
  assert.ok(t.water.dryAt > t.water.wetAt);
  const here = plain.cells.find((c) => c[0] === y && c[1] === x);
  assert.deepEqual(t.settled.fixed, [here[2], here[3], here[4]]);
  // the darkest cell is on the ring the bead dried to: its ink came by flow
  const [ry, rx] = plain.cells.reduce((m, c) => (c[2] + c[3] + c[4] > m[2] + m[3] + m[4] ? c : m));
  const ring = trace(rec, { paperKey, family }, [rx, ry]);
  assert.ok(ring.water.peak > 0);
  assert.ok(t.paper.capacity > 0);
  // the same sheet grown with and without the observer: the same facts
  const again = settledCells(grow(rec, { paperKey, family }).tiles);
  assert.equal(b64url(factsDigest({ cells: again, box: boxOf(again), actsBytes: bytes, family, scale: 64 })), b64url(plain.facts));
  // a cell off the path: no ink put down, maybe some carried
  const off = trace(rec, { paperKey, family }, [x, y - 40]);
  assert.equal(off.deposits.length, 0);
});

test(`law ${law}: a film ends on the sealed look, frame by frame`, () => {
  const bytes = fixtureBytes('mixWet').bytes;
  const rec = decodeActs(bytes);
  const s = settle(bytes, seed, family);
  const film = readFilm(makeFilm({ actsBytes: bytes, rec, paperKey, family, box: s.box }));
  assert.deepEqual(film.box, s.box);
  assert.ok(film.frames.length > 10);
  const [, , w, h] = s.box;
  const pixels = new Uint8Array(w * h * 4);
  for (const f of film.frames) paintFrame(pixels, film.box, f);
  assert.deepEqual([...pixels], [...lookRGBA(lookRGB(s.cells, s.box), s.box)], 'the last frame is the look');
});

test(`law ${law}: undo shows the sheet as it was: from a snapshot, and when it grows the sheet again`, () => {
  const rec = decodeActs(fixtureBytes('cursive').bytes);
  const [s1, s2] = livePoints(rec, penTimeline(rec));
  const blank = [...new Uint8ClampedArray(1024)].join();
  const view = (live) => {
    const pixels = new Map();
    return { paint: () => { for (const t of live.changed()) pixels.set(`${t.tx},${t.ty}`, [...t.rgba].join()); }, pixels };
  };
  const write = (live, v, s) => { live.down(s.points[0], s.pens[0][1], s.hasP); for (const p of s.points.slice(1)) live.point(p); live.up(); v.paint(); };

  // a snapshot: undo the second stroke, the screen is as it was before it
  const a = createLive({ paperKey, family });
  const va = view(a);
  write(a, va, s1);
  a.advanceTo(s2.points[0].t);
  va.paint();
  const before = new Map(va.pixels);
  write(a, va, s2);
  assert.ok(a.undo());
  va.paint();
  for (const [k, v] of va.pixels) assert.equal(v, before.get(k) ?? blank, `tile ${k} still shows the undone stroke`);

  // past the kept snapshots: undoing the first stroke grows the sheet afresh, and the screen goes blank
  const b = createLive({ paperKey, family, keep: 1 });
  const vb = view(b);
  write(b, vb, s1);
  write(b, vb, s2); // only s2 keeps a snapshot now
  assert.ok(b.undo());
  assert.ok(b.undo()); // s1: no snapshot: replayed
  vb.paint();
  for (const [k, v] of vb.pixels) assert.equal(v, blank, `tile ${k} still shows ink after undoing everything`);
});
}
