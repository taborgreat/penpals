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
// The paper rests on the table of a room (light-waves §4: roomDraw.js; a
// journal's sheets on its page, the page on the table), each casting a soft
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
import { toHalf } from './half.js';
import { TILE } from 'penpals-law/v1/constants'; // the law's tiles: live updates come in these
import { curves, paperCurve, surface as grown, outsideMap, DIAMETER, PX_PER_M, N } from './light/index.js';
import { geomOf, worldOf } from './light.js';
import { roomMeshes, vertexLight, meanLight, pairOf } from './roomDraw.js';
import { createMarks } from './marks.js';
import { SEED_NAME } from './surfaces.js';
import { shelfLayout } from './shelf.js';

export const CHUNK = 128; // cells a side
const APRON = 4; // cells each chunk also holds of its neighbours: edges sample the same values (no seams)
const TEXN = CHUNK + 2 * APRON; // texels a side
export const DROP_PX = 0.004; // a drop of height at true scale, page px
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
  return tex;
}

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
const colorTex = (data, w, h) => {
  const t = linear(new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType));
  t.colorSpace = THREE.NoColorSpace; // the law's transmittance per channel, as it is (the shader takes its absorbance)
  return t;
};
const byteTex = (data, w, h) => linear(new THREE.DataTexture(data, w, h, THREE.RedFormat, THREE.UnsignedByteType));
const bakeTarget = (type) => {
  const rt = new THREE.RenderTarget(TEXN, TEXN, { type, depthBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  own(rt.texture);
  return rt;
};

// Stand-ins of each texture kind, for the shared materials before a chunk gives its own.
let blanks = null;
function blank() {
  blanks ??= {
    half: halfTex(new Uint16Array(4), 1, 1),
    color: colorTex(new Uint8Array(4), 1, 1),
    byte: byteTex(new Uint8Array(1), 1, 1),
    rgba: linear(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType)),
  };
  for (const t of Object.values(blanks)) t.needsUpdate = true;
  return blanks;
}

// The staging rectangles live uploads pass through (one tile at most).
let stage = null;
function stages() {
  stage ??= {
    h: halfTex(new Uint16Array(STAGE * STAGE * 4), STAGE, STAGE),
    c: colorTex(new Uint8Array(STAGE * STAGE * 4), STAGE, STAGE),
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
  const panes = GEOM.openings.map((o) => {
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
  const sunKey = l.sun.dir.map((v) => Math.round(v * 500)).join();
  if (sunKey !== R.sunKey) {
    R.sunKey = sunKey;
    R.sunMap = outsideMap(l.sun.dir, OUT_W, OUT_H);
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
export function createView(target, { host = null, invalidate = () => {}, seeds = null, room: roomName = 'room', seedsB = null } = {}) {
  if (!shared) throw new Error('the scene: engineReady() first');
  const { renderer, gpu } = shared;
  const ctx = target.getContext('2d');
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(40, 1, 0.5, 60000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -60000, 60000);
  const lights = gpu.lightUniforms(paperCurve(PAPER), DROP_PX);
  lights.pxPerM.value = PX_PER_M;
  const K = { APRON, CHUNK, TEXN, generic: generic(), blank: blank() };
  // each kind of material once, for every chunk (a chunk's own textures and numbers go
  // per object); with WebGPU, each chunk and sheet its own (nodes.js says why)
  const own = shared.backend === 'webgpu';
  const mats = {
    chunk: gpu.chunkMaterial(lights, K),
    surface: gpu.surfaceBake(lights, K),
    shade: gpu.shadeBake(lights, K),
    base: gpu.flatMaterial(lights, K),
    ground: gpu.flatMaterial(lights, K, null, true),
    slab: gpu.slabMaterial(lights),
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
    colorTex: K.blank.color,
    detailTex: K.blank.byte,
    bandTex: K.blank.byte,
    surfRT: baked.surface,
    shadeRT: baked.shade,
    realDetail: 0,
    cellPx: 1,
    valid: new THREE.Vector4(2, 2, 3, 3),
    origin: new THREE.Vector2(),
    size: 1,
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
  const GEOM = geomOf(roomName); // this view's room: its own, or two joined (rooms.md §7)
  const R = theRoom(roomName);
  const roomGroup = new THREE.Group(); // metres; placed by setLight so this view's page lies on the room's page
  // whose room this is: its surfaces grown from its owner's key (rooms.md §1;
  // seeds by name, as light/surface.js names them), else the shared defaults
  let roomSeeds = seeds;
  const seedOf = (name) =>
    name.startsWith('b:') ? grown.seedMix(seedsB?.[name.slice(2)] ?? grown.defaultSeed(name)) : grown.seedMix(roomSeeds?.[name] ?? grown.DEFAULT_SEEDS[name] ?? grown.defaultSeed(name)); // ('b:': the joined room's, its owner's)
  const seedNameOf = (id) => (id.startsWith('b:') ? `b:${SEED_NAME(id.slice(2))}` : SEED_NAME(id));
  const roomMats = [];
  R.meshes.forEach((m, i) => {
    const mat = gpu.roomMaterial(lights, { kind: m.kind, seed: seedOf(seedNameOf(m.id)), pair: pairOf(m.matter), normal: m.normal, top: m.top, webgpu: own });
    mat.seedName = seedNameOf(m.id);
    roomMats.push(mat);
    const mesh = new THREE.Mesh(R.geos[i], mat);
    if (m.top) mesh.renderOrder = -3; // first of all: the sheets' paper (which writes no depth) goes over it
    roomGroup.add(mesh);
  });
  const paneMat = gpu.windowMaterial(R.outside);
  for (const g of R.panes) roomGroup.add(new THREE.Mesh(g, paneMat));
  const box = new THREE.BoxGeometry(1, 1, 1);
  const disc = new THREE.CylinderGeometry(1, 1, 1, 32).rotateX(Math.PI / 2);
  const objectMats = [];
  for (const o of GEOM.objects) {
    const brass = o.matter === 'brass';
    const mat = gpu.objectMaterial(
      lights,
      brass ? { pair: { light: curves.MATTER.brass, dark: curves.MATTER.brass } } : { kind: grown.BOARD, seed: seedOf('table'), pair: pairOf(o.matter), webgpu: own },
    );
    mat.matter = o.matter;
    objectMats.push(mat);
    const mesh = new THREE.Mesh(o.box ? box : disc, mat);
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
  // the others in the room (rooms.md §4): each a ball of a body, a head that turns, two hands, a pen.
  // Their matter is made once for the view: a being coming, hiding or going makes no new shaders.
  const ball = new THREE.SphereGeometry(1, 24, 16);
  const beings = new Map(); // name → { group, body, head, face, hands, pen }
  const beingMat = (curve, matter) => Object.assign(gpu.objectMaterial(lights, { pair: { light: curve, dark: curve } }), { matter: matter ?? { light: curve, dark: curve } });
  const beingMats = {
    cloth: [
      [96, 40, 44],
      [44, 70, 96],
      [70, 90, 52],
      [92, 70, 40],
      [70, 52, 88],
    ].map((c) => beingMat(paperCurve(c))),
    skin: beingMat(paperCurve([214, 178, 150])),
    dark: beingMat(curves.MATTER.wick),
    pen: beingMat(curves.MATTER.brass, 'brass'),
  };
  const allBeingMats = [...beingMats.cloth, beingMats.skin, beingMats.dark, beingMats.pen];
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
  const clothOf = (name) => beingMats.cloth[[...String(name)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % beingMats.cloth.length];
  function beingOf(name) {
    let b = beings.get(name);
    if (b) return b;
    const mats = { body: clothOf(name), skin: beingMats.skin, dark: beingMats.dark, pen: beingMats.pen };
    const group = new THREE.Group();
    const part = (geo, m) => {
      const mesh = new THREE.Mesh(geo, m);
      group.add(mesh);
      return mesh;
    };
    b = { group, body: part(ball, mats.body), head: part(ball, mats.skin), face: part(ball, mats.dark), hands: [part(ball, mats.skin), part(ball, mats.skin)], pen: part(box, mats.pen) };
    roomGroup.add(group);
    beings.set(name, b);
    return b;
  }
  // ink on the room's surfaces (rooms.md §2): drawn in the surfaces' own cells
  const marks = createMarks({ gpu, lights, group: roomGroup, geom: GEOM, meshes: R.meshes, seedOf, webgpu: own });
  // two candles standing on it, either side of the page: wax, a wick, a flame
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const candles = [0, 1].map(() => {
    const wax = new THREE.Mesh(cylinder, gpu.waxMaterial(lights, curves.MATTER.wax));
    const wick = new THREE.Mesh(cylinder, gpu.waxMaterial(lights, curves.MATTER.wick));
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
      col: new Uint8Array(n * 4),
      det: new Uint8Array(n),
      band: new Uint8Array(n),
      rects: [], // live rectangles to upload: [x, y, w, h] texels
      full: true, // the whole chunk to upload
      surfDirty: true,
      shadeDirty: true,
      realDetail: 0,
      cellPx: sheet.cellPx,
    };
    c.heightTex = halfTex(c.h, TEXN, TEXN);
    c.colorTex = colorTex(c.col, TEXN, TEXN);
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
    for (const t of [c.heightTex, c.colorTex, c.detailTex, c.bandTex]) t.dispose();
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
  function putBox(sheet, x0, y0, w, h, hf, rgba, live) {
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
        c.col.set(rgba.subarray(src * 4, (src + n) * 4), dst * 4);
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
          c.colorTex.needsUpdate = true;
          c.full = false;
          c.rects.length = 0;
          c.surfDirty = true;
          stats.uploadBytes += TEXN * TEXN * 12;
        } else if (c.rects.length) {
          const ht = onGpu(c.heightTex),
            ct = onGpu(c.colorTex);
          if (device && !(ht && ct)) {
            // (not on the GPU yet: the whole chunk goes up with its first draw)
            c.heightTex.needsUpdate = true;
            c.colorTex.needsUpdate = true;
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
              device.queue.writeTexture({ texture: ct, origin: { x, y } }, c.col, { offset: at, bytesPerRow: TEXN * 4, rowsPerImage: h }, size);
              stats.uploadBytes += w * h * 12;
              continue;
            }
            for (let r = 0; r < h; r++) {
              const from = ((y + r) * TEXN + x) * 4;
              st.h.image.data.set(c.h.subarray(from, from + w * 4), r * STAGE * 4);
              st.c.image.data.set(c.col.subarray(from, from + w * 4), r * STAGE * 4);
            }
            st.box.min.set(0, 0);
            st.box.max.set(w, h);
            st.at.set(x, y);
            st.h.needsUpdate = true;
            st.c.needsUpdate = true;
            renderer.copyTextureToTexture(st.h, c.heightTex, st.box, st.at);
            renderer.copyTextureToTexture(st.c, c.colorTex, st.box, st.at);
            stats.uploadBytes += w * h * 12;
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

  const view = {
    // A sheet: its cells (x0, y0, w, h in its own cell frame), shown at `origin`
    // (page px of cell x0, y0) with `cellPx` page px a cell.
    setSheet(id, { x0, y0, w, h, origin, cellPx }) {
      view.removeSheet(id);
      const sheet = { id, x0, y0, w, h, origin, cellPx, chunks: new Map(), group: new THREE.Group() };
      sheet.slab = slab(sheet);
      sheet.group.add(sheet.slab);
      // the paper itself, lit, where no chunk holds anything: one flat sheet under
      // the chunks (drawn first, writing no depth, so a chunk always shows over it)
      const grain = { detailScale: new THREE.Vector2(w / 256, h / 256), cellPx };
      sheet.base = new THREE.Mesh(lodGeo[2], own ? asBase(gpu.flatMaterial(lights, K, grain)) : mats.base);
      sheet.base.userData.c = grain;
      sheet.base.renderOrder = 0;
      sheet.base.scale.set(w * cellPx, h * cellPx, 1);
      sheet.base.position.set(origin[0], -origin[1], 0);
      sheet.group.add(sheet.base);
      held.add(sheet.group);
      sheets.set(id, sheet);
      return sheet;
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
    // A whole field (law/v2/scene.js: surface, above, depth, rgba, flags over the box).
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
      putBox(s, bx, by, w, h, hf, f.rgba, false);
    },
    // A flat look (law 1 ink, or anything without heights): colour only.
    setLook(id, rgba, box) {
      const s = sheets.get(id);
      const [bx, by, w, h] = box;
      putBox(s, bx, by, w, h, new Uint16Array(w * h * 4).fill(HALF_ZERO), rgba, false);
    },
    // Live tiles from the ink worker: 16 × 16 cells, RGBA and the height field as
    // half floats (ink/live.js: { tx, ty, rgba, hf }).
    setTiles(id, tiles) {
      const s = sheets.get(id);
      if (!s) return;
      const t0 = performance.now();
      for (const t of tiles) putBox(s, t.tx * TILE, t.ty * TILE, TILE, TILE, t.hf ?? EMPTY_TILE, t.rgba, true);
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
      for (const m of [...objectMats, ...shelf.mats, ...allBeingMats]) {
        const { A, B } = meanLight(l.ambient, GEOM.patches.length, l.W, m.matter);
        m.ambient.A.value.set(...A);
        m.ambient.B.value.set(...B);
      }
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
      for (let c = 0; c < 3; c++) gpu.setSpectrum(lights.W[c], l.W.subarray(c * 17, c * 17 + 17));
      // the candles: wax from the table up to where it has burnt down, the wick, the flame
      const r = (DIAMETER / 2) * PX_PER_M;
      l.flames.forEach((fl, i) => {
        const at = W(fl.pos);
        lights.candleAt[i].value.set(...at);
        gpu.setSpectrum(lights.flameI[i], fl.I);
        const foot = W(fl.foot);
        const top = foot[2] + fl.height * PX_PER_M;
        const wickH = (fl.wick / 1000) * PX_PER_M;
        const { wax, wick, flame } = candles[i];
        wax.position.set(foot[0], foot[1], foot[2]);
        wax.scale.set(r, r, Math.max(1, top - foot[2]));
        wick.position.set(foot[0], foot[1], top);
        wick.scale.set(r * 0.06, r * 0.06, wickH);
        flame.visible = fl.lit;
        const fh = fl.flameSize * PX_PER_M;
        flame.position.set(at[0], at[1], at[2] - fh * 0.32);
        flame.scale.set(fh * 0.42, fh, 1);
        flame.material.brightness.value = fl.lit ? 1 : 0;
        flame.material.core.value.setRGB(...fl.seen);
      });
      // the shade is baked again when the light has really moved (not for the flicker)
      lightKey = l.key;
    },
    // Whose room: { [name]: [s0, s1] } (light/surface.js names: floor, ceiling,
    // wall-near, wall-far, wall-left, wall-right, table), from the owner's key.
    setSeeds(next) {
      roomSeeds = next;
      for (const m of roomMats) m.seed.value = seedOf(m.seedName);
      for (const m of objectMats) if (m.seed) m.seed.value = seedOf('table');
      marks.reseed();
    },
    // The others in the room (rooms.md §4): [{ name, pose: { pos (the head, room m), yaw,
    // pitch, body, size }, hidden? }], as they are now (the view glides them between their acts).
    setBeings(list) {
      const here = new Set();
      for (const { name, pose, hidden } of list ?? []) {
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
        b.pen.position.set(x + px + qx, y + py + qy, z - 0.33 * s);
        b.pen.scale.set(0.008 * s, 0.008 * s, 0.13 * s);
      }
      for (const [name, b] of beings) {
        if (here.has(name)) continue;
        roomGroup.remove(b.group);
        beings.delete(name);
      }
    },
    // The shelf's books (rooms.md §3): [{ id, color: [r, g, b] }], their cloth's colour.
    setShelf(books) {
      for (const o of [...shelf.group.children]) shelf.group.remove(o);
      for (const m of shelf.mats) m.dispose();
      shelf.mats = [];
      if (!books?.length) return;
      const { board, books: boxes } = shelfLayout(GEOM, books.length);
      const put = (b, mat) => {
        const mesh = new THREE.Mesh(box, mat);
        mesh.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
        mesh.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
        shelf.group.add(mesh);
      };
      const wood = gpu.objectMaterial(lights, { kind: grown.BOARD, seed: seedOf('table'), pair: pairOf('table'), webgpu: own });
      wood.matter = 'table';
      shelf.mats.push(wood);
      put(board, wood);
      boxes.forEach((b, k) => {
        const cloth = paperCurve(books[k].color);
        const mat = gpu.objectMaterial(lights, { pair: { light: cloth, dark: cloth } });
        mat.matter = { light: cloth, dark: cloth };
        shelf.mats.push(mat);
        put(b, mat);
      });
    },
    // Ink on a surface (scene/marks.js): a mark set, its cells, its live tiles, gone.
    setMark(id, spec) {
      marks.set(id, spec);
    },
    putMark(id, x0, y0, w, h, rgba) {
      marks.put(id, x0, y0, w, h, rgba);
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
        section.material.map?.dispose();
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
        // rows bottom up, as a texture has them
        const { width: iw, height: ih, rgba } = cut.image;
        const rows = new Uint8Array(rgba.length);
        for (let y = 0; y < ih; y++) rows.set(rgba.subarray(y * iw * 4, (y + 1) * iw * 4), (ih - 1 - y) * iw * 4);
        const tex = new THREE.DataTexture(rows, iw, ih, THREE.RGBAFormat);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        const hPx = (ih / iw) * len;
        const geo = new THREE.PlaneGeometry(len, hPx);
        section = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
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
    // The page the sheets lie on (a journal page): paper, lit, a sheet's thickness
    // below them, so a tear in one shows the page behind. null: the table.
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
      for (const m of allBeingMats) m.dispose();
      ball.dispose();
      view.setGround(null);
      view.setCut(null);
      shared.views.delete(view);
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
    },
    get camera() {
      return cam3;
    },
    host,
    invalidate,
  };
  shared.views.add(view);
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
