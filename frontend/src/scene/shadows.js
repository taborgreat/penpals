// What stands between a point and each source (matter-fixes §4). A point is lit by
// a source only if no matter lies on the line between them. The room's things that
// block light (the legs, the window's frame, the holders, the candles' wax, the pen,
// the beings, the shelf and its books) are drawn from each source into a depth map:
// a cube around each flame, and the sun's along its beams (an orthographic view over
// the whole room). Each texel holds how far (m) the nearest thing is from the source
// (for the sun, from its camera's plane), 0 where nothing is. The materials ask the
// maps (nodes.js lightUniforms, spectral): light reaches a point only where nothing
// nearer was drawn. The table's slab, the sheets lying flat and the page's own relief
// keep their own tests (nodes.js).
//
// Cheap to keep: the maps are drawn from a scene of their own, a stand-in for each
// thing (its geometry, where the thing is now), so a draw walks a few dozen meshes,
// not the page's chunks. A source is drawn from where it stands steadily (a flame's
// flicker moves no shadow: only a move of more than STEADY_M), and a cube's face is
// drawn again only when a thing in its view has moved. The shader tests against the
// same steady places (L.shadow.flameAt, sunAt).

import * as THREE from 'three';

export const CUBE = 512; // texels a side of a flame's cube face (1.2 mm at 30 cm)
export const SUN = 1024; // texels a side of the sun's map (5 mm)
const SUN_R = 2.6; // m: the sun's view reaches this far from the room's middle (past every corner)
const STEADY_M = 0.003; // a flame moved less than this draws no new shadows
const STEADY_SUN = Math.cos((0.2 * Math.PI) / 180); // nor the sun, turned less than 0.2°

export function createShadows(gpu) {
  const opts = { type: THREE.HalfFloatType, format: THREE.RedFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false, depthBuffer: true };
  const scene = new THREE.Scene(); // the stand-ins
  const flames = [0, 1].map(() => {
    const rt = new gpu.CubeRenderTarget(CUBE, opts);
    const cam = new THREE.CubeCamera(5, 1e5, rt); // (world px)
    return { rt, cam, at: null, faces: Array(6).fill('') };
  });
  const sun = { rt: new THREE.RenderTarget(SUN, SUN, opts), cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), dir: null, key: '' };
  const things = new Map(); // mesh → its stand-in
  const frustum = new THREE.Frustum();
  const m4 = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  let mats = null;
  let L = null;
  let made = false;
  const shown = (o) => {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  };
  // each stand-in where its thing is now; ver counts its moves (of half a world px or more
  // since it was last drawn: a candle burning down a hair a frame draws nothing new)
  let ver = 0;
  const MOVE_PX = 0.5;
  const moved = (a, b) => a.elements.some((v, i) => Math.abs(v - b.elements[i]) > MOVE_PX);
  function follow() {
    for (const [mesh, s] of things) {
      mesh.updateWorldMatrix(true, false);
      const on = shown(mesh);
      if (on !== s.visible || (on && moved(s.matrix, mesh.matrixWorld))) {
        s.matrix.copy(mesh.matrixWorld);
        s.matrixWorld.copy(mesh.matrixWorld);
        s.visible = on;
        s.userData.ver = ++ver;
      }
    }
  }
  // what a camera sees of the stand-ins, and their moves: as a key
  function seen(cam, system) {
    m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(m4, system);
    let key = '';
    for (const s of things.values()) {
      if (!s.visible) continue;
      if (!s.geometry.boundingSphere) s.geometry.computeBoundingSphere();
      sphere.copy(s.geometry.boundingSphere).applyMatrix4(s.matrixWorld);
      if (frustum.intersectsSphere(sphere)) key += `${s.id}:${s.userData.ver},`;
    }
    return key;
  }
  return {
    maps: { sun: sun.rt.texture, sunSize: SUN, flames: flames.map((f) => f.rt.texture), cube: CUBE },
    // the light's uniforms (nodes.js lightUniforms, made with these maps)
    use(lights) {
      L = lights;
      mats = { flame: gpu.distanceMaterial(lights), sun: gpu.distanceMaterial(lights, true) };
    },
    // a thing that blocks light; and one gone
    add(mesh) {
      const s = new THREE.Mesh(mesh.geometry, mats.flame);
      s.matrixAutoUpdate = false;
      s.matrixWorldAutoUpdate = false;
      s.userData.ver = ++ver;
      things.set(mesh, s);
      scene.add(s);
    },
    remove(mesh) {
      const s = things.get(mesh);
      if (!s) return;
      scene.remove(s);
      things.delete(mesh);
    },
    // Draw what has moved. src: { flames: [{ at (Vector3, world px), lit }], sun: { dir
    // (Vector3, toward the sun), lit }, mid (Vector3: the room's middle, world px), pxPerM }.
    update(renderer, src) {
      if (!src || !L) return;
      follow();
      const system = renderer.coordinateSystem;
      const target = renderer.getRenderTarget();
      let drew = false;
      const begin = () => {
        if (drew) return;
        drew = true;
        renderer.setClearColor(0x000000, 0);
      };
      // every map made once, empty (one never drawn into would be set up again each frame it is read)
      if (!made) {
        made = true;
        begin();
        for (const f of flames)
          for (let i = 0; i < 6; i++) {
            renderer.setRenderTarget(f.rt, i);
            renderer.clear();
          }
        renderer.setRenderTarget(sun.rt);
        renderer.clear();
      }
      src.flames.forEach((f, k) => {
        const F = flames[k];
        if (!f.lit) {
          F.at = null;
          return;
        }
        // a steady place: the flicker draws nothing new
        if (!F.at || F.at.distanceTo(f.at) > STEADY_M * src.pxPerM) {
          F.at = f.at.clone();
          F.faces.fill('');
        }
        const cam = F.cam;
        if (cam.coordinateSystem !== system) {
          cam.coordinateSystem = system;
          cam.updateCoordinateSystem();
          for (const face of cam.children) {
            face.coordinateSystem = system;
            face.updateProjectionMatrix();
          }
          F.faces.fill('');
        }
        cam.position.copy(F.at);
        cam.updateMatrixWorld(true);
        scene.overrideMaterial = mats.flame;
        cam.children.forEach((face, i) => {
          const key = seen(face, system);
          if (key === F.faces[i]) return;
          F.faces[i] = key;
          begin();
          mats.flame.at.copy(F.at);
          renderer.setRenderTarget(F.rt, i);
          renderer.render(scene, face);
        });
        L.shadow.flameAt[k].value.copy(F.at);
      });
      if (src.sun.lit) {
        const dir = src.sun.dir.clone().normalize();
        if (!sun.dir || sun.dir.dot(dir) < STEADY_SUN) {
          sun.dir = dir;
          sun.key = '';
        }
        const R = SUN_R * src.pxPerM;
        const cam = sun.cam;
        cam.position.copy(src.mid).addScaledVector(sun.dir, R);
        cam.up.set(0, 0, 1);
        if (Math.abs(sun.dir.z) > 0.99) cam.up.set(0, 1, 0);
        cam.lookAt(src.mid);
        Object.assign(cam, { left: -R, right: R, top: R, bottom: -R, near: 0, far: 2 * R });
        if (cam.coordinateSystem !== system) cam.coordinateSystem = system;
        cam.updateProjectionMatrix();
        cam.updateMatrixWorld(true);
        const key = seen(cam, system) + cam.position.toArray().join();
        if (key !== sun.key) {
          sun.key = key;
          begin();
          mats.sun.at.copy(cam.position);
          mats.sun.dir.copy(sun.dir);
          scene.overrideMaterial = mats.sun;
          renderer.setRenderTarget(sun.rt);
          renderer.render(scene, cam);
          L.shadow.sunVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
          L.shadow.sunAt.value.copy(cam.position);
          L.shadow.sunDir.value.copy(sun.dir);
        }
      } else sun.dir = null;
      if (drew) renderer.setRenderTarget(target);
      L.shadow.on.value.set(src.sun.lit && sun.dir ? 1 : 0, flames[0].at ? 1 : 0, flames[1].at ? 1 : 0);
    },
    dispose() {
      for (const f of flames) f.rt.dispose();
      sun.rt.dispose();
      if (mats) for (const m of Object.values(mats)) m.dispose();
      things.clear();
    },
  };
}
