import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import Write from './pages/Write.jsx';
import Inbox from './pages/Inbox.jsx';
import HandStudio from './pages/HandStudio.jsx';
import Hand from './components/Hand.jsx';
import Username from './components/Username.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';

function UserMenu() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;
  if (!user) return <span className="muted">not logged in</span>;
  return (
    <span className="user-menu">
      <Link to={`/u/${user.username}`} className="handle"><Username name={user.username} /></Link>
      <button type="button" className="quiet" onClick={logout}><Hand>log out</Hand></button>
    </span>
  );
}

export default function App() {
  const { pathname } = useLocation();
  return (
    <AuthProvider>
      <header className="site-head">
        <div className="site-head-inner">
          <Link to="/" className="brand" aria-label="penpals home"><span className="stamp"><Hand>penpals</Hand></span></Link>
          <nav className="nav">
            <NavLink to="/" end><Hand>scripters</Hand></NavLink>
            <NavLink to="/write"><Hand>write</Hand></NavLink>
            <NavLink to="/inbox"><Hand>mailbox</Hand></NavLink>
          </nav>
          <UserMenu />
          <ThemeToggle />
        </div>
        <div className="airmail" aria-hidden="true" />
      </header>
      <main className={pathname.startsWith('/write') || pathname === '/hand' ? 'wide' : undefined}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/write" element={<Write />} />
          <Route path="/write/:username" element={<Write />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/hand" element={<HandStudio />} />
          <Route path="*" element={<p>Nothing here.</p>} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
