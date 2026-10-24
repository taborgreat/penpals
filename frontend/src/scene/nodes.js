// The scene's materials where WebGPU draws (three's WebGPURenderer, TSL): the
// same shading as engine.js's GLSL, step for step. Loaded only on devices
// with WebGPU, so the WebGL2 path carries none of it.
//
// Textures are sampled at level 0 throughout: WGSL allows that anywhere (the
// shadow march samples inside loops and branches), and these have no mipmaps.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { Fn, If, Loop, Discard, select, uniform, texture, uv, positionLocal, positionWorld, cameraPosition, vec2, vec3, float, mix, clamp, normalize, dot, max, pow, length, mod, floor, fract, step } from 'three/tsl';

export { WebGPURenderer, ClippingGroup } from 'three/webgpu';

// The lights as uniforms: the fields engine.js's setLight writes, as nodes.
export function lightUniforms(paper) {
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
  };
  L.candleAt = L.candlePos.value.map((v) => uniform(v));
  return L;
}

// A chunk of a sheet (or a sheet's base, or the page under the sheets): see
// engine.js's VERT and FRAG. `c`: { heightTex, colorTex, detailTex?, bandTex?, valid? }.
export function chunkMaterial(c, cellPx, L, { APRON, CHUNK, TEXN, DROP_PX, generic, zero }) {
  const m = new MeshBasicNodeMaterial();
  const u = {
    realDetail: uniform(c.realDetail ? 1 : 0), // (the texture is there from the start; the real detail once set)
    detailScale: uniform(new THREE.Vector2(CHUNK / 256, CHUNK / 256)),
    cellPx: uniform(cellPx),
    valid: uniform(c.valid ?? new THREE.Vector4(0, 0, 1, 1)),
  };
  m.uniforms = u; // engine.js sets these by name, as on its ShaderMaterials
  const H = texture(c.heightTex);
  const C = texture(c.colorTex);
  const D = texture(c.detailTex ?? generic);
  const G = texture(generic);
  const B = texture(c.bandTex ?? zero);
  const at = (t, q) => t.sample(q).level(0);
  const core = vec2(uv().x, uv().y.oneMinus());
  const toTex = (k) => k.mul(CHUNK).add(APRON).div(TEXN);
  const texel = 1 / TEXN;

  m.positionNode = Fn(() => vec3(positionLocal.x, positionLocal.y, at(H, toTex(core)).r.mul(DROP_PX)))();

  const hAt = (q) => {
    const d = select(u.realDetail.greaterThan(0.5), at(D, q).r, at(G, q.mul(u.detailScale).mul(TEXN / CHUNK)).r);
    return at(H, q).r.mul(DROP_PX).add(d.mul(0.35));
  };
  // march across the height field toward the light: occluded where the field rises above the ray
  const shadowTo = (q0, h0, Ld) => {
    const lit = float(1).toVar();
    const across = length(Ld.xy);
    If(across.lessThan(1e-4).or(Ld.z.lessThanEqual(0)), () => {
      lit.assign(select(Ld.z.greaterThan(0), float(1), float(0)));
    }).Else(() => {
      const stepUv = vec2(Ld.x, Ld.y.negate()).div(across).mul(texel * 1.5);
      const rise = Ld.z.div(across).mul(u.cellPx).mul(1.5);
      const h = h0.add(0.02).toVar();
      Loop({ start: 1, end: 29 }, ({ i }) => {
        const q = clamp(q0.add(stepUv.mul(float(i))), vec2(0), vec2(1));
        h.addAssign(rise);
        const over = hAt(q).sub(h).toVar();
        If(over.greaterThan(0), () => {
          lit.subAssign(clamp(over.mul(0.9), 0, 0.35));
        });
      });
      lit.assign(clamp(lit, 0.25, 1));
    });
    return lit;
  };

  m.colorNode = Fn(() => {
    Discard(core.x.lessThan(u.valid.x).or(core.y.lessThan(u.valid.y)).or(core.x.greaterThan(u.valid.z)).or(core.y.greaterThan(u.valid.w))); // past the sheet's edge
    const q = toTex(core).toVar();
    const hf = at(H, q).toVar();
    Discard(mod(hf.a, 2).greaterThanEqual(1)); // torn: the page behind shows through
    const wet = mod(floor(hf.a.div(2)), 2).toVar();
    const h0 = hAt(q).toVar();
    const dx = hAt(q.add(vec2(3 * texel, 0))).sub(hAt(q.sub(vec2(3 * texel, 0))));
    const dy = hAt(q.add(vec2(0, 3 * texel))).sub(hAt(q.sub(vec2(0, 3 * texel))));
    // the height field's normal, in world space (page y runs down, world y up), over a few cells
    const n = normalize(vec3(dx.negate().div(u.cellPx.mul(6)), dy.div(u.cellPx.mul(6)), 1)).toVar();
    const ink = at(C, q).toVar();
    const base = mix(L.paper, ink.rgb, ink.a).toVar();
    const V = normalize(cameraPosition.sub(positionWorld)).toVar();
    // ink sunk into the fibers shows deeper at grazing angles
    const graze = clamp(V.z, 0, 1).oneMinus();
    base.mulAssign(float(1).sub(graze.mul(0.35).mul(ink.a).mul(hf.b.div(24))));
    // the sun and its shadow: lit paper is its own colour; shade and shadow only take light away
    const Ls = normalize(L.sunDir).toVar();
    const sun = max(dot(n, Ls), 0).mul(shadowTo(q, h0, Ls)).mul(L.sunInt);
    const col = base.mul(L.ambient.add(L.ambient.oneMinus().mul(sun).mul(L.sunColor))).toVar();
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
      const sh = float(1).toVar();
      If(att.greaterThan(0.002), () => {
        sh.assign(shadowTo(q, h0, Lc));
      });
      col.addAssign(base.mul(L.candleColor).mul(max(dot(n, Lc), 0)).mul(att).mul(sh).mul(L.ambient.oneMinus()));
      If(wet.greaterThan(0.5), () => {
        spec.addAssign(pow(max(dot(n, normalize(Lc.add(V))), 0), 60).mul(att));
      });
    });
    // a wet bead: glossy, a little translucent
    col.assign(mix(col, col.mul(1.05).add(0.02), wet.mul(0.35)).add(spec.mul(0.55)));
    // show the moments: faint tree rings of when each cell's ink went down
    If(L.bandOn.greaterThan(0.5).and(at(B, q).r.greaterThan(0.5)), () => {
      col.mulAssign(0.86);
    });
    return col;
  })();
  return m;
}

// The paper's cut edges (engine.js's SIDE_FRAG): its layers, lit.
export function slabMaterial(L) {
  const m = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const layer = float(0.94).add(float(0.06).mul(step(0.5, fract(positionWorld.z.mul(1.4)))));
    return L.paper.mul(layer).mul(L.ambient.add(L.ambient.oneMinus().mul(0.55).mul(L.sunInt).mul(L.sunColor)));
  })();
  return m;
}
