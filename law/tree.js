// A tree is grown, not modeled (one-matter.md Phase 7): every bit of its wood is laid down as a fact
// when it grows, so a tree cut in half shows its whole history. Its kind is a row of TREES
// (law/matter.js): what it is; what it does is this, under the sun (law/sun.js).
//
//   Sprouting  a seed under dirt wakes on a day its dirt holds enough water and the day is warm
//              enough (its kind's `sprouts`); until then it sleeps.
//   Fuel       its leaves drink the light a level face gets, less what the leaves above them took
//              (leaves facing every way alike, as a sphere's shadow is half its surface, each m² of
//              leaf over a m² of ground lets e^−½ through). Its roots drink the water in the dirt
//              they reach; making wood breathes out water (`thirst`). Short of water it makes only
//              what it can drink for, and what it makes goes to roots first, as short as it was.
//   Upkeep     its leaves and its living skin burn some of what it makes each day; through the
//              winter, from its store. It keeps back a store (its next spring's leaves and a year's
//              upkeep) before it grows. It opens no more m² of leaves than the ground its roots
//              reach (that ground catches the water they breathe out): a leaf past that brings its
//              root with it from the store, as a seed splits itself between a root and its first
//              leaves. Leaves that take less than they cost to keep fall early (a drought's).
//   Wood       is its leaves' water pipes (the pipe model): over a season every m² of its leaves
//              has `pipe` mm² of new wood laid all the way down from it to the ground, so a ring is
//              as wide as the leaves above it, and a far tip costs the wood that carries its water.
//              New wood swells only on days its leaves are out and it has the water: a season cut
//              short or dry lays as much less (a dry year's thin ring). What the season made pays
//              for the pipes first (short of it, they are as much thinner: a shaded year's); then
//              it pushes out the tips, each as
//              its own leaves took light, no more than `grows` a year (the leader holding the
//              others back to as much less while the tree is young: `leader`, halving in `relax`
//              years), leaving a bud every `budEvery`, and no longer than its stem stands before
//              its own weight buckles it (Greenhill: (7.837 E r² / 4ρg)^⅓, its wood's stiffness and
//              density). What is left thickens the pipes the more while it is young (a young
//              tree's wide rings); once it bears (`bears` years), it becomes seed, falling under
//              it in the autumn. The bark is pushed outward and cracks a furrow each time its stretch passes
//              its strength over its stiffness. Only living wood has skin.
//   Seasons    from the sun: buds open when the lengthening days pass `leafOut` hours, and leaves
//              fall when the shortening days pass `leafFall`. Wood made while the days lengthen is
//              early (fast, light); after the longest day, late (dense, `contrast` times). From fall
//              to spring nothing grows: a ring a year.
//   Branches   a bud opens the spring after it was left, and is a branch; a tip whose leaves took
//              less over a season than they cost dies (buds in shade starve), and wood with no
//              living leaf beyond it is dead: a dead branch, buried by later rings (a knot).
//   Autumn     the leaves fall straight down to rest on the ground under their tip, and break down
//              into dirt there (half in the leaf's `rots` days).
//
// Cheap: a day is a few sums; the wood and the tips once a season. Its facts are a shell of wood a
// season (its early and late bands at the trunk's foot, how tall the trunk stood and where its crown
// began) and a start for each branch; a cut is read from those. Everything with + − × ÷ and
// law/dmath.js: the same tree everywhere.

import { MATTER, TREES } from './matter.js';
import { dayOf, yearOf, WORLD } from './sun.js';
import { exp, sin, cos, log } from './dmath.js';

const TAU = 6.283185307179586;
const GOLDEN = TAU * (1 - 2 / (1 + Math.sqrt(5))); // the turn from one bud to the next (phyllotaxis)
const ONE_BY = 0.5; // a m² of leaf over a m² of ground lets e^−½ through (leaves facing every way alike)
const G = 9.81;

const norm = (v) => {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
// a direction leaning `angle` (radians) from `d`, turned `az` round it
function leanFrom(d, angle, az) {
  const u = norm(Math.abs(d[2]) < 0.9 ? cross([0, 0, 1], d) : cross([1, 0, 0], d));
  const v = cross(d, u);
  const ca = cos(angle),
    sa = sin(angle),
    cz = cos(az),
    sz = sin(az);
  return norm([0, 1, 2].map((c) => ca * d[c] + sa * (cz * u[c] + sz * v[c])));
}
const radius = (area) => Math.sqrt(area / Math.PI);

// A seed of `kind` planted on `day` (counted from Jan 1 of year 0) at [x, y] (m), in dirt `depth` m
// deep. tree.grow(until, waters): to day `until`, with `waters` ([{ day, kg }] in day order: the water
// reaching each m² of its ground: rain, a can).
export function createTree({ kind = 'oak', day, at = [0, 0], depth = 0.5 }) {
  const k = TREES[kind];
  if (!k) throw new Error(`no such tree: ${kind}`);
  const wood = MATTER[k.of.wood],
    leafRow = MATTER[k.of.leaf],
    barkRow = MATTER[k.of.bark];
  const pores = 1 - MATTER.dirt.density / MATTER.stone.density; // dirt is stone's grains and the space between
  const capacity = pores * 1000 * depth; // kg of water a m² of its ground holds
  const rho = wood.density * 1000; // g/m³
  const rhoE = (2 * rho) / (1 + k.contrast); // early wood, and late (their mean the row's)
  const rhoL = rhoE * k.contrast;
  const shootArea = Math.PI * k.shoot * k.shoot;
  const shootG = shootArea * rho; // g a metre of new shoot
  const pipe = k.pipe / 1e6; // m² a year a m² of leaves
  const cell = 2 * Math.sqrt(k.leaf / Math.PI); // a tip's leaves' breadth: the columns light falls down
  const crack = barkRow.strength / barkRow.stiffness;
  const stands = (7.837 * wood.stiffness * 1e6) / (4 * wood.density * G);
  const tallest = (r) => exp(log(stands * r * r) / 3);
  const decay = exp(-log(2) / leafRow.rots); // what is left of fallen leaves after a day
  // the days of a year its leaves are out (by the sun)
  let season = 0;
  for (let d = 0, out = false; d < 365; d++) {
    const D = dayOf(d);
    if (!out && D.lengthening && D.minutes >= k.leafOut * 60) out = true;
    else if (out && !D.lengthening && D.minutes <= k.leafFall * 60) break;
    if (out) season++;
  }

  const T = {
    kind,
    day,
    at,
    soil: 0,
    sprouted: null,
    died: null,
    store: k.seed,
    rootMass: 0,
    leafy: false,
    outYear: null,
    tips: [],
    nodes: [], // its wood: a stem from one bud to the next (internodes), each knowing the one below
    branches: [],
    shells: [],
    furrows: 0,
    seeds: 0,
    barkC: 0,
    litter: new Map(), // a ground column → g of fallen leaves
    dirt: 0, // g of leaves become dirt
    lit: 0, // m² of its leaves in full sun's worth
    leaves: 0, // m² of leaves out
    live: 0, // living tips
    skin: 0, // m² of living skin
    season: { light: 0, days: 0, wet: 0, wetEarly: 0, early: 0, late: 0 },
    nextTip: 0,
  };
  let w = 0;
  const reach = () => Math.sqrt(T.rootMass / (Math.PI * k.roots));
  const leader = () => T.tips.find((t) => t.alive && t.branch === 0);
  const dominance = (y) => (k.leader / 1000) * (k.relax / (k.relax + (y - yearOf(T.sprouted))));
  const node = (parent, branch, base, y) => {
    T.nodes.push({ id: T.nodes.length, parent, branch, base: base.slice(), len: 0, area: shootArea, born: y, alive: true, beyond: 0 });
    return T.nodes.length - 1;
  };
  const tipAt = (branch, nd, pos, dir) => ({ id: T.nextTip++, branch, node: nd, pos, dir, since: 0, axis: 0, az: 0, share: 0, leaf: 0, alive: true });

  function sums() {
    T.lit = 0;
    T.leaves = 0;
    T.live = 0;
    for (const t of T.tips)
      if (t.alive) {
        T.live++;
        if (t.leaf > 0) {
          T.lit += t.share * t.leaf;
          T.leaves += t.leaf;
        }
      }
  }

  function sprout(d) {
    T.sprouted = d;
    const y = yearOf(d);
    const base = [at[0], at[1], 0];
    T.branches.push({ id: 0, year: y, parent: null, at: base, az: 0, died: null, node: node(-1, 0, base, y) });
    T.tips.push(tipAt(0, 0, base.slice(), [0, 0, 1]));
    // the seed's store: a root reaching as much ground as the leaves the rest of it makes
    T.rootMass = (T.store * k.roots) / (k.roots + k.leafMass);
    T.store -= T.rootMass;
    T.barkC = TAU * k.shoot;
    sums();
  }

  // Spring: buds open, the light each tip will get is reckoned, and leaves are made from the store
  // (the best lit first); a tip the store cannot leaf dies.
  function leafOut() {
    const live = T.tips.filter((t) => t.alive);
    const cols = new Map();
    for (const t of live) {
      const key = `${Math.floor(t.pos[0] / cell)},${Math.floor(t.pos[1] / cell)}`;
      if (!cols.has(key)) cols.set(key, []);
      cols.get(key).push(t);
    }
    for (const list of cols.values()) {
      list.sort((a, b) => b.pos[2] - a.pos[2] || a.id - b.id);
      let above = 0;
      for (const t of list) {
        t.share = exp((-ONE_BY * above) / (cell * cell));
        above += k.leaf;
      }
    }
    live.sort((a, b) => b.share - a.share || a.id - b.id);
    let room = Math.PI * reach() * reach(); // m² of ground its roots reach
    for (const t of live) {
      // within the ground its roots reach a m² of leaf costs its making; past it, its root too
      const inRoom = Math.max(0, Math.min(k.leaf, room, T.store / k.leafMass));
      const past = Math.max(0, Math.min(k.leaf - inRoom, (T.store - inRoom * k.leafMass) / (k.leafMass + k.roots)));
      const leaf = inRoom + past;
      if (leaf <= 0) {
        t.alive = false;
        continue;
      }
      room -= inRoom;
      t.leaf = leaf;
      T.store -= inRoom * k.leafMass + past * (k.leafMass + k.roots);
      T.rootMass += past * k.roots;
    }
    T.leafy = true;
    T.season = { light: 0, days: 0, wet: 0, wetEarly: 0, early: 0, late: 0 };
    sums();
  }

  // Autumn: the season's wood is laid (the pipes first), the tips push out with what is left,
  // leaving buds; a tip whose leaves took less than they cost dies; the leaves fall.
  function leafFall(y) {
    const nodes = T.nodes;
    // the leaves beyond each stem
    for (const n of nodes) n.beyond = 0;
    for (const t of T.tips) if (t.alive && t.leaf > 0) nodes[t.node].beyond += t.leaf;
    for (let i = nodes.length - 1; i > 0; i--) if (nodes[i].parent >= 0) nodes[nodes[i].parent].beyond += nodes[i].beyond;
    // the pipes: as many days as it grew with water, as much as the season made
    const made = T.season.early + T.season.late;
    const wet = T.season.wet / season; // its growing days with water, of a whole season's
    const early = T.season.wet > 0 ? T.season.wetEarly / T.season.wet : 0; // of them, while the days lengthened
    const rhoM = early * rhoE + (1 - early) * rhoL;
    let need = 0; // g, for a whole season's pipes
    for (const n of nodes) if (n.alive && n.beyond > 0) need += pipe * n.beyond * n.len * rhoM;
    let f = need > 0 ? Math.min(wet, made / need) : 0;
    let left = made - f * need;
    // the tips push out with the rest, each as its leaves took light, no more than they grow a year
    // and no farther than their stems stand
    const live = T.tips.filter((t) => t.alive && t.leaf > 0);
    const dom = dominance(y);
    const held = (t) => (t.branch === 0 ? 1 : 1 - dom); // the leader holds the others back
    const weight = (t) => t.share * t.leaf * held(t);
    let W = 0;
    for (const t of live) W += weight(t);
    const push = new Map();
    for (const t of live) {
      const stem = nodes[T.branches[t.branch].node];
      const most = Math.max(0, Math.min(k.grows * held(t), tallest(radius(stem.area)) - (t.branch === 0 ? t.pos[2] : t.axis)));
      const e = Math.min(most, W > 0 ? (left * weight(t)) / W / shootG : 0);
      push.set(t, e);
    }
    for (const e of push.values()) left -= e * shootG;
    // what is left: while young, more wood; once it bears, seed, falling under the leaves (as they do)
    const bearing = y - yearOf(T.sprouted) >= k.bears;
    if (!bearing && need > 0) {
      const more = (left / need) * wet;
      f += more;
      left -= more * need;
    }
    const seeds = Math.floor(left / k.seed);
    T.seeds += seeds;
    let fallen = seeds * k.seed;
    T.store += left - fallen;
    const foot = nodes[0];
    const r0 = radius(foot.area);
    for (const n of nodes) if (n.alive && n.beyond > 0) n.area += f * pipe * n.beyond;
    // the foot's bands, early then late
    const rE = radius(r0 * r0 * Math.PI + f * pipe * foot.beyond * early);
    const rL = radius(foot.area);
    for (const t of live) {
      let e = push.get(t);
      // along its way, a bud every budEvery
      while (t.since + e >= k.budEvery) {
        const step = k.budEvery - t.since;
        for (let c = 0; c < 3; c++) t.pos[c] += t.dir[c] * step;
        nodes[t.node].len += step;
        t.axis += step;
        e -= step;
        t.since = 0;
        t.az += GOLDEN;
        const at = t.node;
        t.node = node(at, t.branch, t.pos, y);
        const id = T.branches.length;
        T.branches.push({ id, year: y + 1, parent: t.branch, at: t.pos.slice(), az: Math.round((t.az * 360000) / TAU) % 360000, died: null, node: node(at, id, t.pos, y + 1) });
        T.tips.push(tipAt(id, T.branches[id].node, t.pos.slice(), leanFrom(t.dir, (k.angle * TAU) / 360, t.az)));
      }
      for (let c = 0; c < 3; c++) t.pos[c] += t.dir[c] * e;
      nodes[t.node].len += e;
      t.axis += e;
      t.since += e;
      // what its leaves took, less what they cost to make and keep
      const took = (t.share * t.leaf * T.season.light * k.yield) / 1e6;
      if (took < t.leaf * (k.leafMass + k.upkeep.leaf * T.season.days)) t.alive = false;
    }
    // the leaves (and the seed, as the leaves are) fall to the ground under their tip
    for (const t of live) {
      const key = `${Math.floor(t.pos[0] / cell)},${Math.floor(t.pos[1] / cell)}`;
      const g = t.leaf * k.leafMass + (T.leaves > 0 ? (fallen * t.leaf) / T.leaves : 0);
      T.litter.set(key, (T.litter.get(key) ?? 0) + g);
      t.leaf = 0;
    }
    T.tips = T.tips.filter((t) => t.alive); // (a dead tip's branch is kept: its start, its death)
    // the living wood: what has a living tip beyond it; the rest is dead, and so its branch
    for (const n of nodes) n.beyond = 0;
    for (const t of T.tips) nodes[t.node].beyond++;
    for (let i = nodes.length - 1; i > 0; i--) if (nodes[i].parent >= 0) nodes[nodes[i].parent].beyond += nodes[i].beyond;
    T.skin = 0;
    for (const n of nodes) {
      if (!n.alive) continue;
      if (n.beyond === 0) {
        n.alive = false;
        const b = T.branches[n.branch];
        if (b.node === n.id && b.died === null) b.died = y;
        continue;
      }
      T.skin += TAU * radius(n.area) * n.len;
    }
    // the bark stretched past its strength cracks
    const C = TAU * radius(foot.area);
    while (C >= T.barkC * (1 + crack)) {
      T.barkC *= 1 + crack;
      T.furrows++;
    }
    // the season's shell: its bands at the trunk's foot, the trunk's height, its crown's foot
    const l = leader();
    let crown = l ? l.pos[2] : 0;
    for (const b of T.branches) if (b.parent === 0 && b.died === null && b.year <= y && b.at[2] < crown) crown = b.at[2];
    T.shells.push({ year: y, early: rE - r0, late: rL - rE, top: l ? l.pos[2] : 0, crown, seeds });
    T.leafy = false;
    sums();
  }

  function day1(d) {
    const D = dayOf(d);
    const y = yearOf(d);
    for (; w < T.waters.length && T.waters[w].day <= d; w++) if (T.waters[w].day === d) T.soil += T.waters[w].kg;
    if (T.soil > capacity) T.soil = capacity; // the rest runs through
    // the leaves on the ground break down into dirt
    for (const [key, g] of T.litter) {
      const left = g * decay;
      T.dirt += g - left;
      T.litter.set(key, left);
    }
    if (T.died !== null) return;
    if (T.sprouted === null) {
      if ((T.soil / capacity) * 1000 >= k.sprouts.water && D.warmth >= k.sprouts.warmth) sprout(d);
      else return;
    }
    if (!T.leafy && T.outYear !== y && D.lengthening && D.minutes >= k.leafOut * 60) {
      T.outYear = y;
      leafOut();
    } else if (T.leafy && !D.lengthening && D.minutes <= k.leafFall * 60) leafFall(y);
    let made = 0,
      scale = 1;
    if (T.leafy) {
      const raw = (T.lit * D.light * k.yield) / 1e6;
      const need = (raw * k.thirst) / 1000; // kg of water
      const area = Math.PI * reach() * reach();
      const have = T.soil * area;
      if (need > have) scale = have / need;
      made = raw * scale;
      if (area > 0) T.soil -= (need * scale) / area;
      T.season.light += D.light * scale;
      T.season.wet += scale;
      if (D.lengthening) T.season.wetEarly += scale;
      T.season.days++;
    }
    const leaves = T.leafy ? T.leaves : 0;
    let net = made - leaves * k.upkeep.leaf - T.skin * k.upkeep.skin;
    // a drought's fall: the leaves take less than they cost to keep
    if (T.leafy && made < leaves * k.upkeep.leaf) leafFall(y);
    if (net <= 0) {
      T.store += net;
      if (T.store < 0) {
        T.died = d; // starved
        for (const t of T.tips) t.alive = false;
        sums();
      }
      return;
    }
    // the store first: next spring's leaves and a year's upkeep
    const leaves1 = Math.min(T.live * k.leaf, Math.PI * reach() * reach());
    const past = Math.max(0, T.live * k.leaf - leaves1);
    const want = k.store * (leaves1 * k.leafMass + past * (k.leafMass + k.roots) + T.skin * k.upkeep.skin * WORLD.year) - T.store;
    if (want > 0) {
      const take = Math.min(net, want);
      T.store += take;
      net -= take;
    }
    // roots toward water: as short as it was, so much of the rest to its roots
    const toRoots = net * (1 - scale);
    T.rootMass += toRoots;
    net -= toRoots;
    if (D.lengthening) T.season.early += net;
    else T.season.late += net;
  }

  T.grow = (until, waters = []) => {
    T.waters = waters;
    w = 0;
    while (w < waters.length && waters[w].day < T.day) w++;
    for (let d = T.day; d <= until; d++) day1(d);
    T.day = until + 1;
    return T;
  };
  return T;
}

// Its facts: a shell of wood a season (and the seed it dropped) and a start a branch (with how thick
// its foot grew), its bark's furrows and the dirt its leaves became. Nothing else is kept; a cut is read from these.
export function factsOf(T) {
  const um = (v) => Math.round(v * 1e6);
  return {
    kind: T.kind,
    sprouted: T.sprouted,
    died: T.died,
    shells: T.shells.map((s) => ({ year: s.year, early: um(s.early), late: um(s.late), top: um(s.top), crown: um(s.crown), seeds: s.seeds })),
    branches: T.branches.map((b) => ({ id: b.id, year: b.year, parent: b.parent, at: b.at.map(um), az: b.az, died: b.died, r: um(radius(T.nodes[b.node].area)) })),
    furrows: T.furrows,
    dirt: Math.round(T.dirt),
  };
}

// The trunk cut across at height h (m): its rings from the pith out (µm: early, late; the pipes laid
// the same below the crown, thinning up through it to the top), and its knots (a branch's foot: from
// the ring it started in out to where it died, or to the bark).
export function cutTrunk(facts, h) {
  const H = Math.round(h * 1e6);
  const from = facts.shells.findIndex((s) => s.top >= H);
  if (from < 0) return { rings: [], knots: [] };
  const rings = facts.shells.slice(from).map((s) => {
    const q = H <= s.crown ? 1 : Math.max(0, (s.top - H) / (s.top - s.crown));
    const early = Math.round(s.early * q),
      late = Math.round(s.late * q);
    return { year: s.year, early, late, width: early + late };
  });
  const shoot = Math.round(TREES[facts.kind].shoot * 1e6);
  const out = (y) => shoot + rings.filter((r) => r.year < y).reduce((n, r) => n + r.width, 0);
  const knots = [];
  for (const b of facts.branches) {
    if (b.parent !== 0 || Math.abs(b.at[2] - H) > b.r) continue;
    knots.push({ year: b.year, az: b.az / 1000, from: out(b.year), to: b.died === null ? out(Infinity) : out(b.died + 1), dead: b.died !== null });
  }
  return { rings, knots };
}

// Its wood as limbs (what the scene draws): each stem from its foot to where the next on its branch
// begins (or its tip is), as thick as its pipes; and its leaves, at each living tip (m² of them).
export function limbsOf(T) {
  const end = new Map();
  for (const n of T.nodes) if (n.parent >= 0 && T.nodes[n.parent].branch === n.branch) end.set(n.parent, n.base);
  for (const t of T.tips) if (!end.has(t.node)) end.set(t.node, t.pos);
  return {
    limbs: T.nodes.map((n) => ({ from: n.base, to: end.get(n.id) ?? n.base, r: radius(n.area), alive: n.alive })),
    leaves: T.tips.filter((t) => t.alive && t.leaf > 0).map((t) => ({ at: t.pos, area: t.leaf })),
  };
}

// Its shape now: how tall, how wide (m), its living tips.
export function shapeOf(T) {
  let top = 0,
    wide = 0,
    tips = 0;
  for (const t of T.tips) {
    if (!t.alive) continue;
    tips++;
    if (t.pos[2] > top) top = t.pos[2];
    const dx = t.pos[0] - T.at[0],
      dy = t.pos[1] - T.at[1];
    const r = Math.sqrt(dx * dx + dy * dy);
    if (r > wide) wide = r;
  }
  return { height: top, width: 2 * wide, tips };
}
