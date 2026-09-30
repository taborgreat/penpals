import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { timeAgo, timeLeft } from '../format.js';
import LetterView from '../components/LetterView.jsx';

export default function Inbox() {
  const { user, loading } = useAuth();
  const [inbox, setInbox] = useState([]);
  const [sent, setSent] = useState([]);
  const [current, setCurrent] = useState(null); // the letter being read
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api.get('/api/letters/inbox'), api.get('/api/letters/sent')]);
      setInbox(a.letters);
      setSent(b.letters);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  async function open(letter) {
    if (!letter.openedAt && !window.confirm('Opening a letter starts its 24-hour timer. Open it now?')) return;
    setError(null);
    try {
      const d = await api.post(`/api/letters/${letter.id}/open`);
      setCurrent(d.letter);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleSave(letter) {
    setError(null);
    try {
      if (letter.savedByMe) await api.del(`/api/letters/${letter.id}/save`);
      else await api.post(`/api/letters/${letter.id}/save`);
      const d = await api.get(`/api/letters/${letter.id}`);
      setCurrent(d.letter);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return null;
  if (!user) return <p>Log in to see your mailbox.</p>;

  return (
    <>
      <h1>Mailbox</h1>
      {error && <p className="error">{error}</p>}

      {current && (
        <div className="stack">
          <p>
            from <Link to={`/u/${current.from}`}>@{current.from}</Link> · opened {timeAgo(current.openedAt)} ·
            disappears in {timeLeft(current.expiresAt)}
          </p>
          <LetterView letter={current} />
          <div className="row">
            <button type="button" onClick={() => toggleSave(current)}>
              {current.savedByMe ? 'Remove from my profile' : 'Keep on my profile'}
            </button>
            <button type="button" onClick={() => setCurrent(null)}>Close</button>
          </div>
        </div>
      )}

      <h2>For you</h2>
      {inbox.length === 0 && <p className="muted">No letters waiting.</p>}
      <ul className="plain">
        {inbox.map((l) => (
          <li key={l.id} className="card row">
            <span>from <Link to={`/u/${l.from}`}>@{l.from}</Link> · sent {timeAgo(l.sentAt)}</span>
            {l.openedAt ? <span className="muted">opened · {timeLeft(l.expiresAt)} left</span> : <strong>sealed</strong>}
            <button type="button" onClick={() => open(l)}>{l.openedAt ? 'Read again' : 'Open'}</button>
          </li>
        ))}
      </ul>

      <h2>Sent</h2>
      {sent.length === 0 && <p className="muted">Nothing sent yet.</p>}
      <ul className="plain">
        {sent.map((l) => (
          <li key={l.id} className="card row">
            <span>to <Link to={`/u/${l.to}`}>@{l.to}</Link> · {timeAgo(l.sentAt)}</span>
            <span className="muted">
              {l.openedAt ? `opened ${timeAgo(l.openedAt)}` : 'sealed'}
              {l.savedByMe ? ' · kept on your profile' : ''}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
