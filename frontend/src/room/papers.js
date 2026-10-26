// Papers (law/paper.js; backend store/papers.js): thin rectangles of paper matter, each its owner's, its
// whole life on its own chain. Here: each one grown from its stamped acts and the drips that landed on it
// (room/paperWorker.js), where it lies in the room (its rest, read from its chain), who may mark it, and the
// writer for one: your strokes show at once (your own guess, live), go to the stamper sealed by your key,
// and once the paper grown in the stamper's order has them, that is what shows. An act not stamped within
// STAMP_MS is withdrawn here, and you are told, so you can write it again. Lift takes back your own stroke
// (one of your last LIFT_WINDOW). Wax (rooms.md §3b): the stamper pressed (set to someone's seal), a seal
// broken: acts like any other. Moves: taken up, let go, posted, saved into a book.
import { useEffect, useRef, useState } from 'react';
import { keys as K, paper as P, fromB64url } from 'penpals-law';
import { lawOf, viewBuckets } from 'penpals-law/laws';
import { createLiveInk, CELLS } from '../ink/live.js';
import { toHalf } from '../scene/half.js';
import { TILE } from 'penpals-law/v1/constants';
import { strokesToActs } from '../ink/capture.js';
import { roomToPage, PAPER_PX } from '../scene/light/index.js';
import { cornerOf } from './drops.js';
import { api } from '../api.js';

export const STAMP_MS = 8000; // an act unstamped this long is withdrawn (Tabor's to set)
export const SEAL_CELL = 2; // paper cells a stamper's face pixel presses: 32 of them about 5 mm (Tabor's to set)
export const SEAL_R = (SEAL_CELL * 32) / 2 / CELLS; // half across a seal's impression (its paper's units)
export const sizeOf = (view) => ({ width: view.birth.size[0], height: view.birth.size[1] });

// A paper lying at `at` (room m: its middle, where it rests) as the scene lays it (SceneView sheets): its
// whole face, its corner on the page's frame (`origin`: light.js originOf), lifted from the page's plane to
// where it rests (on the table, 0; on the floor, below).
export function sceneSheetOf(view, at, origin) {
  const [w, h] = view.birth.size;
  const [px, py, pz] = roomToPage(
    cornerOf(
      at.map((v) => v * 1000),
      view.birth.size,
    ),
    origin,
  );
  return { id: `paper:${view.paper}`, paper: view.paper, box: [0, 0, w * CELLS, h * CELLS], origin: [px, py], lift: pz + PAPER_PX, cellPx: 1 / CELLS, size: [w, h] };
}

// When it came to rest where it lies (ms): its birth, or the last time a hand let it go.
export function restedAt(view) {
  const put = view.lines.findLast((l) => l.act.act === 'put');
  return (view.born ?? 0) + (put ? put.at : 0);
}
// Papers lying about, in the order they came to rest, each lifted a paper's thickness (PAPER_PX) for every one
// under it (one that came to rest before it where they overlap, at the same height): the last let go lies on
// top. placed: [{ rested, sheet: { origin, size, lift } }] → the same, in that order, lifted.
export function stacked(placed) {
  const out = [...placed].sort((a, b) => a.rested - b.rested);
  const over = (a, b) => a.origin[0] < b.origin[0] + b.size[0] && b.origin[0] < a.origin[0] + a.size[0] && a.origin[1] < b.origin[1] + b.size[1] && b.origin[1] < a.origin[1] + a.size[1];
  return out.map((p, i) => {
    const under = out.slice(0, i).filter((q) => Math.abs(q.sheet.lift - p.sheet.lift) < PAPER_PX && over(q.sheet, p.sheet)).length;
    return under ? { ...p, sheet: { ...p.sheet, lift: p.sheet.lift + under * PAPER_PX } } : p;
  });
}

// May `me` (a key) mark it now (law/paper.js mayMark, read from its view): its owner; anyone a press names
// (not broken); the being whose house it lies in, while it rests on their table. Only where it lies.
export function mayMark(view, me) {
  if (!me || !view.where?.space) return false;
  if (view.ownerKey === me) return true;
  if (view.where.space === me && P.onTable(view.where)) return true;
  return sealsOf(view).some((x) => x.for === me && !x.broken);
}
// The seals pressed into it, in its order: [{ n, for (key), name, took, broken, at: { x, y } (its units) }]
// (took: grown to that press, its i-th seal took: the impression came out; until grown, not yet).
export function sealsOf(view, took = []) {
  const broken = new Set(view.lines.filter((l) => l.act.act === 'break').map((l) => l.act.break.seal));
  return view.lines
    .filter((l) => l.act.act === 'press')
    .map((l, i) => ({ n: l.n, for: l.act.press.for, name: view.names?.[l.act.press.for] ?? null, took: !!took[i], broken: broken.has(l.n), at: { x: l.act.press.x / 10, y: l.act.press.y / 10 } }));
}
// the strokes on it, decoded (each heard from where it was written: world.md Phase 2)
export const strokeOf = (line) => lawOf(P.PAPER_LAW).decodeCanonical(fromB64url(line.act.stroke));

// Each paper grown as its acts and the drips on it arrive: paper → { field, n (the last place grown),
// facts, seals: [took] }. dripsOf(view): the drips that landed on it (law/wax.js dripsOn).
let worker = null;
let nextId = 1;
const waiting = new Map();
function grow(view, drips) {
  worker ??= (() => {
    const w = new Worker(new URL('./paperWorker.js', import.meta.url), { type: 'module' });
    w.onmessage = ({ data }) => {
      const p = waiting.get(data.id);
      waiting.delete(data.id);
      if (data.error) p?.reject(new Error(data.error));
      else p?.resolve(data);
    };
    return w;
  })();
  return new Promise((resolve, reject) => {
    const id = nextId++;
    waiting.set(id, { resolve, reject });
    worker.postMessage({ id, lines: view.lines, drips, seed: view.open.seed, family: view.birth.family, ageH: ageOf(view) });
  });
}
const marks = (lines) => lines.filter((l) => P.MARKS.includes(l.act.act)).length;
// how old its ink is (h): since its last mark (the record's own age, as the law ages a sheet's)
const ageOf = (view) => {
  const last = view.lines.findLast((l) => P.MARKS.includes(l.act.act));
  return last ? Math.max(0, (Date.now() - (view.born ?? 0) - last.at) / 3600000) : 0;
};
const AGE_EVERY_MS = 3600000; // (its look grown again as its age passes each whole hour: the law's buckets)
export function usePaperFields(views, dripsOf = () => []) {
  const [fields, setFields] = useState(() => new Map());
  const [hour, setHour] = useState(0); // (each hour: the ink's age passes into its next bucket)
  useEffect(() => {
    const t = setInterval(() => setHour((h) => h + 1), AGE_EVERY_MS);
    return () => clearInterval(t);
  }, []);
  const asked = useRef(new Map()); // paper → the marks and drips asked for
  useEffect(() => {
    for (const v of views) {
      const drips = dripsOf(v);
      const what = `${marks(v.lines)}:${drips.length}:${viewBuckets(P.lawFor(v.birth), { ageH: ageOf(v) }).ageH}`;
      if (asked.current.get(v.paper) === what) continue;
      asked.current.set(v.paper, what);
      grow(v, drips)
        .then((r) => setFields((m) => (m.get(v.paper)?.n > r.n ? m : new Map(m).set(v.paper, { field: r.field, n: r.n, facts: r.facts, seals: r.seals }))))
        .catch((err) => console.warn('[paper]', err.message));
    }
  }, [views, dripsOf, hour]);
  return fields;
}

// Your guess over the stamped paper (rooms.md §6: your own ink shows at once): the live tiles of what you
// have written and not yet seen grown, laid over the grown field where they hold ink or water, the field
// everywhere else. As SceneView's `live` for the paper: { tiles(), onTiles(fn) }.
export function guessOver(live, field) {
  const blend = (t) => {
    if (!field) return t;
    const [bx, by, bw, bh] = field.box;
    const rgba = new Uint8ClampedArray(t.rgba);
    const hf = t.hf ? new Uint16Array(t.hf) : new Uint16Array(TILE * TILE * 4);
    for (let j = 0; j < TILE; j++)
      for (let i = 0; i < TILE; i++) {
        const k = j * TILE + i;
        if (rgba[4 * k + 3] || hf[4 * k + 1]) continue; // your ink (or water) here: the guess
        const x = t.tx * TILE + i - bx,
          y = t.ty * TILE + j - by;
        if (x < 0 || y < 0 || x >= bw || y >= bh) {
          rgba.fill(0, 4 * k, 4 * k + 4);
          hf.fill(0, 4 * k, 4 * k + 4);
          continue;
        }
        const f = y * bw + x;
        rgba.set(field.rgba.subarray(4 * f, 4 * f + 4), 4 * k);
        hf[4 * k] = toHalf(field.surface[f] + field.above[f]);
        hf[4 * k + 1] = toHalf(field.above[f]);
        hf[4 * k + 2] = toHalf(field.depth[f]);
        hf[4 * k + 3] = toHalf(field.flags[f]);
      }
    return { tx: t.tx, ty: t.ty, rgba, hf };
  };
  return { tiles: () => live.tiles().map(blend), onTiles: (fn) => live.onTiles((tiles) => fn(tiles.map(blend))) };
}

// An act sent and its answer, or a timeout after `ms`: the act withdrawn here.
export function withinStamp(sent, ms = STAMP_MS) {
  let timer = 0;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('not stamped in time'), { timeout: true })), ms);
  });
  return Promise.race([sent, late]).finally(() => clearTimeout(timer));
}

// Your acts on papers, counted on per paper from your last in its chain (and those sent since).
const counts = new Map(); // paper → your last k
const countOf = (key, view) => Math.max(counts.get(view.paper) ?? 0, 0, ...view.lines.filter((l) => l.act.by === key.publicKey).map((l) => l.act.k));
export function paperAct(key, view, act, fields = {}) {
  const k = countOf(key, view) + 1;
  counts.set(view.paper, k);
  return api.post(`/api/papers/${view.paper}/acts`, P.makePaperAct({ sk: key.sk, pk: key.pk, paper: view.paper, k, act, ...fields }));
}
// A surface of your house (law/paper.js SURFACES), matter of its own once you write on it: → { view (as the
// stamper will have it), ready (its birth stamped) }
export function newSurface(key, surface) {
  const made = P.makeSurface({ sk: key.sk, pk: key.pk, paper: K.newSheetId(), surface });
  const view = {
    paper: made.birth.paper,
    birth: made.birth,
    open: made.open,
    seal: made.seal,
    born: Date.now(),
    lines: [],
    where: { space: key.publicKey, surface },
    ownerKey: key.publicKey,
    names: {},
  };
  return { view, ready: api.post('/api/papers', made) };
}
// A new paper of yours, lying on your own table at `at` (room m).
export const newPaper = (key, family, at) => api.post('/api/papers', P.makePaper({ sk: key.sk, pk: key.pk, paper: K.newSheetId(), family, at }));

// The writer for one paper (or a house's surface): key (keys/session.js), view (backend store/papers.js
// viewOf), pen: the pen in the hand, as the law takes it (room/pens.js lawPen: its nib, its ink, its well);
// ready: a promise its acts wait on (a surface written on for the first time: until its birth is stamped).
export function createPaperWriter({ key, view, pen, ready = null, onNotice = () => {} }) {
  const size = sizeOf(view);
  const seed = fromB64url(view.open.seed, 64);
  const live = createLiveInk({ paperKey: K.paperKeyOf(seed), family: view.birth.family, size, pen, law: P.lawFor(view.birth) });
  live.scene(true); // its tiles carry heights: the guess is laid in the scene
  let now = view; // (its chain as stamped so far)
  let pending = 0; // strokes sent, not yet stamped
  let down = false;
  const tenths = (v) => Math.max(0, Math.round(v * 10));
  // an act, stamped or withdrawn (and told)
  const send = (kind, fields) => (ready ? ready.then(() => paperAct(key, now, kind, fields)) : paperAct(key, now, kind, fields));
  const act = (kind, fields) =>
    withinStamp(send(kind, fields)).catch((err) => {
      onNotice(err.timeout ? 'That was not stamped in time. Do it again.' : `That was not taken: ${err.message}`);
      return null;
    });
  const inside = (q) => q.x >= 0 && q.y >= 0 && q.x <= size.width && q.y <= size.height;
  async function strokeDone() {
    const strokes = live.capture.strokes;
    const last = strokes[strokes.length - 1];
    const bytes = last && strokesToActs([last], live.capture.pen);
    if (!bytes) return;
    pending++;
    try {
      await withinStamp(send('stroke', { stroke: bytes }));
    } catch (err) {
      // withdrawn here (and told): your unstamped ink is lifted from this screen
      if (!down) live.clear();
      onNotice(err.timeout ? 'That stroke was not stamped in time: it is lifted here. Write it again.' : `That stroke was not taken: ${err.message}`);
    } finally {
      pending--;
    }
  }
  return {
    paper: view.paper,
    live,
    // the nib as its ink has it now (heard: sound/pen.js penHand)
    nib: () => ({ pen: live.capture.pen, on: 'paper', ...live.nib }),
    pen: {
      down(q, ev, type) {
        if (!inside(q)) return false;
        down = true;
        live.capture.down(q, ev, type);
        return true;
      },
      move(q, ev) {
        if (!down) return;
        if (!inside(q)) return this.up(null, ev);
        live.capture.move(q, ev);
        return undefined;
      },
      up(q, ev) {
        if (!down) return;
        down = false;
        live.capture.up(q && inside(q) ? q : null, ev);
        strokeDone();
      },
      cancel() {
        down = false;
        live.capture.cancel();
      },
    },
    // the paper as stamped now (its view, and how many of its lines its grown field holds): once everything
    // you sent is in the grown paper, the guess can go
    settled(view, grown) {
      now = view;
      if (!pending && !down && live.strokes && grown >= view.lines.length) live.clear();
    },
    setPen: (p) => live.setPen(p),
    // lift your last stroke still in the window (rooms.md §6): a forward act, stamped like any other
    lift() {
      const mine = now.lines.filter((l) => l.act.act === 'stroke' && l.act.by === key.publicKey);
      const lifted = new Set(now.lines.filter((l) => l.act.act === 'lift').map((l) => l.act.lift));
      const target = [...mine].reverse().find((l, i) => i < P.LIFT_WINDOW && !lifted.has(l.n));
      if (!target) return onNotice('Nothing of yours left to lift here: older strokes have merged.');
      return act('lift', { lift: target.n });
    },
    // wax (rooms.md §3b): the stamper pressed at q (the paper's units), a seal broken
    press(q, seal, { depth = 200, tiltX = 0, tiltY = 0, angle = 0, cell = SEAL_CELL } = {}) {
      return act('press', { press: { x: tenths(q.x), y: tenths(q.y), depth, angle, tiltX, tiltY, cell, w: seal.w, h: seal.h, face: seal.face, for: seal.key } });
    },
    breakSeal(n, at) {
      // across the impression, corner to corner
      return act('break', { broke: { seal: n, from: [tenths(at.x - SEAL_R), tenths(at.y - SEAL_R)], to: [tenths(at.x + SEAL_R), tenths(at.y + SEAL_R)] } });
    },
    destroy: () => live.destroy(),
  };
}
