// Life (outside.md Part 4, Phase 8): the outside's beings, each a body of its own matter (law/matter.js
// BEINGS: what each kind is), under the laws any matter is under:
//   Flying   it flies by throwing air down: its wings sweep a disc as wide as they span, and the push a
//            power P gets through it is (2ρA)^⅓·P^⅔ (momentum, as a rotor's), its muscle's most. Its body
//            drags through the air as a ball of its matter does (Clift & Gauvin's curve: Stokes's slow,
//            Newton's fast). It goes as fast as costs it least (holding its weight up costs less the
//            faster it goes, the drag more: their sum's least), steering a beat at a time. Stop flapping
//            and it falls until it rests.
//   Burning  sitting still it burns as a body of its mass does (Kleiber: `rest` a kg^¾), faster the
//            warmer it is (0.65 eV: Gillooly et al. 2001); one that keeps its own warmth loses heat too,
//            through the still air its cover holds (the air's conducting) to the colder air. It fuels
//            from what it eats (that matter's burning heat, as much as it keeps), in the light while it
//            is warm enough to fly; what it does not burn it stores (its fat, at most); out of store it
//            weakens and stops.
//   Growing  an egg is a parcel set loose in its place: an oak's living tip (the gall grows round it), a
//            cell of a comb, a nest of grass. Its young grow by the warmth they get (°C·days over
//            `above`, at their parent's warmth if it keeps one); crossing `grows` it is a grown, winged
//            being. A grown one lives `lives` days at most. Dead, it falls from where it was and lies
//            until it rots (its matter's `rots`, as a fallen leaf does).
//   The kinds  Gall bugs live in an oak: each lays while it lives, warm enough to fly and the leaves out,
//            one egg a living tip with no grub in it, and a gall grows there and only there; the grub
//            eats the gall and comes out winged, the gall left empty hanging on till it rots (as a leaf
//            would). Hive bugs keep a nest of wax on an oak's trunk: they forage the grass about it, make
//            comb with what they gather past their burning, and their queen lays a cell at a time while
//            the hive has bugs to feed the young. Birds pair in an oak: when its leaves come out they
//            gather grass for a nest in a fork as fast as they eat, lay to their clutch and keep the eggs
//            at their own warmth; the young fly off (one staying, if the pair is short). After their
//            brood (or the longest day, with none) they moult, a quill a day each falling under the tree.
//   Numbers  far from every sense a tree's beings are numbers, the same for everyone, from the world's
//            start (EPOCH) a day at a time, and replayed in one go when someone comes back: what comes
//            of the warmth is reckoned from the days' warmth summed (a grub's coming out, the day it was
//            laid), so a day costs only what happens on it. What hands did to them (galls picked,
//            branches broken, comb taken: law/hands.js) is read in on its day. Near, each is its own:
//            seeded flights between its places, each flown by the law; nothing computes while it sits.
//   bodyOf(kind) → its body: mass, size, lift, cruise         burnOf(kind, °C) → W
//   flyStep(body, s, dt, { flapping, to, ground }) → s        lifeOf(tree, day, facts) → its numbers
//   gallsOf(tree, day, facts) → the galls hanging               beingsAt(tree, life, ms) → each near one, now
//   lyingAt(tree, life, ms) → the dead lying where they fell
// World metres: x east, y north, z up (the ground's height: law/outside.js).
import { MATTER, BEINGS } from './matter.js';
import { dayOf, yearOf, sunAt } from './sun.js';
import { treeNow, groundAt, matterAt, waterAt, EPOCH, WATER, SEED } from './outside.js';
import { weatherAt } from './weather.js';
import { leafyOn } from './tree.js';
import { exp, log, pow, sin, cos } from './dmath.js';

// Where the outside's life stands at the world's start (the seed's): the share of oaks with gall bugs
// in them and how many galls they had laid the autumn before; the share with a hive on their trunk, its
// bugs, its comb (g) and its store (kJ); the share with a pair of birds. The world's makeup: Tabor's to set.
export const START = Object.freeze({ gallbug: { share: 0.5, galls: 6 }, hivebug: { share: 0.1, bugs: 100, wax: 50, store: 500 }, bird: { share: 0.4 } });

const G = 9.81;
const RHO = MATTER.air.density;
const NU = (MATTER.air.viscous * 1e-9) / RHO; // m²/s
const EV = 0.65 / 8.617333e-5; // K: living things' burning, its Arrhenius heat (0.65 eV over Boltzmann's)
const DAY_MS = 86400000;
const UNIX_DAY = 719528; // (law/sun.js days of 1970-01-01)
export const dayAt = (ms) => Math.floor(ms / DAY_MS) + UNIX_DAY;

// --- seeded draws (MurmurHash3's finish) ---
const fmix = (h) => {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
};
const hashOf = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};
const draw = (s, ...ks) => {
  let h = hashOf(s);
  for (const k of ks) h = fmix((h + Math.imul(k | 0, 0x9e3779b9)) >>> 0);
  return fmix(h) / 4294967296;
};
// days a thing lies rotting before it is gone: half of all such are gone in `rots` days (each its own draw)
const rotted = (seed, rots) => Math.ceil((-rots * log(Math.max(1e-12, 1 - draw(seed, 0)))) / log(2));

// --- a body ---
// a ball's drag coefficient at its Reynolds number (Clift & Gauvin 1970)
const cdOf = (re) => (24 / re) * (1 + 0.15 * pow(re, 0.687)) + 0.42 / (1 + 42500 * pow(re, -1.16));
export const dragOf = (body, v) => (v > 0 ? 0.5 * RHO * v * v * cdOf((2 * body.r * v) / NU) * body.front : 0);
// the power flying at speed v takes: its weight held up by the air thrown down through its disc (the
// flow it induces, by momentum: vi² = (√(v⁴ + 4u⁴) − v²) / 2, u² = W / 2ρA), and its body's drag
export function powerAt(body, v) {
  const u2 = body.weight / (2 * RHO * body.disc);
  const vi = Math.sqrt((Math.sqrt(v * v * v * v + 4 * u2 * u2) - v * v) / 2);
  return body.weight * vi + dragOf(body, v) * v;
}
const bodies = new Map();
export function bodyOf(kind) {
  if (bodies.has(kind)) return bodies.get(kind);
  const B = BEINGS[kind];
  const m = B.mass / 1000;
  const r = pow((3 * m) / (4 * Math.PI * MATTER[B.of.body].density), 1 / 3);
  const disc = Math.PI * (B.span / 2) * (B.span / 2);
  const P = B.muscle * m;
  const body = {
    kind,
    m,
    r,
    front: Math.PI * r * r,
    area: 4 * Math.PI * r * r,
    disc,
    P,
    lift: pow(2 * RHO * disc, 1 / 3) * pow(P, 2 / 3),
    weight: m * G,
    beat: 1 / B.flaps,
    cruise: 0,
    flying: Infinity,
  };
  for (let v = 0.05; v < 40; v += 0.05) {
    const p = powerAt(body, v);
    if (p < body.flying) [body.flying, body.cruise] = [p, v];
  }
  bodies.set(kind, Object.freeze(body));
  return bodies.get(kind);
}
// W it burns sitting at the air's heat (°C): its rest, at its own warmth or the air's, and what its coat lets out
export function burnOf(kind, air) {
  const B = BEINGS[kind],
    body = bodyOf(kind);
  const T = B.warm ?? air;
  const rest = B.rest * pow(body.m, 0.75) * exp(EV * (1 / 293.15 - 1 / (T + 273.15)));
  const loss = B.warm !== null && B.coat ? (MATTER.air.heat.conducts / 1000 / B.coat) * body.area * Math.max(0, B.warm - air) : 0;
  return rest + loss;
}

// One step (dt s) of a flyer (s: { p: [x, y, z] m, v: [vx, vy, vz] m/s }): flapping, its wings push it
// toward `to` (its own place: it holds there) as hard as it needs, no harder than they can, the push set
// once a beat; not flapping, only its weight and its drag. Reaching the ground (ground(x, y) → m) it rests.
export function flyStep(body, s, dt, { flapping, to = null, ground }) {
  const [px, py, pz] = s.p,
    [vx, vy, vz] = s.v;
  const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
  const D = dragOf(body, speed);
  const dx = speed > 0 ? (-vx / speed) * D : 0,
    dy = speed > 0 ? (-vy / speed) * D : 0,
    dz = speed > 0 ? (-vz / speed) * D : 0;
  let fx = 0,
    fy = 0,
    fz = 0;
  if (flapping) {
    const ox = to ? to[0] - px : 0,
      oy = to ? to[1] - py : 0,
      oz = to ? to[2] - pz : 0;
    const dist = Math.sqrt(ox * ox + oy * oy + oz * oz);
    const brake = (body.lift - body.weight) / body.m; // m/s²: how hard it can always slow
    const want = Math.min(body.cruise, Math.sqrt(2 * Math.max(0, brake) * dist)); // (no faster than it can stop in)
    const k = dist > 0 ? want / dist : 0;
    const nx = (body.m * (ox * k - vx)) / body.beat - dx,
      ny = (body.m * (oy * k - vy)) / body.beat - dy,
      nz = (body.m * (oz * k - vz)) / body.beat - dz + body.weight;
    const n = Math.sqrt(nx * nx + ny * ny + nz * nz);
    const f = n > 0 ? Math.min(1, body.lift / n) : 0;
    fx = nx * f;
    fy = ny * f;
    fz = nz * f;
  }
  const ax = (fx + dx) / body.m,
    ay = (fy + dy) / body.m,
    az = (fz + dz) / body.m - G;
  s.v = [vx + ax * dt, vy + ay * dt, vz + az * dt];
  s.p = [px + s.v[0] * dt, py + s.v[1] * dt, pz + s.v[2] * dt];
  const g = ground(s.p[0], s.p[1]);
  s.rest = s.p[2] <= g;
  if (s.rest) {
    s.p[2] = g;
    s.v = [0, 0, 0];
  }
  return s;
}
// A flight from `from` to `to` (world m), a beat a step: where it is each step, how long it took.
const PATH_MAX = 256; // the most places a flight keeps for drawing (a drawing's grain)
const thin = (flat, beat) => {
  const n = flat.length / 3;
  const every = Math.ceil(n / PATH_MAX);
  const at = [];
  for (let i = 0; i < n; i += every) at.push([flat[3 * i], flat[3 * i + 1], flat[3 * i + 2]]);
  at.push([flat[3 * n - 3], flat[3 * n - 2], flat[3 * n - 1]]);
  return { every: every * beat, at };
};
export function flight(body, from, to) {
  const s = { p: from.slice(), v: [0, 0, 0] };
  const gap = (p) => Math.sqrt((to[0] - p[0]) ** 2 + (to[1] - p[1]) ** 2 + (to[2] - p[2]) ** 2);
  const most = Math.ceil((4 * gap(from)) / body.cruise / body.beat) + 4 * Math.ceil(1 / body.beat); // (arrived, or given up)
  const flat = [...from];
  for (let n = 0; n < most; n++) {
    flyStep(body, s, body.beat, { flapping: true, to, ground: groundAt });
    flat.push(s.p[0], s.p[1], s.p[2]);
    if (s.rest || gap(s.p) < body.cruise * body.beat) break;
  }
  flat.push(...to);
  return { took: (flat.length / 3 - 1) * body.beat, ...thin(flat, body.beat) };
}
// A fall from `from`, its wings still: where it is each beat until it rests on the ground.
export function fall(body, from) {
  const s = { p: from.slice(), v: [0, 0, 0] };
  const flat = [...from];
  for (let n = 0; n < 1e5 && !s.rest; n++) flat.push(...flyStep(body, s, body.beat, { flapping: false, ground: groundAt }).p);
  return { took: (flat.length / 3 - 1) * body.beat, ...thin(flat, body.beat) };
}

// --- a tree's places ---
const lift = (tree, p) => [p[0], p[1], p[2] + tree.at[2]]; // (a tree's own heights are from its foot)
const groundUnder = (p) => [p[0], p[1], groundAt(p[0], p[1])];
// the branches gone from a tree by day d (broken off on their days, and all that grew from them)
function offOf(tree, broken, d) {
  const out = new Set();
  if (!broken.length) return out;
  const T = treeNow(tree, d);
  const kids = new Map();
  for (const c of T.branches) if (c.parent !== null) kids.set(c.parent, [...(kids.get(c.parent) ?? []), c.id]);
  const walk = (id) => {
    out.add(id);
    for (const c of kids.get(id) ?? []) walk(c);
  };
  for (const b of broken) if (b.day <= d) walk(b.branch);
  return out;
}
// whether there is water within r (m) of (x, y): ring by ring of the water's cells
const watered = new Map();
function waterNear(x, y, r) {
  const key = `${x},${y},${r}`;
  if (!watered.has(key)) {
    const c = WATER.cell;
    let found = false;
    for (let R = 0; R <= r && !found; R += c)
      for (let i = -R; i <= R && !found; i += c) for (let j = -R; j <= R && !found; j += Math.abs(i) === R ? c : 2 * R || c) if (i * i + j * j <= r * r && waterAt(x + i, y + j) > 0) found = true;
    watered.set(key, found);
  }
  return watered.get(key);
}
// a spot of grass within r of (x, y), seeded (the foot of the tree if none comes up)
function grassNear(x, y, r, seed, k) {
  for (let n = 0; n < 8; n++) {
    const a = 2 * Math.PI * draw(seed, k, n, 1),
      d = r * Math.sqrt(draw(seed, k, n, 2));
    const p = [x + d * cos(a), y + d * sin(a)];
    if (matterAt(p[0], p[1]) === 'grass') return groundUnder(p);
  }
  return groundUnder([x, y]);
}
// The days' warmth over `above`, summed from the world's start: sums[i] is the sum over EPOCH .. EPOCH + i − 1.
const SUMS = new Map();
function sumTo(above, d) {
  if (!SUMS.has(above)) SUMS.set(above, [0]);
  const s = SUMS.get(above);
  while (s.length <= d - EPOCH) s.push(s.at(-1) + Math.max(0, dayOf(EPOCH + s.length - 1).warmth - above));
  return s[Math.max(0, d - EPOCH)];
}
// the day a young laid on day `laid` (grown `had` already) crosses `grows`: the first day e whose warmth,
// summed from the day after it was laid, is enough (none within ten years: never)
function grownOn(kind, laid, had = 0) {
  const B = BEINGS[kind];
  const from = Math.max(laid + 1, EPOCH);
  const need = sumTo(B.above, from) + B.grows - had;
  let lo = from,
    hi = from + 3653;
  if (sumTo(B.above, hi + 1) < need) return Infinity;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sumTo(B.above, mid + 1) >= need) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

// --- the numbers: a tree's beings, a day at a time ---
// life: { day, galls: Map(`tip@laid` → { tip, branch, at, laid, out (the day its bug comes out), empty, falls }),
//   grubs: Map(tip → the gall a grub is in), bugs: Map(id → { id, born, home }) (gall bugs grown),
//   due: Map(day → [[what, key]]) (what comes of the warmth, and of age, on its day), hive: { at, wax (g),
//   store (J), bugs: [{ born, n }], brood: [{ laid, n, on }] } | null, birds: { adults: [{ id, born, store }],
//   nest: { at, branch, parent, grass, eggs: [{ laid, on }], year, full } | null, bred (the year it last
//   bred), moult: { from, year } | null, next } | null, feathers: [{ id, at, day, gone }], dead: [{ kind,
//   id, from, day, gone }], took: Set (comb taken, read in) }
const due = (L, day, what, key) => {
  if (!Number.isFinite(day)) return;
  if (!L.due.has(day)) L.due.set(day, []);
  L.due.get(day).push([what, key]);
};
function layGall(tree, L, t, laid, had = 0) {
  const key = `${t.id}@${laid}`;
  const g = { tip: t.id, branch: t.branch, at: lift(tree, t.pos), laid, out: grownOn('gallbug', laid, had), empty: false, falls: null };
  L.galls.set(key, g);
  L.grubs.set(t.id, key);
  due(L, g.out, 'out', key);
}
function startOf(tree) {
  const L = { day: EPOCH, galls: new Map(), grubs: new Map(), bugs: new Map(), due: new Map(), hive: null, birds: null, feathers: [], dead: [], took: new Set() };
  let first = EPOCH;
  while (!(leafyOn(tree.kind, first) && !leafyOn(tree.kind, first - 1))) first++;
  const T = treeNow(tree, first); // (as it will stand when its first leaves come out)
  const tips = T.tips.filter((t) => t.alive);
  const S = START;
  if (draw(tree.id, 1) < S.gallbug.share && tips.length) {
    // the galls laid the autumn before (the seed's, each some way grown already)
    const free = tips.slice();
    for (let n = 0; n < S.gallbug.galls && free.length; n++) {
      const t = free.splice(Math.floor(draw(tree.id, 2, n) * free.length), 1)[0];
      layGall(tree, L, t, EPOCH - 1 - Math.floor(90 * draw(tree.id, 3, n)), (BEINGS.gallbug.grows / 2) * draw(tree.id, 4, n));
    }
  }
  const trunk = T.nodes.filter((n) => n.branch === 0 && n.alive);
  if (trunk.length && draw(tree.id, 5) < S.hivebug.share && (!BEINGS.hivebug.drinks || waterNear(tree.at[0], tree.at[1], BEINGS.hivebug.reach))) {
    // on the trunk, a seeded height up it, on a seeded side
    const nd = trunk[Math.floor(draw(tree.id, 6) * trunk.length)];
    const a = 2 * Math.PI * draw(tree.id, 7),
      r = Math.sqrt(nd.area / Math.PI);
    const B = BEINGS.hivebug;
    const each = Math.ceil(S.hivebug.bugs / B.lives);
    L.hive = { at: lift(tree, [nd.base[0] + r * cos(a), nd.base[1] + r * sin(a), nd.base[2] + nd.len / 2]), wax: S.hivebug.wax, store: S.hivebug.store * 1000, bugs: [], brood: [] };
    for (let k = 0; k < B.lives; k++) L.hive.bugs.push({ born: EPOCH - k, n: each });
  }
  if (draw(tree.id, 8) < S.bird.share && (!BEINGS.bird.drinks || waterNear(tree.at[0], tree.at[1], BEINGS.bird.reach))) {
    const B = BEINGS.bird;
    L.birds = { adults: [0, 1].map((k) => ({ id: k, born: EPOCH - Math.floor(B.lives * draw(tree.id, 9, k)), store: storeOf('bird') })), nest: null, bred: null, moult: null, next: 2 };
  }
  return L;
}
// J a being stores at most (its fat: its body's matter's burning heat)
const storeOf = (kind) => ((BEINGS[kind].mass * BEINGS[kind].fat) / 1000) * (MATTER[BEINGS[kind].of.body].heat.releases / 1000);
// J a gram of what it eats gives it
const foodOf = (kind) => (MATTER[BEINGS[kind].eats].heat.releases / 1000) * (BEINGS[kind].keeps / 1000);
// s a day it is in the air, foraging through the light: each flight as long as half its reach takes, and a rest between
const flyingOf = (kind, hours) => {
  const B = BEINGS[kind],
    leg = B.reach / 2 / bodyOf(kind).cruise;
  return (hours * 3600 * leg) / (leg + B.rests);
};
function die(L, kind, id, from, d) {
  L.dead.push({ kind, id, from, day: d, gone: d + rotted(`${kind}/${id}/${d}`, MATTER[BEINGS[kind].of.body].rots) });
}

// What hands did to the tree's beings on day d (each once: law/hands.js facts)
function handsOn(tree, L, d, F) {
  const drop = (key) => {
    const g = L.galls.get(key);
    if (!g) return;
    if (L.grubs.get(g.tip) === key) L.grubs.delete(g.tip); // (its grub with it)
    L.galls.delete(key);
  };
  for (const [key, day] of F.picked) if (day === d) drop(key);
  if (F.broken.some((b) => b.day === d)) {
    const off = offOf(tree, F.broken, d);
    for (const [key, g] of [...L.galls]) if (off.has(g.branch)) drop(key);
    if (L.birds?.nest && (off.has(L.birds.nest.branch) || off.has(L.birds.nest.parent))) L.birds.nest = null; // (it fell with its branch)
  }
  F.combs.forEach((c, i) => {
    const key = `comb ${c.day}/${i}`;
    if (c.day !== d || L.took.has(key) || !L.hive) return;
    L.took.add(key);
    const H = L.hive;
    const left = H.wax > 0 ? Math.max(0, H.wax - c.grams) / H.wax : 0;
    for (const y of H.brood) y.n = Math.floor(y.n * left); // (the young in the cells taken, with them)
    H.brood = H.brood.filter((y) => y.n > 0);
    H.wax = Math.max(0, H.wax - c.grams);
  });
}

function gallsDay(tree, L, d, w, leaves, F) {
  const B = BEINGS.gallbug;
  for (const [what, key] of L.due.get(d) ?? []) {
    if (what === 'out') {
      // the grub has eaten its way out, winged
      const g = L.galls.get(key);
      if (!g || g.empty) continue;
      g.empty = true;
      L.grubs.delete(g.tip);
      L.bugs.set(key, { id: key, born: d, home: g.at });
      due(L, d + B.lives, 'dies', key);
      g.falls = d + rotted(`${tree.id}/${key}`, MATTER.leaf.rots); // (empty, it hangs on till it rots, as a leaf would)
      due(L, g.falls, 'falls', key);
    } else if (what === 'dies') {
      const b = L.bugs.get(key);
      if (!b) continue;
      L.bugs.delete(key);
      die(L, 'gallbug', key, b.home, d);
    } else if (what === 'falls' && L.galls.get(key)?.empty) L.galls.delete(key);
  }
  if (!leaves || w < B.above || !L.bugs.size) return;
  // each lays while it lives, warm enough to fly: an egg a living tip with no grub in it
  const T = treeNow(tree, d);
  const off = offOf(tree, F.broken, d);
  const free = T.tips.filter((t) => t.alive && !L.grubs.has(t.id) && !off.has(t.branch));
  for (const b of L.bugs.values()) for (let e = 0; e < B.lays && free.length; e++) layGall(tree, L, free.splice(Math.floor(draw(`${tree.id}/${b.id}`, d, e) * free.length), 1)[0], d);
}

function hiveDay(tree, L, d, w, hours) {
  const H = L.hive;
  if (!H) return;
  const B = BEINGS.hivebug;
  for (const c of H.bugs)
    if (d - c.born >= B.lives) {
      for (let j = 0; j < c.n; j++) die(L, 'hivebug', `h${c.born}.${j}`, null, d); // (out foraging: where it fell is found when it is seen)
      c.n = 0;
    }
  H.bugs = H.bugs.filter((c) => c.n > 0);
  const n = H.bugs.reduce((s, c) => s + c.n, 0);
  const flies = w >= B.above;
  const each = burnOf('hivebug', w) * 86400 + (flies ? bodyOf('hivebug').flying * flyingOf('hivebug', hours) : 0);
  let gain = (flies ? n * B.gut * hours * foodOf('hivebug') : 0) - n * each;
  // comb: what it gathers past its burning makes wax, until the nest is as big as it builds it; the rest is stored
  const waxJ = MATTER.wax.heat.releases / 1000 / (B.makes / 1000); // J of fuel a gram of wax takes
  if (gain > 0 && H.wax < B.nest.grams) {
    const g = Math.min(B.nest.grams - H.wax, gain / waxJ);
    H.wax += g;
    gain -= g * waxJ;
  }
  H.store += gain;
  if (H.store < 0) {
    // short: as many starve as it was short a day's burning each, the oldest first
    let starve = Math.ceil(-H.store / each);
    for (const c of [...H.bugs].reverse()) {
      const k = Math.min(c.n, starve);
      for (let j = c.n - k; j < c.n; j++) die(L, 'hivebug', `h${c.born}.${j}`, H.at, d);
      c.n -= k;
      starve -= k;
    }
    H.bugs = H.bugs.filter((c) => c.n > 0);
    H.store = 0;
  }
  // its young: crossing `grows`, grown (the newest first in the list)
  for (const y of H.brood)
    if (y.on <= d) {
      H.bugs.unshift({ born: d, n: y.n });
      y.n = 0;
    }
  H.brood = H.brood.filter((y) => y.n > 0);
  // the queen lays in its free cells (a cell's wax as heavy as the bug grown in it), while it has bugs to feed them
  const cells = Math.floor(H.wax / B.mass) - H.brood.reduce((s, y) => s + y.n, 0);
  if (n > 0 && flies && H.store > 0 && cells > 0) H.brood.push({ laid: d, n: Math.min(B.lays, cells), on: grownOn('hivebug', d) });
}

function birdsDay(tree, L, d, w, hours, leaves) {
  const P = L.birds;
  if (!P) return;
  const B = BEINGS.bird,
    full = storeOf('bird');
  const each = burnOf('bird', w) * 86400 + bodyOf('bird').flying * flyingOf('bird', hours);
  const intake = B.gut * hours * foodOf('bird');
  const T = () => treeNow(tree, d); // (as it stands that day: asked for only when wanted)
  const perch = (a) => lift(tree, P.nest?.at ?? T().tips[Math.floor(draw(`${tree.id}/b${a.id}`, -1, 2) * T().tips.length)]?.pos ?? [tree.at[0], tree.at[1], 0]);
  P.adults = P.adults.filter((a) => {
    a.store = Math.min(full, a.store + intake - each);
    if (a.store >= 0 && d - a.born < B.lives) return true;
    die(L, 'bird', `b${a.id}`, perch(a), d);
    return false;
  });
  const year = yearOf(d);
  // its oak's leaves out: a pair builds a nest in a fork, of grass gathered as fast as they eat
  if (leaves && P.adults.length === 2 && P.bred !== year && P.nest?.year !== year) {
    const forks = T().branches.filter((b) => b.parent !== null);
    if (forks.length) {
      const f = forks[Math.floor(draw(tree.id, 10, year) * forks.length)];
      P.nest = { at: f.at.slice(), branch: f.id, parent: f.parent, grass: 0, eggs: [], year, full: false };
    }
  }
  const N = P.nest;
  if (N && N.year === year && P.bred !== year) {
    if (N.grass < B.nest.grams) N.grass = Math.min(B.nest.grams, N.grass + P.adults.length * B.gut * hours);
    else if (P.adults.length) {
      if (P.adults.length === 2) for (let k = 0; k < B.lays && N.eggs.length < B.clutch && !N.full; k++) N.eggs.push({ laid: d, on: d + Math.ceil(B.grows / ((B.warm ?? w) - B.above)) });
      if (N.eggs.length >= B.clutch) N.full = true; // (its clutch laid: no more this season)
      // the eggs kept at its warmth; crossing `grows`, they fly (the pair short: one stays, the rest go)
      const flown = N.eggs.filter((e) => e.on <= d);
      N.eggs = N.eggs.filter((e) => e.on > d);
      for (const e of flown) if (P.adults.length < 2) P.adults.push({ id: P.next++, born: d, store: full / 2, from: e.laid });
      if (N.eggs.length === 0 && flown.length) {
        P.bred = year;
        P.moult = { from: d, year };
      }
    } else N.eggs = []; // (none left to keep them warm)
  }
  // with no brood this year (none under way), the moult comes after the longest day
  const brooding = N?.year === year && P.bred !== year && (N.eggs.length > 0 || N.grass < B.nest.grams);
  if (P.moult?.year !== year && P.bred !== year && !brooding && !dayOf(d).lengthening && dayOf(d - 1).lengthening) P.moult = { from: d, year };
  if (P.moult?.year === year && d - P.moult.from < B.quills) {
    let wide = 1;
    for (const t of T().tips) wide = Math.max(wide, Math.sqrt((t.pos[0] - tree.at[0]) ** 2 + (t.pos[1] - tree.at[1]) ** 2));
    P.adults.forEach((a, k) => {
      const id = `feather:${tree.id}/${d}/${k}`;
      const r = wide * Math.sqrt(draw(id, 1)),
        an = 2 * Math.PI * draw(id, 2);
      L.feathers.push({ id, at: groundUnder([tree.at[0] + r * cos(an), tree.at[1] + r * sin(an)]), day: d, gone: d + rotted(id, MATTER.feather.rots) });
    });
  }
}

function stepDay(tree, L, d, F) {
  handsOn(tree, L, d, F);
  const D = dayOf(d),
    leaves = leafyOn(tree.kind, d);
  gallsDay(tree, L, d, D.warmth, leaves, F);
  hiveDay(tree, L, d, D.warmth, D.minutes / 60);
  birdsDay(tree, L, d, D.warmth, D.minutes / 60, leaves);
  L.due.delete(d);
  // what has rotted away is gone
  if (L.feathers.some((f) => f.gone <= d)) L.feathers = L.feathers.filter((f) => f.gone > d);
  if (L.dead.some((x) => x.gone <= d)) L.dead = L.dead.filter((x) => x.gone > d);
}

// The hands' facts about one tree (law/hands.js state): its galls picked (`tip@laid` → day), its branches
// broken, the comb taken from its hive ([{ day, grams }])
function factsFor(tree, facts) {
  const picked = new Map();
  for (const [k, day] of facts?.picked ?? []) if (k.startsWith(`${tree.id}/`)) picked.set(k.slice(tree.id.length + 1), day);
  return { picked, broken: facts?.broken?.get(tree.id) ?? [], combs: facts?.combs?.get(tree.id) ?? [] };
}
const lives = new Map(); // tree id → { sig, L } (the last replayed; a new fact replays it from the start)
// A tree's beings on day d (a law/sun.js day), as the hands left them (null facts: untouched). Read only.
export function lifeOf(tree, d, facts = null) {
  const F = factsFor(tree, facts);
  const sig = JSON.stringify([[...F.picked], F.broken, F.combs]);
  let c = lives.get(tree.id);
  if (!c || c.sig !== sig || c.L.day > d) c = { sig, L: startOf(tree) };
  while (c.L.day < d) stepDay(tree, c.L, c.L.day++, F);
  handsOn(tree, c.L, d, F); // (that day's own, so far)
  if (lives.size > 512) lives.clear();
  lives.set(tree.id, c);
  return c.L;
}
// The galls on an oak on day d: [{ tip, laid, at (world m), branch, empty }]
export const gallsOf = (tree, d, facts = null) => [...lifeOf(tree, d, facts).galls.values()];
// What a tree's hive and nest hold on day d, for the hands: { hive: { at, wax } | null, nest, feathers }
export const nestsOf = (tree, d, facts = null) => {
  const L = lifeOf(tree, d, facts);
  return { hive: L.hive && { at: L.hive.at, wax: L.hive.wax }, nest: L.birds?.nest ? { ...L.birds.nest, at: lift(tree, L.birds.nest.at) } : null, feathers: L.feathers };
};

// --- near: each its own ---
// Where each of a tree's beings is at an instant (ms): [{ kind, id, at (world m), flying, dead, seed, flaps }].
// Each goes bout by bout (`rests` and the longest flight its reach takes): it sits a while where the last
// bout left it, then flies to this bout's place (by the law, from rest), and sits there. A gall bug goes
// from tip to tip of its oak; a hive bug out to the grass and home; a bird down to the grass and up to its
// tree (its nest, while it has eggs). Out of the light, too cold to fly, or (a bird) in rain harder than it
// shelters from, it stays home.
const paths = new Map();
function pathOf(key, make) {
  if (!paths.has(key)) {
    if (paths.size > 8192) paths.clear();
    paths.set(key, make());
  }
  return paths.get(key);
}
const FALLING_S = 3600; // s after its death its body's fall is drawn (past it, it lies where it fell: straight down)
const along = (p, t) => {
  const i = Math.min(p.at.length - 2, Math.floor(t / p.every));
  const f = Math.min(1, (t - i * p.every) / p.every);
  return p.at[i].map((c, k) => c + (p.at[i + 1][k] - c) * f);
};
const living = new WeakMap(); // a tree as it stands → its living tips
export function beingsAt(tree, L, ms) {
  const out = [];
  const T = treeNow(tree, dayAt(ms));
  if (!living.has(T))
    living.set(
      T,
      T.tips.filter((t) => t.alive),
    );
  const tips = living.get(T);
  const walk = (kind, id, home, placeOf) => {
    const B = BEINGS[kind],
      body = bodyOf(kind);
    const bout = B.rests + (2 * B.reach) / body.cruise;
    const off = draw(id, 0) * bout;
    const t = ms / 1000 - off;
    const k = Math.floor(t / bout);
    const leg = pathOf(`${id}@${k}`, () => {
      const active = (kk) => {
        const at = (off + kk * bout) * 1000;
        // (in the light, warm enough to fly, and not raining harder than it shelters from: the world's weather)
        return sunAt(at)[2] > 0 && dayOf(dayAt(at)).warmth >= B.above && !(B.song?.shelter !== undefined && weatherAt(SEED, at).rain > B.song.shelter);
      };
      const dest = (kk) => (active(kk) ? placeOf(kk) : home);
      return { from: dest(k - 1), to: dest(k), depart: k * bout + draw(id, k, 1) * B.rests, seed: hashOf(id) };
    });
    const { from, to, depart } = leg;
    let at = from,
      flying = false;
    if (t >= depart && (from[0] !== to[0] || from[1] !== to[1] || from[2] !== to[2])) {
      const p = pathOf(`${id}#${k}`, () => flight(body, from, to));
      flying = t - depart < p.took;
      at = flying ? along(p, t - depart) : to;
    } else if (t >= depart) at = to;
    out.push({ kind, id, at, flying, dead: false, seed: leg.seed, flaps: B.flaps });
  };
  const tipAt = (seed, k) => (tips.length ? lift(tree, tips[Math.floor(draw(seed, k, 2) * tips.length)].pos) : lift(tree, [tree.at[0], tree.at[1], 1]));
  for (const b of L.bugs.values()) {
    const id = `${tree.id}/${b.id}`;
    walk('gallbug', id, b.home, (k) => tipAt(id, k));
  }
  if (L.hive)
    for (const c of L.hive.bugs)
      for (let j = 0; j < c.n; j++) {
        const id = `${tree.id}/h${c.born}.${j}`;
        walk('hivebug', id, L.hive.at, (k) => (k % 2 ? L.hive.at : grassNear(tree.at[0], tree.at[1], BEINGS.hivebug.reach, id, k)));
      }
  if (L.birds) {
    const N = L.birds.nest;
    const nesting = N && N.year === yearOf(dayAt(ms)) && N.eggs.length > 0;
    for (const a of L.birds.adults) {
      const id = `${tree.id}/b${a.id}`;
      const home = nesting ? lift(tree, N.at) : tipAt(id, -1);
      walk('bird', id, home, (k) => (k % 2 ? (nesting ? lift(tree, N.at) : tipAt(id, k)) : grassNear(tree.at[0], tree.at[1], BEINGS.bird.reach, id, k)));
    }
  }
  // the dead still falling, from where they were when they stopped (the day's start)
  for (const x of L.dead) {
    const since = ms / 1000 - (x.day - UNIX_DAY) * 86400;
    if (since < 0 || since >= FALLING_S) continue;
    const p = pathOf(`dead ${tree.id}/${x.kind}/${x.id}/${x.day}`, () => fall(bodyOf(x.kind), whereDied(tree, x)));
    if (since < p.took) out.push({ kind: x.kind, id: `${tree.id}/${x.id}`, at: along(p, since), flying: false, dead: true, seed: hashOf(x.id), flaps: 0 });
  }
  return out;
}
// where a dead one was when it stopped: its place (a hive bug out foraging: a spot of grass in its reach)
const whereDied = (tree, x) => x.from ?? grassNear(tree.at[0], tree.at[1], BEINGS[x.kind].reach, `${tree.id}/${x.id}`, x.day);
// The dead lying (fallen, not yet rotted) at an instant: [{ kind, id, at (world m) }]; each straight under
// where it stopped (it fell from rest, with nothing but its weight and the air's drag on it).
export function lyingAt(tree, L, ms) {
  const out = [];
  for (const x of L.dead) {
    const since = ms / 1000 - (x.day - UNIX_DAY) * 86400;
    if (since < 0) continue;
    if (since < FALLING_S && since < pathOf(`dead ${tree.id}/${x.kind}/${x.id}/${x.day}`, () => fall(bodyOf(x.kind), whereDied(tree, x))).took) continue;
    out.push({ kind: x.kind, id: `${tree.id}/${x.id}`, at: groundUnder(whereDied(tree, x)) });
  }
  return out;
}
