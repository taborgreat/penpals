// The scene's materials, in three's TSL: drawn by WebGPU where the device has
// it, else by the same renderer's WebGL2 backend. One shading, both ways.
//
// A chunk is drawn in two steps (cleanup-and-speed.md §1.2):
//   baked, when its cells change or the light moves (a pass into the chunk's own
//   small targets, a few thousand pixels):
//     surface: the drawn height (the facts' height over 3 × 3 cells), the normal
//              (over a few cells, with the paper's fibers), how open the cell is
//              to the sky (its own relief around it)
//     shade:   how lit each cell is toward the sun and each candle (marched across
//              the height field)
//   drawn, every frame: about five texture reads a pixel.
//
// With WebGL2 each kind of material is made once a view and serves every chunk:
// a chunk's own textures and numbers are given per object (object.userData.c),
// so a new chunk costs no new shader. With WebGPU (three 0.186 keeps a binding's
// first texture there) each chunk has its own, fixed to it (`c` given).
//
// Textures are sampled at level 0 throughout: WGSL allows that anywhere (the
// march samples inside loops and branches), and these have no mipmaps.
//
// Light is a range of waves (light-waves.md, scene/light/): each pixel works
// bin by bin over the 16 visible bins (as four vec4s; the heat bin is unseen).
// What a point refuses (its reflectance: the paper's curve, through the ink's
// absorbance) times the light reaching it (the room's settled light, the sun
// through the window, each flame; each through its own shade) is its radiance;
// the eye's weights (light.js, eye.js screenWeights) take that to the screen.

import * as THREE from 'three';
import { MeshBasicNodeMaterial, NodeMaterial, SpriteNodeMaterial } from 'three/webgpu';
import {
  Fn,
  If,
  Loop,
  Discard,
  select,
  uniform,
  uniformArray,
  texture,
  cubeTexture,
  uv,
  positionLocal,
  positionWorld,
  normalLocal,
  normalWorld,
  modelScale,
  cameraPosition,
  vec2,
  vec3,
  vec4,
  float,
  mix,
  clamp,
  normalize,
  dot,
  cross,
  max,
  min,
  abs,
  pow,
  length,
  mod,
  floor,
  fract,
  step,
  sqrt,
  smoothstep,
  exp,
  log,
  asin,
  tanh,
  atan,
  attribute,
  code,
  glslFn,
  wgslFn,
} from 'three/tsl';
import { curves, SUN_RADIUS, surface as grown, shine } from './light/index.js';

export { WebGPURenderer, ClippingGroup, CubeRenderTarget } from 'three/webgpu';

const at = (t, q) => t.sample(q).level(0);
// The one row order. Every texture here holds its rows top down, row 0 at the
// top (page y runs down): the DataTextures as they are filled (flipY false), and
// the targets a pass draws into as three samples them on both backends (v = 0
// the row drawn at the top of the view). Every plane here (a chunk's grid, the
// bake quad, a mark's piece, the cut) carries uv.y up, so its point in its
// texture is (u, 1 − v).
const down = () => vec2(uv().x, uv().y.oneMinus());
export const RESTS = 16; // sheets whose shadows fall on the table (or on the page they lie on)

// A texture smoothly between its cells (a cubic B-spline, from four bilinear
// samples), or crisp (each cell its own), by L.crisp.
function between(T, q, n, L) {
  const st = q.mul(n).sub(0.5);
  const i = floor(st);
  const f = fract(st);
  const f2 = f.mul(f),
    f3 = f2.mul(f);
  const w0 = f3.negate().add(f2.mul(3)).sub(f.mul(3)).add(1).div(6);
  const w1 = f3.mul(3).sub(f2.mul(6)).add(4).div(6);
  const w2 = f3.mul(-3).add(f2.mul(3)).add(f.mul(3)).add(1).div(6);
  const w3 = f3.div(6);
  const g0 = w0.add(w1),
    g1 = w2.add(w3);
  const h0 = w1.div(g0).sub(0.5).add(i).div(n),
    h1 = w3.div(g1).add(1.5).add(i).div(n);
  const smooth = at(T, vec2(h0.x, h0.y))
    .mul(g0.x)
    .add(at(T, vec2(h1.x, h0.y)).mul(g1.x))
    .mul(g0.y)
    .add(
      at(T, vec2(h0.x, h1.y))
        .mul(g0.x)
        .add(at(T, vec2(h1.x, h1.y)).mul(g1.x))
        .mul(g1.y),
    );
  const crisp = at(T, floor(q.mul(n)).add(0.5).div(n));
  return mix(smooth, crisp, L.crisp);
}

// How lit a point p of a surface is toward the light Ld (unit), with the sheets
// lying on it (L.rests, `thick` high) in the way: each casts a soft shadow,
// reaching farther the lower the light. (Under a sheet nothing shows anyway.)
function underRests(p, Ld, L, rests) {
  const lit = float(1).toVar();
  const across = length(Ld.xy);
  If(Ld.z.greaterThan(0.002).and(across.greaterThan(1e-4)), () => {
    const reach = min(L.thick.mul(across).div(Ld.z), L.thick.mul(40));
    const mid = p.xy.add(Ld.xy.div(across).mul(reach.mul(0.5)));
    const soft = reach.mul(0.35).add(0.75);
    Loop(RESTS, ({ i }) => {
      const r = rests.element(i);
      If(r.z.greaterThan(r.x), () => {
        const half = r.zw.sub(r.xy).mul(0.5).add(reach.mul(0.5));
        const d = abs(mid.sub(r.xy.add(r.zw).mul(0.5))).sub(half);
        const sd = length(max(d, vec2(0))).add(min(max(d.x, d.y), 0));
        lit.mulAssign(mix(float(0.45), float(1), smoothstep(soft.negate(), soft, sd)));
      });
    });
  });
  return lit;
}
// The shadows toward the sun and each candle, as a shade (sun, candle 1, candle 2).
function restShade(L, rests) {
  const p = positionWorld;
  return vec3(underRests(p, normalize(L.sunDir), L, rests), underRests(p, normalize(L.candleAt[0].sub(p)), L, rests), underRests(p, normalize(L.candleAt[1].sub(p)), L, rests));
}
const DETAIL_PX = grown.DETAIL_PX; // the fibers' relief, page px
const PAPER_F0 = shine.F0.paper; // how much the paper's faces turn back, head on (law/matter.js ior)

// A spectrum's 16 visible bins as four vec4s.
const spectrumUniform = () =>
  uniformArray(
    Array.from({ length: 4 }, () => new THREE.Vector4()),
    'vec4',
  );
export const BIN_GROUPS = 4;
// Set a spectrum uniform from N values (the visible 16).
export function setSpectrum(u, values, k = 1) {
  for (let g = 0; g < BIN_GROUPS; g++) u.array[g].set(values[4 * g] * k, values[4 * g + 1] * k, values[4 * g + 2] * k, values[4 * g + 3] * k);
}
const binsOf = (curve) => [0, 1, 2, 3].map((g) => vec4(curve[4 * g], curve[4 * g + 1], curve[4 * g + 2], curve[4 * g + 3]));
const INK = curves.INK.map(binsOf); // what each of the law's three channels drinks, per bin

// The light as uniforms (light.js, in the world: page px with the room's axes),
// and the height scale. maps: the shadows' depth maps (shadows.js), when things block light.
export function lightUniforms(paper, dropPx, maps = null) {
  const L = {
    sunDir: uniform(new THREE.Vector3(0, 0, 1)),
    sunE: spectrumUniform(), // W / m² per bin, normal to the beam, through the glass
    window: uniform(new THREE.Vector4()), // the window's opening (world px): x0, x1, z0, z1
    wallY: uniform(1e9), // and the wall it is in (world y)
    flameI: [spectrumUniform(), spectrumUniform()], // each flame's light now, W / sr per bin
    flameR: [uniform(0), uniform(0)], // each flame's half height (world px): seen in a mirror it is still that big
    indirect: spectrumUniform(), // the room's settled light at the page, less the sun's and the flames' own
    W: [spectrumUniform(), spectrumUniform(), spectrumUniform()], // the eye: radiance → linear r, g, b
    paper: spectrumUniform(), // the paper's reflectance per bin
    rule: uniform(new THREE.Vector4(0, 1, 0, 0)), // the page's ruled lines (book/ruled.js): px apart (0: none), their width, the page's w, h
    ruleAbs: uniform(new THREE.Vector3()), // their printing's absorbance by the ink's three channels
    bandOn: uniform(0),
    dropPx: uniform(dropPx), // page px a drop of height (the relief's exaggeration in it)
    crisp: uniform(0), // the page close up: 1 crisp cells, 0 smooth (bicubic)
    // sheets of paper lying on the table, and on the page (world x0, y0, x1, y1): their shadows
    rests: uniformArray(
      Array.from({ length: RESTS }, () => new THREE.Vector4(0, 0, 0, 0)),
      'vec4',
    ),
    onPage: uniformArray(
      Array.from({ length: RESTS }, () => new THREE.Vector4(0, 0, 0, 0)),
      'vec4',
    ),
    thick: uniform(3), // a sheet's thickness, page px
    pxPerM: uniform(1),
    footK: uniform(1), // cells a pixel covers a metre away (the room's surfaces: how fine to grow them)
    slabMin: uniform(new THREE.Vector3(1e9, 1e9, 1e9)), // the table's slab (world px): it shades what is under it
    slabMax: uniform(new THREE.Vector3(1e9, 1e9, 1e9)),
  };
  setSpectrum(L.paper, paper);
  // the flames' places (world px): the shade is marched toward them
  L.candleAt = [new THREE.Vector3(), new THREE.Vector3()].map((v) => uniform(v));
  // what blocks each source (matter-fixes §4): (sun, flame 1, flame 2) drawn; the sun's view
  if (maps) {
    L.shadow = {
      on: uniform(new THREE.Vector3()),
      sun: texture(maps.sun),
      sunSize: maps.sunSize,
      sunVP: uniform(new THREE.Matrix4()),
      sunAt: uniform(new THREE.Vector3()),
      sunDir: uniform(new THREE.Vector3(0, 0, 1)), // (the steady places the maps were drawn from: shadows.js)
      flames: maps.flames.map((t) => cubeTexture(t)),
      flameAt: [new THREE.Vector3(), new THREE.Vector3()].map((v) => uniform(v)),
      cube: maps.cube,
    };
  }
  return L;
}

// What the shadow maps hold (shadows.js): each thing's distance (m) from a flame at
// m.at (world px), or (plane) from the sun's camera's plane, m.at its place and m.dir
// toward the sun.
export function distanceMaterial(L, plane = false) {
  const m = new NodeMaterial();
  m.blending = THREE.NoBlending; // (one channel: nothing to blend by)
  const at = uniform(new THREE.Vector3()),
    dir = uniform(new THREE.Vector3(0, 0, 1));
  m.fragmentNode = Fn(() => vec4((plane ? dot(at.sub(positionWorld), dir) : length(positionWorld.sub(at))).div(L.pxPerM), 0, 0, 1))();
  m.at = at.value;
  m.dir = dir.value;
  return m;
}

// How much of a source reaches q (matter-fixes §4): its depth map holds, in q's
// direction, how far the nearest thing is; light reaches q only if nothing lies
// nearer than q itself. Several taps over a small disk, so a shadow's edge is soft
// (as a flame's is: it is not a point), not stepped by the map's texels. 0..1.
const LIFT_M = 0.002; // a point is tested this far off its surface (no surface shades itself)
const disk = (n, r) => Array.from({ length: n }, (_, i) => [r * Math.sqrt((i + 0.5) / n) * Math.cos(i * 2.39996), r * Math.sqrt((i + 0.5) / n) * Math.sin(i * 2.39996)]);
const SUN_TAPS = disk(4, 1.2), // texels
  FLAME_TAPS = disk(4, 1.8);
function sunReach(q, L) {
  const S = L.shadow;
  const c = S.sunVP.mul(vec4(q, 1)).toVar();
  const at0 = vec2(c.x.mul(0.5).add(0.5), c.y.mul(-0.5).add(0.5)).toVar(); // (v 0 the top row of the view)
  const d = dot(S.sunAt.sub(q), S.sunDir).div(L.pxPerM).sub(0.02).toVar(); // (a texel's slant, and a little)
  const lit = float(0).toVar();
  for (const [a, b] of SUN_TAPS) {
    const s = at(S.sun, at0.add(vec2(a / S.sunSize, b / S.sunSize))).r;
    lit.addAssign(select(s.greaterThan(0).and(s.lessThan(d)), float(0), float(1 / SUN_TAPS.length)));
  }
  const inside = at0.x.greaterThan(0).and(at0.x.lessThan(1)).and(at0.y.greaterThan(0)).and(at0.y.lessThan(1));
  return select(inside, lit, float(1));
}
function flameReach(q, k, L) {
  const S = L.shadow;
  const toQ = q.sub(S.flameAt[k]).toVar();
  const d = length(toQ).toVar();
  const dm = d.div(L.pxPerM);
  const ref = dm.sub(dm.mul(0.012).add(0.006)).toVar(); // (a few texels' slant, and a little)
  const side = select(abs(toQ.z).greaterThan(d.mul(0.9)), vec3(1, 0, 0), vec3(0, 0, 1));
  const texel = d.mul(2 / S.cube); // a texel there
  const u = normalize(cross(toQ, side)).mul(texel).toVar();
  const v = normalize(cross(toQ, u)).mul(texel).toVar();
  const lit = float(0).toVar();
  for (const [a, b] of FLAME_TAPS) {
    const s = S.flames[k].sample(toQ.add(u.mul(a)).add(v.mul(b))).level(0).r;
    lit.addAssign(select(s.greaterThan(0).and(s.lessThan(ref)), float(0), float(1 / FLAME_TAPS.length)));
  }
  return lit;
}

// What a point reflects per bin: its surface's curve through the ink's
// absorbance a (the law's three channels, natural units).
const reflectance = (surface, a) => INK[0].map((_, g) => surface.element(g).mul(exp(INK[0][g].mul(a.x).add(INK[1][g].mul(a.y)).add(INK[2][g].mul(a.z)).negate())));
const plainly = (surface) => [0, 1, 2, 3].map((g) => surface.element(g));
// The page's ruled lines where they are printed (book/ruled.js): ink the paper drinks light by, a line's
// height apart from the top down, within the page (world: page px, y up), their edges a px soft.
function ruleAt(L) {
  const px = positionWorld.x,
    py = positionWorld.y.negate();
  const sp = max(L.rule.x, 1);
  const k = floor(py.div(sp).add(0.5));
  const d = py.sub(k.mul(sp)).abs();
  const half = L.rule.y.mul(0.5);
  const line = smoothstep(half.add(0.5), half.sub(0.5), d);
  const inside = step(0.5, L.rule.x).mul(step(0, px)).mul(step(px, L.rule.z)).mul(step(0, py)).mul(step(py, L.rule.w)).mul(step(1, k));
  return L.ruleAbs.mul(line.mul(inside));
}

// The share of the sun's disk seen through the window from p (light/direct.js
// sunAperture, in world px): the soft-edged patch of sun.
function aperture(p, Ls, L) {
  const out = float(0).toVar();
  If(Ls.z.greaterThan(0).and(Ls.y.greaterThan(1e-6)), () => {
    const t = L.wallY.sub(p.y).div(Ls.y);
    If(t.greaterThan(0), () => {
      const x = p.x.add(Ls.x.mul(t)),
        z = p.z.add(Ls.z.mul(t));
      const w = t.mul(SUN_RADIUS);
      const below = (q) => {
        const c = clamp(q, -1, 1);
        return float(0.5).add(
          c
            .mul(sqrt(float(1).sub(c.mul(c))))
            .add(asin(c))
            .div(Math.PI),
        );
      };
      const within = (c, hw, a, b) => below(b.sub(c).div(hw)).sub(below(a.sub(c).div(hw)));
      const wx = w.mul(sqrt(float(1).add(Ls.x.div(Ls.y).mul(Ls.x.div(Ls.y)))));
      const wz = w.mul(sqrt(float(1).add(Ls.z.div(Ls.y).mul(Ls.z.div(Ls.y)))));
      out.assign(max(within(x, wx, L.window.x, L.window.y).mul(within(z, wz, L.window.z, L.window.w)), 0));
    });
  });
  return out;
}

// The eye's tone (light/eye.js EYE_GLSL eyeTone): linear up to the knee, then a soft shoulder.
const KNEE = 0.9;
const eyeTone = (x) =>
  mix(
    max(x, vec3(0)),
    tanh(x.sub(KNEE).div(1 - KNEE))
      .mul(1 - KNEE)
      .add(KNEE),
    step(vec3(KNEE), x),
  );

// Whether the table's slab is between p and a light toward `dir` (unit), within
// `far` world px: 0 hidden, 1 not (a ray against the box).
function underSlab(p, dir, far, L) {
  const inv = vec3(1).div(select(abs(dir).lessThan(vec3(1e-6)), vec3(1e-6), dir));
  const t0 = L.slabMin.sub(p).mul(inv),
    t1 = L.slabMax.sub(p).mul(inv);
  const lo = max(max(min(t0.x, t1.x), min(t0.y, t1.y)), min(t0.z, t1.z));
  const hi = min(min(max(t0.x, t1.x), max(t0.y, t1.y)), max(t0.z, t1.z));
  return select(hi.greaterThan(max(lo, 0.5)).and(lo.lessThan(far)), float(0), float(1));
}

// A face's mirror toward a source (light/shine.js glint): Beckmann's share of the faces turned
// to the half vector, the surface's own scatter and the source's size together (m2), over
// 4 n·v; and how near grazing the eye meets those faces (Schlick's (1 − cos)^5).
function lobe(n, V, Ld, m2) {
  const h = normalize(Ld.add(V)).toVar();
  const c = max(dot(n, h), 1e-3).toVar();
  const c2 = c.mul(c).toVar();
  const D = exp(float(1).sub(c2).div(c2.mul(m2)).negate()).div(c2.mul(c2).mul(m2).mul(Math.PI));
  return { k: select(dot(n, Ld).greaterThan(0), D.div(max(dot(n, V), 0.05).mul(4)), float(0)), graze: pow(float(1).sub(clamp(dot(h, V), 0, 1)), 5) };
}

// The light on a point (reflectance R: four vec4s): the room's settled light by
// how open the point is to it, the sun through the window and each flame, each
// through its shade (sun, flame 1, flame 2); its faces mirror the sources as
// scattered as they are (m2: matter-fixes §5, light/shine.js), turning back what
// their matter does (opts.f0; a metal, opts.metal: its own colour, and nothing
// from beneath its face); the eye takes it to the screen. The moments' bands
// darken their cells. opts.ambient: the room's light already as colour (a room
// surface's, from its vertices) in place of the page's; opts.indirect: the
// room's light as a spectrum (four vec4s: a mark's, rooms.md §2, so ink on a
// wall drinks it by wavelength); opts.slab: the table's slab may hide the sources.
function spectral(R, n, open, shade, m2, V, L, band, opts = {}) {
  const p = positionWorld;
  const Ls = normalize(L.sunDir).toVar();
  const sunOn = aperture(p, Ls, L)
    .mul(shade.x)
    .mul(opts.slab ? underSlab(p, Ls, 1e9, L) : float(1))
    .toVar();
  // what the room's things leave of each source (matter-fixes §4), asked only where it shines
  const q = L.shadow ? p.add(n.mul(L.pxPerM.mul(LIFT_M))).toVar() : null;
  if (L.shadow) {
    If(L.shadow.on.x.greaterThan(0.5).and(sunOn.greaterThan(0)).and(dot(n, Ls).greaterThan(0)), () => {
      sunOn.mulAssign(sunReach(q, L));
    });
  }
  const sunCos = max(dot(n, Ls), 0).mul(sunOn);
  const sunLobe = lobe(n, V, Ls, m2.add(SUN_RADIUS * SUN_RADIUS));
  const sunSpec = sunLobe.k.mul(sunOn);
  const flames = L.candleAt.map((pos, k) => {
    const toF = pos.sub(p).toVar();
    const d = length(toF).toVar();
    const Lf = toF.div(d);
    const dm = d.div(L.pxPerM);
    const fall = float(1)
      .div(dm.mul(dm))
      .mul(k === 0 ? shade.y : shade.z)
      .mul(opts.slab ? underSlab(p, Lf, d, L) : float(1))
      .toVar();
    if (L.shadow) {
      If((k ? L.shadow.on.z : L.shadow.on.y).greaterThan(0.5).and(dot(n, Lf).greaterThan(0)), () => {
        fall.mulAssign(flameReach(q, k, L));
      });
    }
    const size = L.flameR[k].div(d);
    const lb = lobe(n, V, Lf, m2.add(size.mul(size)));
    return { on: max(dot(n, Lf), 0).mul(fall), spec: lb.k.mul(fall), graze: lb.graze };
  });
  const f0 = float(opts.f0 ?? PAPER_F0);
  const metal = opts.metal === undefined || opts.metal === false ? null : opts.metal === true ? float(1) : float(opts.metal);
  // how much the faces turn back toward grazing (Schlick's): a dielectric's own, a metal's colour
  const turned = (g, graze) => {
    const own = vec4(f0.add(f0.oneMinus().mul(graze)));
    return metal ? mix(own, R[g].add(R[g].oneMinus().mul(graze)), metal) : own;
  };
  const rgb = (opts.ambient ?? vec3(0)).toVar();
  for (let g = 0; g < BIN_GROUPS; g++) {
    const room = opts.ambient ? vec4(0) : opts.indirect ? opts.indirect[g] : L.indirect.element(g).mul(open);
    // (a metal has nothing beneath its face: all it gives back of a source is its mirror)
    const direct = L.sunE.element(g).mul(sunCos).add(L.flameI[0].element(g).mul(flames[0].on)).add(L.flameI[1].element(g).mul(flames[1].on));
    const E = metal ? room.add(direct.mul(float(1).sub(metal))) : room.add(direct);
    const mirror = L.sunE
      .element(g)
      .mul(sunSpec)
      .mul(turned(g, sunLobe.graze))
      .add(L.flameI[0].element(g).mul(flames[0].spec).mul(turned(g, flames[0].graze)))
      .add(L.flameI[1].element(g).mul(flames[1].spec).mul(turned(g, flames[1].graze)));
    const rad = R[g].mul(E).div(Math.PI).add(mirror).toVar();
    rgb.addAssign(vec3(dot(L.W[0].element(g), rad), dot(L.W[1].element(g), rad), dot(L.W[2].element(g), rad)));
  }
  const col = eyeTone(rgb).toVar();
  // show the moments: faint tree rings of when each cell's ink went down
  if (band) {
    If(L.bandOn.greaterThan(0.5).and(band().greaterThan(0.5)), () => {
      col.mulAssign(0.86);
    });
  }
  return col;
}

// --- the room (light-waves §4: its surfaces grown cell by cell, at the paper's grain) ---

// growMean (light/surface.js) in the shader's own language: → (height, tone); and a crisp
// cell's face (cellFace: its height's rise to its +x and +y neighbours). One copy of the
// grower's code for both.
const surfaceCode = {};
const codeOf = (webgpu) => (surfaceCode[webgpu ? 'wgsl' : 'glsl'] ??= webgpu ? code(grown.SURFACE_WGSL, [], 'wgsl') : code(grown.SURFACE_GLSL, [], 'glsl'));
const growers = {};
function grower(webgpu) {
  const key = webgpu ? 'wgsl' : 'glsl';
  growers[key] ??= webgpu
    ? wgslFn('fn roomGrow(kind: i32, m: u32, pos: vec2<f32>, foot: f32) -> vec2<f32> { return growMean(kind, m, pos, foot); }', [codeOf(true)])
    : glslFn('vec2 roomGrow(int kind, uint m, vec2 pos, float foot) { return growMean(kind, m, pos, foot); }', [codeOf(false)]);
  return growers[key];
}
const facers = {};
function facer(webgpu) {
  const key = webgpu ? 'wgsl' : 'glsl';
  facers[key] ??= webgpu
    ? wgslFn('fn roomFace(kind: i32, m: u32, pos: vec2<f32>) -> vec2<f32> { return vec2<f32>(cellFace(kind, m, vec2<u32>(max(pos, vec2<f32>(0.0))))); }', [codeOf(true)])
    : glslFn('vec2 roomFace(int kind, uint m, vec2 pos) { return vec2(cellFace(kind, m, uvec2(max(pos, vec2(0.0))))); }', [codeOf(false)]);
  return facers[key];
}
// A grown surface's reflectance at tone t (0..1): its light curve toward its dark one.
const toned = (light, dark, t) => [0, 1, 2, 3].map((g) => light[g].add(dark[g].sub(light[g]).mul(t)));
// A matter's two curves, each as four plain vec4 uniforms (not a uniform array: an array's
// buffer is named for its own node, so two materials of one kind would make two programs;
// plain uniforms are named in order, and the same code is compiled once).
const curveUniforms = (c) => [0, 1, 2, 3].map((g) => uniform(new THREE.Vector4(c[4 * g], c[4 * g + 1], c[4 * g + 2], c[4 * g + 3])));
const pairUniforms = ({ light, dark }) => [curveUniforms(light), curveUniforms(dark)];
// How many cells a pixel covers here (the eye's footprint: crisp up close, averaged far away).
const footAt = (L) => max(length(positionWorld.sub(cameraPosition)).div(L.pxPerM).mul(L.footK), 1e-4);

// A grown kind's own, in the code (each program its kind's grower path only, and its
// matter's shine); what differs between surfaces of one kind (its seed, which way it
// faces) is uniforms, so they share one program.
const kindOf = (kind) => {
  const rough = shine.ROUGH[kind],
    f0 = shine.f0OfKind(kind);
  return { kind: uniform(kind, 'int'), m2: uniform(rough.m2), sub: uniform(rough.sub), f0: uniform(f0 ?? 0), metal: uniform(f0 === null ? 1 : 0) };
};

// Its faces (matter-fixes §5, light/shine.js): up close (a cell several pixels wide) each
// cell is its own face, its rise to its +u and +v neighbours (grown, at true scale), a
// mirror scattered only by what lies below a cell; far away (many cells a pixel) the
// faces it holds widen the lobe instead. K: kindOf; normal, u, v: vec3 uniforms. → { n, m2 }
function facesOf(webgpu, K, seedU, pos, foot, normal, u, v) {
  const n = vec3(normal).toVar();
  const m2 = float(K.m2).toVar();
  If(foot.lessThan(3), () => {
    const rise = facer(webgpu)({ kind: K.kind, m: seedU, pos }).mul(grown.DROP_PX / grown.CELL_PX);
    const face = normalize(n.sub(u.mul(rise.x)).sub(v.mul(rise.y)));
    const near = smoothstep(3, 1, foot);
    n.assign(normalize(mix(n, face, near)));
    m2.assign(mix(m2, K.sub, near));
  });
  return { n, m2 };
}

// A surface of the room (floor, ceiling, a wall, the table): its cells grown from
// its seed (attribute cellPos: where in its own cells), its tone between its
// matter's light and dark curves; the room's light from its vertices (ambA + t·ambB:
// the colours its light and dark curves reflect), the sun and the flames per pixel.
// spec: { kind (light/surface.js), seed (u32), pair ({ light, dark } curves), normal,
// axes ({ u, v }: its cells' directions, room axes), top (the table's top: the sheets'
// shadows fall on it), webgpu }.
export function roomMaterial(L, { kind, seed, pair, normal, axes = null, top = false, slab = true, webgpu }) {
  const m = new MeshBasicNodeMaterial();
  const [light, dark] = pairUniforms(pair);
  const seedU = uniform(seed, 'uint');
  const K = kindOf(kind);
  const normalU = uniform(new THREE.Vector3(...normal)),
    uU = uniform(new THREE.Vector3(...(axes?.u ?? [0, 0, 0]))),
    vU = uniform(new THREE.Vector3(...(axes?.v ?? [0, 0, 0])));
  const grow = grower(webgpu);
  m.colorNode = Fn(() => {
    const pos = attribute('cellPos', 'vec2');
    const foot = footAt(L).toVar();
    const ht = grow({ kind: K.kind, m: seedU, pos, foot });
    const t = clamp(ht.y.div(255), 0, 1).toVar();
    const ambient = attribute('ambA', 'vec3').add(attribute('ambB', 'vec3').mul(t));
    const V = normalize(cameraPosition.sub(positionWorld));
    const { n, m2 } = facesOf(webgpu, K, seedU, pos, foot, normalU, uU, vU);
    return spectral(toned(light, dark, t), n, float(0), top ? restShade(L, L.rests) : vec3(1), m2, V, L, null, { ambient, slab: slab && !top, f0: K.f0, metal: K.metal });
  })();
  m.seed = seedU; // a view grows its owner's room (rooms.md §1): engine.js setSeeds
  return m;
}

// A mark on a surface (rooms.md §2: a wall written on is a sheet): the
// surface's own cells grown under it, the same seed and the same cells (where
// there is no ink it is the surface itself), drinking through the ink (`ink`:
// its look, colour to alpha over white as the chunks take it: the law's
// transmittance; its absorbance −ln T by the INK basis), lit like the surface: the room's light as a
// spectrum at its corners (attributes amb0..amb3, from the surface's own
// vertices), the sun and the flames per pixel. Drawn just over the surface.
export function markMaterial(L, { kind, seed, pair, normal, ink, webgpu }) {
  const m = new MeshBasicNodeMaterial({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const [light, dark] = pairUniforms(pair);
  const seedU = uniform(seed, 'uint');
  const K = kindOf(kind);
  const normalU = uniform(new THREE.Vector3(...normal));
  const inkTex = texture(ink);
  m.colorNode = Fn(() => {
    const ht = grower(webgpu)({ kind: K.kind, m: seedU, pos: attribute('cellPos', 'vec2'), foot: footAt(L) });
    const t = clamp(ht.y.div(255), 0, 1).toVar();
    const ink4 = at(inkTex, down()).toVar();
    const a = log(max(mix(vec3(1), ink4.rgb, ink4.a), vec3(1 / 512))).negate(); // as a chunk takes its colour (colour to alpha over white)
    const E = [0, 1, 2, 3].map((g) => attribute(`amb${g}`, 'vec4'));
    const V = normalize(cameraPosition.sub(positionWorld));
    const surf = toned(light, dark, t); // (four vec4s, not a uniform array)
    const R = surf.map((r, g) => r.mul(exp(INK[0][g].mul(a.x).add(INK[1][g].mul(a.y)).add(INK[2][g].mul(a.z)).negate())));
    return spectral(R, vec3(normalU), float(0), vec3(1), float(K.m2), V, L, null, { indirect: E, slab: true, f0: K.f0, metal: K.metal });
  })();
  m.seed = seedU;
  return m;
}

// A thing's cells where the pixel is, on its own surface (light/surface.js
// objectCells, the same): counted from its own corner in its own units, scaled by
// its size, so its grain goes where it goes.
function cellsOn(shape) {
  const p = positionLocal,
    n = normalLocal;
  const s = modelScale.mul(1 / grown.CELL_PX);
  if (shape === 'box') {
    const q = p.add(0.5).mul(s);
    return select(abs(n.z).greaterThan(0.5), q.xy, select(abs(n.x).greaterThan(0.5), q.yz, q.xz));
  }
  if (shape === 'ball') return vec2(atan(p.z, p.x).add(Math.PI).mul(s.x), p.y.add(1).mul(s.y));
  const side = vec2(atan(p.y, p.x).add(Math.PI).mul(s.x), p.z.add(1).mul(s.z));
  return select(abs(n.z).greaterThan(0.5), p.xy.add(1).mul(s.xy), side);
}

// A thing (a leg, the window's frame, a holder, a candle's wax and wick, the pen,
// a being): its matter grown cell by cell as the walls are (light/surface.js: wood,
// brass, wax, wick, cloth, skin; kind null: one even tone, cloth's faces: a book's
// cover), its cells on its own surface (shape: 'box', 'round', 'ball'), lit like the
// room, its faces as scattered as its grower's (brass: a metal, its glint its colour).
// Its seed: each mesh's own (userData.seed), else m.seedBase. Its light: the room's
// where each mesh is (userData.ambient: { A, B }, colours: matter-fixes §4), else m.ambient's.
export function objectMaterial(L, { kind = null, seed = 0, pair, shape = 'box', webgpu }) {
  const m = new MeshBasicNodeMaterial();
  const [light, dark] = pairUniforms(pair);
  m.ambient = { A: new THREE.Vector3(), B: new THREE.Vector3() };
  const A = uniform(new THREE.Vector3()).onObjectUpdate(({ object }) => (object.userData.ambient ?? m.ambient).A),
    B = uniform(new THREE.Vector3()).onObjectUpdate(({ object }) => (object.userData.ambient ?? m.ambient).B);
  m.seedBase = seed;
  const seedU = uniform(seed, 'uint').onObjectUpdate(({ object }) => object.userData.seed ?? m.seedBase);
  const K = kindOf(kind ?? grown.CLOTH);
  const even = uniform(kind === null ? 1 : 0); // (one even tone: no grower's tone, and cloth's faces)
  m.colorNode = Fn(() => {
    const n = normalize(normalWorld).toVar();
    const t = clamp(grower(webgpu)({ kind: K.kind, m: seedU, pos: cellsOn(shape), foot: footAt(L) }).y.div(255), 0, 1)
      .mul(float(1).sub(even))
      .toVar();
    const V = normalize(cameraPosition.sub(positionWorld));
    return spectral(toned(light, dark, t), n, float(0), vec3(1), float(K.m2), V, L, null, { ambient: A.add(B.mul(t)), slab: true, f0: K.f0, metal: K.metal });
  })();
  return m;
}

// A pane of the window: the outside seen through the glass (a map of the sky,
// the sun and the field, by direction: light/outside.js outsideMap, already
// through the glass and the eye's weights, linear), toned by the eye.
export function windowMaterial(outside) {
  const m = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const d = normalize(positionWorld.sub(cameraPosition)).toVar();
    const az = atan(d.x, d.y); // 0 straight out of the window (+y), toward +x is positive
    const el = asin(clamp(d.z, -1, 1));
    const q = vec2(az.div(2 * Math.PI).add(0.5), float(0.5).sub(el.div(Math.PI)));
    return eyeTone(texture(outside, q).rgb);
  })();
  return m;
}

// A value of the object being drawn (its chunk, or a base's or the page's
// numbers: object.userData.c); or, with `c` given, fixed to that one.
const each = (node, pick) => node.onObjectUpdate(({ object }) => pick(object.userData.c));
const fixed = (c) => (node, pick) => {
  node.value = pick(c);
  return node;
};
const valueOf = (c) => (c ? fixed(c) : each);

// A chunk's own textures and numbers, as nodes. c: { heightTex, colorTex, detailTex,
// bandTex, surfRT, shadeRT, realDetail (0 or 1), cellPx, valid, origin (world x
// of the chunk's left edge, world y of its top: texture v runs down the page), size }.
function chunkNodes(K, c = null) {
  const each = valueOf(c);
  return {
    H: each(texture(K.blank.half), (c) => c.heightTex),
    C: each(texture(K.blank.color), (c) => c.colorTex),
    D: each(texture(K.blank.byte), (c) => c.detailTex),
    B: each(texture(K.blank.byte), (c) => c.bandTex),
    SF: each(texture(K.blank.surface), (c) => c.surfRT.texture), // (targets from the start: engine.js blank)
    SH: each(texture(K.blank.shade), (c) => c.shadeRT.texture),
    G: texture(K.generic),
    realDetail: each(uniform(0), (c) => c.realDetail),
    cellPx: each(uniform(1), (c) => c.cellPx),
    valid: each(uniform(new THREE.Vector4()), (c) => c.valid),
    origin: each(uniform(new THREE.Vector2()), (c) => c.origin),
    size: each(uniform(1), (c) => c.size),
    detailScale: vec2(K.CHUNK / 256, K.CHUNK / 256),
  };
}

// The paper's fine detail at texture point q: its own fibers (own and open
// sheets), else a generic grain (scaled to the chunk).
const detailOf = (u, K) => (q) => select(u.realDetail.greaterThan(0.5), at(u.D, q).r, at(u.G, q.mul(u.detailScale).mul(K.TEXN / K.CHUNK)).r);

// A pass into a target: its four channels exactly as computed.
function bakeMaterial(fn) {
  const m = new NodeMaterial();
  m.fragmentNode = fn;
  m.depthTest = false;
  m.depthWrite = false;
  return m;
}

// --- the check: is the relief under the ink? ---

// A chunk's raw height (the facts' top), its baked surface (what the relief,
// the normals and the shade are drawn from) and its ink's alpha, each sampled
// exactly as the chunk is drawn (the same nodes, the same coordinates), into a
// target the engine reads back (engine.js reliefCheck).
export function alignMaterial(K, c = null) {
  const u = chunkNodes(K, c);
  return bakeMaterial(
    Fn(() => {
      // over the chunk's own cells (CHUNK × CHUNK: a row a 256-byte multiple, as a read back wants),
      // at the very points the chunk samples them (the bakes and the drawing take the same row order)
      const q = down().mul(K.CHUNK).add(K.APRON).div(K.TEXN).toVar();
      return vec4(at(u.H, q).r, at(u.SF, q).r, at(u.C, q).a, at(u.SH, q).r);
    })(),
  );
}

// --- baked ---

// The surface: (drawn height in drops, normal x, normal y, openness).
export function surfaceBake(L, K, c = null) {
  const u = chunkNodes(K, c);
  const detail = detailOf(u, K);
  const texel = 1 / K.TEXN;
  const hPx = (q) => at(u.H, q).r.mul(L.dropPx).add(detail(q).mul(DETAIL_PX)); // height, page px
  return bakeMaterial(
    Fn(() => {
      const q = down().toVar();
      // a groove is smooth even where the nib pressed unevenly cell by cell: 3 × 3 cells
      const sum = float(0).toVar();
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) sum.addAssign(at(u.H, q.add(vec2(dx * texel, dy * texel))).r);
      // the normal over a few cells (page y runs down the texture, world y up)
      const gx = hPx(q.add(vec2(3 * texel, 0))).sub(hPx(q.sub(vec2(3 * texel, 0))));
      const gy = hPx(q.add(vec2(0, 3 * texel))).sub(hPx(q.sub(vec2(0, 3 * texel))));
      const n = normalize(vec3(gx.negate().div(u.cellPx.mul(6)), gy.div(u.cellPx.mul(6)), 1)).toVar();
      // how open to the sky: the steepest rise around, in eight directions
      const h0 = hPx(q).toVar();
      const shut = float(0).toVar();
      for (let k = 0; k < 8; k++) {
        const d = [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)];
        const rise = float(0).toVar();
        for (const r of [2, 4, 8])
          rise.assign(
            max(
              rise,
              hPx(q.add(vec2(d[0] * r * texel, d[1] * r * texel)))
                .sub(h0)
                .div(u.cellPx.mul(r)),
            ),
          );
        shut.addAssign(clamp(rise, 0, 1));
      }
      return vec4(sum.div(9), n.x, n.y, float(1).sub(shut.mul(0.6 / 8)));
    })(),
  );
}

// The faces' scatter about a cell (matter-fixes §5, light/shine.js slopeVariance), in
// world px²/px²: over the 4 × 4 cells around it, each cell's rise to its +x and +y
// neighbours at true scale (the relief drawn taller than true makes nothing rougher), and
// what lies below a cell. Its top is the paper's fibers, or what stands over them where
// that stands higher: a bead's water lies smooth over them and glints (smooth below a cell
// too); a thin dry film follows them and is matte. No flag says wet: the heights do.
function facesScatter(u, detail, texel) {
  return (q) => {
    const t = [];
    const fibers = float(0).toVar();
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const p = q.add(vec2(dx * texel, dy * texel));
        const h = at(u.H, p).toVar();
        const paper = h.r.sub(h.g).mul(grown.DROP_PX).add(detail(p).mul(DETAIL_PX)).toVar(),
          over = h.r.mul(grown.DROP_PX).toVar();
        fibers.addAssign(step(over, paper));
        t.push(max(paper, over).toVar());
      }
    const sx = float(0).toVar(),
      sy = float(0).toVar(),
      sxx = float(0).toVar(),
      syy = float(0).toVar();
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const gx = t[y * 5 + x + 1].sub(t[y * 5 + x]).div(u.cellPx);
        const gy = t[(y + 1) * 5 + x].sub(t[y * 5 + x]).div(u.cellPx);
        sx.addAssign(gx);
        sy.addAssign(gy);
        sxx.addAssign(gx.mul(gx));
        syy.addAssign(gy.mul(gy));
      }
    const vx = sxx.div(16).sub(sx.div(16).mul(sx.div(16)));
    const vy = syy.div(16).sub(sy.div(16).mul(sy.div(16)));
    return max(vx.add(vy), 0).add(fibers.div(25).mul(shine.PAPER_SUB));
  };
}

// The shade: how lit toward (the sun, candle 1, candle 2); 1 where nothing is in the way.
// Marched across the height field: 16 steps, each longer than the last. Its fourth
// channel: how scattered the faces are there (facesScatter), for the shine.
export function shadeBake(L, K, c = null) {
  const u = chunkNodes(K, c);
  const detail = detailOf(u, K);
  const texel = 1 / K.TEXN;
  const scatter = facesScatter(u, detail, texel);
  const hPx = (q) => at(u.SF, q).r.mul(L.dropPx).add(detail(q).mul(DETAIL_PX));
  const march = (q0, h0, Ld) => {
    const lit = float(1).toVar();
    const across = length(Ld.xy);
    If(across.lessThan(1e-4).or(Ld.z.lessThanEqual(0)), () => {
      lit.assign(select(Ld.z.greaterThan(0), float(1), float(0)));
    }).Else(() => {
      const dirUv = vec2(Ld.x, Ld.y.negate()).div(across).mul(texel);
      const slope = Ld.z.div(across).mul(u.cellPx); // page px the ray rises per texel
      const t = float(1.2).toVar();
      Loop(16, () => {
        const q = clamp(q0.add(dirUv.mul(t)), vec2(0), vec2(1));
        const over = hPx(q)
          .sub(h0.add(0.02).add(slope.mul(t)))
          .toVar();
        If(over.greaterThan(0), () => {
          lit.subAssign(clamp(over.mul(0.9), 0, 0.35));
        });
        t.mulAssign(1.25);
      });
      lit.assign(clamp(lit, 0.25, 1));
    });
    return lit;
  };
  return bakeMaterial(
    Fn(() => {
      const q = down().toVar();
      const h0 = hPx(q).toVar();
      // where this cell is in the world (for the candles, which are points)
      const core = q.mul(K.TEXN).sub(K.APRON).div(K.CHUNK);
      const here = vec3(u.origin.x.add(core.x.mul(u.size)), u.origin.y.sub(core.y.mul(u.size)), h0);
      const lit = [march(q, h0, normalize(L.sunDir))];
      for (const pos of L.candleAt) lit.push(march(q, h0, normalize(pos.sub(here))));
      return vec4(lit[0], lit[1], lit[2], scatter(q));
    })(),
  );
}

// --- drawn ---

// A chunk of a sheet, every frame: its baked surface and shade, its ink, its light.
export function chunkMaterial(L, K, c = null) {
  const m = new MeshBasicNodeMaterial();
  const u = chunkNodes(K, c);
  const detail = detailOf(u, K);
  const core = down();
  const toTex = (k) => k.mul(K.CHUNK).add(K.APRON).div(K.TEXN);
  m.positionNode = Fn(() => vec3(positionLocal.x, positionLocal.y, at(u.SF, toTex(core)).r.mul(L.dropPx)))();
  m.colorNode = Fn(() => {
    Discard(core.x.lessThan(u.valid.x).or(core.y.lessThan(u.valid.y)).or(core.x.greaterThan(u.valid.z)).or(core.y.greaterThan(u.valid.w))); // past the sheet's edge
    const q = toTex(core).toVar();
    const hf = at(u.H, q).toVar();
    Discard(mod(hf.a, 2).greaterThanEqual(1)); // torn: what is behind shows through
    const sf = at(u.SF, q).toVar();
    const n = vec3(sf.g, sf.b, sqrt(max(float(1).sub(sf.g.mul(sf.g)).sub(sf.b.mul(sf.b)), 0))).toVar();
    const shade = at(u.SH, q).toVar();
    // its faces (matter-fixes §5): far away, the scatter baked about it widens the lobe; up close
    // each cell is its own face (its rise to its neighbours, as drawn), scattered only below a cell
    const m2 = shade.a.toVar();
    const foot = footAt(L).toVar();
    If(foot.lessThan(3).and(u.cellPx.lessThan(1)), () => {
      const texel = 1 / K.TEXN;
      const drawn = (p) => at(u.H, p).r.mul(L.dropPx).add(detail(p).mul(DETAIL_PX));
      const h0 = drawn(q).toVar();
      const face = normalize(
        vec3(
          drawn(q.add(vec2(texel, 0)))
            .sub(h0)
            .negate()
            .div(u.cellPx),
          drawn(q.add(vec2(0, texel)))
            .sub(h0)
            .div(u.cellPx),
          1,
        ),
      );
      const near = smoothstep(3, 1, foot);
      n.assign(normalize(mix(n, face, near)));
      m2.assign(mix(m2, float(shine.PAPER_SUB), near));
    });
    const ink = between(u.C, q, K.TEXN, L).toVar();
    const V = normalize(cameraPosition.sub(positionWorld)).toVar();
    // the ink's absorbance per channel: its look is the light it lets through
    // (colour to alpha over white: the law's transmittance), and ink sunk into the
    // fibers drinks more at grazing angles
    const through = max(mix(vec3(1), ink.rgb, ink.a), vec3(1 / 512));
    const graze = clamp(V.z, 0, 1).oneMinus();
    const a = log(through)
      .negate()
      .mul(float(1).add(graze.mul(0.35).mul(hf.b.div(24))));
    return spectral(reflectance(L.paper, a.add(ruleAt(L))), n, sf.a, shade, m2, V, L, () => at(u.B, q).r);
  })();
  return m;
}

// The flat paper (a sheet's base where no chunk is, the page under the sheets):
// its grain's normal, nothing in the way. Per object: { detailScale: Vector2
// (the grain's repeats across it), cellPx (page px a grain cell) }.
export function flatMaterial(L, K, c = null, shadowed = false) {
  const each = valueOf(c);
  const m = new MeshBasicNodeMaterial();
  const G = texture(K.generic);
  const detailScale = each(uniform(new THREE.Vector2(1, 1)), (c) => c.detailScale);
  const cellPx = each(uniform(1), (c) => c.cellPx);
  const m2 = float(K.genericM2 ?? shine.PAPER_SUB); // its faces as scattered as blank paper's (shadeBake's, of the grain)
  const d = 3 / 256; // three cells of the grain
  const g = (q) => at(G, q).r.mul(DETAIL_PX);
  m.colorNode = Fn(() => {
    const q = down().mul(detailScale).toVar();
    const gx = g(q.add(vec2(d, 0))).sub(g(q.sub(vec2(d, 0))));
    const gy = g(q.add(vec2(0, d))).sub(g(q.sub(vec2(0, d))));
    const n = normalize(vec3(gx.negate().div(cellPx.mul(6)), gy.div(cellPx.mul(6)), 1)).toVar(); // (page y down, world y up: as the surface's)
    const V = normalize(cameraPosition.sub(positionWorld));
    return spectral(reflectance(L.paper, ruleAt(L)), n, float(1), shadowed ? restShade(L, L.onPage) : vec3(1), m2, V, L, null);
  })();
  return m;
}

// The cut's picture (the side view, law/v2/look.js), rows top down as it comes.
export function cutMaterial(picture) {
  const m = new MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide });
  m.colorNode = texture(picture, down());
  return m;
}

// A candle's flame (matter-fixes §6): a teardrop facing the eye, its size and
// place from the candle's state (light.js: candleState flameSize, flameAt), its
// colour only the black body its light is, as the eye sees it (`core`, light.js
// seenRgb), brighter toward its middle, where the eye takes it as white, with a
// soft glow; added to what is behind it. `brightness` is its strength now. (As
// hot gas in the room's air it waits for world.md 3b.)
export function flameMaterial() {
  const m = new SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const brightness = uniform(1);
  const core = uniform(new THREE.Color(1, 0.8, 0.5));
  m.colorNode = Fn(() => {
    const p = uv().sub(vec2(0.5, 0.32)).mul(vec2(2.2, 1.3)).toVar(); // the drop's round foot low, its tip up
    const r = length(vec2(p.x.mul(float(1).add(max(p.y, 0).mul(1.6))), p.y));
    const body = smoothstep(0.62, 0.18, r);
    const hot = smoothstep(0.3, 0.02, r);
    const glow = smoothstep(1.1, 0.2, length(uv().sub(vec2(0.5, 0.4)).mul(vec2(1.6, 1.1)))).mul(0.25);
    const col = core.mul(body.add(hot.mul(2)).add(glow));
    return vec4(col.mul(brightness), body.add(glow).clamp(0, 1).mul(brightness));
  })();
  m.brightness = brightness;
  m.core = core;
  return m;
}

// The paper's cut edges: its layers, lit.
export function slabMaterial(L, K = {}) {
  const m = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const layer = float(0.94).add(float(0.06).mul(step(0.5, fract(positionWorld.z.mul(1.4)))));
    const V = normalize(cameraPosition.sub(positionWorld));
    return spectral(
      plainly(L.paper).map((r) => r.mul(layer)),
      normalize(normalWorld),
      float(0.8),
      vec3(1),
      float(K.genericM2 ?? shine.PAPER_SUB), // (its cut fibers: as scattered as its face, at least)
      V,
      L,
      null,
    );
  })();
  return m;
}
