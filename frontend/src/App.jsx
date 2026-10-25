import { lazy, Suspense } from 'react';
import { Link, NavLink, useLocation, useRoutes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import { routesFor, pageAt } from './routes.js';
import World from './pages/World.jsx';
import Inbox from './pages/Inbox.jsx';
import NotFound from './pages/NotFound.jsx';
import BookViewer from './pages/BookViewer.jsx';
import Hand from './components/Hand.jsx';
import Username from './components/Username.jsx';
import WriteSpeed from './components/WriteSpeed.jsx';

// Dev-only tools (never in a production build; VITE_LABS=1 keeps them, for e2e/perf.mjs).
const LABS = import.meta.env.DEV || import.meta.env.VITE_LABS === '1';
const HandLab = LABS ? lazy(() => import('./lab/HandLab.jsx')) : null;
const LawCheck = LABS ? lazy(() => import('./lab/LawCheck.jsx')) : null;
const SceneCheck = LABS ? lazy(() => import('./lab/SceneCheck.jsx')) : null;
const PadCheck = LABS ? lazy(() => import('./lab/PadCheck.jsx')) : null;
const lab = (Page) => (
  <Suspense fallback={null}>
    <Page />
  </Suspense>
);
// What each address in routes.js opens.
const PAGES = {
  world: () => <World />,
  inbox: () => <Inbox />,
  book: () => <BookViewer />,
  'hand-lab': () => lab(HandLab),
  'law-check': () => lab(LawCheck),
  'scene-check': () => lab(SceneCheck),
  'pad-check': () => lab(PadCheck),
  'not-found': () => <NotFound />,
};

// You, your mailbox, and the way out, in that order.
function UserMenu() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;
  if (!user) return null;
  return (
    <>
      <Link to={`/u/${user.username}`} className="handle" title="Your house">
        <Username name={user.username} />
      </Link>
      <NavLink to="/inbox" className="mailbox-link">
        <Hand>mailbox</Hand>
      </NavLink>
      <button type="button" className="quiet logout" onClick={logout}>
        <Hand>log out</Hand>
      </button>
    </>
  );
}

// The world is the whole page (one-world.md): no header, no footer. The few
// pages outside it (the inbox, the .book viewer, the dev pages) keep the desk's.
export default function App() {
  const { pathname } = useLocation();
  const routes = useRoutes(routesFor({ labs: LABS }).map((r) => ({ path: r.path, element: PAGES[r.page]() })));
  const { page } = pageAt(pathname, { labs: LABS });
  return (
    <AuthProvider>
      {page === 'world' ? (
        <main className="world">{routes}</main>
      ) : (
        <>
          <header className="site-head">
            <div className="site-head-inner">
              <Link to="/" className="brand" aria-label="penpals: the world">
                <span className="stamp">
                  <Hand>penpals</Hand>
                </span>
              </Link>
              <nav className="nav">
                <UserMenu />
              </nav>
            </div>
            <div className="airmail" aria-hidden="true" />
          </header>
          <main className={['hand-lab', 'law-check'].includes(page) ? 'wide' : undefined}>{routes}</main>
          <footer className="site-foot">
            <WriteSpeed />
          </footer>
        </>
      )}
    </AuthProvider>
  );
}
