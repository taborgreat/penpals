import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import AuthForm from '../components/AuthForm.jsx';
import LetterView from '../components/LetterView.jsx';

export default function Home() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState(null);
  const [top, setTop] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/api/users').then((d) => setUsers(d.users)).catch((err) => setError(err.message));
    api.get('/api/letters/top').then((d) => setTop(d.letters)).catch(() => setTop([]));
  }, [user]);

  return (
    <>
      <h1>penpals</h1>
      <p className="muted">Every letter is handwritten. Photograph your page; only the ink travels.</p>
      {!loading && !user && <AuthForm />}

      <h2>Scripters</h2>
      {error && <p className="error">{error}</p>}
      {users && users.length === 0 && <p className="muted">Nobody yet. Register and be the first.</p>}
      {users && (
        <ul className="plain">
          {users.map((u) => (
            <li key={u.username}>
              <Link to={`/u/${u.username}`}>@{u.username}</Link>{' '}
              <span className="muted">{u.lettersSent} sent · {u.savedCount} kept</span>
            </li>
          ))}
        </ul>
      )}

      {top.length > 0 && (
        <>
          <h2>Top letters</h2>
          {top.map((l) => (
            <div key={l.id} className="stack">
              <LetterView letter={l} />
              <p className="muted">by <Link to={`/u/${l.from}`}>@{l.from}</Link> · ▲ {l.upvotes}</p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
