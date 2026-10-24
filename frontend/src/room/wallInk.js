// Writing on a surface of the room (rooms.md §2): from Look, the pen pointed
// at a wall, the floor, the ceiling or the table: the same ray capture as
// writing on the page in 3D, onto that surface's plane. Each time the pen
// comes down on a surface with nothing being written there, a new sheet
// begins: the owner's own (its seed from their key, as any page's), on that
// surface's matter (plaster, wood: backend config.book.families), a pad of
// WALL_PAD page units centred where the pen first touched. What is written
// shows live as a mark on the surface (scene/marks.js); placed, it is
// settled, sealed and laid on the surface page at its record's own box, a
// sheet like any other in the book.

import { b64url } from 'penpals-law';
import { createLiveInk, CELLS } from '../ink/live.js';
import { newSheet, sealInk } from '../keys/session.js';
import { lawPen, SPATTER_DEFAULT } from '../ink/pens.js';
import { PEN_SIZES } from '../ink/nibs.js';

export const WALL_PAD = { width: 1024, height: 512 }; // page units: about 16 × 8 cm of wall

// writer: the key session (keys/session.js); family: the surface's; at: where the
// pen came down (the surface's page units); color: the ink (#rrggbb).
export function createWallInk({ writer, family, surface, at, color, nib = { nib: 'pen', size: PEN_SIZES.medium } }) {
  const sheet = newSheet(writer);
  const ink = createLiveInk({ paperKey: sheet.paperKey, family, size: WALL_PAD, pen: lawPen(nib, color, undefined, SPATTER_DEFAULT.pen) });
  const origin = [Math.round(at.x - WALL_PAD.width / 2), Math.round(at.y - WALL_PAD.height / 2)];
  const local = (p) => ({ x: p.x - origin[0], y: p.y - origin[1] });
  const inside = (q) => q.x >= 0 && q.y >= 0 && q.x <= WALL_PAD.width && q.y <= WALL_PAD.height;
  const edge = (q) => ({ x: Math.max(0, Math.min(WALL_PAD.width, q.x)), y: Math.max(0, Math.min(WALL_PAD.height, q.y)) });
  let down = false;
  let last = null;
  const mark = {
    id: `wall:${sheet.sheet}`,
    surface,
    origin,
    cellUnits: 1 / CELLS,
    box: [0, 0, WALL_PAD.width * CELLS, WALL_PAD.height * CELLS],
    live: { tiles: () => ink.tiles(), onTiles: (fn) => ink.onTiles(fn) },
  };
  // The pen on this sheet (SceneView's wallWriter, once this sheet is begun).
  const pen = {
    // → whether this sheet took the stroke (a stroke elsewhere is for a new sheet)
    down(where, p, ev, type) {
      if (where !== surface) return false;
      const q = local(p);
      if (!inside(q)) return false;
      down = true;
      last = q;
      ink.capture.down(q, ev, type);
      return true;
    },
    move(p, ev) {
      if (!down) return;
      const q = local(p);
      if (!inside(q)) {
        // off this sheet's pad: the stroke ends at its edge
        down = false;
        ink.capture.up(edge(q), ev);
        return;
      }
      last = q;
      ink.capture.move(q, ev);
    },
    up(p, ev) {
      if (!down) return;
      down = false;
      ink.capture.up(p ? edge(local(p)) : last, ev);
    },
    cancel() {
      if (!down) return;
      down = false;
      ink.capture.cancel();
    },
  };
  return {
    sheet,
    ink,
    mark,
    pen,
    surface,
    origin,
    get strokes() {
      return ink.strokes;
    },
    undo: () => ink.undo(),
    setColor: (hex) => ink.setPen(lawPen(nib, hex, undefined, SPATTER_DEFAULT.pen)),
    // Settle, seal and lay it on the surface: addInk(line, seed, place) (book/useBook.js).
    async place(addInk) {
      const settled = await ink.settle();
      if (!settled?.box[2]) throw new Error('Nothing to place yet.');
      const { line } = sealInk(writer, { sheet: sheet.sheet, seed: sheet.seed, use: 'book', family, settled });
      const [bx, by] = settled.box;
      return addInk(line, b64url(sheet.seed), { surface, x: origin[0] + bx / CELLS, y: origin[1] + by / CELLS, scale: 64 });
    },
    destroy: () => ink.destroy(),
  };
}
