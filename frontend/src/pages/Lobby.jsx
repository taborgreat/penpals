import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import AuthPanel from '../components/AuthPanel.jsx';
import Panel from '../components/Panel.jsx';
import SceneView from '../scene/SceneView.jsx';
import { sceneOn } from '../scene/support.js';
import { RoomContext } from '../room/RoomContext.js';
import { lobbySeeds } from '../room/seeds.js';

// The front door (rooms.md §1a): the whole site is the world, and you come in
// through the lobby, a room everyone sees (the same shape, its surfaces grown
// from a fixed public seed), seen in black and white: luminance only. You
// arrive seated, eyes on the blank sheet on the table, and cannot look around
// yet. Registering and signing in are the world's one panel, open because no
// one is in (one-world.md, the panel): sign your name three times there, or
// sign in by name and a password, your 24 words or your private key.
// The moment it is done the eye closes, the lids come down and the view goes
// dark, and it opens in your own room, where colour comes in as the eye
// adapts. Scene only: none of it touches the record.
const LOBBY_PAGE = [1000, 1400];
const CLOSE_MS = 450; // the lids down (light/eye.js LID_CLOSE_S), and a breath in the dark

export default function Lobby() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);
  const room = useMemo(() => ({ seeds: lobbySeeds(), eye: { lids: closing ? 0 : 1, color: 0 }, fixed: true }), [closing]);
  const done = (user) => {
    setClosing(true);
    setTimeout(() => {
      signedIn(user);
      navigate(`/u/${encodeURIComponent(user.username)}`);
    }, CLOSE_MS);
  };
  return (
    <RoomContext.Provider value={room}>
      <section className={`lobby${closing ? ' closing' : ''}`} aria-label="The lobby">
        {sceneOn() && <SceneView className="lobby-scene" page={LOBBY_PAGE} mode="3d" sheets={[]} ground tools={false} />}
        <Panel title="Come in" wide>
          <AuthPanel onDone={done} />
        </Panel>
      </section>
    </RoomContext.Provider>
  );
}
