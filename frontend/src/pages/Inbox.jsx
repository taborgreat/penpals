import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { timeAgo, timeLeft } from '../format.js';
import LetterView from '../components/LetterView.jsx';
import Hand from '../components/Hand.jsx';
import Username from '../components/Username.jsx';

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
      <h1><Hand>Mailbox</Hand></h1>
      {error && <p className="error">{error}</p>}

      {current && (
        <div className="stack reading">
          <p className="meta">
            from <Link to={`/u/${current.from}`}><Username name={current.from} /></Link> · opened {timeAgo(current.openedAt)} ·
            disappears in {timeLeft(current.expiresAt)}
          </p>
          <LetterView letter={current} />
          <div className="row">
            <button type="button" onClick={() => toggleSave(current)}>
              {current.savedByMe ? 'Remove from my profile' : 'Keep on my profile'}
            </button>
            <button type="button" onClick={() => setCurrent(null)}><Hand>Close</Hand></button>
          </div>
        </div>
      )}

      <h2><Hand>For you</Hand></h2>
      {inbox.length === 0 && <p className="muted"><Hand>No letters waiting.</Hand></p>}
      <ul className="plain">
        {inbox.map((l) => (
          <li key={l.id} className="envelope">
            <span>from <Link to={`/u/${l.from}`}><Username name={l.from} /></Link> · sent {timeAgo(l.sentAt)}</span>
            {l.openedAt ? <span className="muted">opened · {timeLeft(l.expiresAt)} left</span> : <span className="badge">sealed</span>}
            <button type="button" className={l.openedAt ? undefined : 'primary'} onClick={() => open(l)}>{l.openedAt ? <Hand>Read again</Hand> : <Hand>Open</Hand>}</button>
          </li>
        ))}
      </ul>

      <h2><Hand>Sent</Hand></h2>
      {sent.length === 0 && <p className="muted"><Hand>Nothing sent yet.</Hand></p>}
      <ul className="plain">
        {sent.map((l) => (
          <li key={l.id} className="envelope">
            <span>to <Link to={`/u/${l.to}`}><Username name={l.to} /></Link> · {timeAgo(l.sentAt)}</span>
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
