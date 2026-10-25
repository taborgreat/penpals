// The outside as this house's scene has it (outside.md Phase 4): the shared space grown from the
// world's seed (law/outside.js), read in the room's frame: the house stands on its plot (law/world.js),
// its floor on the ground's height at the plot's middle. Nothing loads with the door and the shutters
// shut (a closed door or window is a wall: nothing outside reaches any sense); open, only what is seen
// through the opening: beyond its wall, as far as the eye reaches (SIGHT); outside, all around.
//   frameOf(geom, plot) → { toWorld([x, y, z]), toRoom([X, Y, Z]), floor }
//   loadedFrom(opens, inside) → which ways the outside is seen: { door, window, around } | null
//   outsideNear(geom, plot, { opens, at, houses, day }) → { ground, stones, trees, houses } | null
//     ground: { x0, y0, step, nx, ny, z: Float32Array } (room m); stones: [{ at, r }]; trees: [{ id, limbs,
//     leaves }] (room m: law/tree.js limbsOf); houses: [{ at, size }] (the others' houses, room m)
//   groundOf(geom, plot) → (x, y) → z (room m: the ground under a being outside, from the floor)
import { outside as O, world as WORLD } from 'penpals-law';
import { limbsOf } from 'penpals-law/tree';

export const SIGHT = 40; // m the outside is grown out to around what sees it (Tabor's to set)
export const GROUND_STEP = 1; // m between the ground's drawn heights (a drawing's grain)

export function frameOf(geom, plot) {
  const [W, D] = geom.size;
  const [cx, cy] = WORLD.centreOf(plot);
  const floor = O.groundAt(cx, cy);
  const x0 = cx - W / 2,
    y0 = cy - D / 2;
  return { floor, toWorld: ([x, y, z = 0]) => [x0 + x, y0 + y, z + floor], toRoom: ([X, Y, Z = floor]) => [X - x0, Y - y0, Z - floor] };
}

// Which ways the outside is seen: through the open door (beyond the wall it is in), through the window
// while its shutters are open (beyond its wall), all around once the being is out.
export function loadedFrom(opens, inside = true) {
  if (!inside) return { around: true };
  const ways = { door: !!opens?.door, window: !!opens?.shutters };
  return ways.door || ways.window ? ways : null;
}

export function outsideNear(geom, plot, { opens, at = null, houses = [], day }) {
  const ways = loadedFrom(opens, !at || inBox(geom, at));
  if (!ways) return null;
  const F = frameOf(geom, plot);
  const [W, D] = geom.size;
  // what each opening sees: beyond its wall (the door's: y < 0; the window's: y > D)
  const seen = (p) => ways.around || (ways.door && p[1] < 0) || (ways.window && p[1] > D);
  const centre = at ?? [W / 2, D / 2, 0];
  const [X, Y] = F.toWorld(centre);
  const others = houses.filter((h) => WORLD.plotKey(h.plot) !== WORLD.plotKey(plot));
  const got = O.near(X, Y, SIGHT, { houses: [...houses, { plot }], day });
  const n = Math.ceil((2 * SIGHT) / GROUND_STEP) + 1;
  const gx0 = Math.floor((centre[0] - SIGHT) / GROUND_STEP) * GROUND_STEP,
    gy0 = Math.floor((centre[1] - SIGHT) / GROUND_STEP) * GROUND_STEP;
  const z = new Float32Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const [wx, wy] = F.toWorld([gx0 + i * GROUND_STEP, gy0 + j * GROUND_STEP]);
      z[j * n + i] = O.groundAt(wx, wy) - F.floor;
    }
  return {
    ways,
    ground: { x0: gx0, y0: gy0, step: GROUND_STEP, nx: n, ny: n, z },
    stones: got.stones.map((s) => ({ id: s.id, at: F.toRoom(s.at), r: s.r })).filter((s) => seen(s.at)),
    trees: got.trees
      .map((t) => ({ t, at: F.toRoom(t.at) }))
      .filter(({ at: p }) => seen(p))
      .map(({ t, at: p }) => {
        const { limbs, leaves } = limbsOf(O.treeNow(t, day));
        const lift = ([x, y, zz]) => [x - t.at[0] + p[0], y - t.at[1] + p[1], zz + p[2]];
        return { id: t.id, at: p, limbs: limbs.map((l) => ({ ...l, from: lift(l.from), to: lift(l.to) })), leaves: leaves.map((l) => ({ ...l, at: lift(l.at) })) };
      }),
    houses: others.map((h) => ({ key: h.key, at: F.toRoom([...WORLD.centreOf(h.plot), O.groundAt(...WORLD.centreOf(h.plot))]), size: geom.size })).filter((h) => seen(h.at)),
  };
}

export const inBox = (geom, [x, y]) => x >= 0 && y >= 0 && x <= geom.size[0] && y <= geom.size[1];

// The ground under a being outside (room m, from the floor).
export function groundOf(geom, plot) {
  const F = frameOf(geom, plot);
  return (x, y) => O.groundAt(...F.toWorld([x, y]).slice(0, 2)) - F.floor;
}
