// A being on a paper (rooms.md §4, Tests: Gravity): at a bead's size the paper's own
// heights are its ground; walking into a dent it goes down into the canyon and stays
// on the surface it is on; and a paper lying anywhere is ground where it lies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { groundOf } from './ground.js';
import { roomGeometry, ROOM, PX_PER_M } from './light/index.js';
import { walk, EYE } from './light/roomCamera.js';
import { originOf } from './light.js';

test('a bead-sized being walks into a dent in the page and down into its canyon, on the surface it is on', () => {
  const geom = roomGeometry(ROOM);
  const page = [1000, 1400];
  const origin = originOf(...page, geom);
  // one sheet: 40 × 40 cells at page px (500, 700), half a px a cell; a dent 600 drops deep in its middle
  const n = 40;
  const surface = new Int16Array(n * n),
    above = new Uint16Array(n * n);
  for (let j = 15; j < 25; j++) for (let i = 15; i < 25; i++) surface[j * n + i] = -600;
  const sheet = { box: [0, 0, n, n], origin: [500, 700], cellPx: 0.5, size: [n * 0.5, n * 0.5], field: { box: [0, 0, n, n], surface, above } };
  const ground = groundOf([sheet], { origin, pxPerM: PX_PER_M, dropPx: 0.004, relief: 1 }); // (true scale: 600 drops is a dent 0.37 mm deep, within the paper)
  const at = (px, py) => [origin[0] + px / PX_PER_M, origin[1] - py / PX_PER_M];
  const dentDepth = (600 * 0.004) / PX_PER_M;
  assert.ok(Math.abs(ground(...at(510, 710)) - (origin[2] - dentDepth)) < 1e-9, 'the dent, as deep as it is drawn');
  assert.equal(ground(...at(502, 702)), origin[2], 'the paper beside it');
  assert.equal(ground(...at(400, 702)), null, 'off it: no paper');
  // a being a ten-thousandth of a person, on the paper beside the dent, walking toward it (yaw 90: +x)
  const size = 1e-4;
  const [x0, y0] = at(503, 710);
  let pose = { mode: 'walk', pos: [x0, y0, geom.pageOrigin[2] + EYE * size], yaw: 90, pitch: 0, size, vz: 0 };
  const feet = () => pose.pos[2] - EYE * size;
  for (let i = 0; i < 400; i++) pose = walk(geom, pose, { forward: 1 }, 0.02, { ground });
  const inDent = (pose.pos[0] - origin[0]) * PX_PER_M;
  assert.ok(inDent > 507.5, `it walked on into the dent (at ${inDent.toFixed(2)} px)`);
  assert.ok(Math.abs(feet() - (geom.pageOrigin[2] - dentDepth)) < 1e-9, `its feet on the floor of the dent: ${feet() - geom.pageOrigin[2]} vs ${-dentDepth}, x ${inDent}`);
  // and standing still it stays there (nothing falls through)
  for (let i = 0; i < 50; i++) pose = walk(geom, pose, {}, 0.02, { ground });
  assert.ok(Math.abs(feet() - (geom.pageOrigin[2] - dentDepth)) < 1e-9);
});

test('a paper lying on the floor is ground there: a small being walks onto it, and stands on its top', () => {
  const geom = roomGeometry(ROOM);
  const origin = originOf(1000, 1400, geom);
  const lift = -origin[2] * PX_PER_M + 3; // (its top 3 page px over the floor: a paper lying there, law/paper.js)
  const sheet = { box: [0, 0, 100, 100], origin: [-3000, 5000], cellPx: 1, size: [100, 100], lift };
  const ground = groundOf([sheet], { origin, pxPerM: PX_PER_M, dropPx: 0.004 });
  const at = (px, py) => [origin[0] + px / PX_PER_M, origin[1] - py / PX_PER_M];
  const top = 3 / PX_PER_M;
  assert.ok(Math.abs(ground(...at(-2950, 5050)) - top) < 1e-12, 'its top, over the floor');
  // a being a thousandth of a person on the floor beside it, walking onto it (yaw 90: +x)
  const size = 1e-3;
  const [x0, y0] = at(-3010, 5050);
  let pose = { mode: 'walk', pos: [x0, y0, EYE * size], yaw: 90, pitch: 0, size, vz: 0 };
  for (let i = 0; i < 400; i++) pose = walk(geom, pose, { forward: 1 }, 0.02, { ground });
  const on = (pose.pos[0] - origin[0]) * PX_PER_M;
  assert.ok(on > -3000, `it walked onto the paper (at ${on.toFixed(1)} px)`);
  assert.ok(Math.abs(pose.pos[2] - EYE * size - top) < 1e-9, 'standing on its top');
});
