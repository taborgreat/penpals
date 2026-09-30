import { Routes, Route, Link, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.jsx';
import Home from './pages/Home.jsx';
import Profile from './pages/Profile.jsx';
import Write from './pages/Write.jsx';
import Inbox from './pages/Inbox.jsx';

function UserMenu() {
  const { user, loading, logout } = useAuth();
  if (loading) return null;
  if (!user) return <span className="muted">not logged in</span>;
  return (
    <span>
      <Link to={`/u/${user.username}`}>@{user.username}</Link>{' '}
      <button type="button" onClick={logout}>log out</button>
    </span>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <header className="nav">
        <Link to="/" className="brand">penpals</Link>
        <NavLink to="/" end>scripters</NavLink>
        <NavLink to="/write" end>write</NavLink>
        <NavLink to="/inbox">mailbox</NavLink>
        <UserMenu />
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/u/:username" element={<Profile />} />
          <Route path="/write" element={<Write />} />
          <Route path="/write/:username" element={<Write />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="*" element={<p>Nothing here.</p>} />
        </Routes>
      </main>
    </AuthProvider>
  );
}
