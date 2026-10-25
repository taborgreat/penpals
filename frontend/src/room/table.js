// The room's table as the law's drips land on it (matter-fixes.md §2): where each
// shared sheet lies, and what is under a falling drip. Pure (no DOM): the backend
// lands drips with this same code (store/shared.js: whether a seal took), so a
// drip falls on the same sheet, the same spot, for everyone.

import { wax as WX } from 'penpals-law';
import { landing, wickOf } from './drops.js';
import { PX_PER_M } from '../scene/light/index.js';

export const SHARED_PAGE = { width: 800, height: 600 }; // page units: a shared sheet
const GAP = 60; // page units between the table's sheets and the page

// Where the shared sheet in slot i lies on the table, in the frame of a page `pageW`
// wide (page px): across the table beyond the page (the candles stand beside it),
// the first straight ahead, then left and right of it, row behind row.
export function slotOf(i, pageW = 1000) {
  const col = [0, -1, 1][i % 3];
  const row = Math.floor(i / 3) + 1;
  return [(pageW - SHARED_PAGE.width) / 2 + col * (SHARED_PAGE.width + GAP), -row * (SHARED_PAGE.height + GAP)];
}

// Which sheets lie on the table, and in which slot, from the room's chain (its lay
// lines: { kind: 'lay', sheet, slot }, slot null when it left). → [{ sheet, slot }]
export function lyingOn(lines) {
  const at = new Map();
  for (const l of lines) {
    if (l.kind !== 'lay') continue;
    if (l.slot === null) at.delete(l.sheet);
    else at.set(l.sheet, l.slot);
  }
  return [...at].map(([sheet, slot]) => ({ sheet, slot })).sort((a, b) => a.slot - b.slot);
}
// The first slot no sheet lies in.
export const freeSlot = (lying) => {
  let i = 0;
  while (lying.some((s) => s.slot === i)) i++;
  return i;
};

// A page `page` ([w, h] page px) on the room's table: where its page px (0, 0, 0) is
// (room m), centred on the room's page (light.js originOf).
export const originIn = (geom, [pageW, pageH]) => {
  const r = geom.pageRect;
  return [(r.x0 + r.x1) / 2 - pageW / 2 / PX_PER_M, (r.y0 + r.y1) / 2 + pageH / 2 / PX_PER_M, geom.pageOrigin[2]];
};

// What the law needs to regrow a room's drips (law/wax.js dripsOf): the room's clock,
// the wick of a tilted candle, and what is under a point given the sheets lying there.
export function waxContext({ geom, page, timeZone = null }) {
  const origin = originIn(geom, page);
  return {
    night: WX.nightIn(timeZone),
    wickOf,
    landing: (p, lying) => landing(geom, p, { origin, sheets: lying.map((s) => ({ sheet: s.sheet, origin: slotOf(s.slot, page[0]), size: [SHARED_PAGE.width, SHARED_PAGE.height] })) }),
  };
}
