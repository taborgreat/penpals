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
// The paper rests on a table (a journal's sheets on its page, the page on the
// table), each casting a soft shadow; two candles stand on it, their flames
// flickering with their light. Torn cells are holes onto what is behind.
// Nothing here touches the record.
//
// Units: page px (x right, y down the page); three's world is (x, −y, z), z up.

import * as THREE from 'three';
import { frame } from './camera.js';
import { toHalf } from './half.js';

export const CHUNK = 128; // cells a side
const APRON = 4; // cells each chunk also holds of its neighbours: edges sample the same values (no seams)
const TEXN = CHUNK + 2 * APRON; // texels a side
export const DROP_PX = 0.004; // a drop of height at true scale, page px
const SLAB_PX = 3; // the paper's thickness
const PAPER = new THREE.Color(0.965, 0.945, 0.905);
const DESK = new THREE.Color(0.32, 0.29, 0.26); // the table (plain for now; light-waves grows its wood)
const WAX = new THREE.Color(0.86, 0.8, 0.66);
const WICK = new THREE.Color(0.05, 0.04, 0.035);
const STAGE = 16; // a live upload's largest rectangle: one tile

// What the scene costs, for the benches (e2e/perf.mjs): frames drawn, the time
// spent drawing them (copies included; with globalThis.__sceneSync, WebGL2 waits
// for the GPU too, so the time is the whole frame's), texture bytes uploaded,
// chunks baked.
export const stats = { frames: 0, renderMs: 0, uploadBytes: 0, bakes: 0, chunks: 0, prepareMs: 0, mainMs: 0 };
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
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  for (let i = 0; i < n * n; i++) d[i] = 40 + Math.floor(rnd() * 60);
  for (let k = 0; k < 900; k++) { // a few fibers
    let x = rnd() * n, y = rnd() * n;
    const a = rnd() * Math.PI, len = 8 + rnd() * 24;
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
  t.colorSpace = THREE.SRGBColorSpace;
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

// A chunk's footprint, written only to the stencil.
const MASK = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
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
  const pos = new Float32Array(m * m * 3), uv = new Float32Array(m * m * 2), index = [];
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
export function createView(target, { host = null, invalidate = () => {} } = {}) {
  if (!shared) throw new Error('the scene: engineReady() first');
  const { renderer, gpu } = shared;
  const ctx = target.getContext('2d');
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(40, 1, 0.5, 60000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -60000, 60000);
  const lights = gpu.lightUniforms(PAPER, DROP_PX);
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
    heightTex: K.blank.half, colorTex: K.blank.color, detailTex: K.blank.byte, bandTex: K.blank.byte,
    surfRT: baked.surface, shadeRT: baked.shade, realDetail: 0, cellPx: 1,
    valid: new THREE.Vector4(2, 2, 3, 3), origin: new THREE.Vector2(), size: 1,
  };
  stand.mats = own ? { chunk: gpu.chunkMaterial(lights, K, stand), surface: gpu.surfaceBake(lights, K, stand), shade: gpu.shadeBake(lights, K, stand) } : mats;
  let warm = new THREE.Mesh(lodGeo[2], stand.mats.chunk);
  warm.userData.c = stand;
  warm.frustumCulled = false;
  const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e9);
  const held = new gpu.ClippingGroup(); // the sheets: the cut cuts all of them
  scene.add(held);
  lights.thick.value = SLAB_PX;
  // the table the paper rests on: lit, the sheets' shadows on it
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gpu.tableMaterial(lights, DESK));
  desk.position.z = -SLAB_PX;
  desk.renderOrder = -3; // first of all: the sheets' paper (which writes no depth) goes over it
  scene.add(desk);
  // two candles standing on it, either side of the page: wax, a wick, a flame
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 28).rotateX(Math.PI / 2).translate(0, 0, 0.5);
  const candles = [0, 1].map((i) => {
    const wax = new THREE.Mesh(cylinder, gpu.waxMaterial(lights, WAX, i === 0 ? lights.candleInt.x : lights.candleInt.y));
    const wick = new THREE.Mesh(cylinder, gpu.waxMaterial(lights, WICK, i === 0 ? lights.candleInt.x : lights.candleInt.y));
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
      cx, cy,
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
    const s0 = (sheet.x0 - cx * CHUNK) / CHUNK, s1 = (sheet.x0 + sheet.w - cx * CHUNK) / CHUNK;
    const t0 = (sheet.y0 - cy * CHUNK) / CHUNK, t1 = (sheet.y0 + sheet.h - cy * CHUNK) / CHUNK;
    const u0 = Math.max(0, s0), u1 = Math.min(1 + SLIVER, s1);
    const v0 = Math.max(0, t0), v1 = Math.min(1 + SLIVER, t1);
    // cut only at the sheet's own edges: a pixel on a chunk's edge may be shaded
    // at its centre, just outside, and a cut there would leave a hairline hole
    c.valid = new THREE.Vector4(s0 > 0 ? s0 : -1, t0 > 0 ? t0 : -1, s1 < 1 + SLIVER ? s1 : 2, t1 < 1 + SLIVER ? t1 : 2);
    const size = CHUNK * sheet.cellPx;
    const left = sheet.origin[0] + (cx * CHUNK - sheet.x0) * sheet.cellPx, top = sheet.origin[1] + (cy * CHUNK - sheet.y0) * sheet.cellPx;
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
    const kx0 = Math.floor((x0 - CHUNK + APRON) / CHUNK) + 1, kx1 = Math.floor((x1 - 1 + APRON) / CHUNK);
    const ky0 = Math.floor((y0 - CHUNK + APRON) / CHUNK) + 1, ky1 = Math.floor((y1 - 1 + APRON) / CHUNK);
    for (let ky = ky0; ky <= ky1; ky++) {
      for (let kx = kx0; kx <= kx1; kx++) {
        const ox = kx * CHUNK - APRON, oy = ky * CHUNK - APRON; // the cell at the chunk's texel 0
        const ax = Math.max(x0, ox), ay = Math.max(y0, oy), bx = Math.min(x1, ox + TEXN), by = Math.min(y1, oy + TEXN);
        if (ax < bx && ay < by) fn(chunkAt(sheet, kx, ky), ax, ay, bx, by, ox, oy);
      }
    }
  }

  // Cells into the chunks, from a box of half-float heights and RGBA colour
  // (w × h cells, x0, y0 in the sheet's cells), as whole rows.
  function putBox(sheet, x0, y0, w, h, hf, rgba, live) {
    const cx0 = Math.max(x0, sheet.x0), cy0 = Math.max(y0, sheet.y0);
    const cx1 = Math.min(x0 + w, sheet.x0 + sheet.w), cy1 = Math.min(y0 + h, sheet.y0 + sheet.h);
    if (cx0 >= cx1 || cy0 >= cy1) return;
    eachHolder(sheet, cx0, cy0, cx1, cy1, (c, ax, ay, bx, by, ox, oy) => {
      const n = bx - ax;
      for (let y = ay; y < by; y++) {
        const src = (y - y0) * w + (ax - x0), dst = (y - oy) * TEXN + (ax - ox);
        c.h.set(hf.subarray(src * 4, (src + n) * 4), dst * 4);
        c.col.set(rgba.subarray(src * 4, (src + n) * 4), dst * 4);
      }
      if (live && !c.full) c.rects.push(ax - ox, ay - oy, n, by - ay);
      else c.full = true;
    });
  }

  function slab(sheet) {
    const w = sheet.w * sheet.cellPx, h = sheet.h * sheet.cellPx;
    const geo = new THREE.BufferGeometry();
    const x0 = sheet.origin[0], y0 = -sheet.origin[1], x1 = x0 + w, y1 = y0 - h, z0 = 0, z1 = -SLAB_PX;
    const quads = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
    const pos = [];
    for (const [ax, ay, bx, by] of quads) pos.push(ax, ay, z0, bx, by, z0, bx, by, z1, ax, ay, z0, bx, by, z1, ax, ay, z1);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return new THREE.Mesh(geo, mats.slab);
  }

  // Upload what changed and bake what needs it, for every chunk of every sheet.
  function prepare() {
    const st = stages();
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
          for (let i = 0; i < c.rects.length; i += 4) {
            const x = c.rects[i], y = c.rects[i + 1], w = c.rects[i + 2], h = c.rects[i + 3];
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
  function bake(c, kind, into) {
    bakeQuad.material = c.mats?.[kind] ?? mats[kind];
    bakeQuad.userData.c = c;
    renderer.setRenderTarget(baked[kind]);
    renderer.render(bakeScene, bakeCam);
    renderer.copyTextureToTexture(baked[kind].texture, into.texture);
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
      for (const t of tiles) putBox(s, t.tx * 16, t.ty * 16, 16, 16, t.hf ?? EMPTY_TILE, t.rgba, true);
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
      lights.paper.value.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    },
    // How much taller than true the relief is drawn (a drop's height × this). Scene only.
    setRelief(x) {
      if (lights.dropPx.value === DROP_PX * x) return;
      lights.dropPx.value = DROP_PX * x;
      for (const s of sheets.values()) for (const c of s.chunks.values()) c.surfDirty = true;
    },
    // The light at this moment (light.js lightAt), page frame → world.
    setLight(l) {
      lights.sunDir.value.set(l.sun.dir[0], -l.sun.dir[1], l.sun.dir[2]);
      lights.sunColor.value.setRGB(...l.sun.color);
      lights.sunInt.value = l.sun.intensity;
      l.candles.forEach((c, i) => {
        lights.candlePos.value[i].set(c.pos[0], -c.pos[1], c.pos[2]);
        lights.candleInt.value.setComponent(i, c.intensity * 1.4);
      });
      lights.candleColor.value.setRGB(...l.candles[0].color);
      lights.ambient.value = l.ambient;
      // the candles stand on the table where their light is; a flame's size and brightness are its light's
      const tableZ = desk.position.z;
      l.candles.forEach((c, i) => {
        const { wax, wick, flame } = candles[i];
        const Z = c.pos[2];
        const flick = l.night > 0.01 ? c.intensity / l.night : 0;
        const fh = 0.2 * Z * (0.8 + 0.2 * flick);
        const wickTop = Z - 0.3 * 0.2 * Z;
        const wickH = 0.05 * Z;
        const r = 0.11 * Z;
        wax.position.set(c.pos[0], -c.pos[1], tableZ);
        wax.scale.set(r, r, Math.max(1, wickTop - wickH - tableZ));
        wick.position.set(c.pos[0], -c.pos[1], wickTop - wickH);
        wick.scale.set(r * 0.05, r * 0.05, wickH);
        flame.visible = l.night > 0.01;
        flame.position.set(c.pos[0], -c.pos[1], wickTop);
        flame.scale.set(fh * 0.42, fh, 1);
        flame.material.brightness.value = Math.min(1, l.night) * flick;
      });
      // the shade is baked again when the light has really moved (not for the flicker)
      const d = lights.sunDir.value, p = lights.candlePos.value;
      lightKey = [d.x, d.y, d.z, p[0].x, p[0].y, p[0].z, p[1].x, p[1].y, p[1].z].map((v) => Math.round(v * 400)).join();
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
      const dx = b[0] - a[0], dy = b[1] - a[1];
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
      if (shared.size[0] !== w || shared.size[1] !== h) { // (setting it costs, even unchanged)
        renderer.setSize(w, h, false);
        shared.size = [w, h];
      }
      const aspect = w / Math.max(1, h);
      const f = frame(cam);
      const toW = (p) => new THREE.Vector3(p[0], -p[1], p[2]);
      let camera;
      if (cam.mode === '2d') {
        const halfW = cam.view / 2, halfH = halfW / aspect;
        ortho.left = -halfW;
        ortho.right = halfW;
        ortho.top = halfH;
        ortho.bottom = -halfH;
        camera = ortho;
      } else {
        persp.fov = cam.fov;
        persp.aspect = aspect;
        persp.near = Math.max(1e-4, cam.dist / 1000); // close flight (the depth buffer is logarithmic)
        persp.far = cam.dist * 40 + 20000;
        camera = persp;
      }
      camera.position.copy(toW(f.eye));
      camera.up.copy(toW(f.up));
      camera.lookAt(toW([cam.target[0], cam.target[1], 0]));
      camera.updateProjectionMatrix();
      cam3 = camera;
      // the desk under everything, as big as the view needs
      desk.scale.set(cam.dist * 60 + 40000, cam.dist * 60 + 40000, 1);
      desk.position.x = cam.target[0];
      desk.position.y = -cam.target[1];
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
      const rests = lights.rests.array, onPage = lights.onPage.array;
      for (const v of rests) v.set(0, 0, 0, 0);
      for (const v of onPage) v.set(0, 0, 0, 0);
      let k = 0;
      for (const sh of sheets.values()) {
        if (k >= rests.length) break;
        const x0 = sh.origin[0], y1 = -sh.origin[1];
        (groundSize ? onPage : rests)[k++].set(x0, y1 - sh.h * sh.cellPx, x0 + sh.w * sh.cellPx, y1);
      }
      if (groundSize) rests[0].set(0, -groundSize[1], groundSize[0], 0);
      desk.position.z = groundSize ? -2 * SLAB_PX : -SLAB_PX;
      const t1 = performance.now();
      prepare();
      const t2 = performance.now();
      renderer.setClearColor(DESK, 0);
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
    // below them, so a tear in one shows the page behind. null: the desk.
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
      view.setGround(null);
      view.setCut(null);
      shared.views.delete(view);
      settleDirect();
      bakeQuad.geometry.dispose();
      for (const m of Object.values(mats)) m.dispose();
      desk.material.dispose();
      for (const c of candles) for (const o of [c.wax, c.wick, c.flame]) o.material.dispose();
      cylinder.dispose();
      baked.surface.dispose();
      baked.shade.dispose();
      if (own) for (const m of Object.values(stand.mats)) m.dispose();
    },
    get camera() { return cam3; },
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

const EMPTY_TILE = new Uint16Array(256 * 4).fill(HALF_ZERO);
