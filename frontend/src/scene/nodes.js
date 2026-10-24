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

import * as THREE from 'three';
import { MeshBasicNodeMaterial, NodeMaterial } from 'three/webgpu';
import { Fn, If, Loop, Discard, select, uniform, texture, uv, positionLocal, positionWorld, cameraPosition, vec2, vec3, vec4, float, mix, clamp, normalize, dot, max, pow, length, mod, floor, fract, step, sqrt } from 'three/tsl';

export { WebGPURenderer, ClippingGroup } from 'three/webgpu';

const at = (t, q) => t.sample(q).level(0);
const DETAIL_PX = 0.35; // the fibers' relief, page px

// The lights as uniforms (light.js lightAt, page frame → world), and the height scale.
export function lightUniforms(paper, dropPx) {
  const L = {
    sunDir: uniform(new THREE.Vector3(0, 0, 1)),
    sunColor: uniform(new THREE.Color(1, 1, 1)),
    sunInt: uniform(1),
    candlePos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    candleColor: uniform(new THREE.Color(1, 0.5, 0.15)),
    candleInt: uniform(new THREE.Vector2()),
    ambient: uniform(0.35),
    bandOn: uniform(0),
    paper: uniform(paper.clone()),
    dropPx: uniform(dropPx), // page px a drop of height (the relief's exaggeration in it)
  };
  L.candleAt = L.candlePos.value.map((v) => uniform(v));
  return L;
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
    SF: each(texture(K.blank.half), (c) => c.surfRT.texture),
    SH: each(texture(K.blank.rgba), (c) => c.shadeRT.texture),
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

// --- baked ---

// The surface: (drawn height in drops, normal x, normal y, openness).
export function surfaceBake(L, K, c = null) {
  const u = chunkNodes(K, c);
  const detail = detailOf(u, K);
  const texel = 1 / K.TEXN;
  const hPx = (q) => at(u.H, q).r.mul(L.dropPx).add(detail(q).mul(DETAIL_PX)); // height, page px
  return bakeMaterial(Fn(() => {
    const q = uv().toVar();
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
      for (const r of [2, 4, 8]) rise.assign(max(rise, hPx(q.add(vec2(d[0] * r * texel, d[1] * r * texel))).sub(h0).div(u.cellPx.mul(r))));
      shut.addAssign(clamp(rise, 0, 1));
    }
    return vec4(sum.div(9), n.x, n.y, float(1).sub(shut.mul(0.6 / 8)));
  })());
}

// The shade: how lit toward (the sun, candle 1, candle 2); 1 where nothing is in the way.
// Marched across the height field: 16 steps, each longer than the last.
export function shadeBake(L, K, c = null) {
  const u = chunkNodes(K, c);
  const detail = detailOf(u, K);
  const texel = 1 / K.TEXN;
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
        const over = hPx(q).sub(h0.add(0.02).add(slope.mul(t))).toVar();
        If(over.greaterThan(0), () => {
          lit.subAssign(clamp(over.mul(0.9), 0, 0.35));
        });
        t.mulAssign(1.25);
      });
      lit.assign(clamp(lit, 0.25, 1));
    });
    return lit;
  };
  return bakeMaterial(Fn(() => {
    const q = uv().toVar();
    const h0 = hPx(q).toVar();
    // where this cell is in the world (for the candles, which are points)
    const core = q.mul(K.TEXN).sub(K.APRON).div(K.CHUNK);
    const here = vec3(u.origin.x.add(core.x.mul(u.size)), u.origin.y.sub(core.y.mul(u.size)), h0);
    const lit = [march(q, h0, normalize(L.sunDir))];
    for (const pos of L.candleAt) lit.push(march(q, h0, normalize(pos.sub(here))));
    return vec4(lit[0], lit[1], lit[2], 1);
  })());
}

// --- drawn ---

// A chunk of a sheet, every frame: its baked surface and shade, its ink, its light.
export function chunkMaterial(L, K, c = null) {
  const m = new MeshBasicNodeMaterial();
  const u = chunkNodes(K, c);
  const core = vec2(uv().x, uv().y.oneMinus());
  const toTex = (k) => k.mul(K.CHUNK).add(K.APRON).div(K.TEXN);
  m.positionNode = Fn(() => vec3(positionLocal.x, positionLocal.y, at(u.SF, toTex(core)).r.mul(L.dropPx)))();
  m.colorNode = Fn(() => {
    Discard(core.x.lessThan(u.valid.x).or(core.y.lessThan(u.valid.y)).or(core.x.greaterThan(u.valid.z)).or(core.y.greaterThan(u.valid.w))); // past the sheet's edge
    const q = toTex(core).toVar();
    const hf = at(u.H, q).toVar();
    Discard(mod(hf.a, 2).greaterThanEqual(1)); // torn: what is behind shows through
    const wet = mod(floor(hf.a.div(2)), 2).toVar();
    const sf = at(u.SF, q).toVar();
    const n = vec3(sf.g, sf.b, sqrt(max(float(1).sub(sf.g.mul(sf.g)).sub(sf.b.mul(sf.b)), 0))).toVar();
    const shade = at(u.SH, q).toVar();
    const ink = at(u.C, q).toVar();
    const base = mix(L.paper, ink.rgb, ink.a).toVar();
    const V = normalize(cameraPosition.sub(positionWorld)).toVar();
    // ink sunk into the fibers shows deeper at grazing angles
    const graze = clamp(V.z, 0, 1).oneMinus();
    base.mulAssign(float(1).sub(graze.mul(0.35).mul(ink.a).mul(hf.b.div(24))));
    return lit(base, n, sf.a, shade, wet, V, L, () => at(u.B, q).r);
  })();
  return m;
}

// The flat paper (a sheet's base where no chunk is, the page under the sheets):
// its grain's normal, nothing in the way. Per object: { detailScale: Vector2
// (the grain's repeats across it), cellPx (page px a grain cell) }.
export function flatMaterial(L, K, c = null) {
  const each = valueOf(c);
  const m = new MeshBasicNodeMaterial();
  const G = texture(K.generic);
  const detailScale = each(uniform(new THREE.Vector2(1, 1)), (c) => c.detailScale);
  const cellPx = each(uniform(1), (c) => c.cellPx);
  const d = 3 / 256; // three cells of the grain
  const g = (q) => at(G, q).r.mul(DETAIL_PX);
  m.colorNode = Fn(() => {
    const q = uv().mul(detailScale).toVar();
    const gx = g(q.add(vec2(d, 0))).sub(g(q.sub(vec2(d, 0))));
    const gy = g(q.add(vec2(0, d))).sub(g(q.sub(vec2(0, d))));
    const n = normalize(vec3(gx.negate().div(cellPx.mul(6)), gy.negate().div(cellPx.mul(6)), 1)).toVar();
    const V = normalize(cameraPosition.sub(positionWorld));
    return lit(L.paper, n, float(1), vec3(1), float(0), V, L, null);
  })();
  return m;
}

// The light on a point of paper: the sun and the candles, each through its shade,
// the sky's share by how open it is; a wet bead glossy; the moments' bands.
function lit(base, n, open, shade, wet, V, L, band) {
  const Ls = normalize(L.sunDir).toVar();
  const sun = max(dot(n, Ls), 0).mul(shade.x).mul(L.sunInt);
  // lit paper is its own colour; shade and shadow only take light away
  const col = base.mul(L.ambient.mul(open).add(L.ambient.oneMinus().mul(sun).mul(L.sunColor))).toVar();
  const spec = float(0).toVar();
  If(wet.greaterThan(0.5), () => {
    spec.addAssign(pow(max(dot(n, normalize(Ls.add(V))), 0), 70).mul(L.sunInt));
  });
  // two candles, one each side: warm, soft falloff, each its own shadow
  L.candleAt.forEach((pos, i) => {
    const toC = pos.sub(positionWorld).toVar();
    const dist = length(toC);
    const Lc = toC.div(dist).toVar();
    const att = (i === 0 ? L.candleInt.x : L.candleInt.y).div(float(1).add(pow(dist.div(900), 2).mul(2))).toVar();
    col.addAssign(base.mul(L.candleColor).mul(max(dot(n, Lc), 0)).mul(att).mul(i === 0 ? shade.y : shade.z).mul(L.ambient.oneMinus()));
    If(wet.greaterThan(0.5), () => {
      spec.addAssign(pow(max(dot(n, normalize(Lc.add(V))), 0), 60).mul(att));
    });
  });
  // a wet bead: glossy, a little translucent
  col.assign(mix(col, col.mul(1.05).add(0.02), wet.mul(0.35)).add(spec.mul(0.55)));
  // show the moments: faint tree rings of when each cell's ink went down
  if (band) {
    If(L.bandOn.greaterThan(0.5).and(band().greaterThan(0.5)), () => {
      col.mulAssign(0.86);
    });
  }
  return col;
}

// The paper's cut edges: its layers, lit.
export function slabMaterial(L) {
  const m = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const layer = float(0.94).add(float(0.06).mul(step(0.5, fract(positionWorld.z.mul(1.4)))));
    return L.paper.mul(layer).mul(L.ambient.add(L.ambient.oneMinus().mul(0.55).mul(L.sunInt).mul(L.sunColor)));
  })();
  return m;
}
