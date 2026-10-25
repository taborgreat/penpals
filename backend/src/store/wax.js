// The drips that landed on a shared sheet (matter-fixes.md §2), regrown here as
// anyone regrows them: law/wax.js over the chain of every room the sheet lay in
// (store/rooms.js), landed by the client's own table (frontend room/table.js,
// drops.js: pure), on the room's clock (its owner's zone) and its book's page.
// Whether a seal took is the sheet grown with them (store/shared.js).

import { wax as WX } from 'penpals-law';
import { roomGeometry, ROOM } from '../../../frontend/src/scene/light/room.js';
import { waxContext } from '../../../frontend/src/room/table.js';
import { config } from '../config.js';
import { findByKey } from './accounts.js';
import { roomLines } from './rooms.js';

const GEOM = roomGeometry(ROOM);
const PAGE = [config.book.pageWidth, config.book.pageHeight];

// s: a shared sheet (store/shared.js: owner key, born, lines). → its drips as its record
// takes them ([{ t (ms from its birth), x, y, amt, heat }]), up to `until` (ms).
export async function dripsOnSheet(s, until = Date.now()) {
  const tables = new Set([s.owner, ...s.lines.filter((l) => l.act.act === 'move').map((l) => l.act.to)]);
  const out = [];
  for (const key of tables) {
    const owner = findByKey(key);
    if (!owner) continue;
    const lines = await roomLines(owner.id);
    if (!lines.some((l) => l.kind === 'lay' && l.sheet === s.sheet)) continue; // never on that table
    const drips = WX.dripsOf(lines, { ...waxContext({ geom: GEOM, page: PAGE, timeZone: owner.settings?.timeZone ?? null }), until });
    out.push(...WX.dripsOn(drips, s.sheet, s.born));
  }
  return out.sort((a, b) => a.t - b.t);
}
