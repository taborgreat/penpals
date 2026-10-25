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
// Acts: { v: 1, kind: 'outside', by (key), k (its count: 1, 2, ...), act, ... }
//   'take'  thing                         'put'  thing, to: [x, y, z] (mm, world)
//   'break' tree, branch, day (law/sun.js days: the tree as grown that day)
//   'carve' thing (a stick) | tree, tool (in the hand), from, to (mm: along the stick from its foot, or up
//           the trunk), strokes; a tree's also az (°: the side cut into)
// D = sha256(T("outside") ‖ JCS(act)), sealed as any record is.
import { sha256 } from '@noble/hashes/sha2.js';
import { T, jcs, utf8, concat, b64url, fromB64url } from './tags.js';
import { sealOf, verifySeal, isGoodPublicKey } from './keys.js';
import { MATTER } from './matter.js';
import { stonesIn, treesIn, treeNow } from './outside.js';

export const V = 1;
export const BEING = Object.freeze({ pull: 300 }); // N a being's hand pulls with (Tabor's to set)
export const CUT = 20; // µm a stroke takes, for each step the tool is harder (Tabor's to set)
const ACTS = ['take', 'put', 'break', 'carve'];

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
const thingId = (s) => isId(s, 'stone') || isId(s, 'stick:tree');

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
const matterOfThing = (id) => (id.startsWith('stone:') ? stoneOf(id)?.matter : 'wood');

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
  for (const n of T0.nodes) if (all.has(n.branch)) reach = Math.max(reach, Math.hypot(...n.base.map((v, k) => v - b.at[k])) + n.len);
  return { foot: b.at, r: Math.sqrt(T0.nodes[b.node].area / Math.PI), reach, branches: all, trunk: b.parent === null };
}
// Whether a being's pull breaks it: the pull levered along its reach against its wood's strength.
export function breaks(br) {
  if (!br || br.trunk) return false;
  const strength = MATTER.wood.strength * 1e6; // Pa
  return BEING.pull * br.reach >= (strength * Math.PI * br.r ** 3) / 4;
}
// How deep a stroke of `tool` cuts into `matter` (µm): only the harder takes the softer.
export const cutOf = (tool, matter) => Math.max(0, MATTER[tool].hardness - MATTER[matter].hardness) * CUT;

// --- the acts ---
export function shapeOf(act) {
  if (!act || typeof act !== 'object' || act.v !== V || act.kind !== 'outside') return 'not an outside act';
  if (!goodKey(act.by) || !int(act.k, 1, 2 ** 31) || !ACTS.includes(act.act)) return 'a malformed outside act';
  const ok = {
    take: () => fields(act, 'act,by,k,kind,thing,v') && thingId(act.thing),
    put: () => fields(act, 'act,by,k,kind,thing,to,v') && thingId(act.thing) && Array.isArray(act.to) && act.to.length === 3 && act.to.every((v) => int(v, -1e9, 1e9)),
    break: () => fields(act, 'act,branch,by,day,k,kind,tree,v') && isId(act.tree, 'tree') && int(act.branch, 1, 1e6) && int(act.day, 0, 1e7),
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
//   day }]), cuts: Map(stick → [{ from, to, depth }]), marks: Map(tree → [{ from, to, az, depth }]), k: Map(by → k) }
export const start = () => ({ things: new Map(), broken: new Map(), cuts: new Map(), marks: new Map(), k: new Map() });
const held = (state, id, by) => state.things.get(id)?.at === null && state.things.get(id).by === by;
const isBroken = (state, tree, branch) => (state.broken.get(tree) ?? []).some((b) => b.branch === branch);

export function check(state, act) {
  const bad = shapeOf(act);
  if (bad) return bad;
  if (act.k !== (state.k.get(act.by) ?? 0) + 1) return 'that act is out of order';
  const exists = (id) => (id.startsWith('stone:') ? !!stoneOf(id) : !!stickOf(id) && isBroken(state, stickOf(id).tree, stickOf(id).branch));
  if (act.act === 'take') {
    if (!exists(act.thing)) return 'there is no such thing';
    const t = state.things.get(act.thing);
    if (t?.at === null) return 'it is in a hand already';
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
  // carve: the tool in the hand; the stick in the hand or lying, the tree standing
  if (!held(state, act.tool, act.by)) return 'the tool is not in that hand';
  if (act.thing !== undefined && !exists(act.thing)) return 'there is no such thing';
  if (act.tree !== undefined && !treeOf(act.tree)) return 'there is no such tree';
  return null;
}

export function apply(state, act) {
  state.k.set(act.by, act.k);
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
    const tool = matterOfThing(act.tool);
    const depth = cutOf(tool, act.tree !== undefined ? 'bark' : 'wood') * act.strokes;
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
    if (check(state, l.act)) continue;
    apply(state, l.act);
  }
  return state;
}
// A stick's wood now: how thick it is along its length (µm taken off between from and to, mm).
export const thinnedAt = (state, stick, mm) => (state.cuts.get(stick) ?? []).filter((c) => mm >= c.from && mm <= c.to).reduce((s, c) => s + c.depth, 0);
