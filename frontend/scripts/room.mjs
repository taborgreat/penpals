// Bakes the room's shape (light-waves §4, "Baked at build time: shape only"):
// its geometry and form factors, into public/room/ where the site serves them.
// Same input, identical files. Nothing about light or the surfaces' cells is
// baked: sources and each patch's absorption are runtime inputs.
//   node scripts/room.mjs        (npm run room; npm run build runs it first)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOM, roomGeometry, formFactors, encodeRoom } from '../src/scene/light/room.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'public', 'room');
const BAKE = { positions: 8, directions: 32 }; // 65 536 rays a patch: every form factor exact in float32

const t0 = performance.now();
const geom = roomGeometry(ROOM);
const ff = formFactors(geom, BAKE);
const { json, bin } = encodeRoom(geom, ff, { ...BAKE, rays: BAKE.positions ** 2 * BAKE.directions ** 2 });
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'room.json'), json);
fs.writeFileSync(path.join(out, 'room.ff'), bin);
const ms = Math.round(performance.now() - t0);
console.log(`room: ${geom.patches.length} patches, ${geom.openings.length} openings, page = patch ${geom.page}; room.json ${json.length} B, room.ff ${bin.length} B; ${ms} ms`);
