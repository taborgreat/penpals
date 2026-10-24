// Whose room the views on this page are in (rooms.md §1, §1a): every scene
// inside takes it, so a pad, a journal page or a signature drawn here lies in
// that room, under its sun, seen by the one eye. { seeds (room/seeds.js),
// timeZone (the room's clock), eye ({ lids, color }: where the eye's lids and
// colour are headed), fixed (the eye cannot look around: the lobby) }. Props on
// a SceneView still win.
import { createContext } from 'react';

export const RoomContext = createContext(null);
