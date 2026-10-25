// Marks on the room's surfaces (rooms.md §2): ink placed on a wall, the floor,
// the ceiling or the table top, drawn over that surface in its own grown cells
// (scene/nodes.js markMaterial), drinking by wavelength through the ink. A mark
// is a sheet's cells in its record's own frame, set at `origin` on its surface's
// page (page units, scene/surfaces.js) at `cellUnits` page units a cell. It is
// cut into pieces of MARK_CHUNK cells a side, each a quad with its own small
// texture (its look: colour to alpha over white, the law's transmittance), so
// live writing uploads only the piece the pen is in.

import * as THREE from 'three';
import { N, surface as grown } from './light/index.js';
import { surfaceFrame, toRoom, ROOM_SURFACE, SEED_NAME } from './surfaces.js';
import { pairOf, spectrumAt } from './roomDraw.js';

export const MARK_CHUNK = 256; // cells a side of a piece
const LIFT = 0.0002; // m: a piece is drawn this far off its surface (and nudged in the depth test)
const KIND = { plaster: grown.PLASTER, floor: grown.PLANKS, table: grown.BOARD };

// The corners of a piece of a mark: where on its surface (room m, lifted), in
// the surface's own cells, in its texture (uv.y up, as every plane's: its row dy
// at 1 − v, nodes.js down), and in the surface's own u, v (m).
export function pieceCorners(geom, mk, x0, y0, w, h) {
  const s = mk.surf ?? geom.surfaces[mk.si];
  const [bx, by] = mk.box;
  return [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ].map(([dx, dy]) => {
    const at = [mk.origin[0] + (x0 - bx + dx) * mk.cellUnits, mk.origin[1] + (y0 - by + dy) * mk.cellUnits];
    const on = toRoom(mk.frame, at);
    const d = [0, 1, 2].map((c) => on[c] - s.origin[c]);
    const u = d[0] * s.u[0] + d[1] * s.u[1] + d[2] * s.u[2],
      v = d[0] * s.v[0] + d[1] * s.v[1] + d[2] * s.v[2];
    return { pos: toRoom(mk.frame, at, LIFT), on, cell: [u / grown.CELL_M, v / grown.CELL_M], uv: [dx / MARK_CHUNK, 1 - dy / MARK_CHUNK], surf: [u, v] };
  });
}

export function createMarks({ gpu, lights, group, geom, meshes, seedOf, webgpu }) {
  const marks = new Map();
  const E = new Float64Array(N);
  let ambient = null;

  // The room's light over all its patches (a thing's face, not one of the room's own surfaces).
  const meanOf = (out) => {
    out.fill(0);
    const n = ambient.length / N;
    for (let p = 0; p < n; p++) for (let b = 0; b < N; b++) out[b] += ambient[p * N + b] / n;
    return out;
  };
  function lightPiece(mk, pc) {
    const a = pc.geo.attributes;
    pc.corners.forEach((c, k) => {
      if (ambient && mk.si >= 0) spectrumAt(geom, meshes, mk.si, c.surf[0], c.surf[1], ambient, E);
      else if (ambient) meanOf(E);
      else E.fill(0);
      for (let g = 0; g < 4; g++) a[`amb${g}`].array.set(E.subarray(4 * g, 4 * g + 4), 4 * k);
    });
    for (let g = 0; g < 4; g++) a[`amb${g}`].needsUpdate = true;
  }

  function pieceOf(mk, cx, cy) {
    const key = cx * 65536 + cy;
    let pc = mk.pieces.get(key);
    if (pc) return pc;
    const [bx, by, bw, bh] = mk.box;
    const x0 = bx + cx * MARK_CHUNK,
      y0 = by + cy * MARK_CHUNK;
    const w = Math.min(MARK_CHUNK, bx + bw - x0),
      h = Math.min(MARK_CHUNK, by + bh - y0);
    const s = mk.surf ?? geom.surfaces[mk.si];
    const corners = pieceCorners(geom, mk, x0, y0, w, h);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(corners.flatMap((c) => c.pos)), 3));
    geo.setAttribute('cellPos', new THREE.BufferAttribute(Float32Array.from(corners.flatMap((c) => c.cell)), 2));
    geo.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(corners.flatMap((c) => c.uv)), 2));
    for (let g = 0; g < 4; g++) geo.setAttribute(`amb${g}`, new THREE.BufferAttribute(new Float32Array(16), 4).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex([0, 1, 3, 0, 3, 2]);
    geo.computeBoundingSphere();
    const data = new Uint8Array(MARK_CHUNK * MARK_CHUNK * 4); // colour to alpha: nothing yet (alpha 0)
    const tex = new THREE.DataTexture(data, MARK_CHUNK, MARK_CHUNK, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.colorSpace = THREE.NoColorSpace; // the look as the law gives it (colour to alpha), not a colour to convert
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    const mat = gpu.markMaterial(lights, { kind: KIND[s.matter], seed: seedOf(SEED_NAME(s.id)), pair: pairOf(s.matter), normal: mk.frame.normal, ink: tex, webgpu });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    pc = { geo, mat, tex, data, mesh, x0, y0, w, h, corners };
    mk.pieces.set(key, pc);
    lightPiece(mk, pc);
    return pc;
  }

  function free(mk) {
    for (const pc of mk.pieces.values()) {
      group.remove(pc.mesh);
      pc.geo.dispose();
      pc.mat.dispose();
      pc.tex.dispose();
    }
    mk.pieces.clear();
  }

  const api = {
    // A mark: on `surface` (a book surface id), its record's box (cells) set at
    // `origin` (the surface's page units) at `cellUnits` page units a cell.
    set(id, { surface, origin, cellUnits, box }) {
      const was = marks.get(id);
      if (was && was.surface === surface && was.origin.join() === origin.join() && was.cellUnits === cellUnits && was.box.join() === box.join()) return was;
      if (was) api.remove(id);
      const frame = surfaceFrame(geom, surface);
      const si = geom.surfaces.findIndex((s) => s.id === ROOM_SURFACE[surface]);
      // a thing's face (the pen's: rooms.md §3c) is a surface of its own, wood, wherever the thing lies
      const surf = si < 0 && frame ? { id: surface, matter: 'table', origin: frame.origin, u: frame.right, v: frame.down } : null;
      if (!frame || (si < 0 && !surf)) return null;
      const mk = { id, surface, origin: [...origin], cellUnits, box: [...box], frame, si, surf, pieces: new Map() };
      marks.set(id, mk);
      return mk;
    },
    // Cells x0..x0+w, y0..y0+h of the mark's record (its own cell frame): RGBA, w × h.
    put(id, x0, y0, w, h, rgba) {
      const mk = marks.get(id);
      if (!mk) return;
      const [bx, by, bw, bh] = mk.box;
      const ax = Math.max(x0, bx),
        ay = Math.max(y0, by),
        ex = Math.min(x0 + w, bx + bw),
        ey = Math.min(y0 + h, by + bh);
      if (ex <= ax || ey <= ay) return;
      for (let cy = Math.floor((ay - by) / MARK_CHUNK); cy * MARK_CHUNK + by < ey; cy++) {
        for (let cx = Math.floor((ax - bx) / MARK_CHUNK); cx * MARK_CHUNK + bx < ex; cx++) {
          const pc = pieceOf(mk, cx, cy);
          const px0 = Math.max(ax, pc.x0),
            py0 = Math.max(ay, pc.y0),
            px1 = Math.min(ex, pc.x0 + pc.w),
            py1 = Math.min(ey, pc.y0 + pc.h);
          if (px1 <= px0 || py1 <= py0) continue;
          for (let y = py0; y < py1; y++) {
            const from = ((y - y0) * w + (px0 - x0)) * 4;
            pc.data.set(rgba.subarray(from, from + (px1 - px0) * 4), ((y - pc.y0) * MARK_CHUNK + (px0 - pc.x0)) * 4);
          }
          pc.tex.needsUpdate = true;
        }
      }
    },
    // Live tiles of a mark being written (ink/live.js: 16 × 16 cells, RGBA).
    tiles(id, tiles) {
      for (const t of tiles) api.put(id, t.tx * 16, t.ty * 16, 16, 16, t.rgba);
    },
    remove(id) {
      const mk = marks.get(id);
      if (!mk) return;
      free(mk);
      marks.delete(id);
    },
    // The room's ambient light per patch (n × N): each piece's corners lit from it.
    light(a) {
      ambient = a;
      for (const mk of marks.values()) for (const pc of mk.pieces.values()) lightPiece(mk, pc);
    },
    // The grown cells' seeds changed (a view of another's room): every piece's.
    reseed() {
      for (const mk of marks.values()) for (const pc of mk.pieces.values()) pc.mat.seed.value = seedOf(SEED_NAME((mk.surf ?? geom.surfaces[mk.si]).id));
    },
    get size() {
      return marks.size;
    },
    dispose() {
      for (const mk of marks.values()) free(mk);
      marks.clear();
    },
  };
  return api;
}
