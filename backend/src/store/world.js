// The world's chain (one-world.md): data/world.chain, one line per act that
// placed or moved a house, stamped here in arrival order:
//   { n, at, act, seal }
// The houses are regrown from it on every start (world.js grow), so nothing
// else is ever the only record of where a house stands.

import path from 'node:path';
import { config } from '../config.js';
import { appendLine, readLines, serial, httpError } from '../files.js';
import * as W from '../world.js';

export const worldFile = () => path.join(config.dataDir, 'world.chain');
let lines = [];
let state = W.start();

export async function loadWorld() {
  lines = (await readLines(worldFile())).map((l) => JSON.parse(l));
  state = W.grow(lines);
  return state.houses.size;
}

// An act, sealed by its key: checked against the houses as they stand, then given the next place.
export function stampWorld(act, seal) {
  return serial('world', async () => {
    const bad = W.shapeOf(act);
    if (bad) throw httpError(400, 'bad_world', `That is ${bad}.`);
    if (!(await W.sealed(act, seal))) throw httpError(401, 'bad_seal', 'That act is not sealed by its key.');
    const why = W.check(state, act);
    if (why) throw httpError(409, 'world_refused', `Not done: ${why}.`);
    const line = { n: lines.length + 1, at: new Date().toISOString(), act, seal };
    await appendLine(worldFile(), JSON.stringify(line));
    lines.push(line);
    W.apply(state, act, line.n);
    return line;
  });
}

export const houseOf = (key) => state.houses.get(key) ?? null;
export const allHouses = () => [...state.houses].map(([key, h]) => ({ key, ...h }));
export const worldLines = () => lines;
