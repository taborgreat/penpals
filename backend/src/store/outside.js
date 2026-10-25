// The outside's chain (outside.md Phase 5): data/outside.chain, one line per act a being's hands did to
// the outside's matter (a stone taken or put, a branch broken, a stick or a tree carved), stamped here in
// arrival order: { n, at, act, seal }. What it made so is regrown from it on every start (law/hands.js
// grow), so nothing else is ever the only record of it.

import path from 'node:path';
import { config } from '../config.js';
import { appendLine, readLines, serial, httpError } from '../files.js';
import { hands as H } from 'penpals-law';

export const outsideFile = () => path.join(config.dataDir, 'outside.chain');
let lines = [];
let state = H.start();

export async function loadOutside() {
  lines = (await readLines(outsideFile())).map((l) => JSON.parse(l));
  state = H.grow(lines);
  return lines.length;
}

// An act, sealed by its key: checked against the outside as it is, then given the next place.
export function stampOutside(act, seal) {
  return serial('outside', async () => {
    const bad = H.shapeOf(act);
    if (bad) throw httpError(400, 'bad_outside', `That is ${bad}.`);
    if (!H.sealed(act, seal)) throw httpError(401, 'bad_seal', 'That act is not sealed by its key.');
    const why = H.check(state, act);
    if (why) throw httpError(409, 'outside_refused', `Not done: ${why}.`);
    const line = { n: lines.length + 1, at: new Date().toISOString(), act, seal };
    await appendLine(outsideFile(), JSON.stringify(line));
    lines.push(line);
    H.apply(state, act);
    return line;
  });
}

// The outside's facts as they are: things moved, branches broken, cuts and marks.
export const outsideNow = () => ({
  n: lines.length,
  things: [...state.things].map(([id, t]) => ({ id, ...t })),
  broken: [...state.broken].map(([tree, list]) => ({ tree, list })),
  cuts: [...state.cuts].map(([id, list]) => ({ id, list })),
  marks: [...state.marks].map(([tree, list]) => ({ tree, list })),
  made: [...state.made].map(([id, m]) => ({ id, ...m })),
  edges: [...state.edges],
  picked: [...state.picked],
  k: Object.fromEntries(state.k),
});
export const outsideLines = () => lines;
