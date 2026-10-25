import { matchRoutes } from 'react-router-dom';

// The site's addresses (one-world.md): the whole site is one page, the world.
// `/` is the lobby until you are in, then your house; `/u/<name>` opens the
// world at that person's house. Outside the world: the inbox (until letters
// are ruled), the .book viewer (until it is ruled in or out of the world), and
// the dev pages. Anything else is not a page.
export const ROUTES = [
  { path: '/', page: 'world' },
  { path: '/u/:username', page: 'world' },
  { path: '/inbox', page: 'inbox' },
  { path: '/book', page: 'book' },
  { path: '/hand-lab', page: 'hand-lab', lab: true },
  { path: '/law-check', page: 'law-check', lab: true },
  { path: '/scene-check', page: 'scene-check', lab: true },
  { path: '/pad-check', page: 'pad-check', lab: true },
  { path: '*', page: 'not-found' },
];

export const routesFor = ({ labs }) => ROUTES.filter((r) => labs || !r.lab);

// Which page an address opens, and its params.
export function pageAt(pathname, { labs = false } = {}) {
  const m = matchRoutes(routesFor({ labs }), pathname)?.at(-1);
  return { page: m?.route.page ?? 'not-found', params: m?.params ?? {} };
}
