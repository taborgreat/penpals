// The outside as this house's scene has it (outside.md Phase 4): the shared space grown from the
// world's seed (law/outside.js), read in the room's frame: the house stands on its plot (law/world.js),
// its floor on the ground's height at the plot's middle. Nothing loads with the door and the shutters
// shut (a closed door or window is a wall: nothing outside reaches any sense); open, only what is seen
// through the opening: beyond its wall, as far as the eye reaches (SIGHT); outside, all around.
//   frameOf(geom, plot) → { toWorld([x, y, z]), toRoom([X, Y, Z]), floor }
//   loadedFrom(opens, inside) → which ways the outside is seen: { door, window, around } | null
//   outsideNear(geom, plot, { opens, at, houses, day, facts }) → { ground, water, clay, stones, sticks, trees, marks,
//     galls, hives, nests, feathers, life, houses } | null
//     life (outside.md Part 4, law/life.js): each seen oak's beings, as numbers ([{ tree, L }]: drawn frame by frame,
//     beingsAt); galls (only where a gall bug laid): [{ tree, tip, laid, at, r }]; hives: [{ tree, at, r }] (its comb, as
//     big as its wax); nests: [{ tree, at, r, eggs: [{ at, r }] }]; feathers: [{ id, at, length, az }] (fallen, or set down);
//     dead: [{ at, r, matter }] (lying where they fell, at the instant `ms`)
//     mailboxes: [{ key, at, letters }] (one-world.md: one by each house's door, its own and the others'; letters:
//     how many wait in it, `letters` Map(key → n): its flag up)
//     water: [{ at, level }] (a ground cell's middle, its pond's surface, room m); clay: [{ at }] (Phase 6)
//     facts: what hands have done out there (law/hands.js state): stones taken or set down elsewhere,
//     branches broken off (gone from their trees, with all that grew from them), sticks lying where
//     they were put (laid down flat, thinned where they were carved), marks cut into trees
//     ground: { x0, y0, step, nx, ny, z: Float32Array } (room m); stones: [{ at, r }]; trees: [{ id, limbs,
//     leaves }] (room m: law/tree.js limbsOf); houses: [{ at, size }] (the others' houses, room m)
//   groundOf(geom, plot) → (x, y) → z (room m: the ground under a being outside, from the floor)
import { outside as O, world as WORLD, hands as H, life as LIFE } from 'penpals-law';
import { MATTER, BEINGS } from 'penpals-law/matter';
import { limbsOf } from 'penpals-law/tree';

export const SIGHT = 40; // m the outside is grown out to around what sees it (Tabor's to set)
export const GROUND_STEP = 1; // m between the ground's drawn heights (a drawing's grain)
// A house's mailbox (one-world.md): where it stands from the house's corner (m: beside its door, a step out
// from the wall the door is in), how big its box is and how high on its post. Tabor's to set.
export const MAILBOX = Object.freeze({ at: [2, -1.2], box: [0.25, 0.4, 0.25], post: 1.0 });

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

export function outsideNear(geom, plot, { opens, at = null, houses = [], day, ms = (day - 719528) * 86400000, facts = null, letters = null }) {
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
  // the ground's matter in each of its cells (law/outside.js): water standing level, clay at its edge
  const water = [],
    clay = [];
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const c = [gx0 + (i + 0.5) * GROUND_STEP, gy0 + (j + 0.5) * GROUND_STEP];
      const [wx, wy] = F.toWorld(c);
      const m = O.matterAt(wx, wy);
      if (m === 'water') water.push({ at: c, level: O.groundAt(wx, wy) + O.waterAt(wx, wy) - F.floor });
      else if (m === 'clay') clay.push({ at: [...c, O.groundAt(wx, wy) - F.floor] });
    }
  const things = facts?.things ?? new Map();
  const mm = (p) => F.toRoom(p.map((v) => v / 1000)); // (the facts' places: world mm)
  const near = (p) => Math.hypot(p[0] - centre[0], p[1] - centre[1]) <= SIGHT;
  // the stones: where the seed laid them, unless a hand has them or set them down elsewhere
  const stones = got.stones.filter((s) => !things.has(s.id)).map((s) => ({ id: s.id, at: F.toRoom(s.at), r: s.r, matter: s.matter }));
  for (const [id, t] of things) {
    if (!id.startsWith('stone:') || !t.at) continue;
    const s = H.stoneOf(id);
    if (s && near(mm(t.at))) stones.push({ id, at: mm(t.at), r: s.r, matter: s.matter });
  }
  // the sticks: a broken branch and all that grew from it, as the tree had grown it, laid down flat
  // where it was put (its foot there, along +x), each limb thinned where it was carved
  const sticks = [];
  for (const [id, t] of things) {
    const st = H.stickOf(id);
    if (!st || !t.at || !near(mm(t.at))) continue;
    const tree = H.treeOf(st.tree);
    const b = (facts.broken.get(st.tree) ?? []).find((x) => x.branch === st.branch);
    if (!tree || !b) continue;
    const br = H.branchOf(tree, st.branch, b.day);
    const { limbs } = limbsOf(O.treeNow(tree, b.day));
    const own = limbs.filter((l) => br.branches.has(l.branch));
    const along = (p) => Math.hypot(...p.map((v, k) => v - br.foot[k])); // m from its foot
    const far = own.reduce((f, l) => (along(l.to) > along(f) ? l.to : f), br.foot);
    const ax = far.map((v, k) => v - br.foot[k]);
    const len = Math.hypot(...ax) || 1;
    const u = ax.map((v) => v / len);
    // a turn taking its reach onto +x, lying flat: each point by its distance along it and its offset across
    const lay = (p) => {
      const d = p.map((v, k) => v - br.foot[k]);
      const a = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
      const off = d.map((v, k) => v - a * u[k]);
      return [mm(t.at)[0] + a, mm(t.at)[1] + off[0] + off[1], mm(t.at)[2] + Math.max(0, off[2]) + 0.02];
    };
    sticks.push({
      id,
      at: mm(t.at),
      limbs: own.map((l) => ({ ...l, from: lay(l.from), to: lay(l.to), r: Math.max(l.r * 0.2, l.r - H.thinnedAt(facts, id, Math.round(along(l.from) * 1000)) / 1e6) })),
    });
  }
  // what is gone from each tree: the branches broken off it, and what grew from them
  const gone = (tree) => {
    const out = new Set();
    for (const b of facts?.broken.get(tree.id) ?? []) for (const x of H.branchOf(tree, b.branch, b.day)?.branches ?? []) out.add(x);
    return out;
  };
  const marks = [];
  const galls = [],
    hives = [],
    nests = [],
    feathers = [],
    dead = [],
    life = [];
  const GALL_R = Math.cbrt((3 * BEINGS.gallbug.gall * 1e-6) / (4 * Math.PI));
  const EGG_R = ballOf(BEINGS.bird.egg, 'chalk');
  const QUILL = BEINGS.bird.span / 2; // (a quill: half its wing)
  const feather = (id, at) => ({ id, at, length: QUILL, az: (([...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0, 0x811c9dc5) % 360) * Math.PI) / 180 });
  // the feathers hands took up and set down elsewhere
  for (const [id, t] of things) if (id.startsWith('feather:') && t.at && near(mm(t.at))) feathers.push(feather(id, mm(t.at)));
  // what hands made (law/making.js), lying where it was set down: its kind, its matter, its place
  const made = [];
  for (const [id, t] of things) {
    const m = facts?.made?.get(id);
    if (!m || !t.at || !near(mm(t.at))) continue;
    made.push({ id, kind: m.kind, matter: m.matter, at: mm(t.at), holding: m.holding ?? null });
  }
  return {
    ways,
    ground: { x0: gx0, y0: gy0, step: GROUND_STEP, nx: n, ny: n, z },
    water: water.filter((w) => seen(w.at)),
    clay: clay.filter((c) => seen(c.at)),
    stones: stones.filter((s) => seen(s.at)),
    sticks: sticks.filter((s) => seen(s.at)),
    trees: got.trees
      .map((t) => ({ t, at: F.toRoom(t.at) }))
      .filter(({ at: p }) => seen(p))
      .map(({ t, at: p }) => {
        // what lives in it (law/life.js: replayed to today, as the hands left it; before its shape today,
        // so the oak grows on through its seasons in order)
        const L = LIFE.lifeOf(t, day, facts);
        life.push({ tree: t, L });
        for (const g of L.galls.values()) galls.push({ tree: t.id, tip: g.tip, laid: g.laid, at: F.toRoom(g.at), r: GALL_R });
        const { hive, nest } = LIFE.nestsOf(t, day, facts);
        if (hive && hive.wax > 0) hives.push({ tree: t.id, at: F.toRoom(hive.at), r: ballOf(hive.wax, 'wax') });
        if (nest && nest.grass > 0) {
          const r = ballOf(nest.grass, 'grass'),
            at = F.toRoom(nest.at);
          nests.push({ tree: t.id, at, r, eggs: nest.eggs.map((e, k) => ({ at: [at[0] + r * 0.4 * Math.cos(k * 2.4), at[1] + r * 0.4 * Math.sin(k * 2.4), at[2] + r * 0.3], r: EGG_R })) });
        }
        for (const f of L.feathers) if (!things.has(f.id)) feathers.push(feather(f.id, F.toRoom(f.at)));
        for (const x of LIFE.lyingAt(t, L, ms)) dead.push({ at: F.toRoom(x.at), r: LIFE.bodyOf(x.kind).r, matter: BEINGS[x.kind].of.cover ?? BEINGS[x.kind].of.body });
        const { limbs, leaves } = limbsOf(O.treeNow(t, day));
        const lift = ([x, y, zz]) => [x - t.at[0] + p[0], y - t.at[1] + p[1], zz + p[2]];
        const off = gone(t);
        // the marks cut into it: a dark band on its trunk, its side and its height
        const foot = limbs.find((l) => l.branch === 0);
        for (const m of facts?.marks.get(t.id) ?? []) {
          const a = (m.az * Math.PI) / 180;
          const r = foot ? foot.r : 0.05;
          marks.push({ at: [p[0] + Math.sin(a) * r, p[1] + Math.cos(a) * r, p[2] + (m.from + m.to) / 2000], size: [Math.max(0.005, (m.to - m.from) / 1000), m.depth / 1e6 + 0.002] });
        }
        return {
          id: t.id,
          tree: t,
          at: p,
          limbs: limbs.filter((l) => !off.has(l.branch)).map((l) => ({ ...l, from: lift(l.from), to: lift(l.to) })),
          leaves: leaves.filter((l) => !off.has(l.branch)).map((l) => ({ ...l, at: lift(l.at) })),
        };
      }),
    marks,
    made: made.filter((m) => seen(m.at)),
    galls: galls.filter((g) => seen(g.at)),
    hives: hives.filter((h) => seen(h.at)),
    nests: nests.filter((n) => seen(n.at)),
    feathers: feathers.filter((f) => seen(f.at)),
    dead: dead.filter((x) => seen(x.at)),
    life,
    houses: others.map((h) => ({ key: h.key, at: F.toRoom([...WORLD.centreOf(h.plot), O.groundAt(...WORLD.centreOf(h.plot))]), size: geom.size })).filter((h) => seen(h.at)),
    // a mailbox by each house's door (its own, and the others': each house's corner the same way from its middle)
    mailboxes: [...houses]
      .map((h) => {
        const c = F.toRoom([...WORLD.centreOf(h.plot), 0]);
        const p = [c[0] - geom.size[0] / 2 + MAILBOX.at[0], c[1] - geom.size[1] / 2 + MAILBOX.at[1]];
        const [wx, wy] = F.toWorld(p);
        return { key: h.key, at: [p[0], p[1], O.groundAt(wx, wy) - F.floor], letters: letters?.get(h.key) ?? 0 };
      })
      .filter((m) => seen(m.at) && Math.hypot(m.at[0] - centre[0], m.at[1] - centre[1]) <= SIGHT),
  };
}

export const inBox = (geom, [x, y]) => x >= 0 && y >= 0 && x <= geom.size[0] && y <= geom.size[1];
// whether a place (room m) is seen the ways the outside is (beyond the door's wall, the window's, all around)
export const seenFrom = (geom, ways, p) => !!ways && (ways.around || (ways.door && p[1] < 0) || (ways.window && p[1] > geom.size[1]));
// a ball of `grams` of a matter: its radius (m)
export const ballOf = (grams, matter) => Math.cbrt((3 * grams) / 1000 / MATTER[matter].density / (4 * Math.PI));

// The ground under a being outside (room m, from the floor).
export function groundOf(geom, plot) {
  const F = frameOf(geom, plot);
  return (x, y) => O.groundAt(...F.toWorld([x, y]).slice(0, 2)) - F.floor;
}
