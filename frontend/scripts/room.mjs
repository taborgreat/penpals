// Bakes the room's shape (light-waves §4, "Baked at build time: shape only"):
// its geometry and form factors, into public/room/ where the site serves them.
// Same input, identical files. Nothing about light or the surfaces' cells is
// baked: sources and each patch's absorption are runtime inputs. Two rooms
// joined (rooms.md §7) are baked too, one geometry for each opening (the wall
// down, or a door), so their light is solved over both together.
//   node scripts/room.mjs        (npm run room; npm run build runs it first)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOM, JOINS, SIDES, roomGeometry, joinedGeometry, formFactors, encodeRoom } from '../src/scene/light/room.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'room');
const BAKE = { positions: 8, directions: 32 }; // 65 536 rays a patch: every form factor exact in float32

fs.mkdirSync(out, { recursive: true });
const joined = JOINS.flatMap((o) => SIDES.map((s) => [`joined-${o}-${s}`, joinedGeometry(ROOM, o, s)]));
for (const [name, geom] of [['room', roomGeometry(ROOM)], ...joined]) {
  const t0 = performance.now();
  const ff = formFactors(geom, BAKE);
  const { json, bin } = encodeRoom(geom, ff, { ...BAKE, rays: BAKE.positions ** 2 * BAKE.directions ** 2 });
  fs.writeFileSync(path.join(out, `${name}.json`), json);
  fs.writeFileSync(path.join(out, `${name}.ff`), bin);
  const ms = Math.round(performance.now() - t0);
  console.log(`${name}: ${geom.patches.length} patches, ${geom.openings.length} openings, page = patch ${geom.page}; ${name}.json ${json.length} B, ${name}.ff ${bin.length} B; ${ms} ms`);
}
