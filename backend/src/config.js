import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT) || 3000,

  // Everything lives in files here (see books.md): accounts, books, letters,
  // sessions. There is no database.
  dataDir: process.env.DATA_DIR || path.join(backendRoot, 'data'),
  frontendDist: path.resolve(backendRoot, '..', 'frontend', 'dist'),

  maxInkBytes: 2 * 1024 * 1024, // a processed letter is ~50-200 KB; anything bigger is a bug
  displays: ['strokes', 'mask'], // what the recipient sees: the strokes, or the scanned ink
  maxSavedPerUser: 10,
  sendLimit: { count: 2, windowMs: 60 * 60 * 1000 },
  openedTtlMs: 24 * 60 * 60 * 1000, // gone 24 h after it is opened...
  unopenedTtlMs: 90 * 24 * 60 * 60 * 1000, // ...or after 90 days unopened
  cleanupIntervalMs: 10 * 60 * 1000,
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000,

  // The colours a signature can be (frontend/src/hand/colors.js has their shades).
  signatureColors: ['graphite', 'wax', 'ink', 'forest', 'plum', 'ochre', 'teal', 'rose'],

  // Books (books.md). A journal page is a fixed logical canvas; items sit on it
  // in these units and the page is scaled to fit the screen.
  book: {
    pageWidth: 1000,
    pageHeight: 1400,
    maxPages: 40,
    maxItemsPerPage: 400,
    maxInkLineBytes: 1024 * 1024, // one stroke collection (a word, a drawing)
    maxChainBytes: 50 * 1024 * 1024, // a whole ink chain
    maxStrokes: 2000,
    maxPoints: 120000,
    visitorsCanDownload: false, // ruling: only the owner downloads their .book
    defaultBackground: '#f6f1e7',
  },

  papers: ['plain', 'white', 'cream', 'parchment'],
  sources: ['photo', 'pad'],
};
