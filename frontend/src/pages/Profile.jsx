import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { kb } from '../format.js';
import LetterView from '../components/LetterView.jsx';
import SendControl from '../components/SendControl.jsx';
import Pad from '../components/Pad.jsx';
import KeyGate from '../components/KeyGate.jsx';
import Journal from '../book/Journal.jsx';
import { useSignature, refreshSignature } from '../hand/signatures.js';
import { SIGNATURE_COLORS } from '../hand/colors.js';
import { useKey, newSheet, sealInk, openBy } from '../keys/session.js';
import { signOutEverywhere } from '../keys/account.js';
import { useLiveInk } from '../ink/useLiveInk.js';
import PasswordSetting from '../components/PasswordSetting.jsx';
import Username from '../components/Username.jsx';
import Hand from '../components/Hand.jsx';
import HandNumber from '../components/HandNumber.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import SceneView from '../scene/SceneView.jsx';
import { sceneOn, sceneSupported, setViewChoice, useLowPower } from '../scene/support.js';
import { sceneOf } from '../scene/sources.js';
import { useBook } from '../book/useBook.js';
import { CELLS } from '../book/ink.js';
import { RoomContext } from '../room/RoomContext.js';
import { roomSeedsOf } from '../room/seeds.js';

// A profile (books.md B1): your own shows your signature setting, Download my
// book, and your journal to edit; someone else's shows their journal at once,
// with the visitor actions. /u/<name>/<page> opens a page of the journal.
export default function Profile() {
  const { username, page } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const key = useKey(user);
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
    // their room (rooms.md §1): every scene here lies in it, grown from their key, under its own clock
    <RoomContext.Provider value={{ seeds: roomSeedsOf(u.publicKey), timeZone: u.timeZone ?? null }}>
      <h1>
        <Username name={name} height={1.4} /> {u.private && <small className="badge quiet-badge">private</small>}
      </h1>
      {u.fingerprint && (
        <p className="meta fingerprint" title={`Their key: ${u.publicKey}. Everything in this book is sealed by it.`}>
          key · {u.fingerprint}
        </p>
      )}

      {u.hidden ? (
        u.blockedByMe ? (
          <p>
            You blocked this scripter.{' '}
            <button type="button" onClick={act(() => api.del(`/api/users/${name}/block`))}>
              <Hand>Unblock</Hand>
            </button>
          </p>
        ) : (
          <p className="muted">This profile is private. Only their friends can see it.</p>
        )
      ) : (
        <p className="meta stats">
          <HandNumber value={u.lettersSent} /> <Hand name="sent-count">sent</Hand>
        </p>
      )}

      {user && !isMe && !u.blockedByMe && (
        <div className="row">
          {!u.hidden && (
            <Link to={`/write/${name}`} className="write-cta" title={`Write @${name} a letter`}>
              <Hand>Write</Hand>
            </Link>
          )}
          {relation === 'none' && (
            <button type="button" onClick={act(() => api.post(`/api/users/${name}/friend`))}>
              <Hand>Add friend</Hand>
            </button>
          )}
          {relation === 'outgoing' && (
            <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}>
              <Hand>Cancel friend request</Hand>
            </button>
          )}
          {relation === 'incoming' && (
            <>
              <button type="button" onClick={act(() => api.post(`/api/users/${name}/friend`))}>
                <Hand>Accept friend request</Hand>
              </button>
              <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}>
                <Hand>Decline</Hand>
              </button>
            </>
          )}
          {relation === 'friends' && (
            <button type="button" onClick={act(() => api.del(`/api/users/${name}/friend`))}>
              <Hand>Unfriend</Hand>
            </button>
          )}
          <Link to={`/proofs?to=${encodeURIComponent(name)}`} className="button quiet" title="Ask them to prove, by hand and right now, that they hold their key">
            Ask for a live proof
          </Link>
          <button type="button" onClick={act(() => api.post(`/api/users/${name}/block`))}>
            <Hand>Block</Hand>
          </button>
        </div>
      )}
      {!user && !u.hidden && <p className="muted">Log in to write to them.</p>}

      {isMe && <SignatureCard name={u.username} />}
      {isMe && (
        <p className="book-download">
          <a className="button" href="/api/books/me/download" download={`${u.username}.book`}>
            ↓ Download my book
          </a>
          <span className="meta">
            your journal and signature as one .book file (no letters, no login) · <Link to="/book">open a .book</Link>
          </span>
        </p>
      )}

      {!u.hidden && (
        <Journal
          key={name}
          name={name}
          pageId={page ?? null}
          editable={!!isMe}
          timeZone={u.timeZone ?? null}
          onPage={(id) => navigate(id ? `/u/${encodeURIComponent(name)}/${encodeURIComponent(id)}` : `/u/${encodeURIComponent(name)}`)}
        />
      )}

      {isMe && social && <OwnControls social={social} act={act} writer={key} onSignedOut={logout} />}

      {!u.hidden && (
        <>
          <h2>
            <Hand>Letters on this profile</Hand> (<HandNumber value={data.saved.length} />/<HandNumber value={10} />)
          </h2>
          {data.saved.length === 0 && (
            <p className="muted">
              <Hand>Nothing here yet.</Hand>
            </p>
          )}
          {data.saved.map((l) => (
            <div key={l.id} className="stack card">
              <LetterView letter={l} />
              <p className="meta">
                by <Username name={l.from} /> · {new Date(l.createdAt).toLocaleDateString()} · {kb(l.bytes)}
                {l.to ? (
                  <>
                    {' '}
                    · sent to <Username name={l.to} />
                  </>
                ) : isMe && l.isMine ? (
                  ' · not sent yet'
                ) : (
                  ''
                )}
              </p>
              <div className="row">
                {user && !l.isMine ? (
                  <button type="button" onClick={act(() => api.post(`/api/letters/${l.id}/upvote`))}>
                    {l.upvotedByMe ? '▲ upvoted' : '▲ upvote'} <HandNumber value={l.upvotes} />
                  </button>
                ) : (
                  <span className="muted">
                    ▲ <HandNumber value={l.upvotes} />
                  </span>
                )}
                {isMe && (
                  <button type="button" onClick={() => remove(l)}>
                    <Hand>Remove from my profile</Hand>
                  </button>
                )}
              </div>
              {isMe && l.isMine && <SendControl letter={l} onSent={load} />}
            </div>
          ))}
        </>
      )}
    </RoomContext.Provider>
  );
}

const SIGN_PAGE = { width: 760, height: 470 }; // five ruled lines: sign on a middle one, with room above and below
const SIGN_FAMILY = Object.freeze({ grain: 8, weight: 8, tooth: 0 });

// Your signed name, which stands in for @name around the site. It is a sheet
// of your book, sealed by your key and open from birth: anyone can regrow it.
// Signing again makes a new one (the old stays in your book).
function SignatureCard({ name }) {
  const signature = useSignature(name);
  const [signing, setSigning] = useState(false);
  const [scene, setScene] = useState(() => sceneOn());
  const lowPower = useLowPower();
  useEffect(() => {
    setScene(sceneOn());
  }, [lowPower]);
  if (signature === undefined) return null;
  return (
    <div className="stack card signature-card">
      <h2>
        <Hand>Your signature</Hand>
      </h2>
      {signing ? (
        <KeyGate>
          {(writer) => (
            <SignSheet
              writer={writer}
              name={name}
              onDone={() => {
                refreshSignature(name);
                setSigning(false);
              }}
              onCancel={() => setSigning(false)}
            />
          )}
        </KeyGate>
      ) : (
        <>
          {scene && signature ? (
            <SignatureScene
              name={name}
              signature={signature}
              onFlat={() => {
                setViewChoice('flat');
                setScene(false);
              }}
            />
          ) : (
            <p className="signature-show">
              <Username name={name} height={3} />
            </p>
          )}
          <div className="row">
            <button type="button" onClick={() => setSigning(true)}>
              <Hand>Sign again</Hand>
            </button>
            {!scene && signature && sceneSupported() && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setViewChoice('scene');
                  setScene(true);
                }}
                title="Your signature lit, in 3D"
              >
                Scene
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Your signature in the scene: an open sheet, so grown here, its own paper and
// all (law 1, written where the hand is read: its look, lit).
function SignatureScene({ name, signature, onFlat }) {
  const { book } = useBook(name);
  const [data, setData] = useState(null);
  const [mode, setMode] = useState('3d'); // always 3D
  const line = book.inks?.get(signature.ink);
  const seed = line ? (book.seeds?.get(line.ink.sheet) ?? line.open?.seed ?? null) : null;
  useEffect(() => {
    if (!line) return undefined;
    let alive = true;
    sceneOf({ line, seed, lookUrl: signature.look })
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [line, seed, signature.look]);
  const sheets = useMemo(() => {
    if (!data) return [];
    const box = data.field?.box ?? data.look.box;
    return [{ id: 'signature', box, origin: [0, 0], cellPx: 1 / CELLS, field: data.field, detail: data.detail, look: data.look }];
  }, [data]);
  if (!data)
    return (
      <p className="signature-show">
        <Username name={name} height={3} />
      </p>
    );
  const box = data.field?.box ?? data.look.box;
  return (
    <div className="signature-scene" style={{ aspectRatio: `${box[2]} / ${box[3]}` }}>
      <SceneView page={[box[2] / CELLS, box[3] / CELLS]} mode={mode} onMode={setMode} sheets={sheets} onFlat={onFlat} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

function SignSheet({ writer, name, onDone, onCancel }) {
  const sheet = useMemo(() => newSheet(writer), [writer]);
  const ink = useLiveInk({ paperKey: sheet.paperKey, family: SIGN_FAMILY, size: SIGN_PAGE }, sheet.sheet);
  const [color, setColor] = useState(SIGNATURE_COLORS[0].light);
  const [strokes, setStrokes] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const settled = await ink.settle();
      if (!settled?.box[2]) throw new Error('Sign first.');
      const { line, D } = sealInk(writer, { sheet: sheet.sheet, seed: sheet.seed, use: 'signature', family: SIGN_FAMILY, settled, name });
      await api.put('/api/books/me/signature', { line: { ...line, open: openBy(writer, D, sheet.sheet, sheet.seed) } });
      onDone();
    } catch (err) {
      setError(err.law ? 'That is more ink than a signature can hold.' : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="muted">
        Sign your name, {name}, on a line. It stands in for @{name} everywhere your name shows up.
      </p>
      <div className="field">
        <span>Ink</span>
        <div className="swatches" role="group" aria-label="Ink">
          {SIGNATURE_COLORS.map((c) => (
            <button key={c.id} type="button" title={c.name} aria-label={c.name} aria-pressed={color === c.light} style={{ '--sig-l': c.light, '--sig-d': c.light }} onClick={() => setColor(c.light)} />
          ))}
        </div>
      </div>
      {ink && <Pad ink={ink} size={SIGN_PAGE} inkColor={color} onChange={setStrokes} hint="Sign on one of the lines. Zoom in for a finer hand." />}
      <div className="row">
        <button type="button" className="quiet" onClick={onCancel}>
          <Hand>Cancel</Hand>
        </button>
        <button type="button" className="primary" onClick={save} disabled={!strokes || busy}>
          {busy ? 'Sealing…' : <Hand>Save signature</Hand>}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </>
  );
}

// Privacy switch and friend lists, shown only to the profile's owner.
function OwnControls({ social, act, writer, onSignedOut }) {
  const friendLink = (n) => (
    <Link key={n} to={`/u/${n}`}>
      @{n}
    </Link>
  );
  const everywhere = async () => {
    if (!window.confirm('Sign out on every device, this one too?')) return;
    await act(() => signOutEverywhere(writer))();
    onSignedOut();
  };
  return (
    <div className="stack card">
      <PasswordSetting />
      <p>
        <Link to="/proofs">Live proofs</Link>: asks waiting for you, and the ones you made.
      </p>
      <p>
        <button type="button" className="quiet" onClick={everywhere} disabled={!writer} title={writer ? 'Ends every session of this account' : 'Unlock first'}>
          Sign out everywhere
        </button>
      </p>
      <p>
        <Link to="/write" className="write-cta" title="Write a letter">
          <Hand>Write</Hand>
        </Link>
      </p>
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
              <button type="button" onClick={act(() => api.post(`/api/users/${n}/friend`))}>
                <Hand>accept</Hand>
              </button>{' '}
              <button type="button" onClick={act(() => api.del(`/api/users/${n}/friend`))}>
                <Hand>decline</Hand>
              </button>{' '}
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
              @{n}{' '}
              <button type="button" onClick={act(() => api.del(`/api/users/${n}/block`))}>
                <Hand>unblock</Hand>
              </button>{' '}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
