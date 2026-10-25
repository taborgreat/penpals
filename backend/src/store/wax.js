// The drips that landed on a shared sheet (matter-fixes.md §2), regrown here as
// anyone regrows them: law/wax.js over the signed acts of every room the sheet lay
// in (store/rooms.js), landed by the client's own table (frontend room/table.js,
// drops.js: pure) on its book's page. Whether a seal took is the sheet grown with
// them (store/shared.js). Each room's candles are kept going here as its chain grows.

import { wax as WX } from 'penpals-law';
import { roomGeometry, ROOM } from '../../../frontend/src/scene/light/room.js';
import { waxContext } from '../../../frontend/src/room/table.js';
import { config } from '../config.js';
import { findByKey } from './accounts.js';
import { roomLines } from './rooms.js';

const GEOM = roomGeometry(ROOM);
const PAGE = [config.book.pageWidth, config.book.pageHeight];
const candles = new Map(); // ownerId → its room's candles (law/wax.js createRoomWax), carried on

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
    if (!candles.has(owner.id)) candles.set(owner.id, WX.createRoomWax(waxContext({ geom: GEOM, page: PAGE })));
    const drips = candles.get(owner.id).advance(lines, until);
    out.push(...WX.dripsOn(drips, s.sheet, s.born));
  }
  return out.sort((a, b) => a.t - b.t);
}
