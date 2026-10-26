// The house's surfaces, matter you write on (rooms.md §1, §2): each wall, the
// floor, the ceiling, the table top and the pen's body holds ink like paper, in its
// own page frame: x to the right and y down as seen from in front of it (from
// the seat, for the table and the floor; looking up toward the window, for the
// ceiling), in page units (1400 a letter's width: light/room.js PX_PER_M a
// metre), its origin the top left corner. So writing on any of them reads the
// right way round in its own record, the same as on paper.
//
// Pure geometry over the room's shape (light/room.js roomGeometry). The surface
// ids are law/paper.js SURFACES'; a room surface of the light's geometry belongs
// to one of them (the table's top is the table; its edges and underside are not
// written on).

import { PX_PER_M } from './light/index.js';
import { HOUSE } from 'penpals-law/room';

export const SURFACE_IDS = ['table', 'wall-far', 'wall-near', 'wall-left', 'wall-right', 'floor', 'ceiling'];
// The book's surfaces on the room's things, not on the room (each where its thing lies).
export const THING_SURFACE_IDS = ['pen'];

// The room surface (light/room.js surfaces[].id) each book surface lies on.
export const ROOM_SURFACE = { table: 'table-top', 'wall-far': 'wall-far', 'wall-near': 'wall-near', 'wall-left': 'wall-left', 'wall-right': 'wall-right', floor: 'floor', ceiling: 'ceiling' };
// The grown cells' seed name each one uses (light/surface.js DEFAULT_SEEDS).
// (The pen is cut from the table's wood.)
export const SEED_NAME = (roomSurfaceId) => (roomSurfaceId.startsWith('table') || roomSurfaceId === 'pen' ? 'table' : roomSurfaceId);

// The pen (rooms.md §3c) is matter written on too: its top face, wherever it lies set down (its
// place: room m, the middle of its foot, lying along x, its nib to the right). Its place
// is a room fact (place acts); the view says where it is now.
export const PEN_FACE = HOUSE.pen; // (law/room.js: its size the law's)
let penPlace = null;
export const setPenPlace = (p) => {
  penPlace = p ? [...p] : null;
};

const X = [1, 0, 0],
  Y = [0, 1, 0],
  Z = [0, 0, 1];
const neg = (a) => a.map((v) => -v);

// A surface's page frame in the room: { id, origin (m), right, down, normal (units),
// size [w, h] (m), units [w, h] (page units) }.
export function surfaceFrame(geom, id) {
  const [W, D, H] = geom.size;
  const t = geom.table;
  const f = {
    'wall-far': { origin: [0, D, H], right: X, down: neg(Z), normal: neg(Y), size: [W, H] },
    'wall-near': { origin: [W, 0, H], right: neg(X), down: neg(Z), normal: Y, size: [W, H] },
    'wall-left': { origin: [0, 0, H], right: Y, down: neg(Z), normal: X, size: [D, H] },
    'wall-right': { origin: [W, D, H], right: neg(Y), down: neg(Z), normal: neg(X), size: [D, H] },
    floor: { origin: [0, D, 0], right: X, down: neg(Y), normal: Z, size: [W, D] },
    ceiling: { origin: [W, D, H], right: neg(X), down: neg(Y), normal: neg(Z), size: [W, D] },
    table: { origin: [t.x0, t.y1, t.top], right: X, down: neg(Y), normal: Z, size: [t.x1 - t.x0, t.y1 - t.y0] },
    pen: penPlace
      ? { origin: [penPlace[0] - PEN_FACE.length / 2, penPlace[1] + PEN_FACE.thick / 2, penPlace[2] + PEN_FACE.thick], right: X, down: neg(Y), normal: Z, size: [PEN_FACE.length, PEN_FACE.thick] }
      : null,
  }[id];
  if (!f) return null;
  return { id, ...f, units: f.size.map((v) => Math.round(v * PX_PER_M)) };
}

// A point of a surface's page (page units) → the room (m), `lift` m off it.
export const toRoom = (f, [x, y], lift = 0) => [0, 1, 2].map((k) => f.origin[k] + (f.right[k] * x + f.down[k] * y) / PX_PER_M + f.normal[k] * lift);
// A room point → the surface's page (page units), and how far off it.
export function fromRoom(f, p) {
  const d = [0, 1, 2].map((k) => p[k] - f.origin[k]);
  const dot = (a) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return { x: dot(f.right) * PX_PER_M, y: dot(f.down) * PX_PER_M, off: dot(f.normal) };
}
export const onSurface = (f, { x, y }) => x >= 0 && y >= 0 && x <= f.units[0] && y <= f.units[1];

// Which book surface a hit on the room's geometry (light/room.js hit's
// `surface` index) is on: an id, or null (the table's edges, its underside).
export function surfaceOfHit(geom, surfaceIndex) {
  const s = geom.surfaces[surfaceIndex];
  if (!s) return null;
  return Object.keys(ROOM_SURFACE).find((id) => ROOM_SURFACE[id] === s.id) ?? null;
}
