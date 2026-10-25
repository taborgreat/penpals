// Shared sheets on a table (rooms.md §5, §6): each grown from its stamped acts
// (room/sharedWorker.js), laid on the table to the left of the page; and the
// writer for one: your strokes show at once (a live sheet on its paper, your
// own guess), go to the stamper sealed by your key, and once the sheet grown
// in the stamper's order has them, that is what shows. An act not stamped
// within STAMP_MS is withdrawn here, and you are told, so you can write it
// again. Lift takes back your own stroke (one of your last LIFT_WINDOW). Wax
// (rooms.md §3b, §5): the stamper pressed (set to someone's seal), a seal broken:
// acts like any other, stamped in the one order. Drips are no one's act: the law
// regrows them from the room's chain (law/wax.js; room/together.js), and a sheet
// grows with those that landed on it.
import { useEffect, useRef, useState } from 'react';
import { keys as K, shared as SH, fromB64url } from 'penpals-law';
import { createLiveInk, CELLS } from '../ink/live.js';
import { toHalf } from '../scene/half.js';
import { TILE } from 'penpals-law/v1/constants';
import { strokesToActs } from '../ink/capture.js';
import { lawPen, SPATTER_DEFAULT } from '../ink/pens.js';
import { PEN_SIZES } from '../ink/nibs.js';
import { api } from '../api.js';

import { SHARED_PAGE } from './table.js';
export { SHARED_PAGE, slotOf } from './table.js';
export const STAMP_MS = 8000; // an act unstamped this long is withdrawn (Tabor's to set)
export const SEAL_CELL = 2; // paper cells a stamper's face pixel presses: 32 of them about 5 mm (Tabor's to set)
// A shared sheet as the scene lays it (SceneView sheets): its whole paper, at its slot.
export const sceneSheetOf = (sheet, slot) => ({ id: `shared:${sheet}`, box: [0, 0, SHARED_PAGE.width * CELLS, SHARED_PAGE.height * CELLS], origin: slot, cellPx: 1 / CELLS });

// Each shared sheet grown as its acts and the drips on it arrive: sheet → { field, n (the last
// place grown), facts, seals: [took] }. dripsOf(view): the drips that landed on it (law/wax.js dripsOn).
let worker = null;
let nextId = 1;
const waiting = new Map();
function grow(view, drips) {
  worker ??= (() => {
    const w = new Worker(new URL('./sharedWorker.js', import.meta.url), { type: 'module' });
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
    worker.postMessage({ id, lines: view.lines, drips, seed: view.open.seed, family: view.birth.paper });
  });
}
export function useSharedFields(sheets, dripsOf = () => []) {
  const [fields, setFields] = useState(() => new Map());
  const asked = useRef(new Map()); // sheet → the lines and drips asked for
  useEffect(() => {
    for (const s of sheets) {
      const drips = dripsOf(s);
      const what = `${s.lines.length}:${drips.length}`;
      if (asked.current.get(s.sheet) === what) continue;
      asked.current.set(s.sheet, what);
      grow(s, drips)
        .then((r) => setFields((m) => (m.get(s.sheet)?.n > r.n ? m : new Map(m).set(s.sheet, { field: r.field, n: r.n, facts: r.facts, seals: r.seals }))))
        .catch((err) => console.warn('[shared sheet]', err.message));
    }
  }, [sheets, dripsOf]);
  return fields;
}

// Your guess over the stamped sheet (rooms.md §6: your own ink shows at once): the
// live tiles of what you have written and not yet seen grown, laid over the grown
// field where they hold ink or water, the field everywhere else. As SceneView's
// `live` for the sheet: { tiles(), onTiles(fn) }.
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

// The writer for one shared sheet: key (keys/session.js), view (routes/rooms.js viewOf).
export function createSharedWriter({ key, view, color, onNotice = () => {} }) {
  const seed = fromB64url(view.open.seed, 64);
  const pen = lawPen({ nib: 'pen', size: PEN_SIZES.medium }, color, undefined, SPATTER_DEFAULT.pen);
  const live = createLiveInk({ paperKey: K.paperKeyOf(seed), family: view.birth.paper, size: SHARED_PAGE, pen });
  live.scene(true); // its tiles carry heights: the guess is laid in the scene
  const me = key.publicKey;
  let k = Math.max(0, ...view.lines.filter((l) => l.act.by === me).map((l) => l.act.k));
  let pending = 0; // strokes sent, not yet stamped
  let down = false;
  const send = (made) => api.post(`/api/shared/${view.sheet}/acts`, made);
  const tenths = (v) => Math.max(0, Math.round(v * 10));
  // a wax act, stamped or withdrawn (and told)
  const act = (kind, fields) =>
    withinStamp(send(SH.makeSharedAct({ sk: key.sk, pk: key.pk, sheet: view.sheet, k: ++k, act: kind, ...fields }))).catch((err) => {
      onNotice(err.timeout ? 'That was not stamped in time. Do it again.' : `That was not taken: ${err.message}`);
      return null;
    });
  const inside = (q) => q.x >= 0 && q.y >= 0 && q.x <= SHARED_PAGE.width && q.y <= SHARED_PAGE.height;
  async function strokeDone() {
    const strokes = live.capture.strokes;
    const last = strokes[strokes.length - 1];
    const bytes = last && strokesToActs([last], pen);
    if (!bytes) return;
    k += 1;
    const made = SH.makeSharedAct({ sk: key.sk, pk: key.pk, sheet: view.sheet, k, act: 'stroke', stroke: bytes });
    pending++;
    try {
      await withinStamp(send(made));
    } catch (err) {
      // withdrawn here (and told): your unstamped ink is lifted from this screen
      if (!down) live.clear();
      onNotice(err.timeout ? 'That stroke was not stamped in time: it is lifted here. Write it again.' : `That stroke was not taken: ${err.message}`);
    } finally {
      pending--;
    }
  }
  return {
    sheet: view.sheet,
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
    // the sheet as stamped now (its lines, and how many of them its grown field holds):
    // your count keeps up with acts of yours made elsewhere, and once everything you
    // sent is in the grown sheet, the guess can go
    settled(lines, grown) {
      k = Math.max(k, ...lines.filter((l) => l.act.by === me).map((l) => l.act.k));
      if (!pending && !down && live.strokes && grown >= lines.length) live.clear();
    },
    setColor: (hex) => live.setPen(lawPen({ nib: 'pen', size: PEN_SIZES.medium }, hex, undefined, SPATTER_DEFAULT.pen)),
    // lift your last stroke still in the window (rooms.md §6): a forward act, stamped like any other
    async lift(lines) {
      const mine = lines.filter((l) => l.act.act === 'stroke' && l.act.by === me);
      const lifted = new Set(lines.filter((l) => l.act.act === 'lift').map((l) => l.act.lift));
      const target = [...mine].reverse().find((l, i) => i < SH.LIFT_WINDOW && !lifted.has(l.n));
      if (!target) return onNotice('Nothing of yours left to lift here: older strokes have merged.');
      k += 1;
      await send(SH.makeSharedAct({ sk: key.sk, pk: key.pk, sheet: view.sheet, k, act: 'lift', lift: target.n })).catch((err) => onNotice(err.message));
      return undefined;
    },
    // the next count for an act of yours on this sheet (a move sent beside your strokes)
    nextK: () => ++k,
    // wax (rooms.md §3b): the stamper pressed at q (the sheet's units), a seal broken
    press(q, seal, { depth = 200, tiltX = 0, tiltY = 0, angle = 0, cell = SEAL_CELL } = {}) {
      return act('press', { press: { x: tenths(q.x), y: tenths(q.y), depth, angle, tiltX, tiltY, cell, w: seal.w, h: seal.h, face: seal.face, for: seal.key } });
    },
    breakSeal(n, at) {
      const r = (SEAL_CELL * 32) / 2 / CELLS; // across the impression, corner to corner (the sheet's units)
      return act('break', { broke: { seal: n, from: [tenths(at.x - r), tenths(at.y - r)], to: [tenths(at.x + r), tenths(at.y + r)] } });
    },
    destroy: () => live.destroy(),
  };
}

// A new shared sheet on your own table (rooms.md §5): your paper, open from birth.
export async function shareSheet(key, family) {
  const made = SH.makeSharedSheet({ sk: key.sk, pk: key.pk, sheet: K.newSheetId(), family });
  return api.post('/api/shared', made);
}
// Lay it on someone's table (by their name), or take it back to your own.
export async function moveSheet(key, view, toKey, k = Math.max(0, ...view.lines.filter((l) => l.act.by === key.publicKey).map((l) => l.act.k)) + 1) {
  return api.post(`/api/shared/${view.sheet}/acts`, SH.makeSharedAct({ sk: key.sk, pk: key.pk, sheet: view.sheet, k, act: 'move', to: toKey }));
}
export const keyOfName = async (name) => (await api.get(`/api/users/${encodeURIComponent(name)}`)).user?.publicKey ?? null;
