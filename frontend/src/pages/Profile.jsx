import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { kb } from '../format.js';
import LetterView from '../components/LetterView.jsx';
import SendControl from '../components/SendControl.jsx';
import Pad from '../components/Pad.jsx';
import { makeHandAsset } from '../hand/asset.js';
import { HandDrawn } from '../components/Hand.jsx';
import { useSignature, setSignature } from '../hand/signatures.js';
import { SIGNATURE_COLORS, colorVars } from '../hand/colors.js';
import Username from '../components/Username.jsx';
import Hand from '../components/Hand.jsx';
import HandNumber from '../components/HandNumber.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';

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
      <h1><Username name={name} height={1.4} /> {u.private && <small className="badge quiet-badge">private</small>}</h1>

      {u.hidden ? (
        u.blockedByMe
          ? <p>You blocked this scripter. <button type="button" onClick={act(() => api.del(`/api/users/${name}/block`))}><Hand>Unblock</Hand></button></p>
          : <p className="muted">This profile is private. Only their friends can see it.</p>
      ) : (
        <p className="meta stats"><HandNumber value={u.lettersSent} /> <Hand name="sent-count">sent</Hand></p>
      )}

      {user && !isMe && !u.blockedByMe && (
        <div className="row">
          {!u.hidden && <Link to={`/write/${name}`} className="write-cta" title={`Write @${name} a letter`}><Hand>Write</Hand></Link>}
          {relation === 'none' && <button type="button" onClick={act(() => api.post(`/api/users/${name}/friend`))}><Hand>Add friend</Hand></button>}
          {relation === 'outgoing' && <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}><Hand>Cancel friend request</Hand></button>}
          {relation === 'incoming' && (
            <>
              <button type="button" onClick={act(() => api.post(`/api/users/${name}/friend`))}><Hand>Accept friend request</Hand></button>
              <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}><Hand>Decline</Hand></button>
            </>
          )}
          {relation === 'friends' && <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}><Hand>Unfriend</Hand></button>}
          <button type="button" onClick={act(() => api.post(`/api/users/${name}/block`))}><Hand>Block</Hand></button>
        </div>
      )}
      {!user && !u.hidden && <p className="muted">Log in to write to them.</p>}

      {isMe && <SignatureCard name={u.username} />}
      {isMe && social && <OwnControls social={social} act={act} />}

      {!u.hidden && (
        <>
          <h2><Hand>Letters on this profile</Hand> (<HandNumber value={data.saved.length} />/<HandNumber value={10} />)</h2>
          {data.saved.length === 0 && <p className="muted"><Hand>Nothing here yet.</Hand></p>}
          {data.saved.map((l) => (
            <div key={l.id} className="stack card">
              <LetterView letter={l} />
              <p className="meta">
                by <Username name={l.from} /> · {new Date(l.createdAt).toLocaleDateString()} · {kb(l.bytes)}
                {l.to ? <> · sent to <Username name={l.to} /></> : isMe && l.isMine ? ' · not sent yet' : ''}
              </p>
              <div className="row">
                {user && !l.isMine
                  ? <button type="button" onClick={act(() => api.post(`/api/letters/${l.id}/upvote`))}>{l.upvotedByMe ? '▲ upvoted' : '▲ upvote'} <HandNumber value={l.upvotes} /></button>
                  : <span className="muted">▲ <HandNumber value={l.upvotes} /></span>}
                {isMe && <button type="button" onClick={() => remove(l)}><Hand>Remove from my profile</Hand></button>}
              </div>
              {isMe && l.isMine && <SendControl letter={l} onSent={load} />}
            </div>
          ))}
        </>
      )}
    </>
  );
}

const SIGN_PAGE = { width: 760, height: 470 }; // five ruled lines: sign on a middle one, with room above and below

// Your signed name, which stands in for @name around the site. Signed on a
// compact version of the letter pad, so every nib and setting is there.
function SignatureCard({ name }) {
  const signature = useSignature(name);
  const [signing, setSigning] = useState(false);
  const [result, setResult] = useState(null);
  const [color, setColor] = useState(null); // null = the signature's own
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const onResult = useCallback((r) => setResult(r), []);
  const shown = color ?? signature?.color ?? SIGNATURE_COLORS[0].id;

  async function save() {
    const asset = result && makeHandAsset(result.strokesData, `@${name}`);
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      const d = await api.put('/api/signatures/me', { signature: { ...asset, color: shown } });
      setSignature(name, d.signature);
      setSigning(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Signed already: the colour changes at once, no signing again.
  async function pick(id) {
    setColor(id);
    if (!signature || signing) return;
    setError(null);
    try {
      await api.put('/api/signatures/me/color', { color: id });
      setSignature(name, { ...signature, color: id });
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove() {
    if (!window.confirm('Remove your signature? Your name will show as @' + name + ' again.')) return;
    setError(null);
    try {
      await api.del('/api/signatures/me');
      setSignature(name, null);
    } catch (err) {
      setError(err.message);
    }
  }

  if (signature === undefined) return null;
  const editing = signing || !signature;
  const swatches = (
    <div className="field">
      <span>Colour</span>
      <div className="swatches" role="group" aria-label="Signature colour">
        {SIGNATURE_COLORS.map((c) => (
          <button key={c.id} type="button" title={c.name} aria-label={c.name} aria-pressed={shown === c.id} style={colorVars(c.id)} onClick={() => pick(c.id)} />
        ))}
      </div>
    </div>
  );
  return (
    <div className="stack card signature-card">
      <h2><Hand>Your signature</Hand></h2>
      {editing ? (
        <>
          <p className="muted">Sign your name on a line. It stands in for @{name} everywhere your name shows up.</p>
          {swatches}
          <Pad
            size={SIGN_PAGE}
            onResult={onResult}
            inkColor={SIGNATURE_COLORS.find((c) => c.id === shown).light}
            hint="Sign on one of the lines. Zoom in for a finer hand."
          />
          <div className="row">
            {signature && <button type="button" className="quiet" onClick={() => setSigning(false)}><Hand>Cancel</Hand></button>}
            <button type="button" className="primary" onClick={save} disabled={!result || busy}>{busy ? 'Saving…' : <Hand>Save signature</Hand>}</button>
          </div>
        </>
      ) : (
        <>
          <p className="signature-show">
            <span className="username signed" style={colorVars(shown)}>
              <HandDrawn asset={signature} label={`@${name}`} fit={3} />
            </span>
          </p>
          {swatches}
          <div className="row">
            <button type="button" onClick={() => setSigning(true)}><Hand>Sign again</Hand></button>
            <button type="button" className="quiet" onClick={remove}><Hand>Remove</Hand></button>
          </div>
        </>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Privacy switch and friend lists, shown only to the profile's owner.
function OwnControls({ social, act }) {
  const friendLink = (n) => <Link key={n} to={`/u/${n}`}>@{n}</Link>;
  return (
    <div className="stack card">
      <p><Link to="/write" className="write-cta" title="Write a letter"><Hand>Write</Hand></Link></p>
      <p>
        <Hand>Colours</Hand>: <ThemeToggle />
      </p>
      <p>
        Your profile is <strong>{social.private ? 'private' : 'public'}</strong>.{' '}
        <button type="button" onClick={act(() => api.post('/api/social/private', { private: !social.private }))}>
          {social.private ? <Hand>Make public</Hand> : <Hand>Make private</Hand>}
        </button>
      </p>
      <p className="muted">Private means off the homepage; only friends can see your letters or write to you.</p>
      {social.incoming.length > 0 && (
        <p>
          Friend requests:{' '}
          {social.incoming.map((n) => (
            <span key={n}>
              {friendLink(n)}{' '}
              <button type="button" onClick={act(() => api.post(`/api/users/${n}/friend`))}><Hand>accept</Hand></button>{' '}
              <button type="button" onClick={act(() => api.del(`/api/users/${n}/friend`))}><Hand>decline</Hand></button>{' '}
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
              @{n} <button type="button" onClick={act(() => api.del(`/api/users/${n}/block`))}><Hand>unblock</Hand></button>{' '}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
