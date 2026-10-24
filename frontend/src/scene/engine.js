// The scene's renderer (the scene spec, §1–3): three.js, WebGL2. One renderer
// for the whole page (one WebGL context): each view (a pad, a journal page, a
// letter) renders into it and copies its frame to its own canvas. The page is
// always a 3D scene; 2D is that scene seen straight down, lit.
//
// A sheet is cut into chunks of CHUNK × CHUNK cells, each a displaced grid with
// its own small textures (heights, colour, the paper's detail, the moments'
// bands), so live writing re-uploads only the chunks it touched. Heights come
// from the facts (law/v2/scene.js): surface (cockle up, dents down) + the bead
// or film; colour is the ink as it looks now. Torn cells are holes onto the
// desk behind the page. Shadows are marched across the height field toward
// the sun and each candle. Nothing here touches the record.
//
// Units: page px (x right, y down the page); three's world is (x, −y, z), z up.

import * as THREE from 'three';
import { frame } from './camera.js';

export const CHUNK = 128; // cells a side
const APRON = 4; // cells each chunk also holds of its neighbours: edges sample the same values (no seams)
const TEXN = CHUNK + 2 * APRON; // texels a side
export const DROP_PX = 0.004; // height of one drop of water, in page px (beads a few px high)
const SLAB_PX = 3; // the paper's thickness
const PAPER = new THREE.Color(0.965, 0.945, 0.905);
const DESK = new THREE.Color(0.32, 0.29, 0.26);

let shared = null;
function sharedRenderer() {
  if (shared) return shared;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
  renderer.localClippingEnabled = true;
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  shared = { renderer, views: 0 };
  return shared;
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

const VERT = /* glsl */ `
uniform sampler2D heightTex;
uniform float dropPx;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec2 tuv = (vec2(APRON) + vec2(uv.x, 1.0 - uv.y) * CHUNKF) / TEXN;
  float h = texture2D(heightTex, tuv).r * dropPx;
  vec4 w = modelMatrix * vec4(position.xy, h, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
uniform sampler2D heightTex;
uniform sampler2D colorTex;
uniform sampler2D detailTex;
uniform sampler2D bandTex;
uniform float bandOn;
uniform float realDetail;
uniform vec2 detailScale;
uniform vec2 texel;
uniform float cellPx;
uniform float dropPx;
uniform vec3 paper;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunInt;
uniform vec3 candlePos[2];
uniform vec3 candleColor;
uniform float candleInt[2];
uniform float ambient;
uniform vec4 valid; // the part of this chunk that is the sheet (texture uv)
varying vec2 vUv;
varying vec3 vWorld;

float hAt(vec2 uv) {
  float d = realDetail > 0.5 ? texture2D(detailTex, uv).r : texture2D(detailTex, uv * detailScale * (TEXN / CHUNKF)).r;
  return texture2D(heightTex, uv).r * dropPx + d * 0.35;
}

// March across the height field toward the light: occluded where the field rises above the ray.
float shadowTo(vec2 uv, float h0, vec3 L) {
  float across = length(L.xy);
  if (across < 1e-4 || L.z <= 0.0) return L.z > 0.0 ? 1.0 : 0.0;
  vec2 stepUv = vec2(L.x, -L.y) / across * texel * 1.5;
  float rise = (L.z / across) * cellPx * 1.5;
  float lit = 1.0;
  float h = h0 + 0.02;
  for (int k = 1; k <= 28; k++) {
    vec2 q = clamp(uv + stepUv * float(k), vec2(0.0), vec2(1.0));
    h += rise;
    float over = hAt(q) - h;
    if (over > 0.0) lit -= clamp(over * 0.9, 0.0, 0.35);
  }
  return clamp(lit, 0.25, 1.0);
}

void main() {
  vec2 core = vec2(vUv.x, 1.0 - vUv.y);
  if (core.x < valid.x || core.y < valid.y || core.x > valid.z || core.y > valid.w) discard; // past the sheet's edge
  vec2 uv = (vec2(APRON) + core * CHUNKF) / TEXN;
  vec4 hf = texture2D(heightTex, uv);
  float flags = hf.a;
  if (mod(flags, 2.0) >= 1.0) discard; // torn: the page behind shows through
  float wet = mod(floor(flags / 2.0), 2.0);
  float h0 = hAt(uv);
  float dx = hAt(uv + vec2(3.0 * texel.x, 0.0)) - hAt(uv - vec2(3.0 * texel.x, 0.0));
  float dy = hAt(uv + vec2(0.0, 3.0 * texel.y)) - hAt(uv - vec2(0.0, 3.0 * texel.y));
  // the height field's normal, in world space (page y runs down, world y up), over a few cells
  vec3 n = normalize(vec3(-dx / (6.0 * cellPx), dy / (6.0 * cellPx), 1.0));
  vec4 ink = texture2D(colorTex, uv);
  vec3 base = mix(paper, ink.rgb, ink.a);
  vec3 V = normalize(cameraPosition - vWorld);
  // ink sunk into the fibers shows deeper at grazing angles
  float graze = 1.0 - clamp(V.z, 0.0, 1.0);
  base *= 1.0 - 0.35 * graze * ink.a * (hf.b / 24.0);
  // the sun (a direction in world space) and its shadow
  // lit paper is its own colour; shade and shadow only take light away
  vec3 L = normalize(sunDir);
  float sun = max(dot(n, L), 0.0) * shadowTo(uv, h0, L) * sunInt;
  vec3 col = base * (ambient + (1.0 - ambient) * sun * sunColor);
  float spec = 0.0;
  if (wet > 0.5) {
    vec3 Hh = normalize(L + V);
    spec += pow(max(dot(n, Hh), 0.0), 70.0) * sunInt;
  }
  // two candles, one each side: warm, soft falloff, each its own shadow
  for (int i = 0; i < 2; i++) {
    vec3 toC = candlePos[i] - vWorld;
    float dist = length(toC);
    vec3 Lc = toC / dist;
    float att = candleInt[i] / (1.0 + pow(dist / 900.0, 2.0) * 2.0);
    float sh = att > 0.002 ? shadowTo(uv, h0, Lc) : 1.0;
    col += base * candleColor * max(dot(n, Lc), 0.0) * att * sh * (1.0 - ambient);
    if (wet > 0.5) spec += pow(max(dot(n, normalize(Lc + V)), 0.0), 60.0) * att;
  }
  // a wet bead: glossy, a little translucent
  col = mix(col, col * 1.05 + vec3(0.02), wet * 0.35) + vec3(spec) * 0.55;
  // show the moments: faint tree rings of when each cell's ink went down
  if (bandOn > 0.5) {
    float b = texture2D(bandTex, uv).r;
    if (b > 0.5) col *= 0.86;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const SIDE_FRAG = /* glsl */ `
uniform vec3 paper;
uniform float ambient;
uniform float sunInt;
uniform vec3 sunColor;
varying vec3 vWorld;
void main() {
  float layer = 0.94 + 0.06 * step(0.5, fract(vWorld.z * 1.4));
  gl_FragColor = vec4(paper * layer * (ambient + (1.0 - ambient) * 0.55 * sunInt * sunColor), 1.0);
  #include <colorspace_fragment>
}`;
const SIDE_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const toHalf = THREE.DataUtils.toHalfFloat;

// A chunk's footprint, written only to the stencil.
const MASK = new THREE.MeshBasicMaterial({
  colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp,
});

// A 1×1 texture of nothing: the flat paper's heights and colour.
let zero = null;
function zeroTex() {
  if (zero) return zero;
  zero = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  zero.needsUpdate = true;
  return zero;
}

// Geometry for each level of detail, shared by every chunk.
const LODS = [64, 24, 6];
const lodGeo = LODS.map((n) => new THREE.PlaneGeometry(1, 1, n, n).translate(0.5, -0.5, 0));

export function createView(target) {
  const { renderer } = sharedRenderer();
  shared.views++;
  const ctx = target.getContext('2d');
  const scene = new THREE.Scene();
  const persp = new THREE.PerspectiveCamera(40, 1, 0.5, 60000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -60000, 60000);
  const lights = {
    sunDir: { value: new THREE.Vector3(0, 0, 1) },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    sunInt: { value: 1 },
    candlePos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    candleColor: { value: new THREE.Color(1, 0.5, 0.15) },
    candleInt: { value: [0, 0] },
    ambient: { value: 0.35 },
    bandOn: { value: 0 },
    paper: { value: PAPER.clone() },
  };
  const clip = new THREE.Plane(new THREE.Vector3(1, 0, 0), 1e9);
  let clipOn = false;
  const desk = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: DESK }));
  desk.position.z = -SLAB_PX - 40;
  scene.add(desk);
  const sheets = new Map();
  let section = null;
  let cam3 = persp;

  function chunkMaterial(c, sheet) {
    return new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { APRON: APRON.toFixed(1), CHUNKF: CHUNK.toFixed(1), TEXN: TEXN.toFixed(1) },
      uniforms: {
        ...lights,
        heightTex: { value: c.heightTex },
        colorTex: { value: c.colorTex },
        detailTex: { value: c.detailTex ?? generic() },
        realDetail: { value: c.detailTex ? 1 : 0 },
        detailScale: { value: new THREE.Vector2(CHUNK / 256, CHUNK / 256) },
        bandTex: { value: c.bandTex ?? c.colorTex },
        texel: { value: new THREE.Vector2(1 / TEXN, 1 / TEXN) },
        cellPx: { value: sheet.cellPx },
        dropPx: { value: DROP_PX },
        valid: { value: c.valid ?? new THREE.Vector4(0, 0, 1, 1) },
      },
      clippingPlanes: clipOn ? [clip] : [],
    });
  }

  function makeChunk(sheet, cx, cy) {
    const n = TEXN * TEXN;
    const c = {
      cx, cy,
      raw: new Float32Array(n), // the height as the facts give it; drawn smoothed over 3 × 3 cells
      height: new Uint16Array(n * 4),
      color: new Uint8Array(n * 4),
      band: null,
      detail: null,
    };
    c.height.fill(toHalf(0));
    c.heightTex = new THREE.DataTexture(c.height, TEXN, TEXN, THREE.RGBAFormat, THREE.HalfFloatType);
    c.heightTex.magFilter = c.heightTex.minFilter = THREE.LinearFilter;
    c.colorTex = new THREE.DataTexture(c.color, TEXN, TEXN, THREE.RGBAFormat, THREE.UnsignedByteType);
    c.colorTex.colorSpace = THREE.SRGBColorSpace;
    c.colorTex.magFilter = THREE.LinearFilter;
    c.colorTex.minFilter = THREE.LinearFilter;
    c.heightTex.needsUpdate = c.colorTex.needsUpdate = true;
    // the part of the chunk inside the sheet's box
    const u0 = Math.max(0, (sheet.x0 - cx * CHUNK) / CHUNK), u1 = Math.min(1, (sheet.x0 + sheet.w - cx * CHUNK) / CHUNK);
    const v0 = Math.max(0, (sheet.y0 - cy * CHUNK) / CHUNK), v1 = Math.min(1, (sheet.y0 + sheet.h - cy * CHUNK) / CHUNK);
    c.valid = new THREE.Vector4(u0, v0, u1, v1);
    c.mesh = new THREE.Mesh(lodGeo[0], chunkMaterial(c, sheet));
    const size = CHUNK * sheet.cellPx;
    c.mesh.scale.set(size * (1 + 0.3 / CHUNK), size * (1 + 0.3 / CHUNK), 1); // a sliver over the next chunk: no hairline gaps
    const left = sheet.origin[0] + (cx * CHUNK - sheet.x0) * sheet.cellPx, top = sheet.origin[1] + (cy * CHUNK - sheet.y0) * sheet.cellPx;
    c.mesh.position.set(left, -top, 0);
    c.mesh.renderOrder = 1; // over the sheet's base
    sheet.group.add(c.mesh);
    // its footprint in the stencil: the base sheet stays out of it, so a tear is a hole to the desk
    c.mask = new THREE.Mesh(lodGeo[2], MASK);
    c.mask.scale.set((u1 - u0) * size, (v1 - v0) * size, 1);
    c.mask.position.set(left + u0 * size, -(top + v0 * size), 0);
    c.mask.renderOrder = -1;
    sheet.group.add(c.mask);
    sheet.chunks.set(`${cx},${cy}`, c);
    return c;
  }
  // A groove is smooth even where the nib pressed unevenly cell by cell: the
  // drawn height is the facts' height over 3 × 3 cells (the facts stay as they are).
  function smoothTop(c) {
    const r = c.raw;
    for (let y = 0; y < TEXN; y++) {
      const y0 = Math.max(0, y - 1), y1 = Math.min(TEXN - 1, y + 1);
      for (let x = 0; x < TEXN; x++) {
        const x0 = Math.max(0, x - 1), x1 = Math.min(TEXN - 1, x + 1);
        let sum = 0, n = 0;
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { sum += r[yy * TEXN + xx]; n++; }
        c.height[(y * TEXN + x) * 4] = toHalf(sum / n);
      }
    }
  }
  const chunkAt = (sheet, cx, cy) => sheet.chunks.get(`${cx},${cy}`) ?? makeChunk(sheet, cx, cy);

  // Every chunk that holds cell (x, y): its own, and the neighbours whose apron reaches it.
  function holders(sheet, x, y, fn) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const lx = x - cx * CHUNK, ly = y - cy * CHUNK;
    const xs = [cx], ys = [cy];
    if (lx < APRON) xs.push(cx - 1);
    if (lx >= CHUNK - APRON) xs.push(cx + 1);
    if (ly < APRON) ys.push(cy - 1);
    if (ly >= CHUNK - APRON) ys.push(cy + 1);
    for (const ky of ys) {
      for (const kx of xs) fn(chunkAt(sheet, kx, ky), (y - (ky * CHUNK - APRON)) * TEXN + (x - (kx * CHUNK - APRON)));
    }
  }
  // One cell's values into the chunks that hold it.
  function putCell(sheet, x, y, top, above, depth, flags, r, g, b, a) {
    const ht = toHalf(top), ha = toHalf(above), hd = toHalf(depth), hfl = toHalf(flags);
    holders(sheet, x, y, (c, i) => {
      const k = i * 4;
      c.raw[i] = top;
      c.height[k] = ht;
      c.height[k + 1] = ha;
      c.height[k + 2] = hd;
      c.height[k + 3] = hfl;
      c.color[k] = r;
      c.color[k + 1] = g;
      c.color[k + 2] = b;
      c.color[k + 3] = a;
      c.dirty = true;
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
    const mat = new THREE.ShaderMaterial({ vertexShader: SIDE_VERT, fragmentShader: SIDE_FRAG, uniforms: { ...lights }, side: THREE.DoubleSide });
    return new THREE.Mesh(geo, mat);
  }

  const view = {
    // A sheet: its cells (x0, y0, w, h in its own cell frame), shown at `origin`
    // (page px of cell x0, y0) with `cellPx` page px a cell.
    setSheet(id, { x0, y0, w, h, origin, cellPx }) {
      view.removeSheet(id);
      const sheet = { id, x0, y0, w, h, origin, cellPx, chunks: new Map(), group: new THREE.Group() };
      sheet.group.add(slab(sheet));
      // the paper itself, lit, where no chunk holds anything: one flat sheet under
      // the chunks (drawn first, writing no depth, so a chunk always shows over it)
      sheet.base = new THREE.Mesh(lodGeo[2], chunkMaterial({ heightTex: zeroTex(), colorTex: zeroTex() }, { cellPx: cellPx * Math.max(w, h) / CHUNK }));
      sheet.base.material.depthWrite = false;
      Object.assign(sheet.base.material, { stencilWrite: true, stencilWriteMask: 0, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc });
      sheet.base.renderOrder = 0;
      sheet.base.scale.set(w * cellPx, h * cellPx, 1);
      sheet.base.position.set(origin[0], -origin[1], 0);
      sheet.base.material.uniforms.detailScale.value.set((w / 256) * 1, (h / 256) * 1);
      sheet.group.add(sheet.base);
      scene.add(sheet.group);
      sheets.set(id, sheet);
      return sheet;
    },
    removeSheet(id) {
      const s = sheets.get(id);
      if (!s) return;
      s.base.material.dispose();
      for (const c of s.chunks.values()) {
        c.heightTex.dispose();
        c.colorTex.dispose();
        c.detailTex?.dispose();
        c.bandTex?.dispose();
        c.mesh.material.dispose();
      }
      scene.remove(s.group);
      sheets.delete(id);
    },
    // A whole field (law/v2/scene.js: surface, above, depth, rgba, flags over the box).
    setField(id, f) {
      const s = sheets.get(id);
      const [bx, by, w, h] = f.box;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const k = y * w + x;
          if (!f.rgba[4 * k + 3] && !f.surface[k] && !f.above[k] && !f.depth[k] && !f.flags[k]) continue;
          putCell(s, bx + x, by + y, f.surface[k] + f.above[k], f.above[k], f.depth[k], f.flags[k], f.rgba[4 * k], f.rgba[4 * k + 1], f.rgba[4 * k + 2], f.rgba[4 * k + 3]);
        }
      }
    },
    // A flat look (law 1 ink, or anything without heights): colour only.
    setLook(id, rgba, box) {
      const s = sheets.get(id);
      const [bx, by, w, h] = box;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const k = 4 * (y * w + x);
        if (rgba[k + 3]) putCell(s, bx + x, by + y, 0, 0, 0, 0, rgba[k], rgba[k + 1], rgba[k + 2], rgba[k + 3]);
      }
    },
    // Live tiles from the ink worker: 16×16 cells, RGBA and the height field (live.heightTile).
    setTiles(id, tiles) {
      const s = sheets.get(id);
      if (!s) return;
      for (const t of tiles) {
        for (let i = 0; i < 256; i++) {
          const x = t.tx * 16 + (i % 16), y = t.ty * 16 + (i >> 4);
          if (x < s.x0 || y < s.y0 || x >= s.x0 + s.w || y >= s.y0 + s.h) continue;
          const hf = t.hf;
          putCell(s, x, y, hf ? hf[4 * i] : 0, hf ? hf[4 * i + 1] : 0, hf ? hf[4 * i + 2] : 0, hf ? hf[4 * i + 3] : 0, t.rgba[4 * i], t.rgba[4 * i + 1], t.rgba[4 * i + 2], t.rgba[4 * i + 3]);
        }
      }
    },
    // The paper's own detail (own and open sheets: law/v2/scene.js paperDetail), over the box.
    setDetail(id, detail, box) {
      const s = sheets.get(id);
      const [bx, by, w, h] = box;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        holders(s, bx + x, by + y, (c, i) => {
          if (!c.detail) {
            c.detail = new Uint8Array(TEXN * TEXN);
            c.detailTex = new THREE.DataTexture(c.detail, TEXN, TEXN, THREE.RedFormat, THREE.UnsignedByteType);
            c.detailTex.magFilter = c.detailTex.minFilter = THREE.LinearFilter;
            c.mesh.material.uniforms.detailTex.value = c.detailTex;
            c.mesh.material.uniforms.realDetail.value = 1;
          }
          c.detail[i] = detail[y * w + x];
          c.detailDirty = true;
        });
      }
    },
    // Show the moments: 1 where a cell's band is odd (law/v2/moments.js bandOf), over the box; null hides them.
    setBands(id, bands, box) {
      const s = sheets.get(id);
      lights.bandOn.value = bands ? 1 : 0;
      if (!bands) return;
      const [bx, by, w, h] = box;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        holders(s, bx + x, by + y, (c, i) => {
          if (!c.band) {
            c.band = new Uint8Array(TEXN * TEXN);
            c.bandTex = new THREE.DataTexture(c.band, TEXN, TEXN, THREE.RedFormat, THREE.UnsignedByteType);
            c.mesh.material.uniforms.bandTex.value = c.bandTex;
          }
          c.band[i] = bands[y * w + x] === 1 ? 255 : 0;
          c.bandDirty = true;
        });
      }
    },
    // The paper's colour (sRGB 0..255): each pad and letter has its own.
    setPaper([r, g, b]) {
      lights.paper.value.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
    },
    // The light at this moment (light.js lightAt), page frame → world.
    setLight(l) {
      lights.sunDir.value.set(l.sun.dir[0], -l.sun.dir[1], l.sun.dir[2]);
      lights.sunColor.value.setRGB(...l.sun.color);
      lights.sunInt.value = l.sun.intensity;
      l.candles.forEach((c, i) => {
        lights.candlePos.value[i].set(c.pos[0], -c.pos[1], c.pos[2]);
        lights.candleInt.value[i] = c.intensity * 1.4;
      });
      lights.candleColor.value.setRGB(...l.candles[0].color);
      lights.ambient.value = l.ambient;
    },
    // The cut (page px, a → b): everything on the far side is clipped away and
    // the cross-section (the side view's picture, law/v2/look.js) stands in the cut.
    setCut(cut) {
      if (section) {
        scene.remove(section);
        section.material.map?.dispose();
        section.material.dispose();
        section.geometry.dispose();
        section = null;
      }
      clipOn = !!cut;
      for (const s of sheets.values()) {
        s.base.material.clippingPlanes = clipOn ? [clip] : [];
        for (const c of s.chunks.values()) c.mesh.material.clippingPlanes = clipOn ? [clip] : [];
      }
      if (!cut) return;
      const [a, b] = cut.line;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      // keep the near side (toward the viewer's left of a → b)
      const normal = new THREE.Vector3(dy / len, dx / len, 0);
      clip.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(a[0], -a[1], 0));
      if (cut.image) {
        const tex = new THREE.DataTexture(cut.image.rgba, cut.image.width, cut.image.height, THREE.RGBAFormat);
        tex.flipY = true;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        const hPx = (cut.image.height / cut.image.width) * len;
        const geo = new THREE.PlaneGeometry(len, hPx);
        section = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide }));
        section.position.set((a[0] + b[0]) / 2, -(a[1] + b[1]) / 2, -SLAB_PX + hPx / 2 - hPx * 0.55);
        section.rotation.set(Math.PI / 2, 0, -Math.atan2(dy, dx), 'ZXY');
        scene.add(section);
      }
    },
    // Draw: the camera (camera.js state) over a canvas of w × h device px.
    render(cam, w, h) {
      const { renderer } = shared;
      if (target.width !== w || target.height !== h) {
        target.width = w;
        target.height = h;
      }
      renderer.setSize(w, h, false);
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
        persp.near = Math.max(0.2, cam.dist / 500);
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
      // upload what changed; detail by distance (one level a sheet: no cracks between chunks)
      const eye = camera.position;
      for (const s of sheets.values()) {
        const mid = new THREE.Vector3(s.origin[0] + (s.w * s.cellPx) / 2, -(s.origin[1] + (s.h * s.cellPx) / 2), 0);
        const near = Math.max(1, eye.distanceTo(mid) - (Math.max(s.w, s.h) * s.cellPx) / 2);
        const pxPerCell = cam.mode === '2d' ? (w / cam.view) * s.cellPx : (h / (2 * Math.tan((cam.fov * Math.PI) / 360) * near)) * s.cellPx;
        const lod = pxPerCell > 0.6 ? 0 : pxPerCell > 0.15 ? 1 : 2;
        for (const c of s.chunks.values()) {
          if (c.dirty) {
            smoothTop(c);
            c.heightTex.needsUpdate = true;
            c.colorTex.needsUpdate = true;
            c.dirty = false;
          }
          if (c.detailDirty) {
            c.detailTex.needsUpdate = true;
            c.detailDirty = false;
          }
          if (c.bandDirty) {
            c.bandTex.needsUpdate = true;
            c.bandDirty = false;
          }
          if (c.mesh.geometry !== lodGeo[lod]) c.mesh.geometry = lodGeo[lod];
        }
      }
      renderer.setClearColor(DESK, 0);
      renderer.render(scene, camera);
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(renderer.domElement, 0, 0, w, h);
    },
    dispose() {
      for (const id of [...sheets.keys()]) view.removeSheet(id);
      view.setCut(null);
      shared.views--;
    },
    get camera() { return cam3; },
  };
  return view;
}
