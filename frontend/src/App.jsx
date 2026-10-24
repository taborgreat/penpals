import { lazy, Suspense } from 'react';
import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import Write from './pages/Write.jsx';
import Inbox from './pages/Inbox.jsx';
import HandStudio from './pages/HandStudio.jsx';
import NotFound from './pages/NotFound.jsx';
import BookViewer from './pages/BookViewer.jsx';
import Proofs from './pages/Proofs.jsx';
import Hand from './components/Hand.jsx';
import Username from './components/Username.jsx';
import WriteSpeed from './components/WriteSpeed.jsx';

// Dev-only tools (never in a production build; VITE_LABS=1 keeps them, for e2e/perf.mjs).
const LABS = import.meta.env.DEV || import.meta.env.VITE_LABS === '1';
const HandLab = LABS ? lazy(() => import('./lab/HandLab.jsx')) : null;
const LawCheck = LABS ? lazy(() => import('./lab/LawCheck.jsx')) : null;
const SceneCheck = LABS ? lazy(() => import('./lab/SceneCheck.jsx')) : null;
const PadCheck = LABS ? lazy(() => import('./lab/PadCheck.jsx')) : null;

// You, your mailbox, and the way out, in that order.
function UserMenu() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;
  if (!user) return null;
  return (
    <>
      <Link to={`/u/${user.username}`} className="handle" title="Your profile"><Username name={user.username} /></Link>
      <NavLink to="/inbox" className="mailbox-link"><Hand>mailbox</Hand></NavLink>
      <button type="button" className="quiet logout" onClick={logout}><Hand>log out</Hand></button>
    </>
  );
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <AuthProvider>
      <header className="site-head">
        <div className="site-head-inner">
          <Link to="/" className="brand" aria-label="penpals home: the scripters"><span className="stamp"><Hand>penpals</Hand></span></Link>
          {/* The one thing to do here: write. Everything about you is on the right. */}
          <NavLink to="/write" className="write-cta"><Hand>Write</Hand></NavLink>
          <nav className="nav">
            <UserMenu />
          </nav>
        </div>
        <div className="airmail" aria-hidden="true" />
      </header>
      <main className={pathname.startsWith('/write') || ['/hand', '/hand-lab', '/law-check'].includes(pathname) ? 'wide' : undefined}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/u/:username/:page" element={<Profile />} />
          <Route path="/book" element={<BookViewer />} />
          <Route path="/proofs" element={<Proofs />} />
          <Route path="/write" element={<Write />} />
          <Route path="/write/:username" element={<Write />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/hand" element={<HandStudio />} />
          {HandLab && <Route path="/hand-lab" element={<Suspense fallback={null}><HandLab /></Suspense>} />}
          {LawCheck && <Route path="/law-check" element={<Suspense fallback={null}><LawCheck /></Suspense>} />}
          {SceneCheck && <Route path="/scene-check" element={<Suspense fallback={null}><SceneCheck /></Suspense>} />}
          {PadCheck && <Route path="/pad-check" element={<Suspense fallback={null}><PadCheck /></Suspense>} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-foot">
        <WriteSpeed />
      </footer>
    </AuthProvider>
  );
}
