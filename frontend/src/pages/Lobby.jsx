import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import AuthPanel from '../components/AuthPanel.jsx';
import Panel from '../components/Panel.jsx';
import { SIGN_PAD } from '../components/Register.jsx';
import SceneView from '../scene/SceneView.jsx';
import { sceneOn } from '../scene/support.js';
import { RoomContext } from '../room/RoomContext.js';
import { lobbySeeds } from '../room/seeds.js';

// The front door (rooms.md §1a): the whole site is the world, and you come in
// through the lobby, a room everyone sees (the same shape, its surfaces grown
// from a fixed public seed), seen in black and white: luminance only. You
// arrive seated, eyes on the blank sheet on the table, and cannot look around
// yet. Registering is writing on that sheet, the pen in your hand: sign your
// name three times on it, in this scene. The world's one panel (one-world.md),
// open because no one is in, holds only the pen's settings and the steps, or
// signing in by name and a password, your 24 words or your private key.
// The moment it is done the eye closes, the lids come down and the view goes
// dark, and it opens in your own house, seated in the same place at your own
// table before a fresh sheet, where colour comes in as the eye adapts. Scene
// only: none of it touches the record.
const LOBBY_PAGE = [SIGN_PAD.width, SIGN_PAD.height]; // the sheet on the table: the slip you sign
const NO_SHEETS = [];
const CLOSE_MS = 450; // the lids down (light/eye.js LID_CLOSE_S), and a breath in the dark

export default function Lobby() {
  const { signedIn } = useAuth();
  const navigate = useNavigate();
  const [closing, setClosing] = useState(false);
  const [sheet, setSheet] = useState(null); // the signature being written on the slip, and the pen on it (Register)
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
        {sceneOn() && <SceneView className="lobby-scene" page={LOBBY_PAGE} mode="3d" sheets={sheet ? [sheet.scene] : NO_SHEETS} writer={sheet?.writer ?? null} ground tools={false} />}
        <Panel title="Come in">
          <AuthPanel onDone={done} onSheet={setSheet} />
        </Panel>
      </section>
    </RoomContext.Provider>
  );
}
