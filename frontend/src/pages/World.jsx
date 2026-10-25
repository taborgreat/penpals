import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Lobby from './Lobby.jsx';
import Journal from '../book/Journal.jsx';
import Panel from '../components/Panel.jsx';
import AuthPanel from '../components/AuthPanel.jsx';
import AccountPanel from '../components/AccountPanel.jsx';
import { RoomContext } from '../room/RoomContext.js';
import { roomSeedsOf } from '../room/seeds.js';
import { placeHouse } from '../room/world.js';
import { panelFor } from '../room/panel.js';
import { useKey } from '../keys/session.js';

// The site is one page, and it is the world (one-world.md). Before you are
// in, it is the lobby (rooms.md §1a); once the eye opens you are in your
// house, on its plot near the start (room/world.js). `/u/<name>` opens the
// world at that person's house. A house is its owner's space (rooms.md §1):
// every scene in it is grown from their key and lies under their clock. Who
// can come in follows the profile's privacy and block rules (rooms.md §4): a
// house closed to you shows only its closed door. The one panel (room/panel.js)
// follows what is in your hand and in front of you.
export default function World() {
  const { username } = useParams();
  const { user, loading } = useAuth();
  const key = useKey(user);
  useEffect(() => {
    if (key) placeHouse(key).catch(() => {}); // a house that never landed when you registered lands now
  }, [key]);
  if (loading) return null;
  if (!username && !user) return <Lobby />;
  const name = username ?? user.username;
  return <House key={name.toLowerCase()} name={name} />;
}

function House({ name }) {
  const { user } = useAuth();
  const [owner, setOwner] = useState(null);
  const [error, setError] = useState(null);
  const [pageId, setPageId] = useState(null); // the journal's page open on the table
  const [place, setPlace] = useState(null); // where the being is and what it holds (SceneView, the world's)
  useEffect(() => {
    let alive = true;
    api
      .get(`/api/users/${encodeURIComponent(name)}`)
      .then((d) => alive && setOwner(d.user))
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [name]);
  const room = useMemo(() => (owner && !owner.hidden ? { seeds: roomSeedsOf(owner.publicKey), timeZone: owner.timeZone ?? null, onBeing: setPlace } : null), [owner]);

  if (error) return <p className="error world-note">{error}</p>;
  if (!owner) return null;
  const mine = !!user && user.username.toLowerCase() === owner.username.toLowerCase();
  const panel = <WorldPanel kind={panelFor({ signedIn: !!user, mine, ...place })} />;
  if (!room)
    return (
      <>
        <p className="muted world-note">Their door is closed.</p>
        {panel}
      </>
    );
  return (
    <RoomContext.Provider value={room}>
      <Journal name={owner.username} pageId={pageId} editable={mine} timeZone={room.timeZone} onPage={setPageId} />
      {panel}
    </RoomContext.Provider>
  );
}

// The panel's forms, by what it is for.
function WorldPanel({ kind }) {
  if (kind === 'sign-in')
    return (
      <Panel title="Come in" wide>
        <AuthPanel />
      </Panel>
    );
  if (kind === 'account')
    return (
      <Panel title="Your account">
        <AccountPanel />
      </Panel>
    );
  return null;
}
