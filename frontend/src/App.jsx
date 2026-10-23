import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import Write from './pages/Write.jsx';
import Inbox from './pages/Inbox.jsx';
import HandStudio from './pages/HandStudio.jsx';
import NotFound from './pages/NotFound.jsx';
import BookViewer from './pages/BookViewer.jsx';
import Hand from './components/Hand.jsx';
import Username from './components/Username.jsx';
import WriteSpeed from './components/WriteSpeed.jsx';

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
      <main className={pathname.startsWith('/write') || pathname === '/hand' ? 'wide' : undefined}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/u/:username/:page" element={<Profile />} />
          <Route path="/book" element={<BookViewer />} />
          <Route path="/write" element={<Write />} />
          <Route path="/write/:username" element={<Write />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/hand" element={<HandStudio />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <footer className="site-foot">
        <WriteSpeed />
      </footer>
    </AuthProvider>
  );
}
