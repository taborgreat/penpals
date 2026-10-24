// The edit ops (books.md B5), applied on the client so the owner sees an edit
// at once; the server applies the same op to the real skeleton and has the
// last word (backend/src/store/ops.js). Returns a new skeleton. There is no
// recolour: colour is pigment in the sealed strokes.

export function applyLocal(skeleton, op) {
  const s = structuredClone(skeleton);
  const page = s.pages[op.page];
  const item = page?.items.find((it) => it.id === op.item);
  switch (op.op) {
    case 'add':
      page.items.push({ id: op.id, ink: op.ink, x: op.x, y: op.y, scale: op.scale });
      break;
    case 'move':
      Object.assign(item, { x: op.x, y: op.y });
      break;
    case 'resize':
      item.scale = op.scale;
      break;
    case 'link':
      item.link = { page: op.target_page };
      break;
    case 'unlink':
      delete item.link;
      break;
    case 'remove':
      page.items = page.items.filter((it) => it.id !== op.item);
      break;
    case 'reorder': {
      const from = page.items.indexOf(item);
      page.items.splice(from, 1);
      page.items.splice(Math.max(0, Math.min(page.items.length, op.index)), 0, item);
      break;
    }
    case 'add_page':
      s.pages[op.page_id] = { background: op.background, items: [] };
      break;
    case 'rename_page':
      s.pages = Object.fromEntries(Object.entries(s.pages).map(([k, v]) => [k === op.page_id ? op.new_id : k, v]));
      if (s.home === op.page_id) s.home = op.new_id;
      for (const p of Object.values(s.pages)) for (const it of p.items) if (it.link?.page === op.page_id) it.link.page = op.new_id;
      break;
    case 'remove_page':
      delete s.pages[op.page_id];
      for (const p of Object.values(s.pages)) for (const it of p.items) if (it.link?.page === op.page_id) delete it.link;
      break;
    case 'background':
      page.background = op.color;
      break;
    case 'family':
      s.paperFamily = { grain: op.grain, weight: op.weight, tooth: 0 };
      break;
    case 'signature':
      s.signature = op.ink;
      break;
    default:
      break;
  }
  return s;
}

// A page id from whatever someone typed: "My Poems!" → "my-poems".
export const pageIdFrom = (text) =>
  String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
