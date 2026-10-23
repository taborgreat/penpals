import { config } from '../config.js';

// The edit ops (books.md B5). Each changes the skeleton only; writing new ink
// is the one thing that touches the chain. `applyOp` changes `s` in place and
// returns anything the client should hear back (e.g. a new item's id).
//
//   add          page, ink, x, y, scale, color   place writing (returns item)
//   move         page, item, x, y
//   resize       page, item, scale
//   recolor      page, item, color
//   link         page, item, target_page         make it a button
//   unlink       page, item
//   remove       page, item
//   reorder      page, item, index               bring forward / send back
//   add_page     page_id, background
//   rename_page  page_id, new_id                 buttons pointing at it follow
//   remove_page  page_id                         buttons pointing at it unlink
//   background   page, color
//   signature    ink (or null to remove)         the signature is an ink ref
//   signature_color  color

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const PAGE_ID = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const COLOR = /^#[0-9a-f]{6}$/i;
const { pageWidth: W, pageHeight: H } = config.book;

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
function itemOf(page, id) {
  const index = page.items.findIndex((it) => it.id === id);
  if (index < 0) throw bad('That writing is not on this page.');
  return { item: page.items[index], index };
}

export async function applyOp(s, op, { hasInk }) {
  if (!op || typeof op !== 'object') throw bad('An edit needs an op.');
  switch (op.op) {
    case 'add': {
      const page = pageOf(s, op.page);
      if (page.items.length >= config.book.maxItemsPerPage) throw bad('This page is full.');
      if (typeof op.ink !== 'string' || !(await hasInk(op.ink))) throw bad('That ink is not in this book.');
      const item = {
        id: `i${s.nextItem++}`,
        ink: op.ink,
        x: num(op.x, -W, 2 * W, 'x'),
        y: num(op.y, -H, 2 * H, 'y'),
        scale: num(op.scale ?? 1, 0.05, 10, 'size'),
        color: color(op.color ?? '#1d2a44'),
      };
      page.items.push(item);
      return { item: item.id };
    }
    case 'move': {
      const { item } = itemOf(pageOf(s, op.page), op.item);
      item.x = num(op.x, -W, 2 * W, 'x');
      item.y = num(op.y, -H, 2 * H, 'y');
      return null;
    }
    case 'resize': {
      itemOf(pageOf(s, op.page), op.item).item.scale = num(op.scale, 0.05, 10, 'size');
      return null;
    }
    case 'recolor': {
      itemOf(pageOf(s, op.page), op.item).item.color = color(op.color);
      return null;
    }
    case 'link': {
      const { item } = itemOf(pageOf(s, op.page), op.item);
      const target = op.target_page ?? op.target;
      pageOf(s, target);
      item.link = { page: target };
      return null;
    }
    case 'unlink': {
      delete itemOf(pageOf(s, op.page), op.item).item.link;
      return null;
    }
    case 'remove': {
      const page = pageOf(s, op.page);
      page.items.splice(itemOf(page, op.item).index, 1);
      return null;
    }
    case 'reorder': {
      const page = pageOf(s, op.page);
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
      // Rebuild in the same order, under the new name.
      s.pages = Object.fromEntries(Object.entries(s.pages).map(([k, v]) => [k === from ? to : k, v]));
      if (s.home === from) s.home = to;
      for (const page of Object.values(s.pages)) {
        for (const it of page.items) if (it.link?.page === from) it.link.page = to;
      }
      return { page: to };
    }
    case 'remove_page': {
      const id = pageIdOf(op.page_id);
      pageOf(s, id);
      if (id === s.home) throw bad('The home page stays.');
      delete s.pages[id];
      for (const page of Object.values(s.pages)) {
        for (const it of page.items) if (it.link?.page === id) delete it.link;
      }
      return null;
    }
    case 'background': {
      pageOf(s, op.page).background = color(op.color);
      return null;
    }
    case 'signature': {
      if (op.ink === null) {
        s.signature = null;
        return null;
      }
      if (typeof op.ink !== 'string' || !(await hasInk(op.ink))) throw bad('That ink is not in this book.');
      s.signature = op.ink;
      if (op.color !== undefined) s.signatureColor = signatureColor(op.color);
      return null;
    }
    case 'signature_color': {
      if (!s.signature) throw bad('Sign your name first.');
      s.signatureColor = signatureColor(op.color);
      return null;
    }
    default:
      throw bad(`Unknown edit "${op.op}".`);
  }
}

function signatureColor(c) {
  if (!config.signatureColors.includes(c)) throw bad('Pick one of the signature colours.');
  return c;
}
