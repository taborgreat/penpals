import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

// Two files per letter: the ink PNG (alpha = writing) and the strokes file
// (the shared format: weighted, timed pen strokes). Both go when the letter
// is deleted by the cleanup job.
export const inkPath = (id) => path.join(config.inkDir, `${id}.png`);
export const strokesPath = (id) => path.join(config.inkDir, `${id}.strokes`);

export const ensureInkDir = () => fs.mkdir(config.inkDir, { recursive: true });
export const writeInk = (id, buffer) => fs.writeFile(inkPath(id), buffer);
export const writeStrokes = (id, buffer) => fs.writeFile(strokesPath(id), buffer);
export const deleteInk = (id) => Promise.all([
  fs.rm(inkPath(id), { force: true }),
  fs.rm(strokesPath(id), { force: true }),
]);
