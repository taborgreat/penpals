// The shelf (rooms.md §3): a board on the left wall, the owner's books standing
// on it, spine out. Pull one down and it opens in front of you to flip through
// (the journal's pages on the table, the same sheet machinery). Which books
// stand there by default is Tabor's to rule; until then, the owner's own book.
// Pure geometry (room m), shared by the engine (drawing) and the view (what a
// click picks).

export const SHELF = { y0: 1.5, y1: 2.35, depth: 0.22, z: 1.4, thick: 0.03 };
export const BOOK = { width: 0.04, height: 0.235, depth: 0.165, gap: 0.006 };

// The board and each book's box [x0, y0, z0, x1, y1, z1], for `count` books
// standing from the shelf's window end.
// (joined to a room on its left, rooms.md §7: the shelf is on the right wall instead)
export function shelfLayout(geom, count) {
  const onRight = geom.join?.side === 'left';
  const wall = onRight ? (geom.mine?.x1 ?? geom.size[0]) : (geom.mine?.x0 ?? 0);
  const x0 = onRight ? wall - SHELF.depth : wall;
  const board = [x0, SHELF.y0, SHELF.z - SHELF.thick, x0 + SHELF.depth, SHELF.y1, SHELF.z];
  const books = Array.from({ length: Math.min(count, Math.floor((SHELF.y1 - SHELF.y0) / (BOOK.width + BOOK.gap))) }, (_, k) => {
    const y1 = SHELF.y1 - 0.02 - k * (BOOK.width + BOOK.gap);
    const bx = onRight ? wall - 0.01 - BOOK.depth : wall + 0.01;
    return [bx, y1 - BOOK.width, SHELF.z, bx + BOOK.depth, y1, SHELF.z + BOOK.height];
  });
  return { board, books };
}

// Where a ray (room m) first meets a box, or null: the slab test.
export function rayBox(o, d, b) {
  let lo = 0,
    hi = Infinity;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(d[k]) < 1e-12) {
      if (o[k] < b[k] || o[k] > b[k + 3]) return null;
      continue;
    }
    const t0 = (b[k] - o[k]) / d[k],
      t1 = (b[k + 3] - o[k]) / d[k];
    lo = Math.max(lo, Math.min(t0, t1));
    hi = Math.min(hi, Math.max(t0, t1));
  }
  return hi >= lo ? lo : null;
}
