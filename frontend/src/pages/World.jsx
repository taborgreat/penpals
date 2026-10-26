import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Lobby from './Lobby.jsx';
import House from '../room/House.jsx';
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
// every scene in it is grown from their key, under the one world clock. Who
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
  return <Home key={name.toLowerCase()} name={name} />;
}

function Home({ name }) {
  const { user } = useAuth();
  const [owner, setOwner] = useState(null);
  const [error, setError] = useState(null);
  const [place, setPlace] = useState(null); // where the being is and what it holds (SceneView, the world's)
  const [inHands, setInHands] = useState(null); // the book pulled down from the shelf (room/House.jsx)
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
  const room = useMemo(() => (owner && !owner.hidden ? { seeds: roomSeedsOf(owner.publicKey), onBeing: setPlace } : null), [owner]);

  if (error) return <p className="error world-note">{error}</p>;
  if (!owner) return null;
  const mine = !!user && user.username.toLowerCase() === owner.username.toLowerCase();
  const kind = panelFor({ signedIn: !!user, mine, ...place, holding: inHands ?? place?.holding ?? null });
  const panel = <WorldPanel kind={kind} />; // (what the house's own things need, the house shows: room/House.jsx)
  if (!room)
    return (
      <>
        <p className="muted world-note">Their door is closed.</p>
        {panel}
      </>
    );
  return (
    <RoomContext.Provider value={room}>
      <House name={owner.username} editable={mine} panel={kind} onHold={setInHands} />
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
