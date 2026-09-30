import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/penpals',

  // Ink files live on disk (your 1 TB); Mongo only holds the metadata.
  inkDir: process.env.INK_DIR || path.join(backendRoot, 'data', 'letters'),
  frontendDist: path.resolve(backendRoot, '..', 'frontend', 'dist'),

  maxInkBytes: 2 * 1024 * 1024, // a processed letter is ~50-200 KB; anything bigger is a bug
  displays: ['strokes', 'mask'], // what the recipient sees: the strokes, or the scanned ink
  maxSavedPerUser: 10,
  sendLimit: { count: 2, windowMs: 60 * 60 * 1000 },
  openedTtlMs: 24 * 60 * 60 * 1000, // gone 24 h after it is opened...
  unopenedTtlMs: 90 * 24 * 60 * 60 * 1000, // ...or after 90 days unopened
  cleanupIntervalMs: 10 * 60 * 1000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,

  papers: ['plain', 'white', 'cream'],
  sources: ['photo', 'pad'], // pad = drawn on screen; not built yet, but it produces the same ink format
};
