import { config } from '../config.js';

// The edit ops (books.md B5, as Living Ink changed them). Each changes the
// skeleton only; layout is not a mark, so it is not sealed. Writing is the one
// thing that touches the chain. `applyOp` changes `s` in place and returns
// anything the client should hear back (e.g. a new item's id).
//
// Ink is placed on a page, or on one of the room's surfaces (rooms.md §1: a
// wall, the floor, the ceiling or the table top is a page of the book too):
// the ops that place, move and take away items name either `page` or `surface`.
//
//   add          page | surface, ink, x, y, scale   place book ink (returns item)
//   move         page, item, x, y
//   resize       page, item, scale              scale: integer, 1/64 units (64 = 1×)
//   link         page, item, target_page | target_surface | target_room
//                                              make it a button (a door, rooms.md §3): to a page,
//                                              to one of the room's surfaces, or into someone's room
//   unlink       page, item
//   remove       page, item
//   reorder      page, item, index              bring forward / send back
//   add_page     page_id, background
//   rename_page  page_id, new_id                buttons pointing at it follow
//   remove_page  page_id                        buttons pointing at it unlink
//   background   page, color
//   rule         page, spacing                  its lines this many page px apart (0: none)
//   family       grain, weight                  the paper family new sheets are written on
//   signature    ink                            (internal: set when a signature lands)
//
// There is no recolor: colour is pigment in the sealed acts, chosen on the pen.

const bad = (message) => Object.assign(new Error(message), { status: 400, code: 'bad_edit' });
const PAGE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const { pageWidth: W, pageHeight: H } = config.book;
export const SCALE = { min: 4, max: 640, one: 64 };

const num = (v, lo, hi, what) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw bad(`Bad ${what}.`);
  return Math.round(v * 100) / 100;
};
const color = (v) => {
  if (typeof v !== 'string' || !COLOR.test(v)) throw bad('Colours are #rrggbb.');
  return v.toLowerCase();
};
const pageIdOf = (v) => {
  if (typeof v !== 'string' || !PAGE_ID.test(v)) throw bad('Page names are 1-40 lowercase letters, numbers and dashes.');
  return v;
};
function pageOf(s, id) {
  const page = s.pages[id];
  if (!page) throw bad(`There is no page "${id}".`);
  return page;
}
// What an op places on: { items, w, h } of a page or a surface (surfaces have their own size).
function holderOf(s, op) {
  if (op.surface === undefined) return { items: pageOf(s, op.page).items, w: W, h: H };
  const surface = typeof op.surface === 'string' && Object.hasOwn(s.surfaces ?? {}, op.surface) ? s.surfaces[op.surface] : null;
  if (!surface) throw bad(`There is no surface "${op.surface}".`);
  return { items: surface.items, w: surface.size[0], h: surface.size[1] };
}
// Every item in the book, on its pages and on its surfaces.
export function* allItems(s) {
  for (const page of Object.values(s.pages)) yield* page.items;
  for (const surface of Object.values(s.surfaces ?? {})) yield* surface.items;
}
// The room's surfaces as a new book has them (backend config.book.surfaces): each
// with its matter's paper family and size, and nothing on it yet.
export const blankSurfaces = () =>
  Object.fromEntries(Object.entries(config.book.surfaces).map(([id, { matter, size }]) => [id, { matter, family: { ...config.book.families[matter] }, size: [...size], items: [] }]));
// The paper family ink must be written on to be placed by `op` (a surface's own, or the book's).
export const familyFor = (s, op) => (op?.surface !== undefined ? (s.surfaces?.[op.surface]?.family ?? null) : s.paperFamily);
function itemOf(page, id) {
  const index = page.items.findIndex((it) => it.id === id);
  if (index < 0) throw bad('That writing is not on this page.');
  return { item: page.items[index], index };
}

// An integer scale whose re-derived look stays within the render cap.
export function scaleFor(body, v) {
  if (!Number.isInteger(v) || v < SCALE.min || v > SCALE.max) throw bad(`A size is a whole number from ${SCALE.min} to ${SCALE.max} (64 is as written).`);
  const [, , w, h] = body.box;
  const cells = Math.ceil((w * v) / SCALE.one) * Math.ceil((h * v) / SCALE.one);
  if (cells > config.render.maxCells) throw bad('That writing cannot be shown that large.');
  return v;
}

export async function applyOp(s, op, { inkBody, roomOf = async () => false }) {
  if (!op || typeof op !== 'object') throw bad('An edit needs an op.');
  switch (op.op) {
    case 'add': {
      const page = holderOf(s, op);
      if (page.items.length >= config.book.maxItemsPerPage) throw bad('This page is full.');
      const body = typeof op.ink === 'string' ? await inkBody(op.ink) : null;
      if (!body || body.use !== 'book') throw bad('That is not writing from this book.');
      const item = {
        id: `i${s.nextItem++}`,
        ink: op.ink,
        x: num(op.x, -page.w, 2 * page.w, 'x'),
        y: num(op.y, -page.h, 2 * page.h, 'y'),
        scale: scaleFor(body, op.scale ?? SCALE.one),
      };
      page.items.push(item);
      return { item: item.id };
    }
    case 'move': {
      const page = holderOf(s, op);
      const { item } = itemOf(page, op.item);
      item.x = num(op.x, -page.w, 2 * page.w, 'x');
      item.y = num(op.y, -page.h, 2 * page.h, 'y');
      return null;
    }
    case 'resize': {
      const { item } = itemOf(holderOf(s, op), op.item);
      item.scale = scaleFor(await inkBody(item.ink), op.scale);
      return null;
    }
    case 'link': {
      const { item } = itemOf(holderOf(s, op), op.item);
      if (op.target_surface !== undefined) {
        if (typeof op.target_surface !== 'string' || !Object.hasOwn(s.surfaces ?? {}, op.target_surface)) throw bad(`There is no surface "${op.target_surface}".`);
        item.link = { surface: op.target_surface };
      } else if (op.target_room !== undefined) {
        if (typeof op.target_room !== 'string' || !config.auth.username.test(op.target_room) || !(await roomOf(op.target_room))) throw bad('There is no such room.');
        item.link = { room: op.target_room.toLowerCase() };
      } else {
        const target = op.target_page ?? op.target;
        pageOf(s, target);
        item.link = { page: target };
      }
      return null;
    }
    case 'unlink': {
      delete itemOf(holderOf(s, op), op.item).item.link;
      return null;
    }
    case 'remove': {
      const page = holderOf(s, op);
      page.items.splice(itemOf(page, op.item).index, 1);
      return null;
    }
    case 'reorder': {
      const page = holderOf(s, op);
      const { item, index } = itemOf(page, op.item);
      const to = Math.round(num(op.index, -1e6, 1e6, 'position'));
      page.items.splice(index, 1);
      page.items.splice(Math.max(0, Math.min(page.items.length, to)), 0, item);
      return null;
    }
    case 'add_page': {
      const id = pageIdOf(op.page_id);
      if (s.pages[id]) throw bad(`There is already a page "${id}".`);
      if (Object.keys(s.pages).length >= config.book.maxPages) throw bad('This book has as many pages as it can hold.');
      s.pages[id] = { background: color(op.background ?? config.book.defaultBackground), items: [] };
      return { page: id };
    }
    case 'rename_page': {
      const from = pageIdOf(op.page_id);
      const to = pageIdOf(op.new_id);
      pageOf(s, from);
      if (from === to) return { page: to };
      if (s.pages[to]) throw bad(`There is already a page "${to}".`);
      s.pages = Object.fromEntries(Object.entries(s.pages).map(([k, v]) => [k === from ? to : k, v]));
      if (s.home === from) s.home = to;
      for (const it of allItems(s)) if (it.link?.page === from) it.link.page = to;
      return { page: to };
    }
    case 'remove_page': {
      const id = pageIdOf(op.page_id);
      pageOf(s, id);
      if (id === s.home) throw bad('The home page stays.');
      delete s.pages[id];
      for (const it of allItems(s)) if (it.link?.page === id) delete it.link;
      return null;
    }
    case 'background': {
      pageOf(s, op.page).background = color(op.color);
      return null;
    }
    case 'rule': {
      const sp = op.spacing;
      if (!Number.isInteger(sp) || (sp !== 0 && (sp < 10 || sp > 400))) throw bad('A page is ruled 10 to 400 px apart, or not at all.');
      const page = pageOf(s, op.page);
      if (sp) page.rule = sp;
      else delete page.rule;
      return null;
    }
    case 'family': {
      const g = op.grain,
        w = op.weight;
      if (!Number.isInteger(g) || g < 0 || g > 15 || !Number.isInteger(w) || w < 0 || w > 15) throw bad('A paper family is grain and weight, 0 to 15 each.');
      s.paperFamily = { grain: g, weight: w, tooth: 0 };
      return null;
    }
    case 'signature': {
      const body = await inkBody(op.ink);
      if (!body || body.use !== 'signature') throw bad('That is not a signature.');
      s.signature = op.ink;
      return null;
    }
    default:
      throw bad(`Unknown edit "${op.op}".`);
  }
}

// Ops a client may send as micro edits (the rest are internal).
export const CLIENT_OPS = new Set(['add', 'move', 'resize', 'link', 'unlink', 'remove', 'reorder', 'add_page', 'rename_page', 'remove_page', 'background', 'rule', 'family']);
