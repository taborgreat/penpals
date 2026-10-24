import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import AuthPanel from '../components/AuthPanel.jsx';
import LetterView from '../components/LetterView.jsx';
import Hand from '../components/Hand.jsx';
import HandNumber from '../components/HandNumber.jsx';
import Username from '../components/Username.jsx';

export default function Home() {
  const { user, loading } = useAuth();
  const [users, setUsers] = useState(null);
  const [top, setTop] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .get('/api/users')
      .then((d) => setUsers(d.users))
      .catch((err) => setError(err.message));
    api
      .get('/api/letters/top')
      .then((d) => setTop(d.letters))
      .catch(() => setTop([]));
  }, [user]);

  return (
    <>
      <div className="hero">
        <h1>
          <Hand>Letters,</Hand>{' '}
          <em>
            <Hand>by hand.</Hand>
          </em>
        </h1>
        <p className="lede">
          <Hand>Every letter is handwritten.</Hand> <Hand>Only the ink travels.</Hand>
        </p>
      </div>
      {!loading && !user && <AuthPanel />}

      <h2>
        <Hand>Scripters</Hand>
      </h2>
      {error && <p className="error">{error}</p>}
      {users && users.length === 0 && <p className="muted">Nobody yet. Register and be the first.</p>}
      {users && (
        <ul className="people">
          {users.map((u) => (
            <li key={u.username}>
              <Link to={`/u/${u.username}`}>
                <Username name={u.username} />
              </Link>
              <span className="meta stats">
                <HandNumber value={u.lettersSent} /> <Hand name="sent-count">sent</Hand> · <HandNumber value={u.savedCount} /> <Hand name="kept-count">kept</Hand>
              </span>
            </li>
          ))}
        </ul>
      )}

      {top.length > 0 && (
        <>
          <h2>
            <Hand>Top letters</Hand>
          </h2>
          {top.map((l) => (
            <div key={l.id} className="stack">
              <LetterView letter={l} />
              <p className="meta">
                by{' '}
                <Link to={`/u/${l.from}`}>
                  <Username name={l.from} />
                </Link>{' '}
                · ▲ <HandNumber value={l.upvotes} />
              </p>
            </div>
          ))}
        </>
      )}
    </>
  );
}
