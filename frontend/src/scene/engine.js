// The scene's renderer (the scene spec, §1–3): three.js's WebGPURenderer, with
// WebGPU where the device has it and its WebGL2 backend elsewhere; the shading
// is one, in TSL (./nodes.js). One renderer for the whole page (one context).
// The page is always a 3D scene; 2D is that scene seen straight down, lit.
//
// A sheet is cut into chunks of CHUNK × CHUNK cells, each a displaced grid with
// its own small textures: heights and colour from the facts (law/v2/scene.js),
// the paper's detail, the moments' bands; and two it bakes for itself, its
// surface and its shade (nodes.js), redone only when its cells change or the
// light moves. Live writing uploads only the rectangles the pen touched.
//
// With one view on screen (write mode, a letter, a pad) the renderer draws
// straight into it; with several, each view's frame is copied to its own canvas.
// The papers rest on the table of a room (light-waves §4: roomDraw.js; or on
// whatever they were let go on), each casting a soft
// shadow; the room's surfaces are grown cell by cell in the shader, the window
// shows the outside; two candles stand on the table, burning down, their
// flames shivering with their light (light.js). Light is a range of waves: the
// shading goes bin by bin, through the eye. Torn cells are holes onto what is
// behind. Nothing here touches the record.
//
// Units: page px (x right, y down the page); three's world is (x, −y, z), z up:
// the room's axes, its metres × PX_PER_M, each view's page lying on the room's page.

import * as THREE from 'three';
import { frame } from './camera.js';
import { toHalf, halves } from './half.js';
import { TILE } from 'penpals-law/v1/constants'; // the law's tiles: live updates come in these
import { curves, paperCurve, cellReflectance, surface as grown, outsideMap, DIAMETER, PX_PER_M, N } from './light/index.js';
import { DROP_PX, DETAIL_PX } from './light/surface.js';
import { STAMPER, PEN, JAR, PENDULUM, HAND } from './light/room.js';
import { room as RL, outside as LO } from 'penpals-law';
import * as shine from './light/shine.js';
import { geomOf, worldOf, cloudOf } from './light.js';
import { roomMeshes, vertexLight, meanLight, lightAt, colorsOf, pairOf, pairOfRow } from './roomDraw.js';
import { SIGHT, MAILBOX } from './outside.js';
import { STONE_SQUAT } from './reach.js';
import { createShadows } from './shadows.js';
import { createMarks } from './marks.js';
import { SEED_NAME } from './surfaces.js';
import { roomSeedsOf } from '../room/seeds.js';
import { shelfLayout } from './shelf.js';

export const CHUNK = 128; // cells a side
const APRON = 4; // cells each chunk also holds of its neighbours: edges sample the same values (no seams)
const TEXN = CHUNK + 2 * APRON; // texels a side
export { DROP_PX }; // (a drop of height at true scale, page px: light/surface.js)
const SLAB_PX = 3; // the paper's thickness
const PAPER = [0xf7, 0xf3, 0xea]; // a page's colour until it says its own
const CLEAR = new THREE.Color(0, 0, 0); // behind everything (transparent: the page around shows)
const STAGE = TILE; // a live upload's largest rectangle: one tile
const MAX_RECTS = 64; // live rectangles a chunk queues before it is sent whole instead

// What the scene costs, for the benches (e2e/perf.mjs): frames drawn, the time
// spent drawing them (copies included; with globalThis.__sceneSync, WebGL2 waits
// for the GPU too, so the time is the whole frame's), texture bytes uploaded,
// chunks baked.
export const stats = { frames: 0, renderMs: 0, uploadBytes: 0, bakes: 0, chunks: 0, prepareMs: 0, mainMs: 0, tiles: 0, tilesMs: 0 };
globalThis.__sceneStats = stats;
// The views on the page (for the checks: e2e and the lab pages call reliefCheck).
const allViews = new Set();
globalThis.__sceneViews = allViews;
const SYNC_PX = new Uint8Array(4);

const HALF_ZERO = toHalf(0);

let shared = null; // { renderer, gpu: ./nodes.js, backend, views: Set, direct: the view drawn straight into, or null, size: [w, h] }

// The renderer, chosen once: WebGPU where the device has it (prefer 'webgl2' to
// skip it), else WebGL2. Views are made once this has settled.
// → 'webgpu' | 'webgl2'
let choosing = null;
export function engineReady(prefer = null) {
  choosing ??= (async () => {
    const gpu = await import('./nodes.js');
    let webgpu = false;
    if (prefer !== 'webgl2' && typeof navigator !== 'undefined' && navigator.gpu) {
      try {
        webgpu = !!(await navigator.gpu.requestAdapter());
      } catch {
        webgpu = false;
      }
    }
    const renderer = new gpu.WebGPURenderer({ antialias: false, alpha: true, stencil: true, logarithmicDepthBuffer: true, forceWebGL: !webgpu });
    await renderer.init();
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = renderer.domElement;
    canvas.className = 'scene-direct';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:block';
    shared = { renderer, gpu, backend: renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2', views: new Set(), direct: null, size: [0, 0] };
    return shared.backend;
  })();
  return choosing;
}

// A generic paper grain (non-canonical): the fine detail for sheets whose own
// paper this device does not have (a closed sheet seen by a visitor).
let genericDetail = null;
function generic() {
  if (genericDetail) return genericDetail;
  const n = 256;
  const d = new Uint8Array(n * n);
  let s = 0x2545f491;
  const rnd = () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * n; i++) d[i] = 40 + Math.floor(rnd() * 60);
  for (let k = 0; k < 900; k++) {
    // a few fibers
    let x = rnd() * n,
      y = rnd() * n;
    const a = rnd() * Math.PI,
      len = 8 + rnd() * 24;
    for (let t = 0; t < len; t++) {
      d[(Math.floor(y + n) % n) * n + (Math.floor(x + n) % n)] = 150;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  const tex = new THREE.DataTexture(d, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  genericDetail = tex;
  // how scattered blank paper's faces are, a texel a cell (light/shine.js: the shine of the flat paper)
  genericM2 =
    shine.slopeVariance(
      Float64Array.from(d, (v) => (v / 255) * DETAIL_PX),
      n,
    ) + shine.PAPER_SUB;
  return tex;
}
let genericM2 = null;

// Each texture its own starting version. The shared materials switch a binding
// between chunks' textures, and WebGPU (three 0.186) rebuilds a binding only when
// the new texture's version-at-creation differs from the old one's: all at 0, a
// chunk would keep another's texture. Spaced so later updates never meet.
let serial = 0;
const own = (tex) => {
  tex.version = ++serial * 1e6;
  return tex;
};
const linear = (tex) => {
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  return own(tex);
};
const halfTex = (data, w, h) => linear(new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType));
const byteTex = (data, w, h) => linear(new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType));
const bakeTarget = (type, n = TEXN) => {
  const rt = new THREE.RenderTarget(n, n, { type, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  own(rt.texture);
  return rt;
};

// Stand-ins of each texture kind, for the shared materials before a chunk gives its own.
// The baked kinds stand in with targets: on WebGL2 three reads a target with its
// rows turned over (to WebGPU's order, the one row order here: nodes.js down), by
// whether the texture a slot held when it last looked was a target; a slot
// started on a DataTexture, or on the same stand-in as another slot, keeps the
// wrong answer once the chunks' own come in, and the relief lies mirrored under
// the ink.
let blanks = null;
function blank() {
  if (blanks) return blanks;
  blanks = {
    half: halfTex(new Uint16Array(4), 1, 1),
    ink: halfTex(new Uint16Array(4), 1, 1),
    byte: byteTex(new Uint8Array(1), 1, 1),
    rgba: linear(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType)),
  };
  for (const t of Object.values(blanks)) t.needsUpdate = true;
  blanks.surface = bakeTarget(THREE.HalfFloatType, 1).texture;
  blanks.shade = bakeTarget(THREE.UnsignedByteType, 1).texture;
  return blanks;
}

// The staging rectangles live uploads pass through (one tile at most).
let stage = null;
function stages() {
  stage ??= {
    h: halfTex(new Uint16Array(STAGE * STAGE * 4), STAGE, STAGE),
    c: halfTex(new Uint16Array(STAGE * STAGE * 4), STAGE, STAGE),
    box: new THREE.Box2(new THREE.Vector2(), new THREE.Vector2()),
    at: new THREE.Vector2(),
  };
  return stage;
}

// The room (light-waves §4; roomDraw.js): its surfaces' meshes in metres, and
// their light, shared by every view (each places the room so its page lies on
// the room's page). The outside, as the window shows it: a map by direction.
const OUT_W = 64,
  OUT_H = 32;
const rooms = new Map(); // room shape name → its drawing (light.js geomOf)
function theRoom(name = 'room') {
  if (rooms.has(name)) return rooms.get(name);
  const GEOM = geomOf(name);
  const meshes = roomMeshes(GEOM);
  const geos = meshes.map((m) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('cellPos', new THREE.BufferAttribute(m.cellPos, 2));
    for (const name of ['ambA', 'ambB']) g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(m.touches.length * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(m.index);
    g.computeBoundingSphere();
    return g;
  });
  const panes = GEOM.openings
    .filter((o) => o.kind !== 'door')
    .map((o) => {
      const sf = GEOM.surfaces[o.surface];
      const [u0, u1, v0, v1] = o.rect;
      const at = (a, b) => [0, 1, 2].map((k) => sf.origin[k] + sf.u[k] * a + sf.v[k] * b);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([...at(u0, v0), ...at(u1, v0), ...at(u1, v1), ...at(u0, v1)], 3));
      g.setIndex([0, 1, 2, 0, 2, 3]);
      return g;
    });
  const outside = new THREE.DataTexture(new Uint16Array(OUT_W * OUT_H * 4), OUT_W, OUT_H, THREE.RGBAFormat, THREE.HalfFloatType);
  outside.colorSpace = THREE.NoColorSpace;
  outside.magFilter = outside.minFilter = THREE.LinearFilter;
  outside.wrapS = THREE.RepeatWrapping;
  const room = { meshes, geos, panes, outside, light: [], sunKey: '', sunMap: null, outAt: -1e9 };
  rooms.set(name, room);
  return room;
}
// The room's light from a moment's light (light.js): each vertex's colours, the outside's.
function lightRoom(l, now, R) {
  vertexLight(R.meshes, l.ambient, l.W, R.light);
  R.geos.forEach((g, i) => {
    g.attributes.ambA.array.set(R.light[i].A);
    g.attributes.ambB.array.set(R.light[i].B);
    g.attributes.ambA.needsUpdate = true;
    g.attributes.ambB.needsUpdate = true;
  });
  const cloud = cloudOf(l.weather); // (as the light takes it)
  const sunKey = [...l.sun.dir.map((v) => Math.round(v * 500)), cloud].join();
  if (sunKey !== R.sunKey) {
    R.sunKey = sunKey;
    R.sunMap = outsideMap(l.sun.dir, OUT_W, OUT_H, { cloud });
    R.outAt = -1e9;
  }
  if (now - R.outAt > 250) {
    // through the glass and the eye (a few times a second: the eye moves slowly)
    R.outAt = now;
    const glass = curves.MATTER.glass;
    const d = R.outside.image.data;
    for (let k = 0; k < OUT_W * OUT_H; k++) {
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let b = 0; b < N - 1; b++) v += l.W[c * N + b] * R.sunMap[k * N + b] * glass[b];
        d[4 * k + c] = toHalf(Math.min(60000, Math.max(0, v)));
      }
      d[4 * k + 3] = toHalf(1);
    }
    R.outside.needsUpdate = true;
  }
}

// A chunk's footprint, written only to the stencil.
const MASK = new THREE.MeshBasicMaterial({
  colorWrite: false,
  depthWrite: false,
  stencilWrite: true,
  stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc,
  stencilZPass: THREE.ReplaceStencilOp,
});

// Geometry for each level of detail, shared by every chunk.
const LODS = [64, 24, 6];
const lodGeo = LODS.map((n) => new THREE.PlaneGeometry(1, 1, n, n).translate(0.5, -0.5, 0));
// A chunk's grid: vertices at k/n, where the next chunk's edge has its own (so the
// two edges are the same heights at the same points: no step, no crack), and one
// more row and column a sliver past the right and bottom edges, over the next
// chunk, uv and all (the apron's cells): no hairline gap between them either.
const SLIVER = 0.3 / CHUNK;
function chunkGrid(n) {
  const ts = [...Array.from({ length: n + 1 }, (_, k) => k / n), 1 + SLIVER];
  const m = ts.length;
  const pos = new Float32Array(m * m * 3),
    uv = new Float32Array(m * m * 2),
    index = [];
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < m; i++) {
      const k = j * m + i;
      pos[3 * k] = ts[i];
      pos[3 * k + 1] = -ts[j];
      uv[2 * k] = ts[i];
      uv[2 * k + 1] = 1 - ts[j];
    }
  }
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < m - 1; i++) {
      const a = j * m + i;
      index.push(a, a + m, a + 1, a + 1, a + m, a + m + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}
const chunkGeo = LODS.map(chunkGrid);

const keyOf = (cx, cy) => (cy + 32768) * 65536 + (cx + 32768); // a chunk's number

// A view: `target` the 2D canvas it shows in (and takes the pointer); `host` the
// element the renderer's own canvas goes in when this view is drawn straight
// into; `invalidate()` asks for a frame (when how it is drawn changes).
export function createView(target, { host = null, invalidate = () => {}, seeds = null } = {}) {
  if (!shared) throw new Error('the scene: engineReady() first');
  const { renderer, gpu } = shared;
  const ctx = target.getContext('2d');
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(40, 1, 0.5, 60000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -60000, 60000);
  // what the room's things leave of each source (matter-fixes §4: shadows.js)
  const shadows = createShadows(gpu);
  const lights = gpu.lightUniforms(paperCurve(PAPER), DROP_PX, shadows.maps);
  lights.pxPerM.value = PX_PER_M;
  shadows.use(lights);
  let shadowSrc = null; // where the sources are now (setLight)
  // Each thing takes the room's light where it is (matter-fixes §4), not the room's mean:
  // the nearest patches' (roomDraw.js lightAt), as its matter's two colours. at: room m.
  let lightNow = null; // { ambient, W } (setLight)
  const E = new Float64Array(N);
  const lightHere = (meshes, at) => {
    if (!lightNow) return;
    lightAt(GEOM, lightNow.ambient, at, E);
    for (const mesh of meshes) {
      if (!mesh.material.matter) continue; // (not matter: a being's signature beside its head)
      const { A, B } = colorsOf(E, lightNow.W, mesh.material.matter);
      const a = (mesh.userData.ambient ??= { A: new THREE.Vector3(), B: new THREE.Vector3() });
      a.A.set(...A);
      a.B.set(...B);
    }
  };
  // A sheet takes the room's light where it lies (light-waves §4: a paper lies anywhere), as a thing does:
  // the room's settled light at its middle, less the sun's and the flames' own (light.js indirect), into its
  // chunks' and its flat paper's `room` (four vec4s).
  let lightOrigin = null; // the room's point at the world's origin (setLight)
  const sheetE = new Float64Array(N);
  const lightSheet = (s) => {
    if (!lightNow || !lightOrigin) return;
    const g = s.group.position;
    const at = [
      (s.origin[0] + g.x + (s.w * s.cellPx) / 2) / PX_PER_M + lightOrigin[0],
      (g.y - s.origin[1] - (s.h * s.cellPx) / 2) / PX_PER_M + lightOrigin[1],
      g.z / PX_PER_M + lightOrigin[2] + 0.001,
    ];
    lightAt(GEOM, lightNow.ambient, at, sheetE);
    s.room.forEach((v, k) => v.set(sheetE[4 * k], sheetE[4 * k + 1], sheetE[4 * k + 2], sheetE[4 * k + 3]));
  };
  const K = { APRON, CHUNK, TEXN, generic: generic(), blank: blank(), genericM2 };
  // each kind of material once, for every chunk (a chunk's own textures and numbers go
  // per object); with WebGPU, each chunk and sheet its own (nodes.js says why)
  const own = shared.backend === 'webgpu';
  const mats = {
    chunk: gpu.chunkMaterial(lights, K),
    surface: gpu.surfaceBake(lights, K),
    shade: gpu.shadeBake(lights, K),
    base: gpu.flatMaterial(lights, K),
    ground: gpu.flatMaterial(lights, K, null, true),
    slab: gpu.slabMaterial(lights, K),
  };
  // a sheet's base: drawn first, writing no depth, kept out of the chunks' footprints
  const asBase = (m) => Object.assign(m, { depthWrite: false, stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
  asBase(mats.base);
  // the bakes are drawn into these, then copied into the chunk's own (two bake pipelines in all)
  const baked = { surface: bakeTarget(THREE.HalfFloatType), shade: bakeTarget(THREE.UnsignedByteType) };
  // A stand-in chunk, baked and drawn (every pixel cut away) in the view's first
  // frame, so the three heavy shaders are made while the page loads, not at the
  // pen's first touch.
  const stand = {
    heightTex: K.blank.half,
    inkTex: K.blank.ink,
    detailTex: K.blank.byte,
    bandTex: K.blank.byte,
    surfRT: baked.surface,
    shadeRT: baked.shade,
    realDetail: 0,
    cellPx: 1,
    valid: new THREE.Vector4(2, 2, 3, 3),
    origin: new THREE.Vector2(),
    size: 1,
    room: Array.from({ length: 4 }, () => new THREE.Vector4()),
  };
  stand.mats = own ? { chunk: gpu.chunkMaterial(lights, K, stand), surface: gpu.surfaceBake(lights, K, stand), shade: gpu.shadeBake(lights, K, stand) } : mats;
  let warm = new THREE.Mesh(lodGeo[2], stand.mats.chunk);
  warm.userData.c = stand;
  warm.frustumCulled = false;
  const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e9);
  const held = new gpu.ClippingGroup(); // the sheets: the cut cuts all of them
  scene.add(held);
  lights.thick.value = SLAB_PX;
  // the room: the table the paper rests on (the sheets' shadows on its top), the
  // floor, the walls, the ceiling, the window and what stands about, all grown
  const GEOM = geomOf();
  const R = theRoom();
  const roomGroup = new THREE.Group(); // metres; placed by setLight so this view's page lies on the room's page
  // whose room this is: its surfaces grown from its owner's key (rooms.md §1;
  // seeds by name, as light/surface.js names them), else the shared defaults
  let roomSeeds = seeds;
  const seedOf = (name) => grown.seedMix(roomSeeds?.[name] ?? grown.DEFAULT_SEEDS[name] ?? grown.defaultSeed(name));
  const roomMats = [];
  R.meshes.forEach((m, i) => {
    const mat = gpu.roomMaterial(lights, { kind: m.kind, seed: seedOf(SEED_NAME(m.id)), pair: pairOf(m.matter), normal: m.normal, axes: m.axes, top: m.top, webgpu: own });
    mat.seedName = SEED_NAME(m.id);
    roomMats.push(mat);
    const mesh = new THREE.Mesh(R.geos[i], mat);
    if (m.top) mesh.renderOrder = -3; // first of all: the sheets' paper (which writes no depth) goes over it
    roomGroup.add(mesh);
  });
  // the beads on the window's glass (scene/glass.js heights, mm), as the view out bends through them
  const beadsTex = new THREE.DataTexture(new Uint16Array(256 * 307 * 4), 256, 307, THREE.RGBAFormat, THREE.HalfFloatType);
  beadsTex.colorSpace = THREE.NoColorSpace;
  beadsTex.magFilter = beadsTex.minFilter = THREE.LinearFilter;
  beadsTex.needsUpdate = true;
  const paneMat = gpu.windowMaterial(R.outside, lights, beadsTex);
  for (const g of R.panes) roomGroup.add(new THREE.Mesh(g, paneMat));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, 32).rotateX(Math.PI / 2);
  // the door and the window's shutters (outside.md Phase 4): wood; open, out of the way (the door swung
  // out, the shutters folded back: not drawn)
  const doorMat = Object.assign(gpu.objectMaterial(lights, { kind: grown.BOARD, seed: grown.thingSeed(seedOf('table'), 'door'), pair: pairOf('table'), webgpu: own }), { matter: 'table' });
  const doorMesh = new THREE.Mesh(box, doorMat);
  if (GEOM.door) {
    const d = GEOM.door;
    doorMesh.scale.set(d.x1 - d.x0, 0.04, d.z1 - d.z0);
    doorMesh.position.set((d.x0 + d.x1) / 2, 0, (d.z0 + d.z1) / 2);
    roomGroup.add(doorMesh);
    shadows.add(doorMesh);
  }
  const shutterMat = Object.assign(gpu.objectMaterial(lights, { kind: grown.BOARD, seed: grown.thingSeed(seedOf('table'), 'shutters'), pair: pairOf('table'), webgpu: own }), { matter: 'table' });
  const shutterMesh = new THREE.Mesh(box, shutterMat);
  {
    const w = GEOM.window;
    shutterMesh.scale.set(w.x1 - w.x0, 0.03, w.z1 - w.z0);
    shutterMesh.position.set((w.x0 + w.x1) / 2, GEOM.size[1] - 0.03, (w.z0 + w.z1) / 2);
    shutterMesh.visible = false;
    roomGroup.add(shutterMesh);
  }
  // the outside, when it is seen (scene/outside.js): the sky all round, drawn first behind everything;
  // the dirt, its stones, its trees (their wood as limbs, their leaves at their tips), the others' houses
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(4 * SIGHT, 32, 16), gpu.windowMaterial(R.outside, lights, beadsTex, { sky: true }));
  skyMesh.renderOrder = -10;
  skyMesh.visible = false;
  roomGroup.add(skyMesh);
  // The outside's matter (Tabor, 2026-10-25): each drawn thing a row of law/matter.js (its colour the row's),
  // grown cell by cell as the walls are where its row has a grower (light/surface.js: dirt, stone, bark, ...)
  // and detailed by the eye's distance: the ground's cells the world's (from its seed: law/outside.js SEED),
  // each stone, limb and stick its own (its seed from its id, its cells on its own shape).
  const WORLD_MIX = grown.seedOfText(LO.SEED);
  const outMat = (row, kind = null, { shape = 'box', cells = 'own', cover = null } = {}) =>
    Object.assign(gpu.objectMaterial(lights, { kind, seed: WORLD_MIX, pair: pairOfRow(row), shape, cells, webgpu: own, open: true, cover: cover && { pair: pairOfRow(cover) } }), {
      matter: pairOfRow(row),
      row,
      each: cells === 'instance',
      cover: cover && pairOfRow(cover),
    });
  const outMats = {
    ground: outMat('dirt', grown.DIRT, { cells: 'world', cover: 'grass' }), // (the meadow's grass over its dirt, as much as stands)
    stone: outMat('stone', grown.STONE, { shape: 'ball', cells: 'instance' }),
    chalk: outMat('chalk', grown.STONE, { shape: 'ball', cells: 'instance' }),
    ore: outMat('ore', grown.STONE, { shape: 'ball', cells: 'instance' }),
    wood: outMat('bark', grown.BARK, { shape: 'round', cells: 'instance' }),
    leaf: outMat('leaf'),
    grass: outMat('grass'),
    house: outMat('plaster', grown.PLASTER),
    mark: outMat('ink'),
    stick: outMat('bark', grown.BARK, { shape: 'round', cells: 'instance' }),
    timber: outMat('wood', grown.BOARD),
    water: outMat('water'),
    clay: outMat('clay', grown.DIRT, { cells: 'world' }),
    metal: outMat('metal', grown.BRASS),
    wax: outMat('wax', grown.WAX),
    chitin: outMat('chitin'),
    feather: outMat('feather'),
    ash: outMat('ash'),
  };

  // A house as it stands in the world (one-world.md: every house the same house): its walls and its roof
  // from outside (the room's walls and ceiling turned out), and inside it what a room has: its surfaces, its
  // table, its window's frame and glass, its door and shutters, open or shut as its acts left them. This
  // house's own outside is its walls turned out (inside, the room itself is drawn); another's, the whole of it.
  const turnedOut = (g) => {
    const h = new THREE.BufferGeometry();
    h.setAttribute('position', g.getAttribute('position'));
    const idx = Array.from(g.index.array);
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    h.setIndex(idx);
    h.computeVertexNormals();
    return h;
  };
  const withNormals = (g) => {
    const h = new THREE.BufferGeometry();
    h.setAttribute('position', g.getAttribute('position'));
    h.setIndex(Array.from(g.index.array));
    h.computeVertexNormals();
    return h;
  };
  const SHELL = new Set(['wall-near', 'wall-far', 'wall-left', 'wall-right', 'ceiling']);
  const shellGeos = R.meshes.flatMap((m, i) => (SHELL.has(m.id) ? [{ geo: turnedOut(R.geos[i]), id: m.id }] : []));
  const insideGeos = R.meshes.map((m, i) => ({ geo: withNormals(R.geos[i]), wood: m.kind === 'table' || m.kind === 'floor', id: m.id }));
  // each house's surfaces grown from its owner's key, as its walls are inside (room/seeds.js)
  const seeded = (mesh, seeds, id) => {
    const named = seeds?.[SEED_NAME(id)];
    mesh.userData.surface = id;
    if (named) mesh.userData.seed = grown.seedMix(named);
    else delete mesh.userData.seed;
    return mesh;
  };
  const ownShell = new THREE.Group(); // (this house's walls, from outside)
  for (const { geo, id } of shellGeos) ownShell.add(seeded(new THREE.Mesh(geo, outMats.house), roomSeeds, id));
  roomGroup.add(ownShell);
  const placeBox = (mesh, [x0, y0, z0, x1, y1, z1]) => {
    mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return mesh;
  };
  function houseAt(h) {
    const g = new THREE.Group();
    g.userData.house = true; // (its parts' geometry is shared: kept when it goes)
    g.position.set(...h.at);
    const seeds = roomSeedsOf(h.key);
    for (const { geo, id } of shellGeos) g.add(seeded(new THREE.Mesh(geo, outMats.house), seeds, id));
    for (const { geo, wood, id } of insideGeos) g.add(seeded(new THREE.Mesh(geo, wood ? outMats.timber : outMats.house), seeds, id));
    for (const pg of R.panes) g.add(new THREE.Mesh(pg, paneMat));
    for (const o of GEOM.objects) if (o.box && (o.kind === 'leg' || o.kind === 'frame')) g.add(placeBox(new THREE.Mesh(box, outMats.timber), o.box));
    const d = GEOM.door;
    if (d && !h.opens?.door) g.add(placeBox(new THREE.Mesh(box, outMats.timber), [d.x0, -0.02, d.z0, d.x1, 0.02, d.z1]));
    const w = GEOM.window;
    if (h.opens && !h.opens.shutters) g.add(placeBox(new THREE.Mesh(box, outMats.timber), [w.x0, GEOM.size[1] - 0.03, w.z0, w.x1, GEOM.size[1], w.z1]));
    g.traverse((o) => {
      o.frustumCulled = false;
    });
    return g;
  }
  const outsideGroup = new THREE.Group();
  roomGroup.add(outsideGroup);
  // the rain falling near the eye (scene/rain.js): each drop a streak along its way, as long as it fell while
  // the frame was being seen (since the last), as thick as it is
  let rainMesh = null;
  const rainQ = new THREE.Quaternion();
  const rainM = new THREE.Matrix4();
  function placeRain(r, dt) {
    if (!r || !r.n) {
      if (rainMesh) rainMesh.count = 0;
      return;
    }
    if (!rainMesh || rainMesh.instanceMatrix.count < r.n) {
      if (rainMesh) {
        roomGroup.remove(rainMesh);
        rainMesh.dispose();
      }
      rainMesh = new THREE.InstancedMesh(box, outMats.water, r.n);
      rainMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      rainMesh.frustumCulled = false;
      roomGroup.add(rainMesh);
    }
    const v = new THREE.Vector3(...r.velocity);
    const len = v.length() * dt;
    rainQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), v.clone().normalize());
    rainM.compose(new THREE.Vector3(), rainQ, new THREE.Vector3(r.D, r.D, Math.max(len, r.D)));
    const e = rainM.elements;
    const arr = rainMesh.instanceMatrix.array;
    for (let i = 0; i < r.n; i++) {
      arr.set(e, 16 * i);
      arr[16 * i + 12] = r.at[3 * i];
      arr[16 * i + 13] = r.at[3 * i + 1];
      arr[16 * i + 14] = r.at[3 * i + 2];
    }
    rainMesh.count = r.n;
    rainMesh.instanceMatrix.needsUpdate = true;
  }
  const pebble = new THREE.IcosahedronGeometry(1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, 6).rotateX(Math.PI / 2); // (along z)
  // The beings near (law/life.js beingsAt), moved each frame: each body a ball of what it is seen to be made
  // of (a bird its feathers, a bug its shell), its wings spread while it flies.
  const lifeGroup = new THREE.Group();
  roomGroup.add(lifeGroup);
  const lifeMeshes = new Map();
  const lifeMesh = (key, geom, mat, n) => {
    let im = lifeMeshes.get(key);
    if (!im || im.instanceMatrix.count < n) {
      if (im) {
        lifeGroup.remove(im);
        im.dispose();
      }
      im = new THREE.InstancedMesh(geom, mat, Math.max(16, 2 ** Math.ceil(Math.log2(Math.max(1, n)))));
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.frustumCulled = false;
      lifeGroup.add(im);
      lifeMeshes.set(key, im);
    }
    return im;
  };
  function placeLife(list) {
    const by = new Map();
    for (const b of list ?? []) {
      if (!by.has(b.matter)) by.set(b.matter, []);
      by.get(b.matter).push(b);
    }
    for (const [k, im] of lifeMeshes) if (!by.has(k.split(' ')[0])) im.count = 0;
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      zUp = new THREE.Vector3(0, 0, 1);
    for (const [matter, bs] of by) {
      const mat = outMats[matter] ?? outMats.wood;
      const body = lifeMesh(matter, pebble, mat, bs.length);
      bs.forEach((b, i) => body.setMatrixAt(i, m4.compose(new THREE.Vector3(...b.at), q.identity(), new THREE.Vector3(b.r, b.r, b.r))));
      body.count = bs.length;
      body.instanceMatrix.needsUpdate = true;
      const flying = bs.filter((b) => b.flying);
      const wings = lifeMesh(`${matter} wings`, box, mat, flying.length);
      flying.forEach((b, i) => wings.setMatrixAt(i, m4.compose(new THREE.Vector3(...b.at), q.setFromAxisAngle(zUp, b.heading), new THREE.Vector3(b.span / 6, b.span, b.r / 4))));
      wings.count = flying.length;
      wings.instanceMatrix.needsUpdate = true;
    }
  }
  // The ground near the eye (Tabor, 2026-10-25: detail by distance, its heights as its cells are): the law's
  // heights NEAR_STEP apart out to NEAR_M around the eye, the coarse grid beyond it leaving a hole for it, so
  // the eye close to the ground meets the ground it is drawn as. (Both a drawing's grain: Tabor's to set.)
  const NEAR_M = 3,
    NEAR_STEP = 0.05;
  let groundNow = null;
  const coarseCells = (g, hole) => {
    const idx = [];
    for (let j = 0; j < g.ny - 1; j++)
      for (let i = 0; i < g.nx - 1; i++) {
        if (hole && i >= hole[0] && i < hole[2] && j >= hole[1] && j < hole[3]) continue;
        const a = j * g.nx + i;
        idx.push(a, a + 1, a + g.nx + 1, a, a + g.nx + 1, a + g.nx);
      }
    return idx;
  };
  function placeGroundNear(eye) {
    const G = groundNow;
    if (!G?.at || !eye) return;
    const { g } = G;
    // the coarse grid's cells the fine patch covers, around the cell the eye is over
    const ci = Math.floor((eye[0] - g.x0) / g.step),
      cj = Math.floor((eye[1] - g.y0) / g.step);
    const n = Math.ceil(NEAR_M / g.step);
    const hole = [Math.max(0, ci - n), Math.max(0, cj - n), Math.min(g.nx - 1, ci + n + 1), Math.min(g.ny - 1, cj + n + 1)];
    if (G.hole && hole.every((v, k) => v === G.hole[k])) return;
    G.hole = hole;
    // (a new geometry: an index changed in place is not sent again)
    const was = G.coarse.geometry;
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', was.getAttribute('position'));
    cg.setAttribute('normal', was.getAttribute('normal'));
    cg.setAttribute('cover', was.getAttribute('cover'));
    cg.setIndex(coarseCells(g, hole));
    G.coarse.geometry = cg;
    was.dispose();
    if (G.fine) {
      outsideGroup.remove(G.fine);
      G.fine.geometry.dispose();
    }
    const x0 = g.x0 + hole[0] * g.step,
      y0 = g.y0 + hole[1] * g.step;
    const nx = Math.round(((hole[2] - hole[0]) * g.step) / NEAR_STEP) + 1,
      ny = Math.round(((hole[3] - hole[1]) * g.step) / NEAR_STEP) + 1;
    if (nx < 2 || ny < 2) return;
    const dx = ((hole[2] - hole[0]) * g.step) / (nx - 1),
      dy = ((hole[3] - hole[1]) * g.step) / (ny - 1);
    const pos = new Float32Array(nx * ny * 3),
      cover = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const [x, y] = [x0 + i * dx, y0 + j * dy];
        pos.set([x, y, G.at(x, y)], 3 * (j * nx + i));
        cover[j * nx + i] = G.cover?.(x, y) ?? 0;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('cover', new THREE.BufferAttribute(cover, 1));
    geo.setIndex(coarseCells({ nx, ny }, null));
    geo.computeVertexNormals();
    G.fine = new THREE.Mesh(geo, outMats.ground);
    G.fine.frustumCulled = false;
    outsideGroup.add(G.fine);
  }
  function placeOutside(o) {
    groundNow = null;
    for (const c of [...outsideGroup.children]) {
      outsideGroup.remove(c);
      if (c.userData.house) continue; // (a house: its parts' geometry is shared)
      if (c.geometry !== pebble && c.geometry !== rod && c.geometry !== box) c.geometry.dispose();
      c.dispose?.();
    }
    skyMesh.visible = !!o;
    if (!o) return;
    // the dirt: its heights on a grid (finer near the eye: placeGroundNear)
    const g = o.ground;
    const pos = new Float32Array(g.nx * g.ny * 3);
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) pos.set([g.x0 + i * g.step, g.y0 + j * g.step, g.z[j * g.nx + i]], 3 * (j * g.nx + i));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('cover', new THREE.BufferAttribute(g.cover ?? new Float32Array(g.nx * g.ny), 1)); // (its grass, of its fullest)
    geo.setIndex(coarseCells(g, null));
    geo.computeVertexNormals();
    for (const m of [outMats.ground, outMats.clay]) m.origin.set(...(o.origin ?? [0, 0]));
    groundNow = { g, at: o.groundAt ?? null, cover: o.grassAt ?? null, coarse: new THREE.Mesh(geo, outMats.ground), fine: null, hole: null };
    outsideGroup.add(groundNow.coarse);
    const m4 = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      zUp = new THREE.Vector3(0, 0, 1);
    // many of a kind at once; each its own matter where its material grows each one's cells (`each`): its
    // seed from its id (`seedId`, else its own), its size as its matrix scales it
    const sp = new THREE.Vector3(),
      sq = new THREE.Quaternion(),
      ss = new THREE.Vector3();
    const instanced = (geom, mat, list, set, seedId = (it, k) => it.id ?? `${it.at}:${k}`) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geom, mat, list.length);
      const each = mat.each ? new Float32Array(4 * list.length) : null;
      list.forEach((it, k) => {
        set(it);
        im.setMatrixAt(k, m4);
        if (!each) return;
        m4.decompose(sp, sq, ss);
        each.set([grown.thingSeed(WORLD_MIX, String(seedId(it, k))) & 0xffffff, ss.x, ss.y, ss.z], 4 * k);
      });
      if (each) im.geometry = geom.clone().setAttribute('thing', new THREE.InstancedBufferAttribute(each, 4));
      im.frustumCulled = false;
      outsideGroup.add(im);
    };
    for (const m of ['stone', 'chalk', 'ore'])
      instanced(
        pebble,
        outMats[m],
        o.stones.filter((s) => (s.matter ?? 'stone') === m),
        (s) => m4.compose(new THREE.Vector3(...s.at), q.identity(), new THREE.Vector3(s.r, s.r, s.r * STONE_SQUAT)),
      );
    // the ground's matter: ponds standing level, clay at their edges (a cell each)
    const flat = new THREE.PlaneGeometry(o.ground.step, o.ground.step);
    instanced(flat, outMats.water, o.water ?? [], (w) => m4.compose(new THREE.Vector3(w.at[0], w.at[1], w.level), q.identity(), new THREE.Vector3(1, 1, 1)));
    instanced(flat, outMats.clay, o.clay ?? [], (c) => m4.compose(new THREE.Vector3(c.at[0], c.at[1], c.at[2] + 0.01), q.identity(), new THREE.Vector3(1, 1, 1)));
    const limbs = o.trees.flatMap((t) => t.limbs.filter((l) => l.r > 0).map((l) => ({ ...l, id: t.id })));
    instanced(rod, outMats.wood, limbs, (l) => {
      const a = new THREE.Vector3(...l.from),
        b = new THREE.Vector3(...l.to);
      const along = b.clone().sub(a);
      const len = Math.max(along.length(), 1e-4);
      q.setFromUnitVectors(zUp, along.normalize());
      m4.compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(l.r, l.r, len));
    });
    // the sticks hands broke off and laid down, their wood as it was carved; the marks cut into trees
    instanced(
      rod,
      outMats.stick,
      (o.sticks ?? []).flatMap((s) => s.limbs.filter((l) => l.r > 0)),
      (l) => {
        const a = new THREE.Vector3(...l.from),
          b = new THREE.Vector3(...l.to);
        const along = b.clone().sub(a);
        const len = Math.max(along.length(), 1e-4);
        q.setFromUnitVectors(zUp, along.normalize());
        m4.compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(l.r, l.r, len));
      },
    );
    instanced(box, outMats.mark, o.marks ?? [], (m) => m4.compose(new THREE.Vector3(...m.at), q.identity(), new THREE.Vector3(m.size[1] * 4, m.size[1] * 4, m.size[0])));
    // the galls on the oaks (as big as a gall bug's grows: law/matter.js BEINGS), small and brown; a hive's comb
    // on its trunk, as big as its wax; a nest of grass in its fork, its eggs in it; feathers fallen under the trees
    instanced(pebble, outMats.wood, o.galls ?? [], (g) => m4.compose(new THREE.Vector3(...g.at), q.identity(), new THREE.Vector3(g.r, g.r, g.r)));
    instanced(pebble, outMats.wax, o.hives ?? [], (h) => m4.compose(new THREE.Vector3(...h.at), q.identity(), new THREE.Vector3(h.r, h.r, h.r)));
    instanced(pebble, outMats.grass, o.nests ?? [], (n) => m4.compose(new THREE.Vector3(...n.at), q.identity(), new THREE.Vector3(n.r, n.r, n.r / 2)));
    instanced(
      pebble,
      outMats.chalk,
      (o.nests ?? []).flatMap((n) => n.eggs),
      (e) => m4.compose(new THREE.Vector3(...e.at), q.identity(), new THREE.Vector3(e.r, e.r, e.r * 1.3)),
    );
    instanced(box, outMats.feather, o.feathers ?? [], (f) =>
      m4.compose(new THREE.Vector3(f.at[0], f.at[1], f.at[2] + 0.002), q.setFromAxisAngle(zUp, f.az), new THREE.Vector3(f.length, f.length / 8, 0.002)),
    );
    // the mailboxes (one-world.md): a box on a post by each door, its flag up while letters wait in it
    const mb = o.mailboxes ?? [];
    instanced(rod, outMats.stick, mb, (m) => m4.compose(new THREE.Vector3(m.at[0], m.at[1], m.at[2] + MAILBOX.post / 2), q.identity(), new THREE.Vector3(0.03, 0.03, MAILBOX.post)));
    instanced(box, outMats.stick, mb, (m) => m4.compose(new THREE.Vector3(m.at[0], m.at[1], m.at[2] + MAILBOX.post + MAILBOX.box[2] / 2), q.identity(), new THREE.Vector3(...MAILBOX.box)));
    instanced(box, outMats.metal, mb, (m) =>
      m.letters > 0
        ? m4.compose(new THREE.Vector3(m.at[0] + MAILBOX.box[0] / 2 + 0.01, m.at[1], m.at[2] + MAILBOX.post + MAILBOX.box[2] + 0.06), q.identity(), new THREE.Vector3(0.01, 0.05, 0.14))
        : m4.compose(new THREE.Vector3(m.at[0] + MAILBOX.box[0] / 2 + 0.01, m.at[1] + 0.06, m.at[2] + MAILBOX.post + MAILBOX.box[2] / 2), q.identity(), new THREE.Vector3(0.01, 0.14, 0.05)),
    );
    // the dead lying where they fell, each a ball of what it is seen to be made of
    for (const m of ['chitin', 'feather'])
      instanced(
        pebble,
        outMats[m],
        (o.dead ?? []).filter((x) => x.matter === m),
        (x) => m4.compose(new THREE.Vector3(x.at[0], x.at[1], x.at[2] + x.r), q.identity(), new THREE.Vector3(x.r, x.r, x.r)),
      );
    // what hands made, lying: a fibre or a string a thin rod; a lump, a gall, powder a heap; a cup, a
    // candle upright; metal a bar; an axe its stick with its stone; a fire, its wood glowing, burnt out its ash
    const SIZE = {
      fibre: [0.15, 0.004, 0.004],
      string: [0.3, 0.003, 0.003],
      lump: [0.05, 0.05, 0.035],
      gall: [0.02, 0.02, 0.02],
      powder: [0.04, 0.04, 0.01],
      cup: [0.04, 0.04, 0.06],
      candle: [0.012, 0.012, 0.12],
      metal: [0.06, 0.02, 0.01],
      axe: [0.4, 0.03, 0.03],
      fire: [0.12, 0.12, 0.08],
      ash: [0.1, 0.1, 0.015], // (a fire burnt out: its ash in a low heap)
    };
    const MAT = {
      grass: outMats.grass,
      clay: outMats.clay,
      pottery: outMats.clay,
      bark: outMats.wood,
      ore: outMats.ore,
      stone: outMats.stone,
      chalk: outMats.chalk,
      metal: outMats.metal,
      wax: outMats.wax,
      wood: outMats.stick,
      ash: outMats.ash,
    };
    for (const [matter, mat] of Object.entries(MAT))
      instanced(
        matter === 'wood' ? box : pebble,
        mat,
        (o.made ?? []).filter((m) => m.matter === matter),
        (m) => {
          const s = SIZE[m.kind] ?? [0.05, 0.05, 0.05];
          m4.compose(new THREE.Vector3(m.at[0], m.at[1], m.at[2] + s[2] / 2), q.identity(), new THREE.Vector3(...s));
        },
      );
    const leaves = o.trees.flatMap((t) => t.leaves);
    instanced(pebble, outMats.leaf, leaves, (l) => {
      const r = Math.sqrt(l.area / Math.PI);
      m4.compose(new THREE.Vector3(...l.at), q.identity(), new THREE.Vector3(r, r, r * 0.7));
    });
    for (const h of o.houses) outsideGroup.add(houseAt(h));
  }
  // the room's things (matter-fixes §3): each its matter grown on its own surface from
  // its own seed (the room's, and its name), so it looks the same to everyone
  const thingSeedOf = (name) => grown.thingSeed(seedOf('table'), name);
  const KIND_OF = { table: grown.BOARD, brass: grown.BRASS, wax: grown.WAX, wick: grown.WICK, cloth: grown.CLOTH, skin: grown.SKIN, ink: grown.WAX }; // (ink standing in a jar: a smooth liquid face, as poured wax's)
  const thingMat = (matter, thing, shape = 'box') =>
    Object.assign(gpu.objectMaterial(lights, { kind: KIND_OF[matter], seed: thing ? thingSeedOf(thing) : 0, pair: pairOf(matter), shape, webgpu: own }), { matter, thing });
  const objectMats = [];
  const objectMeshes = new Map(); // id → mesh (a holder goes where its candle is carried)
  // a thing leaning `lean` (radians) the way `way` ([ux, uy]) leans: a turn about the plane's line across that way
  const leanOf = (way, lean) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(-(way?.[1] ?? 0), way?.[0] ?? 1, 0), lean);
  // a part of a thing `along` up its length from its foot: standing, straight up; lying the way `lying` goes, along
  // the floor (its side, `r` round, on what holds it)
  const standOrLie = (mesh, foot, along, lying, r) => {
    if (!lying) {
      mesh.quaternion.identity();
      mesh.position.set(foot[0], foot[1], foot[2] + along);
      return;
    }
    mesh.quaternion.copy(leanOf(lying, Math.PI / 2));
    mesh.position.set(foot[0] + lying[0] * along, foot[1] + lying[1] * along, foot[2] + r);
  };
  for (const o of GEOM.objects) {
    const mat = thingMat(o.matter, o.id, o.box ? 'box' : 'round');
    objectMats.push(mat);
    const mesh = new THREE.Mesh(o.box ? box : disc, mat);
    objectMeshes.set(o.id, mesh);
    shadows.add(mesh);
    if (o.box) {
      const [x0, y0, z0, x1, y1, z1] = o.box;
      mesh.scale.set(x1 - x0, y1 - y0, z1 - z0);
      mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    } else {
      mesh.scale.set(o.radius, o.radius, o.z1 - o.z0);
      mesh.position.set(o.center[0], o.center[1], (o.z0 + o.z1) / 2);
    }
    roomGroup.add(mesh);
  }
  // the room is all around the eye: drawn whole (no culling), its shaders made now,
  // while the page loads (not when a wall first comes into view)
  roomGroup.traverse((o) => {
    o.frustumCulled = false;
  });
  scene.add(roomGroup);
  renderer.compileAsync?.(scene, persp).catch(() => {});
  // the shelf (rooms.md §3): its board, and the owner's books on it, spine out
  const shelf = { group: new THREE.Group(), mats: [] };
  roomGroup.add(shelf.group);
  // the pens (rooms.md §3c; law/room.js PENS): each a plain wooden body (its own grain) and a nib of
  // two brass tines. In the hand its nib is on the paper and its tines spread as wide as the line it
  // lays; set down, it lies on the table. (room m, in the room's group)
  const penMats = { tine: thingMat('brass', 'nib') };
  const pens = new Map(); // id → { group, body, tines, mat }
  for (const id of RL.PENS) {
    const mat = thingMat('table', id);
    const group = new THREE.Group();
    const body = new THREE.Mesh(box, mat);
    const tines = [new THREE.Mesh(box, penMats.tine), new THREE.Mesh(box, penMats.tine)];
    group.add(body, ...tines);
    for (const m of [body, ...tines]) shadows.add(m);
    group.visible = false;
    roomGroup.add(group);
    pens.set(id, { group, body, tines, mat });
  }
  const penBodyMats = [...pens.values()].map((p) => p.mat);
  // the ink jar (rooms.md §3c): oak gall ink standing in it (its glass is not drawn yet: NEEDS RULING)
  const jarMat = thingMat('ink', 'jar', 'round');
  const jar = new THREE.Mesh(disc, jarMat);
  shadows.add(jar);
  jar.visible = false;
  roomGroup.add(jar);
  // the stamper (rooms.md §3b): a wooden handle on a round brass face, set down face down
  const stamperMats = { handle: thingMat('table', 'stamper'), face: thingMat('brass', 'stamper-face', 'round') };
  const stamper = new THREE.Group();
  const stamperHandle = new THREE.Mesh(box, stamperMats.handle);
  const stamperFace = new THREE.Mesh(disc, stamperMats.face);
  stamper.add(stamperHandle, stamperFace);
  for (const m of [stamperHandle, stamperFace]) shadows.add(m);
  stamper.visible = false;
  roomGroup.add(stamper);
  // the pendulum (scene/light/room.js PENDULUM): its wooden stand (a round foot, a post, an arm), its thread and
  // its brass bob, where the bodies law has them (law/bodies.js bobAt)
  const pendulumMats = { stand: thingMat('table', 'pendulum'), bob: thingMat('brass', 'pendulum-bob', 'round'), thread: thingMat('cloth', 'pendulum-thread') };
  const pendulumStand = new THREE.Group();
  const pendulumFoot = new THREE.Mesh(disc, pendulumMats.stand);
  const pendulumPost = new THREE.Mesh(box, pendulumMats.stand);
  const pendulumArm = new THREE.Mesh(box, pendulumMats.stand);
  pendulumStand.add(pendulumFoot, pendulumPost, pendulumArm);
  const pendulumThread = new THREE.Mesh(box, pendulumMats.thread);
  const pendulumBob = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), pendulumMats.bob);
  for (const m of [pendulumFoot, pendulumPost, pendulumArm, pendulumBob]) shadows.add(m);
  roomGroup.add(pendulumStand, pendulumThread, pendulumBob);
  // the bare hands reaching in the room (law/bodies.js): each a palm of skin, where it is
  const handMat = thingMat('skin', 'hand', 'round');
  const handMeshes = [];
  function placeHands(list) {
    while (handMeshes.length < list.length) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), handMat);
      m.frustumCulled = false;
      roomGroup.add(m);
      shadows.add(m); // (a hand is matter: it stands in the light)
      handMeshes.push(m);
    }
    handMeshes.forEach((m, i) => {
      m.visible = i < list.length;
      if (!m.visible) return;
      m.scale.set(HAND.r, HAND.r, HAND.h / 2);
      m.position.set(list[i][0], list[i][1], list[i][2] + HAND.h / 2);
      lightHere([m], m.position.toArray()); // (and takes the room's light where it is)
    });
  }
  // one pen drawn, in the hand or lying (setPens)
  function drawPen({ group, body, tines }, p) {
    group.visible = !!p;
    if (!p) return;
    const { length: L, thick: T, tine: TL, tineW: TW } = PEN;
    if (p.place) {
      // lying along x, its nib to the right
      const [x, y, z] = p.place;
      lay(body, [x, y, z + T / 2], [-1, 0, 0], L, T, T);
      tines.forEach((m, k) => lay(m, [x + L / 2 + TL / 2, y + (k ? 1 : -1) * TW, z + T / 2], [1, 0, 0], TL, TW, TW));
      lightHere([body, ...tines], body.position.toArray());
      return;
    }
    // in the hand: rising from the nib toward the writer, 50° up
    const up = (50 * Math.PI) / 180;
    const dir = [0, -Math.cos(up), Math.sin(up)];
    const at = (d) => p.nib.map((v, k) => v + dir[k] * d);
    lay(body, at(TL + L / 2), dir, L, T, T);
    // the tines: from the point up the nib, apart across it by the line's width
    const a = ((p.across ?? 0) * Math.PI) / 180;
    const side = [Math.cos(a), -Math.sin(a), 0]; // (the page's y is the room's −y)
    const half = Math.max(TW / 2, (p.spread ?? 0) / 2);
    tines.forEach((m, k) => {
      const o = (k ? 1 : -1) * half;
      lay(
        m,
        at(TL / 2).map((v, j) => v + side[j] * o),
        dir,
        TL,
        TW,
        TW,
      );
    });
    lightHere([body, ...tines], body.position.toArray());
  }
  const upZ = new THREE.Vector3(0, 0, 1);
  const q = new THREE.Quaternion();
  // a box of length `len` along `dir` (unit), its middle at `mid`, `w` × `h` across
  function lay(mesh, mid, dir, len, w, h) {
    mesh.position.set(...mid);
    q.setFromUnitVectors(upZ, new THREE.Vector3(...dir));
    mesh.quaternion.copy(q);
    mesh.scale.set(w, h, len);
  }
  // the others in the room (rooms.md §4): each a ball of a body, a head that turns, two hands, a pen.
  // Their matter is made once for the view: a being coming, hiding or going makes no new shaders.
  const ball = new THREE.SphereGeometry(1, 24, 16);
  const beings = new Map(); // name → { group, body, head, face, hands, pen }
  // Each is matter, grown (matter-fixes §3): cloth, skin, its face's dark cotton, a brass pen,
  // each part from the being's own seed (its name's), so it looks the same in every room.
  const beingMats = { cloth: thingMat('cloth', null, 'ball'), skin: thingMat('skin', null, 'ball'), dark: thingMat('wick', null, 'ball'), pen: thingMat('brass') };
  const allBeingMats = Object.values(beingMats);
  const beingSeed = (name, part) => grown.thingSeed(grown.seedMix(grown.defaultSeed(`being ${name}`)), part);
  // their shaders made now, while the room loads, on specks no one sees: one built when
  // someone first comes in would stall the pen mid-stroke
  const specks = new THREE.Group();
  for (const m of allBeingMats) {
    const speck = new THREE.Mesh(m === beingMats.pen ? box : ball, m);
    speck.scale.setScalar(1e-6);
    speck.frustumCulled = false;
    specks.add(speck);
  }
  roomGroup.add(specks);
  const made = () => roomGroup.remove(specks);
  (renderer.compileAsync?.(specks, persp, scene) ?? Promise.resolve()).then(made, made);
  function beingOf(name) {
    let b = beings.get(name);
    if (b) return b;
    const group = new THREE.Group();
    const part = (geo, m, id) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.userData.seed = beingSeed(name, id);
      group.add(mesh);
      shadows.add(mesh);
      return mesh;
    };
    const M = beingMats;
    b = {
      group,
      body: part(ball, M.cloth, 'body'),
      head: part(ball, M.skin, 'head'),
      face: part(ball, M.dark, 'face'),
      hands: [part(ball, M.skin, 'hand-0'), part(ball, M.skin, 'hand-1')],
      pen: part(box, M.pen, 'pen'),
      sign: null,
    };
    // their signature beside their head (its look, as anyone who may see it sees it)
    new THREE.TextureLoader().load(
      `/api/signatures/${encodeURIComponent(name)}/look`,
      (tex) => {
        if (beings.get(name) !== b) return tex.dispose();
        tex.colorSpace = THREE.SRGBColorSpace;
        b.sign = new THREE.Sprite(gpu.signMaterial(tex));
        b.sign.userData.aspect = tex.image.height / Math.max(1, tex.image.width);
        group.add(b.sign);
        invalidate?.();
      },
      undefined,
      () => {}, // (one they may not see: no signature)
    );
    roomGroup.add(group);
    beings.set(name, b);
    return b;
  }
  // ink on the room's surfaces (rooms.md §2): drawn in the surfaces' own cells
  const marks = createMarks({ gpu, lights, group: roomGroup, geom: GEOM, meshes: R.meshes, seedOf, webgpu: own });
  // two candles standing on it, either side of the page: wax, a wick, a flame
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const candleMats = [];
  const candles = [0, 1].map((i) => {
    const wax = new THREE.Mesh(cylinder, thingMat('wax', `candle-${i}`, 'round'));
    const wick = new THREE.Mesh(cylinder, thingMat('wick', `wick-${i}`, 'round'));
    candleMats.push(wax.material, wick.material);
    shadows.add(wax);
    shadows.add(wick); // (the flame itself, hot gas, blocks nothing)
    const flame = new THREE.Sprite(gpu.flameMaterial());
    flame.center.set(0.5, 0.18); // its foot on the wick
    flame.renderOrder = 10;
    for (const o of [wax, wick, flame]) scene.add(o);
    return { wax, wick, flame };
  });
  // the bakes: a quad over a chunk's own target
  const bakeScene = new THREE.Scene();
  const bakeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  bakeQuad.frustumCulled = false;
  bakeScene.add(bakeQuad);
  const bakeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const sheets = new Map();
  let section = null;
  let cam3 = persp;
  let ground = null;
  let groundSize = null; // [w, h] page px while a page lies under the sheets
  let lightKey = '';
  let visible = true;
  let wasDirect = false;

  function makeChunk(sheet, cx, cy) {
    const n = TEXN * TEXN;
    const c = {
      cx,
      cy,
      h: new Uint16Array(n * 4).fill(HALF_ZERO), // heights, half floats: (top, above, depth, flags)
      ink: new Uint16Array(n * 4), // the ink by its absorbances, half floats: (three channels, oak gall)
      det: new Uint8Array(n),
      band: new Uint8Array(n),
      rects: [], // live rectangles to upload: [x, y, w, h] texels
      full: true, // the whole chunk to upload
      surfDirty: true,
      shadeDirty: true,
      realDetail: 0,
      cellPx: sheet.cellPx,
      room: sheet.room, // (the light where the sheet lies)
    };
    c.heightTex = halfTex(c.h, TEXN, TEXN);
    c.inkTex = halfTex(c.ink, TEXN, TEXN);
    c.detailTex = byteTex(c.det, TEXN, TEXN);
    c.bandTex = byteTex(c.band, TEXN, TEXN);
    c.surfRT = bakeTarget(THREE.HalfFloatType);
    c.shadeRT = bakeTarget(THREE.UnsignedByteType);
    // the part of the chunk inside the sheet's box (with the sliver where the sheet goes on)
    const s0 = (sheet.x0 - cx * CHUNK) / CHUNK,
      s1 = (sheet.x0 + sheet.w - cx * CHUNK) / CHUNK;
    const t0 = (sheet.y0 - cy * CHUNK) / CHUNK,
      t1 = (sheet.y0 + sheet.h - cy * CHUNK) / CHUNK;
    const u0 = Math.max(0, s0),
      u1 = Math.min(1 + SLIVER, s1);
    const v0 = Math.max(0, t0),
      v1 = Math.min(1 + SLIVER, t1);
    // cut only at the sheet's own edges: a pixel on a chunk's edge may be shaded
    // at its centre, just outside, and a cut there would leave a hairline hole
    c.valid = new THREE.Vector4(s0 > 0 ? s0 : -1, t0 > 0 ? t0 : -1, s1 < 1 + SLIVER ? s1 : 2, t1 < 1 + SLIVER ? t1 : 2);
    const size = CHUNK * sheet.cellPx;
    const left = sheet.origin[0] + (cx * CHUNK - sheet.x0) * sheet.cellPx,
      top = sheet.origin[1] + (cy * CHUNK - sheet.y0) * sheet.cellPx;
    c.origin = new THREE.Vector2(left, -top);
    c.size = size;
    if (own) c.mats = { chunk: gpu.chunkMaterial(lights, K, c), surface: gpu.surfaceBake(lights, K, c), shade: gpu.shadeBake(lights, K, c) };
    c.mesh = new THREE.Mesh(chunkGeo[0], c.mats?.chunk ?? mats.chunk);
    c.mesh.userData.c = c;
    c.mesh.visible = u1 > u0 && v1 > v0; // (a chunk held only for its apron)
    c.mesh.scale.set(size, size, 1);
    c.mesh.position.set(left, -top, 0);
    c.mesh.renderOrder = 1; // over the sheet's base
    sheet.group.add(c.mesh);
    // its footprint in the stencil: the sheet's base stays out of it, so a tear is a hole
    c.mask = new THREE.Mesh(lodGeo[2], MASK);
    c.mask.visible = c.mesh.visible;
    c.mask.scale.set((u1 - u0) * size, (v1 - v0) * size, 1);
    c.mask.position.set(left + u0 * size, -(top + v0 * size), 0);
    c.mask.renderOrder = -1;
    sheet.group.add(c.mask);
    sheet.chunks.set(keyOf(cx, cy), c);
    stats.chunks++;
    return c;
  }
  const chunkAt = (sheet, cx, cy) => sheet.chunks.get(keyOf(cx, cy)) ?? makeChunk(sheet, cx, cy);
  function freeChunk(c) {
    for (const t of [c.heightTex, c.inkTex, c.detailTex, c.bandTex]) t.dispose();
    c.surfRT.dispose();
    c.shadeRT.dispose();
    for (const m of Object.values(c.mats ?? {})) m.dispose();
  }

  // Each chunk that holds a rectangle of cells (x0..x1, y0..y1, exclusive): its
  // own and the neighbours whose apron reaches it, with the overlap in the
  // rectangle's cells and in the chunk's texels.
  function eachHolder(sheet, x0, y0, x1, y1, fn) {
    const kx0 = Math.floor((x0 - CHUNK + APRON) / CHUNK) + 1,
      kx1 = Math.floor((x1 - 1 + APRON) / CHUNK);
    const ky0 = Math.floor((y0 - CHUNK + APRON) / CHUNK) + 1,
      ky1 = Math.floor((y1 - 1 + APRON) / CHUNK);
    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        const ox = kx * CHUNK - APRON,
          oy = ky * CHUNK - APRON; // the cell at the chunk's texel 0
        const ax = Math.max(x0, ox),
          ay = Math.max(y0, oy),
          bx = Math.min(x1, ox + TEXN),
          by = Math.min(y1, oy + TEXN);
        if (ax < bx && ay < by) fn(chunkAt(sheet, kx, ky), ax, ay, bx, by, ox, oy);
      }
    }
  }

  // Cells into the chunks, from a box of half-float heights and RGBA colour
  // (w × h cells, x0, y0 in the sheet's cells), as whole rows.
  function putBox(sheet, x0, y0, w, h, hf, abs, live) {
    const cx0 = Math.max(x0, sheet.x0),
      cy0 = Math.max(y0, sheet.y0);
    const cx1 = Math.min(x0 + w, sheet.x0 + sheet.w),
      cy1 = Math.min(y0 + h, sheet.y0 + sheet.h);
    if (cx0 >= cx1 || cy0 >= cy1) return;
    eachHolder(sheet, cx0, cy0, cx1, cy1, (c, ax, ay, bx, by, ox, oy) => {
      const n = bx - ax;
      for (let y = ay; y < by; y++) {
        const src = (y - y0) * w + (ax - x0),
          dst = (y - oy) * TEXN + (ax - ox);
        c.h.set(hf.subarray(src * 4, (src + n) * 4), dst * 4);
        c.ink.set(abs.subarray(src * 4, (src + n) * 4), dst * 4);
      }
      if (live && !c.full && c.rects.length < MAX_RECTS * 4) c.rects.push(ax - ox, ay - oy, n, by - ay);
      else {
        c.full = true; // (out of sight, live rectangles wait: past a few, the whole chunk goes up once)
        c.rects.length = 0;
      }
    });
  }

  function slab(sheet) {
    const w = sheet.w * sheet.cellPx,
      h = sheet.h * sheet.cellPx;
    const geo = new THREE.BufferGeometry();
    const x0 = sheet.origin[0],
      y0 = -sheet.origin[1],
      x1 = x0 + w,
      y1 = y0 - h,
      z0 = 0,
      z1 = -SLAB_PX;
    const quads = [
      [x0, y0, x1, y0],
      [x1, y0, x1, y1],
      [x1, y1, x0, y1],
      [x0, y1, x0, y0],
    ];
    const pos = [];
    for (const [ax, ay, bx, by] of quads) pos.push(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z0, bx, by, z1, ax, ay, z1);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(geo, mats.slab);
  }

  // Upload what changed and bake what needs it, for every chunk of every sheet.
  // WebGPU writes a changed rectangle straight from the chunk's arrays into its
  // texture (each three.js copy is a queue submission of its own); WebGL2 goes
  // through the staging tile.
  const device = own ? renderer.backend.device : null;
  const onGpu = (tex) => (device ? renderer.backend.get(tex).texture : null);
  function prepare() {
    const st = device ? null : stages();
    for (const s of sheets.values()) {
      for (const c of s.chunks.values()) {
        if (c.full) {
          c.heightTex.needsUpdate = true;
          c.inkTex.needsUpdate = true;
          c.full = false;
          c.rects.length = 0;
          c.surfDirty = true;
          stats.uploadBytes += TEXN * TEXN * 16;
        } else if (c.rects.length) {
          const ht = onGpu(c.heightTex),
            ct = onGpu(c.inkTex);
          if (device && !(ht && ct)) {
            // (not on the GPU yet: the whole chunk goes up with its first draw)
            c.heightTex.needsUpdate = true;
            c.inkTex.needsUpdate = true;
            c.rects.length = 0;
          }
          for (let i = 0; i < c.rects.length; i += 4) {
            const x = c.rects[i],
              y = c.rects[i + 1],
              w = c.rects[i + 2],
              h = c.rects[i + 3];
            const at = (y * TEXN + x) * 4;
            if (device) {
              const size = { width: w, height: h };
              device.queue.writeTexture({ texture: ht, origin: { x, y } }, c.h, { offset: at * c.h.BYTES_PER_ELEMENT, bytesPerRow: TEXN * 4 * c.h.BYTES_PER_ELEMENT, rowsPerImage: h }, size);
              device.queue.writeTexture({ texture: ct, origin: { x, y } }, c.ink, { offset: at * c.ink.BYTES_PER_ELEMENT, bytesPerRow: TEXN * 4 * c.ink.BYTES_PER_ELEMENT, rowsPerImage: h }, size);
              stats.uploadBytes += w * h * 16;
              continue;
            }
            for (let r = 0; r < h; r++) {
              const from = ((y + r) * TEXN + x) * 4;
              st.h.image.data.set(c.h.subarray(from, from + w * 4), r * STAGE * 4);
              st.c.image.data.set(c.ink.subarray(from, from + w * 4), r * STAGE * 4);
            }
            st.box.min.set(0, 0);
            st.box.max.set(w, h);
            st.at.set(x, y);
            st.h.needsUpdate = true;
            st.c.needsUpdate = true;
            renderer.copyTextureToTexture(st.h, c.heightTex, st.box, st.at);
            renderer.copyTextureToTexture(st.c, c.inkTex, st.box, st.at);
            stats.uploadBytes += w * h * 16;
          }
          c.rects.length = 0;
          c.surfDirty = true;
        }
        if (c.detailDirty) {
          c.detailTex.needsUpdate = true;
          c.detailDirty = false;
          c.surfDirty = true;
          stats.uploadBytes += TEXN * TEXN;
        }
        if (c.bandDirty) {
          c.bandTex.needsUpdate = true;
          c.bandDirty = false;
          stats.uploadBytes += TEXN * TEXN;
        }
        if (!c.mesh.visible) continue;
        if (c.surfDirty) {
          bake(c, 'surface', c.surfRT);
          c.surfDirty = false;
          c.shadeDirty = true;
        }
        if (c.shadeDirty || c.lightKey !== lightKey) {
          bake(c, 'shade', c.shadeRT);
          c.shadeDirty = false;
          c.lightKey = lightKey;
        }
      }
    }
    renderer.setRenderTarget(null);
  }
  // (WebGL2 bakes into one shared target and copies: a chunk's own target would be a
  // framebuffer of its own to set up; WebGPU's passes are cheap to aim anywhere)
  function bake(c, kind, into) {
    bakeQuad.material = c.mats?.[kind] ?? mats[kind];
    bakeQuad.userData.c = c;
    renderer.setRenderTarget(own ? into : baked[kind]);
    renderer.render(bakeScene, bakeCam);
    if (!own) renderer.copyTextureToTexture(baked[kind].texture, into.texture);
    stats.bakes++;
  }

  // The check (the relief under the ink): for every chunk drawn, its raw heights,
  // its baked surface and its ink, sampled as the chunk samples them and read
  // back. The surface is the heights' mean over 3 × 3 cells, so laid exactly on
  // them it matches that mean taken here (r ≈ 1); moved by a cell it matches
  // worse, upside down not at all. → [{ sheet, cx, cy, inked (texels), asIs,
  // mirrored (the heights' mean against the surface: correlations), best
  // ([dx, dy, r]: the move within 3 cells that matches best), ink, inkMirrored
  // (the ink's alpha against the surface: a groove under the ink is as much its
  // own as a ridge, so its size counts, not its sign) }], a correlation null
  // where a side is flat.
  let alignRT = null;
  const aligns = new Map();
  async function reliefCheck() {
    alignRT ??= new THREE.RenderTarget(CHUNK, CHUNK, { type: THREE.FloatType, depthBuffer: false, generateMipmaps: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const out = [];
    const M = 3; // the farthest move tried (and the cells kept clear of the edge for it)
    for (const s of sheets.values()) {
      for (const c of s.chunks.values()) {
        if (!c.mesh.visible) continue;
        let m = own ? c.mats.align : aligns.get('shared');
        if (!m) {
          m = gpu.alignMaterial(K, own ? c : null);
          if (own) c.mats.align = m;
          else aligns.set('shared', m);
        }
        bakeQuad.material = m;
        bakeQuad.userData.c = c;
        renderer.setRenderTarget(alignRT);
        renderer.render(bakeScene, bakeCam);
        renderer.setRenderTarget(null);
        const px = await renderer.readRenderTargetPixelsAsync(alignRT, 0, 0, CHUNK, CHUNK);
        const at = (x, y, k) => px[4 * (y * CHUNK + x) + k];
        const mean = (x, y) => {
          let t = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) t += at(x + i, y + j, 0);
          return t / 9;
        };
        // a(x, y) against the surface at (x + dx, y + dy), or at the mirrored row
        const corr = (a, flip, dx = 0, dy = 0) => {
          let n = 0,
            sa = 0,
            sb = 0,
            saa = 0,
            sbb = 0,
            sab = 0;
          for (let y = M + 1; y < CHUNK - M - 1; y++) {
            for (let x = M + 1; x < CHUNK - M - 1; x++) {
              const p = a(x, y),
                q = at(x + dx, flip ? CHUNK - 1 - y : y + dy, 1);
              n++;
              sa += p;
              sb += q;
              saa += p * p;
              sbb += q * q;
              sab += p * q;
            }
          }
          const va = saa / n - (sa / n) ** 2,
            vb = sbb / n - (sb / n) ** 2;
          return va > 1e-12 && vb > 1e-12 ? (sab / n - (sa / n) * (sb / n)) / Math.sqrt(va * vb) : null;
        };
        const ink = (x, y) => at(x, y, 2);
        let inked = 0;
        for (let k = 0; k < CHUNK * CHUNK; k++) if (px[4 * k + 2] > 0.1) inked++;
        let best = [0, 0, -2];
        for (let dy = -M; dy <= M; dy++) {
          for (let dx = -M; dx <= M; dx++) {
            const r = corr(mean, false, dx, dy) ?? -2;
            if (r > best[2]) best = [dx, dy, r];
          }
        }
        out.push({ sheet: s.id, cx: c.cx, cy: c.cy, inked, asIs: corr(mean, false), mirrored: corr(mean, true), best, ink: corr(ink, false), inkMirrored: corr(ink, true) });
      }
    }
    return out;
  }

  const view = {
    reliefCheck,
    // A sheet: its cells (x0, y0, w, h in its own cell frame), shown at `origin`
    // (page px of cell x0, y0) with `cellPx` page px a cell.
    setSheet(id, { x0, y0, w, h, origin, cellPx }) {
      view.removeSheet(id);
      const sheet = { id, x0, y0, w, h, origin, cellPx, chunks: new Map(), group: new THREE.Group(), room: lights.indirect.array.map((v) => v.clone()) };
      sheet.slab = slab(sheet);
      sheet.group.add(sheet.slab);
      // the paper itself, lit, where no chunk holds anything: one flat sheet under
      // the chunks (drawn first, writing no depth, so a chunk always shows over it)
      const grain = { detailScale: new THREE.Vector2(w / 256, h / 256), cellPx, room: sheet.room };
      sheet.base = new THREE.Mesh(lodGeo[2], own ? asBase(gpu.flatMaterial(lights, K, grain)) : mats.base);
      sheet.base.userData.c = grain;
      sheet.base.renderOrder = 0;
      sheet.base.scale.set(w * cellPx, h * cellPx, 1);
      sheet.base.position.set(origin[0], -origin[1], 0);
      sheet.group.add(sheet.base);
      held.add(sheet.group);
      sheets.set(id, sheet);
      lightSheet(sheet);
      return sheet;
    },
    // A sheet in the hand (one-world.md: the held sheet follows the hand): drawn moved by [dx, dy] (page px)
    // and lifted z (page px) from where it lies, until it is set down (where a move puts it anew).
    liftSheet(id, [dx, dy] = [0, 0], z = 0) {
      const s = sheets.get(id);
      if (!s) return;
      s.group.position.set(dx, -dy, z);
      lightSheet(s);
    },
    removeSheet(id) {
      const s = sheets.get(id);
      if (!s) return;
      s.slab.geometry.dispose();
      if (own) s.base.material.dispose();
      for (const c of s.chunks.values()) freeChunk(c);
      held.remove(s.group);
      sheets.delete(id);
    },
    // A whole field (law/v2/scene.js: surface, above, depth, abs, flags over the box).
    setField(id, f) {
      const s = sheets.get(id);
      const [bx, by, w, h] = f.box;
      const hf = new Uint16Array(w * h * 4);
      for (let k = 0; k < w * h; k++) {
        hf[4 * k] = toHalf(f.surface[k] + f.above[k]);
        hf[4 * k + 1] = toHalf(f.above[k]);
        hf[4 * k + 2] = toHalf(f.depth[k]);
        hf[4 * k + 3] = toHalf(f.flags[k]);
      }
      putBox(s, bx, by, w, h, hf, halves(f.abs), false);
    },
    // Live tiles from the ink worker: 16 × 16 cells, the height field and the ink's
    // absorbances as half floats (ink/live.js: { tx, ty, hf, abs }).
    setTiles(id, tiles) {
      const s = sheets.get(id);
      if (!s) return;
      const t0 = performance.now();
      for (const t of tiles) putBox(s, t.tx * TILE, t.ty * TILE, TILE, TILE, t.hf ?? EMPTY_TILE, t.abs ?? EMPTY_TILE, true);
      stats.tiles += tiles.length;
      stats.tilesMs += performance.now() - t0;
    },
    // The paper's own detail (own and open sheets: law/v2/scene.js paperDetail), over the box.
    setDetail(id, detail, box) {
      const s = sheets.get(id);
      const [bx, by, w, h] = box;
      eachHolder(s, bx, by, bx + w, by + h, (c, ax, ay, bx2, by2, ox, oy) => {
        for (let y = ay; y < by2; y++) c.det.set(detail.subarray((y - by) * w + (ax - bx), (y - by) * w + (bx2 - bx)), (y - oy) * TEXN + (ax - ox));
        c.realDetail = 1;
        c.detailDirty = true;
      });
    },
    // Show the moments: 1 where a cell's band is odd (law/v2/moments.js bandOf), over the box; null hides them.
    setBands(id, bands, box) {
      const s = sheets.get(id);
      if (!s) return;
      for (const c of s.chunks.values()) {
        c.band.fill(0);
        c.bandDirty = true;
      }
      s.banded = !!bands;
      lights.bandOn.value = [...sheets.values()].some((o) => o.banded) ? 1 : 0;
      if (!bands) return;
      const [bx, by, w, h] = box;
      eachHolder(s, bx, by, bx + w, by + h, (c, ax, ay, bx2, by2, ox, oy) => {
        for (let y = ay; y < by2; y++) {
          for (let x = ax; x < bx2; x++) c.band[(y - oy) * TEXN + (x - ox)] = bands[(y - by) * w + (x - bx)] === 1 ? 255 : 0;
        }
      });
    },
    // The paper's colour (sRGB 0..255): each pad and letter has its own.
    setPaper([r, g, b]) {
      gpu.setSpectrum(lights.paper, paperCurve([r, g, b]));
    },
    // How much taller than true the relief is drawn (a drop's height × this). Scene only.
    setRelief(x) {
      if (lights.dropPx.value === DROP_PX * x) return;
      lights.dropPx.value = DROP_PX * x;
      for (const s of sheets.values()) for (const c of s.chunks.values()) c.surfDirty = true;
    },
    // The light at this moment (light.js), for a view whose page starts at
    // `origin` in the room (light.js originOf): the sun through the window, each
    // flame where its candle has burnt down to, the room's light at the page, the eye.
    // the outside as it is seen (scene/outside.js outsideNear: null when nothing is), and the door and the
    // shutters open or shut
    setOutside(o) {
      placeOutside(o);
      if (!o) placeLife(null);
    },
    // where the eye is (room m): the ground near it drawn fine
    setEyeNear(eye) {
      placeGroundNear(eye);
    },
    // the beings near, where each is now: [{ at (room m), r, matter, flying, span, heading }]
    setLife(list) {
      placeLife(list);
    },
    // the bare hands reaching in the room now: [[x, y, z] (each one's foot, room m)]
    setHands(list) {
      placeHands(list ?? []);
    },
    // the rain near the eye now (scene/rain.js rainNear), and how long since it was last drawn (s)
    setRain(r, dt) {
      placeRain(r, dt);
    },
    setOpens({ door = false, shutters = true } = {}) {
      doorMesh.visible = !door;
      shutterMesh.visible = !shutters;
    },
    // the beads on the window (glass.js heights: m, w × h over the window, top row first)
    setBeads(h, w, hh) {
      const d = beadsTex.image.data;
      const W = beadsTex.image.width,
        H = beadsTex.image.height;
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const v = h ? h[Math.min(hh - 1, Math.floor((j * hh) / H)) * w + Math.min(w - 1, Math.floor((i * w) / W))] * 1000 : 0;
          d[4 * (j * W + i)] = toHalf(v);
        }
      beadsTex.needsUpdate = true;
    },
    setLight(l, origin) {
      const lift = groundSize ? -SLAB_PX : 0; // a page lies on the table under the sheets: the table sits lower
      const W = (p) => {
        const w = worldOf(p, origin);
        w[2] += lift;
        return w;
      };
      roomGroup.scale.setScalar(PX_PER_M);
      roomGroup.position.set(-origin[0] * PX_PER_M, -origin[1] * PX_PER_M, -origin[2] * PX_PER_M + lift);
      const t = GEOM.table;
      lights.slabMin.value.set(...W([t.x0, t.y0, t.bottom]));
      lights.slabMax.value.set(...W([t.x1, t.y1, t.top]));
      lightRoom(l, performance.now(), R);
      marks.light(l.ambient);
      // (what a thing not yet placed takes)
      for (const m of [
        ...objectMats,
        ...candleMats,
        ...shelf.mats,
        ...allBeingMats,
        ...penBodyMats,
        penMats.tine,
        jarMat,
        stamperMats.handle,
        stamperMats.face,
        ...Object.values(pendulumMats),
        doorMat,
        shutterMat,
      ]) {
        const { A, B } = meanLight(l.ambient, GEOM.patches.length, l.W, m.matter);
        m.ambient.A.set(...A);
        m.ambient.B.set(...B);
      }
      lightNow = { ambient: l.ambient, W: l.W };
      lights.sunDir.value.set(...l.sun.dir); // the room's axes are the world's
      gpu.setSpectrum(lights.sunE, l.sun.E);
      const g = l.geom;
      const [x0] = W([g.window.x0, 0, 0]);
      const [x1] = W([g.window.x1, 0, 0]);
      const z0 = W([0, 0, g.window.z0])[2];
      const z1 = W([0, 0, g.window.z1])[2];
      lights.window.value.set(x0, x1, z0, z1);
      lights.wallY.value = W([0, g.size[1], 0])[1];
      gpu.setSpectrum(lights.indirect, l.indirect);
      lightOrigin = origin;
      for (const s of sheets.values()) lightSheet(s);
      // what lies outside takes the sky's light (on a level face: the light's), and the sun straight
      if (l.sunOut) gpu.setSpectrum(lights.sunOut, l.sunOut);
      if (l.skyE)
        for (const m of Object.values(outMats)) {
          const c = colorsOf(l.skyE, l.W, m.matter);
          m.ambient.A.set(...c.A);
          m.ambient.B.set(...c.B);
          if (m.cover) m.coverAmbient.set(...colorsOf(l.skyE, l.W, m.cover).A);
        }
      if (l.haze) {
        gpu.setSpectrum(lights.haze, l.haze.ext);
        gpu.setSpectrum(lights.haze, l.haze.sca, 1, gpu.BIN_GROUPS);
      }
      // a strike's flash on the clouds, through the glass and the eye; the rain falling past
      const glass = curves.MATTER.glass;
      const fl = [0, 1, 2].map((c) => (l.flash ? l.flash.reduce((s, v, b) => s + (b < N - 1 ? l.W[c * N + b] * v * glass[b] : 0), 0) : 0));
      paneMat.flash.value.set(...fl);
      const mm = l.weather?.rain ?? 0;
      paneMat.rain.value.set(mm > 0 ? 1 - Math.exp(-mm / 2) : 0, 1.5, performance.now() / 1000, 0);
      for (let c = 0; c < 3; c++) gpu.setSpectrum(lights.W[c], l.W.subarray(c * 17, c * 17 + 17));
      // the candles: wax from the table up to where it has burnt down, the wick, the flame
      const r = (DIAMETER / 2) * PX_PER_M;
      l.flames.forEach((fl, i) => {
        const at = W(fl.pos);
        lights.candleAt[i].value.set(...at);
        gpu.setSpectrum(lights.flameI[i], fl.I);
        lights.flameR[i].value = (fl.flameSize / 2) * PX_PER_M; // (seen in a mirror, still this big)
        const foot = W(fl.foot);
        const top = foot[2] + fl.height * PX_PER_M;
        const wickH = (fl.wick / 1000) * PX_PER_M;
        const { wax, wick, flame } = candles[i];
        // carried, it leans with the hand (rooms.md §3b), or lies the way it fell, its holder under it
        const lean = ((fl.tilt ?? 0) * Math.PI) / 180;
        const [ux, uy] = fl.way ?? [1, 0];
        const turn = leanOf(fl.way, lean);
        const up = top - foot[2];
        wax.position.set(foot[0], foot[1], foot[2]);
        wax.quaternion.copy(turn);
        wax.scale.set(r, r, Math.max(1, up));
        wick.position.set(foot[0] + Math.sin(lean) * up * ux, foot[1] + Math.sin(lean) * up * uy, foot[2] + Math.cos(lean) * up);
        wick.quaternion.copy(turn);
        wick.scale.set(r * 0.06, r * 0.06, wickH);
        const holder = objectMeshes.get(`holder-${i}`);
        if (holder) {
          holder.position.set(fl.foot[0], fl.foot[1], fl.foot[2] + (holder.scale.z || 0) / 2);
          holder.quaternion.copy(turn);
        }
        flame.visible = fl.lit;
        const fh = fl.flameSize * PX_PER_M;
        flame.position.set(at[0], at[1], at[2] - fh * 0.32);
        flame.scale.set(fh * 0.42, fh, 1);
        flame.material.brightness.value = fl.lit ? 1 : 0;
        flame.material.core.value.setRGB(...fl.seen);
        lightHere([wax], [fl.foot[0], fl.foot[1], fl.foot[2] + fl.height / 2]);
        lightHere([wick], fl.pos);
      });
      // each thing, lit where it stands
      for (const mesh of objectMeshes.values()) lightHere([mesh], mesh.position.toArray());
      for (const mesh of shelf.group.children) lightHere([mesh], mesh.position.toArray());
      for (const p of pens.values()) if (p.group.visible) lightHere([p.body, ...p.tines], p.body.position.toArray());
      if (jar.visible) lightHere([jar], jar.position.toArray());
      for (const b of beings.values()) lightHere(b.group.children, b.body.position.toArray());
      // the sources, for what blocks them
      const sunUp = l.sun.E.some((v) => v > 0);
      shadowSrc = {
        flames: l.flames.map((fl, i) => ({ at: lights.candleAt[i].value, lit: fl.lit })),
        sun: { dir: lights.sunDir.value, lit: sunUp },
        mid: new THREE.Vector3(...W([g.size[0] / 2, g.size[1] / 2, g.size[2] / 2])),
        pxPerM: PX_PER_M,
      };
      // the shade is baked again when the light has really moved (not for the flicker)
      lightKey = l.key;
    },
    // Whose room: { [name]: [s0, s1] } (light/surface.js names: floor, ceiling,
    // wall-near, wall-far, wall-left, wall-right, table), from the owner's key.
    setSeeds(next) {
      roomSeeds = next;
      for (const m of roomMats) m.seed.value = seedOf(m.seedName);
      for (const m of ownShell.children) seeded(m, roomSeeds, m.userData.surface); // (its walls from outside: whose they are)
      for (const m of [...objectMats, ...candleMats, ...shelf.mats, ...penBodyMats, penMats.tine, jarMat, stamperMats.handle, stamperMats.face, ...Object.values(pendulumMats)])
        if (m.thing) m.seedBase = thingSeedOf(m.thing);
      marks.reseed();
    },
    // The others in the room (rooms.md §4): [{ name, pose: { pos (the head, room m), yaw,
    // pitch, body, size }, hidden? }], as they are now (the view glides them between their acts).
    setBeings(list) {
      globalThis.__beingsDrawn = () => [...beings].map(([n, b]) => ({ name: n, sign: !!b.sign, pen: b.pen.visible })); // (for the checks: e2e/oneworld.mjs)
      const here = new Set();
      for (const { name, pose, hidden, pen } of list ?? []) {
        if (!pose) continue;
        here.add(name);
        const b = beingOf(name);
        b.group.visible = !hidden;
        if (hidden) continue;
        const s = pose.size ?? 1;
        const rad = (d) => (d * Math.PI) / 180;
        const [x, y, z] = pose.pos;
        const by = rad(pose.body ?? pose.yaw),
          hy = rad(pose.yaw),
          hp = rad(pose.pitch);
        const ahead = (a, d) => [Math.sin(a) * d, Math.cos(a) * d];
        b.head.position.set(x, y, z);
        b.head.scale.setScalar(0.1 * s);
        // the face looks where the head does
        const f = [Math.sin(hy) * Math.cos(hp), Math.cos(hy) * Math.cos(hp), Math.sin(hp)];
        b.face.position.set(x + f[0] * 0.085 * s, y + f[1] * 0.085 * s, z + f[2] * 0.085 * s);
        b.face.scale.set(0.035 * s, 0.035 * s, 0.02 * s);
        b.body.position.set(x, y, z - 0.42 * s);
        b.body.scale.set(0.2 * s, 0.2 * s, 0.26 * s);
        b.hands.forEach((h, i) => {
          const [ax, ay] = ahead(by, 0.22 * s);
          const [sx, sy] = ahead(by + (i ? 1 : -1) * (Math.PI / 2), 0.16 * s);
          h.position.set(x + ax + sx, y + ay + sy, z - 0.38 * s);
          h.scale.setScalar(0.045 * s);
        });
        const [px, py] = ahead(by, 0.24 * s);
        const [qx, qy] = ahead(by + Math.PI / 2, 0.16 * s);
        b.pen.visible = !!pen; // (a pen in their hand only while they hold one: what else they hold is drawn where it is)
        b.pen.position.set(x + px + qx, y + py + qy, z - 0.33 * s);
        b.pen.scale.set(0.008 * s, 0.008 * s, 0.13 * s);
        if (b.sign) {
          const [rx, ry] = ahead(hy + Math.PI / 2, 0.24 * s);
          b.sign.position.set(x + rx, y + ry, z + 0.06 * s);
          b.sign.scale.set(0.3 * s, 0.3 * s * b.sign.userData.aspect, 1);
        }
        lightHere(b.group.children, b.body.position.toArray());
      }
      for (const [name, b] of beings) {
        if (here.has(name)) continue;
        roomGroup.remove(b.group);
        for (const m of b.group.children) shadows.remove(m);
        beings.delete(name);
      }
    },
    // The pens (rooms.md §3c), room m: { [id]: p } with p in the hand { nib: [x, y, z] (its point),
    // spread (m: the tines apart, the line's width), across (degrees in the page: the tines' spread) }
    // or set down { place: [x, y, z] (where it lies on the table) }; null or absent: not drawn.
    setPens(all) {
      for (const [id, one] of pens) drawPen(one, all?.[id] ?? null);
    },
    // The jar (rooms.md §3c), room m: its foot [x, y, z] (in the hand, or where it stands); null: not drawn.
    // lying: the way it lies (law/bodies.js), or null standing.
    setJar(at, lying = null) {
      jar.visible = !!at;
      if (!at) return;
      jar.scale.set(JAR.radius, JAR.radius, JAR.height);
      standOrLie(jar, at, JAR.height / 2, lying, JAR.radius);
      lightHere([jar], jar.position.toArray());
    },

    // The stamper (rooms.md §3b), room m: its face's foot [x, y, z] (in the hand, or where it lies); null: not drawn.
    setStamper(at, lying = null) {
      stamper.visible = !!at;
      if (!at) return;
      const [x, y, z] = at;
      const faceH = 0.006;
      stamperFace.scale.set(STAMPER.face, STAMPER.face, faceH);
      standOrLie(stamperFace, at, faceH / 2, lying, STAMPER.grip);
      stamperHandle.scale.set(STAMPER.grip, STAMPER.grip, STAMPER.handle - faceH);
      standOrLie(stamperHandle, at, faceH + (STAMPER.handle - faceH) / 2, lying, STAMPER.grip);
      lightHere([stamperHandle, stamperFace], [x, y, z + STAMPER.handle / 2]);
    },
    // The pendulum (room m): its stand's foot, the way it lies (null: standing), its bob's middle; null: not drawn.
    setPendulum(at, lying = null, bob = null) {
      for (const m of [pendulumStand, pendulumThread, pendulumBob]) m.visible = !!at;
      if (!at) return;
      const P = PENDULUM;
      pendulumStand.position.set(...at);
      pendulumStand.quaternion.copy(lying ? leanOf(lying, Math.PI / 2) : new THREE.Quaternion());
      pendulumFoot.scale.set(P.foot, P.foot, 0.012);
      pendulumFoot.position.set(0, 0, 0.006);
      pendulumPost.scale.set(P.post * 2, P.post * 2, P.height);
      pendulumPost.position.set(0, 0, P.height / 2);
      pendulumArm.scale.set(P.arm + P.post, P.post * 2, P.post * 2);
      pendulumArm.position.set((P.arm - P.post) / 2, 0, P.height - P.post);
      const tied = lying ? null : [at[0] + P.arm, at[1], at[2] + P.height - P.post * 2];
      pendulumBob.visible = pendulumThread.visible = !!bob && !!tied;
      if (bob && tied) {
        pendulumBob.scale.setScalar(P.bob);
        pendulumBob.position.set(...bob);
        const d = new THREE.Vector3(bob[0] - tied[0], bob[1] - tied[1], bob[2] - tied[2]);
        const len = d.length();
        pendulumThread.scale.set(0.001, 0.001, len);
        pendulumThread.position.set((bob[0] + tied[0]) / 2, (bob[1] + tied[1]) / 2, (bob[2] + tied[2]) / 2);
        pendulumThread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize());
      }
      lightHere([pendulumFoot, pendulumPost, pendulumArm, pendulumBob, pendulumThread], [at[0], at[1], at[2] + P.height / 2]);
    },
    // The shelf's books (rooms.md §3): [{ id, color: [r, g, b] }], the dye their cloth is bound in.
    setShelf(books) {
      for (const o of [...shelf.group.children]) {
        shelf.group.remove(o);
        shadows.remove(o);
      }
      for (const m of shelf.mats) m.dispose();
      shelf.mats = [];
      if (!books?.length) return;
      const { board, books: boxes } = shelfLayout(GEOM, books.length);
      const put = (b, mat) => {
        const mesh = new THREE.Mesh(box, mat);
        mesh.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
        mesh.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
        shelf.group.add(mesh);
        shadows.add(mesh);
        lightHere([mesh], mesh.position.toArray());
      };
      const wood = thingMat('table', 'shelf');
      shelf.mats.push(wood);
      put(board, wood);
      boxes.forEach((b, k) => {
        // its cloth: the fibre's own threads (light and dark), dyed: the dye drinks through them as ink
        // does (light/matter.js), nothing painted
        const dye = books[k].color.map((c) => 1024 * Math.log(255 / Math.max(1, c)));
        const cloth = { light: cellReflectance(Float64Array.from(curves.MATTER.cloth.light), dye), dark: cellReflectance(Float64Array.from(curves.MATTER.cloth.dark), dye) };
        const mat = gpu.objectMaterial(lights, { kind: grown.CLOTH, seed: thingSeedOf(`book:${books[k].id}`), pair: cloth, webgpu: own });
        mat.matter = cloth;
        shelf.mats.push(mat);
        put(b, mat);
      });
    },
    // Ink on a surface (scene/marks.js): a mark set, its cells, its live tiles, gone.
    setMark(id, spec) {
      marks.set(id, spec);
    },
    putMark(id, x0, y0, w, h, abs) {
      marks.put(id, x0, y0, w, h, abs);
    },
    setMarkTiles(id, tiles) {
      const t0 = performance.now();
      marks.tiles(id, tiles);
      stats.tiles += tiles.length;
      stats.tilesMs += performance.now() - t0;
    },
    removeMark(id) {
      marks.remove(id);
    },
    // The cut (page px, a → b): everything on the far side is cut away and the
    // cross-section (the side view's picture, law/v2/look.js) stands in the cut.
    setCut(cut) {
      if (section) {
        scene.remove(section);
        section.userData.picture.dispose();
        section.material.dispose();
        section.geometry.dispose();
        section = null;
      }
      held.clippingPlanes = cut ? [clip] : [];
      if (!cut) return;
      const [a, b] = cut.line;
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      // keep the near side (toward the viewer's left of a → b)
      const normal = new THREE.Vector3(dy / len, dx / len, 0);
      clip.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(a[0], -a[1], 0));
      if (cut.image) {
        const { width: iw, height: ih, rgba } = cut.image;
        const tex = new THREE.DataTexture(new Uint8Array(rgba), iw, ih, THREE.RGBAFormat);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        const hPx = (ih / iw) * len;
        const geo = new THREE.PlaneGeometry(len, hPx);
        section = new THREE.Mesh(geo, gpu.cutMaterial(tex));
        section.userData.picture = tex;
        section.position.set((a[0] + b[0]) / 2, -(a[1] + b[1]) / 2, -SLAB_PX + hPx / 2 - hPx * 0.55);
        section.rotation.set(Math.PI / 2, 0, -Math.atan2(dy, dx), 'ZXY');
        scene.add(section);
      }
    },
    // On screen or not (out of sight it draws nothing; with one view on screen
    // the renderer draws straight into it).
    setVisible(v) {
      if (visible === v) return;
      visible = v;
      if (v) shared.views.add(view);
      else shared.views.delete(view);
      settleDirect();
    },
    // Draw: the camera (camera.js state) over w × h device px.
    render(cam, w, h) {
      const t0 = performance.now();
      if (target.width !== w || target.height !== h) {
        target.width = w;
        target.height = h;
      }
      const direct = shared.direct === view;
      if (direct && renderer.domElement.parentNode !== host) host.insertBefore(renderer.domElement, host.firstChild);
      if (direct && !wasDirect) ctx.clearRect(0, 0, target.width, target.height);
      wasDirect = direct;
      if (shared.size[0] !== w || shared.size[1] !== h) {
        // (setting it costs, even unchanged)
        renderer.setSize(w, h, false);
        shared.size = [w, h];
      }
      const aspect = w / Math.max(1, h);
      const f = frame(cam);
      const toW = (p) => new THREE.Vector3(p[0], -p[1], p[2]);
      let camera;
      if (cam.mode === '2d') {
        const halfW = cam.view / 2,
          halfH = halfW / aspect;
        ortho.left = -halfW;
        ortho.right = halfW;
        ortho.top = halfH;
        ortho.bottom = -halfH;
        camera = ortho;
      } else {
        persp.fov = cam.fov;
        persp.aspect = aspect;
        // close flight (the depth buffer is logarithmic); a pose's near plane follows what is nearest it
        persp.near = cam.mode === 'pose' ? Math.max(1e-4, cam.near ?? 1) : Math.max(1e-4, cam.dist / 1000);
        persp.far = cam.mode === 'pose' ? 120000 : cam.dist * 40 + 60000; // the room, wall to wall
        camera = persp;
      }
      camera.position.copy(toW(f.eye));
      camera.up.copy(toW(f.up));
      camera.lookAt(cam.mode === 'pose' ? toW(f.eye.map((v, k) => v + f.forward[k])) : toW([cam.target[0], cam.target[1], 0]));
      camera.updateProjectionMatrix();
      cam3 = camera;
      // how fine to grow the room's surfaces: cells a pixel covers a metre away
      lights.footK.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / h / grown.CELL_M;
      // detail by distance (one level a sheet: no cracks between chunks)
      const eye = camera.position;
      for (const s of sheets.values()) {
        const mid = new THREE.Vector3(s.origin[0] + (s.w * s.cellPx) / 2, -(s.origin[1] + (s.h * s.cellPx) / 2), 0);
        const near = Math.max(1, eye.distanceTo(mid) - (Math.max(s.w, s.h) * s.cellPx) / 2);
        const pxPerCell = cam.mode === '2d' ? (w / cam.view) * s.cellPx : (h / (2 * Math.tan((cam.fov * Math.PI) / 360) * near)) * s.cellPx;
        const lod = pxPerCell > 0.6 ? 0 : pxPerCell > 0.15 ? 1 : 2;
        for (const c of s.chunks.values()) if (c.mesh.geometry !== chunkGeo[lod]) c.mesh.geometry = chunkGeo[lod];
      }
      if (warm) {
        for (const kind of ['surface', 'shade']) {
          bakeQuad.material = stand.mats[kind];
          bakeQuad.userData.c = stand;
          renderer.setRenderTarget(baked[kind]);
          renderer.render(bakeScene, bakeCam);
        }
        renderer.setRenderTarget(null);
        scene.add(warm);
      }
      const rests = lights.rests.array,
        onPage = lights.onPage.array;
      for (const v of rests) v.set(0, 0, 0, 0);
      for (const v of onPage) v.set(0, 0, 0, 0);
      let k = 0;
      for (const sh of sheets.values()) {
        if (k >= rests.length) break;
        const x0 = sh.origin[0],
          y1 = -sh.origin[1];
        (groundSize ? onPage : rests)[k++].set(x0, y1 - sh.h * sh.cellPx, x0 + sh.w * sh.cellPx, y1);
      }
      if (groundSize) rests[0].set(0, -groundSize[1], groundSize[0], 0);
      const t1 = performance.now();
      prepare();
      shadows.update(renderer, shadowSrc);
      const t2 = performance.now();
      renderer.setClearColor(CLEAR, 0);
      renderer.render(scene, camera);
      stats.prepareMs += t2 - t1;
      stats.mainMs += performance.now() - t2;
      if (warm) {
        scene.remove(warm);
        warm = null;
      }
      if (!direct) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(renderer.domElement, 0, 0, w, h);
      }
      if (globalThis.__sceneSync && shared.backend === 'webgl2') {
        const gl = renderer.backend.gl;
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, SYNC_PX);
      }
      stats.frames++;
      stats.renderMs += performance.now() - t0;
    },
    // A page the sheets lie on (the lobby's slip, a pad's page): paper, lit, a sheet's
    // thickness below them, so a tear in one shows the page behind. null: the table.
    setGround(size) {
      if (ground) {
        scene.remove(ground);
        if (own) ground.material.dispose();
        ground = null;
      }
      groundSize = null;
      if (!size) return;
      const [w, h] = size;
      const grain = { detailScale: new THREE.Vector2(w / 128, h / 128), cellPx: 0.5 };
      ground = new THREE.Mesh(lodGeo[2], own ? gpu.flatMaterial(lights, K, grain, true) : mats.ground);
      ground.userData.c = grain;
      ground.scale.set(w, h, 1);
      ground.position.z = -SLAB_PX;
      ground.renderOrder = -2; // drawn first: the sheets' own paper shows over it
      scene.add(ground);
      groundSize = [w, h];
    },
    // The page close up: crisp cells, or smooth between them.
    setCrisp(on) {
      lights.crisp.value = on ? 1 : 0;
    },
    dispose() {
      for (const id of [...sheets.keys()]) view.removeSheet(id);
      marks.dispose();
      view.setShelf(null);
      view.setBeings(null);
      for (const m of penBodyMats) m.dispose();
      jarMat.dispose();
      penMats.tine.dispose();
      stamperMats.handle.dispose();
      stamperMats.face.dispose();
      for (const m of Object.values(pendulumMats)) m.dispose();
      shadows.dispose();
      for (const m of allBeingMats) m.dispose();
      ball.dispose();
      view.setGround(null);
      view.setCut(null);
      shared.views.delete(view);
      allViews.delete(view);
      settleDirect();
      bakeQuad.geometry.dispose();
      for (const m of Object.values(mats)) m.dispose();
      for (const m of [...roomMats, ...objectMats, paneMat]) m.dispose();
      box.dispose();
      disc.dispose();
      for (const c of candles) for (const o of [c.wax, c.wick, c.flame]) o.material.dispose();
      cylinder.dispose();
      baked.surface.dispose();
      baked.shade.dispose();
      if (own) for (const m of Object.values(stand.mats)) m.dispose();
      alignRT?.dispose();
      for (const m of aligns.values()) m.dispose();
    },
    get camera() {
      return cam3;
    },
    // Where the light comes from (for the checks, e2e/shadows.mjs): each flame (world px), the
    // room in the world (world = room m × scale + at), and the sheets.
    sources() {
      return {
        flames: lights.candleAt.map((u) => u.value.toArray()),
        room: { scale: roomGroup.scale.x, at: roomGroup.position.toArray() },
        sheets: [...sheets.values()].map((sh) => ({ x0: sh.origin[0], y0: sh.origin[1], w: sh.w * sh.cellPx, h: sh.h * sh.cellPx })), // (page px: world x, −y)
      };
    },
    host,
    invalidate,
  };
  shared.views.add(view);
  allViews.add(view);
  settleDirect();
  return view;
}

// Draw straight into the one view on screen; with several (or none), each is copied.
function settleDirect() {
  const on = [...shared.views];
  const next = on.length === 1 && on[0].host !== null ? on[0] : null;
  if (next === shared.direct) return;
  const was = shared.direct;
  shared.direct = next;
  if (!next) shared.renderer.domElement.remove();
  was?.invalidate();
  next?.invalidate();
  for (const v of on) if (v !== next && v !== was) v.invalidate();
}

const EMPTY_TILE = new Uint16Array(TILE * TILE * 4).fill(HALF_ZERO);
