// The hands (outside.md Phase 5, §2.3): what a being does to the outside's matter, as acts on the
// outside's chain, each sealed by its key and stamped in one order; what lasts (a branch broken off, a
// stone moved, a stick carved, a mark cut into a tree) is regrown from them, the same on every machine.
// Every making is a few acts: take, put, break, carve. Whether one works is the matter's:
//   Break   the hand pulls at a branch's far end as hard as a being pulls (BEING.pull); levered along
//           the branch, that bends its foot, and past what its wood's strength holds across a round
//           section (σ·πr³/4) it breaks there. A thick limb, a trunk, holds. What broke off is a stick
//           (in the hand): the branch as the tree had grown it that day, and all that grew from it.
//   Carve   a tool rubbed along matter takes it away only where the tool is the harder (law/matter.js
//           hardness: the harder takes the softer), the more a stroke the harder it is (CUT); a softer
//           tool takes nothing. On a stick: its wood thinned along it; on a tree: a mark in its bark and,
//           past the bark, its wood.
//   Take, put  a stone or a stick into the hand, and down where it is put (on the ground there).
// Two hands: a being holds at most two things. The creation tree (Phase 7: law/making.js, each by its
// matter's rule): a handful gathered (grass: fibre; clay: a lump; water: into a fired cup), fibres
// twisted to string, a stone struck with another (it chips, or not), a stone bound to a stick (an axe)
// and swung (it holds, or comes apart), wood rubbed on wood (fire, or not), clay formed (a cup) and
// fired, a gall picked off an oak, a gall or ore crushed, what is crushed mixed into a cup's water
// (ink), ore melted in a fired cup and poured into another (metal), a handful of comb gathered from a
// hive (wax: Phase 8, law/life.js) mixed into a cup and melted, a string dipped in it (a candle). What
// is made is a thing (`made:n`, n its act's place in the chain), its parts gone into it. What lives
// out there is law/life.js's: a gall grows only where a gall bug laid, a hive's comb is as much as its
// bugs built, a feather lies where it fell; what hands take of them it reads back in on its day.
// Acts: { v: 1, kind: 'outside', by (key), k (its count: 1, 2, ...), act, ... }
//   'take'  thing (a feather: and day, the day it is taken up)      'put'  thing, to: [x, y, z] (mm, world)
//   'break' tree, branch, day (law/sun.js days: the tree as grown that day)
//   'carve' thing (a stick) | tree, tool (in the hand), from, to (mm: along the stick from its foot, or up
//           the trunk), strokes; a tree's also az (°: the side cut into)
//   'gather' at: [x, y] (mm) | tree, day (its hive's comb)            'twist' a, b    'strike' tool, thing
//   'bind' stick, stone, string, turns, pull (N: as tight as it was wound)  'swing' thing, at (a tree), to
//   'rub' tool, thing, strokes, at          'form' thing                    'fire' thing, fire
//   'pick' tree, tip, laid, day (a gall: the tip it grew on, the day it was laid)   'crush' tool, thing   'mix' cup, thing
//   'melt' cup, fire                        'pour' cup, into                'dip' string, cup
//   'pry' stick (in the hand), over (a stone: the fulcrum), thing (a stone: the load), to (where it goes over)
// D = sha256(T("outside") ‖ JCS(act)), sealed as any record is.
import { sha256 } from '@noble/hashes/sha2.js';
import { T, jcs, utf8, concat, b64url, fromB64url } from './tags.js';
import { sealOf, verifySeal, isGoodPublicKey } from './keys.js';
import { MATTER, BEINGS } from './matter.js';
import { stonesIn, treesIn, treeNow, matterAt, OUTSIDE } from './outside.js';
import * as MK from './making.js';
import * as LIFE from './life.js';

export const V = 1;
export const BEING = MK.BEING; // (a being's pull, swing, rubbing: law/making.js)
export const CUT = 20; // µm a stroke takes, for each step the tool is harder (Tabor's to set)
const ACTS = ['take', 'put', 'break', 'carve', 'gather', 'twist', 'strike', 'bind', 'swing', 'rub', 'form', 'fire', 'pick', 'crush', 'mix', 'melt', 'pour', 'dip', 'pry'];

export const handsDigest = (act) => sha256(concat(T('outside'), utf8(jcs(act))));
const fields = (o, list) => Object.keys(o).sort().join() === list;
const goodKey = (s) => {
  try {
    return isGoodPublicKey(fromB64url(s, 32));
  } catch {
    return false;
  }
};
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const isId = (s, kind) => typeof s === 'string' && new RegExp(`^${kind}:-?\\d+,-?\\d+(/\\d+)?$`).test(s);
const featherId = (s) => typeof s === 'string' && /^feather:tree:-?\d+,-?\d+\/\d+\/\d+$/.test(s);
const thingId = (s) => isId(s, 'stone') || isId(s, 'stick:tree') || featherId(s) || (typeof s === 'string' && /^made:\d+$/.test(s));
const place = (v, n = 3) => Array.isArray(v) && v.length === n && v.every((x) => int(x, -1e9, 1e9));
// an arm's speed (mm/s): the hand's, as the mouse moved it (outside.md §3.3), no faster than an arm goes
const speedOk = (v) => int(v, 0, BEING.swing * 1000);

// --- what the ids name ---
// a stone of the seed (law/outside.js), or a stick broken off a tree's branch
export function stoneOf(id) {
  const [, i, j] = /^stone:(-?\d+),(-?\d+)$/.exec(id) ?? [];
  return i === undefined ? null : (stonesIn(Number(i), Number(j))[0] ?? null);
}
export function treeOf(id) {
  const [, i, j] = /^tree:(-?\d+),(-?\d+)$/.exec(id) ?? [];
  return i === undefined ? null : (treesIn(Number(i), Number(j))[0] ?? null);
}
export const stickId = (tree, branch) => `stick:${tree}/${branch}`;
export const stickOf = (id) => {
  const [, tree, branch] = /^stick:(tree:-?\d+,-?\d+)\/(\d+)$/.exec(id) ?? [];
  return tree ? { tree, branch: Number(branch) } : null;
};
const matterOfThing = (id, state = null) => (id.startsWith('stone:') ? stoneOf(id)?.matter : id.startsWith('made:') ? state?.made.get(id)?.matter : id.startsWith('feather:') ? 'feather' : 'wood');
// a feather fallen under a tree (law/life.js): its tree, and the day it fell
export const featherOf = (id) => {
  const [, tree, day] = /^feather:(tree:-?\d+,-?\d+)\/(\d+)\/\d+$/.exec(id) ?? [];
  return tree ? { tree, day: Number(day) } : null;
};

// A branch of a tree grown to `day`: its foot (m), how thick there (m), how far it reaches from it (m),
// and the branches that grew from it (itself included).
export function branchOf(tree, branch, day) {
  const T0 = treeNow(tree, day);
  const b = T0.branches[branch];
  if (!b) return null;
  const kids = new Map();
  for (const c of T0.branches) if (c.parent !== null) kids.set(c.parent, [...(kids.get(c.parent) ?? []), c.id]);
  const all = new Set([branch]);
  const walk = (id) => (kids.get(id) ?? []).forEach((c) => (all.add(c), walk(c)));
  walk(branch);
  let reach = 0;
  for (const n of T0.nodes) if (all.has(n.branch)) reach = Math.max(reach, Math.sqrt(n.base.reduce((s, v, k) => s + (v - b.at[k]) ** 2, 0)) + n.len);
  return { foot: b.at, r: Math.sqrt(T0.nodes[b.node].area / Math.PI), reach, branches: all, trunk: b.parent === null };
}
// Whether a being's pull breaks it: the pull levered along its reach against its wood's strength.
export function breaks(br) {
  if (!br || br.trunk) return false;
  const strength = MATTER.wood.strength * 1e6; // Pa
  return BEING.pull * br.reach >= (strength * Math.PI * br.r ** 3) / 4;
}
// A stone's mass (kg): as round as it is wide, as squat as stones lie (law/outside.js OUTSIDE.stones), of its matter.
const G = 9.81; // m/s²
export const stoneMass = (s) => (4 / 3) * Math.PI * s.r ** 3 * OUTSIDE.stones.squat * MATTER[s.matter].density;
// How deep a stroke of `tool` cuts into `matter` (µm): only the harder takes the softer.
export const cutOf = (tool, matter) => Math.max(0, MATTER[tool].hardness - MATTER[matter].hardness) * CUT;

// --- the acts ---
export function shapeOf(act) {
  if (!act || typeof act !== 'object' || act.v !== V || act.kind !== 'outside') return 'not an outside act';
  if (!goodKey(act.by) || !int(act.k, 1, 2 ** 31) || !ACTS.includes(act.act)) return 'a malformed outside act';
  const ok = {
    take: () => (featherId(act.thing) ? fields(act, 'act,by,day,k,kind,thing,v') && int(act.day, 0, 1e7) : fields(act, 'act,by,k,kind,thing,v')) && thingId(act.thing),
    put: () => fields(act, 'act,by,k,kind,thing,to,v') && thingId(act.thing) && Array.isArray(act.to) && act.to.length === 3 && act.to.every((v) => int(v, -1e9, 1e9)),
    break: () => fields(act, 'act,branch,by,day,k,kind,tree,v') && isId(act.tree, 'tree') && int(act.branch, 1, 1e6) && int(act.day, 0, 1e7),
    gather: () => (fields(act, 'act,at,by,k,kind,v') && place(act.at, 2)) || (fields(act, 'act,by,day,k,kind,tree,v') && isId(act.tree, 'tree') && int(act.day, 0, 1e7)),
    twist: () => fields(act, 'a,act,b,by,k,kind,v') && thingId(act.a) && thingId(act.b) && act.a !== act.b,
    strike: () => fields(act, 'act,by,k,kind,speed,thing,tool,v') && thingId(act.tool) && thingId(act.thing) && act.tool !== act.thing && speedOk(act.speed),
    bind: () => fields(act, 'act,by,k,kind,pull,stick,stone,string,turns,v') && [act.stick, act.stone, act.string].every(thingId) && int(act.turns, 1, 50) && int(act.pull, 0, 1000),
    swing: () => fields(act, 'act,at,by,k,kind,speed,thing,to,v') && thingId(act.thing) && isId(act.at, 'tree') && place(act.to) && speedOk(act.speed),
    pry: () => fields(act, 'act,by,k,kind,over,stick,thing,to,v') && thingId(act.stick) && isId(act.over, 'stone') && isId(act.thing, 'stone') && act.over !== act.thing && place(act.to),
    rub: () =>
      fields(act, 'act,at,by,k,kind,ms,speed,strokes,thing,tool,v') &&
      thingId(act.tool) &&
      thingId(act.thing) &&
      int(act.strokes, 1, 100000) &&
      place(act.at) &&
      speedOk(act.speed) &&
      int(act.ms, 1, 2 ** 31),
    form: () => fields(act, 'act,by,k,kind,thing,v') && thingId(act.thing),
    fire: () => fields(act, 'act,by,fire,k,kind,thing,v') && thingId(act.thing) && thingId(act.fire),
    pick: () => fields(act, 'act,by,day,k,kind,laid,tip,tree,v') && isId(act.tree, 'tree') && int(act.tip, 0, 1e6) && int(act.laid, 0, 1e7) && int(act.day, act.laid, 1e7),
    crush: () => fields(act, 'act,by,k,kind,thing,tool,v') && thingId(act.tool) && thingId(act.thing),
    mix: () => fields(act, 'act,by,cup,k,kind,thing,v') && thingId(act.cup) && thingId(act.thing),
    melt: () => fields(act, 'act,by,cup,fire,k,kind,v') && thingId(act.cup) && thingId(act.fire),
    pour: () => fields(act, 'act,by,cup,into,k,kind,v') && thingId(act.cup) && thingId(act.into),
    dip: () => fields(act, 'act,by,cup,k,kind,string,v') && thingId(act.string) && thingId(act.cup),
    carve: () => {
      const on =
        act.tree !== undefined
          ? isId(act.tree, 'tree') && int(act.az, 0, 359) && fields(act, 'act,az,by,from,k,kind,strokes,to,tool,tree,v')
          : thingId(act.thing) && fields(act, 'act,by,from,k,kind,strokes,thing,to,tool,v');
      return on && thingId(act.tool) && int(act.from, 0, 1e6) && int(act.to, act.from, 1e6) && int(act.strokes, 1, 1000);
    },
  }[act.act];
  return ok() ? null : `a malformed ${act.act}`;
}
export function sealed(act, seal) {
  try {
    return verifySeal(fromB64url(act.by, 32), handsDigest(act), fromB64url(seal, 64));
  } catch {
    return false;
  }
}
export function sealHandsAct(sk, act) {
  const bad = shapeOf(act);
  if (bad) throw new Error(`that is ${bad}`);
  return { act, seal: b64url(sealOf(sk, handsDigest(act))) };
}

// --- the outside's facts, grown from the acts in order ---
// state: { things: Map(id → { at: [x, y, z] mm | null (in by's hand), by }), broken: Map(tree → [{ branch,
//   day }]), cuts: Map(stick → [{ from, to, depth }]), marks: Map(tree → [{ from, to, az, depth }]), made: Map(id →
//   what was made: { kind, matter, ... }), edges: Set(stones chipped), picked: Map(`tree/tip@laid` → the day a gall was
//   taken), combs: Map(tree → [{ day, grams }] taken from its hive), n (acts landed), k: Map(by → k) }
export const start = () => ({
  things: new Map(),
  broken: new Map(),
  cuts: new Map(),
  marks: new Map(),
  made: new Map(),
  edges: new Set(),
  picked: new Map(),
  combs: new Map(),
  n: 0,
  k: new Map(),
  at: new Map(),
});
const held = (state, id, by) => state.things.get(id)?.at === null && state.things.get(id).by === by;
const isBroken = (state, tree, branch) => (state.broken.get(tree) ?? []).some((b) => b.branch === branch);
const inHands = (state, by) => [...state.things.values()].filter((t) => t.at === null && t.by === by).length;
// at hand: in the being's own hand, or lying (not in another's)
const atHand = (state, id, by) => {
  const t = state.things.get(id);
  return t ? t.at !== null || t.by === by : id.startsWith('stone:') && !!stoneOf(id);
};
const madeOf = (state, id) => state.made.get(id) ?? null;
// where a thing lies now (mm, world): where the hands left it, or a stone where the seed laid it
const placeOf = (state, id) => state.things.get(id)?.at ?? (id.startsWith('stone:') ? (stoneOf(id)?.at.map((v) => Math.round(v * 1000)) ?? null) : null);
// a lever (law/making.js pries): the stick in the hand over the fulcrum under the load, as they lie
function leverOf(state, act) {
  const stick = bodyOf(state, act.stick),
    over = stoneOf(act.over),
    load = stoneOf(act.thing);
  const a = placeOf(state, act.over),
    b = placeOf(state, act.thing);
  if (!stick?.length || !over || !load || !a || !b) return null;
  const apart = Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) / 1000; // (exact everywhere: no hypot)
  const arm = Math.max(apart, over.r + load.r); // m: the fulcrum to the load (they touch, at nearest)
  return { arm, ...MK.pries({ weight: stoneMass(load) * G, load: arm, length: stick.length, r: stick.r, matter: stick.matter }) };
}
// a stone, or a stick, as making takes it: its matter and its size (m)
function bodyOf(state, id) {
  if (id.startsWith('stone:')) {
    const s = stoneOf(id);
    return s && { matter: s.matter, r: s.r };
  }
  if (id.startsWith('feather:')) return { matter: 'feather', r: LIFE.bodyOf('bird').r / 4, length: BEINGS.bird.span / 2 }; // (a quill: half its wing)
  const st = stickOf(id);
  if (st) {
    const b = (state.broken.get(st.tree) ?? []).find((x) => x.branch === st.branch);
    const br = b && branchOf(treeOf(st.tree), st.branch, b.day);
    return br && { matter: 'wood', r: br.r, length: br.reach };
  }
  const m = madeOf(state, id);
  return m && { matter: m.matter, r: m.r ?? 0.01, length: m.length };
}
// a feather lying under its tree on day d (fallen, not rotted: law/life.js), as the hands left the tree
const featherLies = (state, id, day) => {
  const f = featherOf(id);
  const tree = f && treeOf(f.tree);
  return !!tree && f.day <= day && LIFE.lifeOf(tree, day, state).feathers.some((x) => x.id === id);
};

// a fire as it is at `ms` (the world's clock; null: as it caught): its wood burning down (law/making.js burning)
export function fireNow(fire, ms = null) {
  return MK.burning(fire.fuel, fire.grams ?? 0, fire.area ?? 0, ms === null || fire.lit === undefined ? 0 : (ms - fire.lit) / 1000);
}

// ms: when the act is stamped (the world's clock; null: no clock, as at once)
export function check(state, act, ms = null) {
  const bad = shapeOf(act);
  if (bad) return bad;
  if (act.k !== (state.k.get(act.by) ?? 0) + 1) return 'that act is out of order';
  const exists = (id) =>
    id.startsWith('stone:')
      ? !!stoneOf(id)
      : id.startsWith('made:')
        ? state.things.has(id)
        : id.startsWith('feather:')
          ? state.things.has(id) || (act.day !== undefined && featherLies(state, id, act.day))
          : !!stickOf(id) && isBroken(state, stickOf(id).tree, stickOf(id).branch);
  if (act.act === 'take') {
    if (!exists(act.thing)) return 'there is no such thing';
    const t = state.things.get(act.thing);
    if (t?.at === null) return 'it is in a hand already';
    if (act.thing.startsWith('stone:') && stoneMass(stoneOf(act.thing)) * G > BEING.pull) return 'too heavy for a hand to lift';
    return null;
  }
  if (act.act === 'put') return held(state, act.thing, act.by) ? null : 'it is not in that hand';
  if (act.act === 'break') {
    const tree = treeOf(act.tree);
    if (!tree) return 'there is no such tree';
    if (isBroken(state, act.tree, act.branch)) return 'it is broken off already';
    const br = branchOf(tree, act.branch, act.day);
    if (!br) return 'it has no such branch';
    for (const b of state.broken.get(act.tree) ?? []) if (branchOf(tree, b.branch, b.day)?.branches.has(act.branch)) return 'it went with a branch broken off already';
    return null; // (whether it breaks is the law's: apply)
  }
  const free = () => (inHands(state, act.by) < 2 ? null : 'both hands are full');
  const mine = (id) => (held(state, id, act.by) ? null : `${id} is not in that hand`);
  const near = (id) => (atHand(state, id, act.by) ? null : `${id} is not at hand`);
  const is = (id, ...kinds) => (kinds.includes(madeOf(state, id)?.kind) ? null : `${id} is not ${kinds.join(' or ')}`);
  const first = (...whys) => whys.find((w) => w) ?? null;
  if (act.act === 'gather' && act.tree !== undefined) {
    const tree = treeOf(act.tree);
    const hive = tree && LIFE.nestsOf(tree, act.day, state).hive;
    return first(free(), tree ? null : 'there is no such tree', hive ? null : 'no hive is on it', hive && hive.wax > 0 ? null : 'its comb is gone');
  }
  if (act.act === 'gather') return free();
  if (act.act === 'twist') return first(mine(act.a), mine(act.b), is(act.a, 'fibre', 'string'), is(act.b, 'fibre', 'string'));
  if (act.act === 'strike') return first(mine(act.tool), near(act.thing), act.thing.startsWith('stone:') ? null : 'only a stone is struck');
  if (act.act === 'bind')
    return first(
      near(act.stick),
      near(act.stone),
      near(act.string),
      stickOf(act.stick) ? null : 'that is not a stick',
      act.stone.startsWith('stone:') ? null : 'that is not a stone',
      is(act.string, 'string'),
    );
  if (act.act === 'swing') return first(mine(act.thing), is(act.thing, 'axe'), treeOf(act.at) ? null : 'there is no such tree');
  // (rubbed no longer than since the being's last act was stamped)
  if (act.act === 'pry') {
    const lv = leverOf(state, act);
    const was = placeOf(state, act.thing);
    const went = was && Math.sqrt((act.to[0] - was[0]) ** 2 + (act.to[1] - was[1]) ** 2) / 1000;
    return first(
      mine(act.stick),
      near(act.over),
      near(act.thing),
      lv ? null : 'there is no lever there',
      lv && lv.effort <= 0 ? 'the stick does not reach over it' : null,
      lv && lv.turning > lv.bears ? 'the stick would break under it' : null,
      lv && !lv.tips ? 'it does not tip' : null,
      lv && went > lv.arm + 0.001 ? 'it goes over no farther than its arm' : null,
    );
  }
  if (act.act === 'rub') return first(mine(act.tool), near(act.thing), ms === null || !state.at.has(act.by) || act.ms <= ms - state.at.get(act.by) ? null : 'not rubbed so long');
  if (act.act === 'form') return first(mine(act.thing), is(act.thing, 'lump'));
  const lit = (id) => (madeOf(state, id)?.kind === 'fire' && fireNow(madeOf(state, id), ms).out ? 'the fire is out' : null);
  if (act.act === 'fire') return first(near(act.thing), is(act.thing, 'cup'), is(act.fire, 'fire'), lit(act.fire));
  if (act.act === 'pick')
    return first(
      free(),
      treeOf(act.tree) ? null : 'there is no such tree',
      state.picked.has(`${act.tree}/${act.tip}@${act.laid}`) ? 'it is picked already' : null,
      treeOf(act.tree) && LIFE.gallsOf(treeOf(act.tree), act.day, state).some((g) => g.tip === act.tip && g.laid === act.laid) ? null : 'no gall grows there',
    );
  if (act.act === 'crush') return first(mine(act.tool), near(act.thing), act.thing.startsWith('stone:') || madeOf(state, act.thing)?.kind === 'gall' ? null : 'only a gall or a stone is crushed');
  if (act.act === 'mix') return first(mine(act.cup), is(act.cup, 'cup'), near(act.thing), is(act.thing, 'powder', 'wax'));
  if (act.act === 'melt') return first(near(act.cup), is(act.cup, 'cup'), is(act.fire, 'fire'), lit(act.fire));
  if (act.act === 'pour') return first(mine(act.cup), is(act.cup, 'cup'), near(act.into), is(act.into, 'cup'));
  if (act.act === 'dip') return first(mine(act.string), is(act.string, 'string'), near(act.cup), is(act.cup, 'cup'));
  // carve: the tool in the hand; the stick in the hand or lying, the tree standing
  if (!held(state, act.tool, act.by)) return 'the tool is not in that hand';
  if (act.thing !== undefined && !exists(act.thing)) return 'there is no such thing';
  if (act.tree !== undefined && !treeOf(act.tree)) return 'there is no such tree';
  return null;
}

export function apply(state, act, ms = null) {
  state.k.set(act.by, act.k);
  if (ms !== null) state.at.set(act.by, ms); // (when its last act was stamped)
  state.n++;
  const id = `made:${state.n}`;
  const make = (what, at = null) => {
    state.made.set(id, what);
    state.things.set(id, { at, by: act.by });
    return id;
  };
  const gone = (...ids) => ids.forEach((x) => state.things.delete(x));
  const whereOf = (x) => state.things.get(x)?.at ?? (x.startsWith('stone:') ? stoneOf(x).at.map((v) => Math.round(v * 1000)) : null);
  if (act.act === 'gather' && act.tree !== undefined) {
    // a handful of a hive's comb (as much as there is)
    const grams = Math.min(MK.handful('wax'), LIFE.nestsOf(treeOf(act.tree), act.day, state).hive.wax);
    state.combs.set(act.tree, [...(state.combs.get(act.tree) ?? []), { day: act.day, grams }]);
    make({ kind: 'wax', matter: 'wax', grams });
  } else if (act.act === 'gather') {
    const m = matterAt(act.at[0] / 1000, act.at[1] / 1000);
    if (m === 'grass') make({ kind: 'fibre', matter: 'grass', grams: MK.handful('grass') });
    if (m === 'clay') make({ kind: 'lump', matter: 'clay', grams: MK.handful('clay') });
    if (m === 'water') {
      // water: into a fired cup in the hand (a hand alone lets it run out)
      const cup = [...state.things].find(([x, t]) => t.at === null && t.by === act.by && state.made.get(x)?.kind === 'cup' && state.made.get(x).matter === 'pottery');
      if (cup) state.made.get(cup[0]).holding.water = (state.made.get(cup[0]).holding.water ?? 0) + MK.handful('water');
    }
  }
  if (act.act === 'twist') {
    const [a, b] = [madeOf(state, act.a), madeOf(state, act.b)];
    const str = (m) => (m.kind === 'string' ? m : MK.stringOf(m.grams, m.matter));
    const s = a.kind === 'fibre' && b.kind === 'fibre' ? MK.stringOf(a.grams + b.grams, a.matter) : MK.joined(str(a), str(b));
    gone(act.a, act.b);
    make({ kind: 'string', ...s });
  }
  if (act.act === 'strike') {
    const tool = bodyOf(state, act.tool),
      stone = bodyOf(state, act.thing);
    if (tool && stone && MK.chips(tool, stone, act.speed / 1000)) state.edges.add(act.thing);
  }
  if (act.act === 'bind') {
    const at = whereOf(act.stick);
    gone(act.stick, act.stone, act.string);
    make({ kind: 'axe', matter: 'wood', stick: act.stick, stone: act.stone, string: madeOf(state, act.string), turns: act.turns, pull: act.pull, edge: state.edges.has(act.stone) }, at);
  }
  if (act.act === 'pry') state.things.set(act.thing, { at: [...act.to], by: act.by }); // (tipped over the fulcrum: where it went)
  if (act.act === 'swing') {
    const axe = madeOf(state, act.thing);
    const stick = bodyOf(state, axe.stick),
      stone = bodyOf(state, axe.stone);
    const h = MK.holds({ stone, stick, string: axe.string, turns: axe.turns, pull: axe.pull, speed: act.speed / 1000 });
    if (!h.holds) {
      // it comes apart: the stick, the stone and the string fall where it was swung
      gone(act.thing);
      state.things.set(axe.stick, { at: [...act.to], by: act.by });
      state.things.set(axe.stone, { at: [...act.to], by: act.by });
      state.made.set(id, { kind: 'string', ...axe.string }); // (the string, a thing again: this act's own)
      state.things.set(id, { at: [...act.to], by: act.by });
    } else {
      // it holds: its stone bites the tree, the harder taking the softer, an edge deeper
      const depth = cutOf(stone.matter, 'bark') * (axe.edge ? 2 : 1);
      if (depth > 0) state.marks.set(act.at, [...(state.marks.get(act.at) ?? []), { from: 1000, to: 1100, az: 0, depth }]);
    }
  }
  if (act.act === 'rub') {
    const tool = bodyOf(state, act.tool),
      wood = bodyOf(state, act.thing);
    if (tool && wood && MK.rubbed(tool.matter, wood.matter, { strokes: act.strokes, speed: act.speed / 1000, seconds: act.ms / 1000 }).catches) {
      // the rubbed wood catches: the fire is it burning (its wood's mass, the faces it shows the air)
      const r = wood.r ?? 0.01,
        L = wood.length ?? 2 * r;
      const grams = Math.PI * r * r * L * MATTER[wood.matter].density * 1000;
      const area = 2 * Math.PI * r * L + 2 * Math.PI * r * r;
      if (!act.thing.startsWith('made:') || madeOf(state, act.thing)?.kind !== 'fire') gone(act.thing);
      make({ kind: 'fire', matter: wood.matter, fuel: wood.matter, grams, area, ...(ms === null ? {} : { lit: ms }) }, [...act.at]);
    }
  }
  if (act.act === 'form') {
    const lump = madeOf(state, act.thing);
    if (MK.formable(lump.matter)) {
      gone(act.thing);
      make({ kind: 'cup', matter: lump.matter, grams: lump.grams, holding: {} });
    }
  }
  if (act.act === 'fire') {
    const cup = madeOf(state, act.thing);
    if (cup.matter !== 'pottery' && MK.fires(cup.matter, madeOf(state, act.fire).fuel)) cup.matter = MATTER[cup.matter].becomes?.fired ?? cup.matter;
  }
  if (act.act === 'pick') {
    state.picked.set(`${act.tree}/${act.tip}@${act.laid}`, act.day);
    make({ kind: 'gall', matter: 'leaf', grams: MATTER.leaf.density * BEINGS.gallbug.gall * 1e-6 * 1000 }); // (the bud's own, swollen round its grub)
  }
  if (act.act === 'crush') {
    const tool = bodyOf(state, act.tool);
    const g = madeOf(state, act.thing);
    const of = g ? 'gall' : bodyOf(state, act.thing)?.matter;
    if (tool && MATTER[tool.matter].hardness > MATTER[of === 'gall' ? g.matter : of].hardness) {
      const grams = g ? g.grams : MK.massOf(of, stoneOf(act.thing).r) * 1000;
      const at = whereOf(act.thing);
      gone(act.thing);
      make({ kind: 'powder', matter: of === 'gall' ? g.matter : of, of, grams }, at);
    }
  }
  if (act.act === 'mix') {
    const cup = madeOf(state, act.cup),
      pw = madeOf(state, act.thing);
    const key = pw.kind === 'wax' ? 'wax' : pw.of === 'gall' ? 'gall' : pw.of === 'ore' ? 'ore' : 'grit';
    cup.holding[key] = (cup.holding[key] ?? 0) + pw.grams;
    gone(act.thing);
  }
  if (act.act === 'melt') {
    const cup = madeOf(state, act.cup);
    const fuel = madeOf(state, act.fire).fuel;
    if (cup.matter === 'pottery' && cup.holding.ore && MK.melts('ore', fuel)) {
      cup.holding.molten = (cup.holding.molten ?? 0) + MK.metalOf(cup.holding.ore);
      cup.holding.ore = 0;
    }
    if (cup.holding.wax && MK.fireHeat(fuel) >= MATTER.wax.heat.melts) cup.holding.waxMolten = true;
  }
  if (act.act === 'pour') {
    const cup = madeOf(state, act.cup),
      into = madeOf(state, act.into);
    // into a fired form it sets in its shape (an unfired one would crack apart with the steam)
    if (cup.holding.molten && into.matter === 'pottery') {
      make({ kind: 'metal', matter: 'metal', grams: cup.holding.molten, shape: act.into }, state.things.get(act.into).at);
      cup.holding.molten = 0;
    }
  }
  if (act.act === 'dip') {
    const cup = madeOf(state, act.cup),
      str = madeOf(state, act.string);
    if (cup.holding.waxMolten && cup.holding.wax > 0 && MK.wicks(str.matter)) {
      gone(act.string);
      make({ kind: 'candle', matter: 'wax', wick: str, wax: cup.holding.wax });
      cup.holding.wax = 0;
    }
  }
  if (act.act === 'take') state.things.set(act.thing, { at: null, by: act.by });
  if (act.act === 'put') state.things.set(act.thing, { at: [...act.to], by: act.by });
  if (act.act === 'break') {
    const tree = treeOf(act.tree);
    if (breaks(branchOf(tree, act.branch, act.day))) {
      state.broken.set(act.tree, [...(state.broken.get(act.tree) ?? []), { branch: act.branch, day: act.day }]);
      state.things.set(stickId(act.tree, act.branch), { at: null, by: act.by }); // (in the hand that broke it)
    }
  }
  if (act.act === 'carve') {
    const tool = matterOfThing(act.tool, state);
    const depth = cutOf(tool, act.tree !== undefined ? 'bark' : matterOfThing(act.thing, state)) * act.strokes;
    if (depth > 0) {
      if (act.tree !== undefined) state.marks.set(act.tree, [...(state.marks.get(act.tree) ?? []), { from: act.from, to: act.to, az: act.az, depth }]);
      else state.cuts.set(act.thing, [...(state.cuts.get(act.thing) ?? []), { from: act.from, to: act.to, depth }]);
    }
  }
  return state;
}

// The facts of a chain: every line in order, as the stamper took them (one that could not have landed
// is passed over, as it would have been; with `seals`, one not sealed by its key's too).
export function grow(lines, { seals = false } = {}) {
  const state = start();
  for (const l of lines) {
    if (seals && !sealed(l.act, l.seal)) continue;
    const ms = l.at ? Date.parse(l.at) : null; // (when it was stamped: a fire burns by the world's clock)
    if (check(state, l.act, ms)) continue;
    apply(state, l.act, ms);
  }
  return state;
}
// A stick's wood now: how thick it is along its length (µm taken off between from and to, mm).
export const thinnedAt = (state, stick, mm) => (state.cuts.get(stick) ?? []).filter((c) => mm >= c.from && mm <= c.to).reduce((s, c) => s + c.depth, 0);
