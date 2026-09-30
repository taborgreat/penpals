import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { kb } from '../format.js';
import LetterView from '../components/LetterView.jsx';
import SendControl from '../components/SendControl.jsx';

export default function Profile() {
  const { username } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [social, setSocial] = useState(null); // only for my own profile
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get(`/api/users/${encodeURIComponent(username)}`);
      setData(d);
      const mine = user && d.user.username.toLowerCase() === user.username.toLowerCase();
      setSocial(mine ? await api.get('/api/social') : null);
    } catch (err) {
      setError(err.message);
    }
  }, [username, user]);

  useEffect(() => {
    setData(null);
    setSocial(null);
    setError(null);
    load();
  }, [load]);

  // Run an API call, then reload the page's data.
  const act = (fn) => async () => {
    setError(null);
    try {
      await fn();
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  async function remove(letter) {
    const question = letter.sentAt ? 'Remove this letter from your profile?' : 'This letter was never sent. Removing it deletes it. Continue?';
    if (!window.confirm(question)) return;
    await act(() => api.del(`/api/letters/${letter.id}/save`))();
  }

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Loading…</p>;

  const u = data.user;
  const { relation } = data;
  const isMe = user && user.username.toLowerCase() === u.username.toLowerCase();
  const name = u.username;

  return (
    <>
      <h1>@{name} {u.private && <small className="muted">private</small>}</h1>

      {u.hidden ? (
        u.blockedByMe
          ? <p>You blocked this scripter. <button type="button" onClick={act(() => api.del(`/api/users/${name}/block`))}>Unblock</button></p>
          : <p className="muted">This profile is private. Only their friends can see it.</p>
      ) : (
        <p className="muted">joined {new Date(u.createdAt).toLocaleDateString()} · {u.lettersSent} letters sent</p>
      )}

      {user && !isMe && !u.blockedByMe && (
        <div className="row">
          {!u.hidden && <Link to={`/write/${name}`}>Write @{name} a letter</Link>}
          {relation === 'none' && <button type="button" onClick={act(() => api.post(`/api/users/${name}/friend`))}>Add friend</button>}
          {relation === 'outgoing' && <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}>Cancel friend request</button>}
          {relation === 'incoming' && (
            <>
              <button type="button" onClick={act(() => api.post(`/api/users/${name}/friend`))}>Accept friend request</button>
              <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}>Decline</button>
            </>
          )}
          {relation === 'friends' && <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}>Unfriend</button>}
          <button type="button" onClick={act(() => api.post(`/api/users/${name}/block`))}>Block</button>
        </div>
      )}
      {!user && !u.hidden && <p className="muted">Log in to write to them.</p>}

      {isMe && social && <OwnControls social={social} act={act} />}

      {!u.hidden && (
        <>
          <h2>Letters on this profile ({data.saved.length}/10)</h2>
          {data.saved.length === 0 && <p className="muted">Nothing here yet.</p>}
          {data.saved.map((l) => (
            <div key={l.id} className="stack card">
              <LetterView letter={l} />
              <p className="muted">
                by @{l.from} · {new Date(l.createdAt).toLocaleDateString()} · {kb(l.bytes)}
                {l.to ? ` · sent to @${l.to}` : isMe && l.isMine ? ' · not sent yet' : ''}
              </p>
              <div className="row">
                {user && !l.isMine
                  ? <button type="button" onClick={act(() => api.post(`/api/letters/${l.id}/upvote`))}>{l.upvotedByMe ? '▲ upvoted' : '▲ upvote'} {l.upvotes}</button>
                  : <span className="muted">▲ {l.upvotes}</span>}
                {isMe && <button type="button" onClick={() => remove(l)}>Remove from my profile</button>}
              </div>
              {isMe && l.isMine && <SendControl letter={l} onSent={load} />}
            </div>
          ))}
        </>
      )}
    </>
  );
}

// Privacy switch and friend lists, shown only to the profile's owner.
function OwnControls({ social, act }) {
  const friendLink = (n) => <Link key={n} to={`/u/${n}`}>@{n}</Link>;
  return (
    <div className="stack card">
      <p><Link to="/write">Write a letter</Link></p>
      <p>
        Your profile is <strong>{social.private ? 'private' : 'public'}</strong>.{' '}
        <button type="button" onClick={act(() => api.post('/api/social/private', { private: !social.private }))}>
          {social.private ? 'Make public' : 'Make private'}
        </button>
      </p>
      <p className="muted">Private means off the homepage; only friends can see your letters or write to you.</p>
      {social.incoming.length > 0 && (
        <p>
          Friend requests:{' '}
          {social.incoming.map((n) => (
            <span key={n}>
              {friendLink(n)}{' '}
              <button type="button" onClick={act(() => api.post(`/api/users/${n}/friend`))}>accept</button>{' '}
              <button type="button" onClick={act(() => api.del(`/api/users/${n}/friend`))}>decline</button>{' '}
            </span>
          ))}
        </p>
      )}
      <p>Friends: {social.friends.length ? social.friends.map((n) => <span key={n}>{friendLink(n)} </span>) : <span className="muted">none yet</span>}</p>
      {social.outgoing.length > 0 && <p className="muted">Requests you sent: {social.outgoing.map((n) => `@${n}`).join(', ')}</p>}
      {social.blocked.length > 0 && (
        <p>
          Blocked:{' '}
          {social.blocked.map((n) => (
            <span key={n}>
              @{n} <button type="button" onClick={act(() => api.del(`/api/users/${n}/block`))}>unblock</button>{' '}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
